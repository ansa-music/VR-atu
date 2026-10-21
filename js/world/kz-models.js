// js/world/kz-models.js — процедурные low-poly модели казахского мира (расширение API procedural-models.js).
// Тот же формат данных, что buildModelData(): nodes[{name,parent,t,position,normal,color(rgba: rgb×AO, a=ветер),uv,tris}],
// поэтому работают createModel-подобная сборка, превью-растеризатор и GLB-генератор без изменений.
// API: KZ_MODEL_IDS, buildKzModelData(id), createKzModel(THREE,id,opts), KZ_BUDGET, KZ_MODEL_STATS().
import { getToonMaterial } from './procedural-models.js';

export const KZC = Object.freeze({
  felt: '#e9dcc0', feltD: '#c9b48c', red: '#c8282d', gold: '#fec50c', blue: '#00afca', blueD: '#0b5c8a', wood: '#a0683a', woodD: '#6a4424',
  stone: '#b8ad98', stoneD: '#857a66', tile: '#1aa6b7', tileD: '#0e6f86', brick: '#d2a46a', brickD: '#a57a46', white: '#f6f1e6', dark: '#2a2324',
  horse: '#f2ead8', mane: '#fec50c', wing: '#ffffff', glow: '#7fe8ff', glowGold: '#ffe27a',
});
const GLOW = new Set([KZC.glow, KZC.glowGold]);
const D = Math.PI / 180;
// ---- примитивы ----
function orient(t) { for (const tr of t) { const [a, b, c] = tr; const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]; if (nn[0] * m[0] + nn[1] * m[1] + nn[2] * m[2] < 0) { tr[1] = c; tr[2] = b; } } return t; }
const ok = ([a, b, c]) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) > 1e-7; };
function box(w, h, d) { const x = w / 2, y = h / 2, z = d / 2, v = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]], t = []; for (const q of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]]) t.push([v[q[0]], v[q[1]], v[q[2]]], [v[q[0]], v[q[2]], v[q[3]]]); return orient(t); }
function cyl(rt, rb, h, n = 8, caps = true) { const t = [], P = Math.PI * 2, r = (R, y, i) => [Math.cos((i / n) * P) * R, y, Math.sin((i / n) * P) * R]; for (let i = 0; i < n; i++) { const b0 = r(rb, -h / 2, i), b1 = r(rb, -h / 2, i + 1), t0 = r(rt, h / 2, i), t1 = r(rt, h / 2, i + 1); t.push([b0, b1, t1], [b0, t1, t0]); if (caps && i > 0 && i < n - 1) t.push([r(rb, -h / 2, 0), b0, b1], [r(rt, h / 2, 0), t0, t1]); } return orient(t.filter(ok)); }
function sph(R, n = 8, m = 6, top = 1) { const p = (i, j) => { const th = (j / m) * Math.PI * top, ph = (i / n) * Math.PI * 2; return [Math.sin(th) * Math.cos(ph) * R, Math.cos(th) * R, Math.sin(th) * Math.sin(ph) * R]; }, t = []; for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) { const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1); t.push([a, b, c], [a, c, d]); } return orient(t.filter(ok)); }
// тор (кольцо шаңырақ), лежит в плоскости XZ
function torus(R, r, n = 16, m = 4) { const t = [], p = (i, j) => { const a = (i / n) * Math.PI * 2, b = (j / m) * Math.PI * 2, k = R + Math.cos(b) * r; return [Math.cos(a) * k, Math.sin(b) * r, Math.sin(a) * k]; }; for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1); t.push([a, b, c], [a, c, d]); } return t.filter(ok); }
const PR = { box, cyl, sph, torus };
const Pt = (prim, args, c, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1], wind = 0) => ({ prim, args, c, pos, rot, scl, wind });
function rotV([x, y, z], [rx, ry, rz]) { if (rx) { const c = Math.cos(rx), s = Math.sin(rx); [y, z] = [y * c - z * s, y * s + z * c]; } if (ry) { const c = Math.cos(ry), s = Math.sin(ry); [x, z] = [x * c + z * s, -x * s + z * c]; } if (rz) { const c = Math.cos(rz), s = Math.sin(rz); [x, y] = [x * c - y * s, x * s + y * c]; } return [x, y, z]; }
function M(id, cat, extra = {}) { const m = { id, cat, nodes: [{ name: 'root', parent: -1, t: [0, 0, 0], parts: [] }], ...extra }; m.n = (name, parent, t, parts = []) => { const pi = m.nodes.findIndex((x) => x.name === parent); m.nodes.push({ name, parent: pi < 0 ? 0 : pi, t, parts }); return m; }; return m; }
const ring = (k, R, f) => Array.from({ length: k }, (_, i) => f(Math.cos((i / k) * Math.PI * 2) * R, Math.sin((i / k) * Math.PI * 2) * R, i, (i / k) * Math.PI * 2));

// ---- модели ----
function yurt(id, s = 1) { // киіз үй: керегe (стена) + уық (купол-конус) + шаңырақ + сықырлауық (дверь) + орнаментальная баскұр-лента
  const m = M(id, 'prop', { interactive: true, kk: 'Киіз үй' }), R = 3 * s, H = 1.6 * s;
  m.n('kerege', 'root', [0, 0, 0], [Pt('cyl', [R, R, H, 14], KZC.felt, [0, H / 2, 0]), Pt('cyl', [R + 0.03, R + 0.03, 0.28 * s, 14, false], KZC.red, [0, H * 0.78, 0]), Pt('cyl', [R + 0.04, R + 0.04, 0.08 * s, 14, false], KZC.gold, [0, H * 0.62, 0]), Pt('cyl', [R + 0.05, R + 0.05, 0.12 * s, 14, false], KZC.feltD, [0, 0.06, 0])]);
  m.n('uyk', 'kerege', [0, H, 0], [Pt('cyl', [0.55 * s, R + 0.05, 1.3 * s, 14], KZC.felt, [0, 0.65 * s, 0]), Pt('cyl', [R * 0.72, R * 0.86, 0.22 * s, 14, false], KZC.blueD, [0, 0.32 * s, 0]), Pt('cyl', [R * 0.69, R * 0.73, 0.06 * s, 14, false], KZC.gold, [0, 0.46 * s, 0])]);
  m.n('shanyrak', 'uyk', [0, 1.32 * s, 0], [Pt('torus', [0.55 * s, 0.07 * s, 14, 4], KZC.wood), Pt('box', [1.1 * s, 0.06, 0.08], KZC.woodD, [0, 0.12 * s, 0], [0, 0, 0.2]), Pt('box', [0.08, 0.06, 1.1 * s], KZC.woodD, [0, 0.12 * s, 0], [0.2, 0, 0])]);
  m.n('door', 'kerege', [0, 0, -R], [Pt('box', [0.9 * s, 1.35 * s, 0.12], KZC.red, [0, 0.68 * s, 0]), Pt('box', [0.7 * s, 0.2 * s, 0.14], KZC.gold, [0, 1.05 * s, 0]), Pt('box', [1.1 * s, 0.12 * s, 0.16], KZC.woodD, [0, 1.42 * s, 0])]);
  m.n('Door', 'door', [0, 0.7 * s, -0.1]);
  return m;
}
function shanyrakPortal() { // вертикальный шаңырақ на каменном постаменте — портал быстрого перемещения и святилище
  const m = M('kz_shanyrak_portal', 'prop', { interactive: true, kk: 'Шаңырақ қақпасы' });
  m.n('base', 'root', [0, 0, 0], [Pt('cyl', [2.2, 2.5, 0.35, 12], KZC.stoneD, [0, 0.17, 0]), Pt('cyl', [1.9, 2.1, 0.25, 12], KZC.stone, [0, 0.47, 0]), Pt('box', [0.5, 1.4, 0.6], KZC.stone, [-1.7, 1.2, 0]), Pt('box', [0.5, 1.4, 0.6], KZC.stone, [1.7, 1.2, 0])]);
  m.n('ring', 'base', [0, 2.6, 0], [Pt('torus', [1.9, 0.16, 24, 5], KZC.wood, [0, 0, 0], [90 * D, 0, 0]), Pt('torus', [2.08, 0.06, 24, 4], KZC.gold, [0, 0, 0], [90 * D, 0, 0]),
    ...[-0.5, 0, 0.5].map((d) => Pt('box', [0.11, 3.7, 0.11], KZC.woodD, [d, 0, 0], [0, 0, 0])), ...[-0.5, 0, 0.5].map((d) => Pt('box', [3.7, 0.11, 0.11], KZC.woodD, [0, d, 0])),
    ...ring(12, 2.0, (x, y) => Pt('sph', [0.09, 5, 3], KZC.red, [x, y, 0]))]);
  m.n('Surface', 'ring', [0, 0, 0.02], [Pt('cyl', [1.75, 1.75, 0.04, 20], KZC.glow, [0, 0, 0], [90 * D, 0, 0])]);
  m.n('tu', 'base', [0, 0, 0], [Pt('cyl', [0.04, 0.04, 5.2, 5], KZC.woodD, [2.3, 2.6, 0.4]), Pt('box', [0.03, 0.6, 0.9], KZC.blue, [2.3, 4.7, 0.85], [0, 0, 0], [1, 1, 1], 1), Pt('cyl', [0, 0.1, 0.3, 5], KZC.gold, [2.3, 5.3, 0.4])]);
  return m;
}
function balbal() { // балбал тас: стела с ликом, руки держат чашу у груди (тюркский канон), без гротеска
  const m = M('kz_balbal', 'prop', { kk: 'Балбал тас' });
  m.n('body', 'root', [0, 0, 0], [Pt('box', [0.62, 1.7, 0.36], KZC.stone, [0, 0.85, 0], [0, 0, 0.03]), Pt('cyl', [0.3, 0.33, 0.45, 8], KZC.stone, [0, 1.92, 0]), Pt('cyl', [0.2, 0.31, 0.16, 8], KZC.stoneD, [0, 2.2, 0])]);
  m.n('face', 'body', [0, 1.95, -0.29], [Pt('box', [0.08, 0.03, 0.04], KZC.stoneD, [-0.1, 0.06, 0]), Pt('box', [0.08, 0.03, 0.04], KZC.stoneD, [0.1, 0.06, 0]), Pt('box', [0.05, 0.14, 0.05], KZC.stoneD, [0, -0.02, -0.01]), Pt('box', [0.22, 0.03, 0.04], KZC.stoneD, [0, -0.13, 0.02], [0, 0, 0]), Pt('box', [0.26, 0.06, 0.04], KZC.stoneD, [0, -0.17, 0.02], [0, 0, 0])]);
  m.n('hands', 'body', [0, 1.25, -0.2], [Pt('box', [0.5, 0.1, 0.06], KZC.stoneD, [0, 0, 0], [0, 0, 0.2]), Pt('cyl', [0.09, 0.06, 0.14, 6], KZC.stoneD, [-0.06, 0.06, -0.03])]);
  m.n('base', 'root', [0, 0, 0], [Pt('cyl', [0.6, 0.7, 0.12, 8], KZC.stoneD, [0, 0.06, 0])]);
  return m;
}
function mausoleum() { // кесене (Ясауи-вдохновение): пештак-портал, барабан, рёбристый бирюзовый купол, малый купол, изразцовые ленты
  const m = M('kz_mausoleum', 'prop', { kk: 'Кесене', dungeonEntrance: 'Door' });
  m.n('hall', 'root', [0, 0, 0], [Pt('box', [14, 8, 12], KZC.brick, [0, 4, 0]), Pt('box', [14.2, 0.8, 12.2], KZC.tile, [0, 7.4, 0]), Pt('box', [14.3, 0.4, 12.3], KZC.brickD, [0, 0.2, 0])]);
  m.n('pishtak', 'hall', [0, 0, -6.5], [Pt('box', [10, 13, 2], KZC.brick, [0, 6.5, 0]), Pt('box', [5, 8, 0.6], KZC.tileD, [0, 4, -0.9]), Pt('cyl', [0, 2.5, 2.4, 3], KZC.tileD, [0, 8.9, -0.9], [90 * D, 0, 0], [1, 1, 1]), Pt('box', [10.2, 1, 2.2], KZC.tile, [0, 12.2, 0]), Pt('cyl', [0.9, 0.9, 14, 8], KZC.brickD, [-5.5, 7, 0]), Pt('cyl', [0.9, 0.9, 14, 8], KZC.brickD, [5.5, 7, 0]), Pt('box', [3.2, 4.6, 0.3], KZC.dark, [0, 2.3, -1.2])]);
  m.n('Door', 'pishtak', [0, 1.5, -1.3]);
  m.n('drum', 'hall', [0, 8, 1], [Pt('cyl', [5, 5, 3, 16], KZC.brick, [0, 1.5, 0]), Pt('cyl', [5.05, 5.05, 0.6, 16, false], KZC.tile, [0, 2.6, 0])]);
  m.n('dome', 'drum', [0, 3, 0], [Pt('sph', [5.2, 16, 6, 0.5], KZC.tile, [0, 0, 0], [0, 0, 0], [1, 1.25, 1]), Pt('cyl', [4.6, 5.25, 0.5, 16, false], KZC.tileD, [0, 1.2, 0]), Pt('cyl', [2.6, 3.4, 0.4, 16, false], KZC.tileD, [0, 4.6, 0]), Pt('cyl', [0.05, 0.3, 1.6, 6], KZC.gold, [0, 7, 0])]);
  m.n('dome_small', 'hall', [0, 8, -2.8], [Pt('cyl', [2.2, 2.2, 1.2, 12], KZC.brick, [0, 0.6, 0]), Pt('sph', [2.3, 12, 4, 0.5], KZC.tileD, [0, 1.2, 0])]);
  return m;
}
function tulpar() { // тұлпар — крылатый конь (rig quadruped; узлы leg_FL.., wing_L/R совпадают с animate())
  const m = M('kz_tulpar', 'mob', { rig: 'quadruped', kk: 'Тұлпар', mount: 'mnt_dawn_stag' });
  m.n('spine', 'root', [0, 1.35, 0], [Pt('cyl', [0.36, 0.4, 1.7, 8], KZC.horse, [0, 0, 0], [90 * D, 0, 0]), Pt('box', [0.75, 0.12, 0.6], KZC.red, [0, 0.36, 0.05]), Pt('box', [0.78, 0.04, 0.62], KZC.gold, [0, 0.31, 0.05])]);
  m.n('neck', 'spine', [0, 0.25, -0.75], [Pt('cyl', [0.17, 0.27, 0.8, 7], KZC.horse, [0, 0.32, -0.15], [-35 * D, 0, 0]), Pt('box', [0.08, 0.7, 0.3], KZC.mane, [0, 0.4, 0.02], [-35 * D, 0, 0], [1, 1, 1], 1)]);
  m.n('head', 'neck', [0, 0.72, -0.4], [Pt('box', [0.26, 0.28, 0.62], KZC.horse, [0, 0, -0.18], [20 * D, 0, 0]), Pt('box', [0.05, 0.16, 0.05], KZC.horse, [-0.08, 0.2, 0.05]), Pt('box', [0.05, 0.16, 0.05], KZC.horse, [0.08, 0.2, 0.05]), Pt('sph', [0.045, 4, 3], KZC.dark, [0.13, 0.04, -0.15]), Pt('sph', [0.045, 4, 3], KZC.dark, [-0.13, 0.04, -0.15])]);
  m.n('jaw', 'head', [0, -0.1, -0.35]);
  for (const [nm, x, z] of [['leg_FL', -0.22, -0.6], ['leg_FR', 0.22, -0.6], ['leg_BL', -0.22, 0.6], ['leg_BR', 0.22, 0.6]]) m.n(nm, 'spine', [x, -0.2, z], [Pt('cyl', [0.1, 0.07, 1.05, 6], KZC.horse, [0, -0.52, 0]), Pt('cyl', [0.09, 0.1, 0.12, 6], KZC.gold, [0, -1.08, 0])]);
  m.n('tail', 'spine', [0, 0.15, 0.85], [Pt('box', [0.1, 0.8, 0.14], KZC.mane, [0, -0.35, 0.15], [-25 * D, 0, 0], [1, 1, 1], 1)]);
  for (const [nm, s] of [['wing_L', -1], ['wing_R', 1]]) m.n(nm, 'spine', [0.3 * s, 0.3, -0.25], [Pt('box', [1.3, 0.05, 0.6], KZC.wing, [0.65 * s, 0.1, 0], [0, 0, 12 * D * s], [1, 1, 1], 1), ...[0, 1, 2].map((k) => Pt('box', [0.5, 0.04, 0.22], KZC.wing, [(1.2 + k * 0.25) * s, 0.25 + k * 0.05, 0.1 + k * 0.12], [0, 15 * D * k * s, 18 * D * s]))]);
  m.n('Saddle', 'spine', [0, 0.45, 0.05]);
  return m;
}
function samuryk() { // Самұрық — флаер (rig flyer)
  const m = M('kz_samuryk', 'boss', { rig: 'flyer', kk: 'Самұрық', mount: 'mnt_sky_ray' });
  m.n('spine', 'root', [0, 2, 0], [Pt('sph', [0.9, 8, 6], KZC.gold, [0, 0, 0], [0, 0, 0], [1, 0.8, 1.6]), Pt('cyl', [0.25, 0.45, 1, 7], KZC.gold, [0, 0.5, -1.2], [-50 * D, 0, 0]), Pt('sph', [0.38, 7, 5], KZC.glowGold, [0, 1.0, -1.6]), Pt('cyl', [0, 0.14, 0.5, 5], KZC.red, [0, 0.95, -2.05], [-90 * D, 0, 0])]);
  for (const [nm, s] of [['wing_L', -1], ['wing_R', 1]]) { m.n(nm, 'spine', [0.7 * s, 0.2, 0], [Pt('box', [2.6, 0.08, 1.3], KZC.gold, [1.3 * s, 0, 0])]); m.n(nm.replace('wing', 'wingtip'), nm, [2.6 * s, 0, 0], [Pt('box', [2.2, 0.06, 1.0], KZC.red, [1.1 * s, 0, 0.2]), ...[0, 1, 2].map((k) => Pt('box', [1.4, 0.05, 0.3], KZC.glowGold, [(1.6 + k * 0.2) * s, 0.02, 0.5 + k * 0.25], [0, 0.2 * k * s, 0]))]); }
  m.n('tail', 'spine', [0, 0, 1.3], [...[-1, 0, 1].map((k) => Pt('box', [0.35, 0.06, 2.4], k ? KZC.red : KZC.gold, [k * 0.35, 0, 1.2], [0, k * 0.25, 0], [1, 1, 1], 1))]);
  return m;
}
const KZ_FACTORIES = { kz_yurt: () => yurt('kz_yurt', 1), kz_yurt_large: () => yurt('kz_yurt_large', 1.6), kz_shanyrak_portal: shanyrakPortal, kz_balbal: balbal, kz_mausoleum: mausoleum, kz_tulpar: tulpar, kz_samuryk: samuryk };
export const KZ_MODEL_IDS = Object.keys(KZ_FACTORIES);
export const KZ_BUDGET = Object.freeze({ prop: 1200, mob: 3000, boss: 8000, propLarge: 2500 });
const hx = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const _cache = new Map();
export function buildKzModelData(id) {
  if (_cache.has(id)) return _cache.get(id);
  const f = KZ_FACTORIES[id]; if (!f) throw new Error('kz-models: unknown id ' + id);
  const m = f(), world = [];
  m.nodes.forEach((n, i) => { const p = n.parent >= 0 ? world[n.parent] : [0, 0, 0]; world[i] = [p[0] + n.t[0], p[1] + n.t[1], p[2] + n.t[2]]; });
  let minY = Infinity, maxY = -Infinity;
  const raw = m.nodes.map((n, i) => { const tris = []; for (const pt of n.parts) for (const t of PR[pt.prim](...pt.args)) tris.push({ v: t.map((v) => { const r = rotV([v[0] * pt.scl[0], v[1] * pt.scl[1], v[2] * pt.scl[2]], pt.rot); return [r[0] + pt.pos[0], r[1] + pt.pos[1], r[2] + pt.pos[2]]; }), c: pt.c, w: pt.wind }); for (const t of tris) for (const v of t.v) { const y = v[1] + world[i][1]; minY = Math.min(minY, y); maxY = Math.max(maxY, y); } return tris; });
  const hY = Math.max(1e-3, maxY - minY), bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity]; let triCount = 0;
  const nodes = m.nodes.map((n, i) => {
    const tris = raw[i], N = tris.length * 3, pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), col = new Float32Array(N * 4), uv = new Float32Array(N * 2).fill(0.5); let k = 0;
    for (const t of tris) {
      const [a, b, c] = t.v, u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0]; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const rgb = hx(t.c), glow = GLOW.has(t.c);
      for (const p of t.v) { pos.set(p, k * 3); nor.set([nx, ny, nz], k * 3); const hg = Math.min(1, Math.max(0, (p[1] + world[i][1] - minY) / hY)), ao = glow ? 1 : (0.62 + 0.38 * hg) * (0.88 + 0.12 * Math.max(0, ny)); col.set([rgb[0] * ao, rgb[1] * ao, rgb[2] * ao, t.w ? t.w * hg : 0], k * 4); for (let d = 0; d < 3; d++) { const g = p[d] + world[i][d]; bmin[d] = Math.min(bmin[d], g); bmax[d] = Math.max(bmax[d], g); } k++; }
    }
    triCount += tris.length; return { name: i === 0 ? m.id : n.name, parent: n.parent, t: n.t, position: pos, normal: nor, color: col, uv, tris: tris.length };
  });
  const meta = {}; for (const key of Object.keys(m)) if (!['nodes', 'n'].includes(key)) meta[key] = m[key];
  const big = id === 'kz_mausoleum' || id === 'kz_yurt_large' || id === 'kz_shanyrak_portal';
  const out = { ...meta, id, nodes, triCount, bbox: [bmin, bmax], budget: big ? KZ_BUDGET.propLarge : KZ_BUDGET[m.cat] };
  _cache.set(id, out); return out;
}
export const KZ_MODEL_STATS = () => KZ_MODEL_IDS.map((id) => { const d = buildKzModelData(id); return { id, cat: d.cat, tris: d.triCount, budget: d.budget, size: d.bbox[1].map((v, i) => +(v - d.bbox[0][i]).toFixed(2)) }; });
const _geo = new Map();
/** createKzModel(THREE, id, {material, castShadow}) -> THREE.Group; совместим с animate() из procedural-models.js (те же rig/узлы/userData). */
export function createKzModel(THREE, id, opts = {}) {
  const d = buildKzModelData(id), mat = opts.material || getToonMaterial(THREE);
  const objs = d.nodes.map((n, i) => { const o = new THREE.Group(); if (n.tris) { const key = id + '/' + i; if (!_geo.has(key)) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(n.position, 3)); g.setAttribute('normal', new THREE.BufferAttribute(n.normal, 3)); g.setAttribute('color', new THREE.BufferAttribute(n.color, 4)); g.setAttribute('uv', new THREE.BufferAttribute(n.uv, 2)); g.computeBoundingSphere(); _geo.set(key, g); } const mesh = new THREE.Mesh(_geo.get(key), mat); mesh.name = n.name + '_mesh'; mesh.castShadow = !!opts.castShadow; o.add(mesh); } o.name = n.name; o.position.fromArray(n.t); return o; });
  d.nodes.forEach((n, i) => { if (i > 0) objs[n.parent].add(objs[i]); });
  const root = objs[0];
  root.userData = { modelId: id, cat: d.cat, rig: d.rig || null, tris: d.triCount, hover: 0, nodes: Object.fromEntries(objs.map((o) => [o.name, o])) };
  for (const o of objs) o.userData.rest = { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() };
  if (root.userData.nodes.Surface) root.userData.nodes.Surface.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.75, depthWrite: false }); o.renderOrder = 2; } });
  return root;
}
/** Портал шаңырақ: вращение решётки и пульс поверхности (вызывать в кадре). */
export function animateShanyrak(root, t, active = true) { const N = root.userData.nodes; if (N.ring) N.ring.rotation.z = t * (active ? 0.4 : 0.05); if (N.Surface) { const s = active ? 1 + Math.sin(t * 3) * 0.03 : 0.001; N.Surface.scale.set(s, s, 1); } }
