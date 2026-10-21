// js/world/spawn-points.js — детерминированные точки спавна чанка (чистая логика, без three.js).
// Работает в главном потоке и в Worker (spawn-worker.js просто вызывает generateChunkPoints).
// terrain — внедряемый сэмплер: { heightAt(x,z), biomeAt(x,z), waterAt?(x,z), hazardAt?(x,z) }.
import { WORLD_CONFIG, POIS } from '../../shared/defs/index.js';
import { SPAWN_RULES, NODE_SPAWNS } from '../../shared/defs/spawn.js';

// Хэш (x, z, seed, salt) → uint32, затем mulberry32.
export function hash32(...ns) {
  let h = 0x811c9dc5;
  for (const n of ns) { h ^= (n | 0); h = Math.imul(h, 0x01000193); h ^= h >>> 15; }
  return h >>> 0;
}
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const chunkSeed = (cx, cz, salt = 0, seed = WORLD_CONFIG.seed) => hash32(seed, cx, cz, salt);

export function slopeDeg(terrain, x, z, e = 1) {
  const dx = terrain.heightAt(x + e, z) - terrain.heightAt(x - e, z);
  const dz = terrain.heightAt(x, z + e) - terrain.heightAt(x, z - e);
  return Math.atan(Math.hypot(dx, dz) / (2 * e)) * 180 / Math.PI;
}

// Poisson disk (Bridson) в квадрате [x0, x0+size]², детерминированный от rand.
export function poissonDisk(rand, x0, z0, size, minDist, attempts = 24, maxPoints = Infinity) {
  const cell = minDist / Math.SQRT2, n = Math.ceil(size / cell), grid = new Int32Array(n * n).fill(-1);
  const pts = [], active = [];
  const add = (x, z) => { pts.push([x, z]); active.push(pts.length - 1); grid[Math.floor((z - z0) / cell) * n + Math.floor((x - x0) / cell)] = pts.length - 1; };
  add(x0 + rand() * size, z0 + rand() * size);
  while (active.length && pts.length < maxPoints) {
    const ai = Math.floor(rand() * active.length), [px, pz] = pts[active[ai]];
    let found = false;
    for (let k = 0; k < attempts; k++) {
      const a = rand() * Math.PI * 2, r = minDist * (1 + rand());
      const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      if (x < x0 || z < z0 || x >= x0 + size || z >= z0 + size) continue;
      const gx = Math.floor((x - x0) / cell), gz = Math.floor((z - z0) / cell);
      let ok = true;
      for (let j = Math.max(0, gz - 2); ok && j <= Math.min(n - 1, gz + 2); j++)
        for (let i = Math.max(0, gx - 2); i <= Math.min(n - 1, gx + 2); i++) {
          const q = grid[j * n + i]; if (q >= 0 && Math.hypot(pts[q][0] - x, pts[q][1] - z) < minDist) { ok = false; break; }
        }
      if (ok) { add(x, z); found = true; break; }
    }
    if (!found) active.splice(ai, 1);
  }
  return pts;
}

const SAFE_POI_TYPES = new Set(['hub', 'shrine', 'tower']);
export function nearSafePoi(x, z, pad = SPAWN_RULES.points.minDistSafePoi, pois = POIS) {
  for (const p of pois) if (SAFE_POI_TYPES.has(p.type) && Math.hypot(p.pos[0] - x, p.pos[1] - z) < (p.r ?? 12) + pad) return p.id;
  return null;
}

// Точки спавна мобов чанка. Возвращает [{x,y,z,biome,water,slope}] — одинаково для одного seed.
export function generateChunkPoints(cx, cz, terrain, opts = {}) {
  const R = SPAWN_RULES.points, size = WORLD_CONFIG.chunkSize, m = R.edgeMargin;
  const rand = rng(chunkSeed(cx, cz, 1, opts.seed));
  const raw = poissonDisk(rand, cx * size + m, cz * size + m, size - 2 * m, R.poissonMinDist, R.attempts);
  const out = [];
  for (const [x, z] of raw) {
    if (out.length >= R.maxPerChunk) break;
    const biome = terrain.biomeAt(x, z); if (!biome) continue;
    const s = slopeDeg(terrain, x, z); if (s > R.maxSlopeDeg) continue;
    if (nearSafePoi(x, z, R.minDistSafePoi, opts.pois)) continue;
    const water = !!terrain.waterAt?.(x, z);
    out.push({ x, y: terrain.heightAt(x, z), z, biome, water, slope: s });
  }
  return out;
}

// Точки ресурсов чанка для одного биома: детерминированно, своё соление на каждый ресурс.
export function generateNodePoints(cx, cz, terrain, opts = {}) {
  const size = WORLD_CONFIG.chunkSize, x0 = cx * size, z0 = cz * size;
  const biome = terrain.biomeAt(x0 + size / 2, z0 + size / 2), out = [];
  let salt = 100;
  for (const [id, def] of Object.entries(NODE_SPAWNS.resources)) {
    salt++;
    if (!def.biomes.includes(biome)) continue;
    const rand = rng(chunkSeed(cx, cz, salt, opts.seed));
    const want = def.perChunk[0] + Math.floor(rand() * (def.perChunk[1] - def.perChunk[0] + 1));
    if (!want) continue;
    const pts = poissonDisk(rand, x0 + 2, z0 + 2, size - 4, def.minDist, 16, want);
    pts.forEach(([x, z], i) => { if (!nearSafePoi(x, z, 4, opts.pois)) out.push({ id, idx: i, key: `${cx},${cz},${id},${i}`, x, y: terrain.heightAt(x, z), z }); });
  }
  const cr = rng(chunkSeed(cx, cz, NODE_SPAWNS.chests.seedSalt, opts.seed));
  if (cr() < NODE_SPAWNS.chests.total / (WORLD_CONFIG.chunks ** 2)) {
    const types = Object.entries(NODE_SPAWNS.chests.types).filter(([, t]) => t.w > 0);
    let r = cr() * types.reduce((s, [, t]) => s + t.w, 0), type = types[0][0];
    for (const [k, t] of types) { if ((r -= t.w) < 0) { type = k; break; } }
    const x = x0 + 8 + cr() * (size - 16), z = z0 + 8 + cr() * (size - 16);
    out.push({ chest: type, key: `${cx},${cz},chest`, x, y: terrain.heightAt(x, z), z });
  }
  return out;
}

// Безопасная точка появления игрока: спираль вокруг якоря.
export function findSafeSpawn(anchor, terrain, mobs = [], rules) {
  const S = rules.safe;
  const ok = (x, z) => {
    if (!terrain.biomeAt(x, z)) return false;
    if (slopeDeg(terrain, x, z) > S.maxSlopeDeg) return false;
    if (S.forbidWater && terrain.waterAt?.(x, z)) return false;
    const hz = terrain.hazardAt?.(x, z); if (hz && S.forbidHazards.includes(hz)) return false;
    if (terrain.blockedAt?.(x, z, S.clearanceRadius, S.clearanceHeight)) return false;
    for (const m of mobs) if (m.hostile !== false && Math.hypot(m.x - x, m.z - z) < S.noHostileRadius) return false;
    return true;
  };
  const [ax, az] = anchor;
  if (ok(ax, az)) return { x: ax, y: terrain.heightAt(ax, az), z: az, ring: 0 };
  const { stepM, rings, perRing } = S.ringSearch;
  for (let r = 1; r <= rings; r++) for (let k = 0; k < perRing; k++) {
    const a = (k / perRing) * Math.PI * 2 + r * 0.37, x = ax + Math.cos(a) * r * stepM, z = az + Math.sin(a) * r * stepM;
    if (ok(x, z)) return { x, y: terrain.heightAt(x, z), z, ring: r };
  }
  return { x: ax, y: terrain.heightAt(ax, az), z: az, ring: -1, fallback: S.fallback };
}
