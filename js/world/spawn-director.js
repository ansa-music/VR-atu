// js/world/spawn-director.js — спавн-директор открытого мира (чистая логика, тестируется node --test).
// Не создаёт меши: выдаёт «заявки» { kind:'pack', mobs:[{id,lvl,elite,affixes}], pos, vfx } — их исполняет js/world/mob-pool.js.
import { SPAWN_TABLES, PERF_CAPS, MOBS, ELITE_AFFIXES, WORLD_CONFIG, POIS } from '../../shared/defs/index.js';
import { SPAWN_RULES, RESPAWN, PLAYER_SPAWN } from '../../shared/defs/spawn.js';
import { rng } from './spawn-points.js';

const D2R = Math.PI / 180;
export const lerpCurve = (curve, x) => {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) if (x <= curve[i][0]) {
    const [x0, y0] = curve[i - 1], [x1, y1] = curve[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return curve[curve.length - 1][1];
};
export const slotCost = (mobId) => (MOBS[mobId]?.role === 'swarm' ? PERF_CAPS.swarmEntityCost : 1);
export function levelDensityMul(zoneLevel, playerLevel) {
  const d = zoneLevel - playerLevel; let mul = 1;
  for (const row of SPAWN_RULES.levelDensity) if (d >= row.delta) mul = row.mul;
  return mul;
}
// Игрок «видит» точку: внутри конуса взгляда (горизонталь) и есть LOS.
export function inView(player, p, los = () => true, halfDeg = SPAWN_RULES.activation.viewConeDeg) {
  const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz); if (d < 1e-3) return true;
  const fx = Math.sin(player.yaw), fz = -Math.cos(player.yaw); // yaw=0 смотрит на север (−Z)
  const cos = (dx * fx + dz * fz) / d;
  return cos >= Math.cos(halfDeg * D2R) && los(player, p);
}

export class SpawnDirector {
  constructor({ quality = 'quest', seed = WORLD_CONFIG.seed, difficulty = 'normal', now = 0 } = {}) {
    this.caps = PERF_CAPS[quality]; if (!this.caps) throw new Error('unknown quality ' + quality);
    this.quality = quality; this.rand = rng(seed ^ 0x5eed); this.difficulty = difficulty;
    this.tension = 0; this.relaxUntil = 0; this.t = now; this.nextPackAt = now;
    this.slotsUsed = 0; this.alive = new Map(); this.uid = 1;
    this.chunkCleared = new Map(); // key → {at, respawnS}
    this.eliteAlive = 0; this.lastEliteAt = -1e9; this.lastAmbushAt = -1e9;
    this.graceUntil = now + PLAYER_SPAWN.firstLaunch.directorGraceS; this.firstLaunch = false;
    this.lastEventCheck = now; this.activeEvents = 0; this.bossArena = null;
  }
  // ---- напряжение ----
  onDamageTaken(dmg) { this.tension = Math.min(SPAWN_RULES.tension.cap, this.tension + dmg * SPAWN_RULES.tension.perDamage); this._checkRelax(); }
  onKill(isElite = false) { this.tension = Math.min(SPAWN_RULES.tension.cap, this.tension + SPAWN_RULES.tension.perKill + (isElite ? SPAWN_RULES.tension.perElite : 0)); this._checkRelax(); }
  _relaxThreshold() { return this.difficulty === "easy" ? SPAWN_RULES.tension.relaxAboveEasy : SPAWN_RULES.tension.relaxAbove; }
  _checkRelax() {
    if (this.tension > this._relaxThreshold() && this.t >= this.relaxUntil) {
      const [a, b] = SPAWN_RULES.tension.relaxS; this.relaxUntil = this.t + a + this.rand() * (b - a);
    }
  }
  get phase() { return this.t < this.relaxUntil ? 'relax' : this.tension < SPAWN_RULES.tension.ambushBelow ? 'build' : 'sustain'; }
  tick(dt) { this.t += dt; this.tension = Math.max(0, this.tension - SPAWN_RULES.tension.decayPerS * dt); }
  paceMul() { return this.phase === 'relax' ? 0 : lerpCurve(SPAWN_RULES.tension.paceCurve, this.tension); }

  // ---- модификаторы ----
  densityMul({ night = false, weather = 'clear', bloodMoon = false, zoneLevel = 1, playerLevel = 1 } = {}) {
    let m = night ? SPAWN_RULES.dayNight.nightDensityMul : 1;
    m *= SPAWN_RULES.weather[weather]?.densityMul ?? 1;
    if (bloodMoon) m *= 1.5;
    return m * levelDensityMul(zoneLevel, playerLevel);
  }
  eliteChance(biome, { night = false, bloodMoon = false, playerLevel = 1 } = {}) {
    if (this.t < this.graceUntil && this.firstLaunch) return 0;
    if (this.eliteAlive >= SPAWN_RULES.elite.maxAlive || this.t - this.lastEliteAt < SPAWN_RULES.elite.minGapS) return 0;
    if (this.tension >= SPAWN_RULES.tension.ambushBelow) return 0; // элиты только при низком напряжении (канон 6.9)
    let c = SPAWN_TABLES[biome].eliteChance + (night ? SPAWN_RULES.dayNight.nightEliteChanceAdd : 0);
    if (bloodMoon) c *= 3;
    return Math.min(0.5, c);
  }
  affixCount(level) { const L = SPAWN_RULES.elite.minLevelForAffixes; return level >= L[2] ? 3 : level >= L[1] ? 2 : 1; }
  rollAffixes(n) { const keys = Object.keys(ELITE_AFFIXES), out = []; while (out.length < n) { const k = keys[Math.floor(this.rand() * keys.length)]; if (!out.includes(k)) out.push(k); } return out; }

  // ---- выбор пака ----
  pickPack(biome, { night = false } = {}) {
    const T = SPAWN_TABLES[biome]; if (!T) throw new Error('no table ' + biome);
    let packs = T.packs;
    if (this.firstLaunch && this.t < this.graceUntil) packs = packs.filter((p) => p.w >= 20);
    let r = this.rand() * packs.reduce((s, p) => s + p.w, 0), pack = packs[0];
    for (const p of packs) { if ((r -= p.w) < 0) { pack = p; break; } }
    const mobs = [];
    for (const [id, lo, hi] of pack.mobs) { const n = lo + Math.floor(this.rand() * (hi - lo + 1)); for (let i = 0; i < n; i++) mobs.push(id); }
    if (night && T.night?.add) for (const [id, n] of T.night.add) if (this.rand() < 0.5) for (let i = 0; i < n; i++) mobs.push(id);
    return mobs;
  }
  freeSlots() { return this.caps.activeMobs - this.slotsUsed; }

  // ---- выбор точки (никогда в поле зрения) ----
  choosePoint(points, player, { flyer = false, los } = {}) {
    const A = SPAWN_RULES.activation, minD = flyer ? A.minDistFlyer : A.minDistToPlayer, maxD = this.caps.spawnRadius;
    const ok = points.filter((p) => {
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d < minD || d > maxD) return false;
      if (this.bossArena && Math.hypot(p.x - this.bossArena.x, p.z - this.bossArena.z) < this.bossArena.r + SPAWN_RULES.bossRules.disableWorldSpawnPadM) return false;
      return !inView(player, p, los);
    });
    if (!ok.length) return null;
    ok.sort((a, b) => Math.hypot(b.x - player.x, b.z - player.z) - Math.hypot(a.x - player.x, a.z - player.z)); // ближе к краю области
    return ok[Math.floor(this.rand() * Math.min(3, ok.length))];
  }
  vfxFor(mobId, biome, night = false) {
    const role = MOBS[mobId]?.role;
    for (const [k, v] of Object.entries(SPAWN_RULES.vfx)) {
      if (k === 'walk_in') continue; if (v.night && !night) continue;
      if (v.roles.includes(role) && v.biomes.includes(biome)) return k;
    }
    return 'walk_in';
  }

  // ---- основной шаг: вернуть заявку или null ----
  requestPack(ctx) {
    const { biome, points, player, zoneLevel = SPAWN_TABLES[biome].lvl[0], playerLevel = 1, night = false, weather = 'clear', bloodMoon = false, los } = ctx;
    if (this.t < this.nextPackAt) return null;
    const pace = this.paceMul() * this.densityMul({ night, weather, bloodMoon, zoneLevel, playerLevel });
    if (pace <= 0) { this.nextPackAt = this.t + SPAWN_RULES.tension.tickS; return null; }
    this.nextPackAt = this.t + SPAWN_RULES.tension.basePackIntervalS / pace;
    let mobs = this.pickPack(biome, { night });
    if (weather === 'blizzard') mobs = mobs.filter((id) => MOBS[id].role !== 'flyer');
    if (!mobs.length) return null;
    let cost = mobs.reduce((s, id) => s + slotCost(id), 0);
    while (mobs.length && cost > this.freeSlots()) { cost -= slotCost(mobs.pop()); }
    if (!mobs.length) return { kind: 'deferred', reason: 'slots' };
    const flyer = mobs.every((id) => MOBS[id].role === 'flyer');
    const pos = this.choosePoint(points, player, { flyer, los }); if (!pos) return { kind: 'deferred', reason: 'no_point' };
    const T = SPAWN_TABLES[biome], [lo, hi] = T.lvl, lvl = Math.max(lo, Math.min(hi, Math.round(zoneLevel)));
    const eliteIdx = this.rand() < this.eliteChance(biome, { night, bloodMoon, playerLevel }) ? 0 : -1;
    const out = mobs.map((id, i) => {
      const elite = i === eliteIdx && id !== 'm_gold_fairy';
      return { uid: this.uid++, id, lvl, elite, affixes: elite ? this.rollAffixes(this.affixCount(lvl)) : [], vfx: this.vfxFor(id, biome, night) };
    });
    for (const m of out) { this.alive.set(m.uid, { ...m, home: { x: pos.x, z: pos.z }, cost: slotCost(m.id) }); this.slotsUsed += slotCost(m.id); if (m.elite) { this.eliteAlive++; this.lastEliteAt = this.t; } }
    return { kind: 'pack', biome, pos, mobs: out };
  }
  // засада: точки вокруг игрока по шаблону; учитывает кулдаун и напряжение
  requestAmbush(biome, player, terrainOk = () => true) {
    const A = SPAWN_RULES.ambush;
    if (this.phase !== 'build' || this.t - this.lastAmbushAt < A.cooldownS) return null;
    const names = A.biomePattern[biome]; const name = names[Math.floor(this.rand() * names.length)], P = A.patterns[name];
    const groups = [], n = P.ring ? 1 : P.groups;
    for (let g = 0; g < n; g++) {
      const base = player.yaw + Math.PI + (n > 1 ? (g - 0.5) * P.angleSplitDeg * D2R : 0);
      const d = P.dist[0] + this.rand() * (P.dist[1] - P.dist[0]);
      // yaw=0 → вперёд (0,−1); «назад» = +Z
      const pos = { x: player.x + Math.sin(base) * d, z: player.z - Math.cos(base) * d };
      if (P.ring || terrainOk(pos)) groups.push({ pos, delayS: P.delayS ? P.delayS[0] + this.rand() * (P.delayS[1] - P.delayS[0]) : 0, telegraphS: P.telegraphS ?? 0 });
    }
    if (!groups.length) return null;
    this.lastAmbushAt = this.t; return { kind: 'ambush', pattern: name, groups };
  }
  // ---- жизненный цикл ----
  release(uid) { const m = this.alive.get(uid); if (!m) return; this.slotsUsed = Math.max(0, this.slotsUsed - m.cost); if (m.elite) this.eliteAlive--; this.alive.delete(uid); }
  shouldLeash(uid, pos) { const m = this.alive.get(uid); return !!m && Math.hypot(pos.x - m.home.x, pos.z - m.home.z) > MOBS[m.id].leash; }
  shouldDespawn(uid, { distToPlayer, outOfViewS, damaged = false }) {
    const m = this.alive.get(uid), D = SPAWN_RULES.despawn; if (!m) return false;
    if ((D.keepIfDamaged && damaged) || (D.keepElites && m.elite)) return false;
    return distToPlayer > this.caps.spawnRadius * D.beyondSpawnRadiusMul && outOfViewS >= D.outOfViewS;
  }
  markChunkCleared(key, biome) { this.chunkCleared.set(key, { at: this.t, respawnS: SPAWN_TABLES[biome].respawn + this.rand() * SPAWN_RULES.respawn.jitterS }); }
  chunkReady(key, distToPlayer) {
    const c = this.chunkCleared.get(key); if (!c) return true;
    if (this.t - c.at >= c.respawnS && distToPlayer > SPAWN_RULES.respawn.minPlayerDistM) { this.chunkCleared.delete(key); return true; }
    return false;
  }
  enterBossArena(x, z, r) { this.bossArena = { x, z, r }; }
  leaveBossArena() { this.bossArena = null; }
  // ---- события ----
  rollEvent(biome, { night = false } = {}) {
    const E = SPAWN_RULES.events;
    if (this.t - this.lastEventCheck < E.intervalS) return null;
    this.lastEventCheck = this.t;
    if (this.activeEvents >= E.maxConcurrent || this.bossArena) return null;
    if (this.rand() >= E.chance) return null;
    let pool = E.pool[biome]; if (!night) pool = pool.filter((id) => id !== 'ev_blood_moon');
    const id = pool[Math.floor(this.rand() * pool.length)];
    const d = E.rangeM[0] + this.rand() * (E.rangeM[1] - E.rangeM[0]), a = this.rand() * Math.PI * 2;
    this.activeEvents++; return { kind: 'event', id, offset: { x: Math.cos(a) * d, z: Math.sin(a) * d } };
  }
  endEvent() { this.activeEvents = Math.max(0, this.activeEvents - 1); }
  // ---- смерть игрока ----
  onPlayerDeath() { if (RESPAWN.penalty.repeatDeathAssist.tensionReset) this.tension = 0; this.relaxUntil = this.t + SPAWN_RULES.tension.relaxS[1]; }
}

// Якорь возрождения: ближайший открытый POI-якорь (сначала того же биома).
export function chooseRespawnAnchor(deathPos, discovered, biome, pois = POIS) {
  const cand = pois.filter((p) => RESPAWN.anchorTypes.includes(p.type) && discovered.has(p.id));
  if (!cand.length) return pois.find((p) => p.id === PLAYER_SPAWN.firstLaunch.poi);
  const dist = (p) => Math.hypot(p.pos[0] - deathPos.x, p.pos[1] - deathPos.z);
  const same = cand.filter((p) => p.biome === biome);
  return (same.length ? same : cand).sort((a, b) => dist(a) - dist(b))[0];
}
export function deathPenalty(gold) {
  const drop = Math.floor(gold * RESPAWN.penalty.goldDropFrac);
  return { keep: gold - drop, grave: drop, graveLifeS: RESPAWN.penalty.graveLifeS, weakenedS: RESPAWN.penalty.weakenedS };
}
