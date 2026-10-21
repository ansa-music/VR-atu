// js/world/buildings.js — кит процедурных зданий открытого мира (I): казахские юрты, киіз үй, базар, стены,
// башни, мавзолеи, шаңырақ-святилища, лагеря, руины, мосты, врата этажей.
// Модуль ЧИСТЫЙ (без import 'three'): структуры пишут «детали» (примитивы) и коллайдеры в Builder,
// а bakeMeshes(THREE, ...) сливает детали в 1–2 меша на POI с vertex colors (1 draw call на POI и LOD-уровень).

export const KZ_PAL = Object.freeze({
  felt: '#efe6d2', felt2: '#e2d6bc', red: '#b23a2e', blue: '#2b5fa8', gold: '#e2b23c', wood: '#8a5a33', dark: '#3a2a1e',
  stone: '#b9ad95', stone2: '#8f8572', ochre: '#c8a060', turq: '#2fb8b0', tile: '#1f8fa0', ash: '#4a4440', glow: '#7fe8ff', fire: '#ff8a2a', seal: '#b06aff',
});
const P = KZ_PAL;

/** Детерминированный RNG (mulberry32) из строки. */
export function rngFrom(str) {
  let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return () => { h |= 0; h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Оценка треугольников примитива (совпадает с геометриями three при тех же сегментах). */
export function triEstimate(p) {
  const a = p.a;
  switch (p.k) {
    case 'box': return 12;
    case 'cyl': return (a[3] || 8) * 4;               // бок 2n + крышки 2n
    case 'cone': return (a[2] || 8) * 2;
    case 'sph': return (a[1] || 8) * (a[2] || 6) * 2;
    case 'dome': return (a[1] || 10) * (a[2] || 4) * 2;
    case 'torus': return (a[2] || 6) * (a[3] || 12) * 2;
    case 'plane': return 2;
    default: return 12;
  }
}

/**
 * Builder в локальных координатах POI (origin = центр POI на земле, y0 = heightAt(центра)).
 * hAt(x,z) — мировая высота; детали ставятся на землю под «якорем» структуры.
 * Деталь: {k, a, p:[x,y,z], ry, rx, rz, c, e(emissive 0/1), lod(0 — всегда, 1 — только вблизи), tag}
 * Коллайдер: [x, y, z, s, tag] в МИРОВЫХ координатах, формат деревьев рантайма (радиус игрока = 0.3*s + 0.3).
 * Платформа: {x, z, r, y, tag} — круглая проходимая поверхность (крыша башни, настил моста).
 */
export class Builder {
  constructor(ox, oz, hAt) { this.ox = ox; this.oz = oz; this.hAt = hAt || (() => 0); this.y0 = this.hAt(ox, oz); this.parts = []; this.colliders = []; this.platforms = []; this.triggers = []; this.tris = [0, 0]; }
  ground(lx, lz) { return this.hAt(this.ox + lx, this.oz + lz) - this.y0; }
  /** Локальный фрейм структуры: позиция (lx,lz) и поворот ry; y — на земле под якорем (или явный y). */
  frame(lx, lz, ry = 0, y = null) {
    const B = this, gy = y == null ? B.ground(lx, lz) : y, c = Math.cos(ry), s = Math.sin(ry);
    const tx = (x, z) => [lx + x * c + z * s, lz - x * s + z * c];
    return {
      ry, y: gy,
      add(k, a, x, yy, z, col, o = {}) { const [px, pz] = tx(x, z); const part = { k, a, p: [px, gy + yy, pz], ry: ry + (o.ry || 0), rx: o.rx || 0, rz: o.rz || 0, c: col, e: o.e ? 1 : 0, lod: o.lod ?? 0, tag: o.tag || null }; B.parts.push(part); const t = triEstimate(part); B.tris[0] += t; if (part.lod === 0) B.tris[1] += t; return part; },
      col(x, z, R, tag) { const [px, pz] = tx(x, z); B.colliders.push([B.ox + px, B.y0 + gy, B.oz + pz, R / 0.3, tag || null]); },
      plat(x, z, r, yy, tag) { const [px, pz] = tx(x, z); B.platforms.push({ x: B.ox + px, z: B.oz + pz, r, y: B.y0 + gy + yy, tag: tag || null }); },
      trig(kind, x, z, r, data = {}, yy = 0) { const [px, pz] = tx(x, z); B.triggers.push({ kind, x: B.ox + px, z: B.oz + pz, r, y: B.y0 + gy + yy, ...data }); },
      wpos(x, z) { const [px, pz] = tx(x, z); return [B.ox + px, B.oz + pz]; },
    };
  }
}

// ---------------- структуры ----------------
/** Юрта (киіз үй малый): войлочные стены, купол-кереге, красный пояс, шаңырақ-корона, синяя дверь. */
export function yurt(b, x, z, ry = 0, r = 3, o = {}) {
  const f = b.frame(x, z, ry), wh = r * 0.62;
  f.add('cyl', [r, r, wh, 12], 0, wh / 2, 0, o.felt || P.felt);
  f.add('cyl', [r * 1.01, r * 1.01, wh * 0.16, 12], 0, wh * 0.82, 0, o.band || P.red, { lod: 1 });
  f.add('cyl', [r * 0.22, r * 1.06, r * 0.5, 12], 0, wh + r * 0.25, 0, o.roof || P.felt2);
  f.add('torus', [r * 0.22, r * 0.05, 4, 10], 0, wh + r * 0.5, 0, P.gold, { rx: Math.PI / 2, lod: 1 });
  f.add('box', [r * 0.42, wh * 0.8, 0.12], 0, wh * 0.4, r * 0.98, o.door || P.blue);
  f.add('box', [r * 0.5, 0.1, 0.16], 0, wh * 0.84, r * 0.99, P.gold, { lod: 1 });
  f.col(0, 0, r * 0.95);
  return f;
}
/** Большой киіз үй (ордa хана): двойной ярус, орнаментный пояс, флаги-туги. */
export function kiyizUy(b, x, z, ry = 0, r = 6.5) {
  const f = yurt(b, x, z, ry, r, { band: P.blue, door: P.red });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; f.add('box', [0.5, 0.5, 0.06], Math.sin(a) * r * 1.02, r * 0.45, Math.cos(a) * r * 1.02, P.gold, { ry: a, lod: 1 }); }
  for (const s of [-1, 1]) { f.add('cyl', [0.08, 0.1, 6, 5], s * (r * 0.5), 3, r + 1.2, P.wood, { lod: 1 }); f.add('box', [0.05, 1.1, 1.6], s * (r * 0.5), 5.2, r + 1.2 + 0.8, s < 0 ? P.turq : P.red, { lod: 1 }); }
  return f;
}
/** Торговая лавка базара: 4 стойки, полосатый навес, прилавок, товар. */
export function stall(b, x, z, ry = 0, rng = Math.random) {
  const f = b.frame(x, z, ry), cols = [P.red, P.blue, P.turq, P.ochre], c1 = cols[(rng() * 4) | 0];
  for (const [sx, sz] of [[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.9], [1.3, 0.9]]) f.add('cyl', [0.07, 0.07, 2.4, 5], sx, 1.2, sz, P.wood, { lod: 1 });
  f.add('box', [3, 0.12, 2.2], 0, 2.45, 0, c1, { rx: 0.12 }); f.add('box', [1, 0.13, 2.22], 0, 2.47, 0, P.felt, { rx: 0.12, lod: 1 });
  f.add('box', [2.6, 0.9, 0.6], 0, 0.45, -0.6, P.wood);
  for (let i = 0; i < 3; i++) f.add('sph', [0.22, 6, 4], -0.8 + i * 0.8, 1.05, -0.6, [P.fire, P.gold, '#7a3'][i], { lod: 1 });
  f.col(0, -0.6, 1.0); f.col(-1, -0.6, 0.6); f.col(1, -0.6, 0.6);
  return f;
}
/** Отрезок крепостной стены (саманный кирпич/камень) от (x1,z1) до (x2,z2), с зубцами вблизи. */
export function wall(b, x1, z1, x2, z2, h = 3.2, col = P.ochre) {
  const L = Math.hypot(x2 - x1, z2 - z1), ry = Math.atan2(x2 - x1, z2 - z1), mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
  const f = b.frame(mx, mz, ry, Math.min(b.ground(x1, z1), b.ground(x2, z2), b.ground(mx, mz)));
  f.add('box', [1.1, h + 1.5, L + 0.3], 0, (h - 1.5) / 2, 0, col);
  const n = Math.max(1, Math.floor(L / 2.2)); for (let i = 0; i < n; i++) f.add('box', [1.2, 0.6, 0.9], 0, h + 0.3, -L / 2 + (i + 0.5) * L / n, col, { lod: 1 });
  f.add('box', [1.16, 0.22, L + 0.3], 0, h - 0.6, 0, P.turq, { lod: 1 });
  const m = Math.ceil(L / 1.4); for (let i = 0; i <= m; i++) f.col(0, -L / 2 + i * L / m, 0.75, 'wall');
  return f;
}
/** Ворота города: две круглые башни-бастиона и арка с орнаментом. Проход шириной 5 м открыт. */
export function townGate(b, x, z, ry = 0) {
  const f = b.frame(x, z, ry);
  for (const s of [-1, 1]) { f.add('cyl', [1.6, 1.9, 6.5, 10], s * 4, 3.25, 0, P.ochre); f.add('cone', [2.1, 2, 10], s * 4, 7.5, 0, P.tile); f.col(s * 4, 0, 1.9); }
  f.add('box', [6.4, 1.2, 1.4], 0, 5.6, 0, P.ochre); f.add('box', [6.6, 0.3, 1.5], 0, 6.3, 0, P.turq, { lod: 1 });
  f.add('torus', [1.4, 0.18, 4, 10, Math.PI], 0, 6.4, 0.75, P.gold, { lod: 1 });
  return f;
}
/** Сторожевая башня (кумбез-маяк): лазать — лифт-шахта внутри, наверху платформа и шаңырақ быстрого перемещения. */
export function tower(b, x, z, ry = 0, h = 22, poiId = '') {
  const f = b.frame(x, z, ry), R = 3.2;
  f.add('cyl', [R * 0.85, R, h, 12], 0, h / 2, 0, P.stone);
  for (let i = 1; i < 4; i++) f.add('cyl', [R * (1 - i * 0.04) + 0.06, R * (1 - i * 0.04) + 0.06, 0.5, 12], 0, h * i / 4, 0, P.turq, { lod: 1 });
  f.add('box', [1.6, 2.6, 0.3], 0, 1.3, R * 0.98, P.dark);
  f.add('cyl', [4.4, 4.0, 0.8, 14], 0, h + 0.4, 0, P.stone2);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; f.add('box', [0.7, 0.9, 0.5], Math.sin(a) * 4.1, h + 1.25, Math.cos(a) * 4.1, P.stone2, { ry: a, lod: 1 }); }
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; f.add('cyl', [0.15, 0.15, 3.2, 5], Math.sin(a) * 3.3, h + 2.4, Math.cos(a) * 3.3, P.wood, { lod: 1 }); }
  f.add('cone', [4.6, 2.2, 12], 0, h + 5, 0, P.tile);
  f.add('sph', [0.6, 8, 6], 0, h + 6.6, 0, P.glow, { e: 1 });
  f.add('cyl', [0.9, 0.9, h, 8, true], 0, h / 2, 0, P.glow, { e: 1, lod: 1, tag: 'lift' }); // световая шахта лифта
  f.add('torus', [1.0, 0.1, 4, 16], 2.3, h + 0.9, 0, P.gold, { rx: Math.PI / 2, e: 1, tag: 'portal' });
  // стены: кольцо коллайдеров с проёмом двери (+z локально)
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.3) continue; f.col(Math.sin(a) * R, Math.cos(a) * R, 0.7, 'tower'); }
  f.plat(0, 0, 4.3, h + 0.8, 'tower_top');
  f.trig('lift_up', 0, 0, 1.1, { top: f.y + b.y0 + h + 0.8, poi: poiId });
  f.trig('lift_down', 0, 0, 1.1, { bottom: f.y + b.y0, poi: poiId }, h + 0.8);
  f.trig('fast_travel', 2.3, 0, 1.0, { poi: poiId }, h + 0.8);
  return f;
}
/** Мавзолей-подземелье (в духе Айша-биби/Ходжи Ахмеда Ясави): портал-пештак, барабан, бирюзовый купол, 4 минарета. */
export function mausoleum(b, x, z, ry = 0, s = 1, poiId = '') {
  const f = b.frame(x, z, ry), W = 8 * s;
  f.add('box', [W, 5 * s, W], 0, 2.5 * s, 0, P.ochre);
  f.add('box', [W * 0.62, 7 * s, 1.2 * s], 0, 3.5 * s, W / 2 + 0.4 * s, P.ochre);             // пештак
  f.add('box', [W * 0.3, 4 * s, 0.3], 0, 2 * s, W / 2 + 1.05 * s, P.dark, { tag: 'door' });
  f.add('box', [W * 0.64, 0.4 * s, 1.3 * s], 0, 6.6 * s, W / 2 + 0.4 * s, P.turq, { lod: 1 });
  f.add('cyl', [W * 0.36, W * 0.4, 1.6 * s, 14], 0, 5.8 * s, 0, P.tile);
  f.add('dome', [W * 0.38, 14, 5], 0, 6.6 * s, 0, P.turq);
  f.add('cyl', [0.12, 0.12, 1.6 * s, 4], 0, 6.6 * s + W * 0.38 + 0.6 * s, 0, P.gold, { lod: 1 });
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { f.add('cyl', [0.5 * s, 0.7 * s, 7 * s, 8], cx * W / 2, 3.5 * s, cz * W / 2, P.ochre, { lod: 1 }); f.add('cone', [0.7 * s, 1.2 * s, 8], cx * W / 2, 7.6 * s, cz * W / 2, P.tile, { lod: 1 }); }
  f.add('plane', [W * 0.26, 3.6 * s], 0, 1.9 * s, W / 2 + 1.25 * s, P.seal, { e: 1, tag: 'door_glow' });
  for (let i = 0; i <= 8; i++) { const t = -W / 2 + i * W / 8; f.col(t, -W / 2, 0.8 * s); f.col(-W / 2, t, 0.8 * s); f.col(W / 2, t, 0.8 * s); if (Math.abs(t) > W * 0.2) f.col(t, W / 2 + 0.4 * s, 0.8 * s); }
  f.trig('dungeon_enter', 0, W / 2 + 1.6 * s, 1.4 * s, { poi: poiId });
  return f;
}
/** Вход в пещеру: каменная арка из валунов + тёмный провал. */
export function caveMouth(b, x, z, ry = 0, poiId = '') {
  const f = b.frame(x, z, ry);
  for (const s of [-1, 1]) { f.add('sph', [2.6, 7, 5], s * 3.2, 1.6, 0, P.stone2); f.col(s * 3.2, 0, 2.4); }
  f.add('box', [9, 2.2, 3.6], 0, 4.6, 0, P.stone2, { rz: 0.05 }); f.add('sph', [3.4, 7, 5], 0, 2, -3, P.stone2);
  f.add('plane', [3.6, 3.4], 0, 1.7, 0.6, '#140c18', { tag: 'cave_dark' }); f.col(0, -3, 3);
  f.trig('dungeon_enter', 0, 1.8, 1.4, { poi: poiId });
  return f;
}
/** Святилище-шаңырақ: каменный подиум, 4 столба, парящий шаңырақ с уықами, сияние в центре. */
export function shanyrakShrine(b, x, z, ry = 0, poiId = '') {
  const f = b.frame(x, z, ry);
  f.add('cyl', [4.2, 4.6, 0.5, 16], 0, 0.25, 0, P.stone); f.add('cyl', [4.25, 4.25, 0.1, 16], 0, 0.52, 0, P.turq, { lod: 1 });
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; f.add('cyl', [0.22, 0.26, 4.2, 6], Math.sin(a) * 3.4, 2.6, Math.cos(a) * 3.4, P.wood); f.col(Math.sin(a) * 3.4, Math.cos(a) * 3.4, 0.35); }
  f.add('torus', [1.8, 0.16, 5, 18], 0, 4.8, 0, P.gold, { rx: Math.PI / 2 });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI; f.add('box', [3.4, 0.09, 0.09], 0, 4.8, 0, P.wood, { ry: a, lod: 1 }); }
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; f.add('box', [0.12, 0.12, Math.hypot(1.6, 1.6) + 0.2], Math.sin(a) * 2.6, 4.75, Math.cos(a) * 2.6, P.red, { ry: a, lod: 1 }); }
  f.add('sph', [0.55, 8, 6], 0, 2.4, 0, P.glow, { e: 1 }); f.add('cyl', [0.6, 1.4, 0.06, 16, true], 0, 0.58, 0, P.glow, { e: 1, lod: 1 });
  f.plat(0, 0, 4.2, 0.5, 'shrine');
  f.trig('shrine', 0, 0, 2, { poi: poiId }, 0.5);
  return f;
}
/** Вражеский лагерь: частокол с 2 проходами, шатры, тотем, костёр. Коллайдеры частокола для игрока и мобов. */
export function enemyCamp(b, x, z, ry = 0, R = 11, rng = Math.random, theme = P.red) {
  const f = b.frame(x, z, ry), n = Math.round(R * 2 * Math.PI / 0.9);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, ca = Math.cos(a); if (Math.abs(ca) > 0.97) continue; // проходы с севера и юга
    const h = 2.6 + rng() * 0.8, px = Math.sin(a) * R, pz = Math.cos(a) * R;
    f.add('cyl', [0.22, 0.26, h, 5], px, h / 2, pz, P.wood, { lod: i % 3 ? 1 : 0 }); f.add('cone', [0.24, 0.5, 5], px, h + 0.25, pz, P.wood, { lod: 1 });
    if (i % 2 === 0) f.col(px, pz, 0.55, 'palisade');
  }
  const tents = 3 + ((rng() * 2) | 0);
  for (let i = 0; i < tents; i++) { const a = (i + 0.5) / tents * Math.PI * 2 + 0.4, tr = R * 0.58, tx = Math.sin(a) * tr, tz = Math.cos(a) * tr;
    f.add('cone', [2, 2.8, 6], tx, 1.4, tz, i % 2 ? theme : P.dark); f.add('box', [0.06, 1.2, 0.9], tx, 2.6, tz, theme, { lod: 1 }); f.col(tx, tz, 1.8); }
  f.add('cyl', [0.3, 0.35, 4.5, 6], R * 0.2, 2.25, -R * 0.15, P.dark); f.add('box', [1.6, 0.25, 0.25], R * 0.2, 3.9, -R * 0.15, P.dark, { lod: 1 });
  f.add('sph', [0.35, 6, 4], R * 0.2, 4.8, -R * 0.15, '#e8e0d0', { lod: 1 }); f.col(R * 0.2, -R * 0.15, 0.4);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; f.add('box', [0.5, 0.3, 0.4], Math.sin(a) * 0.9, 0.15, Math.cos(a) * 0.9, P.stone2, { lod: 1 }); }
  f.add('cone', [0.6, 1.2, 6], 0, 0.6, 0, P.fire, { e: 1 });
  f.trig('camp', 0, 0, R, {});
  return f;
}
/** Руины: обломки колонн, упавшие блоки, кусок арки и балбал-статуи. */
export function ruins(b, x, z, ry = 0, R = 12, rng = Math.random) {
  const f = b.frame(x, z, ry);
  for (let i = 0; i < 7; i++) { const a = rng() * Math.PI * 2, r = R * (0.3 + rng() * 0.6), px = Math.sin(a) * r, pz = Math.cos(a) * r, h = 1 + rng() * 5;
    f.add('cyl', [0.6, 0.7, h, 8], px, h / 2, pz, P.stone, { rz: (rng() - 0.5) * 0.2 }); if (h > 3) f.add('box', [1.6, 0.4, 1.6], px, h + 0.2, pz, P.stone2, { lod: 1 }); f.col(px, pz, 0.75); }
  for (let i = 0; i < 5; i++) { const a = rng() * Math.PI * 2, r = R * rng() * 0.8; f.add('box', [1.2 + rng(), 0.8, 0.9], Math.sin(a) * r, 0.35, Math.cos(a) * r, P.stone2, { ry: rng() * 3, lod: i > 2 ? 1 : 0 }); }
  f.add('box', [1, 6, 1], -3, 3, 0, P.stone); f.add('box', [1, 6, 1], 3, 3, 0, P.stone); f.add('box', [7, 1, 1.1], 0, 6.4, 0, P.stone, { rz: 0.08 }); f.col(-3, 0, 0.8); f.col(3, 0, 0.8);
  for (let i = 0; i < 3; i++) balbal(b, f.wpos(-R * 0.5 + i * R * 0.5, -R * 0.6), rng);
  return f;
}
/** Балбал — каменная тюркская стела-изваяние (не враг, памятник). */
export function balbal(b, [wx, wz], rng = Math.random) {
  const lx = wx - b.ox, lz = wz - b.oz, f = b.frame(lx, lz, rng() * 6.28);
  f.add('box', [0.8, 2.2, 0.5], 0, 1.1, 0, P.stone2); f.add('sph', [0.42, 7, 5], 0, 2.5, 0, P.stone2); f.add('box', [0.5, 0.08, 0.1], 0, 1.4, 0.26, P.stone, { lod: 1 });
  f.col(0, 0, 0.55); return f;
}
/** Мост: настил из досок по прямой (x1,z1)→(x2,z2) на высоте deckY (локальная), перила, опоры. Платформы-круги вдоль. */
export function bridge(b, x1, z1, x2, z2, deckY) {
  const L = Math.hypot(x2 - x1, z2 - z1), ry = Math.atan2(x2 - x1, z2 - z1), f = b.frame((x1 + x2) / 2, (z1 + z2) / 2, ry, deckY);
  f.add('box', [3.4, 0.35, L + 2], 0, 0, 0, P.wood);
  for (const s of [-1, 1]) { f.add('box', [0.12, 0.12, L + 2], s * 1.6, 1.0, 0, P.red, { lod: 1 }); const n = Math.ceil(L / 3); for (let i = 0; i <= n; i++) { const t = -L / 2 + i * L / n; f.add('cyl', [0.09, 0.09, 1, 4], s * 1.6, 0.5, t, P.wood, { lod: 1 }); if (i % 2 === 0) f.add('cyl', [0.25, 0.25, 6, 5], s * 1.5, -3, t, P.dark, { lod: 1 }); } }
  const m = Math.ceil(L / 2.4); for (let i = 0; i <= m; i++) f.plat(0, -L / 2 + i * L / m, 1.9, 0.18, 'bridge');
  return f;
}
/** Врата этажа: два гигантских пилона с рогами қошқар мүйіз, арка, печать-барьер (запечатана до победы над боссом). */
export function floorGate(b, x, z, ry = 0, gateId = '', bossId = '') {
  const f = b.frame(x, z, ry), H = 16, Wd = 7;
  for (const s of [-1, 1]) {
    f.add('box', [3.2, H, 3.2], s * Wd, H / 2, 0, P.stone); f.add('box', [3.6, 0.6, 3.6], s * Wd, H * 0.66, 0, P.turq, { lod: 1 }); f.add('box', [3.8, 1.2, 3.8], s * Wd, H + 0.6, 0, P.ochre);
    f.add('torus', [1.3, 0.35, 5, 10, Math.PI * 1.3], s * Wd, H + 2.2, 0, P.gold, { rz: s > 0 ? -0.6 : 0.6 + Math.PI * 0.7 }); // рога
    for (let i = 0; i < 3; i++) f.col(s * Wd, -1 + i, 1.7);
    // крылья-стены по 24 м — направляют в проход
    const wx = s * (Wd + 13.6); f.add('box', [24, 5, 1.6], wx, 2.5, 0, P.stone2); f.add('box', [24.2, 0.3, 1.7], wx, 4.8, 0, P.turq, { lod: 1 });
    for (let i = 0; i <= 16; i++) f.col(s * (Wd + 1.6 + i * 1.5), 0, 0.85, 'gatewall');
  }
  f.add('box', [Wd * 2 + 3.4, 2.2, 3.4], 0, H + 1.1, 0, P.ochre);
  f.add('torus', [2.6, 0.3, 6, 20], 0, H - 3.2, 0, P.gold, { tag: 'rune' });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI; f.add('box', [5.2, 0.12, 0.12], 0, H - 3.2, 0, P.gold, { rz: a, lod: 1 }); }
  f.add('plane', [Wd * 2 - 3.2, H - 1], 0, (H - 1) / 2, 0, P.seal, { e: 1, tag: 'seal' });
  for (let i = 0; i <= 8; i++) f.col(-Wd + 1.6 + i * (Wd * 2 - 3.2) / 8, 0, 0.8, 'seal:' + gateId);
  f.trig('gate', 0, 0, Wd, { gateId, bossId });
  return f;
}
/** Арена босса: кольцо балбалов и курильниц (центр свободен для боя). */
export function bossArena(b, R = 22, rng = Math.random) {
  const f = b.frame(0, 0, 0);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; if (i % 2) balbal(b, f.wpos(Math.sin(a) * R, Math.cos(a) * R), rng);
    else { const g = b.frame(Math.sin(a) * R, Math.cos(a) * R, a); g.add('cyl', [0.6, 0.4, 1.3, 8], 0, 0.65, 0, P.stone2); g.add('cone', [0.45, 0.9, 6], 0, 1.7, 0, P.fire, { e: 1 }); g.col(0, 0, 0.6); } }
  return f;
}
export function standingStones(b, R = 7, rng = Math.random) { for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const f = b.frame(Math.sin(a) * R, Math.cos(a) * R, a); const h = 2.5 + rng() * 1.5; f.add('box', [1, h, 0.6], 0, h / 2, 0, P.stone2); f.add('box', [0.4, 0.4, 0.05], 0, h * 0.7, 0.31, P.glow, { e: 1, lod: 1 }); f.col(0, 0, 0.7); } }
export function lookout(b) { const f = b.frame(0, 0, 0); f.add('cyl', [3, 3.3, 0.8, 10], 0, 0.4, 0, P.stone2); f.add('cyl', [0.08, 0.08, 6, 4], 2.4, 3, 0, P.wood); f.add('box', [0.04, 1, 1.6], 2.4, 5.4, 0.8, P.turq); f.plat(0, 0, 3, 0.8); }
export function cairn(b, rng = Math.random) { const f = b.frame(0, 0, 0); for (let i = 0; i < 4; i++) f.add('sph', [1.1 - i * 0.22, 6, 4], (rng() - 0.5) * 0.3, 0.6 + i * 0.75, 0, P.stone2); f.add('box', [1.2, 0.8, 0.8], 2, 0.4, 0, P.wood); f.add('box', [1.24, 0.12, 0.84], 2, 0.7, 0, P.gold); f.col(0, 0, 1); f.col(2, 0, 0.6); }

// ---------------- запекание в three ----------------
/** Сливает детали в меши: near (все), far (lod 0, грубее), glow (emissive, MeshBasic). geoCache: общие примитивы. */
export function bakeMeshes(THREE, parts, { material, glowMaterial, segMulFar = 0.5 } = {}) {
  const mk = (p, far) => {
    const a = p.a, sg = (n) => Math.max(3, Math.round(n * (far ? segMulFar : 1)));
    switch (p.k) {
      case 'box': return new THREE.BoxGeometry(a[0], a[1], a[2]);
      case 'cyl': return new THREE.CylinderGeometry(a[0], a[1], a[2], sg(a[3] || 8), 1, !!a[4]);
      case 'cone': return new THREE.ConeGeometry(a[0], a[1], sg(a[2] || 8));
      case 'sph': return new THREE.SphereGeometry(a[0], sg(a[1] || 8), Math.max(2, sg(a[2] || 6)));
      case 'dome': return new THREE.SphereGeometry(a[0], sg(a[1] || 10), Math.max(2, a[2] || 4), 0, Math.PI * 2, 0, Math.PI / 2);
      case 'torus': return new THREE.TorusGeometry(a[0], a[1], a[2] || 6, sg(a[3] || 12), a[4] || Math.PI * 2);
      case 'plane': return new THREE.PlaneGeometry(a[0], a[1]);
    }
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
  const merge = (list, far) => {
    if (!list.length) return null; const chunks = []; let n = 0;
    for (const p of list) { let g = mk(p, far); if (g.index) g = g.toNonIndexed(); e.set(p.rx, p.ry, p.rz, 'YXZ'); q.setFromEuler(e); m4.compose(v.set(p.p[0], p.p[1], p.p[2]), q, one); g.applyMatrix4(m4); chunks.push([g, p.c]); n += g.attributes.position.count; }
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), cl = new Float32Array(n * 3); let o = 0;
    for (const [g, c] of chunks) { const P = g.attributes.position, N = g.attributes.normal; pos.set(P.array, o * 3); nor.set(N.array, o * 3); col.set(c); for (let i = 0; i < P.count; i++) { cl[(o + i) * 3] = col.r; cl[(o + i) * 3 + 1] = col.g; cl[(o + i) * 3 + 2] = col.b; } o += P.count; g.dispose(); }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(cl, 3)); out.computeBoundingSphere(); return out;
  };
  const solid = parts.filter((p) => !p.e), glow = parts.filter((p) => p.e && !p.tag), tagged = parts.filter((p) => p.e && p.tag);
  const res = { near: null, far: null, glow: null, tagged: {} };
  const gN = merge(solid, false), gF = merge(solid.filter((p) => p.lod === 0), true), gG = merge(glow, false);
  if (gN) res.near = new THREE.Mesh(gN, material); if (gF) res.far = new THREE.Mesh(gF, material); if (gG) res.glow = new THREE.Mesh(gG, glowMaterial);
  for (const p of tagged) { const g = merge([p], false); const m = new THREE.Mesh(g, p.tag === 'seal' || p.tag === 'door_glow' ? glowMaterial.userData.transparent || glowMaterial : glowMaterial); m.userData.tag = p.tag; (res.tagged[p.tag] ||= []).push(m); }
  return res;
}
