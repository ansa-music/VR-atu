// js/world/biome-terrain.js — J: форма рельефа и окраска по биомам («этажи» SAO). Чистые функции, без three.
// Подключение в terrain.js (2 строки, см. parts5/J): rawHeight → shapeHeight(x,z,h,w); buildChunkGeometry → tintAt(...).
import { WORLD_CONFIG, BIOMES } from '../../shared/defs/index.js';

const W = WORLD_CONFIG;
function hash2(ix, iz, s) { let h = (ix * 374761393 + iz * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
const sm = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function vn(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = sm(x - ix), fz = sm(z - iz);
  const a = hash2(ix, iz, s), b = hash2(ix + 1, iz, s), c = hash2(ix, iz + 1, s), d = hash2(ix + 1, iz + 1, s);
  return (a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz) * 2 - 1;
}
export function fbm2(x, z, oct, s) { let v = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { v += vn(x * f, z * f, s + i * 31) * a; f *= 2.03; a *= 0.5; } return v / (1 - Math.pow(0.5, oct)); }

/** Ключевые формы рельефа. Кратер вулкана выбран между POI: мост-обсидиан (1280,300) и обзор кальдеры (1380,240) стоят на кромке. */
export const SHAPES = Object.freeze({
  swamp: { pools: 0.6, flat: 0.6, minH: -2.5 },
  mountains: { peakAmp: 170, freq: 0.0045, snowLine: 110, coldLine: BIOMES.b_mountains?.hazard?.aboveY ?? 120, maxH: 232 },
  desert: { terraceM: 7, canyonFreq: 0.0035, canyonWidth: 0.1, canyonDepth: 30, minH: 5 },
  volcano: { crater: { x: 1350, z: 300, r: 70, lavaR: 48, floor: 24 }, cone: { r: 300, h: 120 }, minH: 36, lavaLevel: BIOMES.b_volcano?.lavaLevel ?? 32 },
});
const V = SHAPES.volcano;

/** Доводит «сырую» высоту биома до характерной формы. w — веса biomeWeights (сумма 1). */
export function shapeHeight(x, z, h, w) {
  let out = h;
  const ws = w.b_swamp || 0, wm = w.b_mountains || 0, wd = w.b_desert_ruins || 0, wv = w.b_volcano || 0;
  if (ws > 0.001) { // топь: плоские равнины + лужи и протоки ниже уровня моря
    const t = 0.7 + fbm2(x * 0.02, z * 0.02, 3, 301) * 1.8 - 2.2 * Math.max(0, fbm2(x * 0.007, z * 0.007, 2, 302));
    out += (Math.max(SHAPES.swamp.minH, t) - out) * sm(ws * 1.4);
  }
  if (wm > 0.001) { // пики: острые гребни (ridged) + массив
    const S = SHAPES.mountains, r = 1 - Math.abs(fbm2(x * S.freq, z * S.freq, 4, 311));
    const peak = Math.pow(r, 3) * S.peakAmp + 30 + 25 * fbm2(x * 0.0018, z * 0.0018, 2, 312);
    out = Math.min(S.maxH, out + sm(wm) * peak);
  }
  if (wd > 0.001) { // Шарын: столовые террасы + извилистые каньоны
    const S = SHAPES.desert; let t = out; const f = t / S.terraceM, fi = Math.floor(f), fr = f - fi; t = (fi + Math.pow(fr, 4)) * S.terraceM;
    const c = Math.abs(fbm2(x * S.canyonFreq + 5.3, z * S.canyonFreq, 3, 321)); t -= S.canyonDepth * sm(1 - c / S.canyonWidth);
    out += (Math.max(S.minH, t) - out) * sm(wd * 1.3);
  }
  if (wv > 0.001) { // Отты тау: конус, кратер с лавой
    const d = Math.hypot(x - V.crater.x, z - V.crater.z);
    let t = Math.max(out, V.minH) + Math.pow(Math.max(0, 1 - d / V.cone.r), 1.6) * V.cone.h;
    if (d < V.crater.r) { const k = sm(1 - d / V.crater.r); t = t * (1 - k) + V.crater.floor * k; }
    out += (t - out) * sm(wv * 1.3);
  }
  return out;
}

export function craterDist(x, z) { return Math.hypot(x - V.crater.x, z - V.crater.z); }
/** Лава: внутри кратера ниже lavaLevel. */
export const lavaAt = (x, z, h) => craterDist(x, z) < V.crater.r && h < V.lavaLevel + 0.3;
export const nearLava = (x, z, h, m = BIOMES.b_volcano?.hazard?.nearLava ?? 8) => craterDist(x, z) < V.crater.r + m && h < V.lavaLevel + m;

const lin = (hex) => { const n = parseInt(hex.slice(1), 16), f = (v) => Math.pow(v / 255, 2.2); return { r: f(n >> 16 & 255), g: f(n >> 8 & 255), b: f(n & 255) }; };
const C = { snow: lin('#F4FAFF'), rock: lin('#8A8F9C'), strata: lin('#B5442A'), sand: lin('#E8B77A'), basalt: lin('#2A2124'), ember: lin('#FF6A1A'), mud: lin('#4A4A2A'), moss: lin('#5E7A3A') };
const mix = (c, t, k) => { c.r += (t.r - c.r) * k; c.g += (t.g - c.g) * k; c.b += (t.b - c.b) * k; };
/** Докраска вершины (c — {r,g,b} в линейном пространстве, мутируется). */
export function tintAt(x, z, h, w, c) {
  const wm = w.b_mountains || 0, wd = w.b_desert_ruins || 0, wv = w.b_volcano || 0, ws = w.b_swamp || 0;
  if (wm > 0.05) { mix(c, C.rock, 0.35 * wm * sm((h - 70) / 40)); mix(c, C.snow, sm((h - SHAPES.mountains.snowLine) / 25) * Math.min(1, wm * 1.5)); }
  if (wd > 0.05) { const band = Math.sin(h * 0.9 + fbm2(x * 0.05, z * 0.05, 1, 9) * 0.6); mix(c, band > 0.25 ? C.strata : C.sand, 0.45 * wd); }
  if (wv > 0.05) { mix(c, C.basalt, 0.55 * wv); if (nearLava(x, z, h, 4)) mix(c, C.ember, 0.8 * wv); }
  if (ws > 0.05) { if (h < 1.2) mix(c, C.mud, 0.6 * ws); else mix(c, C.moss, 0.3 * ws); }
  return c;
}

/** Правила декора по биомам (рисует zones.js инстансами; prim: cone|cyl|ico|oct|box). */
export const BIOME_PROPS = Object.freeze({
  b_meadow: [{ id: 'tulip', prim: 'cone', s: [0.12, 0.35], col: '#D7263D', n: 70, y: 0.2 }, { id: 'feather_grass', prim: 'cone', s: [0.1, 0.7], col: '#E9D98A', n: 60, y: 0.35 }, { id: 'kurgan_stone', prim: 'ico', s: [0.9, 0.6], col: '#9C9488', n: 3, y: 0.2 }],
  b_forest: [{ id: 'mushroom', prim: 'cone', s: [0.35, 0.3], col: '#C0392B', n: 18, y: 0.35 }, { id: 'fern', prim: 'cone', s: [0.6, 0.5], col: '#2F6B3A', n: 35, y: 0.25 }],
  b_swamp: [{ id: 'reed', prim: 'cyl', s: [0.05, 1.8], col: '#7C8A3E', n: 110, y: 0.9, near: 'water' }, { id: 'dead_tree', prim: 'cyl', s: [0.25, 5], col: '#3B3328', n: 8, y: 2.3 }, { id: 'lily', prim: 'cyl', s: [0.5, 0.04], col: '#4E8F3A', n: 30, y: 0.03, on: 'water' }],
  b_mountains: [{ id: 'snow_pine', prim: 'cone', s: [1.3, 4.2], col: '#2E4F45', n: 16, y: 2.1 }, { id: 'ice_crystal', prim: 'oct', s: [0.6, 1.6], col: '#9FE8FF', n: 6, y: 0.8, emissive: 0.8 }],
  b_desert_ruins: [{ id: 'saxaul', prim: 'ico', s: [1.1, 0.8], col: '#8A6A3E', n: 9, y: 0.5 }, { id: 'hoodoo', prim: 'cyl', s: [1.4, 9], col: '#B5503A', n: 4, y: 4 }, { id: 'balbal_ruin', prim: 'box', s: [0.7, 2.2], col: '#C9A27A', n: 3, y: 1.1 }],
  b_volcano: [{ id: 'obsidian_spike', prim: 'cone', s: [0.8, 3.4], col: '#1B1620', n: 14, y: 1.6 }, { id: 'ember_rock', prim: 'ico', s: [0.7, 0.6], col: '#FF7A2A', n: 9, y: 0.3, emissive: 1.2 }],
});
