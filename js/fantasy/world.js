import * as THREE from 'three';
import { QUALITY } from '../quality.js';

// «Академия ATU: Арена магов» — мир фэнтези-режима (только VR).
// Парящий каменный остров в сумерках: магический круг (граница арены, R = 11 м), рунные обелиски,
// врата с печатью ATU, «Мост лучников» с рунами-мишенями на 40/75/110 м, парящие платформы
// для мгновенного шага, небо с двумя лунами и сиянием, море облаков, академия вдали.
// Статика слита по материалам (камень и свечение), повторы — инстансы, всё — fog: false.
// Ось моста совпадает с дальним рубежом range.js: угол 281.25°, D ≈ (0.195, 0, −0.981).
// Группа моста повёрнута так, что её локальная −Z смотрит вдоль D, а +X — вправо.

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const LANE_ANGLE = Math.PI * 1.5 + Math.PI / 16; // 281.25°
const LANE_YAW = -Math.PI / 16;                  // поворот группы моста: (0,0,−1) → D
const LANE_CLEAR = 12 * DEG;                     // сектор стрельбы ±12° — ничего не ставим

const CYAN = 0x3ec5ff, VIOLET = 0x7c5cff, GOLD = 0xffd23f, PINK = 0xff5fc8;

// шрифт с кириллицей; ссылка та же, что в ui.js (там же Philosopher), чтобы не мешать друг другу
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Ruslan+Display&family=Philosopher:wght@400;700&display=swap';
const FONT_STACK = '"Ruslan Display", "Times New Roman", Georgia, serif';
const FONT_PROBE = '400 120px "Ruslan Display"';
const FONT_SAMPLE = 'ATU АКАДЕМИЯ МАГОВ 0123456789 м';

const ISLAND_R = 16;            // средний радиус каменной площадки
const ARENA_R = 11;             // магический круг — граница арены
const OBELISK_R = 14;
const GATE_D = 14.8;            // врата: расстояние по оси моста
const GATE_HALF = 3.3;          // полуширина врат (оси колонн), ±12.6° от оси
const ARCH_Y = 5.7;             // пята арки (верх капителей)
const SEAL_W = 4.6, SEAL_H = 2.3, SEAL_Y = 7.6, SEAL_Z = 0.82; // печать перед аркой
const SEAL_DISC_DY = ((512 - 470) / 1024) * SEAL_H;            // центр круга печати выше центра холста
const SKY_R = 260;              // купол неба (дальность камеры 300)
const SUNSET_AZ = 222 * DEG;    // тёплое зарево — за башней академии
const ACADEMY_AZ = 222 * DEG, ACADEMY_DIST = 150;

// руны-мишени: дистанция по оси, боковой сдвиг, диаметр, высота центра, очки, цвет, ширина таблички, радиус скалы
const RUNES = [
  { d: 40, off: -1.5, dia: 0.5, h: 1.4, pts: 2, color: CYAN, board: 1.2, rock: 1.0 },
  { d: 75, off: 1.2, dia: 0.75, h: 1.8, pts: 3, color: PINK, board: 2.0, rock: 1.3 },
  { d: 110, off: -0.8, dia: 1.0, h: 2.2, pts: 5, color: GOLD, board: 3.0, rock: 1.6 },
];
const COOLDOWN = 1.2;           // с: повторное попадание не засчитывается

// парящие платформы: угол (°), радиус от центра, высота верха, радиус верха
const PLATFORMS = [
  { a: 0, r: 10, h: 4.8, R: 1.4 },
  { a: 52, r: 12.6, h: 3.2, R: 1.7 },
  { a: 120, r: 6.5, h: 5.4, R: 1.3 },
  { a: 200, r: 7.5, h: 4.2, R: 1.6 },
  { a: 235, r: 12.4, h: 3.0, R: 1.7 },
  { a: 330, r: 8, h: 3.6, R: 1.5 },
];
const BOB_AMP = 0.05;           // покачивание платформ, м

const MOONS = [
  // азимут, высота (°), угловой диаметр (°), доля диска в квадрате, цвет, угол света, зерно, ореол
  { az: 318, el: 22, size: 9, frac: 0.36, color: 0xd4e6ff, light: 3.6, seed: 3.1, glow: 0.55 },
  { az: 338, el: 41, size: 4, frac: 0.3, color: 0xffb3d4, light: 0.6, seed: 8.4, glow: 0.5 },
];

const AURORA = [
  // азимут от/до (°), радиус, высота низа, высота ленты
  { a0: -10, a1: 100, R: 190, y0: 85, h: 55 },
  { a0: 115, a1: 200, R: 180, y0: 95, h: 45 },
  { a0: 235, a1: 300, R: 200, y0: 125, h: 40 },
];

// атлас свечения: три строки табличек 512×256, тёмный зазор, белый блок для однотонных деталей
const ATLAS_W = 512, ROW = 256, ATLAS_H = 1024, WHITE_Y = 832;
const WHITE_UV = [0.5, 1 - (WHITE_Y + ATLAS_H) / 2 / ATLAS_H];

// профиль низа острова (глубина → радиус при ровном крае 16 м)
const UNDER = [
  { y: 0, r: 16 },
  { y: -0.4, r: 16.25, jag: 0.008 },
  { y: -0.95, r: 15.7, jag: 0.02, jy: 0.08 },
  { y: -2.4, r: 14.3, jag: 0.05, jy: 0.3 },
  { y: -4.3, r: 11.8, jag: 0.08, jy: 0.45 },
  { y: -6.5, r: 8.6, jag: 0.11, jy: 0.55 },
  { y: -8.7, r: 5.4, jag: 0.15, jy: 0.5 },
  { y: -10.6, r: 2.6, jag: 0.2, jy: 0.4 },
];
const UNDER_TIP_Y = -12.8;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color(1, 1, 1);

// ---------------- утилиты ----------------

const count = (v, d) => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : d);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const C = (hex) => new THREE.Color(hex);

// угловое расстояние 0..π
function angDiff(a, b) {
  let d = (a - b) % TAU;
  if (d < 0) d += TAU;
  return d > Math.PI ? TAU - d : d;
}

// генератор случайных чисел с зерном: мир одинаковый при каждом запуске
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// детерминированный «шум» по координатам
function hash3(x, y, z) {
  const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

// гладкий периодический шум по углу (без шва), −1..1
function angNoise(a, k, seed) {
  return 0.5 * Math.sin(3 * a + k * 1.7 + seed) + 0.3 * Math.sin(5 * a - k * 0.9 + seed * 2.3)
    + 0.2 * Math.sin(9 * a + k * 2.9 + seed * 0.7);
}

// неровный край острова; к мосту остров вытянут «причалом»
function edgeR(a) {
  const d = angDiff(a, LANE_ANGLE) / 0.45;
  return ISLAND_R + 0.32 * Math.sin(3 * a + 0.7) + 0.22 * Math.sin(7 * a + 2.1) + 0.12 * Math.sin(13 * a + 4.2)
    + 1.2 * Math.exp(-d * d);
}

// радиус низа острова на глубине depth (при ровном крае)
function underR(depth) {
  const y = -depth;
  for (let i = 1; i < UNDER.length; i++) {
    const a = UNDER[i - 1], b = UNDER[i];
    if (y >= b.y) return a.r + (b.r - a.r) * ((a.y - y) / (a.y - b.y));
  }
  const last = UNDER[UNDER.length - 1];
  return last.r * clamp01((y - UNDER_TIP_Y) / (last.y - UNDER_TIP_Y));
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function canvasTexture(cv, srgb = true) {
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// матрица: сдвиг, поворот (порядок YXZ: сначала крен/наклон, потом рыск), масштаб
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function mat(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ');
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz));
}

// поставить геометрию: локальная матрица, затем (если есть) матрица рамы M
function place(geo, M, x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const L = mat(x, y, z, ry, rx, rz, sx, sy, sz);
  if (M) L.premultiply(M);
  return geo.applyMatrix4(L);
}

// цвет вершин по функции fn(x, y, z, out) (в локальных координатах куска)
function paint(geo, fn) {
  const p = geo.attributes.position, n = p.count;
  const arr = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), c);
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// слияние кусков в одну индексированную геометрию: позиция, нормаль, uv, цвет.
// part: { geo, color?: Color (если у geo нет своего цвета), uv?: [u, v] — одна точка атласа,
//         uvScale?: [su, sv], vRange?: [v0, v1] — строка атласа }
function mergeParts(parts) {
  let nv = 0, ni = 0;
  for (const p of parts) {
    const n = p.geo.attributes.position.count;
    nv += n;
    ni += p.geo.index ? p.geo.index.count : n;
  }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2), clr = new Float32Array(nv * 3);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const p of parts) {
    const g = p.geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    const a = g.attributes, n = a.position.count;
    const pa = a.position, na = a.normal, ua = a.uv, ca = a.color;
    const pc = p.color || WHITE;
    for (let i = 0; i < n; i++) {
      const j = vo + i;
      pos[j * 3] = pa.getX(i); pos[j * 3 + 1] = pa.getY(i); pos[j * 3 + 2] = pa.getZ(i);
      nor[j * 3] = na.getX(i); nor[j * 3 + 1] = na.getY(i); nor[j * 3 + 2] = na.getZ(i);
      let u = 0, v = 0;
      if (p.uv) { u = p.uv[0]; v = p.uv[1]; }
      else if (ua) {
        u = ua.getX(i); v = ua.getY(i);
        if (p.vRange) v = p.vRange[0] + v * (p.vRange[1] - p.vRange[0]);
        if (p.uvScale) { u *= p.uvScale[0]; v *= p.uvScale[1]; }
      }
      uv[j * 2] = u; uv[j * 2 + 1] = v;
      if (ca) { clr[j * 3] = ca.getX(i); clr[j * 3 + 1] = ca.getY(i); clr[j * 3 + 2] = ca.getZ(i); }
      else { clr[j * 3] = pc.r; clr[j * 3 + 1] = pc.g; clr[j * 3 + 2] = pc.b; }
    }
    const ix = g.index;
    if (ix) for (let i = 0; i < ix.count; i++) idx[io++] = ix.getX(i) + vo;
    else for (let i = 0; i < n; i++) idx[io++] = vo + i;
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(clr, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// «токарная» геометрия по кольцам сверху вниз: rings = [{ y, r, jag?, jy? }].
// o: { seg, seed, radiusFn(a) → множитель радиуса, top: крышка сверху, topUv, tip: {x,y,z} — вершина снизу,
//      uRep, vScale, color(x,y,z,out), topColor(x,y,z,out) }. Шов по u продублирован.
function lathe(rings, seg, o = {}) {
  const pos = [], uv = [], col = [], idx = [];
  const c = new THREE.Color();
  const seed = o.seed || 0, uRep = o.uRep || 4, vs = o.vScale || 0.5;
  const colorOf = (x, y, z, fn) => { if (fn) fn(x, y, z, c); else c.setRGB(1, 1, 1); col.push(c.r, c.g, c.b); };
  const rows = [];
  for (let k = 0; k < rings.length; k++) {
    const ring = rings[k], jag = ring.jag || 0, jy = ring.jy || 0;
    rows.push(pos.length / 3);
    for (let j = 0; j <= seg; j++) {
      const jj = j % seg, a = (jj / seg) * TAU;
      const nh = hash3(k + seed * 1.3, jj, seed + 0.5) * 2 - 1;
      const rf = (o.radiusFn ? o.radiusFn(a) : 1) * (1 + jag * (0.65 * angNoise(a, k, seed) + 0.35 * nh));
      const x = Math.cos(a) * ring.r * rf, z = Math.sin(a) * ring.r * rf;
      const y = ring.y + jy * (hash3(jj + 0.37, k * 2.1, seed + 3.3) * 2 - 1);
      pos.push(x, y, z);
      uv.push((j / seg) * uRep, -y * vs);
      colorOf(x, y, z, o.color);
    }
  }
  for (let k = 0; k < rings.length - 1; k++) {
    for (let j = 0; j < seg; j++) {
      const A = rows[k] + j, B = A + 1, Cc = rows[k + 1] + j, D = Cc + 1;
      idx.push(A, B, Cc, B, D, Cc); // наружу
    }
  }
  if (o.top) { // крышка: плоская uv, отдельные вершины
    const y0 = rings[0].y, s = o.topUv || 0.25, ctr = pos.length / 3;
    pos.push(0, y0, 0); uv.push(0, 0); colorOf(0, y0, 0, o.topColor || o.color);
    const b = pos.length / 3;
    for (let j = 0; j <= seg; j++) {
      const k3 = (rows[0] + j) * 3, x = pos[k3], z = pos[k3 + 2];
      pos.push(x, y0, z); uv.push(x * s, z * s); colorOf(x, y0, z, o.topColor || o.color);
    }
    for (let j = 0; j < seg; j++) idx.push(ctr, b + j + 1, b + j); // нормаль вверх
  }
  if (o.tip) {
    const t = pos.length / 3, last = rows[rows.length - 1];
    pos.push(o.tip.x, o.tip.y, o.tip.z); uv.push(uRep * 0.5, -o.tip.y * vs); colorOf(o.tip.x, o.tip.y, o.tip.z, o.color);
    for (let j = 0; j < seg; j++) idx.push(last + j, last + j + 1, t);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// валун: икосаэдр с шумом, плоский срез сверху (верх на y = 0), заострённый низ
function rockGeo(seed, flat = 0.5, cut = 0.4, bottom = 1.5, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = hash3(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100) + seed * 17);
    const k = 0.8 + 0.4 * n;
    const yy = y > 0 ? Math.min(y, cut) * flat : y * bottom * k;
    p.setXYZ(i, x * k, yy - cut * flat, z * k);
  }
  g.computeVertexNormals();
  return g;
}

// градиент цвета по высоте (для paint)
const gradY = (c0, c1, y0, y1, noise = 0) => (x, y, z, out) => {
  out.lerpColors(c0, c1, clamp01((y - y0) / (y1 - y0)));
  if (noise) out.multiplyScalar(1 - noise + 2 * noise * hash3(Math.round(x * 10), Math.round(y * 10), Math.round(z * 10)));
};

// цвет низа острова: светлая кромка → фиолетовая тень → тёмно-синее остриё
const UC0 = C(0xb6aac6), UC1 = C(0x5e4d82), UC2 = C(0x2a2352);
function underColor(x, y, z, out) {
  const t = clamp01(-y / -UNDER_TIP_Y);
  if (t < 0.3) out.lerpColors(UC0, UC1, t / 0.3);
  else out.lerpColors(UC1, UC2, (t - 0.3) / 0.7);
  out.multiplyScalar(0.88 + 0.24 * hash3(Math.round(x * 10), Math.round(y * 10), Math.round(z * 10)));
}

// ---------------- рисование на canvas ----------------

// процедурная руна: ствол и 1–3 штриха (детерминированно по seed); стиль линии задаёт вызывающий
function drawGlyph(g, x, y, s, seed) {
  const r = rng(seed * 7919 + 13);
  g.beginPath();
  if (r() < 0.82) { g.moveTo(x, y - s / 2); g.lineTo(x, y + s / 2); }
  const n = 1 + ((r() * 3) | 0);
  for (let k = 0; k < n; k++) {
    const y0 = y + (r() - 0.5) * s * 0.75;
    const dir = r() < 0.5 ? -1 : 1;
    const kind = (r() * 4) | 0;
    if (kind === 0) { g.moveTo(x, y0); g.lineTo(x + dir * s * 0.34, y0 - s * 0.24); }
    else if (kind === 1) { g.moveTo(x, y0); g.lineTo(x + dir * s * 0.34, y0 + s * 0.24); }
    else if (kind === 2) { g.moveTo(x - s * 0.28, y0); g.lineTo(x + s * 0.28, y0); }
    else { g.moveTo(x, y0 - s * 0.2); g.lineTo(x + dir * s * 0.3, y0); g.lineTo(x, y0 + s * 0.2); }
  }
  g.stroke();
}

function diamond(g, x, y, r) {
  g.beginPath();
  g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y);
  g.closePath();
  g.fill();
}

function fitFont(g, text, size, maxW) {
  g.font = `400 ${size}px ${FONT_STACK}`;
  const w = g.measureText(text).width;
  if (w > maxW) {
    size = Math.max(8, Math.floor((size * maxW) / w));
    g.font = `400 ${size}px ${FONT_STACK}`;
  }
  return size;
}

// плиты двора: два ряда камней (4 × 2 м на тайл), швы совпадают при повторе
function makeStoneTexture(W) {
  const H = W / 2, cv = makeCanvas(W, H), g = cv.getContext('2d');
  const r = rng(77);
  g.fillStyle = '#463e56';
  g.fillRect(0, 0, W, H);
  const rh = H / 2, gap = Math.max(2, Math.round(W / 128));
  for (let row = 0; row < 2; row++) {
    const n = 4 + ((r() * 2) | 0);
    const ws = [];
    let sum = 0;
    for (let i = 0; i < n; i++) { const w = 0.7 + r() * 0.6; ws.push(w); sum += w; }
    let x = row * W * 0.37;
    for (let i = 0; i < n; i++) {
      const w = (ws[i] / sum) * W;
      const shade = 160 + r() * 46, tint = r() * 14 - 7;
      const fill = `rgb(${(shade + tint) | 0},${(shade - 4) | 0},${(shade + 10 - tint) | 0})`;
      const seed = ((r() * 1e9) | 0) + 1;
      for (const off of [-W, 0, W]) drawStone(g, x + off + gap / 2, row * rh + gap / 2, w - gap, rh - gap, fill, seed, gap);
      x += w;
    }
  }
  const t = canvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function drawStone(g, x, y, w, h, fill, seed, gap) {
  const r = rng(seed);
  const rad = Math.min(w, h) * 0.12;
  g.save();
  g.beginPath();
  g.moveTo(x + rad, y);
  g.lineTo(x + w - rad, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rad);
  g.lineTo(x + w, y + h - rad);
  g.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  g.lineTo(x + rad, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rad);
  g.lineTo(x, y + rad);
  g.quadraticCurveTo(x, y, x + rad, y);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.clip();
  const grd = g.createLinearGradient(0, y, 0, y + h); // светлая кромка сверху, тень снизу
  grd.addColorStop(0, 'rgba(255,255,255,0.2)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0)');
  grd.addColorStop(0.7, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.28)');
  g.fillStyle = grd;
  g.fillRect(x, y, w, h);
  for (let i = 0; i < 22; i++) { // пятна и крапины
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)';
    g.beginPath();
    g.arc(x + r() * w, y + r() * h, 1 + r() * h * 0.16, 0, TAU);
    g.fill();
  }
  if (r() < 0.35) { // трещина
    g.strokeStyle = 'rgba(30,24,40,0.45)';
    g.lineWidth = Math.max(1, gap * 0.35);
    g.beginPath();
    let cx = x + (0.2 + r() * 0.6) * w, cy = y;
    g.moveTo(cx, cy);
    for (let k = 0; k < 4; k++) { cx += (r() - 0.5) * w * 0.25; cy += h / 4; g.lineTo(cx, cy); }
    g.stroke();
  }
  g.restore();
}

// бесшовный шум облаков (сумма октав value-noise), серый
function makeNoiseTexture(S) {
  const cv = makeCanvas(S, S), g = cv.getContext('2d');
  const img = g.createImageData(S, S), d = img.data;
  const r = rng(4242);
  const octs = [[4, 0.5], [8, 0.25], [16, 0.15], [32, 0.1]];
  const grids = octs.map(([n]) => {
    const a = new Float32Array(n * n);
    for (let i = 0; i < a.length; i++) a[i] = r();
    return a;
  });
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0;
      for (let o = 0; o < octs.length; o++) {
        const n = octs[o][0], gr = grids[o];
        const fx = (x / S) * n, fy = (y / S) * n;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        let tx = fx - x0, ty = fy - y0;
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);
        const x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
        const a = gr[y0 * n + x0], b = gr[y0 * n + x1], c = gr[y1 * n + x0], e = gr[y1 * n + x1];
        v += (a + (b - a) * tx + (c - a) * ty + (a - b - c + e) * tx * ty) * octs[o][1];
      }
      const k = (y * S + x) * 4, val = Math.max(0, Math.min(255, v * 255)) | 0;
      d[k] = d[k + 1] = d[k + 2] = val;
      d[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = canvasTexture(cv, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// полоса магического круга: руны между кромками (верх) и пунктир (низ); белое на чёрном — маска
function makeCircleTexture(W) {
  const H = W / 8, cv = makeCanvas(W, H), g = cv.getContext('2d');
  const band = H * 0.75;
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.shadowColor = '#fff';
  g.shadowBlur = H * 0.06;
  const lw = Math.max(1, H * 0.03);
  g.fillRect(0, band * 0.08, W, lw);
  g.fillRect(0, band * 0.86, W, lw);
  g.lineWidth = Math.max(1.5, H * 0.035);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const n = 10, step = W / n;
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * step;
    drawGlyph(g, x - step * 0.18, band * 0.47, band * 0.5, i * 3 + 1);
    drawGlyph(g, x + step * 0.18, band * 0.47, band * 0.5, i * 3 + 2);
    for (const off of [0, W]) diamond(g, i * step + off, band * 0.47, H * 0.05); // ромбик на стыке групп
  }
  g.shadowBlur = 0;
  const y = H * 0.89, dash = W / 32;
  for (let i = 0; i < 32; i++) g.fillRect((i + 0.25) * dash, y - H * 0.02, dash * 0.5, Math.max(1, H * 0.04));
  const t = canvasTexture(cv, false);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// лицо руны-мишени: белые линии на тёмном диске, цвет даёт материал
function makeRuneTexture(S) {
  const cv = makeCanvas(S, S), g = cv.getContext('2d'), c = S / 2, k = S / 512;
  g.fillStyle = '#0b0920';
  g.fillRect(0, 0, S, S);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = '#ffffff';
  g.fillStyle = '#ffffff';
  g.shadowColor = '#ffffff';
  g.shadowBlur = 14 * k;
  const ring = (r, w) => { g.lineWidth = w * k; g.beginPath(); g.arc(c, c, r * k, 0, TAU); g.stroke(); };
  ring(238, 16);
  ring(212, 4);
  g.lineWidth = 6 * k;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    g.save();
    g.translate(c + Math.cos(a) * 178 * k, c + Math.sin(a) * 178 * k);
    g.rotate(a + Math.PI / 2);
    drawGlyph(g, 0, 0, 46 * k, 40 + i);
    g.restore();
  }
  ring(146, 5);
  g.globalAlpha = 0.55; // гексаграмма
  g.lineWidth = 4 * k;
  for (let t = 0; t < 2; t++) {
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + t * Math.PI + (i * TAU) / 3;
      const x = c + Math.cos(a) * 140 * k, y = c + Math.sin(a) * 140 * k;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.stroke();
  }
  g.globalAlpha = 1;
  ring(92, 9);
  g.shadowBlur = 24 * k;
  g.beginPath();
  g.arc(c, c, 42 * k, 0, TAU);
  g.fill();
  const t = canvasTexture(cv);
  t.anisotropy = 4;
  return t;
}

// мягкое радиальное свечение
function makeGlowTexture() {
  const s = 64, cv = makeCanvas(s, s), g = cv.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  return canvasTexture(cv);
}

// табличка дистанции: тёмная каменная плита, золотая рамка, светящийся текст
function drawLabel(g, w, h, label, color) {
  const c = css(color);
  g.save();
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#2c2446');
  grd.addColorStop(1, '#151026');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#c9a23a';
  g.lineWidth = 8;
  g.strokeRect(14, 14, w - 28, h - 28);
  g.strokeStyle = c;
  g.lineWidth = 3;
  g.strokeRect(30, 30, w - 60, h - 60);
  g.fillStyle = '#ffd23f';
  for (const [x, y] of [[30, 30], [w - 30, 30], [30, h - 30], [w - 30, h - 30]]) diamond(g, x, y, 12);
  const size = fitFont(g, label, Math.floor(h * 0.52), w * 0.74);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = c;
  g.shadowBlur = 26;
  g.fillStyle = c;
  g.fillText(label, w / 2, h / 2 + size * 0.06);
  g.shadowBlur = 6;
  g.fillStyle = '#ffffff';
  g.fillText(label, w / 2, h / 2 + size * 0.06);
  g.restore();
}

// печать-герб: круг рун, «ATU», крылья, лента «АКАДЕМИЯ МАГОВ». Рисуем в координатах 2048×1024,
// k — масштаб холста (размытие тени в пикселях холста, поэтому тоже × k)
function drawSeal(g, k) {
  const W = 2048, H = 1024, CX = 1024, CY = 470, R = 470;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W * k, H * k);
  g.setTransform(k, 0, 0, k, 0, 0);
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // мягкое свечение за печатью
  const back = g.createRadialGradient(CX, CY, R * 0.5, CX, CY, R * 1.45);
  back.addColorStop(0, 'rgba(124,92,255,0.55)');
  back.addColorStop(0.6, 'rgba(62,197,255,0.16)');
  back.addColorStop(1, 'rgba(62,197,255,0)');
  g.fillStyle = back;
  g.fillRect(0, 0, W, H);

  // крылья из перьев (правое, затем зеркально левое)
  for (const s of [1, -1]) {
    g.save();
    g.translate(CX, 0);
    g.scale(s, 1);
    g.translate(-CX, 0);
    g.shadowColor = '#ffd23f';
    g.shadowBlur = 22 * k;
    for (let i = 0; i < 7; i++) {
      const phi = (-42 + i * 11) * DEG;
      const bx = CX + Math.cos(phi) * (R - 30), by = CY + Math.sin(phi) * (R - 30);
      const ang = phi * 0.55 - 0.22;
      const len = 430 - Math.abs(i - 2) * 48, wid = 44;
      g.save();
      g.translate(bx, by);
      g.rotate(ang);
      const fg = g.createLinearGradient(0, 0, len, 0);
      fg.addColorStop(0, 'rgba(255,210,63,0.95)');
      fg.addColorStop(0.7, 'rgba(255,170,90,0.55)');
      fg.addColorStop(1, 'rgba(124,92,255,0.1)');
      g.fillStyle = fg;
      g.strokeStyle = 'rgba(255,240,180,0.9)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(len * 0.45, -wid, len, 0);
      g.quadraticCurveTo(len * 0.45, wid * 0.55, 0, 0);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
    g.shadowColor = '#3ec5ff';
    g.fillStyle = '#9fe6ff';
    diamond(g, CX + R + 420, CY - 250, 18);
    diamond(g, CX + R + 330, CY - 330, 12);
    g.restore();
  }

  // круг печати
  g.save();
  g.shadowColor = '#ffd23f';
  g.shadowBlur = 30 * k;
  g.fillStyle = '#140c2e';
  g.beginPath();
  g.arc(CX, CY, R - 8, 0, TAU);
  g.fill();
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 20;
  g.beginPath();
  g.arc(CX, CY, R - 12, 0, TAU);
  g.stroke();
  g.strokeStyle = '#fff1b0';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(CX, CY, R - 42, 0, TAU);
  g.stroke();
  // кольцо рун
  g.shadowColor = '#3ec5ff';
  g.strokeStyle = '#9fe6ff';
  g.lineWidth = 7;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    g.save();
    g.translate(CX + Math.cos(a) * (R - 90), CY + Math.sin(a) * (R - 90));
    g.rotate(a + Math.PI / 2);
    drawGlyph(g, 0, 0, 60, i + 1);
    g.restore();
  }
  g.shadowColor = '#ffd23f';
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(CX, CY, R - 138, 0, TAU);
  g.stroke();
  // гексаграмма
  g.globalAlpha = 0.45;
  g.shadowColor = '#7c5cff';
  g.strokeStyle = '#9d7cff';
  g.lineWidth = 6;
  for (let t = 0; t < 2; t++) {
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + t * Math.PI + (i * TAU) / 3;
      const x = CX + Math.cos(a) * (R - 150), y = CY + Math.sin(a) * (R - 150);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.stroke();
  }
  g.globalAlpha = 1;
  // звёздочка над буквами
  g.shadowColor = '#3ec5ff';
  g.shadowBlur = 24 * k;
  g.fillStyle = '#c8f1ff';
  g.beginPath();
  const sy = CY - 205;
  g.moveTo(CX, sy - 48);
  g.quadraticCurveTo(CX + 8, sy - 8, CX + 48, sy);
  g.quadraticCurveTo(CX + 8, sy + 8, CX, sy + 48);
  g.quadraticCurveTo(CX - 8, sy + 8, CX - 48, sy);
  g.quadraticCurveTo(CX - 8, sy - 8, CX, sy - 48);
  g.fill();
  g.restore();

  // «ATU»
  g.save();
  const size = fitFont(g, 'ATU', 250, 560);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const tg = g.createLinearGradient(0, CY - size / 2, 0, CY + size / 2);
  tg.addColorStop(0, '#fffbe0');
  tg.addColorStop(0.5, '#ffd23f');
  tg.addColorStop(1, '#ff9a3c');
  g.shadowColor = '#ffd23f';
  g.shadowBlur = 40 * k;
  g.fillStyle = tg;
  g.fillText('ATU', CX, CY + 18);
  g.shadowBlur = 0;
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(70,24,100,0.85)';
  g.strokeText('ATU', CX, CY + 18);
  g.restore();

  // лента с надписью
  g.save();
  g.shadowColor = '#7c5cff';
  g.shadowBlur = 18 * k;
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 5;
  g.fillStyle = '#331660';
  for (const s of [1, -1]) { // хвосты ленты
    const x0 = CX + s * 604, x1 = CX + s * 744, xm = CX + s * 694;
    g.beginPath();
    g.moveTo(x0, 830); g.lineTo(x1, 830); g.lineTo(xm, 890); g.lineTo(x1, 950); g.lineTo(x0, 950);
    g.closePath();
    g.fill();
    g.stroke();
  }
  const bg = g.createLinearGradient(0, 790, 0, 930);
  bg.addColorStop(0, '#5a33a0');
  bg.addColorStop(1, '#2a1458');
  g.fillStyle = bg;
  g.beginPath();
  g.moveTo(CX - 624, 800);
  g.quadraticCurveTo(CX, 768, CX + 624, 800);
  g.lineTo(CX + 624, 920);
  g.quadraticCurveTo(CX, 888, CX - 624, 920);
  g.closePath();
  g.fill();
  g.stroke();
  const sub = 'АКАДЕМИЯ МАГОВ';
  if ('letterSpacing' in g) g.letterSpacing = '8px';
  fitFont(g, sub, 74, 1060);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#ffd23f';
  g.shadowBlur = 20 * k;
  g.fillStyle = '#ffe9a0';
  g.fillText(sub, CX + 4, 858);
  g.restore();
  g.setTransform(1, 0, 0, 1, 0, 0);
}

// подключить фэнтези-шрифт и перерисовать холсты, когда он загрузится
function watchFantasyFont(redraw) {
  if (typeof document === 'undefined') return;
  const fs = document.fonts;
  let done = false;
  const tryLoad = () => {
    if (done || !fs || !fs.load) return;
    try {
      fs.load(FONT_PROBE, FONT_SAMPLE).then((list) => {
        if (done || !list || !list.length) return;
        done = true;
        redraw();
      }, () => {});
    } catch (e) { /* без шрифта — запасной serif */ }
  };
  try {
    let link = document.querySelector('link[href*="Ruslan+Display"]');
    if (!link && document.head) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FONT_CSS;
      document.head.appendChild(link);
    }
    if (link && link.addEventListener) link.addEventListener('load', tryLoad);
  } catch (e) { /* нет DOM — пропуск */ }
  tryLoad();
  if (fs && fs.addEventListener) fs.addEventListener('loadingdone', tryLoad);
}

// ---------------- шейдеры ----------------

// небо: зенит → фиолетовая середина → розовый горизонт, тёплое зарево в сторону заката
const SKY_GLSL = /* glsl */`
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform vec3 uBelow;
  uniform vec3 uSunDir;
  vec3 skyColor(vec3 d) {
    float h = d.y;
    float l = length(d.xz);
    float s = l > 1e-4 ? max(dot(d.xz / l, uSunDir.xz), 0.0) : 0.0;
    vec3 col;
    if (h > 0.0) {
      col = mix(uMid, uZenith, smoothstep(0.08, 0.85, h));
      col = mix(uHorizon, col, smoothstep(0.0, 0.3, h));
    } else {
      col = mix(uHorizon, uBelow, smoothstep(0.0, 0.14, -h));
    }
    float band = exp(-abs(h) * 8.0);
    col += uGlow * band * (0.12 + 0.75 * pow(s, 5.0));
    col += uGlow * 0.35 * pow(s, 24.0) * exp(-abs(h) * 4.0);
    return col;
  }
`;

const NOISE_GLSL = /* glsl */`
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
  }
`;

// ================================================================================================

export function createFantasyWorld(scene, { quality } = {}) {
  const Q = quality || QUALITY.high;
  const LVL = Q.id === 'low' ? 0 : Q.id === 'medium' ? 1 : 2;
  const rnd = rng(20261019);

  const group = new THREE.Group();
  group.name = 'fantasy-world';
  group.visible = false; // показывает только фэнтези-режим: setVisible(true)
  scene.add(group);

  const lane = new THREE.Group(); // ось моста: локальная −Z смотрит вдоль D
  lane.name = 'fantasy-lane';
  lane.rotation.y = LANE_YAW;
  group.add(lane);
  const laneM = new THREE.Matrix4().makeRotationY(LANE_YAW);
  const gateM = laneM.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -GATE_D));
  const gateFrame = new THREE.Group(); // +Z врат смотрит в центр арены
  gateFrame.position.set(0, 0, -GATE_D);
  lane.add(gateFrame);

  const colliders = [];
  const teleportSurfaces = [];
  const platforms = [];
  const stoneParts = [];    // камень: ламберт, текстура плит × цвет вершин
  const glowParts = [];     // свечение: без света, атлас (таблички + белый блок) × цвет вершин
  const gateColParts = [];  // невидимые коллайдеры врат
  const laneColParts = [];  // невидимые коллайдеры моста

  const timeU = { value: 0 };
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const col = new THREE.Color();

  // ---- общие материалы и текстуры ----
  const stoneTex = makeStoneTexture(LVL === 0 ? 256 : 512);
  const stoneMat = new THREE.MeshLambertMaterial({ map: stoneTex, vertexColors: true, flatShading: true, fog: false });

  const atlasCv = makeCanvas(ATLAS_W, ATLAS_H);
  const atlasTex = canvasTexture(atlasCv);
  atlasTex.anisotropy = 4;
  const glowMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, toneMapped: false, fog: false });
  const drawAtlas = () => {
    const g = atlasCv.getContext('2d');
    g.fillStyle = '#120d22';
    g.fillRect(0, 0, ATLAS_W, WHITE_Y);
    g.fillStyle = '#ffffff';
    g.fillRect(0, WHITE_Y, ATLAS_W, ATLAS_H - WHITE_Y);
    RUNES.forEach((cfg, i) => {
      g.save();
      g.beginPath();
      g.rect(0, i * ROW, ATLAS_W, ROW);
      g.clip();
      g.translate(0, i * ROW);
      drawLabel(g, ATLAS_W, ROW, `${cfg.d} м`, cfg.color);
      g.restore();
    });
    atlasTex.needsUpdate = true;
  };
  drawAtlas();
  const glowTex = makeGlowTexture();

  // ---- свет (внутри группы — прячется вместе с миром) ----
  const hemi = new THREE.HemisphereLight(0xc8c0ff, 0x4a3266, 2.4);
  group.add(hemi);
  const moonDir = new THREE.Vector3(
    Math.cos(MOONS[0].el * DEG) * Math.cos(MOONS[0].az * DEG), Math.sin(MOONS[0].el * DEG),
    Math.cos(MOONS[0].el * DEG) * Math.sin(MOONS[0].az * DEG));
  const moonLight = new THREE.DirectionalLight(0xc4d6ff, 2.4);
  moonLight.position.copy(moonDir).multiplyScalar(60);
  group.add(moonLight, moonLight.target);
  if (LVL > 0) { // тёплая подсветка заката
    const warm = new THREE.DirectionalLight(0xff9a5a, 0.8);
    warm.position.set(Math.cos(SUNSET_AZ) * 60, 8, Math.sin(SUNSET_AZ) * 60);
    group.add(warm, warm.target);
  }

  // ================= НЕБО =================
  const skyU = {
    uZenith: { value: C(0x0a0b2e) },
    uMid: { value: C(0x2b1b66) },
    uHorizon: { value: C(0x7a4a9a) },
    uGlow: { value: C(0xff8a4a) },
    uBelow: { value: C(0x2c2058) },
    uSunDir: { value: new THREE.Vector3(Math.cos(SUNSET_AZ), 0, Math.sin(SUNSET_AZ)) },
  };
  const bgColor = C(0x2c2058);
  const fog = new THREE.Fog(0x3a2a6e, 45, 280);

  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_R, LVL ? 32 : 24, LVL ? 16 : 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { ...skyU },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: SKY_GLSL + /* glsl */`
        varying vec3 vDir;
        void main() {
          gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
          #include <colorspace_fragment>
        }`,
    })
  );
  skyDome.renderOrder = -100; // рисуется первым, глубину не пишет
  skyDome.frustumCulled = false;
  group.add(skyDome);

  // ---- море облаков под островом: шум из текстуры, вдали растворяется в небе ----
  const noiseTex = makeNoiseTexture(LVL === 0 ? 128 : LVL === 1 ? 256 : 512);
  const clouds = new THREE.Mesh(
    new THREE.CircleGeometry(248, LVL ? 64 : 40).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: {
        ...skyU, uTime: timeU, uNoise: { value: noiseTex },
        uDeep: { value: C(0x1e1646) }, uLit: { value: C(0xa48ee0) }, uWarm: { value: C(0xffb08a) }, uMagic: { value: C(CYAN) },
      },
      vertexShader: /* glsl */`
        varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: SKY_GLSL + /* glsl */`
        uniform float uTime;
        uniform sampler2D uNoise;
        uniform vec3 uDeep;
        uniform vec3 uLit;
        uniform vec3 uWarm;
        uniform vec3 uMagic;
        varying vec3 vW;
        void main() {
          vec2 p = vW.xz;
          float n1 = texture2D(uNoise, p * 0.0042 + vec2(uTime * 0.0021, uTime * 0.0009)).r;
          float n2 = texture2D(uNoise, p * 0.0125 - vec2(uTime * 0.0034, -uTime * 0.0016)).r;
          float n = n1 * 0.68 + n2 * 0.32;
          float c = smoothstep(0.34, 0.7, n);
          float dist = length(p);
          float s = max(dot(p / max(dist, 0.001), uSunDir.xz), 0.0);
          vec3 lit = mix(uLit, uWarm, pow(s, 3.0) * 0.75);
          vec3 col = mix(uDeep, lit * (0.8 + 0.35 * n2), c);
          col += uMagic * 0.3 * exp(-dist * dist / 700.0);
          col = mix(col, skyColor(normalize(vW - cameraPosition)), smoothstep(80.0, 245.0, dist));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    })
  );
  clouds.position.y = -24;
  clouds.frustumCulled = false;
  group.add(clouds);

  // ---- звёзды: точки на верхней полусфере, мерцание в шейдере ----
  const STARS = count(Q.stars, 1500);
  if (STARS > 0) {
    const R = 240;
    const pos = new Float32Array(STARS * 3), size = new Float32Array(STARS), phase = new Float32Array(STARS);
    const clr = new Float32Array(STARS * 3);
    const tints = [C(0xffffff), C(0xcfe2ff), C(0xffd6ec)];
    for (let i = 0; i < STARS; i++) {
      const y = 0.06 + rnd() * 0.94; // равномерно по площади
      const a = rnd() * TAU, rr = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(a) * rr * R;
      pos[i * 3 + 1] = y * R;
      pos[i * 3 + 2] = Math.sin(a) * rr * R;
      size[i] = rnd() < 0.08 ? 3 + rnd() * 1.6 : 1.5 + rnd() * 1.4;
      phase[i] = rnd();
      col.copy(tints[(rnd() * 3) | 0]).multiplyScalar(0.35 + 0.65 * clamp01((y - 0.06) / 0.25));
      clr[i * 3] = col.r; clr[i * 3 + 1] = col.g; clr[i * 3 + 2] = col.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(clr, 3));
    const stars = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: timeU },
      vertexShader: /* glsl */`
        uniform float uTime;
        attribute float aSize;
        attribute float aPhase;
        attribute vec3 aColor;
        varying vec3 vCol;
        void main() {
          vCol = aColor * (0.65 + 0.35 * sin(uTime * (1.0 + aPhase * 2.0) + aPhase * 40.0));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vCol;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c) * 4.0;
          if (d > 1.0) discard;
          float a = 1.0 - d;
          gl_FragColor = vec4(vCol * a * a, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    stars.renderOrder = -95;
    stars.frustumCulled = false;
    group.add(stars);
  }

  // ---- две луны: квадраты с диском, кратерами и ореолом в шейдере (один вызов) ----
  {
    const pos = [], uv = [], clr = [], prm = [], idx = [];
    const o = new THREE.Object3D(), D = 225;
    MOONS.forEach((m, i) => {
      const az = m.az * DEG, el = m.el * DEG;
      o.position.set(Math.cos(el) * Math.cos(az) * D, Math.sin(el) * D, Math.cos(el) * Math.sin(az) * D);
      o.lookAt(0, 0, 0); // +Z квадрата — к игроку
      o.updateMatrix();
      const half = (2 * D * Math.tan((m.size * DEG) / 2)) / m.frac / 2;
      col.set(m.color);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        v3.set(sx * half, sy * half, 0).applyMatrix4(o.matrix);
        pos.push(v3.x, v3.y, v3.z);
        uv.push((sx + 1) / 2, (sy + 1) / 2);
        clr.push(col.r, col.g, col.b);
        prm.push(m.frac, m.light, m.seed, m.glow);
      }
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(clr, 3));
    geo.setAttribute('aMoon', new THREE.Float32BufferAttribute(prm, 4));
    geo.setIndex(idx);
    const moons = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        attribute vec3 aColor;
        attribute vec4 aMoon;
        varying vec2 vUv;
        varying vec3 vCol;
        varying vec4 vM;
        void main() {
          vUv = uv; vCol = aColor; vM = aMoon;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: NOISE_GLSL + /* glsl */`
        varying vec2 vUv;
        varying vec3 vCol;
        varying vec4 vM;
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          float R = vM.x;
          vec2 q = p / R;
          float z = sqrt(max(1.0 - dot(q, q), 0.0));
          vec3 L = normalize(vec3(cos(vM.y), sin(vM.y), 0.6));
          float lit = smoothstep(-0.25, 0.45, dot(vec3(q, z), L));
          float m = vnoise(q * 2.6 + vM.z) * 0.6 + vnoise(q * 6.0 + vM.z * 1.7) * 0.4;
          vec3 surf = vCol * (0.72 + 0.4 * m) * (0.3 + 0.85 * lit) * (0.7 + 0.3 * z);
          float inside = 1.0 - smoothstep(R - 0.012, R, r);
          float g = clamp((r - R) / (1.0 - R), 0.0, 1.0);
          float glow = vM.w * pow(1.0 - g, 3.0) * (1.0 - inside);
          gl_FragColor = vec4(mix(vCol, surf, inside), max(inside, glow));
          #include <colorspace_fragment>
        }`,
    }));
    moons.renderOrder = -92;
    moons.frustumCulled = false;
    group.add(moons);
  }

  // ---- северное сияние: ленты-занавеси, складки и волны в шейдере (один вызов) ----
  {
    const RIBS = LVL + 1, N = LVL ? 64 : 40;
    const pos = [], uv = [], rib = [], idx = [];
    for (let k = 0; k < RIBS; k++) {
      const a = AURORA[k], b0 = pos.length / 3;
      for (let i = 0; i <= N; i++) {
        const t = i / N, ang = (a.a0 + (a.a1 - a.a0) * t) * DEG;
        const r = a.R + 10 * Math.sin(t * 5 + k * 1.7);
        const y = a.y0 + 6 * Math.sin(t * 4 + k);
        pos.push(Math.cos(ang) * r, y, Math.sin(ang) * r);
        pos.push(Math.cos(ang) * (r + 8), y + a.h, Math.sin(ang) * (r + 8));
        uv.push(t, 0, t, 1);
        rib.push(k, k);
      }
      for (let i = 0; i < N; i++) {
        const A = b0 + i * 2, B = A + 2;
        idx.push(A, B, A + 1, B, B + 1, A + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aRib', new THREE.Float32BufferAttribute(rib, 1));
    geo.setIndex(idx);
    const aurora = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: timeU, uLow: { value: C(0x3dffc8) }, uHigh: { value: C(0x3ec5ff) }, uTip: { value: C(0xb07cff) } },
      vertexShader: /* glsl */`
        uniform float uTime;
        attribute float aRib;
        varying vec2 vUv;
        varying float vRib;
        void main() {
          vUv = uv; vRib = aRib;
          vec3 p = position;
          float w = sin(uv.x * 9.0 + uTime * 0.25 + aRib * 2.0) * 7.0 + sin(uv.x * 23.0 - uTime * 0.4) * 2.5;
          p.xz += normalize(p.xz) * w;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform vec3 uLow;
        uniform vec3 uHigh;
        uniform vec3 uTip;
        varying vec2 vUv;
        varying float vRib;
        void main() {
          float x = vUv.x, y = vUv.y;
          float folds = 0.55 + 0.45 * sin(x * 38.0 + uTime * 0.6 + sin(x * 11.0 - uTime * 0.35 + vRib) * 2.2);
          float rays = 0.6 + 0.4 * sin(x * 140.0 + sin(x * 17.0 + uTime * 0.5) * 3.0);
          float vert = smoothstep(0.0, 0.12, y) * pow(1.0 - y, 1.6);
          float ends = smoothstep(0.0, 0.12, x) * (1.0 - smoothstep(0.88, 1.0, x));
          vec3 col = mix(uLow, uHigh, smoothstep(0.1, 0.6, y));
          col = mix(col, uTip, smoothstep(0.55, 1.0, y));
          gl_FragColor = vec4(col * folds * rays * vert * ends * 0.55, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    aurora.renderOrder = -90;
    aurora.frustumCulled = false;
    group.add(aurora);
  }

  // ---- магические искры над ареной (пресет dust; на «низком» нет) ----
  const MOTES = count(Q.dust, 300);
  if (MOTES > 0) {
    const pos = new Float32Array(MOTES * 3), prm = new Float32Array(MOTES * 3), clr = new Float32Array(MOTES * 3);
    const tints = [C(CYAN), C(VIOLET), C(GOLD), C(PINK)];
    for (let i = 0; i < MOTES; i++) {
      const r = 1.5 + Math.sqrt(rnd()) * 13.5, a = rnd() * TAU;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = rnd() * 7;
      pos[i * 3 + 2] = Math.sin(a) * r;
      prm[i * 3] = 0.06 + rnd() * 0.16;     // скорость подъёма
      prm[i * 3 + 1] = rnd();               // фаза
      prm[i * 3 + 2] = 0.025 + rnd() * 0.035; // размер, м
      col.copy(tints[(rnd() * 4) | 0]);
      clr[i * 3] = col.r; clr[i * 3 + 1] = col.g; clr[i * 3 + 2] = col.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aMote', new THREE.BufferAttribute(prm, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(clr, 3));
    const motes = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: timeU, uScale: { value: 700 } },
      vertexShader: /* glsl */`
        uniform float uTime;
        uniform float uScale;
        attribute vec3 aMote;
        attribute vec3 aColor;
        varying vec3 vCol;
        varying float vA;
        void main() {
          vec3 p = position;
          float h = mod(p.y + uTime * aMote.x, 7.0);
          p.y = 0.2 + h;
          float ang = uTime * 0.04 * (0.5 + aMote.x * 4.0);
          float c = cos(ang), s = sin(ang);
          p.xz = vec2(c * p.x - s * p.z, s * p.x + c * p.z);
          p.x += sin(uTime * 0.7 + aMote.y * 6.283) * 0.3;
          p.z += cos(uTime * 0.6 + aMote.y * 4.1) * 0.3;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aMote.z * uScale / max(-mv.z, 0.1), 1.0, 22.0);
          vA = smoothstep(0.0, 0.8, h) * (1.0 - smoothstep(5.8, 7.0, h)) * (0.6 + 0.4 * sin(uTime * 3.0 + aMote.y * 30.0));
          vCol = aColor;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vCol;
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c) * 4.0;
          if (d > 1.0) discard;
          float a = (1.0 - d) * vA;
          gl_FragColor = vec4(vCol * a * a, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    motes.frustumCulled = false;
    group.add(motes);
  }

  // ================= ОСТРОВ =================
  const SEG = LVL === 0 ? 64 : 96;

  // верх: центральный «медальон» (плоская uv) + кольца плит (полярная uv), последнее — потёртый край
  {
    const pos = [], uv = [], clr = [], idx = [];
    const c = new THREE.Color(), base = C(0xe8dcd0), worn = C(0xb3a6b8), inner = C(0xf0e4d4);
    const R0 = 2.5, NC = 12, TILE = 4;
    const vtx = (x, z, u, v, cc) => { pos.push(x, 0, z); uv.push(u, v); clr.push(cc.r, cc.g, cc.b); };
    const ctr = pos.length / 3;
    vtx(0, 0, 0, 0, inner);
    const first = pos.length / 3;
    for (let j = 0; j <= SEG; j++) {
      const a = (j / SEG) * TAU, x = Math.cos(a) * R0, z = Math.sin(a) * R0;
      vtx(x, z, x / TILE, z / 2, inner);
    }
    for (let j = 0; j < SEG; j++) idx.push(ctr, first + j + 1, first + j);
    for (let k = 0; k <= NC; k++) {
      const r0 = R0 + k, last = k === NC;
      const N = Math.max(3, Math.round((TAU * (last ? 15.5 : r0 + 0.5)) / TILE)); // целое число плиток по кругу
      const v0 = (k % 2) * 0.5, shade = 0.93 + rnd() * 0.1;
      const b = pos.length / 3;
      for (let j = 0; j <= SEG; j++) {
        const jj = j % SEG, a = (jj / SEG) * TAU, u = (j / SEG) * N;
        const r1 = last ? edgeR(a) : r0 + 1;
        c.copy(base).multiplyScalar(shade * (0.95 + 0.1 * hash3(k, jj, 1.7)));
        vtx(Math.cos(a) * r0, Math.sin(a) * r0, u, v0, c);
        c.copy(last ? worn : base).multiplyScalar(shade * (0.95 + 0.1 * hash3(k + 1, jj, 1.7)) * (last ? 0.8 : 1));
        vtx(Math.cos(a) * r1, Math.sin(a) * r1, u, v0 + 0.5, c);
      }
      for (let j = 0; j < SEG; j++) {
        const A = b + j * 2, Cc = A + 1, B = A + 2, D = A + 3;
        idx.push(A, B, Cc, B, D, Cc); // нормаль вверх
      }
    }
    const top = new THREE.BufferGeometry();
    top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    top.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    top.setAttribute('color', new THREE.Float32BufferAttribute(clr, 3));
    top.setIndex(idx);
    top.computeVertexNormals();
    stoneParts.push({ geo: top });
  }

  // кромка и рваный низ (верхнее кольцо точно совпадает с краем площадки)
  stoneParts.push({
    geo: lathe(UNDER, SEG, {
      seed: 11, radiusFn: (a) => edgeR(a) / ISLAND_R, tip: { x: 1.1, y: UNDER_TIP_Y, z: -0.7 },
      uRep: 24, vScale: 0.5, color: underColor,
    }),
  });
  // каменные «сосульки» под островом
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU, depth = 2.6 + rnd() * 4.8;
    const rr = underR(depth) * (edgeR(a) / ISLAND_R) * 0.88;
    const h = 2 + rnd() * 3.2, rad = 0.6 + rnd() * 0.9;
    const g = new THREE.ConeGeometry(rad, h, 5).rotateX(Math.PI).translate(0, -h / 2, 0);
    place(g, null, Math.cos(a) * rr, -depth + 0.5, Math.sin(a) * rr, rnd() * TAU);
    stoneParts.push({ geo: paint(g, underColor), uvScale: [2, 1] });
  }
  // висящие кристаллы
  {
    const cols = [CYAN, VIOLET, PINK, CYAN, GOLD, VIOLET, CYAN];
    for (let i = 0; i < cols.length; i++) {
      const a = rnd() * TAU, depth = 3.2 + rnd() * 5.2;
      const rr = underR(depth) * 0.82;
      const L = 1.4 + rnd() * 2.2, w = 0.22 + rnd() * 0.3;
      const g = new THREE.OctahedronGeometry(1, 0);
      place(g, null, Math.cos(a) * rr, -depth - L / 2 + 0.4, Math.sin(a) * rr, rnd() * TAU, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3, w, L / 2, w);
      glowParts.push({ geo: g, color: C(cols[i]), uv: WHITE_UV });
    }
    for (let i = 0; i < 3; i++) { // гроздь у острия
      const a = (i / 3) * TAU + 0.4, L = 1.2 + i * 0.4;
      const g = new THREE.OctahedronGeometry(1, 0);
      place(g, null, 1.1 + Math.cos(a) * 0.6, UNDER_TIP_Y + 0.6 - L / 2, -0.7 + Math.sin(a) * 0.6, a, 0.2 * Math.cos(a), 0.2 * Math.sin(a), 0.2, L / 2, 0.2);
      glowParts.push({ geo: g, color: C(i === 1 ? VIOLET : CYAN), uv: WHITE_UV });
    }
  }
  // низкий разрушенный парапет по краю (проход к мосту свободен)
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + rnd() * 0.12;
    const skip = rnd() < 0.22;
    if (skip || angDiff(a, LANE_ANGLE) < 0.42) continue;
    const r = edgeR(a) - 0.55, h = 0.35 + rnd() * 0.45, len = 1.0 + rnd() * 0.7;
    const g = new THREE.BoxGeometry(len, h, 0.5);
    place(g, null, Math.cos(a) * r, h / 2 - 0.05, Math.sin(a) * r, -a - Math.PI / 2 + (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.12);
    stoneParts.push({ geo: g, color: C(0xc9bfd6), uvScale: [0.3, 0.3] });
  }
  // руны-круги в центре (точка старта)
  {
    const ringG = (r0, r1, n, color) => {
      const g = new THREE.RingGeometry(r0, r1, n).rotateX(-Math.PI / 2).translate(0, 0.006, 0);
      glowParts.push({ geo: g, color, uv: WHITE_UV });
    };
    ringG(2.42, 2.52, SEG, C(VIOLET).multiplyScalar(0.5));
    ringG(0.82, 0.88, 48, C(CYAN).multiplyScalar(0.4));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const g = new THREE.PlaneGeometry(0.16, 0.16).rotateZ(Math.PI / 4).rotateX(-Math.PI / 2);
      g.translate(Math.cos(a) * 1.6, 0.006, Math.sin(a) * 1.6);
      glowParts.push({ geo: g, color: C(CYAN).multiplyScalar(0.4), uv: WHITE_UV });
    }
  }
  // невидимая плоскость верха острова — цель мгновенного шага
  const islandSurface = new THREE.Mesh(new THREE.CircleGeometry(15.2, 48).rotateX(-Math.PI / 2), stoneMat);
  islandSurface.name = 'fantasy-island-top';
  islandSurface.visible = false; // рисуется слитый меш; рейкаст видимость не проверяет
  group.add(islandSurface);
  teleportSurfaces.push(islandSurface);

  // ================= МАГИЧЕСКИЙ КРУГ (граница арены) =================
  const circleTimeU = { value: 0 }, circleGainU = { value: 1 };
  {
    const CW = LVL === 0 ? 512 : 1024;
    const tex = makeCircleTexture(CW);
    const bands = [
      { r0: ARENA_R - 0.45, r1: ARENA_R + 0.15, rep: 12, v0: 0.27, v1: 0.98, speed: 0.025, color: 0x55d0ff },
      { r0: ARENA_R - 0.75, r1: ARENA_R - 0.63, rep: 12, v0: 0.03, v1: 0.21, speed: -0.05, color: 0xffc94a },
    ];
    const pos = [], uv = [], spd = [], clr = [], idx = [];
    for (const b of bands) {
      col.set(b.color);
      const base = pos.length / 3;
      for (let j = 0; j <= 128; j++) {
        const a = (j / 128) * TAU, u = (j / 128) * b.rep;
        pos.push(Math.cos(a) * b.r0, 0, Math.sin(a) * b.r0, Math.cos(a) * b.r1, 0, Math.sin(a) * b.r1);
        uv.push(u, b.v0, u, b.v1);
        spd.push(b.speed, b.speed);
        clr.push(col.r, col.g, col.b, col.r, col.g, col.b);
      }
      for (let j = 0; j < 128; j++) {
        const A = base + j * 2, Cc = A + 1, B = A + 2, D = A + 3;
        idx.push(A, B, Cc, B, D, Cc);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aSpeed', new THREE.Float32BufferAttribute(spd, 1));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(clr, 3));
    geo.setIndex(idx);
    const circle = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uMap: { value: tex }, uTime: circleTimeU, uGain: circleGainU },
      vertexShader: /* glsl */`
        uniform float uTime;
        attribute float aSpeed;
        attribute vec3 aColor;
        varying vec2 vUv;
        varying vec3 vCol;
        void main() {
          vUv = vec2(uv.x + uTime * aSpeed, uv.y);
          vCol = aColor;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        uniform float uGain;
        varying vec2 vUv;
        varying vec3 vCol;
        void main() {
          float m = texture2D(uMap, vUv).r;
          gl_FragColor = vec4(vCol * m * uGain, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    circle.position.y = 0.012;
    circle.name = 'fantasy-magic-circle';
    group.add(circle);
  }

  // ================= РУННЫЕ ОБЕЛИСКИ =================
  // 8 штук на R = 14; ось моста ровно между двумя (±22.5°), сектор ±12° свободен
  const OB_N = 8;
  const obCols = [CYAN, VIOLET, GOLD, PINK];
  const obBase = [];
  const obH = 4.6; // высота камня без кристалла
  const wObelisk = (y) => 0.34 - ((y - 0.5) / 3.5) * (0.34 - 0.233); // полуширина ствола на высоте y
  const obGeo = mergeParts([
    { geo: new THREE.BoxGeometry(1.3, 0.5, 1.3).translate(0, 0.25, 0), color: C(0x8e85a8), uvScale: [0.33, 0.25] },
    { geo: new THREE.CylinderGeometry(0.33, 0.48, 3.5, 4).rotateY(Math.PI / 4).translate(0, 2.25, 0), color: C(0xb9b0cf), uvScale: [0.7, 1.75] },
    { geo: new THREE.ConeGeometry(0.33, 0.6, 4).rotateY(Math.PI / 4).translate(0, 4.3, 0), color: C(0xd4cce6), uvScale: [0.5, 0.3] },
  ]);
  // светящиеся руны на гранях + парящий кристалл + кант на постаменте
  const crystalPart = () => ({ geo: new THREE.OctahedronGeometry(0.22, 0).scale(1, 1.8, 1).translate(0, 5.05, 0) });
  const runeParts = [crystalPart(), { geo: new THREE.BoxGeometry(1.34, 0.05, 1.34).translate(0, 0.5, 0) }];
  for (let f = 0; f < 4; f++) {
    const ry = (f * Math.PI) / 2;
    const line = new THREE.BoxGeometry(0.035, 2.6, 0.03);
    place(line, null, 0, 2.3, wObelisk(2.3) + 0.012, 0, -Math.atan(0.107 / 3.5)); // наклон по сужению ствола
    line.applyMatrix4(new THREE.Matrix4().makeRotationY(ry));
    runeParts.push({ geo: line });
    for (let k = 0; k < 5; k++) {
      const y = 1.2 + k * 0.5;
      const gl = new THREE.BoxGeometry(0.13, 0.13, 0.03);
      place(gl, null, 0, y, wObelisk(y) + 0.014, 0, 0, Math.PI / 4);
      gl.applyMatrix4(new THREE.Matrix4().makeRotationY(ry));
      runeParts.push({ geo: gl });
    }
  }
  const obRuneGeo = mergeParts(runeParts);
  const obCrystalGeo = mergeParts([crystalPart()]); // если обелиск из GLB — только кристалл
  const obelisks = new THREE.InstancedMesh(obGeo, stoneMat, OB_N);
  const obRunes = new THREE.InstancedMesh(obRuneGeo, new THREE.MeshBasicMaterial({ toneMapped: false, fog: false }), OB_N);
  obelisks.name = 'fantasy-obelisks';
  for (let i = 0; i < OB_N; i++) {
    const a = LANE_ANGLE + Math.PI / OB_N + (i * TAU) / OB_N;
    const yaw = Math.atan2(-Math.cos(a), -Math.sin(a)); // грань к центру
    m4.compose(v3.set(Math.cos(a) * OBELISK_R, 0, Math.sin(a) * OBELISK_R), q4.setFromAxisAngle(Y_AXIS, yaw), s3.set(1, 1, 1));
    obelisks.setMatrixAt(i, m4);
    obRunes.setMatrixAt(i, m4);
    obBase.push(C(obCols[i % obCols.length]));
    obRunes.setColorAt(i, obBase[i]);
  }
  obRunes.instanceColor.setUsage(THREE.DynamicDrawUsage);
  group.add(obelisks, obRunes);
  colliders.push(obelisks);

  // ================= ВРАТА С ПЕЧАТЬЮ ATU =================
  {
    const plinthC = C(0x9a90b2), shaftC = C(0xc2b9d6), capC = C(0xd8d0e8);
    for (const sx of [-1, 1]) {
      const x = sx * GATE_HALF;
      stoneParts.push({ geo: place(new THREE.BoxGeometry(1.5, 0.6, 1.5), gateM, x, 0.3, 0), color: plinthC, uvScale: [0.38, 0.3] });
      stoneParts.push({ geo: place(new THREE.CylinderGeometry(0.5, 0.58, 4.6, 8), gateM, x, 2.9, 0), color: shaftC, uvScale: [0.85, 2.3] });
      stoneParts.push({ geo: place(new THREE.BoxGeometry(1.4, 0.5, 1.4), gateM, x, 5.45, 0), color: capC, uvScale: [0.35, 0.25] });
      // светящиеся руны-пояса на колоннах
      glowParts.push({ geo: place(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 8, 1, true), gateM, x, 1.5, 0), color: C(CYAN), uv: WHITE_UV });
      glowParts.push({ geo: place(new THREE.CylinderGeometry(0.56, 0.56, 0.12, 8, 1, true), gateM, x, 4.6, 0), color: C(VIOLET), uv: WHITE_UV });
      gateColParts.push({ geo: place(new THREE.BoxGeometry(1.5, 5.7, 1.5), gateM, x, 2.85, 0) });
    }
    // арка: полукольцо, выдавленное на 1 м
    const shape = new THREE.Shape();
    shape.absarc(0, 0, GATE_HALF + 0.55, 0, Math.PI, false);
    shape.lineTo(-(GATE_HALF - 0.55), 0);
    shape.absarc(0, 0, GATE_HALF - 0.55, Math.PI, 0, true);
    shape.closePath();
    const arch = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: LVL ? 20 : 12 });
    arch.translate(0, 0, -0.5);
    stoneParts.push({ geo: place(arch, gateM, 0, ARCH_Y, 0), color: shaftC, uvScale: [0.25, 0.5] });
    stoneParts.push({ geo: place(new THREE.BoxGeometry(0.9, 1.2, 1.15), gateM, 0, ARCH_Y + GATE_HALF, 0), color: capC, uvScale: [0.25, 0.4] });
    // руны по дуге и камень-замок
    glowParts.push({ geo: place(new THREE.RingGeometry(GATE_HALF - 0.18, GATE_HALF + 0.18, 32, 1, 0, Math.PI), gateM, 0, ARCH_Y, 0.51), color: C(CYAN).multiplyScalar(0.9), uv: WHITE_UV });
    glowParts.push({ geo: place(new THREE.PlaneGeometry(0.34, 0.34).rotateZ(Math.PI / 4), gateM, 0, ARCH_Y + GATE_HALF, 0.585), color: C(GOLD), uv: WHITE_UV });
    // каменный диск за печатью
    stoneParts.push({
      geo: place(new THREE.CylinderGeometry(1.18, 1.18, 0.22, 32).rotateX(Math.PI / 2), gateM, 0, SEAL_Y + SEAL_DISC_DY, SEAL_Z - 0.14),
      color: C(0x7d7096), uvScale: [2, 0.1],
    });
    // коллайдеры арки: 9 кусков по дуге, замок, печать
    for (let k = 0; k < 9; k++) {
      const th = ((k + 0.5) / 9) * Math.PI;
      gateColParts.push({ geo: place(new THREE.BoxGeometry(1.25, 1.1, 1.0), gateM, Math.cos(th) * GATE_HALF, ARCH_Y + Math.sin(th) * GATE_HALF, 0, 0, 0, th - Math.PI / 2) });
    }
    gateColParts.push({ geo: place(new THREE.BoxGeometry(2.5, 2.5, 0.35), gateM, 0, SEAL_Y + SEAL_DISC_DY, SEAL_Z - 0.12) });
  }
  // печать: холст с прозрачным фоном, свечение запечено
  const SK = LVL === 2 ? 1 : 0.5;
  const sealCv = makeCanvas(2048 * SK, 1024 * SK);
  const sealTex = canvasTexture(sealCv);
  sealTex.anisotropy = 4;
  const drawSealTex = () => { drawSeal(sealCv.getContext('2d'), SK); sealTex.needsUpdate = true; };
  drawSealTex();
  const seal = new THREE.Mesh(new THREE.PlaneGeometry(SEAL_W, SEAL_H),
    new THREE.MeshBasicMaterial({ map: sealTex, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
  seal.position.set(0, SEAL_Y, SEAL_Z);
  seal.name = 'fantasy-seal';
  gateFrame.add(seal);

  // ================= «МОСТ ЛУЧНИКОВ» =================
  const stoneC0 = C(0x4a3d68), stoneC1 = C(0xc4bad4);
  // ступени-камни вдоль оси: часто до первой мишени, дальше реже; у мишеней пропуск
  {
    let d = edgeR(LANE_ANGLE) + 0.9;
    let n = 0;
    while (d < 107) {
      const near = d < 39;
      let skip = false;
      for (const r of RUNES) if (Math.abs(d - r.d) < r.rock + 1.4) skip = true;
      if (!skip) {
        const x = Math.sin(d * 0.9) * 0.35, y = -0.22 + 0.06 * Math.sin(d * 0.37), s = near ? 1 : 0.85;
        const g = paint(rockGeo(100 + n, 0.35, 0.45, 1.6), gradY(stoneC0, stoneC1, -1.2, 0, 0.08));
        place(g, laneM, x, y, -d, (rnd() - 0.5) * 0.5, 0, 0, 0.85 * s, 0.5 * s, 0.65 * s);
        stoneParts.push({ geo: g, uvScale: [3, 1] });
        // руна-вкладка на верхе камня
        const inl = new THREE.PlaneGeometry(0.36 * s, 0.36 * s).rotateZ(Math.PI / 4).rotateX(-Math.PI / 2);
        glowParts.push({ geo: place(inl, laneM, x, y + 0.01, -d), color: C(n % 2 ? VIOLET : CYAN), uv: WHITE_UV });
        laneColParts.push({ geo: place(new THREE.BoxGeometry(1.6 * s, 0.6 * s, 1.2 * s), laneM, x, y - 0.3 * s, -d) });
        n++;
      }
      d += near ? 2.15 : 4.6;
    }
  }

  // руны-мишени на парящих скалах
  const runeTex = makeRuneTexture(LVL === 0 ? 256 : 512);
  const runeDisc = new THREE.CircleGeometry(0.5, LVL ? 48 : 32); // диаметр 1, масштаб — диаметр мишени
  const halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
    }), RUNES.length);
  halos.frustumCulled = false;
  const runeList = [];
  const runeByMesh = new Map();
  RUNES.forEach((cfg, i) => {
    const R = cfg.dia / 2;
    const yaw = Math.atan2(-cfg.off, cfg.d); // лицом точно к центру арены
    const base = C(cfg.color);
    // скала под руной
    const rock = paint(rockGeo(200 + i, 0.4, 0.4, 1.8), gradY(stoneC0, stoneC1, -2, 0, 0.08));
    place(rock, laneM, cfg.off, -0.05, -cfg.d, rnd() * TAU, 0, 0, cfg.rock, cfg.rock * 1.1, cfg.rock);
    stoneParts.push({ geo: rock, uvScale: [3, 1] });
    laneColParts.push({ geo: place(new THREE.BoxGeometry(cfg.rock * 2, cfg.rock * 1.6, cfg.rock * 2), laneM, cfg.off, -0.85 * cfg.rock, -cfg.d) });
    // кристалл-подставка под руной
    const shardH = cfg.h - R - 0.2;
    glowParts.push({
      geo: place(new THREE.OctahedronGeometry(1, 0), laneM, cfg.off, shardH / 2 - 0.05, -cfg.d, yaw, 0, 0, 0.12 + 0.04 * i, shardH / 2, 0.12 + 0.04 * i),
      color: base.clone().multiplyScalar(0.8), uv: WHITE_UV,
    });
    for (const sx of [-1, 1]) { // мелкие осколки по бокам
      const h2 = shardH * 0.45;
      glowParts.push({
        geo: place(new THREE.OctahedronGeometry(1, 0), laneM, cfg.off + sx * 0.35 * cfg.rock, h2 / 2 - 0.05, -cfg.d + 0.2, yaw, 0, sx * 0.35, 0.08, h2 / 2, 0.08),
        color: base.clone().multiplyScalar(0.6), uv: WHITE_UV,
      });
    }
    // табличка дистанции над руной (строка атласа)
    const bw = cfg.board, bh = bw / 2;
    const ly = cfg.h + R + 0.25 + bh / 2;
    glowParts.push({
      geo: place(new THREE.PlaneGeometry(bw, bh), laneM, cfg.off, ly, -cfg.d, yaw),
      vRange: [1 - ((i + 1) * ROW) / ATLAS_H, 1 - (i * ROW) / ATLAS_H],
    });
    // сама руна
    const runeMat = new THREE.MeshBasicMaterial({ map: runeTex, color: base.clone(), toneMapped: false, fog: false });
    const mesh = new THREE.Mesh(runeDisc, runeMat);
    mesh.name = `fantasy-rune-${cfg.d}`;
    mesh.position.set(cfg.off, cfg.h, -cfg.d);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = yaw;
    mesh.scale.setScalar(cfg.dia);
    lane.add(mesh);
    // ореол за руной
    halos.setMatrixAt(i, m4.compose(
      v3.set(cfg.off - Math.sin(yaw) * 0.08, cfg.h, -cfg.d - Math.cos(yaw) * 0.08),
      q4.setFromAxisAngle(Y_AXIS, yaw), s3.set(cfg.dia * 2.1, cfg.dia * 2.1, 1)));
    halos.setColorAt(i, base);
    const r = {
      idx: i, mesh, mat: runeMat, base, d: cfg.d, pts: cfg.pts, label: `${cfg.d} м`,
      cooldown: 0, flash: 0, spin: 0, angle: rnd() * TAU, phase: i * 1.9, emi0: 0,
    };
    runeList.push(r);
    runeByMesh.set(mesh, r);
  });
  halos.instanceColor.setUsage(THREE.DynamicDrawUsage);
  lane.add(halos);

  // ================= АКАДЕМИЯ ВДАЛИ (без света: силуэты в «свечении») =================
  {
    const P = new THREE.Vector3(Math.cos(ACADEMY_AZ) * ACADEMY_DIST, -7, Math.sin(ACADEMY_AZ) * ACADEMY_DIST);
    const acM = new THREE.Matrix4().compose(P, new THREE.Quaternion().setFromAxisAngle(Y_AXIS,
      Math.atan2(-Math.cos(ACADEMY_AZ), -Math.sin(ACADEMY_AZ))), new THREE.Vector3(1, 1, 1)); // фасад к острову
    const wall0 = C(0x1e1640), wall1 = C(0x3d2f70), roofC = C(0x1c2858), baseC = C(0x251b46);
    const winC = C(0xffcf6a), winC2 = C(0x7fe0ff);
    const add = (geo, color) => glowParts.push({ geo, color, uv: WHITE_UV });
    // скала
    const rock = lathe([
      { y: 0, r: 24 }, { y: -2, r: 25, jag: 0.04 }, { y: -7, r: 21, jag: 0.08, jy: 0.8 },
      { y: -15, r: 15, jag: 0.12, jy: 1.2 }, { y: -24, r: 9, jag: 0.16, jy: 1.2 }, { y: -31, r: 4, jag: 0.2 },
    ], LVL ? 20 : 14, {
      seed: 31, top: true, tip: { x: 2, y: -38, z: 1 },
      color: gradY(C(0x100b24), C(0x3a2c5c), -38, 0, 0.1), topColor: (x, y, z, out) => out.set(0x2e2450),
    });
    rock.applyMatrix4(acM);
    add(rock);
    // главная башня
    const towerR = (y) => 5.4 - ((y - 5) / 38) * 1.0;
    const cyl = (rt, rb, h, seg, y, color, fn) => {
      const g = new THREE.CylinderGeometry(rt, rb, h, seg).rotateY(Math.PI / seg);
      if (fn) paint(g, fn);
      place(g, acM, 0, y, 0);
      add(g, color);
    };
    cyl(8.5, 9.5, 5, 12, 2.5, baseC);
    cyl(4.4, 5.4, 38, 8, 24, null, gradY(wall0, wall1, -19, 19));
    cyl(6.2, 5.0, 1.2, 8, 43.6, baseC);
    const roof = new THREE.ConeGeometry(5.8, 17, 8).rotateY(Math.PI / 8);
    add(place(roof, acM, 0, 52.7, 0), roofC);
    add(place(new THREE.OctahedronGeometry(1, 0), acM, 0, 64.5, 0, 0, 0, 0, 1.4, 2.8, 1.4), C(0xfff0b0));
    for (const y of [18, 31]) {
      const r = towerR(y) + 0.08;
      add(place(new THREE.CylinderGeometry(r, r, 0.45, 8, 1, true).rotateY(Math.PI / 8), acM, 0, y, 0), C(CYAN));
    }
    // окна на трёх гранях, обращённых к острову
    for (const y of [10, 15, 21, 26, 35, 39]) {
      for (const th of [-Math.PI / 4, 0, Math.PI / 4]) {
        const r = towerR(y) * Math.cos(Math.PI / 8) + 0.06;
        add(place(new THREE.BoxGeometry(0.7, 1.5, 0.25), acM, Math.sin(th) * r, y, Math.cos(th) * r, th), (y === 26 || th !== 0) && y > 30 ? winC2 : winC);
      }
    }
    // боковые шпили
    const spires = [
      { x: -11, z: 3, r: 2.6, h: 22 }, { x: 12, z: 1, r: 2.4, h: 26 }, { x: -6, z: -10, r: 2.2, h: 18 },
      { x: 7, z: -11, r: 2.0, h: 16 }, { x: -17, z: -4, r: 1.8, h: 14 },
    ];
    for (const s of spires) {
      const g = new THREE.CylinderGeometry(s.r * 0.85, s.r, s.h, 8).rotateY(Math.PI / 8);
      paint(g, gradY(wall0, wall1, -s.h / 2, s.h / 2));
      add(place(g, acM, s.x, s.h / 2, s.z));
      add(place(new THREE.ConeGeometry(s.r * 1.3, s.h * 0.5, 8).rotateY(Math.PI / 8), acM, s.x, s.h * 1.25, s.z), roofC);
      add(place(new THREE.OctahedronGeometry(0.5, 0), acM, s.x, s.h * 1.5 + 0.8, s.z, 0, 0, 0, 1, 1.8, 1), C(s.x < 0 ? CYAN : PINK));
      for (const fy of [0.45, 0.7]) {
        const rr = s.r * (1 - 0.15 * fy) * Math.cos(Math.PI / 8) + 0.05;
        add(place(new THREE.BoxGeometry(0.5, 1.1, 0.2), acM, s.x, s.h * fy, s.z + rr), winC);
      }
    }
    // парящее кольцо-ореол вокруг башни
    add(place(new THREE.TorusGeometry(12, 0.3, 6, LVL ? 64 : 40).rotateX(Math.PI / 2), acM, 0, 36, 0, 0, 0.18, 0.1), C(0x9d7cff));
  }

  // ---- дальние парящие скалы (инстансы, медленно качаются; сектор моста свободен) ----
  const FAR_N = LVL === 0 ? 6 : LVL === 1 ? 11 : 16;
  const farRocks = new THREE.InstancedMesh(
    paint(rockGeo(5, 0.45, 0.5, 1.9), gradY(C(0x261d40), C(0x8f84a8), -1.9, 0, 0.1)), stoneMat, FAR_N);
  const farData = new Float32Array(FAR_N * 7); // x, y, z, масштаб, рыск, фаза, амплитуда
  {
    let n = 0;
    for (let tries = 0; n < FAR_N && tries < 400; tries++) {
      const a = rnd() * TAU;
      if (angDiff(a, LANE_ANGLE) < LANE_CLEAR + 0.08) continue;
      if (angDiff(a, ACADEMY_AZ) < 0.22) continue;
      const dist = 38 + rnd() * 82;
      const y = -12 + rnd() * Math.min(30, dist * 0.25 + 12);
      const k = n * 7;
      farData[k] = Math.cos(a) * dist; farData[k + 1] = y; farData[k + 2] = Math.sin(a) * dist;
      farData[k + 3] = 1.5 + (dist / 120) * 4.5 * (0.6 + rnd() * 0.8);
      farData[k + 4] = rnd() * TAU; farData[k + 5] = rnd() * TAU; farData[k + 6] = 0.3 + rnd() * 0.5;
      n++;
    }
    farRocks.count = n;
  }
  const placeFar = (t) => {
    for (let i = 0; i < farRocks.count; i++) {
      const k = i * 7, sc = farData[k + 3];
      v3.set(farData[k], farData[k + 1] + farData[k + 6] * Math.sin(t * 0.45 + farData[k + 5]), farData[k + 2]);
      q4.setFromAxisAngle(Y_AXIS, farData[k + 4] + t * 0.01);
      farRocks.setMatrixAt(i, m4.compose(v3, q4, s3.set(sc, sc, sc)));
    }
    farRocks.instanceMatrix.needsUpdate = true;
  };
  farRocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  placeFar(0);
  farRocks.computeBoundingSphere();
  farRocks.boundingSphere.radius += 2;
  group.add(farRocks);

  // ================= ПАРЯЩИЕ ПЛАТФОРМЫ (мгновенный шаг) =================
  const platGeo = lathe([
    { y: 0, r: 1 }, { y: -0.14, r: 1 }, { y: -0.3, r: 1.05, jag: 0.03 }, { y: -0.5, r: 0.88, jag: 0.08, jy: 0.03 },
    { y: -0.7, r: 0.6, jag: 0.12, jy: 0.04 }, { y: -0.86, r: 0.32, jag: 0.15, jy: 0.03 },
  ], 14, {
    seed: 7, top: true, topUv: 0.5, tip: { x: 0.05, y: -1, z: -0.04 }, uRep: 2, vScale: 1,
    color: gradY(C(0x3a2e52), C(0xb4a9c8), -1, 0),
    topColor: (x, y, z, out) => { out.setHex(0xd6cce4).multiplyScalar(0.94 + 0.12 * hash3(Math.round(x * 20), 0, Math.round(z * 20))); },
  });
  const platGlowGeo = mergeParts([
    { geo: new THREE.CylinderGeometry(1.012, 1.012, 0.08, 14, 1, true).translate(0, -0.07, 0) },
    { geo: new THREE.RingGeometry(0.62, 0.7, 32).rotateX(-Math.PI / 2).translate(0, 0.012, 0) },
    ...[0, 1, 2, 3].map((i) => {
      const a = (i / 4) * TAU;
      return { geo: new THREE.PlaneGeometry(0.12, 0.12).rotateZ(Math.PI / 4).rotateX(-Math.PI / 2).translate(Math.cos(a) * 0.84, 0.012, Math.sin(a) * 0.84) };
    }),
    { geo: new THREE.OctahedronGeometry(0.16, 0).scale(1, 2.2, 1).translate(0.05, -1.25, -0.04) },
  ]);
  const PN = PLATFORMS.length;
  const platRocks = new THREE.InstancedMesh(platGeo, stoneMat, PN);
  const platGlow = new THREE.InstancedMesh(platGlowGeo, new THREE.MeshBasicMaterial({ toneMapped: false, fog: false }), PN);
  platRocks.name = 'fantasy-platforms';
  const platQ = [], platS = [], platBase = [], platProxy = [];
  const proxyGeo = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
  const platCols = [CYAN, VIOLET, GOLD, PINK, CYAN, VIOLET];
  PLATFORMS.forEach((p, i) => {
    const a = p.a * DEG;
    const inside = p.r - p.R * 0.5 < ARENA_R + 0.2;
    const depth = inside ? Math.max(0.4, Math.min(1.3 * p.R, p.h - 2.3)) : 1.3 * p.R; // под платформой над ареной — проход
    const x = Math.cos(a) * p.r, z = Math.sin(a) * p.r;
    platQ.push(new THREE.Quaternion().setFromAxisAngle(Y_AXIS, rnd() * TAU));
    platS.push(new THREE.Vector3(p.R, depth, p.R));
    platBase.push(C(platCols[i % platCols.length]));
    platforms.push({ position: new THREE.Vector3(x, p.h, z), radius: p.R });
    const proxy = new THREE.Mesh(proxyGeo, stoneMat);
    proxy.name = `fantasy-platform-top-${i}`;
    proxy.visible = false; // только для рейкаста мгновенного шага
    proxy.position.set(x, p.h, z);
    proxy.scale.set(p.R * 0.98, 1, p.R * 0.98);
    group.add(proxy);
    platProxy.push(proxy);
    teleportSurfaces.push(proxy);
    platGlow.setColorAt(i, platBase[i]);
  });
  const placePlatforms = (t) => {
    for (let i = 0; i < PN; i++) {
      const p = platforms[i];
      p.position.y = PLATFORMS[i].h + BOB_AMP * Math.sin(t * 0.55 + i * 1.3);
      m4.compose(p.position, platQ[i], platS[i]);
      platRocks.setMatrixAt(i, m4);
      platGlow.setMatrixAt(i, m4);
      const pr = platProxy[i];
      pr.position.y = p.position.y;
      pr.updateMatrixWorld();
    }
    platRocks.instanceMatrix.needsUpdate = true;
    platGlow.instanceMatrix.needsUpdate = true;
  };
  platRocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  platGlow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  platGlow.instanceColor.setUsage(THREE.DynamicDrawUsage);
  placePlatforms(0);
  for (const im of [platRocks, platGlow]) { // запас на покачивание
    im.computeBoundingSphere();
    im.boundingSphere.radius += 0.3;
  }
  group.add(platRocks, platGlow);
  colliders.push(platRocks);

  // ================= СЛИЯНИЕ СТАТИКИ =================
  const stoneMesh = new THREE.Mesh(mergeParts(stoneParts), stoneMat);
  stoneMesh.name = 'fantasy-stone';
  stoneMesh.frustumCulled = false;
  const glowMesh = new THREE.Mesh(mergeParts(glowParts), glowMat);
  glowMesh.name = 'fantasy-glow';
  glowMesh.frustumCulled = false;
  group.add(stoneMesh, glowMesh);
  const colMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, visible: false });
  const gateCol = new THREE.Mesh(mergeParts(gateColParts), colMat);
  const laneCol = new THREE.Mesh(mergeParts(laneColParts), colMat);
  gateCol.name = 'fantasy-gate-colliders';
  laneCol.name = 'fantasy-bridge-colliders';
  gateCol.visible = laneCol.visible = false; // не рисуются, рейкаст видимость не проверяет
  group.add(gateCol, laneCol);
  colliders.push(gateCol, laneCol);
  for (const p of [...stoneParts, ...glowParts, ...gateColParts, ...laneColParts]) p.geo.dispose();
  for (const p of runeParts) p.geo.dispose();

  group.updateMatrixWorld(true); // рейкаст работает сразу, до первого кадра

  // шрифт: перерисовать печать и таблички
  watchFantasyFont(() => { drawSealTex(); drawAtlas(); });

  // ================= НЕОБЯЗАТЕЛЬНЫЕ GLB (assets/models/*.glb через ./assets.js) =================
  let assetsP = null;
  const loadGlb = (id) => {
    if (!assetsP) assetsP = import('./assets.js').catch(() => null);
    return assetsP
      .then((m) => (m && typeof m.loadModel === 'function' ? m.loadModel(id) : null))
      .then((o) => (o && o.isObject3D ? o : null), () => null);
  };
  // первый меш модели: геометрия с запечённым положением и один материал
  const firstMesh = (root) => {
    let found = null;
    root.updateMatrixWorld(true);
    root.traverse((o) => { if (!found && o.isMesh && o.geometry) found = o; });
    if (!found) return null;
    const geo = found.geometry.clone();
    geo.applyMatrix4(found.matrixWorld);
    geo.clearGroups();
    const mat = Array.isArray(found.material) ? found.material[0] : found.material;
    return { geo, mat };
  };
  const swapInstanced = (im, geo, mat) => {
    const old = im.geometry;
    im.geometry = geo;
    if (mat) im.material = mat;
    im.boundingSphere = null;
    im.boundingBox = null;
    im.computeBoundingSphere();
    im.boundingSphere.radius += 0.3;
    old.dispose();
  };
  // обелиск: по высоте 4.6 м, низ на y = 0; процедурные руны → только кристалл
  loadGlb('obelisk').then((root) => {
    const src = root && firstMesh(root);
    if (!src) return;
    src.geo.computeBoundingBox();
    const b = src.geo.boundingBox, s = obH / Math.max(1e-3, b.max.y - b.min.y);
    src.geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2).scale(s, s, s);
    swapInstanced(obelisks, src.geo, src.mat);
    swapInstanced(obRunes, obCrystalGeo);
  }).catch(() => {});
  // платформа: верх на y = 0, радиус 1, глубина 1 (масштаб инстанса — радиус и глубина)
  loadGlb('platform').then((root) => {
    const src = root && firstMesh(root);
    if (!src) return;
    src.geo.computeBoundingBox();
    const b = src.geo.boundingBox;
    const sx = 2 / Math.max(1e-3, b.max.x - b.min.x, b.max.z - b.min.z), sy = 1 / Math.max(1e-3, b.max.y - b.min.y);
    src.geo.translate(-(b.min.x + b.max.x) / 2, -b.max.y, -(b.min.z + b.max.z) / 2).scale(sx, sy, sx);
    swapInstanced(platRocks, src.geo, src.mat);
  }).catch(() => {});
  // руна-мишень: диск диаметром 1 лицом к +Z (если модель лежит — поднимаем; вперёд у GLB −Z)
  loadGlb('rune-target').then((root) => {
    const src = root && firstMesh(root);
    if (!src) return;
    const g = src.geo;
    g.computeBoundingBox();
    const sz = g.boundingBox.getSize(new THREE.Vector3());
    if (sz.y < sz.x && sz.y < sz.z) g.rotateX(Math.PI / 2); else g.rotateY(Math.PI);
    g.computeBoundingBox();
    const b = g.boundingBox, s = 1 / Math.max(1e-3, b.max.x - b.min.x, b.max.y - b.min.y);
    g.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, -(b.min.z + b.max.z) / 2).scale(s, s, s);
    for (const r of runeList) {
      const m = src.mat.clone();
      if (m.emissive) { m.emissive.copy(r.base); r.emi0 = Math.max(0.6, m.emissiveIntensity || 0); }
      r.mesh.geometry = g;
      r.mat.dispose();
      r.mat = m;
      r.mesh.material = m;
    }
    runeDisc.dispose();
  }).catch(() => {});
  // печать: модель-рамка позади холста (холст с надписью остаётся)
  loadGlb('seal').then((root) => {
    if (!root) return;
    const holder = new THREE.Group();
    holder.add(root);
    root.rotation.y = Math.PI; // вперёд у GLB −Z → к центру арены
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const s = Math.min((SEAL_W * 1.05) / Math.max(size.x, 1e-3), (SEAL_H * 1.15) / Math.max(size.y, 1e-3));
    root.position.copy(ctr).multiplyScalar(-1);
    holder.scale.setScalar(s);
    holder.position.set(0, SEAL_Y, SEAL_Z - 0.3 - (size.z * s) / 2);
    gateFrame.add(holder);
    holder.updateMatrixWorld(true);
  }).catch(() => {});

  // ================= ПОКАЗ / АНИМАЦИЯ / ПОПАДАНИЯ =================
  let visible = false;
  let saved = null; // фон и туман сцены до показа
  function setVisible(v) {
    v = !!v;
    if (v === visible) return;
    visible = v;
    group.visible = v;
    if (v) {
      saved = { background: scene.background, fog: scene.fog };
      scene.background = bgColor;
      scene.fog = fog;
    } else if (saved) {
      if (scene.background === bgColor) scene.background = saved.background;
      if (scene.fog === fog) scene.fog = saved.fog;
      saved = null;
    }
  }

  let clock = 0;
  function update(dt, time) {
    if (!visible) return;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    clock += dt;
    const t = typeof time === 'number' ? time : clock;
    timeU.value = t;
    circleTimeU.value = t % 400; // скорости полос × 400 — целые: без скачка
    circleGainU.value = 0.85 + 0.15 * Math.sin(t * 1.7);

    // пульс рун на обелисках (волна по кругу)
    for (let i = 0; i < OB_N; i++) {
      obRunes.setColorAt(i, col.copy(obBase[i]).multiplyScalar(0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.4 - i * 0.785))));
    }
    obRunes.instanceColor.needsUpdate = true;

    // платформы покачиваются, их кант дышит
    placePlatforms(t);
    for (let i = 0; i < PN; i++) {
      platGlow.setColorAt(i, col.copy(platBase[i]).multiplyScalar(0.7 + 0.3 * Math.sin(t * 2 + i)));
    }
    platGlow.instanceColor.needsUpdate = true;

    placeFar(t);

    // руны-мишени: медленное вращение, после попадания — вспышка и быстрый оборот
    for (let i = 0; i < runeList.length; i++) {
      const r = runeList[i];
      if (r.cooldown > 0) r.cooldown -= dt;
      if (r.flash > 0) r.flash = Math.max(0, r.flash - dt * 2.2);
      r.spin *= Math.exp(-2.5 * dt);
      r.angle += (0.25 + r.spin) * dt;
      if (r.angle > TAU) r.angle -= TAU;
      r.mesh.rotation.z = r.angle;
      const f = r.flash * r.flash;
      const pulse = 0.9 + 0.1 * Math.sin(t * 2.4 + r.phase);
      const m = r.mat;
      if (m.emissive) {
        m.emissive.copy(r.base);
        m.emissiveIntensity = r.emi0 * pulse + 2.5 * f;
      } else if (m.color) {
        m.color.copy(r.base).multiplyScalar(pulse + 1.6 * f).lerp(WHITE, 0.55 * f);
      }
      halos.setColorAt(i, col.copy(r.base).multiplyScalar(0.5 + 0.12 * Math.sin(t * 1.8 + r.phase) + 1.5 * f));
    }
    halos.instanceColor.needsUpdate = true;
  }

  // попадание по руне: вспышка и оборот; очки — если не в откате 1.2 с
  function hit(mesh, point) { // eslint-disable-line no-unused-vars
    const r = runeByMesh.get(mesh);
    if (!r) return null;
    const scored = r.cooldown <= 0;
    if (scored) r.cooldown = COOLDOWN;
    r.flash = 1;
    r.spin = Math.min(r.spin + 14, 22);
    return { distance: r.d, points: r.pts, scored, label: r.label };
  }

  return {
    group,
    setVisible,
    update,
    colliders,
    teleportSurfaces,
    platforms,
    runes: { meshes: runeList.map((r) => r.mesh), hit },
  };
}
