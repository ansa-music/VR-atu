import { chooseSpawn, walkable, segmentHitsObstacle, SPAWN_SHIELD_MS, RESPAWN_MS } from './pvp-layout.js';

const MAX_RANGE = 40;
const HEAD_RADIUS = 0.245;
const BODY_RADIUS = 0.40;
const DAMAGE_HEAD = 67;
const DAMAGE_BODY = 34;

function shuffledSlots() {
  const list = [0,1,2,3,4,5];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function startPvp(room, now) {
  const slots = { alpha: shuffledSlots(), bravo: shuffledSlots() };
  for (const player of room.players.values()) {
    const team = player.team === 'bravo' ? 'bravo' : 'alpha';
    // Teammates use DISTINCT randomly shuffled spawn pads on initial round start.
    respawn(player, now, slots[team].shift());
    player.kills = 0;
    player.deaths = 0;
    player.score = 0;
    player.shots = 0;
    player.hits = 0;
  }
}
export function respawn(player, now, selectedSlot = null) {
  const team = player.team === 'bravo' ? 'bravo' : 'alpha';
  const positions = 6;
  // Individual respawns are random; round starts spread teammates apart.
  const slot = Number.isInteger(selectedSlot) ? selectedSlot : Math.floor(Math.random() * positions);
  const spawn = chooseSpawn(team, () => (slot + .25) / positions);
  player.spawn = spawn;
  player.spawnSeq = (player.spawnSeq || 0) + 1;
  player.position = [...spawn];
  player.health = 100;
  player.alive = true;
  player.respawnAt = null;
  player.invulnerableUntil = now + SPAWN_SHIELD_MS;
}

export function tickPvp(room, now) {
  if (room.mode !== 'pvp' || room.phase !== 'playing') return false;
  let dirty = false;
  for (const p of room.players.values()) {
    if (!p.alive && p.respawnAt != null && now >= p.respawnAt) {
      respawn(p, now);
      dirty = true;
    }
  }
  return dirty;
}

function raySphere(origin, dir, centre, radius) {
  const dx = centre[0]-origin[0], dy=centre[1]-origin[1], dz=centre[2]-origin[2];
  const projected = dx*dir[0]+dy*dir[1]+dz*dir[2];
  if (projected <= 0 || projected > MAX_RANGE) return Infinity;
  const perpendicular = dx*dx+dy*dy+dz*dz-projected*projected;
  if (perpendicular > radius*radius) return Infinity;
  return Math.max(0, projected - Math.sqrt(Math.max(0,radius*radius-perpendicular)));
}

export function pvpShoot(room, shooter, data, now) {
  if (room.mode !== 'pvp' || room.phase !== 'playing' || now >= room.endsAt) return {error:'ROUND_NOT_ACTIVE'};
  if (!shooter.alive) return {error:'PLAYER_DEAD'};
  const origin = data?.origin, direction = data?.direction;
  if (!Array.isArray(origin) || origin.length !== 3 || !Array.isArray(direction) || direction.length !== 3 ||
      ![...origin,...direction].every(Number.isFinite)) return {error:'INVALID_RAY'};
  const len = Math.hypot(...direction);
  if (len<.98 || len>1.02 || origin.some(v=>Math.abs(v)>50)) return {error:'INVALID_RAY'};
  const aim = direction.map(v=>v/len);
  shooter.shots++;
  let victim = null, headshot = false, closest = MAX_RANGE;
  for (const p of room.players.values()) {
    if (p.id===shooter.id || !p.alive || p.team===shooter.team ||
        now < (p.invulnerableUntil||0)) continue;
    const ppos=p.position||p.spawn;
    if (!ppos) continue;
    // Server-tracked position is a HEAD position, matching the rendered avatar.
    const head=[ppos[0],ppos[1],ppos[2]];
    const torso=[ppos[0],ppos[1]-.66,ppos[2]];
    const headT=raySphere(origin,aim,head,HEAD_RADIUS);
    const bodyT=raySphere(origin,aim,torso,BODY_RADIUS);
    const t=Math.min(headT,bodyT);
    if (t>=closest || !Number.isFinite(t))continue;
    if (segmentHitsObstacle(origin,aim,t))continue; // prevents through-wall kills
    closest=t;
    victim=p;
    headshot=headT<bodyT;
  }
  if (!victim) return { hit:false, playerId:shooter.id, mode:'pvp' };
  const damage=headshot?DAMAGE_HEAD:DAMAGE_BODY;
  shooter.hits++;
  victim.health=Math.max(0,(victim.health||100)-damage);
  let eliminated=false;
  if (victim.health===0) {
    victim.alive=false;
    victim.deaths=(victim.deaths||0)+1;
    victim.respawnAt=now+RESPAWN_MS;
    shooter.kills=(shooter.kills||0)+1;
    shooter.score=shooter.kills;
    eliminated=true;
  }
  return {
    hit:true, mode:'pvp', playerId:shooter.id,
    victimId:victim.id, victimHealth:victim.health, damage,
    headshot, eliminated, score:shooter.score,
    position: [
      origin[0]+aim[0]*closest,
      origin[1]+aim[1]*closest,
      origin[2]+aim[2]*closest,
    ],
  };
}

export function poseValidForPvp(room, player, position, now) {
  if (room.mode!=='pvp' || room.phase!=='playing') return true;
  if (!player.alive) return false;
  if (!Array.isArray(position)||position.length!==3||!position.every(Number.isFinite))return false;
  if (position[1]<0.8 || position[1]>2.8) return false;
  if (!walkable(position[0],position[2],.20)) return false;
  // This coarse server check limits speed exploits; real authoritative locomotion is future work.
  if (player.position) {
    const dt = Math.max(.045,(now-(player.lastAcceptedPoseAt || now-60))/1000);
    const distance = Math.hypot(position[0]-player.position[0],position[2]-player.position[2]);
    if (distance > 1.2 + 6 * dt) return false;
  }
  player.position=[...position];
  player.lastAcceptedPoseAt=now;
  return true;
}
