// js/world/terrain.js — рельеф открытого мира из seed: биомы (Вороной по POI + искажение), высоты, чанки 64 м.
// heightAt/biomeAt/waterAt — чистые функции (их же используют spawn-points.js и findSafeSpawn).
import * as THREE from 'three';
import { WORLD_CONFIG, BIOMES, POIS } from '../../shared/defs/index.js';
import { makeToon } from '../render/toon.js';
import { shapeHeight, tintAt } from './biome-terrain.js';

const W = WORLD_CONFIG;
function hash2(ix, iz, s) { let h = (ix * 374761393 + iz * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
const sm = (t) => t * t * (3 - 2 * t);
export function vnoise(x, z, s = W.seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = sm(x - ix), fz = sm(z - iz);
  const a = hash2(ix, iz, s), b = hash2(ix + 1, iz, s), c = hash2(ix, iz + 1, s), d = hash2(ix + 1, iz + 1, s);
  return (a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz) * 2 - 1;
}
export function fbm(x, z, oct = 4, s = W.seed) { let v = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { v += vnoise(x * f, z * f, s + i * 17) * a; f *= 2.03; a *= 0.5; } return v / 0.9375; }

const BIOME_IDS = Object.keys(BIOMES);
const SITES = POIS.map((p) => ({ x: p.pos[0], z: p.pos[1], b: p.biome, r: p.r || 14, id: p.id, type: p.type }));
const BLEND = W.borderSoft; // 40 м

/** Веса биомов в точке (сумма 1). Вороной по POI с искажением шумом → «живые» границы. */
export function biomeWeights(x, z) {
  const wx = x + fbm(x * 0.006, z * 0.006, 3, 91) * 70, wz = z + fbm(x * 0.006, z * 0.006, 3, 92) * 70;
  const best = {};
  for (const s of SITES) { const d = Math.hypot(s.x - wx, s.z - wz); if (!(s.b in best) || d < best[s.b]) best[s.b] = d; }
  let dmin = Infinity; for (const b in best) dmin = Math.min(dmin, best[b]);
  const w = {}; let sum = 0;
  for (const b in best) { const v = Math.exp(-(best[b] - dmin) / (BLEND * 0.35)); if (v > 0.01) { w[b] = v; sum += v; } }
  for (const b in w) w[b] /= sum;
  return w;
}
export function biomeAt(x, z) {
  if (x < 0 || z < 0 || x > W.size || z > W.size) return null;
  const w = biomeWeights(x, z); let bb = null, bv = -1; for (const b in w) if (w[b] > bv) { bv = w[b]; bb = b; } return bb;
}
function rawHeight(x, z, w) {
  let h = 0;
  for (const b in w) {
    const B = BIOMES[b], n = B.noise || { amp: 18, freq: 0.004, ridged: 0 }, [lo, hi] = B.heightRange || [0, 40];
    let v = fbm(x * n.freq * 2.2, z * n.freq * 2.2, 4, 7); if (n.ridged) v = (1 - Math.abs(v)) * 2 - 1;
    const base = Math.max(lo, 0) + Math.min(hi - lo, 60) * 0.25;
    h += w[b] * (base + 3 + v * Math.min(n.amp, 45));
  }
  return shapeHeight(x, z, h, w);
}
/** Высота с выравниванием площадок POI (хаб/святилище — ровная «подушка»). */
export function heightAt(x, z) {
  const w = biomeWeights(x, z); let h = rawHeight(x, z, w);
  for (const s of SITES) {
    const d = Math.hypot(s.x - x, s.z - z), R = s.r + 25; if (d > R) continue;
    const ph = padHeight(s); const t = d < s.r ? 1 : sm(1 - (d - s.r) / 25); h += (ph - h) * t;
  }
  // мягкий край мира: опускаем к морю
  const e = Math.min(x, z, W.size - x, W.size - z); if (e < W.borderSoft) h -= (1 - e / W.borderSoft) * 14;
  return h;
}
const padCache = new Map();
function padHeight(s) { if (!padCache.has(s.id)) padCache.set(s.id, Math.max(1.5, rawHeight(s.x, s.z, biomeWeights(s.x, s.z)))); return padCache.get(s.id); }
export const waterAt = (x, z) => heightAt(x, z) < W.seaLevel + 0.2;
export function nearestPoi(x, z, maxD = Infinity) { let best = null, bd = maxD; for (const s of SITES) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } } return best ? { ...best, d: bd } : null; }
export const terrainApi = { heightAt, biomeAt, waterAt, hazardAt: () => null, blockedAt: () => false };

// ---------- меши чанков ----------
const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
const palCache = {}; const pal = (b, k) => (palCache[b + k] ||= new THREE.Color(BIOMES[b]?.palette?.[k] || '#7ED957'));
let groundMat = null;
function buildChunkGeometry(cx, cz, verts) {
  const S = W.chunkSize, n = verts - 1, g = new THREE.PlaneGeometry(S, S, n, n); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), x0 = cx * S + S / 2, z0 = cz * S + S / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + x0, z = pos.getZ(i) + z0, h = heightAt(x, z); pos.setY(i, h);
    const w = biomeWeights(x, z), sh = 0.5 + 0.5 * vnoise(x * 0.08, z * 0.08, 5);
    tmpC.setRGB(0, 0, 0);
    for (const b in w) { tmpC2.copy(pal(b, 'ground')).lerp(pal(b, 'shade'), sh * 0.55); tmpC.r += tmpC2.r * w[b]; tmpC.g += tmpC2.g * w[b]; tmpC.b += tmpC2.b * w[b]; }
    tintAt(x, z, h, w, tmpC);
    if (h < W.seaLevel + 1.2) tmpC.lerp(pal('b_meadow', 'soil'), 0.7);
    col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  g.translate(x0, 0, z0);
  return g;
}
// растительность: сколько деревьев/камней на чанк по биому
const VEG = { b_meadow: [6, 5], b_forest: [55, 6], b_swamp: [14, 8], b_mountains: [12, 14], b_desert_ruins: [3, 12], b_volcano: [2, 16] };
export class TerrainChunks {
  constructor(scene, { radius = 2, verts = 33, models } = {}) {
    this.scene = scene; this.radius = radius; this.verts = verts; this.models = models; this.chunks = new Map(); this.queue = [];
    groundMat ||= makeToon({ vertexColors: true });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(W.size * 2, W.size * 2).rotateX(-Math.PI / 2),
      new THREE.MeshToonMaterial({ color: BIOMES.b_meadow.palette.water, transparent: true, opacity: 0.78 }));
    this.water.position.set(W.size / 2, W.seaLevel, W.size / 2); scene.add(this.water);
    this.treeGeo = null;
  }
  key(cx, cz) { return cx + ',' + cz; }
  update(px, pz, maxBuilds = W.maxChunkBuildsPerFrame) {
    const S = W.chunkSize, pcx = Math.floor(px / S), pcz = Math.floor(pz / S), R = this.radius, want = new Set();
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const cx = pcx + dx, cz = pcz + dz; if (cx < 0 || cz < 0 || cx >= W.chunks || cz >= W.chunks) continue;
      const k = this.key(cx, cz); want.add(k); if (!this.chunks.has(k) && !this.queue.some((q) => q.k === k)) this.queue.push({ k, cx, cz, d: dx * dx + dz * dz });
    }
    this.queue = this.queue.filter((q) => want.has(q.k)).sort((a, b) => a.d - b.d);
    let built = 0; while (this.queue.length && built < maxBuilds) { const q = this.queue.shift(); this.build(q); built++; }
    for (const [k, c] of this.chunks) {
      const [cx, cz] = k.split(',').map(Number);
      if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > R + 1) { this.scene.remove(c.group); c.group.traverse((o) => { o.geometry?.dispose?.(); }); this.chunks.delete(k); }
    }
    return built;
  }
  build({ k, cx, cz }) {
    const grp = new THREE.Group(); const ground = new THREE.Mesh(buildChunkGeometry(cx, cz, this.verts), groundMat); ground.receiveShadow = false; grp.add(ground);
    const S = W.chunkSize, b = biomeAt(cx * S + S / 2, cz * S + S / 2) || 'b_meadow', [nt, nr] = VEG[b] || [5, 5];
    let seed = (cx * 73856093) ^ (cz * 19349663) ^ W.seed; const rnd = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822519) + 0x9e3779b9 | 0) >>> 0) / 4294967295;
    const place = (n, id) => {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const x = cx * S + rnd() * S, z = cz * S + rnd() * S, h = heightAt(x, z); if (h < W.seaLevel + 0.5) continue;
        if (nearestPoi(x, z, 30)) continue; pts.push([x, h, z, 0.7 + rnd() * 0.7, rnd() * 6.28]);
      }
      if (pts.length) grp.add(this.models.instanced(id, pts, b));
      return pts;
    };
    const trees = place(nt, b === 'b_forest' ? 'veg_tree_pine' : 'veg_tree_round'), rocks = place(nr, 'veg_rock');
    this.scene.add(grp); this.chunks.set(k, { group: grp, cx, cz, biome: b, trees, rocks });
  }
  get loaded() { return this.chunks.size; }
  pending() { return this.queue.length; }
  /** Деревья как цилиндры-препятствия рядом с точкой (простая коллизия игрока/мобов). */
  obstaclesNear(x, z) {
    const S = W.chunkSize, c = this.chunks.get(this.key(Math.floor(x / S), Math.floor(z / S))); return c ? c.trees : [];
  }
}
