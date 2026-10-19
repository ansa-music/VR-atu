// Процедурные модели фэнтези-оружия (аниме-стиль): жезл, посох, клинок, лук, перчатка.
// Интерфейс как у createGun (js/guns.js): метры, вперёд −Z, вверх +Y, центр рукояти в GRIP.
// Геометрия строится один раз на тип (кэш), детали одного материала слиты в один меш.
import * as THREE from 'three';
import { GRIP } from '../weapon.js';

export const FANTASY_GUN_IDS = ['wand', 'staff', 'blade', 'bow', 'gauntlet'];
export const ELEMENT_COLORS = { fire: 0xff6a2a, ice: 0x7fe3ff, lightning: 0xd8a0ff };

const NO_STATE = Object.freeze({});
const clamp01 = (x) => (x > 0 ? (x < 1 ? x : 1) : 0);
const TAU = Math.PI * 2;
const AY = 0.012;            // высота оси «ствола», как у бластера
const FLASH = 0.08;          // длительность вспышки, с
const GTILT = -0.28;         // наклон рукояти (как у пистолетной)
const GUP = [Math.cos(GTILT), Math.sin(GTILT)]; // ось рукояти вверх: (y, z)

// цвета вершин (умножаются на цвет материала)
const C = {
  gold: 0xffc75a, goldDark: 0xc98a2e, silver: 0xdfe8f4, steel: 0x8e9ab0, darkSteel: 0x2a3040,
  ivory: 0xf4ecda, armor: 0x9fb2d6, wood: 0x6a3f24, woodDark: 0x3d2416, leather: 0x3a2346, leatherDark: 0x22152c,
  navy: 0x1f2a4f, white: 0xffffff,
};

// ---------- общие временные объекты (только на этапе построения) ----------
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
const _col = new THREE.Color();

function M(p = [0, 0, 0], r = [0, 0, 0], s = 1) {
  const sc = typeof s === 'number' ? _s.set(s, s, s) : _s.set(s[0], s[1], s[2]);
  return new THREE.Matrix4().compose(_v.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), sc);
}
const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
// точка на оси рукояти (смещение от GRIP вдоль оси)
const gp = (off) => [GRIP.x, GRIP.y + GUP[0] * off, GRIP.z + GUP[1] * off];

// ---------- слияние: детали раскладываются по ключам материалов ----------
function makeBatch() {
  const parts = {};
  return {
    // shade: запечённая гранёная заливка (кристаллы), mul — яркость цвета вершин
    add(key, geo, m, color = C.white, { shade = false, mul = 1, keep = false } = {}) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      if (m) g.applyMatrix4(m);
      if (shade) g.computeVertexNormals(); // non-indexed → плоские нормали граней
      const n = g.attributes.position.count;
      const ca = new Float32Array(n * 3);
      _col.set(color).multiplyScalar(mul);
      const nor = g.attributes.normal ? g.attributes.normal.array : null;
      for (let i = 0; i < n; i++) {
        let k = 1;
        if (shade && nor) {
          const d = nor[i * 3] * -0.35 + nor[i * 3 + 1] * 0.72 + nor[i * 3 + 2] * 0.6;
          k = 0.42 + 0.7 * Math.max(0, d) + (d > 0.8 ? 0.55 : 0);
        }
        ca[i * 3] = _col.r * k; ca[i * 3 + 1] = _col.g * k; ca[i * 3 + 2] = _col.b * k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
      (parts[key] || (parts[key] = [])).push(g);
      if (!keep) geo.dispose();
    },
    merge() {
      const out = {};
      for (const k in parts) out[k] = mergeGeos(parts[k]);
      return out;
    },
  };
}

// слияние non-indexed геометрий: position / normal / uv / color
function mergeGeos(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    const a = g.attributes, c = a.position.count;
    pos.set(a.position.array.subarray(0, c * 3), o * 3);
    if (a.normal) nor.set(a.normal.array.subarray(0, c * 3), o * 3);
    if (a.uv) uv.set(a.uv.array.subarray(0, c * 2), o * 2);
    col.set(a.color.array.subarray(0, c * 3), o * 3);
    o += c;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

// ---------- примитивы ----------
// протяжка эллипса вдоль кривой в плоскости YZ (pts: [y, z]); a — полуширина по X, b — толщина
function sweep(pts, { segs = 24, radial = 8, a = 0.01, b = a, x = 0 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(0, p[0], p[1])));
  const fa = typeof a === 'function' ? a : () => a, fb = typeof b === 'function' ? b : () => b;
  const fx = typeof x === 'function' ? x : () => x;
  const pos = [], idx = [], P = new THREE.Vector3(), T = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P); curve.getTangentAt(t, T);
    const ny = T.z, nz = -T.y, A = fa(t), B = fb(t);
    for (let j = 0; j < radial; j++) {
      const f = (j / radial) * TAU, c = Math.cos(f), s = Math.sin(f);
      pos.push(P.x + fx(t) + A * c, P.y + B * s * ny, P.z + B * s * nz);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const p = i * radial + j, q = i * radial + ((j + 1) % radial), r = p + radial, w = q + radial;
      idx.push(p, q, r, q, w, r);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// точки кривой YZ со смещением вдоль нормали в сторону +Z (лицевая сторона к игроку)
function offsetPts(pts, d, n = 20) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(0, p[0], p[1])));
  const out = [], P = new THREE.Vector3(), T = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    curve.getPointAt(t, P); curve.getTangentAt(t, T);
    let ny = T.z, nz = -T.y;
    if (nz < 0) { ny = -ny; nz = -nz; }
    const dd = typeof d === 'function' ? d(t) : d;
    out.push([P.y + ny * dd, P.z + nz * dd, t, ny, nz]);
  }
  return out;
}

// тело вращения вдоль −Z: prof = [[r, расстояние вперёд], ...]
function latheZ(prof, seg = 16) {
  const g = new THREE.LatheGeometry(prof.map(([r, d]) => new THREE.Vector2(r, d)), seg);
  g.rotateX(-Math.PI / 2);
  return g;
}

// гранёный кристалл вдоль −Z: перед fwd, зад back, радиус r, пояс ±h
function crystalGeo(r, fwd, back, h = 0, seg = 6) {
  const prof = [[0.0001, -back], [r * 0.92, -h - back * 0.12], [r, 0], [r * 0.92, h + fwd * 0.08], [0.0001, fwd]];
  return latheZ(prof, seg);
}

// дуга тора в плоскости XZ по углу θ как у CylinderGeometry (θ=0 → +Z, π → −Z)
function arcXZ(R, r, th0, len, seg = 24, rs = 4) {
  const g = new THREE.TorusGeometry(R, r, rs, seg, len);
  g.rotateX(Math.PI / 2);
  g.rotateY(-(Math.PI / 2 - th0 - len));
  return g;
}

// объёмная звезда в плоскости XY
function starGeo(R, r, t, n = 5) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / n, rr = i % 2 ? r : R;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  const pos = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    pos.push(0, 0, t, a[0], a[1], 0, b[0], b[1], 0);
    pos.push(0, 0, -t, b[0], b[1], 0, a[0], a[1], 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// кривая-спираль вокруг оси Z (x=0, y=cy) от z0 до z1
class Helix extends THREE.Curve {
  constructor(cy, z0, z1, turns, r0, r1, phase = 0) {
    super(); Object.assign(this, { cy, z0, z1, turns, r0, r1, phase });
  }
  getPoint(t, out = new THREE.Vector3()) {
    const a = this.phase + t * this.turns * TAU, r = this.r0 + (this.r1 - this.r0) * t;
    return out.set(Math.cos(a) * r, this.cy + Math.sin(a) * r, this.z0 + (this.z1 - this.z0) * t);
  }
}
const helixGeo = (h, tube, segs = 80) => new THREE.TubeGeometry(h, segs, tube, 4, false);
const tube3 = (pts, r, segs = 16) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(V)), segs, r, 5, false);

// руна: 2–3 штриха в локальной плоскости XY матрицы m
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function glyph(b, key, m, size, color = C.white, mul = 1) {
  const n = 2 + (rnd() > 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const ang = i === 0 ? 0 : (rnd() - 0.5) * 2.2;
    const len = size * (i === 0 ? 1 : 0.45 + rnd() * 0.4);
    const ox = i === 0 ? 0 : (rnd() - 0.5) * size * 0.5, oy = i === 0 ? 0 : (rnd() - 0.5) * size * 0.6;
    const lm = M([ox, oy, 0], [0, 0, ang], [size * 0.16, len, size * 0.08]);
    b.add(key, UNIT_BOX, m.clone().multiply(lm), color, { mul, keep: true });
  }
}

// ---------- рукоять под перчатку (общая для жезла, посоха, клинка, лука) ----------
function addGrip(b, wrap, wrapDark, ringCol = C.gold, len = 0.1) {
  b.add('matte', new THREE.CylinderGeometry(0.021, 0.022, len, 14, 1), M([GRIP.x, GRIP.y, GRIP.z], [GTILT, 0, 0], [0.62, 1, 1]), wrap);
  // обмотка: наклонные витки
  const band = new THREE.TorusGeometry(0.0205, 0.0019, 4, 18);
  for (let i = -3; i <= 3; i++) {
    b.add('matte', band, M(gp(i * 0.0125), [-Math.PI / 2 + GTILT + 0.22, 0, 0], [0.64, 1, 1]), wrapDark, { keep: true });
  }
  band.dispose();
  // золотые кольца на концах
  const ring = new THREE.TorusGeometry(0.0215, 0.003, 6, 20);
  b.add('metal', ring, M(gp(len / 2 - 0.002), [-Math.PI / 2 + GTILT, 0, 0], [0.66, 1, 1]), ringCol, { keep: true });
  b.add('metal', ring, M(gp(-len / 2 + 0.002), [-Math.PI / 2 + GTILT, 0, 0], [0.66, 1, 1]), ringCol);
  // навершие
  b.add('metal', new THREE.SphereGeometry(0.019, 14, 8, 0, TAU, Math.PI / 2, Math.PI / 2), M(gp(-len / 2), [GTILT, 0, 0], [0.62, 0.7, 1]), ringCol);
}

// ======================= жезл «Искра» =======================
function buildWand() {
  const b = makeBatch();
  addGrip(b, C.leather, C.leatherDark, C.gold, 0.1);
  // самоцвет в навершии
  b.add('glow', crystalGeo(0.008, 0.008, 0.008, 0.002, 6), M(gp(-0.064), [GTILT - Math.PI / 2, 0, 0]), C.white, { shade: true, mul: 1.1 });
  // шейка: от верха рукояти изгибом к оси древка
  const top = gp(0.05);
  b.add('matte', sweep([[top[1], top[2]], [AY - 0.006, 0.045], [AY, 0.012], [AY, -0.012]], { segs: 16, radial: 10, a: (t) => 0.0125 - t * 0.004 }), null, C.ivory);
  // воротник с золотыми крылышками
  b.add('metal', latheZ([[0.006, -0.014], [0.0115, -0.012], [0.0125, -0.006], [0.0105, 0.0], [0.0085, 0.004], [0.006, 0.006]], 16), M([0, AY, 0.0]), C.gold);
  b.add('metal', new THREE.TorusGeometry(0.0105, 0.0022, 6, 18), M([0, AY, 0.004]), C.goldDark);
  const feather = new THREE.SphereGeometry(1, 8, 5);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const ry = s * (1.05 + k * 0.3), L = 0.017 - k * 0.003;
      const dx = Math.sin(ry), dz = Math.cos(ry);
      b.add('metal', feather, M([s * 0.009 + dx * L, AY + 0.003 - k * 0.002, -0.004 + dz * L], [0.15, ry, s * 0.25], [0.0042, 0.0013, L]), k === 1 ? C.goldDark : C.gold, { keep: true });
    }
  }
  feather.dispose();
  // древко
  const L = 0.285;
  b.add('matte', latheZ([[0.0001, 0.0], [0.0078, 0.002], [0.0072, 0.08], [0.0056, 0.22], [0.005, L], [0.0001, L + 0.001]], 12), M([0, AY, -0.012]), C.ivory);
  // двойная спираль: золото и свечение
  const z0 = -0.03, z1 = -0.27;
  b.add('metal', helixGeo(new Helix(AY, z0, z1, 3.2, 0.0082, 0.0058), 0.0015), null, C.gold);
  b.add('glow', helixGeo(new Helix(AY, z0, z1, 3.2, 0.0079, 0.0056, Math.PI), 0.0011), null, C.white, { mul: 0.9 });
  for (const z of [-0.03, -0.15, -0.27]) b.add('metal', new THREE.TorusGeometry(z < -0.2 ? 0.0066 : 0.0085, 0.0016, 5, 16), M([0, AY, z]), C.gold);
  // оправа кончика: чашечка, кольцо-ореол со сферами
  const zt = -0.297;
  b.add('metal', latheZ([[0.0048, 0], [0.0068, 0.006], [0.011, 0.012], [0.0125, 0.014], [0.009, 0.015]], 14), M([0, AY, zt]), C.gold);
  const zs = -0.33;
  b.add('metal', new THREE.TorusGeometry(0.041, 0.0021, 6, 40), M([0, AY, zs + 0.004]), C.gold);
  const bead = new THREE.SphereGeometry(0.0042, 8, 6);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    b.add('metal', bead, M([Math.cos(a) * 0.041, AY + Math.sin(a) * 0.041, zs + 0.004]), C.goldDark, { keep: true });
  }
  bead.dispose();
  // спицы от чашечки к кольцу
  for (const a of [-Math.PI / 4, -3 * Math.PI / 4]) {
    b.add('metal', tube3([[Math.cos(a) * 0.01, AY + Math.sin(a) * 0.01, zt - 0.013], [Math.cos(a) * 0.03, AY + Math.sin(a) * 0.03, zs + 0.01], [Math.cos(a) * 0.041, AY + Math.sin(a) * 0.041, zs + 0.004]], 0.0013, 8), null, C.gold);
  }
  // звезда-кристалл (локально, крутится)
  b.add('crystal', starGeo(0.034, 0.015, 0.012), null, C.white, { shade: true, mul: 1 });
  const g = b.merge();
  return {
    id: 'wand', geos: g, crystalPos: [0, AY, zs], crystalSpin: 0.9,
    muzzle: [0, AY, zs - 0.014], sight: [0, AY + 0.018, 0.0], eyeDist: 0.34,
    halo: { s: 0.075, idle: 0.35 }, kick: { back: 0.012, pitch: 0.09, ret: 0.12 },
  };
}

// ======================= посох стихий =======================
function buildStaff() {
  const b = makeBatch();
  const SY = 0.016, R0 = 0.0132;
  addGrip(b, C.leather, C.leatherDark, C.gold, 0.1);
  // крепление рукояти к древку
  b.add('metal', new THREE.BoxGeometry(0.022, 0.016, 0.034), M([0, 0.0, 0.066], [GTILT * 0.5, 0, 0]), C.goldDark);
  b.add('metal', latheZ([[0.0168, 0], [0.0182, 0.006], [0.0182, 0.05], [0.0168, 0.056]], 16), M([0, SY, 0.094]), C.gold);
  // древко
  const zb = 0.425, zf = -0.86, len = zb - zf;
  b.add('matte', latheZ([[0.0001, 0], [0.0122, 0.002], [R0, 0.3], [R0 * 1.02, 0.7], [0.0124, len - 0.002], [0.0001, len]], 12), M([0, SY, zb]), C.wood);
  // задняя часть под вторую руку: кожаная обмотка
  b.add('matte', latheZ([[0.0148, 0], [0.0152, 0.004], [0.0152, 0.17], [0.0148, 0.174]], 12), M([0, SY, 0.385]), C.leatherDark);
  const wrapT = new THREE.TorusGeometry(0.0153, 0.0016, 4, 14);
  for (let i = 0; i < 9; i++) b.add('matte', wrapT, M([0, SY, 0.375 - i * 0.019], [0.25, 0, 0]), C.leather, { keep: true });
  wrapT.dispose();
  // золотые кольца и пятка
  const band = (z, w = 0.008, r = 0.0158) => b.add('metal', latheZ([[r - 0.0018, 0], [r, 0.0015], [r, w - 0.0015], [r - 0.0018, w]], 14), M([0, SY, z + w / 2]), C.gold);
  for (const z of [0.39, 0.205, -0.2, -0.48, -0.74]) band(z);
  b.add('metal', latheZ([[0.0001, -0.03], [0.006, -0.02], [0.0135, 0.0], [0.016, 0.012], [0.014, 0.024], [0.0001, 0.026]], 12), M([0, SY, zb + 0.022], [Math.PI, 0, 0]), C.goldDark);
  // светящаяся спираль и руны на передней части
  b.add('glow', helixGeo(new Helix(SY, -0.21, -0.73, 3.5, 0.0138, 0.0134), 0.0011, 120), null, C.white, { mul: 0.95 });
  for (let i = 0; i < 6; i++) {
    const z = -0.06 - i * 0.022;
    for (const s of [-1, 1]) glyph(b, 'glow', M([s * 0.0137, SY, z], [0, s * Math.PI / 2, 0]), 0.012, C.white, 1);
  }
  // оголовье: раструб-гнездо
  b.add('metal', latheZ([[0.0125, 0], [0.0145, 0.01], [0.022, 0.03], [0.028, 0.045], [0.024, 0.05], [0.012, 0.048]], 16), M([0, SY, zf + 0.004]), C.gold);
  b.add('metal', new THREE.TorusGeometry(0.0146, 0.0024, 6, 18), M([0, SY, zf - 0.002]), C.goldDark);
  // полумесяц рогами вверх
  const HC = [0, SY, -0.975], Ro = 0.086, ci = 0.012, beta = 0.6;
  const tipR = [Math.cos(Math.PI / 2 - beta) * Ro, Math.sin(Math.PI / 2 - beta) * Ro];
  const ri = Math.hypot(tipR[0], tipR[1] - ci);
  const sh = new THREE.Shape();
  const n = 28;
  for (let i = 0; i <= n; i++) { // внешняя дуга через низ
    const a = Math.PI / 2 + beta + (i / n) * (TAU - 2 * beta);
    i ? sh.lineTo(Math.cos(a) * Ro, Math.sin(a) * Ro) : sh.moveTo(Math.cos(a) * Ro, Math.sin(a) * Ro);
  }
  const ia0 = Math.atan2(tipR[1] - ci, tipR[0]), ia1 = Math.PI - ia0; // внутренняя дуга обратно
  for (let i = 0; i <= n; i++) {
    const a = ia0 - (i / n) * (TAU - (ia1 - ia0));
    sh.lineTo(Math.cos(a) * ri, ci + Math.sin(a) * ri);
  }
  const cres = new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.0025, bevelSegments: 1, curveSegments: 4 });
  cres.translate(0, 0, -0.004);
  b.add('metal', cres, M(HC), C.gold);
  // внутренний ободок полумесяца (свечение)
  const ins = new THREE.TorusGeometry(ri + 0.002, 0.0013, 4, 40, TAU - (ia1 - ia0));
  b.add('glow', ins, M([HC[0], HC[1] + ci, HC[2] + 0.0065], [0, 0, ia1]), C.white, { mul: 1 });
  // сферы на рогах
  const orb = new THREE.SphereGeometry(0.0085, 12, 8);
  for (const s of [-1, 1]) b.add('metal', orb, M([HC[0] + s * tipR[0] * 1.02, HC[1] + tipR[1] * 1.02, HC[2]]), C.goldDark, { keep: true });
  orb.dispose();
  // лапы от гнезда к полумесяцу
  for (const a of [-Math.PI / 2, -Math.PI / 2 - 0.95, -Math.PI / 2 + 0.95]) {
    const ca = Math.cos(a), sa = Math.sin(a);
    b.add('metal', tube3([[ca * 0.022, SY + sa * 0.022, zf - 0.04], [ca * 0.05, SY + sa * 0.05, zf - 0.07], [ca * (Ro - 0.006), SY + sa * (Ro - 0.006), HC[2] + 0.002]], 0.0034, 10), null, C.gold);
  }
  // крылья-завитки по бокам полумесяца
  for (const s of [-1, 1]) {
    b.add('metal', tube3([[s * 0.08, SY - 0.03, HC[2]], [s * 0.112, SY - 0.004, HC[2] + 0.02], [s * 0.118, SY + 0.04, HC[2] + 0.03], [s * 0.1, SY + 0.07, HC[2] + 0.03]], 0.0028, 14), null, C.goldDark);
  }
  // кристалл стихии (локально)
  b.add('crystal', crystalGeo(0.048, 0.13, 0.075, 0.02, 6), null, C.white, { shade: true });
  // кольца-руны (локально, вращаются)
  const r1 = new THREE.TorusGeometry(0.108, 0.0017, 4, 56);
  b.add('rings', r1, null, C.white, { keep: true });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    glyph(b, 'rings', M([Math.cos(a) * 0.108, Math.sin(a) * 0.108, 0], [0, 0, a - Math.PI / 2]), 0.014, C.white, 1.1);
  }
  r1.dispose();
  const tilt = M([0, 0, 0], [1.15, 0.4, 0]);
  b.add('rings', new THREE.TorusGeometry(0.074, 0.0013, 4, 48), tilt, C.white, { mul: 0.8 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    glyph(b, 'rings', tilt.clone().multiply(M([Math.cos(a) * 0.074, Math.sin(a) * 0.074, 0], [0, 0, a - Math.PI / 2])), 0.011, C.white, 0.9);
  }
  const g = b.merge();
  return {
    id: 'staff', geos: g, crystalPos: [0, SY, -0.985], crystalSpin: 0.35, ringsPos: [0, SY, -0.985],
    muzzle: [0, SY, -1.12], sight: [0, SY + 0.03, 0.06], eyeDist: 0.32,
    halo: { s: 0.16, idle: 0.45 }, kick: { back: 0.02, pitch: 0.05, ret: 0.16 },
  };
}

// ======================= клинок души =======================
function buildBlade() {
  const b = makeBatch();
  addGrip(b, C.navy, C.leatherDark, C.gold, 0.1);
  // пятка рукояти — самоцвет
  b.add('gem', crystalGeo(0.0075, 0.007, 0.007, 0.002, 6), M(gp(-0.064), [GTILT - Math.PI / 2, 0, 0]), C.white, { shade: true, mul: 1.1 });
  // хвостовик над кистью
  b.add('metal', latheZ([[0.0001, -0.012], [0.009, -0.01], [0.0145, -0.002], [0.0155, 0.02], [0.0145, 0.07], [0.0165, 0.076], [0.0165, 0.086], [0.012, 0.09]], 14), M([0, AY, 0.11]), C.darkSteel);
  for (const z of [0.1, 0.064, 0.034]) b.add('metal', new THREE.TorusGeometry(0.0158, 0.0022, 6, 18), M([0, AY, z]), C.gold);
  b.add('glow', new THREE.TorusGeometry(0.0158, 0.0012, 4, 18), M([0, AY, 0.082]), C.white);
  // гарда: крылья в плоскости XY с загибом вперёд
  const wing = new THREE.Shape();
  wing.moveTo(0, 0.022);
  wing.bezierCurveTo(0.03, 0.03, 0.06, 0.012, 0.084, 0.034);
  wing.bezierCurveTo(0.096, 0.046, 0.1, 0.062, 0.088, 0.07);
  wing.bezierCurveTo(0.092, 0.05, 0.075, 0.03, 0.055, 0.016);
  wing.bezierCurveTo(0.07, 0.004, 0.072, -0.02, 0.062, -0.034);
  wing.bezierCurveTo(0.05, -0.016, 0.03, -0.018, 0, -0.022);
  wing.lineTo(0, 0.022);
  const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0018, bevelSegments: 1, curveSegments: 6 });
  wg.translate(0, 0, -0.004);
  for (const s of [-1, 1]) b.add('metal', wg, M([0, AY, 0.014], [0, s * 0.32, 0], [s, 1, 1]), C.gold, { keep: true });
  wg.dispose();
  // центр гарды и оправа камня
  b.add('metal', new THREE.SphereGeometry(0.022, 16, 10), M([0, AY, 0.012], [0, 0, 0], [0.75, 1.15, 0.9]), C.goldDark);
  b.add('metal', new THREE.TorusGeometry(0.0105, 0.0022, 6, 20), M([0, AY + 0.024, 0.012], [Math.PI / 2, 0, 0]), C.gold);
  b.add('gem', crystalGeo(0.0095, 0.012, 0.004, 0.002, 8), M([0, AY + 0.024, 0.012], [-Math.PI / 2, 0, 0]), C.white, { shade: true, mul: 1.15 });
  // лезвие: профиль (u — вперёд, v — вверх), экструзия по X с острой фаской
  const BL = 0.85, prof = [[0, -0.022], [0.6, -0.021], [0.74, -0.015], [BL, 0.0], [0.76, 0.017], [0.6, 0.021], [0, 0.022]];
  const bs = new THREE.Shape();
  bs.moveTo(prof[0][0], prof[0][1]);
  for (let i = 1; i < prof.length; i++) bs.lineTo(prof[i][0], prof[i][1]);
  const bev = 0.006, dep = 0.0012;
  const bg = new THREE.ExtrudeGeometry(bs, { depth: dep, bevelEnabled: true, bevelThickness: 0.0034, bevelSize: bev, bevelSegments: 1, curveSegments: 1 });
  bg.rotateY(Math.PI / 2); bg.translate(-dep / 2, AY, 0.0);
  b.add('metal', bg, null, C.silver);
  // рикассо у гарды
  b.add('metal', new THREE.BoxGeometry(0.011, 0.04, 0.03), M([0, AY, -0.012]), C.gold);
  // дол: светящаяся полоса и руны с обеих сторон
  const xs = dep / 2 + 0.0034;
  for (const s of [-1, 1]) {
    b.add('glow', new THREE.BoxGeometry(0.0008, 0.0026, 0.5), M([s * (xs + 0.0001), AY, -0.32]), C.white, { mul: 0.75 });
    for (let i = 0; i < 7; i++) glyph(b, 'glow', M([s * (xs + 0.0003), AY + 0.009, -0.07 - i * 0.075], [0, s * Math.PI / 2, 0]), 0.008, C.white, 1.1);
    for (let i = 0; i < 7; i++) glyph(b, 'glow', M([s * (xs + 0.0003), AY - 0.009, -0.105 - i * 0.075], [0, s * Math.PI / 2, 0]), 0.008, C.white, 1.1);
  }
  // кромка: лента от края наружу с затуханием (аддитивная)
  const edgePts = prof.map(([u, v]) => [u, v]);
  const pos = [], col = [];
  const nrm = edgePts.map((p, i) => {
    const a = edgePts[Math.max(0, i - 1)], c2 = edgePts[Math.min(edgePts.length - 1, i + 1)];
    const tx = c2[0] - a[0], ty = c2[1] - a[1], l = Math.hypot(tx, ty) || 1;
    let nx = ty / l, ny = -tx / l;
    if (nx * (p[0] - 0.4) + ny * p[1] < 0) { nx = -nx; ny = -ny; }
    return [nx, ny];
  });
  const W0 = bev - 0.0025;
  const wOut = (u) => bev + 0.006 + 0.012 * (u / BL) * (u / BL);
  for (let i = 0; i < edgePts.length - 1; i++) {
    const p = edgePts[i], q = edgePts[i + 1], np = nrm[i], nq = nrm[i + 1];
    const pi = [p[0] + np[0] * W0, p[1] + np[1] * W0], po = [p[0] + np[0] * wOut(p[0]), p[1] + np[1] * wOut(p[0])];
    const qi = [q[0] + nq[0] * W0, q[1] + nq[1] * W0], qo = [q[0] + nq[0] * wOut(q[0]), q[1] + nq[1] * wOut(q[0])];
    for (const [pt, k] of [[pi, 1], [po, 0], [qi, 1], [qi, 1], [po, 0], [qo, 0]]) {
      pos.push(0, AY + pt[1], -pt[0]);
      col.push(k, k, k);
    }
  }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  eg.computeVertexNormals();
  const geos = b.merge();
  eg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geos.edge = eg;
  return {
    id: 'blade', geos, muzzle: [0, AY, -BL - bev], tip: [0, AY, -BL - bev], base: [0, AY, -0.02],
    sight: [0, AY + 0.04, 0.05], eyeDist: 0.3,
    halo: { s: 0.06, idle: 0 }, kick: { back: 0, pitch: 0, ret: 0.1 },
  };
}

// ======================= лук рун =======================
function buildBow() {
  const b = makeBatch();
  const AYB = 0.015; // ось стрелы
  addGrip(b, C.navy, C.leatherDark, C.gold, 0.1);
  // рукоять-рамка: нижняя часть, окно-кольцо для стрелы, верхняя часть
  const gb = gp(-0.046), gt = gp(0.05);
  const riserW = (t) => 0.013 - 0.003 * Math.abs(t - 0.5);
  b.add('metal', sweep([[-0.178, 0.044], [-0.15, 0.064], [gb[1] - 0.004, gb[2] + 0.002]], { segs: 12, radial: 10, a: riserW, b: 0.012 }), null, C.gold);
  const RW = 0.022, WC = [0, AYB, 0.06];
  b.add('metal', new THREE.TorusGeometry(RW, 0.0052, 8, 28), M(WC), C.gold);
  b.add('glow', new THREE.TorusGeometry(RW - 0.0045, 0.0012, 4, 28), M([WC[0], WC[1], WC[2] + 0.004]), C.white);
  b.add('metal', sweep([[gt[1] - 0.006, gt[2] + 0.002], [-0.012, 0.062], [WC[1] - RW, 0.06]], { segs: 6, radial: 10, a: 0.012, b: 0.011 }), null, C.goldDark);
  b.add('metal', sweep([[WC[1] + RW, 0.058], [0.075, 0.051], [0.14, 0.041], [0.2, 0.036]], { segs: 14, radial: 10, a: riserW, b: 0.011 }), null, C.gold);
  // полка под стрелу
  b.add('metal', new THREE.BoxGeometry(0.008, 0.003, 0.02), M([0, AYB - 0.007, 0.06]), C.goldDark);
  // руна-прицел над окном: оправа
  const LP = [0, 0.082, 0.064];
  b.add('metal', new THREE.TorusGeometry(0.0195, 0.0026, 6, 28), M(LP), C.gold);
  b.add('glow', new THREE.TorusGeometry(0.0235, 0.0009, 4, 32), M([LP[0], LP[1], LP[2] + 0.001]), C.white);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    glyph(b, 'glow', M([LP[0] + Math.cos(a) * 0.0265, LP[1] + Math.sin(a) * 0.0265, LP[2] + 0.001], [0, 0, a - Math.PI / 2]), 0.005);
  }
  b.add('matte', new THREE.CircleGeometry(0.0196, 24), M([LP[0], LP[1], LP[2] - 0.003], [0, Math.PI, 0]), C.darkSteel);
  // плечи: от корня вверх/вниз с выгибом вперёд и загибом концов
  const up = [[0.2, 0.036], [0.32, 0.03], [0.45, 0.06], [0.57, 0.13], [0.645, 0.205], [0.672, 0.232], [0.70, 0.222]];
  const dn = [[-0.175, 0.046], [-0.295, 0.036], [-0.425, 0.062], [-0.545, 0.13], [-0.62, 0.205], [-0.645, 0.232], [-0.672, 0.222]];
  const la = (t) => 0.019 - 0.011 * t, lb = (t) => 0.0085 - 0.004 * t;
  for (const pts of [up, dn]) {
    b.add('matte', sweep(pts, { segs: 36, radial: 10, a: la, b: lb }), null, C.ivory);
    // золотые канты по краям
    for (const s of [-1, 1]) {
      const cp = offsetPts(pts, 0, 24).map((p) => [p[0], p[1]]);
      b.add('metal', sweep(cp, { segs: 30, radial: 5, a: 0.0019, b: (t) => lb(t) * 0.9, x: (t) => s * (la(t) - 0.0012) }), null, C.gold);
    }
    // светящаяся жилка и руны на стороне к игроку
    const op = offsetPts(pts, (t) => lb(t) + 0.0004, 24);
    b.add('glow', sweep(op.map((p) => [p[0], p[1]]), { segs: 30, radial: 4, a: 0.0012, b: 0.0006 }), null, C.white, { mul: 0.7 });
    for (let i = 0; i < 7; i++) {
      const p = op[3 + i * 3];
      const ang = Math.atan2(p[3], p[4]); // нормаль (ny, nz) → поворот плоскости глифа к +Z
      glyph(b, 'glow', M([0, p[0] + p[3] * 0.0004, p[1] + p[4] * 0.0004], [-ang, 0, 0]), 0.011 - i * 0.0007, C.white, 1.1);
    }
    // наконечники плеч и корневые накладки
    const e = pts[pts.length - 1], r = pts[0];
    b.add('metal', new THREE.SphereGeometry(0.0075, 10, 8), M([0, e[0], e[1]]), C.goldDark);
    b.add('metal', new THREE.ConeGeometry(0.006, 0.026, 8), M([0, e[0] + Math.sign(e[0]) * 0.014, e[1] - 0.004], [Math.sign(e[0]) > 0 ? -0.3 : Math.PI + 0.3, 0, 0]), C.gold);
    b.add('metal', new THREE.SphereGeometry(0.017, 12, 8), M([0, r[0], r[1]], [0, 0, 0], [0.95, 1.2, 0.9]), C.gold);
    // «перья» у корня
    const sg = Math.sign(r[0]);
    for (const s of [-1, 1]) {
      b.add('metal', tube3([[s * 0.012, r[0], r[1]], [s * 0.035, r[0] + sg * 0.03, r[1] + 0.01], [s * 0.03, r[0] + sg * 0.075, r[1] + 0.012], [s * 0.012, r[0] + sg * 0.11, r[1] + 0.004]], 0.0022, 14), null, C.goldDark);
    }
  }
  // стрела (локально: хвост в 0, летит в −Z)
  const a = makeBatch();
  const AL = 0.78;
  const sh = new THREE.CylinderGeometry(0.0028, 0.0028, AL, 6, 1); sh.rotateX(Math.PI / 2); sh.translate(0, 0, -AL / 2);
  a.add('arrow', sh, null, C.white, { mul: 0.45 });
  a.add('arrow', crystalGeo(0.007, 0.05, 0.014, 0.0, 4), M([0, 0, -AL - 0.008]), C.white, { shade: true, mul: 1.3 });
  a.add('arrow', new THREE.SphereGeometry(0.0045, 8, 6), M([0, 0, 0.002]), C.white, { mul: 0.9 });
  const vane = new THREE.BufferGeometry();
  vane.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.012, 0, 0.016, -0.03, 0, 0, -0.1, 0, 0, -0.012, 0, 0, -0.1, 0, 0.016, -0.03], 3));
  vane.computeVertexNormals();
  for (let i = 0; i < 3; i++) a.add('arrow', vane, M([0, 0, 0], [0, 0, (i * TAU) / 3]), C.white, { mul: 0.85, keep: true });
  vane.dispose();
  const geos = b.merge();
  geos.arrow = a.merge().arrow;
  return {
    id: 'bow', geos, muzzle: [0, AYB, 0.05], sight: [LP[0], LP[1], LP[2]], eyeDist: 0.3,
    lens: { r: 0.018, p: [LP[0], LP[1], LP[2] + 0.0005] },
    stringTop: [0, 0.672, 0.232], stringBot: [0, -0.645, 0.232], nock: [0, AYB, 0.255],
    halo: { s: 0.07, idle: 0 }, kick: { back: 0.006, pitch: 0.02, ret: 0.1 },
  };
}

// ======================= перчатка ки =======================
function buildGauntlet() {
  const b = makeBatch();
  const G = [GRIP.x, GRIP.y, GRIP.z];
  const fp = (x, y, z) => [G[0] + x, G[1] + y, G[2] + z];
  const th0 = Math.PI / 2 - 0.42, thL = Math.PI + 0.84;
  // пластины вокруг кулака (открыты сзади)
  const bands = [[0.03, 0.022, 0.06, 0.064], [0.004, 0.024, 0.065, 0.066], [-0.022, 0.024, 0.066, 0.062], [-0.044, 0.016, 0.06, 0.054]];
  for (const [y, h, rt, rb] of bands) {
    b.add('metal', new THREE.CylinderGeometry(rt, rb, h, 22, 1, true, th0, thL), M(fp(0, y, 0.004), [0, 0, 0], [1, 1, 0.92]), C.armor);
    b.add('matte', new THREE.CylinderGeometry(rt - 0.003, rb - 0.003, h, 22, 1, true, th0, thL), M(fp(0, y, 0.004), [0, 0, 0], [1, 1, 0.92]), C.leatherDark);
    b.add('metal', arcXZ(Math.max(rt, rb) + 0.0005, 0.0022, th0, thL, 26), M(fp(0, y + h / 2 - 0.001, 0.004), [0, 0, 0], [1, 1, 0.92]), C.gold);
  }
  // светящиеся швы между пластинами
  for (const y of [0.017, -0.009]) b.add('glow', arcXZ(0.0665, 0.0011, th0 + 0.1, thL - 0.2, 26), M(fp(0, y, 0.004), [0, 0, 0], [1, 1, 0.92]), C.white, { mul: 0.9 });
  // крышка над кулаком
  b.add('metal', new THREE.SphereGeometry(0.062, 22, 6, th0 + Math.PI / 2, thL, 0, 0.55), M(fp(0, 0.031, 0.004), [0, 0, 0], [1, 0.55, 0.92]), C.armor);
  // костяшки-гребни
  for (let i = 0; i < 4; i++) {
    const x = -0.027 + i * 0.018;
    b.add('metal', new THREE.ConeGeometry(0.006, 0.014, 4), M(fp(x, 0.046, -0.05), [-1.0, 0, 0]), C.gold);
  }
  // камень ки спереди + оправа
  const KC = fp(0, -0.002, -0.07);
  b.add('metal', new THREE.TorusGeometry(0.03, 0.0055, 8, 30), M([KC[0], KC[1], KC[2] + 0.006]), C.gold);
  b.add('metal', latheZ([[0.034, 0], [0.034, 0.004], [0.026, 0.008]], 24), M([KC[0], KC[1], KC[2] + 0.014]), C.goldDark);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    b.add('metal', new THREE.ConeGeometry(0.0045, 0.016, 4), M([KC[0] + Math.cos(a) * 0.038, KC[1] + Math.sin(a) * 0.038, KC[2] + 0.006], [0, 0, a - Math.PI / 2]), C.gold);
  }
  b.add('crystal', latheZ([[0.0001, -0.008], [0.024, -0.006], [0.0275, 0.0], [0.022, 0.011], [0.011, 0.017], [0.0001, 0.019]], 10), null, C.white, { shade: true, mul: 1.05 });
  // наруч вдоль предплечья
  const fd = [0, -Math.sin(0.35), Math.cos(0.35)], bx = Math.atan2(fd[2], fd[1]);
  const at = (d, y = 0) => fp(0, 0.006 + fd[1] * d + y, 0.07 + fd[2] * d);
  b.add('metal', new THREE.CylinderGeometry(0.056, 0.05, 0.13, 22, 1, true), M(at(0.075), [bx, 0, 0], [1, 1, 0.9]), C.armor);
  b.add('matte', new THREE.CylinderGeometry(0.053, 0.047, 0.13, 22, 1, true), M(at(0.075), [bx, 0, 0], [1, 1, 0.9]), C.leather);
  for (const [d, r] of [[0.012, 0.051], [0.075, 0.054], [0.138, 0.057]]) b.add('metal', new THREE.TorusGeometry(r, 0.0032, 6, 28), M(at(d), [bx + Math.PI / 2, 0, 0], [1, 0.9, 1]), C.gold);
  // светящиеся линии на наруче
  for (const a of [Math.PI / 2, Math.PI / 2 + 0.9, Math.PI / 2 - 0.9, -Math.PI / 2 + 0.6, -Math.PI / 2 - 0.6]) {
    for (const [d0, d1] of [[0.02, 0.068], [0.082, 0.13]]) {
      const r0 = 0.0515 + 0.003 * d0 / 0.13, r1 = 0.0515 + 0.003 * d1 / 0.13;
      const ca = Math.cos(a), sa = Math.sin(a);
      // радиальное направление в сечении наруча: X и «вверх» поперёк оси
      const uy = Math.cos(0.35), uz = Math.sin(0.35);
      const p0 = at(d0), p1 = at(d1);
      b.add('glow', tube3([[p0[0] + ca * r0, p0[1] + sa * r0 * 0.9 * uy, p0[2] + sa * r0 * 0.9 * uz], [p1[0] + ca * r1, p1[1] + sa * r1 * 0.9 * uy, p1[2] + sa * r1 * 0.9 * uz]], 0.0011, 2), null, C.white, { mul: 0.9 });
    }
  }
  // малый камень на наруче
  const TS = at(0.075, 0.0);
  const top = [TS[0], TS[1] + 0.054 * 0.9 * Math.cos(0.35), TS[2] + 0.054 * 0.9 * Math.sin(0.35)];
  b.add('metal', new THREE.TorusGeometry(0.012, 0.0028, 6, 20), M(top, [-Math.PI / 2 + 0.35, 0, 0]), C.gold);
  b.add('glow', crystalGeo(0.0105, 0.009, 0.003, 0.0015, 8), M(top, [-Math.PI / 2 + 0.35 - Math.PI, 0, 0]), C.white, { shade: true, mul: 1.15 });
  const g = b.merge();
  return {
    id: 'gauntlet', geos: g, crystalPos: KC, crystalSpin: 0,
    muzzle: fp(0, -0.002, -0.11), sight: fp(0, 0.075, 0.0), eyeDist: 0.34,
    halo: { s: 0.1, idle: 0.3 }, kick: { back: 0.02, pitch: 0.05, ret: 0.14 },
  };
}

const BUILD = { wand: buildWand, staff: buildStaff, blade: buildBlade, bow: buildBow, gauntlet: buildGauntlet };
const DEFS = {};
const getDef = (id) => DEFS[id] || (DEFS[id] = BUILD[id]());

// ---------- материалы ----------
const SHARED = {};
function sharedMats(low) {
  const k = low ? 'low' : 'std';
  if (SHARED[k]) return SHARED[k];
  const side = THREE.DoubleSide;
  return (SHARED[k] = low
    ? {
      metal: new THREE.MeshLambertMaterial({ vertexColors: true, side, emissive: 0x2a1c08 }),
      matte: new THREE.MeshLambertMaterial({ vertexColors: true, side }),
    }
    : {
      metal: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.65, roughness: 0.32, side, emissive: 0x2a1c0c }),
      matte: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.0, roughness: 0.7, side }),
    });
}

// ореол: мягкое пятно + четырёхлучевая искра (лениво, только в браузере)
let haloTex;
function getHaloTex() {
  if (haloTex !== undefined) return haloTex;
  if (typeof document === 'undefined') return (haloTex = null);
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.12, 'rgba(255,255,255,0.8)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.22)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  for (const [w, l, a] of [[5, 62, 0], [5, 62, Math.PI / 2], [3, 34, Math.PI / 4], [3, 34, -Math.PI / 4]]) {
    g.save(); g.translate(64, 64); g.rotate(a);
    const lg = g.createLinearGradient(-l, 0, l, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.9)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(-l, 0); g.quadraticCurveTo(0, -w, l, 0); g.quadraticCurveTo(0, w, -l, 0); g.fill();
    g.restore();
  }
  haloTex = new THREE.CanvasTexture(c);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  return haloTex;
}

// ---------- GLB (через js/fantasy/assets.js, если он и файл есть) ----------
const GLB = {};
function getGLB(id) {
  if (!GLB[id]) {
    GLB[id] = import('./assets.js')
      .then((m) => (m && m.loadModel ? m.loadModel(id) : null))
      .catch(() => null);
  }
  return GLB[id];
}

// ======================= сборка экземпляра =======================
export function createFantasyGun(id, { color = 0x7fd8ff, quality } = {}) {
  if (!BUILD[id]) return null;
  const def = getDef(id);
  const sm = sharedMats(quality && quality.id === 'low');
  const col = new THREE.Color(color);
  const elemCol = new THREE.Color(ELEMENT_COLORS.fire);
  let element = 'fire';
  const accent = () => (id === 'staff' ? elemCol : col);

  // иерархия: group → pose (вокруг рукояти) → recoil → body (координаты group)
  const group = new THREE.Group(); group.name = 'fantasy-' + id;
  const pose = new THREE.Group(); pose.position.copy(GRIP);
  const recoil = new THREE.Group();
  const body = new THREE.Group(); body.position.copy(GRIP).negate();
  group.add(pose); pose.add(recoil); recoil.add(body);
  const vis = new THREE.Group(); vis.name = 'procedural'; body.add(vis);

  // материалы экземпляра (цвет анимируется)
  const glowMat = new THREE.MeshBasicMaterial({ color: accent(), vertexColors: true, toneMapped: false, side: THREE.DoubleSide });
  const crystalMat = new THREE.MeshBasicMaterial({ color: accent(), vertexColors: true, toneMapped: false, side: THREE.DoubleSide });
  const ringsMat = new THREE.MeshBasicMaterial({
    color: accent(), vertexColors: true, toneMapped: false, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const edgeMat = new THREE.MeshBasicMaterial({
    color: accent(), vertexColors: true, toneMapped: false, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });

  let crystal = null, rings = null, arrow = null, edge = null, gem = null;
  const G = def.geos;
  for (const key in G) {
    let mesh;
    if (key === 'metal' || key === 'matte') mesh = new THREE.Mesh(G[key], sm[key]);
    else if (key === 'glow') mesh = new THREE.Mesh(G[key], glowMat);
    else if (key === 'crystal') { mesh = crystal = new THREE.Mesh(G[key], crystalMat); mesh.position.fromArray(def.crystalPos); }
    else if (key === 'gem') mesh = gem = new THREE.Mesh(G[key], crystalMat);
    else if (key === 'rings') { mesh = rings = new THREE.Mesh(G[key], ringsMat); mesh.position.fromArray(def.ringsPos); }
    else if (key === 'edge') { mesh = edge = new THREE.Mesh(G[key], edgeMat); mesh.renderOrder = 2; }
    else if (key === 'arrow') { mesh = arrow = new THREE.Mesh(G[key], glowMat); mesh.visible = false; }
    if (!mesh) continue;
    mesh.name = id + '-' + key;
    (key === 'arrow' ? body : vis).add(mesh);
  }
  if (crystal) crystal.name = 'crystal';

  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle';
  muzzle.position.fromArray(def.muzzle); body.add(muzzle);

  // ореол у дула
  const haloMat = new THREE.SpriteMaterial({
    map: getHaloTex(), color: accent().clone(), blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, opacity: 0, toneMapped: false,
  });
  const halo = new THREE.Sprite(haloMat); halo.name = id + '-halo';
  halo.position.copy(muzzle.position);
  halo.visible = false;
  body.add(halo);

  // лук: тетива, точка натяжения, линза
  let string = null, lens = null, strAttr = null, stringMat = null;
  const top = new THREE.Vector3(), bot = new THREE.Vector3(), nock0 = new THREE.Vector3();
  if (id === 'bow') {
    top.fromArray(def.stringTop); bot.fromArray(def.stringBot); nock0.fromArray(def.nock);
    string = new THREE.Object3D(); string.name = 'string';
    string.position.copy(nock0); body.add(string);
    const sg = new THREE.BufferGeometry();
    strAttr = new THREE.BufferAttribute(new Float32Array(12), 3);
    strAttr.setUsage(THREE.DynamicDrawUsage);
    sg.setAttribute('position', strAttr);
    stringMat = new THREE.LineBasicMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.55), toneMapped: false, transparent: true, opacity: 0.95 });
    const lines = new THREE.LineSegments(sg, stringMat); lines.name = 'bow-string';
    lines.frustumCulled = false;
    body.add(lines);
    lens = new THREE.Mesh(def.lensGeo || (def.lensGeo = new THREE.CircleGeometry(def.lens.r, 28)), new THREE.MeshBasicMaterial({ color: 0x0c1a2c }));
    lens.name = 'lens';
    lens.position.fromArray(def.lens.p);
    body.add(lens);
  }

  // клинок: кончик и основание
  let tip = null, base = null;
  if (id === 'blade') {
    tip = new THREE.Object3D(); tip.name = 'tip'; tip.position.fromArray(def.tip); body.add(tip);
    base = new THREE.Object3D(); base.name = 'base'; base.position.fromArray(def.base); body.add(base);
  }

  // ---------- состояние ----------
  const st = { t: 0, kickT: 9, flashT: 0, flare: 0, charge: 0, draw: 0, mana: 1, vib: 0, walk: 0, sway: 0, spent: false };
  const kick = def.kick;
  const tmpC = new THREE.Color();

  function writeString(dx) {
    const a = strAttr.array, n = string.position;
    a[0] = top.x; a[1] = top.y; a[2] = top.z;
    a[3] = n.x + dx; a[4] = n.y; a[5] = n.z;
    a[6] = n.x + dx; a[7] = n.y; a[8] = n.z;
    a[9] = bot.x; a[10] = bot.y; a[11] = bot.z;
    strAttr.needsUpdate = true;
  }

  function setDraw(x) {
    st.draw = clamp01(x);
    if (!string) return;
    string.position.set(nock0.x, nock0.y, nock0.z + st.draw * 0.55);
    if (st.draw < 0.02) st.spent = false;
    if (arrow) {
      arrow.visible = st.draw >= 0.02 && !st.spent;
      arrow.position.copy(string.position);
    }
    writeString(0);
  }
  function setCharge(x) { st.charge = clamp01(x); }
  function setElement(el) {
    if (!ELEMENT_COLORS[el]) return;
    element = el;
    elemCol.setHex(ELEMENT_COLORS[el]);
  }
  function setColor(hex) {
    col.setHex(hex);
    if (stringMat) stringMat.color.copy(col).lerp(tmpC.setHex(0xffffff), 0.55);
  }

  function fire() {
    st.kickT = 0; st.flashT = FLASH; st.flare = 1;
    halo.visible = true;
    haloMat.rotation = Math.random() * TAU;
    if (id === 'bow') { st.spent = true; st.vib = 0.18; if (arrow) arrow.visible = false; }
  }

  function update(dt, s) {
    s = s || NO_STATE;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    st.t += dt; st.kickT += dt;
    if (s.element && s.element !== element) setElement(s.element);
    if (s.charge01 !== undefined) setCharge(s.charge01);
    if (s.draw01 !== undefined && s.draw01 !== st.draw) setDraw(s.draw01);
    st.mana += ((s.mana01 === undefined ? 1 : clamp01(s.mana01)) - st.mana) * Math.min(1, dt * 6);
    const t = st.t, ch = st.charge;

    // отдача: толчок и пружинный возврат
    let k = 0;
    if (st.kickT < 0.015) k = st.kickT / 0.015;
    else if (st.kickT < 0.015 + kick.ret) { const u = 1 - (st.kickT - 0.015) / kick.ret; k = u * u * (3 - 2 * u); }
    recoil.position.set(0, 0, kick.back * k);
    recoil.rotation.set(kick.pitch * k, 0, 0);

    // покачивание при ходьбе
    const aim = clamp01(s.aim);
    st.sway += (clamp01(s.moving) - st.sway) * Math.min(1, dt * 5);
    if (st.sway > 0.001) st.walk += dt * 8;
    const sa = st.sway * (1 - 0.85 * aim);
    pose.position.set(GRIP.x + Math.sin(st.walk) * 0.006 * sa, GRIP.y + (Math.cos(st.walk * 2) - 1) * 0.0035 * sa, GRIP.z);
    pose.rotation.set(Math.cos(st.walk * 2) * 0.012 * sa, 0, Math.sin(st.walk) * 0.035 * sa);

    // свечение: мана, заряд, вспышка
    if (st.flashT > 0) st.flashT -= dt;
    st.flare = Math.max(0, st.flare - dt / FLASH);
    const fl = st.flare;
    const lowMana = st.mana < 0.15 ? 0.6 + 0.4 * Math.sin(t * 18) : 1;
    const mk = (0.45 + 0.55 * st.mana) * lowMana;
    const ac = accent();
    const breathe = 0.9 + 0.1 * Math.sin(t * 2.2);
    glowMat.color.copy(ac).multiplyScalar(mk * breathe * (1 + ch * 0.5) + fl * 1.2);
    const pulse = ch > 0 ? 0.25 * ch * (0.5 + 0.5 * Math.sin(t * (6 + ch * 14))) : 0;
    crystalMat.color.copy(ac).multiplyScalar(0.85 * mk + 0.35 * ch + pulse + fl * 0.9);
    ringsMat.color.copy(ac).multiplyScalar(0.9 * mk + fl);
    if (edge) edgeMat.opacity = Math.min(1, (0.55 + 0.12 * Math.sin(t * 3.1) + 0.2 * ch) * mk + fl * 0.45);
    if (edge) edgeMat.color.copy(ac).multiplyScalar(1 + fl * 0.8);

    // кристалл и кольца
    if (crystal && def.crystalSpin) {
      crystal.rotation.z += dt * def.crystalSpin * (1 + ch * 3);
      if (id === 'staff') crystal.position.z = def.crystalPos[2] + Math.sin(t * 1.7) * 0.004;
    }
    if (rings) {
      rings.rotation.z += dt * (0.6 + ch * 2.5 + fl * 6);
      rings.rotation.y = Math.sin(t * 0.5) * 0.15;
    }

    // ореол
    const H = def.halo;
    const hp = 1 + 0.08 * Math.sin(t * (4 + ch * 12));
    const hs = H.s * (1 + ch * 1.8 + fl * 1.3) * hp;
    const ha = Math.min(1, H.idle * mk + ch * 0.55 + fl);
    halo.visible = ha > 0.01;
    if (halo.visible) {
      halo.scale.set(hs, hs, hs);
      haloMat.opacity = ha;
      haloMat.color.copy(ac).lerp(tmpC.setRGB(1, 1, 1), 0.25 + 0.35 * fl);
      haloMat.rotation += dt * (0.4 + ch * 2);
    }

    // лук: дрожание тетивы после выстрела
    if (string && st.vib > 0) {
      st.vib -= dt;
      const v = st.vib > 0 ? st.vib / 0.18 : 0;
      writeString(Math.sin(st.vib * 140) * 0.006 * v);
    }
  }

  const gun = {
    id, group, muzzle, ejector: null,
    sight: new THREE.Vector3().fromArray(def.sight), eyeDist: def.eyeDist,
    lens, fire, update, setElement, setCharge, setDraw, setColor,
  };
  if (string) gun.string = string;
  if (tip) { gun.tip = tip; gun.base = base; }
  if (id === 'staff') gun.crystal = crystal;
  if (string) setDraw(0);
  update(0);

  // GLB: подмена процедурного визуала, если модель есть
  getGLB(id).then((src) => {
    if (!src) return;
    const obj = src.clone(true);
    obj.position.copy(GRIP);           // (0,0,0) модели — центр рукояти
    obj.updateMatrixWorld(true);       // без родителя: мировые = координаты body
    const pick = (name) => obj.getObjectByName(name);
    const P = new THREE.Vector3();
    const n1 = pick('Muzzle'); if (n1) { n1.getWorldPosition(P); muzzle.position.copy(P); halo.position.copy(P); }
    const n3 = pick('Tip'); if (n3 && tip) tip.position.copy(n3.getWorldPosition(P));
    if (string) {
      const n2 = pick('String'); if (n2) nock0.copy(n2.getWorldPosition(P));
      const nt = pick('StringTop'); if (nt) top.copy(nt.getWorldPosition(P));
      const nb = pick('StringBottom'); if (nb) bot.copy(nb.getWorldPosition(P));
      setDraw(st.draw);
    }
    let c = pick('Crystal');
    if (c && !c.isMesh) c.traverse((o) => { if (!c.isMesh && o.isMesh) c = o; });
    if (c && c.isMesh && id === 'staff') {
      c.material = c.material.clone();
      const m = c.material;
      const paint = () => { if (m.emissive) m.emissive.copy(elemCol); else if (m.color) m.color.copy(elemCol); };
      paint();
      const prev = gun.setElement;
      gun.setElement = (el) => { prev(el); paint(); };
      gun.crystal = c;
      const u0 = gun.update;
      let last = element;
      gun.update = (dt, s) => { u0(dt, s); if (element !== last) { last = element; paint(); } };
    }
    vis.visible = false;
    body.add(obj);
  }).catch(() => {});

  return gun;
}
