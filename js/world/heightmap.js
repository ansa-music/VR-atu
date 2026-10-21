// js/world/heightmap.js — карта высот мира (раздел 2.13.1): маска биомов, рельеф по биомам,
// вершина Стужи и кратер вулкана, границы мира, площадки под POI, цвета вершин. Без three.js:
// считается в воркере (terrain-worker.js), а в node — для тестов.
import { createSimplex2D, fbm, ridged } from './noise.js';
import { WORLD_CONFIG, BIOMES } from '../../shared/defs/world.js';
import { POIS } from '../../shared/defs/pois.js';

export const BIOME_IDS = Object.freeze(Object.keys(BIOMES));
const NB = BIOME_IDS.length;
const BI = Object.fromEntries(BIOME_IDS.map((id, i) => [id, i]));

export const MASK_N = 96;                    // маска биомов 96 × 96
const MASK_CELL = WORLD_CONFIG.size / MASK_N; // 16 м
const MASK_WARP = 24;                        // «рваная» граница, м
const MASK_BLUR = 1;                         // размытие, клеток

// особые точки рельефа (раздел 2.2): вершина Стужи и кальдера вулкана
export const PEAK = Object.freeze({ x: 520, z: 140, r: 170, h: 85 });
export const CRATER = Object.freeze({ x: 1390, z: 320, cone: 230, coneH: 95, r: 70, floor: 28 });
const OCEAN_BAND = 120; // запад и юг: берег уходит в море, вода начинается до зоны бури
const CLIFF_BAND = 60;  // север — скалы, восток — пепельная стена

/** Грубая раскладка (раздел 2.2): границы проведены между POI соседних биомов. */
export function biomeRule(x, z) {
  if (z < 520) return x < 920 ? BI.b_mountains : BI.b_volcano;
  if (z < 1010) return x < 780 ? BI.b_forest : BI.b_desert_ruins;
  return x < 570 ? BI.b_swamp : BI.b_meadow;
}

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
const softClamp = (v, lo, hi, k) => smin(smax(v, lo, k), hi, k);
const hexRgb = (hex) => { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };

/** Маска биомов: веса NB каналов на клетку 16 м, с искажённой шумом и размытой границей. */
function buildBiomeMask(warpNoise) {
  const N = MASK_N;
  const hard = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * MASK_CELL, z = (j + 0.5) * MASK_CELL;
      const wx = x + MASK_WARP * fbm(warpNoise, x / 260, z / 260, 3);
      const wz = z + MASK_WARP * fbm(warpNoise, x / 260 + 31.7, z / 260 - 17.3, 3);
      hard[j * N + i] = biomeRule(wx, wz);
    }
  }
  const mask = new Float32Array(N * N * NB);
  const R = MASK_BLUR, inv = 1 / ((2 * R + 1) * (2 * R + 1));
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const o = (j * N + i) * NB;
      for (let dj = -R; dj <= R; dj++) {
        for (let di = -R; di <= R; di++) {
          const ii = Math.min(N - 1, Math.max(0, i + di)), jj = Math.min(N - 1, Math.max(0, j + dj));
          mask[o + hard[jj * N + ii]] += inv;
        }
      }
    }
  }
  return mask;
}

/** Веса биомов в точке (билинейно по маске). out — массив длины NB. */
export function maskWeightsAt(mask, x, z, out) {
  const N = MASK_N;
  let u = x / MASK_CELL - 0.5, v = z / MASK_CELL - 0.5;
  u = Math.min(N - 1, Math.max(0, u)); v = Math.min(N - 1, Math.max(0, v));
  const i0 = Math.min(N - 2, Math.floor(u)), j0 = Math.min(N - 2, Math.floor(v));
  const tu = u - i0, tv = v - j0;
  const a = (j0 * N + i0) * NB, b = a + NB, c = a + N * NB, d = c + NB;
  for (let k = 0; k < NB; k++) {
    out[k] = (mask[a + k] * (1 - tu) + mask[b + k] * tu) * (1 - tv) + (mask[c + k] * (1 - tu) + mask[d + k] * tu) * tv;
  }
  return out;
}

/** Полная генерация: высоты (шаг 2 м), цвета вершин sRGB, маска биомов. */
export function generateTerrain(seed = WORLD_CONFIG.seed) {
  const { size, heightStep: step, heightRange: [hMin, hMax], seaLevel } = WORLD_CONFIG;
  const n = Math.round(size / step) + 1;
  const nWarp = createSimplex2D(seed ^ 0x51ed);
  const nH = createSimplex2D(seed + 1);
  const nR = createSimplex2D(seed + 2);
  const nD = createSimplex2D(seed + 3);
  const nC = createSimplex2D(seed + 4);
  const mask = buildBiomeMask(nWarp);

  const defs = BIOME_IDS.map((id) => BIOMES[id]);
  const w = new Float64Array(NB);

  // высота одного биома: середина диапазона ± амплитуда fBm/ridged, мягко зажатая в диапазон
  function biomeHeight(b, x, z) {
    const d = defs[b], nz = d.noise, f = nz.freq;
    let v = fbm(nH, x * f, z * f, 4);
    if (nz.ridged > 0) v = (1 - nz.ridged) * v + nz.ridged * (ridged(nR, x * f + 7.1, z * f - 3.3, 4) * 2 - 1);
    let h = (d.heightRange[0] + d.heightRange[1]) / 2 + nz.amp * v;
    if (nz.dunes) {
      const u = (x * 0.8 + z * 0.6) / 36 + 0.9 * fbm(nD, x / 200, z / 200, 2);
      const tri = 1 - Math.abs(2 * (u - Math.floor(u)) - 1);
      h += 5 * tri * tri;
    }
    return softClamp(h, d.heightRange[0], d.heightRange[1], 6);
  }

  // рельеф без площадок POI
  function rawHeight(x, z) {
    maskWeightsAt(mask, x, z, w);
    let h = 0;
    for (let b = 0; b < NB; b++) if (w[b] > 0.001) h += w[b] * biomeHeight(b, x, z);
    // вершина Стужи
    const wm = w[BI.b_mountains];
    if (wm > 0) {
      const dp = Math.hypot(x - PEAK.x, z - PEAK.z) / PEAK.r;
      if (dp < 1) { const s = 1 - dp * dp; h += wm * PEAK.h * s * s; }
    }
    // конус вулкана и кальдера
    const wv = w[BI.b_volcano];
    if (wv > 0) {
      const dc = Math.hypot(x - CRATER.x, z - CRATER.z);
      if (dc < CRATER.cone) h += wv * CRATER.coneH * Math.pow(1 - dc / CRATER.cone, 1.6);
      if (dc < CRATER.r) h += (CRATER.floor - h) * wv * smoothstep(CRATER.r, CRATER.r * 0.55, dc);
    }
    // границы: море на западе и юге, скалы на севере, пепельная стена на востоке
    const sn = smoothstep(CLIFF_BAND, 10, z), se = smoothstep(CLIFF_BAND, 10, size - x);
    if (sn > 0) h = Math.max(h, h + (205 + 12 * nC(x / 40, 3.1) - h) * sn);
    if (se > 0) h = Math.max(h, h + (165 + 15 * nC(7.7, z / 40) - h) * se);
    const sea = Math.max(smoothstep(OCEAN_BAND, 45, x), smoothstep(OCEAN_BAND, 45, size - z));
    if (sea > 0) h += (hMin - h) * sea;
    return h;
  }

  // площадки под POI: плоский круг радиуса r с плавным краем; суша не ниже уровня моря + 1,5 м
  const stamps = POIS.map((p) => {
    const [x, z] = p.pos, edge = Math.max(12, p.r * 0.75);
    let hc = rawHeight(x, z);
    if (!/sunken/.test(p.id)) hc = Math.max(hc, seaLevel + 1.5);
    return { x, z, r: p.r, R: p.r + edge, h: hc };
  });

  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const z = j * step;
    for (let i = 0; i < n; i++) {
      const x = i * step;
      let h = rawHeight(x, z);
      for (let s = 0; s < stamps.length; s++) {
        const st = stamps[s], dx = x - st.x, dz = z - st.z;
        if (dx > st.R || dx < -st.R || dz > st.R || dz < -st.R) continue;
        const k = smoothstep(st.R, st.r, Math.hypot(dx, dz));
        if (k > 0) h += (st.h - h) * k;
      }
      heights[j * n + i] = softClamp(h, hMin, hMax, 4);
    }
  }

  // цвета: палитра биома, склоны темнее, у воды — почва, в горах снег, детали шумом
  const pal = defs.map((d) => Object.fromEntries(Object.entries(d.palette).map(([k, v]) => [k, hexRgb(v)])));
  const colors = new Uint8Array(n * n * 3);
  const c = [0, 0, 0], acc = [0, 0, 0];
  const mix3 = (a, b, t) => { c[0] = a[0] + (b[0] - a[0]) * t; c[1] = a[1] + (b[1] - a[1]) * t; c[2] = a[2] + (b[2] - a[2]) * t; };
  const mixc = (b, t) => { c[0] += (b[0] - c[0]) * t; c[1] += (b[1] - c[1]) * t; c[2] += (b[2] - c[2]) * t; };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const idx = j * n + i, x = i * step, z = j * step, h = heights[idx];
      const gx = (heights[j * n + Math.min(n - 1, i + 1)] - heights[j * n + Math.max(0, i - 1)]) / (2 * step);
      const gz = (heights[Math.min(n - 1, j + 1) * n + i] - heights[Math.max(0, j - 1) * n + i]) / (2 * step);
      const ny = 1 / Math.sqrt(1 + gx * gx + gz * gz);
      const steep = smoothstep(0.86, 0.62, ny);
      const shore = smoothstep(seaLevel + 1.6, seaLevel + 0.4, h);
      maskWeightsAt(mask, x, z, w);
      acc[0] = acc[1] = acc[2] = 0;
      for (let b = 0; b < NB; b++) {
        if (w[b] < 0.001) continue;
        const P = pal[b], id = BIOME_IDS[b];
        if (id === 'b_mountains') {
          mix3(P.shade, P.ground, smoothstep(95, 125, h));
          mixc(P.rock, steep);
        } else if (id === 'b_volcano') {
          mix3(P.ground, P.ash, smoothstep(-0.2, 0.5, nC(x / 45, z / 45)));
          mixc(P.shade, steep * 0.8);
          const dc = Math.hypot(x - CRATER.x, z - CRATER.z);
          if (dc < CRATER.r) mixc(P.lava1, 0.35 * smoothstep(CRATER.r, CRATER.r * 0.4, dc));
        } else if (id === 'b_swamp') {
          mix3(P.ground, P.duckweed, 0.75 * smoothstep(0.05, 0.45, nC(x / 28, z / 28)));
          mixc(P.shade, steep * 0.7);
        } else if (id === 'b_desert_ruins') {
          mix3(P.ground, P.stone, steep);
          mixc(P.shade, shore * 0.6);
        } else {
          mix3(P.ground, P.shade, steep);
          mixc(P.soil, shore);
        }
        acc[0] += w[b] * c[0]; acc[1] += w[b] * c[1]; acc[2] += w[b] * c[2];
      }
      // мелкая неоднородность ±5 %, детерминированная по индексу
      const jit = 0.95 + 0.1 * (((Math.imul(idx, 2654435761) >>> 0) & 1023) / 1023);
      colors[idx * 3] = Math.min(255, acc[0] * jit);
      colors[idx * 3 + 1] = Math.min(255, acc[1] * jit);
      colors[idx * 3 + 2] = Math.min(255, acc[2] * jit);
    }
  }

  const sp = WORLD_CONFIG.spawn.pos;
  return { seed, n, step, size, seaLevel, heights, colors, mask, maskN: MASK_N, biomeIds: BIOME_IDS.slice(), spawn: { x: sp[0], z: sp[2] } };
}

/** Чтение готовой карты: высота (билинейно), нормаль, веса и id биома. */
export function createTerrainSampler(t) {
  const { n, step, heights, mask } = t;
  const max = n - 1;
  const wtmp = new Float64Array(NB);
  function heightAt(x, z) {
    let u = x / step, v = z / step;
    u = u < 0 ? 0 : u > max ? max : u;
    v = v < 0 ? 0 : v > max ? max : v;
    const i = Math.min(max - 1, Math.floor(u)), j = Math.min(max - 1, Math.floor(v));
    const tu = u - i, tv = v - j, o = j * n + i;
    const a = heights[o], b = heights[o + 1], c = heights[o + n], d = heights[o + n + 1];
    return (a + (b - a) * tu) * (1 - tv) + (c + (d - c) * tu) * tv;
  }
  function normalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
    const e = step;
    const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
    const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    const l = Math.sqrt(1 + gx * gx + gz * gz);
    out.x = -gx / l; out.y = 1 / l; out.z = -gz / l;
    return out;
  }
  const biomeWeightsAt = (x, z, out = new Float64Array(NB)) => maskWeightsAt(mask, x, z, out);
  function biomeAt(x, z) {
    maskWeightsAt(mask, x, z, wtmp);
    let best = 0;
    for (let b = 1; b < NB; b++) if (wtmp[b] > wtmp[best]) best = b;
    return BIOME_IDS[best];
  }
  return { heightAt, normalAt, biomeWeightsAt, biomeAt };
}
