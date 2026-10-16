import { chooseSpawn, walkable, slideMovement, segmentHitsObstacle, SPAWN_SHIELD_MS, RESPAWN_MS, PLAYER_RADIUS } from './pvp-layout.js';
import { weaponRule, calculateDamage } from './weapon-rules.js';

const MAX_RANGE = 90;
const HITBOXES = Object.freeze([
  { zone: 'head', x: 0, y: 0, z: 0, r: .245 },
  { zone: 'body', x: 0, y: -.47, z: 0, r: .345 },
  { zone: 'body', x: 0, y: -.82, z: 0, r: .32 },
  { zone: 'limb', x: -.31, y: -.56, z: 0, r: .175 },
  { zone: 'limb', x: .31, y: -.56, z: 0, r: .175 },
  { zone: 'limb', x: -.13, y: -1.22, z: 0, r: .175 },
  { zone: 'limb', x: .13, y: -1.22, z: 0, r: .175 },
]);

function shuffledSlots() {
  const slots = [0, 1, 2, 3, 4, 5];
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

export function startPvp(room, now) {
  const slots = { alpha: shuffledSlots(), bravo: shuffledSlots() };
  for (const player of room.players.values()) {
    const team = player.team === 'bravo' ? 'bravo' : 'alpha';
    respawn(player, now, slots[team].shift());
    player.kills = 0;
    player.deaths = 0;
    player.score = 0;
    player.shots = 0;
    player.hits = 0;
    player.nextShotAt = 0;
  }
}

export function respawn(player, now, selectedSlot = null) {
  const team = player.team === 'bravo' ? 'bravo' : 'alpha';
  const slot = Number.isInteger(selectedSlot) ? selectedSlot : Math.floor(Math.random() * 6);
  const spawn = chooseSpawn(team, () => (slot + .25) / 6);
  player.spawn = spawn;
  player.spawnSeq = (player.spawnSeq || 0) + 1;
  player.position = [...spawn];
  player.lastAcceptedPoseAt = now;
  player.health = 100;
  player.alive = true;
  player.respawnAt = null;
  player.invulnerableUntil = now + SPAWN_SHIELD_MS;
  player.nextShotAt = now;
}

export function tickPvp(room, now) {
  if (room.mode !== 'pvp' || room.phase !== 'playing') return false;
  let changed = false;
  for (const player of room.players.values()) {
    if (!player.alive && player.respawnAt != null && now >= player.respawnAt) {
      respawn(player, now);
      changed = true;
    }
  }
  return changed;
}

function raySphere(origin, dir, centre, radius, limit) {
  const dx = centre[0] - origin[0], dy = centre[1] - origin[1], dz = centre[2] - origin[2];
  const along = dx * dir[0] + dy * dir[1] + dz * dir[2];
  if (along < -radius || along > limit + radius) return Infinity;
  const delta2 = dx * dx + dy * dy + dz * dz - along * along;
  if (delta2 > radius * radius) return Infinity;
  const distance = Math.max(0, along - Math.sqrt(Math.max(0, radius * radius - delta2)));
  return distance <= limit ? distance : Infinity;
}

function hitTest(room, shooter, origin, direction, maxDistance, now) {
  let best = null;
  for (const player of room.players.values()) {
    if (player.id === shooter.id || !player.alive || player.team === shooter.team ||
        now < (player.invulnerableUntil || 0)) continue;
    const position = player.position || player.spawn;
    if (!position) continue;
    for (const box of HITBOXES) {
      const center = [position[0] + box.x, position[1] + box.y, position[2] + box.z];
      const distance = raySphere(origin, direction, center, box.r, Math.min(maxDistance, best?.distance ?? maxDistance));
      if (!Number.isFinite(distance) || (best && distance >= best.distance)) continue;
      if (segmentHitsObstacle(origin, direction, distance)) continue;
      best = { player, zone: box.zone, distance };
    }
  }
  return best;
}

// Nine pellets are generated on the SERVER: the client cannot claim arbitrary
// pellets/damage. The pattern covers a small, reproducible cone around the aim.
function pelletDirection(dir, index, count, spreadRad) {
  if (index === 0 || count <= 1) return dir;
  const v = Math.abs(dir[1]) > .9 ? [1, 0, 0] : [0, 1, 0];
  const ux = v[1] * dir[2] - v[2] * dir[1];
  const uy = v[2] * dir[0] - v[0] * dir[2];
  const uz = v[0] * dir[1] - v[1] * dir[0];
  const ul = Math.hypot(ux, uy, uz);
  const x = ux / ul, y = uy / ul, z = uz / ul;
  const wx = dir[1] * z - dir[2] * y;
  const wy = dir[2] * x - dir[0] * z;
  const wz = dir[0] * y - dir[1] * x;
  const angle = index * 2.399963229728653;
  const radius = spreadRad * Math.sqrt(index / (count - 1));
  const ca = Math.cos(angle) * radius, sa = Math.sin(angle) * radius;
  const px = dir[0] + ca * x + sa * wx;
  const py = dir[1] + ca * y + sa * wy;
  const pz = dir[2] + ca * z + sa * wz;
  const len = Math.hypot(px, py, pz);
  return [px / len, py / len, pz / len];
}

export function pvpShoot(room, shooter, data, now) {
  if (room.mode !== 'pvp' || room.phase !== 'playing' || now >= room.endsAt)
    return { error: 'ROUND_NOT_ACTIVE' };
  if (!shooter?.alive) return { error: 'PLAYER_DEAD' };
  const rule = weaponRule(data?.weapon);
  if (!rule) return { error: 'INVALID_WEAPON' };
  const origin = data?.origin, direction = data?.direction;
  if (!Array.isArray(origin) || origin.length !== 3 ||
      !Array.isArray(direction) || direction.length !== 3 ||
      ![...origin, ...direction].every(Number.isFinite) ||
      origin.some(n => Math.abs(n) > 50)) return { error: 'INVALID_RAY' };
  const length = Math.hypot(...direction);
  if (length < .98 || length > 1.02) return { error: 'INVALID_RAY' };
  const aim = direction.map(n => n / length);
  // The originating camera / tracked VR controller must be near the trusted pose.
  if (!shooter.position || Math.hypot(...origin.map((n, i) => n - shooter.position[i])) > 1.4)
    return { error: 'UNVERIFIED_SHOT_ORIGIN' };
  if (now + 4 < (shooter.nextShotAt || 0)) return { error: 'WEAPON_COOLDOWN' };
  // Do not let a weapon switch reset the server's rate limiter.
  shooter.nextShotAt = now + rule.intervalMs;
  shooter.shots++;
  shooter.invulnerableUntil = 0;

  const victims = new Map();
  for (let i = 0; i < rule.pellets; i++) {
    const pellet = pelletDirection(aim, i, rule.pellets, rule.spreadRad || 0);
    const hit = hitTest(room, shooter, origin, pellet, Math.min(rule.range, MAX_RANGE), now);
    if (!hit) continue;
    const damage = calculateDamage(rule, hit.zone, hit.distance);
    if (!damage) continue;
    const old = victims.get(hit.player.id) || {
      player: hit.player, damage: 0, headshot: false, zones: new Set(), position: null,
    };
    old.damage += damage;
    old.headshot ||= hit.zone === 'head';
    old.zones.add(hit.zone);
    old.position = origin.map((n, j) => n + pellet[j] * hit.distance);
    victims.set(hit.player.id, old);
  }
  if (!victims.size) return { hit: false, mode: 'pvp', playerId: shooter.id, weapon: rule.id };

  shooter.hits++;
  const outcomes = [];
  for (const hit of victims.values()) {
    const victim = hit.player;
    const before = victim.health ?? 100;
    victim.health = Math.max(0, before - hit.damage);
    const eliminated = before > 0 && victim.health === 0;
    if (eliminated) {
      victim.alive = false;
      victim.deaths = (victim.deaths || 0) + 1;
      victim.respawnAt = now + RESPAWN_MS;
      shooter.kills = (shooter.kills || 0) + 1;
      shooter.score = shooter.kills;
    }
    outcomes.push({
      victimId: victim.id, victimHealth: victim.health, damage: Math.min(before, hit.damage),
      headshot: hit.headshot, zone: hit.zones.has('head') ? 'head' : hit.zones.has('body') ? 'body' : 'limb',
      eliminated, position: hit.position,
    });
  }
  outcomes.sort((a, b) => Number(b.eliminated) - Number(a.eliminated) || b.damage - a.damage);
  return {
    hit: true, mode: 'pvp', playerId: shooter.id, weapon: rule.id,
    ...outcomes[0], victims: outcomes, score: shooter.score,
  };
}

export function poseValidForPvp(room, player, position, now) {
  if (room.mode !== 'pvp' || room.phase !== 'playing') return true;
  if (!player?.alive || !Array.isArray(position) || position.length !== 3 ||
      !position.every(Number.isFinite)) return false;
  if (position[1] < .8 || position[1] > 2.8 ||
      !walkable(position[0], position[2], PLAYER_RADIUS)) return false;
  if (player.position) {
    const elapsed = Math.max(.045, (now - (player.lastAcceptedPoseAt || now - 60)) / 1000);
    const horizontal = Math.hypot(position[0] - player.position[0], position[2] - player.position[2]);
    if (horizontal > .38 + 6.5 * elapsed) return false;
    if (horizontal > 1e-4) {
      const [x, z] = slideMovement(player.position[0], player.position[2], position[0], position[2]);
      if (Math.hypot(x - position[0], z - position[2]) > .08) return false;
    }
  }
  player.position = [...position];
  player.lastAcceptedPoseAt = now;
  return true;
}
