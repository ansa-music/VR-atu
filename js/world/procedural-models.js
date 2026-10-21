// js/world/procedural-models.js — VR-ATU open world: процедурные low-poly модели (anime-toon, палитра 8×8).
// Ноль зависимостей. Один и тот же код используется:
//   1) в браузере: createModel(THREE, id) -> THREE.Group (ноль загрузок ассетов);
//   2) в Node: tools/gen-models.mjs -> assets/models/gen/*.glb (+ palette.png, превью).
// Ось: вперёд −Z, вверх +Y, root на полу (Y=0), метры. Плоское затенение (non-indexed).
// COLOR_0 = цвет палитры × запечённый AO (rgb), a = вес ветра (0..1). UV = центр ячейки атласа palette.png 256².

export const PALETTE = [
  // 0 meadow:  groundL  groundD  plant1   plant2   stone1   stone2   accent   shadow
  '#9fd36a','#5f9a3c','#7cc45a','#e8d36a','#b8b2a2','#86806f','#ff8fb1','#2f4a2a',
  // 1 forest
  '#4f8a3a','#2f5a2a','#3e7a3e','#1f4a2e','#8a8a7a','#5e5e52','#ffb347','#1a2a1e',
  // 2 swamp
  '#6b7a3a','#3f4a26','#5a7a4a','#8a9a5a','#6a6a5a','#45453a','#c8e05a','#20261a',
  // 3 mountains
  '#eef4fa','#b8c8d8','#3f6a5a','#2a4a44','#8a96a8','#5a6678','#7ad0ff','#2a3040',
  // 4 desert_ruins
  '#e8c890','#c89a5a','#8aa04a','#5a7a3a','#d8b07a','#a8804a','#3ac0c0','#5a3a22',
  // 5 volcano
  '#4a3a3a','#2a2020','#6a4a3a','#3a2a22','#3a3434','#1e1a1a','#ff6a2a','#120c0c',
  // 6 common: wood woodDark metal metalDark gold cloth leather skin
  '#8a5a32','#5a3820','#a8b0bc','#4a5260','#e8b84a','#c04a4a','#6a4a32','#f0c8a0',
  // 7 glow (emissive): cyan violet lava ice poison lightning gold white
  '#4ae8ff','#b06aff','#ff7a1a','#bff0ff','#7aff4a','#fff07a','#ffd84a','#ffffff',
];
export const C = {
  wood: 48, woodD: 49, metal: 50, metalD: 51, gold: 52, cloth: 53, leather: 54, skin: 55,
  gCyan: 56, gViolet: 57, gLava: 58, gIce: 59, gPoison: 60, gBolt: 61, gGold: 62, gWhite: 63,
  grass: 0, grassD: 1, leaf: 2, flower: 3, stone: 4, stoneD: 5, pink: 6, mShadow: 7,
  fLeaf: 8, fLeafD: 9, fMoss: 10, fPine: 11, fStone: 12, fStoneD: 13, fAmber: 14, fShadow: 15,
  sMud: 16, sMudD: 17, sMoss: 18, sReed: 19, sStone: 20, sStoneD: 21, sAcid: 22, sShadow: 23,
  snow: 24, snowD: 25, mPine: 26, mPineD: 27, rock: 28, rockD: 29, iceBlue: 30, mtShadow: 31,
  sand: 32, sandD: 33, palm: 34, palmD: 35, sandstone: 36, sandstoneD: 37, turq: 38, dShadow: 39,
  ash: 40, ashD: 41, vRock: 42, vRockD: 43, basalt: 44, obsidian: 45, magma: 46, vShadow: 47,
};
export const isGlow = (c) => c >= 56;
export function paletteUV(c) { return [((c % 8) + 0.5) / 8, 1 - (Math.floor(c / 8) + 0.5) / 8]; }
function hex(c) { const h = PALETTE[c]; return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]; }

// ---------- примитивы (треугольники в локальных координатах, наружу ориентированы) ----------
function orient(tris) {
  for (const t of tris) {
    const [a, b, c] = t;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0]) / 3, my = (a[1] + b[1] + c[1]) / 3, mz = (a[2] + b[2] + c[2]) / 3;
    if (nx * mx + ny * my + nz * mz < 0) { t[1] = c; t[2] = b; }
  }
  return tris;
}
function degOk(t) {
  const [a, b, c] = t, ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; return nx * nx + ny * ny + nz * nz > 1e-14;
}
function box(w = 1, h = 1, d = 1) {
  const x = w / 2, y = h / 2, z = d / 2, v = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
  const f = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]], t = [];
  for (const q of f) t.push([v[q[0]], v[q[1]], v[q[2]]], [v[q[0]], v[q[2]], v[q[3]]]);
  return orient(t);
}
// цилиндр / конус (rt=0) / усечённый конус вдоль Y, центр в 0
function cyl(rt = 0.5, rb = 0.5, h = 1, n = 8) {
  const t = [], y0 = -h / 2, y1 = h / 2, P2 = Math.PI * 2;
  const ring = (r, y, i) => [Math.cos((i / n) * P2) * r, y, Math.sin((i / n) * P2) * r];
  for (let i = 0; i < n; i++) {
    const b0 = ring(rb, y0, i), b1 = ring(rb, y0, i + 1), t0 = ring(rt, y1, i), t1 = ring(rt, y1, i + 1);
    t.push([b0, b1, t1]); t.push([b0, t1, t0]);
    if (i > 0 && i < n - 1) { t.push([ring(rb, y0, 0), b0, b1]); t.push([ring(rt, y1, 0), t0, t1]); }
  }
  return orient(t.filter(degOk));
}
function sph(r = 0.5, n = 8, m = 6) {
  const p = (i, j) => { const th = (j / m) * Math.PI, ph = (i / n) * Math.PI * 2; return [Math.sin(th) * Math.cos(ph) * r, Math.cos(th) * r, Math.sin(th) * Math.sin(ph) * r]; };
  const t = [];
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
    if (j > 0) t.push([a, b, c]);
    if (j < m - 1) t.push([a, c, d]);
  }
  return orient(t.filter(degOk));
}
// неровный камень: сфера с детерминированным шумом по вершине
function rockP(r = 1, n = 7, m = 5, seed = 1) {
  const cache = new Map(); let s = seed * 7919 + 1;
  const rnd = (k) => { if (!cache.has(k)) { s = (s * 16807) % 2147483647; cache.set(k, 0.75 + (s / 2147483647) * 0.45); } return cache.get(k); };
  return sph(r, n, m).map((tri) => tri.map((v) => { const f = rnd(v.map((x) => x.toFixed(4)).join()); return [v[0] * f, v[1] * f * 0.8, v[2] * f]; }));
}
const PRIMS = { box, cyl, sph, rock: rockP };

// part: [prim, args[], color, pos[3], rot[3] (рад, порядок X→Y→Z), scale[3], wind]
export const P = (prim, args, c, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1], wind = 0) => ({ prim, args, c, pos, rot, scl, wind });
function rotV(v, r) {
  let [x, y, z] = v; const [rx, ry, rz] = r;
  if (rx) { const c = Math.cos(rx), s = Math.sin(rx); [y, z] = [y * c - z * s, y * s + z * c]; }
  if (ry) { const c = Math.cos(ry), s = Math.sin(ry); [x, z] = [x * c + z * s, -x * s + z * c]; }
  if (rz) { const c = Math.cos(rz), s = Math.sin(rz); [x, y] = [x * c - y * s, x * s + y * c]; }
  return [x, y, z];
}

// ---------- DSL моделей ----------
function M(id, cat, extra = {}) {
  const m = { id, cat, nodes: [{ name: 'root', parent: -1, t: [0, 0, 0], parts: [] }], ...extra };
  m.n = (name, parent, t, parts = []) => { const pi = m.nodes.findIndex((x) => x.name === parent); m.nodes.push({ name, parent: pi < 0 ? 0 : pi, t, parts }); return m; };
  m.add = (name, ...parts) => { m.nodes.find((x) => x.name === name).parts.push(...parts); return m; };
  return m;
}
const D = Math.PI / 180;

// ---------- игрок: кисти (узлы-фаланги как кости) и наруч ----------
function hand(side) {
  const s = side === 'L' ? -1 : 1, m = M('player_hand_' + side, 'player');
  m.n('wrist', 'root', [0, 0, 0], [P('box', [0.075, 0.03, 0.09], C.skin, [0, 0, -0.045]), P('cyl', [0.042, 0.04, 0.05, 8], C.skin, [0, 0, 0.02], [90 * D, 0, 0])]);
  const fing = [['thumb', 0.045, -0.01, -0.02, 0.045], ['index', 0.027, 0, -0.09, 0.04], ['middle', 0.009, 0, -0.092, 0.044], ['ring', -0.009, 0, -0.09, 0.041], ['pinky', -0.027, 0, -0.085, 0.032]];
  for (const [fn, x, y, z, len] of fing) {
    let par = 'wrist';
    for (let k = 1; k <= 3; k++) {
      const name = `${fn}_${k}_${side}`, l = (len / 3) * (k === 1 ? 1.2 : 0.9);
      m.n(name, par, k === 1 ? [x * s, y, z] : [0, 0, -(len / 3) * (k === 2 ? 1.2 : 0.9)], [P('box', [0.017, 0.017, l], C.skin, [0, 0, -l / 2])]);
      par = name;
    }
  }
  m.n('palm_socket', 'wrist', [0, -0.03, -0.05]);
  return m;
}
function bracer(id = 'player_bracer', cat = 'player') {
  const m = M(id, cat);
  m.n('band', 'root', [0, 0, 0], [P('cyl', [0.05, 0.046, 0.13, 10], C.leather, [0, 0, 0], [90 * D, 0, 0]),
    P('cyl', [0.053, 0.053, 0.02, 10], C.gold, [0, 0, -0.06], [90 * D, 0, 0]), P('cyl', [0.051, 0.051, 0.02, 10], C.gold, [0, 0, 0.06], [90 * D, 0, 0])]);
  m.n('screen', 'band', [0, 0.05, 0], [P('box', [0.06, 0.008, 0.08], C.metalD), P('box', [0.05, 0.004, 0.068], C.gCyan, [0, 0.005, 0])]);
  m.n('Crystal', 'band', [0.05, 0, 0], [P('sph', [0.012, 6, 4], C.gViolet, [0, 0, 0], [0, 0, 0], [1, 1.6, 1])]);
  return m;
}

// ---------- оружие (ствол вдоль −Z, хват в 0; узлы Muzzle/Tip/String/Crystal/Grip2/MagSocket/Head) ----------
function gun(id, o) {
  const m = M(id, 'weapon', { hands: o.two ? 2 : 1 }), L = o.len, sg = o.seg || 8;
  m.n('body', 'root', [0, 0.04, 0], [P('box', [0.04, o.bodyH || 0.06, L * 0.55], o.col || C.metalD, [0, 0, -L * 0.2])]);
  m.add('body', P('box', [0.032, 0.11, 0.045], o.grip || C.woodD, [0, -0.07, 0.03], [-15 * D, 0, 0]), P('box', [0.012, 0.03, 0.05], C.metal, [0, -0.04, -0.02]));
  m.n('barrel', 'body', [0, 0.012, -L * 0.45], [P('cyl', [o.br || 0.012, o.br || 0.012, L * 0.55, sg], C.metal, [0, 0, -L * 0.27], [90 * D, 0, 0]), P('cyl', [(o.br || 0.012) * 1.4, (o.br || 0.012) * 1.4, 0.04, sg], C.metalD, [0, 0, -L * 0.53], [90 * D, 0, 0])]);
  m.n('Muzzle', 'barrel', [0, 0, -L * 0.56]);
  if (o.stock) m.add('body', P('box', [0.035, 0.07, o.stock], o.grip || C.wood, [0, -0.015, L * 0.05 + o.stock / 2], [8 * D, 0, 0]));
  if (o.mag) m.n('MagSocket', 'body', [0, -0.05, -L * 0.18], [P('box', [0.028, o.mag, 0.05], C.metalD, [0, -o.mag / 2, 0], [o.curve || 0, 0, 0])]);
  if (o.scope) m.add('body', P('cyl', [0.022, 0.022, 0.24, 10], C.metalD, [0, 0.07, -L * 0.15], [90 * D, 0, 0]), P('cyl', [0.026, 0.02, 0.03, 10], C.gCyan, [0, 0.07, -L * 0.15 - 0.13], [90 * D, 0, 0]));
  if (o.two) m.n('Grip2', 'body', [0, -0.03, -L * 0.42], [P('box', [0.045, 0.04, 0.14], o.grip || C.wood)]);
  if (o.glow) m.add('body', P('box', [0.042, 0.012, L * 0.4], o.glow, [0, 0.025, -L * 0.2]), P('sph', [0.02, 8, 6], o.glow, [0, 0, -L * 0.48]));
  if (o.rails) for (let i = 0; i < 4; i++) m.add('barrel', P('box', [0.07 - i * 0.006, 0.012, 0.02], o.glow || C.gCyan, [0, 0, -0.08 - i * 0.12]));
  if (o.tank) m.add('body', P('cyl', [0.035, 0.035, 0.2, 10], o.glow || C.gLava, [0, -0.06, -L * 0.3], [90 * D, 0, 0]), P('sph', [0.035, 10, 6], C.metal, [0, -0.06, -L * 0.3 - 0.1]));
  if (o.pump) m.add('barrel', P('cyl', [0.022, 0.022, 0.12, 8], C.wood, [0, -0.025, -0.12], [90 * D, 0, 0]));
  return m;
}
function wand(id, tipC, len = 0.32, bodyC = C.wood) {
  const m = M(id, 'weapon', { hands: 1 });
  m.n('shaft', 'root', [0, 0, 0], [P('cyl', [0.009, 0.016, len, 8], bodyC, [0, 0, -len / 2 + 0.06], [90 * D, 0, 0]), P('cyl', [0.02, 0.02, 0.02, 8], C.gold, [0, 0, 0.06], [90 * D, 0, 0]), P('cyl', [0.014, 0.014, 0.015, 8], C.gold, [0, 0, -len + 0.09], [90 * D, 0, 0])]);
  m.n('Tip', 'shaft', [0, 0, -len + 0.06], [P('sph', [0.022, 6, 4], tipC, [0, 0, 0], [0, 0, 0], [1, 1, 1.5])]);
  m.n('Muzzle', 'Tip', [0, 0, -0.035]);
  return m;
}
function staff(id) {
  const m = M(id, 'weapon', { hands: 2 });
  m.n('shaft', 'root', [0, 0, 0], [P('cyl', [0.016, 0.02, 1.5, 8], C.wood, [0, 0.3, 0])]);
  m.n('Grip2', 'shaft', [0, -0.25, 0]);
  m.n('Head', 'shaft', [0, 1.05, 0], [P('cyl', [0.05, 0.02, 0.08, 8], C.gold), ...[0, 1, 2, 3].map((i) => P('box', [0.012, 0.14, 0.012], C.gold, [Math.cos(i * 1.57) * 0.05, 0.08, Math.sin(i * 1.57) * 0.05], [Math.sin(i * 1.57) * 0.3, 0, -Math.cos(i * 1.57) * 0.3]))]);
  m.n('Crystal', 'Head', [0, 0.11, 0], [P('cyl', [0, 0.045, 0.09, 6], C.gCyan, [0, 0.045, 0]), P('cyl', [0.045, 0, 0.05, 6], C.gViolet, [0, -0.025, 0])]);
  m.n('Muzzle', 'Crystal', [0, 0.1, 0]);
  return m;
}
function bow(id, cross, glow) {
  const m = M(id, 'weapon', { hands: 2 });
  if (!cross) {
    m.n('grip', 'root', [0, 0, 0], [P('cyl', [0.018, 0.018, 0.12, 8], C.leather)]);
    for (const s of [1, -1]) for (let i = 0; i < 4; i++) m.add('grip', P('box', [0.02, 0.17, 0.025], i === 3 ? glow : C.woodD, [0, s * (0.08 + i * 0.15), 0.03 + i * i * 0.018], [s * (-10 - i * 9) * D, 0, 0]));
    m.n('String', 'grip', [0, 0, 0.14], [P('box', [0.003, 1.08, 0.003], C.gWhite)]);
    m.n('Muzzle', 'grip', [0, 0.02, -0.05]);
  } else {
    m.n('stock', 'root', [0, 0, 0], [P('box', [0.045, 0.05, 0.6], C.wood, [0, 0.03, -0.18]), P('box', [0.035, 0.11, 0.045], C.woodD, [0, -0.04, 0.04], [-15 * D, 0, 0])]);
    for (const s of [1, -1]) m.add('stock', P('box', [0.33, 0.025, 0.035], C.metalD, [s * 0.18, 0.05, -0.43], [0, s * 18 * D, 0]));
    m.n('String', 'stock', [0, 0.06, -0.33], [P('box', [0.62, 0.003, 0.003], C.gWhite)]);
    m.add('stock', P('cyl', [0.012, 0.012, 0.5, 6], glow, [0, 0.07, -0.25], [90 * D, 0, 0]), P('cyl', [0, 0.03, 0.08, 6], C.metal, [0, 0.07, -0.54], [-90 * D, 0, 0]));
    if (glow === C.gIce) m.add('stock', P('box', [0.06, 0.08, 0.12], C.metal, [0, 0.12, -0.1]), P('box', [0.05, 0.03, 0.1], C.gIce, [0, 0.17, -0.1]));
    m.n('Grip2', 'stock', [0, 0, -0.3]); m.n('Muzzle', 'stock', [0, 0.07, -0.6]);
  }
  return m;
}
function melee(id, kind) {
  const m = M(id, 'weapon', { hands: kind === 'hammer' ? 2 : 1 });
  if (kind === 'blade') {
    m.n('hilt', 'root', [0, 0, 0], [P('cyl', [0.017, 0.017, 0.18, 8], C.leather), P('box', [0.2, 0.03, 0.045], C.gold, [0, 0.1, 0]), P('sph', [0.028, 8, 5], C.gViolet, [0, -0.1, 0])]);
    m.add('hilt', P('cyl', [0, 0.05, 0.12, 4], C.gViolet, [0, 0.92, 0], [0, 45 * D, 0], [1, 1, 0.25]), P('box', [0.075, 0.72, 0.012], C.metal, [0, 0.5, 0]), P('box', [0.02, 0.7, 0.016], C.gViolet, [0, 0.5, 0]));
    m.n('Tip', 'hilt', [0, 0.98, 0]);
  } else if (kind === 'hammer') {
    m.n('shaft', 'root', [0, 0, 0], [P('cyl', [0.022, 0.025, 0.9, 8], C.woodD, [0, 0.3, 0]), P('cyl', [0.03, 0.03, 0.08, 8], C.leather, [0, -0.1, 0])]);
    m.n('Grip2', 'shaft', [0, 0.25, 0]);
    m.n('Head', 'shaft', [0, 0.8, 0], [P('box', [0.34, 0.18, 0.18], C.metalD), P('box', [0.36, 0.05, 0.19], C.gBolt), P('cyl', [0.1, 0.1, 0.06, 6], C.metal, [0.2, 0, 0], [0, 0, 90 * D]), P('cyl', [0.1, 0.1, 0.06, 6], C.metal, [-0.2, 0, 0], [0, 0, 90 * D])]);
  } else {
    m.n('hilt', 'root', [0, 0, 0], [P('cyl', [0.016, 0.018, 0.11, 6], C.leather), P('box', [0.09, 0.02, 0.03], C.sMudD, [0, 0.06, 0])]);
    m.n('Tip', 'hilt', [0, 0.33, 0], [P('cyl', [0, 0.035, 0.26, 4], C.gPoison, [0, -0.13, 0], [0, 0, 0], [1, 1, 0.4])]);
    m.n('hilt_L', 'root', [-0.15, 0, 0], [P('cyl', [0.016, 0.018, 0.11, 6], C.leather), P('box', [0.09, 0.02, 0.03], C.sMudD, [0, 0.06, 0])]);
    m.n('Tip_L', 'hilt_L', [0, 0.33, 0], [P('cyl', [0, 0.035, 0.26, 4], C.gPoison, [0, -0.13, 0], [0, 0, 0], [1, 1, 0.4])]);
  }
  return m;
}
function shield(id) {
  const m = M(id, 'weapon', { hands: 1 });
  m.n('plate', 'root', [0, 0, 0], [P('cyl', [0.32, 0.32, 0.04, 6], C.metal, [0, 0, -0.06], [90 * D, 0, 0]), P('cyl', [0.26, 0.26, 0.05, 6], C.gold, [0, 0, -0.07], [90 * D, 0, 0]), P('cyl', [0.08, 0.08, 0.06, 6], C.gCyan, [0, 0, -0.09], [90 * D, 0, 0]), P('box', [0.03, 0.12, 0.03], C.leather)]);
  m.n('Muzzle', 'plate', [0, 0, -0.12]);
  return m;
}
function gauntlet(id) {
  const m = M(id, 'weapon', { hands: 1 });
  m.n('cuff', 'root', [0, 0, 0], [P('cyl', [0.06, 0.055, 0.16, 8], C.metalD, [0, 0, 0.06], [90 * D, 0, 0]), P('box', [0.1, 0.06, 0.1], C.metal, [0, 0, -0.06])]);
  for (let i = 0; i < 4; i++) m.add('cuff', P('box', [0.022, 0.03, 0.05], C.gold, [-0.036 + i * 0.024, 0.01, -0.13]));
  m.n('Crystal', 'cuff', [0, 0.04, 0.02], [P('sph', [0.028, 8, 5], C.gGold)]);
  m.n('Muzzle', 'cuff', [0, 0, -0.17]);
  return m;
}
function grenade(id) {
  const m = M(id, 'weapon', { hands: 1 });
  m.n('orb', 'root', [0, 0, 0], [P('sph', [0.04, 10, 7], C.metalD), P('cyl', [0.042, 0.042, 0.012, 10], C.gCyan), P('box', [0.012, 0.03, 0.012], C.metal, [0, 0.045, 0])]);
  for (let i = 0; i < 4; i++) m.add('orb', P('box', [0.01, 0.01, 0.01], C.gViolet, [Math.cos(i * 1.57) * 0.041, 0.02, Math.sin(i * 1.57) * 0.041]));
  return m;
}
function censer(id) {
  const m = M(id, 'weapon', { hands: 1 });
  m.n('handle', 'root', [0, 0, 0], [P('cyl', [0.015, 0.015, 0.14, 6], C.woodD)]);
  for (let i = 0; i < 6; i++) m.add('handle', P('box', [0.012, 0.04, 0.012], C.metalD, [0, -0.09 - i * 0.045, 0], [0, i * 0.8, 0]));
  m.n('Head', 'handle', [0, -0.4, 0], [P('sph', [0.07, 8, 6], C.metalD, [0, 0, 0], [0, 0, 0], [1, 0.8, 1]), P('cyl', [0.072, 0.072, 0.02, 8], C.gold), P('sph', [0.04, 6, 4], C.gPoison, [0, 0.05, 0])]);
  m.n('Muzzle', 'Head', [0, 0.08, 0]);
  return m;
}
const WEAPONS = {
  w_pm: () => gun('w_pm', { len: 0.2, br: 0.01, bodyH: 0.05 }),
  w_ak74: () => gun('w_ak74', { len: 0.72, stock: 0.25, mag: 0.14, curve: 0.35, two: true }),
  w_mr133: () => gun('w_mr133', { len: 0.8, br: 0.018, stock: 0.25, two: true, pump: true, seg: 10 }),
  w_sv98: () => gun('w_sv98', { len: 1.0, br: 0.011, stock: 0.3, mag: 0.06, scope: true, two: true, col: C.fPine }),
  w_spark_wand: () => wand('w_spark_wand', C.gBolt),
  w_elemental_staff: () => staff('w_elemental_staff'),
  w_rune_bow: () => bow('w_rune_bow', false, C.gCyan),
  w_harpoon_crossbow: () => bow('w_harpoon_crossbow', true, C.metal),
  w_frost_repeater: () => bow('w_frost_repeater', true, C.gIce),
  w_soul_blade: () => melee('w_soul_blade', 'blade'),
  w_thunder_hammer: () => melee('w_thunder_hammer', 'hammer'),
  w_aegis_shield: () => shield('w_aegis_shield'),
  w_ki_gauntlet: () => gauntlet('w_ki_gauntlet'),
  w_arcane_bracer: () => { const m = bracer('w_arcane_bracer', 'weapon'); m.hands = 1; m.add('band', P('cyl', [0, 0.03, 0.1, 6], C.gViolet, [0, 0.07, 0])); m.n('Muzzle', 'band', [0, 0, -0.1]); return m; },
  w_dragon_breath: () => gun('w_dragon_breath', { len: 0.7, br: 0.03, two: true, tank: true, glow: C.gLava, col: C.vRockD, seg: 10 }),
  w_rune_grenades: () => grenade('w_rune_grenades'),
  w_swamp_censer: () => censer('w_swamp_censer'),
  w_venom_fangs: () => melee('w_venom_fangs', 'fang'),
  w_thunder_rail: () => gun('w_thunder_rail', { len: 1.0, br: 0.02, stock: 0.25, two: true, rails: true, glow: C.gBolt, scope: true, seg: 10 }),
  w_neon_blaster: () => gun('w_neon_blaster', { len: 0.32, br: 0.018, glow: C.gViolet, col: C.gWhite, bodyH: 0.07, seg: 10 }),
};
export const WEAPON_IDS = Object.keys(WEAPONS);

// ---------- мобы: архетипы с именованными узлами (жёсткие части = «кости» для процедурной анимации) ----------
function humanoid(id, o) {
  const s = o.s || 1, m = M(id, o.cat || 'mob', { rig: 'humanoid', scale: s }), lg = (o.legs || 1.6) / 1.6, hd = o.head || 1, ar = o.arm || 1;
  m.n('hips', 'root', [0, (o.float ? 0.9 : 0.8 * lg) * s, 0], [P('box', [0.3 * s * o.w, 0.15 * s, 0.2 * s], o.c2 || o.c)]);
  m.n('spine', 'hips', [0, 0.08 * s, 0], [o.round ? P('sph', [0.25 * s * o.w, 10, 7], o.c, [0, 0.2 * s, 0]) : P('box', [0.38 * s * o.w, 0.42 * s, 0.24 * s], o.c, [0, 0.2 * s, 0])]);
  m.n('head', 'spine', [0, 0.46 * s, 0], [o.boxHead ? P('box', [0.24 * s, 0.24 * s, 0.24 * s], o.hc || C.skin, [0, 0.12 * s, 0]) : P('sph', [0.15 * s * hd, 10, 7], o.hc || C.skin, [0, 0.12 * s, 0])]);
  const ez = -(o.boxHead ? 0.125 : 0.14 * hd) * s;
  m.add('head', P('box', [0.04 * s, 0.03 * s, 0.02 * s], o.eye || C.gWhite, [0.06 * s, 0.14 * s, ez]), P('box', [0.04 * s, 0.03 * s, 0.02 * s], o.eye || C.gWhite, [-0.06 * s, 0.14 * s, ez]));
  for (const [sd, x] of [['L', -1], ['R', 1]]) {
    m.n('upperarm_' + sd, 'spine', [x * 0.24 * s * o.w, 0.38 * s, 0], [P('cyl', [0.06 * s * ar, 0.05 * s * ar, 0.32 * s, 6], o.ac || o.c, [0, -0.16 * s, 0])]);
    m.n('lowerarm_' + sd, 'upperarm_' + sd, [0, -0.32 * s, 0], [P('cyl', [0.05 * s * ar, 0.045 * s * ar, 0.3 * s, 6], o.ac || o.c, [0, -0.15 * s, 0]), P('sph', [0.06 * s * ar, 6, 4], o.hand || o.hc || C.skin, [0, -0.32 * s, 0])]);
    m.n('hand_' + sd, 'lowerarm_' + sd, [0, -0.34 * s, 0]);
    if (!o.float) {
      m.n('thigh_' + sd, 'hips', [x * 0.1 * s * o.w, -0.05 * s, 0], [P('cyl', [0.075 * s, 0.06 * s, 0.4 * s * lg, 6], o.lc || o.c2 || o.c, [0, -0.2 * s * lg, 0])]);
      m.n('shin_' + sd, 'thigh_' + sd, [0, -0.4 * s * lg, 0], [P('cyl', [0.06 * s, 0.05 * s, 0.33 * s * lg, 6], o.lc || o.c2 || o.c, [0, -0.165 * s * lg, 0]), P('box', [0.1 * s, 0.06 * s, 0.16 * s], o.fc || C.leather, [0, -0.33 * s * lg, -0.03 * s])]);
    }
  }
  if (o.float) m.add('hips', P('cyl', [0.15 * s * o.w, 0, 0.6 * s, 7], o.c2 || o.c, [0, -0.3 * s, 0]));
  if (o.extra) o.extra(m, s);
  m.n('WeakPoint', o.weak || 'head', o.weakT || [0, 0.15 * s, 0]);
  return m;
}
function quadruped(id, o) {
  const s = o.s || 1, m = M(id, o.cat || 'mob', { rig: 'quadruped', scale: s }), L = o.len || 1, legH = (o.legH || 0.4) * s, sn = o.snout || 0.2;
  m.n('spine', 'root', [0, legH + 0.12 * s, 0], [P('box', [0.34 * s * (o.w || 1), 0.3 * s, 0.75 * s * L], o.c)]);
  if (o.hump) m.add('spine', P('sph', [0.22 * s, 8, 5], o.c2 || o.c, [0, 0.12 * s, -0.15 * s * L]));
  m.n('head', 'spine', [0, 0.1 * s, -0.42 * s * L], [P('box', [0.24 * s, 0.22 * s, 0.26 * s], o.c, [0, 0, -0.1 * s]), P('box', [0.14 * s, 0.12 * s, sn * s], o.c2 || o.c, [0, -0.02 * s, -(0.23 + sn / 2) * s])]);
  m.add('head', P('box', [0.04 * s, 0.035 * s, 0.02 * s], o.eye || C.gLava, [0.08 * s, 0.05 * s, -0.235 * s]), P('box', [0.04 * s, 0.035 * s, 0.02 * s], o.eye || C.gLava, [-0.08 * s, 0.05 * s, -0.235 * s]));
  if (o.ears) for (const x of [-1, 1]) m.add('head', P('cyl', [0, 0.05 * s, 0.12 * s, 4], o.c, [x * 0.08 * s, 0.15 * s, -0.05 * s]));
  if (o.tusks) for (const x of [-1, 1]) m.add('head', P('cyl', [0, 0.025 * s, 0.18 * s, 5], C.gWhite, [x * 0.08 * s, 0, -0.4 * s], [-60 * D, 0, 0]));
  if (o.spikes) for (let i = 0; i < 5; i++) m.add('spine', P('cyl', [0, 0.04 * s, 0.16 * s, 4], o.spikes, [0, 0.18 * s, (-0.3 + i * 0.15) * s * L]));
  m.n('jaw', 'head', [0, -0.09 * s, -0.15 * s], [P('box', [0.12 * s, 0.05 * s, sn * s], o.c2 || o.c, [0, 0, -sn / 2 * s])]);
  for (const [nm, x, z] of [['FL', -1, -1], ['FR', 1, -1], ['BL', -1, 1], ['BR', 1, 1]])
    m.n('leg_' + nm, 'spine', [x * 0.13 * s * (o.w || 1), -0.1 * s, z * 0.28 * s * L], [P('cyl', [0.055 * s, 0.04 * s, legH + 0.05 * s, 6], o.c2 || o.c, [0, -legH / 2, 0]), P('box', [0.08 * s, 0.04 * s, 0.1 * s], o.c2 || C.leather, [0, -legH, -0.02 * s])]);
  const tl = (o.tail || 0.35) * s;
  m.n('tail', 'spine', [0, 0.05 * s, 0.38 * s * L], [P('cyl', [0.02 * s, (o.tailR || 0.05) * s, tl, 5], o.c, [0, -tl * 0.17, tl * 0.47], [70 * D, 0, 0])]);
  if (o.extra) o.extra(m, s);
  m.n('WeakPoint', 'head', [0, 0.1 * s, -0.1 * s]);
  return m;
}
function spider(id, o) {
  const s = o.s || 1, m = M(id, o.cat || 'mob', { rig: 'spider', scale: s });
  m.n('spine', 'root', [0, 0.3 * s, 0], [P('sph', [0.18 * s, 8, 6], o.c, [0, 0, -0.05 * s], [0, 0, 0], [1, 0.7, 1.1])]);
  m.n('abdomen', 'spine', [0, 0.05 * s, 0.25 * s], [P('sph', [0.25 * s, 10, 7], o.c2 || o.c, [0, 0, 0.1 * s], [0, 0, 0], [1, 0.8, 1.2]), P('box', [0.08 * s, 0.02 * s, 0.15 * s], o.acc, [0, 0.2 * s, 0.1 * s])]);
  m.n('head', 'spine', [0, 0, -0.22 * s], [P('sph', [0.1 * s, 8, 5], o.c), P('box', [0.12 * s, 0.03 * s, 0.02 * s], o.acc, [0, 0.03 * s, -0.09 * s])]);
  if (o.claws) for (const x of [-1, 1]) m.n('claw_' + (x < 0 ? 'L' : 'R'), 'head', [x * 0.12 * s, 0, -0.05 * s], [P('box', [0.06 * s, 0.05 * s, 0.25 * s], o.c, [0, 0, -0.12 * s]), P('cyl', [0, 0.05 * s, 0.12 * s, 4], o.c2 || o.c, [x * 0.03 * s, 0, -0.28 * s], [-90 * D, 0, 0])]);
  if (o.stinger) m.n('tail', 'abdomen', [0, 0.15 * s, 0.3 * s], [P('cyl', [0.03 * s, 0.05 * s, 0.4 * s, 5], o.c2 || o.c, [0, 0.2 * s, 0], [-25 * D, 0, 0]), P('cyl', [0, 0.05 * s, 0.15 * s, 4], o.acc, [0, 0.42 * s, -0.12 * s], [-110 * D, 0, 0])]);
  const n = o.legs || 4;
  for (let i = 0; i < n; i++) for (const [sd, x] of [['L', -1], ['R', 1]]) {
    const z = (-0.15 + (i / (n - 1)) * 0.3) * s;
    m.n(`leg_${sd}${i}`, 'spine', [x * 0.12 * s, 0, z], [P('cyl', [0.02 * s, 0.025 * s, 0.32 * s, 4], o.c, [x * 0.12 * s, 0.1 * s, 0], [0, 0, x * 60 * D]), P('cyl', [0.005 * s, 0.02 * s, 0.38 * s, 4], o.c, [x * 0.3 * s, -0.08 * s, 0], [0, 0, -x * 25 * D])]);
  }
  m.n('WeakPoint', 'abdomen', [0, 0.2 * s, 0.1 * s]);
  return m;
}
function flyer(id, o) {
  const s = o.s || 1, m = M(id, o.cat || 'mob', { rig: 'flyer', scale: s, hover: o.hover || 1.5 }), sp = o.span || 1, ln = o.len || 1;
  m.n('spine', 'root', [0, (o.hover || 1.5), 0], [P('sph', [0.2 * s, 10, 7], o.c, [0, 0, 0], [0, 0, 0], [0.9, 0.9, 1.4 * ln])]);
  m.n('head', 'spine', [0, 0.12 * s, -0.3 * s * ln], [P('sph', [0.13 * s, 8, 6], o.hc || o.c), P('cyl', [0, 0.04 * s, 0.12 * s, 4], o.beak || C.gold, [0, -0.02 * s, -0.16 * s], [-90 * D, 0, 0])]);
  m.add('head', P('box', [0.04 * s, 0.04 * s, 0.02 * s], o.eye || C.gGold, [0.06 * s, 0.04 * s, -0.12 * s]), P('box', [0.04 * s, 0.04 * s, 0.02 * s], o.eye || C.gGold, [-0.06 * s, 0.04 * s, -0.12 * s]));
  for (const [sd, x] of [['L', -1], ['R', 1]]) {
    m.n('wing_' + sd, 'spine', [x * 0.15 * s, 0.08 * s, 0], [P('box', [0.5 * s * sp, 0.025 * s, 0.32 * s], o.wc || o.c, [x * 0.25 * s * sp, 0, 0])]);
    m.n('wingtip_' + sd, 'wing_' + sd, [x * 0.5 * s * sp, 0, 0], [P('cyl', [0, 0.16 * s, 0.4 * s * sp, 3], o.wc || o.c, [x * 0.2 * s * sp, 0, 0.05 * s], [0, 0, x * 90 * D], [1, 1, 0.15])]);
    if (o.talons) m.n('leg_' + sd, 'spine', [x * 0.08 * s, -0.15 * s, 0.05 * s], [P('cyl', [0.02 * s, 0.03 * s, 0.25 * s, 4], C.gold, [0, -0.12 * s, 0])]);
  }
  m.n('tail', 'spine', [0, 0, 0.28 * s * ln], [P('cyl', [0.01 * s, 0.06 * s, (o.tail || 0.3) * s, 4], o.wc || o.c, [0, 0, (o.tail || 0.3) / 2 * s], [90 * D, 0, 0], [1, 1, 0.4])]);
  if (o.extra) o.extra(m, s);
  m.n('WeakPoint', 'head', [0, 0.05 * s, 0]);
  return m;
}
function blob(id, o) {
  const s = o.s || 1, sy = o.sy || 0.8, m = M(id, o.cat || 'mob', { rig: 'blob', scale: s, hover: o.hover || 0 });
  m.n('spine', 'root', [0, (o.hover || 0) + 0.3 * s * sy, 0], [P('sph', [0.3 * s, o.seg || 12, o.rings || 8], o.c, [0, 0, 0], [0, 0, 0], [1, sy, 1])]);
  if (o.eyes !== 0) m.n('head', 'spine', [0, 0.06 * s, -0.25 * s], [P('sph', [0.06 * s, 6, 4], C.gWhite, [0.1 * s, 0, 0]), P('sph', [0.06 * s, 6, 4], C.gWhite, [-0.1 * s, 0, 0]), P('box', [0.04 * s, 0.05 * s, 0.02 * s], C.mtShadow, [0.1 * s, 0, -0.055 * s]), P('box', [0.04 * s, 0.05 * s, 0.02 * s], C.mtShadow, [-0.1 * s, 0, -0.055 * s])]);
  if (o.extra) o.extra(m, s);
  m.n('WeakPoint', 'spine', [0, 0, 0]);
  return m;
}
function swarm(id, o) {
  const m = M(id, 'mob', { rig: 'swarm', instanced: true, hover: o.hover || 1 });
  m.n('spine', 'root', [0, o.hover || 1, 0]);
  let seed = 7; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (let i = 0; i < o.count; i++) m.n('unit_' + i, 'spine', [r() * o.spread, r() * o.spread * 0.6, r() * o.spread], o.unit());
  m.n('WeakPoint', 'spine', [0, 0, 0]);
  return m;
}
const golemArms = (rc) => (m, s) => { for (const sd of ['L', 'R']) m.add('lowerarm_' + sd, P('box', [0.22 * s, 0.25 * s, 0.22 * s], rc, [0, -0.35 * s, 0])); };
const crystal = (c, h) => (m, s) => m.add('spine', P('cyl', [0, 0.07 * s, h * s, 5], c, [0.1 * s, 0.5 * s, 0.1 * s], [0.3, 0, 0.3]), P('cyl', [0, 0.06 * s, h * 0.8 * s, 5], c, [-0.12 * s, 0.45 * s, 0.05 * s], [-0.3, 0, -0.4]));
const MOBS = {
  m_meadow_slime: () => blob('m_meadow_slime', { c: C.gPoison, seg: 14, rings: 9 }),
  m_tusk_boar: () => quadruped('m_tusk_boar', { s: 1.3, c: C.leather, c2: C.woodD, hump: 1, tusks: 1, ears: 1, snout: 0.22, legH: 0.32, w: 1.3 }),
  m_wisp: () => blob('m_wisp', { s: 0.5, c: C.gLava, seg: 8, rings: 6, hover: 1.2, eyes: 0, sy: 1, extra: (m, s) => m.n('tail', 'spine', [0, 0, 0.15 * s], [P('cyl', [0, 0.2 * s, 0.5 * s, 6], C.gGold, [0, 0, 0.2 * s], [90 * D, 0, 0])]) }),
  m_goblin_slinger: () => humanoid('m_goblin_slinger', { s: 0.75, w: 0.9, c: C.leather, c2: C.woodD, hc: C.leaf, hand: C.leaf, head: 1.3, eye: C.gGold, extra: (m, s) => { for (const x of [-1, 1]) m.add('head', P('cyl', [0, 0.06 * s, 0.25 * s, 4], C.leaf, [x * 0.2 * s, 0.15 * s, 0], [0, 0, -x * 70 * D])); m.add('hand_R', P('box', [0.02 * s, 0.4 * s, 0.02 * s], C.leather, [0, -0.2 * s, 0]), P('sph', [0.04 * s, 5, 3], C.stone, [0, -0.42 * s, 0])); } }),
  m_mushroom_shaman: () => humanoid('m_mushroom_shaman', { s: 0.8, w: 0.9, c: C.gWhite, c2: C.flower, hc: C.flower, head: 0.9, eye: C.gPoison, extra: (m, s) => { m.add('head', P('sph', [0.35 * s, 12, 6], C.cloth, [0, 0.3 * s, 0], [0, 0, 0], [1, 0.55, 1]), P('sph', [0.05 * s, 6, 4], C.gWhite, [0.15 * s, 0.42 * s, -0.12 * s]), P('sph', [0.05 * s, 6, 4], C.gPoison, [-0.18 * s, 0.4 * s, 0.1 * s])); m.add('hand_R', P('cyl', [0.02 * s, 0.02 * s, 1.1 * s, 6], C.wood, [0, 0.1 * s, 0]), P('sph', [0.07 * s, 6, 4], C.gPoison, [0, 0.68 * s, 0])); } }),
  m_gold_fairy: () => flyer('m_gold_fairy', { s: 0.35, c: C.gGold, wc: C.gWhite, hover: 1.8, beak: C.gGold, span: 0.7, tail: 0.6 }),
  m_forest_wolf: () => quadruped('m_forest_wolf', { s: 1.1, c: C.fStoneD, c2: C.fStone, ears: 1, snout: 0.3, len: 1.25, w: 0.85, legH: 0.42, tail: 0.45, eye: C.gGold }),
  m_thorn_treant: () => humanoid('m_thorn_treant', { s: 1.6, w: 1.4, c: C.woodD, c2: C.wood, hc: C.woodD, hand: C.fLeaf, boxHead: 1, eye: C.fAmber, arm: 1.6, legs: 1.2, extra: (m, s) => { m.add('spine', P('sph', [0.1 * s, 6, 4], C.gGold, [0, 0.25 * s, -0.12 * s])); m.add('head', P('sph', [0.4 * s, 8, 5], C.fLeaf, [0, 0.4 * s, 0], [0, 0, 0], [1, 0.7, 1], 0.3), P('sph', [0.28 * s, 7, 4], C.fLeafD, [0.2 * s, 0.25 * s, 0.1 * s], [0, 0, 0], [1, 0.8, 1], 0.3)); for (let i = 0; i < 4; i++) m.add('spine', P('cyl', [0, 0.03 * s, 0.14 * s, 4], C.fMoss, [Math.cos(i) * 0.2 * s, 0.1 * s + i * 0.07 * s, Math.sin(i) * 0.13 * s], [0, 0, 1.2])); } }),
  m_thorn_wolf: () => quadruped('m_thorn_wolf', { s: 1.15, c: C.fLeafD, c2: C.woodD, ears: 1, snout: 0.3, len: 1.2, w: 0.85, spikes: C.fMoss, eye: C.gPoison }),
  m_weaver_spider: () => spider('m_weaver_spider', { s: 1.2, c: C.fShadow, c2: C.fPine, acc: C.gViolet }),
  m_forest_bandit: () => humanoid('m_forest_bandit', { s: 1, w: 1, c: C.fPine, c2: C.leather, hc: C.skin, extra: (m, s) => { m.add('head', P('cyl', [0.12 * s, 0.17 * s, 0.25 * s, 8], C.fLeafD, [0, 0.2 * s, 0.02 * s])); m.add('hand_R', P('box', [0.04 * s, 0.6 * s, 0.015 * s], C.metal, [0, -0.25 * s, 0])); } }),
  m_ghost_owl: () => flyer('m_ghost_owl', { s: 1, c: C.snow, wc: C.snowD, eye: C.gCyan, hover: 2.5, talons: 1, len: 0.8 }),
  m_bog_drowner: () => humanoid('m_bog_drowner', { s: 1.05, w: 1, c: C.sMoss, c2: C.sMudD, hc: C.sReed, eye: C.gPoison, extra: (m, s) => m.add('head', P('cyl', [0.17 * s, 0.05 * s, 0.4 * s, 6], C.sMoss, [0, 0, 0.08 * s], [0.3, 0, 0], [1, 1, 0.6], 0.4)) }),
  m_spitter_toad: () => blob('m_spitter_toad', { s: 1.1, c: C.sMoss, sy: 0.6, seg: 12, rings: 7, extra: (m, s) => { m.n('jaw', 'spine', [0, -0.03 * s, -0.24 * s], [P('box', [0.32 * s, 0.05 * s, 0.1 * s], C.sAcid)]); for (const x of [-1, 1]) m.n('leg_' + (x < 0 ? 'L' : 'R'), 'spine', [x * 0.25 * s, -0.12 * s, 0.1 * s], [P('box', [0.12 * s, 0.08 * s, 0.25 * s], C.sMudD)]); } }),
  m_mire_croc: () => quadruped('m_mire_croc', { s: 1.2, c: C.sMudD, c2: C.sMoss, snout: 0.5, len: 2.0, legH: 0.12, w: 1.1, tail: 0.9, tailR: 0.12, spikes: C.sStoneD, eye: C.sAcid }),
  m_mosquito_cloud: () => swarm('m_mosquito_cloud', { count: 12, spread: 1.4, hover: 1.3, unit: () => [P('sph', [0.04, 4, 3], C.sShadow, [0, 0, 0], [0, 0, 0], [1, 1, 2]), P('box', [0.14, 0.005, 0.04], C.gWhite), P('box', [0.008, 0.008, 0.06], C.gLava, [0, 0, -0.07])] }),
  m_bog_hag: () => humanoid('m_bog_hag', { s: 0.95, w: 1, c: C.sShadow, c2: C.sMudD, hc: C.sReed, eye: C.gViolet, head: 1.1, extra: (m, s) => { m.add('head', P('cyl', [0, 0.22 * s, 0.5 * s, 7], C.sShadow, [0, 0.35 * s, 0.05 * s], [0.25, 0, 0]), P('cyl', [0, 0.03 * s, 0.1 * s, 4], C.sReed, [0, 0.1 * s, -0.17 * s], [-80 * D, 0, 0])); m.add('hand_R', P('cyl', [0.015 * s, 0.02 * s, 1.0 * s, 5], C.woodD, [0, 0.1 * s, 0]), P('sph', [0.06 * s, 6, 4], C.gViolet, [0, 0.62 * s, 0])); } }),
  m_frost_wolf: () => quadruped('m_frost_wolf', { s: 1.2, c: C.snow, c2: C.snowD, ears: 1, snout: 0.3, len: 1.25, w: 0.9, eye: C.gCyan, spikes: C.gIce }),
  m_yeti: () => humanoid('m_yeti', { s: 1.7, w: 1.5, c: C.snow, c2: C.snowD, hc: C.snowD, round: 1, arm: 1.7, legs: 1.1, eye: C.gCyan, extra: (m, s) => { for (const x of [-1, 1]) m.add('head', P('cyl', [0, 0.04 * s, 0.18 * s, 5], C.rockD, [x * 0.12 * s, 0.25 * s, 0], [0, 0, -x * 0.5])); } }),
  m_ice_wraith: () => humanoid('m_ice_wraith', { s: 1.1, w: 0.8, float: 1, c: C.iceBlue, c2: C.gIce, hc: C.gIce, eye: C.gCyan, extra: crystal(C.gIce, 0.3) }),
  m_kobold_icecaller: () => humanoid('m_kobold_icecaller', { s: 0.7, w: 0.9, c: C.rockD, c2: C.leather, hc: C.rock, head: 1.2, eye: C.gIce, extra: (m, s) => { m.add('head', P('box', [0.12 * s, 0.1 * s, 0.2 * s], C.rock, [0, 0.07 * s, -0.17 * s])); m.add('hand_R', P('cyl', [0.02 * s, 0.02 * s, 0.9 * s, 5], C.wood, [0, 0.05 * s, 0]), P('cyl', [0, 0.06 * s, 0.2 * s, 5], C.gIce, [0, 0.6 * s, 0])); } }),
  m_stone_guardian: () => humanoid('m_stone_guardian', { s: 1.8, w: 1.5, c: C.rock, c2: C.rockD, hc: C.rock, hand: C.rockD, boxHead: 1, eye: C.gCyan, arm: 1.5, legs: 1.2, extra: golemArms(C.rockD) }),
  m_harpy: () => flyer('m_harpy', { s: 1.1, c: C.skin, hc: C.skin, wc: C.rock, beak: C.skin, eye: C.gViolet, hover: 2.5, talons: 1, span: 1.2 }),
  m_sand_scorpion: () => spider('m_sand_scorpion', { s: 1.3, c: C.sandD, c2: C.sandstoneD, acc: C.gPoison, claws: 1, stinger: 1, legs: 3 }),
  m_scarab_swarm: () => swarm('m_scarab_swarm', { count: 10, spread: 1.1, hover: 0.25, unit: () => [P('sph', [0.07, 6, 4], C.turq, [0, 0, 0], [0, 0, 0], [1, 0.6, 1.3]), P('box', [0.1, 0.01, 0.02], C.dShadow, [0, -0.02, 0])] }),
  m_cursed_skull: () => blob('m_cursed_skull', { s: 0.6, c: C.sandstone, sy: 1, seg: 10, rings: 7, hover: 1.5, eyes: 0, extra: (m, s) => { m.add('spine', P('box', [0.22 * s, 0.15 * s, 0.2 * s], C.sandstone, [0, -0.25 * s, -0.1 * s]), P('box', [0.09 * s, 0.09 * s, 0.03 * s], C.gViolet, [0.1 * s, 0.03 * s, -0.29 * s]), P('box', [0.09 * s, 0.09 * s, 0.03 * s], C.gViolet, [-0.1 * s, 0.03 * s, -0.29 * s])); m.n('jaw', 'spine', [0, -0.32 * s, -0.12 * s], [P('box', [0.2 * s, 0.06 * s, 0.16 * s], C.sandstoneD)]); } }),
  m_flying_eye: () => blob('m_flying_eye', { s: 0.7, c: C.pink, sy: 1, seg: 12, rings: 8, hover: 2, eyes: 0, extra: (m, s) => { m.n('head', 'spine', [0, 0, -0.27 * s], [P('sph', [0.15 * s, 10, 6], C.gWhite, [0, 0, 0], [0, 0, 0], [1, 1, 0.4]), P('cyl', [0.07 * s, 0.07 * s, 0.03 * s, 8], C.gLava, [0, 0, -0.06 * s], [90 * D, 0, 0])]); for (let i = 0; i < 4; i++) m.n('tentacle_' + i, 'spine', [Math.cos(i * 1.57) * 0.15 * s, -0.2 * s, Math.sin(i * 1.57) * 0.15 * s], [P('cyl', [0.04 * s, 0.01 * s, 0.4 * s, 4], C.pink, [0, -0.2 * s, 0])]); } }),
  m_obsidian_priest: () => humanoid('m_obsidian_priest', { s: 1.05, w: 0.9, c: C.obsidian, c2: C.vShadow, hc: C.basalt, eye: C.gLava, extra: (m, s) => { m.add('head', P('cyl', [0, 0.2 * s, 0.45 * s, 6], C.obsidian, [0, 0.25 * s, 0])); m.add('spine', P('cyl', [0.25 * s, 0.25 * s, 0.03 * s, 8], C.gLava, [0, 0.42 * s, 0.15 * s], [90 * D, 0, 0])); m.add('hand_R', P('cyl', [0.02 * s, 0.02 * s, 1.2 * s, 5], C.basalt, [0, 0.1 * s, 0]), P('cyl', [0, 0.07 * s, 0.25 * s, 5], C.gLava, [0, 0.8 * s, 0])); } }),
  m_magma_imp: () => humanoid('m_magma_imp', { s: 0.6, w: 1, c: C.magma, c2: C.vRockD, hc: C.magma, round: 1, head: 1.3, eye: C.gBolt, extra: (m, s) => { for (const x of [-1, 1]) m.add('head', P('cyl', [0, 0.04 * s, 0.15 * s, 4], C.vShadow, [x * 0.12 * s, 0.3 * s, 0], [0, 0, -x * 0.4])); m.add('hips', P('cyl', [0.01 * s, 0.03 * s, 0.4 * s, 4], C.magma, [0, 0, 0.25 * s], [70 * D, 0, 0])); } }),
  m_lava_golem: () => humanoid('m_lava_golem', { s: 1.9, w: 1.6, c: C.basalt, c2: C.vRockD, hc: C.basalt, hand: C.gLava, boxHead: 1, eye: C.gLava, arm: 1.6, legs: 1.1, extra: (m, s) => { golemArms(C.basalt)(m, s); m.add('spine', P('box', [0.39 * s, 0.08 * s, 0.25 * s], C.gLava, [0, 0.2 * s, 0]), P('box', [0.08 * s, 0.43 * s, 0.25 * s], C.gLava, [0, 0.2 * s, 0])); } }),
  m_flame_djinn: () => humanoid('m_flame_djinn', { s: 1.2, w: 1.1, float: 1, c: C.gLava, c2: C.magma, hc: C.gLava, eye: C.gWhite, extra: (m, s) => m.add('head', P('cyl', [0, 0.12 * s, 0.35 * s, 6], C.gGold, [0, 0.3 * s, 0])) }),
  m_salamander: () => quadruped('m_salamander', { s: 0.9, c: C.magma, c2: C.vShadow, snout: 0.25, len: 1.6, legH: 0.15, w: 0.8, tail: 0.8, tailR: 0.08, spikes: C.gLava, eye: C.gBolt }),
  m_ash_wyvern: () => flyer('m_ash_wyvern', { s: 1.6, c: C.ashD, hc: C.vRock, wc: C.ash, beak: C.vShadow, eye: C.gLava, hover: 3, span: 1.6, len: 1.5, tail: 0.9, talons: 1 }),
};
export const MOB_IDS = Object.keys(MOBS);

// ---------- боссы ----------
function hydra() {
  const s = 3, m = M('boss_hydra_tinara', 'boss', { rig: 'hydra', scale: s });
  m.n('spine', 'root', [0, 0.5 * s, 0], [P('sph', [0.6 * s, 14, 9], C.sMoss, [0, 0, 0], [0, 0, 0], [1.2, 0.6, 1.5]), P('box', [0.9 * s, 0.2 * s, 0.5 * s], C.metalD, [0, -0.15 * s, 0.3 * s]), P('cyl', [0.12 * s, 0.12 * s, 0.3 * s, 8], C.metal, [0, 0.1 * s, 0.6 * s])]);
  for (let h = 0; h < 3; h++) {
    let par = 'spine';
    for (let k = 0; k < 5; k++) { const nm = `neck_${h}_${k}`; m.n(nm, par, k === 0 ? [(h - 1) * 0.35 * s, 0.2 * s, -0.5 * s] : [0, 0.22 * s, -0.08 * s], [P('cyl', [(0.09 - k * 0.008) * s, (0.11 - k * 0.008) * s, 0.24 * s, 8], k % 2 ? C.sMoss : C.sReed, [0, 0.11 * s, 0], [-0.3, 0, 0])]); par = nm; }
    m.n('head_' + h, par, [0, 0.25 * s, -0.1 * s], [P('box', [0.22 * s, 0.16 * s, 0.32 * s], C.sMoss, [0, 0, -0.12 * s]), P('box', [0.05 * s, 0.03 * s, 0.02 * s], C.gPoison, [0.07 * s, 0.05 * s, -0.285 * s]), P('box', [0.05 * s, 0.03 * s, 0.02 * s], C.gPoison, [-0.07 * s, 0.05 * s, -0.285 * s]), ...[0, 1, 2].map((i) => P('cyl', [0, 0.04 * s, 0.15 * s, 4], C.sStoneD, [(i - 1) * 0.06 * s, 0.12 * s, 0], [0.4, 0, 0]))]);
    m.n('jaw_' + h, 'head_' + h, [0, -0.08 * s, -0.05 * s], [P('box', [0.18 * s, 0.05 * s, 0.26 * s], C.sReed, [0, 0, -0.12 * s])]);
  }
  m.n('tail', 'spine', [0, 0, 0.8 * s], [P('cyl', [0.03 * s, 0.25 * s, 1.0 * s, 8], C.sMoss, [0, -0.1 * s, 0.4 * s], [80 * D, 0, 0])]);
  for (let i = 0; i < 4; i++) m.n('leg_' + i, 'spine', [(i % 2 ? 1 : -1) * 0.55 * s, -0.15 * s, (i < 2 ? -0.4 : 0.4) * s], [P('cyl', [0.12 * s, 0.09 * s, 0.4 * s, 6], C.sMudD, [0, -0.15 * s, 0])]);
  m.n('WeakPoint', 'head_1', [0, 0.1 * s, -0.1 * s]);
  return m;
}
function ignarok() {
  const s = 4, q = quadruped('boss_ignarok', { cat: 'boss', s, c: C.vRockD, c2: C.obsidian, snout: 0.4, len: 1.8, legH: 0.6, w: 1.2, tail: 1.6, tailR: 0.12, spikes: C.gLava, eye: C.gBolt });
  for (const [sd, x] of [['L', -1], ['R', 1]]) {
    q.n('wing_' + sd, 'spine', [x * 0.2 * s, 0.15 * s, -0.2 * s], [P('box', [1.0 * s, 0.03 * s, 0.6 * s], C.ashD, [x * 0.5 * s, 0, 0.1 * s]), P('cyl', [0.03 * s, 0.03 * s, 1.0 * s, 5], C.obsidian, [x * 0.5 * s, 0.02 * s, -0.2 * s], [0, 0, 90 * D])]);
    q.n('wingtip_' + sd, 'wing_' + sd, [x * 1.0 * s, 0, 0], [P('cyl', [0, 0.4 * s, 0.8 * s, 3], C.magma, [x * 0.35 * s, 0, 0.15 * s], [0, 0, x * 90 * D], [1, 1, 0.1])]);
  }
  for (const x of [-1, 1]) q.add('head', P('cyl', [0, 0.05 * s, 0.35 * s, 5], C.basalt, [x * 0.1 * s, 0.2 * s, 0.05 * s], [0.7, 0, -x * 0.3]));
  q.add('spine', P('sph', [0.15 * s, 10, 6], C.gLava, [0, -0.1 * s, -0.25 * s], [0, 0, 0], [1, 0.7, 1]));
  const wp = q.nodes.find((n) => n.name === 'WeakPoint'); wp.parent = q.nodes.findIndex((n) => n.name === 'spine'); wp.t = [0, -0.15 * s, -0.25 * s];
  return q;
}
const BOSSES = {
  boss_slime_king: () => blob('boss_slime_king', { cat: 'boss', s: 4, c: C.gPoison, seg: 24, rings: 14, extra: (m, s) => { m.n('crown', 'spine', [0, 0.25 * s, 0], [P('cyl', [0.12 * s, 0.1 * s, 0.07 * s, 10], C.gold), P('sph', [0.02 * s, 6, 4], C.gCyan, [0, 0.03 * s, -0.12 * s])]); for (let i = 0; i < 5; i++) m.add('crown', P('cyl', [0, 0.025 * s, 0.08 * s, 4], C.gold, [Math.cos(i * 1.256) * 0.11 * s, 0.07 * s, Math.sin(i * 1.256) * 0.11 * s])); for (let i = 0; i < 8; i++) m.add('spine', P('sph', [0.04 * s, 6, 4], C.leaf, [Math.cos(i * 0.785) * 0.2 * s, -0.05 * s + (i % 3) * 0.04 * s, Math.sin(i * 0.785) * 0.2 * s])); } }),
  boss_rotroot: () => humanoid('boss_rotroot', { cat: 'boss', s: 3.2, w: 1.6, c: C.woodD, c2: C.fShadow, hc: C.woodD, hand: C.fMoss, boxHead: 1, eye: C.gPoison, arm: 1.8, legs: 1.0, weak: 'spine', weakT: [0, 0.8, -0.48], extra: (m, s) => { m.add('spine', P('sph', [0.1 * s, 8, 6], C.gPoison, [0, 0.25 * s, -0.13 * s])); m.add('head', P('sph', [0.5 * s, 12, 7], C.fLeafD, [0, 0.45 * s, 0], [0, 0, 0], [1.2, 0.7, 1.2], 0.3), P('sph', [0.3 * s, 10, 6], C.sMoss, [0.3 * s, 0.3 * s, 0.1 * s], [0, 0, 0], [1, 0.8, 1], 0.3)); for (let i = 0; i < 8; i++) { const a = i * 0.785; m.n('root_' + i, 'hips', [Math.cos(a) * 0.25 * s, -0.1 * s, Math.sin(a) * 0.25 * s], [P('cyl', [0.05 * s, 0.01 * s, 0.6 * s, 5], C.woodD, [Math.cos(a) * 0.2 * s, -0.12 * s, Math.sin(a) * 0.2 * s], [Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1])]); } for (let i = 0; i < 10; i++) m.add('spine', P('cyl', [0, 0.03 * s, 0.15 * s, 4], C.fMoss, [Math.cos(i * 2.4) * 0.2 * s, 0.05 * s + i * 0.04 * s, Math.sin(i * 2.4) * 0.12 * s], [0, i, 1.3])); } }),
  boss_hydra_tinara: hydra,
  boss_ymir: () => humanoid('boss_ymir', { cat: 'boss', s: 4, w: 1.4, c: C.iceBlue, c2: C.snowD, hc: C.snow, ac: C.snowD, hand: C.gIce, eye: C.gCyan, arm: 1.5, legs: 1.3, extra: (m, s) => { crystal(C.gIce, 0.35)(m, s); m.add('head', P('cyl', [0.12 * s, 0.17 * s, 0.1 * s, 8], C.rockD, [0, 0.27 * s, 0]), P('sph', [0.15 * s, 8, 5], C.snow, [0, 0, -0.06 * s], [0, 0, 0], [1.1, 1, 0.8]), ...[0, 1, 2, 3, 4].map((i) => P('cyl', [0, 0.03 * s, 0.18 * s, 4], C.gIce, [Math.cos(i * 1.256) * 0.13 * s, 0.38 * s, Math.sin(i * 1.256) * 0.13 * s]))); m.add('hand_R', P('cyl', [0.05 * s, 0.05 * s, 1.5 * s, 8], C.rockD, [0, 0.2 * s, 0]), P('box', [0.5 * s, 0.25 * s, 0.25 * s], C.gIce, [0, 0.95 * s, 0])); for (const sd of ['L', 'R']) m.add('upperarm_' + sd, P('sph', [0.13 * s, 8, 5], C.iceBlue)); } }),
  boss_akhmaret: () => humanoid('boss_akhmaret', { cat: 'boss', s: 3, w: 1.1, float: 1, c: C.sandstone, c2: C.turq, hc: C.gold, ac: C.sandstoneD, hand: C.gold, eye: C.turq, extra: (m, s) => { m.add('head', P('box', [0.42 * s, 0.35 * s, 0.1 * s], C.turq, [0, 0.05 * s, 0.08 * s]), P('box', [0.4 * s, 0.06 * s, 0.11 * s], C.gold, [0, 0.12 * s, 0.09 * s]), P('cyl', [0, 0.04 * s, 0.12 * s, 4], C.gold, [0, 0.35 * s, -0.1 * s])); m.n('halo', 'spine', [0, 0.55 * s, 0.25 * s], [P('cyl', [0.4 * s, 0.4 * s, 0.03 * s, 16], C.gGold, [0, 0, 0], [90 * D, 0, 0])]); for (let i = 0; i < 6; i++) m.n('orb_' + i, 'halo', [Math.cos(i * 1.047) * 0.45 * s, Math.sin(i * 1.047) * 0.45 * s, 0], [P('sph', [0.05 * s, 6, 4], C.gCyan)]); m.add('hand_R', P('cyl', [0.02 * s, 0.02 * s, 1.0 * s, 6], C.gold, [0, 0.1 * s, 0]), P('cyl', [0.08 * s, 0.08 * s, 0.03 * s, 8], C.gCyan, [0, 0.62 * s, 0], [90 * D, 0, 0])); } }),
  boss_ignarok: ignarok,
};
export const BOSS_IDS = Object.keys(BOSSES);

// ---------- пропсы ----------
function tree(id, o) {
  const m = M(id, 'prop', { wind: true, biome: o.biome }), h = o.h || 4, tw = o.tw || 1, r = o.r || 1;
  m.n('trunk', 'root', [0, 0, 0], [P('cyl', [0.12 * tw, 0.2 * tw, h * 0.6, 6], o.bark || C.wood, [0, h * 0.3, 0], [0, 0, o.lean || 0])]);
  if (o.kind === 'pine') for (let i = 0; i < 3; i++) m.add('trunk', P('cyl', [0, (1.4 - i * 0.35) * r, h * 0.35, 7], i % 2 ? o.leaf2 : o.leaf, [0, h * (0.35 + i * 0.2), 0], [0, i * 0.4, 0], [1, 1, 1], 0.3));
  else if (o.kind === 'palm') { m.add('trunk', P('cyl', [0.1, 0.12, h * 0.4, 6], o.bark, [0.25, h * 0.72, 0], [0, 0, -0.2])); for (let i = 0; i < 6; i++) m.add('trunk', P('box', [0.3, 0.04, 1.6], i % 2 ? o.leaf2 : o.leaf, [0.35 + Math.cos(i * 1.047) * 0.7, h * 0.9, Math.sin(i * 1.047) * 0.7], [0.35, -i * 1.047 + Math.PI / 2, 0], [1, 1, 1], 0.6)); }
  else if (o.kind === 'dead') { for (let i = 0; i < 4; i++) m.add('trunk', P('cyl', [0.02, 0.08, 1.2, 4], o.bark, [Math.cos(i * 1.57) * 0.4, h * 0.6 + i * 0.1, Math.sin(i * 1.57) * 0.4], [Math.sin(i * 1.57) * 0.7, 0, -Math.cos(i * 1.57) * 0.7])); m.add('trunk', P('box', [0.1, 0.5, 0.05], C.gLava, [0, h * 0.3, -0.18])); }
  else { m.add('trunk', P('sph', [1.3 * r, 9, 6], o.leaf, [0, h * 0.75, 0], [0, 0, 0], [1, 0.8, 1], 0.3), P('sph', [0.9 * r, 8, 5], o.leaf2, [0.7, h * 0.62, 0.3], [0, 0, 0], [1, 0.8, 1], 0.3), P('sph', [0.8 * r, 8, 5], o.leaf2, [-0.6, h * 0.66, -0.4], [0, 0, 0], [1, 0.8, 1], 0.3)); if (o.hang) for (let i = 0; i < 6; i++) m.add('trunk', P('box', [0.06, 1.4, 0.06], o.hang, [Math.cos(i * 1.047) * 1.1, h * 0.5, Math.sin(i * 1.047) * 1.1], [0, 0, 0], [1, 1, 1], 1)); }
  return m;
}
function simple(id, build, extra = {}) { const m = M(id, 'prop', extra); build(m); return m; }
const ring = (n, r, f) => Array.from({ length: n }, (_, i) => f(Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r, i));
const PROPS = {
  p_tree_meadow_oak: () => tree('p_tree_meadow_oak', { biome: 'meadow', h: 4.5, leaf: C.leaf, leaf2: C.grass, bark: C.wood }),
  p_tree_forest_pine: () => tree('p_tree_forest_pine', { biome: 'forest', kind: 'pine', h: 7, leaf: C.fPine, leaf2: C.fLeafD, bark: C.woodD }),
  p_tree_swamp_willow: () => tree('p_tree_swamp_willow', { biome: 'swamp', h: 4, leaf: C.sMoss, leaf2: C.sReed, bark: C.sMudD, lean: 0.1, tw: 1.4, hang: C.sMoss }),
  p_tree_mountain_fir: () => tree('p_tree_mountain_fir', { biome: 'mountains', kind: 'pine', h: 6, leaf: C.mPine, leaf2: C.snow, bark: C.woodD, r: 0.9 }),
  p_tree_desert_palm: () => tree('p_tree_desert_palm', { biome: 'desert_ruins', kind: 'palm', h: 5, leaf: C.palm, leaf2: C.palmD, bark: C.sandD, lean: -0.15, tw: 0.8 }),
  p_tree_volcano_dead: () => tree('p_tree_volcano_dead', { biome: 'volcano', kind: 'dead', h: 3.5, bark: C.obsidian }),
  p_bush: () => simple('p_bush', (m) => m.n('body', 'root', [0, 0.4, 0], [P('sph', [0.6, 8, 5], C.leaf, [0, 0, 0], [0, 0, 0], [1, 0.7, 1], 0.5), P('sph', [0.4, 7, 4], C.grass, [0.4, -0.1, 0.2], [0, 0, 0], [1, 0.7, 1], 0.5), P('sph', [0.08, 5, 3], C.pink, [0.2, 0.35, -0.3])]), { wind: true }),
  p_mushroom_giant: () => simple('p_mushroom_giant', (m) => m.n('body', 'root', [0, 0, 0], [P('cyl', [0.15, 0.22, 1.4, 7], C.gWhite, [0, 0.7, 0]), P('sph', [0.9, 10, 5], C.cloth, [0, 1.45, 0], [0, 0, 0], [1, 0.45, 1]), P('sph', [0.12, 5, 3], C.gWhite, [0.4, 1.75, 0.2]), P('sph', [0.1, 5, 3], C.gWhite, [-0.3, 1.77, -0.3])])),
  p_rock_small: () => simple('p_rock_small', (m) => m.n('body', 'root', [0, 0.25, 0], [P('rock', [0.45, 7, 5, 3], C.stone)])),
  p_rock_big: () => simple('p_rock_big', (m) => m.n('body', 'root', [0, 0.9, 0], [P('rock', [1.4, 9, 6, 11], C.stoneD), P('rock', [0.7, 7, 5, 5], C.stone, [1.1, -0.4, 0.5])])),
  p_crystal_cluster: () => simple('p_crystal_cluster', (m) => m.n('body', 'root', [0, 0, 0], [P('rock', [0.4, 6, 4, 2], C.rockD, [0, 0.05, 0]), P('cyl', [0, 0.18, 1.2, 6], C.gCyan, [0, 0.6, 0]), ...ring(4, 0.28, (x, z, i) => P('cyl', [0, 0.12, 0.8 - i * 0.1, 6], i % 2 ? C.gViolet : C.gCyan, [x, 0.35, z], [z * 1.4, 0, -x * 1.4]))])),
  p_chest_common: () => simple('p_chest_common', (m) => { m.n('base', 'root', [0, 0, 0], [P('box', [0.8, 0.45, 0.5], C.wood, [0, 0.225, 0]), P('box', [0.82, 0.06, 0.52], C.metalD, [0, 0.1, 0])]); m.n('lid', 'base', [0, 0.45, 0.25], [P('cyl', [0.25, 0.25, 0.8, 6], C.wood, [0, 0, -0.25], [0, 0, 90 * D], [1, 1, 1]), P('box', [0.1, 0.12, 0.04], C.gold, [0, 0, -0.52])]); m.n('LootSocket', 'base', [0, 0.5, 0]); }, { interactive: true }),
  p_chest_rare: () => simple('p_chest_rare', (m) => { m.n('base', 'root', [0, 0, 0], [P('box', [0.9, 0.5, 0.55], C.cloth, [0, 0.25, 0]), P('box', [0.92, 0.07, 0.57], C.gold, [0, 0.12, 0]), P('box', [0.08, 0.5, 0.57], C.gold, [0.4, 0.25, 0]), P('box', [0.08, 0.5, 0.57], C.gold, [-0.4, 0.25, 0])]); m.n('lid', 'base', [0, 0.5, 0.275], [P('cyl', [0.28, 0.28, 0.9, 8], C.cloth, [0, 0, -0.275], [0, 0, 90 * D]), P('sph', [0.07, 6, 4], C.gViolet, [0, 0.05, -0.58])]); m.n('LootSocket', 'base', [0, 0.55, 0]); }, { interactive: true }),
  p_shrine: () => simple('p_shrine', (m) => { m.n('base', 'root', [0, 0, 0], [P('cyl', [1.0, 1.2, 0.3, 8], C.stone, [0, 0.15, 0]), P('cyl', [0.7, 0.8, 0.25, 8], C.stoneD, [0, 0.42, 0]), ...ring(4, 0.85, (x, z) => P('box', [0.18, 1.8, 0.18], C.stone, [x, 1.0, z])), P('cyl', [0, 1.3, 0.6, 4], C.cloth, [0, 2.2, 0])]); m.n('Crystal', 'base', [0, 1.1, 0], [P('cyl', [0, 0.15, 0.4, 6], C.gCyan, [0, 0.2, 0]), P('cyl', [0.15, 0, 0.25, 6], C.gCyan, [0, -0.12, 0])]); }, { interactive: true }),
  p_campfire: () => simple('p_campfire', (m) => { m.n('base', 'root', [0, 0, 0], [...ring(8, 0.55, (x, z, i) => P('rock', [0.14, 5, 4, i + 1], C.stoneD, [x, 0.08, z])), ...[0, 1, 2].map((i) => P('cyl', [0.06, 0.06, 0.9, 6], C.woodD, [0, 0.15, 0], [0, i * 1.05, 70 * D]))]); m.n('Flame', 'base', [0, 0.25, 0], [P('cyl', [0, 0.25, 0.6, 6], C.gLava, [0, 0.2, 0]), P('cyl', [0, 0.14, 0.45, 5], C.gBolt, [0, 0.22, 0], [0, 0.5, 0])]); }, { interactive: true }),
  p_portal: () => simple('p_portal', (m) => { m.n('frame', 'root', [0, 0, 0], [P('box', [3, 0.3, 1], C.rockD, [0, 0.15, 0]), P('box', [0.4, 3.2, 0.5], C.rock, [-1.2, 1.9, 0]), P('box', [0.4, 3.2, 0.5], C.rock, [1.2, 1.9, 0]), P('box', [3.0, 0.4, 0.6], C.rock, [0, 3.6, 0]), P('cyl', [0, 0.25, 0.4, 4], C.gViolet, [0, 4.0, 0])]); m.n('Surface', 'frame', [0, 1.9, 0], [P('cyl', [1.0, 1.0, 0.05, 16], C.gViolet, [0, 0, 0], [90 * D, 0, 0], [1, 1, 1.5]), P('cyl', [0.6, 0.6, 0.06, 12], C.gCyan, [0, 0, 0], [90 * D, 0, 0], [1, 1, 1.5])]); }, { interactive: true }),
  p_watchtower: () => simple('p_watchtower', (m) => { m.n('body', 'root', [0, 0, 0], [...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => P('box', [0.2, 6, 0.2], C.woodD, [x, 3, z])), P('box', [2.6, 0.2, 2.6], C.wood, [0, 5.0, 0]), P('box', [2.6, 0.8, 0.1], C.wood, [0, 5.5, -1.25]), P('box', [2.6, 0.8, 0.1], C.wood, [0, 5.5, 1.25]), P('box', [0.1, 0.8, 2.6], C.wood, [-1.25, 5.5, 0]), P('box', [0.1, 0.8, 2.6], C.wood, [1.25, 5.5, 0]), P('cyl', [0, 2.2, 1.4, 4], C.cloth, [0, 6.6, 0], [0, 0.785, 0]), P('box', [0.1, 5.2, 0.1], C.woodD, [0.6, 2.5, 1.4], [0.25, 0, 0])]); m.n('Beacon', 'body', [0, 7.5, 0], [P('sph', [0.2, 6, 4], C.gGold)]); }),
  p_ruin_wall: () => simple('p_ruin_wall', (m) => m.n('body', 'root', [0, 0, 0], [P('box', [4, 2.4, 0.6], C.sandstone, [0, 1.2, 0]), P('box', [1.5, 1.0, 0.62], C.sandstoneD, [-1.2, 2.9, 0]), P('box', [0.8, 0.5, 0.62], C.sandstone, [0.2, 2.65, 0]), P('box', [0.7, 0.4, 0.5], C.sandstoneD, [1.2, 0.2, 0.7], [0.1, 0.4, 0.1]), P('box', [0.5, 0.5, 0.05], C.turq, [0.6, 1.4, -0.32])])),
  p_ruin_pillar: () => simple('p_ruin_pillar', (m) => m.n('body', 'root', [0, 0, 0], [P('box', [1, 0.3, 1], C.sandstoneD, [0, 0.15, 0]), P('cyl', [0.35, 0.38, 3.2, 8], C.sandstone, [0, 1.9, 0]), P('box', [0.9, 0.3, 0.9], C.sandstoneD, [0, 3.6, 0], [0, 0.2, 0.08]), P('cyl', [0.35, 0.35, 1.2, 8], C.sandstone, [1.2, 0.35, 0.3], [0, 0.5, 90 * D])])),
  p_ruin_arch: () => simple('p_ruin_arch', (m) => m.n('body', 'root', [0, 0, 0], [P('box', [0.8, 3.5, 0.8], C.stone, [-1.6, 1.75, 0]), P('box', [0.8, 3.0, 0.8], C.stoneD, [1.6, 1.5, 0]), ...[0, 1, 2, 3, 4].map((i) => P('box', [0.9, 0.5, 0.8], i % 2 ? C.stone : C.stoneD, [-Math.cos(i * 0.785) * 1.6, 3.4 + Math.sin(i * 0.785) * 0.9, 0], [0, 0, Math.PI / 2 - i * 0.785]))])),
  p_obelisk: () => simple('p_obelisk', (m) => { m.n('body', 'root', [0, 0, 0], [P('box', [1.4, 0.4, 1.4], C.basalt, [0, 0.2, 0]), P('cyl', [0.3, 0.5, 4, 4], C.obsidian, [0, 2.4, 0], [0, 0.785, 0]), P('cyl', [0, 0.3, 0.6, 4], C.obsidian, [0, 4.7, 0], [0, 0.785, 0])]); m.n('Rune', 'body', [0, 2.4, -0.36], [P('box', [0.1, 0.6, 0.03], C.gLava), P('box', [0.4, 0.08, 0.03], C.gLava, [0, 0.1, 0])]); }),
  p_fence: () => simple('p_fence', (m) => m.n('body', 'root', [0, 0, 0], [P('box', [0.12, 1.1, 0.12], C.woodD, [-1, 0.55, 0]), P('box', [0.12, 1.1, 0.12], C.woodD, [1, 0.55, 0]), P('box', [2.2, 0.12, 0.06], C.wood, [0, 0.8, 0]), P('box', [2.2, 0.12, 0.06], C.wood, [0, 0.4, 0], [0, 0, 0.05])])),
  p_signpost: () => simple('p_signpost', (m) => m.n('body', 'root', [0, 0, 0], [P('cyl', [0.06, 0.07, 2, 6], C.woodD, [0, 1, 0]), P('box', [0.8, 0.22, 0.05], C.wood, [0.3, 1.7, 0], [0, 0, 0.05]), P('box', [0.7, 0.2, 0.05], C.wood, [-0.25, 1.35, 0], [0, 0.3, -0.05])])),
  p_lava_vent: () => simple('p_lava_vent', (m) => { m.n('body', 'root', [0, 0, 0], [P('cyl', [0.6, 1.4, 0.8, 8], C.vRockD, [0, 0.4, 0]), P('cyl', [0.5, 0.5, 0.05, 8], C.gLava, [0, 0.8, 0])]); m.n('Emitter', 'body', [0, 0.85, 0]); }),
  p_ice_spike: () => simple('p_ice_spike', (m) => m.n('body', 'root', [0, 0, 0], [P('cyl', [0, 0.4, 2.2, 5], C.gIce, [0, 1.1, 0]), P('cyl', [0, 0.25, 1.3, 5], C.iceBlue, [0.4, 0.6, 0.1], [0, 0, -0.3]), P('cyl', [0, 0.2, 1.0, 5], C.gIce, [-0.3, 0.45, -0.2], [0.3, 0, 0.3])])),
  p_reeds: () => simple('p_reeds', (m) => m.n('body', 'root', [0, 0, 0], [...ring(7, 0.3, (x, z, i) => P('box', [0.04, 1.2 + (i % 3) * 0.3, 0.04], i % 2 ? C.sReed : C.sMoss, [x, 0.6 + (i % 3) * 0.15, z], [z * 0.4, 0, -x * 0.4], [1, 1, 1], 1)), P('cyl', [0.05, 0.05, 0.2, 5], C.woodD, [0.3, 1.5, 0], [0, 0, -0.12], [1, 1, 1], 1)]), { wind: true }),
  p_cactus: () => simple('p_cactus', (m) => m.n('body', 'root', [0, 0, 0], [P('cyl', [0.25, 0.3, 2.4, 8], C.palm, [0, 1.2, 0]), P('cyl', [0.15, 0.15, 0.8, 6], C.palmD, [0.5, 1.3, 0]), P('box', [0.35, 0.15, 0.15], C.palmD, [0.3, 0.95, 0]), P('sph', [0.12, 6, 3], C.pink, [0, 2.45, 0])])),
  p_waystone: () => simple('p_waystone', (m) => { m.n('body', 'root', [0, 0, 0], [P('cyl', [0.8, 0.9, 0.25, 6], C.rockD, [0, 0.12, 0]), P('box', [0.5, 1.6, 0.35], C.rock, [0, 1.0, 0], [0, 0, 0.05])]); m.n('Rune', 'body', [0, 1.1, -0.19], [P('cyl', [0.15, 0.15, 0.02, 8], C.gCyan, [0, 0, 0], [90 * D, 0, 0])]); }, { interactive: true }),
};
export const PROP_IDS = Object.keys(PROPS);
const PLAYER = { player_hand_L: () => hand('L'), player_hand_R: () => hand('R'), player_bracer: () => bracer() };
export const PLAYER_IDS = Object.keys(PLAYER);
const ALL = { ...PLAYER, ...WEAPONS, ...MOBS, ...BOSSES, ...PROPS };
export const MODEL_IDS = Object.keys(ALL);
// Бюджеты треугольников LOD0 (дизайн п. 1.5.1/5.1): руки 1500, оружие ≤4000, мобы ≤3000, боссы ≤8000, пропсы ≤1200 (деревья 300–600)
export const BUDGET = { player: 1500, weapon: 4000, mob: 3000, boss: 8000, prop: 1200 };

// ---------- сборка в сырые массивы (детерминированно, с кешем) ----------
const _cache = new Map();
export function buildModelData(id) {
  if (_cache.has(id)) return _cache.get(id);
  const f = ALL[id]; if (!f) throw new Error('procedural-models: unknown id ' + id);
  const m = f();
  const world = [];
  m.nodes.forEach((n, i) => { const p = n.parent >= 0 ? world[n.parent] : [0, 0, 0]; world[i] = [p[0] + n.t[0], p[1] + n.t[1], p[2] + n.t[2]]; });
  let minY = Infinity, maxY = -Infinity;
  const raw = m.nodes.map((n, i) => {
    const tris = [];
    for (const pt of n.parts) for (const t of PRIMS[pt.prim](...pt.args)) tris.push({ v: t.map((v) => { const r = rotV([v[0] * pt.scl[0], v[1] * pt.scl[1], v[2] * pt.scl[2]], pt.rot); return [r[0] + pt.pos[0], r[1] + pt.pos[1], r[2] + pt.pos[2]]; }), c: pt.c, w: pt.wind });
    for (const t of tris) for (const v of t.v) { const y = v[1] + world[i][1]; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    return tris;
  });
  const hY = Math.max(1e-3, maxY - minY), bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity];
  let triCount = 0;
  const nodes = m.nodes.map((n, i) => {
    const tris = raw[i], N = tris.length * 3, pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), col = new Float32Array(N * 4), uv = new Float32Array(N * 2);
    let k = 0;
    for (const t of tris) {
      const [a, b, c] = t.v, ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const rgb = hex(t.c), [u, w] = paletteUV(t.c);
      for (const v of t.v) {
        pos[k * 3] = v[0]; pos[k * 3 + 1] = v[1]; pos[k * 3 + 2] = v[2]; nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz; uv[k * 2] = u; uv[k * 2 + 1] = w;
        const hgt = Math.min(1, Math.max(0, (v[1] + world[i][1] - minY) / hY));
        const ao = isGlow(t.c) ? 1 : (0.62 + 0.38 * hgt) * (0.88 + 0.12 * Math.max(0, ny));
        col[k * 4] = rgb[0] * ao; col[k * 4 + 1] = rgb[1] * ao; col[k * 4 + 2] = rgb[2] * ao; col[k * 4 + 3] = t.w ? t.w * hgt : 0;
        for (let d = 0; d < 3; d++) { const g = v[d] + world[i][d]; if (g < bmin[d]) bmin[d] = g; if (g > bmax[d]) bmax[d] = g; }
        k++;
      }
    }
    triCount += tris.length;
    return { name: i === 0 ? m.id : n.name, parent: n.parent, t: n.t, position: pos, normal: nor, color: col, uv, tris: tris.length };
  });
  const meta = {}; for (const key of Object.keys(m)) if (!['nodes', 'n', 'add'].includes(key)) meta[key] = m[key];
  const out = { ...meta, id, nodes, triCount, bbox: [bmin, bmax], budget: BUDGET[m.cat] };
  _cache.set(id, out);
  return out;
}
export const MODEL_STATS = () => MODEL_IDS.map((id) => { const d = buildModelData(id); return { id, cat: d.cat, tris: d.triCount, nodes: d.nodes.length, budget: d.budget, size: d.bbox[1].map((v, i) => +(v - d.bbox[0][i]).toFixed(2)) }; });

// ---------- Three.js runtime (THREE передаётся параметром: модуль не импортирует three и работает в Node) ----------
let _mat = null; const _geo = new Map();
export function getToonMaterial(THREE) {
  if (_mat) return _mat;
  // 3-ступенчатый тун; ряд 7 палитры (glow) светится за счёт emissive через vertex color в onBeforeCompile.
  const g = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]), 3, 1);
  g.minFilter = g.magFilter = THREE.NearestFilter; g.needsUpdate = true;
  _mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: g });
  _mat.name = 'palette';
  return _mat;
}
function geomFrom(THREE, n) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(n.position, 3)); g.setAttribute('normal', new THREE.BufferAttribute(n.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(n.color, 4)); g.setAttribute('uv', new THREE.BufferAttribute(n.uv, 2));
  g.computeBoundingSphere(); return g;
}
/** createModel(THREE, id, {material, castShadow}) -> THREE.Group; root.name = id, дочерние узлы по именам (root.userData.nodes). Геометрия кешируется и шарится между экземплярами. */
export function createModel(THREE, id, opts = {}) {
  const d = buildModelData(id), mat = opts.material || getToonMaterial(THREE);
  const objs = d.nodes.map((n, i) => {
    const o = new THREE.Group();
    if (n.tris) { const key = id + '/' + i; if (!_geo.has(key)) _geo.set(key, geomFrom(THREE, n)); const mesh = new THREE.Mesh(_geo.get(key), mat); mesh.name = n.name + '_mesh'; mesh.castShadow = !!opts.castShadow; o.add(mesh); }
    o.name = n.name; o.position.fromArray(n.t); return o;
  });
  d.nodes.forEach((n, i) => { if (i > 0) objs[n.parent].add(objs[i]); });
  const root = objs[0];
  root.userData = { modelId: id, cat: d.cat, rig: d.rig || null, tris: d.triCount, hover: d.hover || 0, nodes: Object.fromEntries(objs.map((o) => [o.name, o])) };
  for (const o of objs) o.userData.rest = { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() };
  return root;
}
/** Одна слитая BufferGeometry (для InstancedMesh деревьев/камней/роёв). */
export function createMergedGeometry(THREE, id) {
  const d = buildModelData(id), world = [];
  d.nodes.forEach((n, i) => { const p = n.parent >= 0 ? world[n.parent] : [0, 0, 0]; world[i] = [p[0] + n.t[0], p[1] + n.t[1], p[2] + n.t[2]]; });
  const T = d.triCount * 3, pos = new Float32Array(T * 3), nor = new Float32Array(T * 3), col = new Float32Array(T * 4), uv = new Float32Array(T * 2); let o = 0;
  d.nodes.forEach((n, i) => { const c = n.tris * 3; for (let k = 0; k < c; k++) for (let a = 0; a < 3; a++) pos[(o + k) * 3 + a] = n.position[k * 3 + a] + world[i][a]; nor.set(n.normal, o * 3); col.set(n.color, o * 4); uv.set(n.uv, o * 2); o += c; });
  return geomFrom(THREE, { position: pos, normal: nor, color: col, uv });
}
/** Процедурная анимация по именам узлов. clip: idle|walk|run|alert|attack_a|attack_b|special|hit|stagger|death|spawn; t — сек от начала клипа; k — сила. */
export function animate(root, clip, t, k = 1) {
  const u = root.userData, N = u.nodes;
  for (const o of Object.values(N)) { const r = o.userData.rest; o.position.copy(r.p); o.rotation.copy(r.r); o.scale.copy(r.s); }
  const sp = clip === 'run' ? 2 : clip === 'walk' ? 1 : 0, ph = t * Math.PI * 2 * (sp ? 1.3 * sp : 0.4), sw = Math.sin(ph) * 0.6 * (sp ? 1 : 0) * k;
  const R = (n, ax, v) => { if (N[n]) N[n].rotation[ax] += v; };
  switch (u.rig) {
    case 'humanoid': R('thigh_L', 'x', sw); R('thigh_R', 'x', -sw); R('shin_L', 'x', Math.max(0, -sw)); R('shin_R', 'x', Math.max(0, sw)); R('upperarm_L', 'x', -sw * 0.7); R('upperarm_R', 'x', sw * 0.7); R('spine', 'x', Math.sin(t * 2.5) * 0.03); if (u.hover !== undefined && !N.thigh_L && N.hips) N.hips.position.y += Math.sin(t * 2) * 0.08; break;
    case 'quadruped': R('leg_FL', 'x', sw); R('leg_BR', 'x', sw); R('leg_FR', 'x', -sw); R('leg_BL', 'x', -sw); R('tail', 'y', Math.sin(t * 4) * 0.3); R('jaw', 'x', 0.05 + 0.05 * Math.sin(t * 3)); R('wing_L', 'z', Math.sin(t * 2) * 0.3); R('wing_R', 'z', -Math.sin(t * 2) * 0.3); break;
    case 'spider': for (const n in N) if (n.startsWith('leg_')) N[n].rotation.y += Math.sin(ph + +n.slice(-1) * 1.3 + (n[4] === 'L' ? 0 : Math.PI)) * 0.3 * (sp || 0.2); R('tail', 'x', Math.sin(t * 2) * 0.1); break;
    case 'flyer': R('wing_L', 'z', Math.sin(t * 9) * 0.6); R('wing_R', 'z', -Math.sin(t * 9) * 0.6); R('wingtip_L', 'z', Math.sin(t * 9 - 0.6) * 0.4); R('wingtip_R', 'z', -Math.sin(t * 9 - 0.6) * 0.4); if (N.spine) N.spine.position.y += Math.sin(t * 2) * 0.08; break;
    case 'blob': if (N.spine) { const q = Math.sin(t * (sp ? 8 : 3)) * 0.12; N.spine.scale.set(1 - q * 0.5, 1 + q, 1 - q * 0.5); if (u.hover) N.spine.position.y += Math.sin(t * 2) * 0.1; } break;
    case 'hydra': for (let h = 0; h < 3; h++) for (let i = 0; i < 5; i++) R(`neck_${h}_${i}`, 'x', Math.sin(t * 1.5 + h * 2 + i * 0.5) * 0.08); break;
    case 'swarm': for (const n in N) if (n.startsWith('unit_')) { const i = +n.slice(5); N[n].position.x += Math.sin(t * 3 + i) * 0.2; N[n].position.y += Math.cos(t * 4 + i * 2) * 0.15; } break;
  }
  const a = Math.min(1, t / (clip === 'attack_b' || clip === 'special' ? 1.4 : 0.6)), s = Math.sin(a * Math.PI) * k;
  if (clip === 'attack_a' || clip === 'attack_b' || clip === 'special') { R('upperarm_R', 'x', -2.2 * s); R('lowerarm_R', 'x', -0.6 * s); R('head', 'x', 0.3 * s); R('jaw', 'x', 0.6 * s); R('spine', 'x', -0.15 * s); for (let h = 0; h < 3; h++) { R(`neck_${h}_0`, 'x', -0.6 * s); R(`jaw_${h}`, 'x', 0.5 * s); } }
  if (clip === 'alert') R('head', 'x', -0.3 * Math.sin(Math.min(1, t / 0.6) * Math.PI));
  if (clip === 'hit' || clip === 'stagger') R('spine', 'x', 0.25 * Math.sin(Math.min(1, t / (clip === 'hit' ? 0.25 : 1)) * Math.PI));
  if (clip === 'death') { const dd = Math.min(1, t / 1.0); root.children.forEach((c) => { c.rotation.z += dd * 1.5; c.position.y *= 1 - dd * 0.7; }); }
  root.scale.setScalar(clip === 'spawn' ? 0.01 + 0.99 * Math.min(1, t / 0.8) : 1);
}

