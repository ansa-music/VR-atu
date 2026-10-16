// Огнестрельное оружие «VR Тир»: ПМ, АК-74М, МР-133, СВ-98 и обёртка бластера.
// Геометрия процедурная: собирается один раз на тип и сливается по узлам и материалам.
// Координаты как в weapon.js: метры, вперёд -Z, вверх +Y, рукоять в GRIP.
import * as THREE from 'three';
import { createWeapon, GRIP as BLASTER_GRIP } from './weapon.js';

export const GRIP = BLASTER_GRIP;
export const GUN_IDS = ['pm', 'ak', 'shotgun', 'sniper', 'blaster'];

// профиль рукояти бластера (u — вперёд, v — вверх): у всех стволов одна рукоять — под перчатку
const GRIP_PTS = [
  [-0.045, -0.006], [-0.052, -0.035], [-0.05, -0.05], [-0.06, -0.072], [-0.068, -0.1],
  [-0.074, -0.106], [-0.113, -0.106], [-0.118, -0.1], [-0.1, -0.04], [-0.09, -0.006],
];

const NO_STATE = Object.freeze({});
const clamp01 = (x) => (x > 0 ? (x < 1 ? x : 1) : 0);
const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const win = (x, a, b, c, d) => ss(a, b, x) * (1 - ss(c, d, x));            // вход a→b, выход c→d
const bump = (x, a, b) => (x > a && x < b ? Math.sin(Math.PI * (x - a) / (b - a)) : 0);
const approach = (v, to, step) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));
// толчок: быстрый ход за rise, плавный возврат за ret
function pulse(t, rise, ret) {
  if (t < rise) return t / rise;
  if (t < rise + ret) { const u = 1 - (t - rise) / ret; return u * u * (3 - 2 * u); }
  return 0;
}

// ---------- общие текстуры ----------
let flashTex = null, checkTex = null;

function getFlashTex() {
  if (flashTex) return flashTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.16, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.42, 'rgba(255,255,255,0.22)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  // рваные лепестки пламени
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (i % 3) * 0.17;
    const len = 34 + ((i * 37) % 26);
    g.save(); g.translate(64, 64); g.rotate(a);
    const lg = g.createLinearGradient(0, 0, len, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0.75)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(0, -6); g.lineTo(len, 0); g.lineTo(0, 6); g.closePath(); g.fill();
    g.restore();
  }
  flashTex = new THREE.CanvasTexture(c);
  flashTex.colorSpace = THREE.SRGBColorSpace;
  return flashTex;
}

// насечка накладок ПМ (рельеф)
function getCheckTex() {
  if (checkTex) return checkTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#b4b4b4'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#1e1e1e'; g.lineWidth = 3;
  for (let i = -64; i <= 128; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke();
    g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke();
  }
  checkTex = new THREE.CanvasTexture(c);
  checkTex.wrapS = checkTex.wrapT = THREE.RepeatWrapping;
  checkTex.repeat.set(70, 70); // UV экструзии — в метрах
  return checkTex;
}

// ---------- геометрия ----------
function shape(pts, holes) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  if (holes) {
    for (const h of holes) {
      const p = new THREE.Path();
      p.moveTo(h[0][0], h[0][1]);
      for (let i = 1; i < h.length; i++) p.lineTo(h[i][0], h[i][1]);
      s.holes.push(p);
    }
  }
  return s;
}

// фаска внутрь: внешний контур совпадает с точками профиля
function extOpts(depth, bevel) {
  return bevel > 0
    ? { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelOffset: -bevel * 0.8, bevelSegments: 2, curveSegments: 6 }
    : { depth, bevelEnabled: false, curveSegments: 6 };
}

// профиль сбоку (u — вперёд, v — вверх) → экструзия по X, по центру
function side(pts, width, bevel = 0, holes = null) {
  const depth = width - bevel * 2;
  const g = new THREE.ExtrudeGeometry(shape(pts, holes), extOpts(depth, bevel));
  g.rotateY(Math.PI / 2);
  g.translate(-depth / 2, 0, 0);
  return g;
}

// как sideExtrude в weapon.js (фаска наружу) — для рукояти, чтобы она совпала с бластерной
function sideB(pts, width, bevel) {
  const depth = width - bevel * 2;
  const g = new THREE.ExtrudeGeometry(shape(pts), {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 4,
  });
  g.rotateY(Math.PI / 2);
  g.translate(-depth / 2, 0, 0);
  return g;
}

// сечение (x, y) → экструзия вдоль Z, по центру
function front(pts, len, bevel = 0) {
  const depth = len - bevel * 2;
  const g = new THREE.ExtrudeGeometry(shape(pts), extOpts(depth, bevel));
  g.translate(0, 0, -depth / 2);
  return g;
}

// тело вращения: профиль [r, h], h — вперёд (-Z) от точки установки
function lathe(prof, seg = 18) {
  const g = new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), seg);
  g.rotateX(-Math.PI / 2);
  return g;
}
// цилиндр вдоль Z (rRear — задний радиус), по центру
function cylZ(rRear, rFront, len, seg = 16, open = false) {
  const g = new THREE.CylinderGeometry(rRear, rFront, len, seg, 1, open);
  g.rotateX(Math.PI / 2);
  return g;
}
function cylX(r, len, seg = 10) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateZ(Math.PI / 2);
  return g;
}
const cylY = (r, len, seg = 10) => new THREE.CylinderGeometry(r, r, len, seg);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const sphere = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
// круг, смотрящий вперёд (-Z)
function discF(r, seg = 16) { const g = new THREE.CircleGeometry(r, seg); g.rotateY(Math.PI); return g; }
// кольцо вокруг оси Z
const ring = (R, r, seg = 24, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, 4, seg, arc);

function arcPts(cx, cy, rx, ry, a0, a1, n) {
  const p = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return p;
}
function roundRectPts(w, h, r, n = 4) {
  const p = [], x = w / 2 - r, y = h / 2 - r;
  for (const [cx, cy, a0] of [[x, y, 0], [-x, y, Math.PI / 2], [-x, -y, Math.PI], [x, -y, Math.PI * 1.5]]) {
    for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * (Math.PI / 2); p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  }
  return p;
}
// пятиконечная звезда в плоскости YZ (рельеф на накладке ПМ)
function starGeo(R, r, depth) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R;
    if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  return g;
}
// спусковой крючок (профиль), top — верх в коробке
function triggerGeo(top, w = 0.005) {
  return side([[-0.024, top], [-0.0255, -0.017], [-0.028, -0.023], [-0.032, -0.027], [-0.036, -0.0285],
    [-0.0365, -0.027], [-0.033, -0.0235], [-0.031, -0.018], [-0.0298, top]], w);
}

// слияние геометрий одного материала в один буфер
function mergeGeos(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of list) {
    const a = g.attributes, c = a.position.count;
    pos.set(a.position.array.subarray(0, c * 3), o * 3);
    if (a.normal) nor.set(a.normal.array.subarray(0, c * 3), o * 3);
    if (a.uv) uv.set(a.uv.array.subarray(0, c * 2), o * 2);
    o += c;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);

// «набор»: детали раскладываются по узлам (подвижным подгруппам) и материалам
function kit(nodeDefs) {
  const world = { body: new THREE.Matrix4() };   // матрицы узлов в координатах body
  for (const n of nodeDefs) {
    const p = n.pos || [0, 0, 0], r = n.rot || [0, 0, 0];
    _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(1, 1, 1));
    world[n.name] = world[n.parent || 'body'].clone().multiply(_m);
  }
  const inv = {};
  for (const key in world) inv[key] = world[key].clone().invert();
  const buckets = new Map();
  function put(node, mat, geo, m) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    const key = node + '|' + mat;
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(g);
  }
  return {
    // деталь в координатах body (поза покоя)
    add(node, mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
      _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
      put(node, mat, geo, inv[node].clone().multiply(_m));
    },
    // деталь в локальных координатах узла
    addL(node, mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
      _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(1, 1, 1));
      put(node, mat, geo, _m.clone());
    },
    // стержень между точками a и b (координаты body)
    rod(node, mat, a, b, r, seg = 8) {
      const va = new THREE.Vector3(a[0], a[1], a[2]), vb = new THREE.Vector3(b[0], b[1], b[2]);
      const len = va.distanceTo(vb);
      _q.setFromUnitVectors(_up, vb.clone().sub(va).normalize());
      _m.compose(va.add(vb).multiplyScalar(0.5), _q, _s.set(1, 1, 1));
      put(node, mat, new THREE.CylinderGeometry(r, r, len, seg), inv[node].clone().multiply(_m));
    },
    parts() {
      const out = [];
      for (const [key, list] of buckets) {
        const [node, mat] = key.split('|');
        out.push({ node, mat, geo: mergeGeos(list) });
      }
      return out;
    },
  };
}

// ---------- материалы (на экземпляр; tintWeapon всё равно клонирует их по мешам) ----------
// [цвет, metalness, roughness]; metalness ≥ 0.5 перекрашивается скином, остальное — нет
const MAT = {
  steel: [0x1d2128, 0.8, 0.4],
  dark: [0x121418, 0.7, 0.5],
  bright: [0x4a505a, 0.85, 0.3],
  alu: [0x1c1e23, 0.55, 0.5],
  black: [0x030304, 0, 1],
  polymer: [0x16171c, 0.1, 0.7],
  plum: [0x3b2a2e, 0.1, 0.6],
  bakelite: [0x4a2a18, 0.1, 0.45],
  laminate: [0x2c3029, 0.1, 0.55],
  rubber: [0x0e0f11, 0.05, 0.9],
  brass: [0xb8913f, 0.45, 0.3],
  copper: [0x9a5a34, 0.45, 0.35],
  red: [0x9c1f1a, 0.1, 0.5],
  glass: [0x0a1622, 0.3, 0.06],
};
function materials(color) {
  const col = new THREE.Color(color);
  const cache = {};
  return (key) => {
    if (cache[key]) return cache[key];
    let m;
    if (key === 'accent') {
      m = new THREE.MeshStandardMaterial({ color: 0x050608, emissive: col, emissiveIntensity: 2.2, roughness: 0.4 });
    } else {
      const [c, metalness, roughness] = MAT[key];
      m = new THREE.MeshStandardMaterial({ color: c, metalness, roughness });
      if (key === 'bakelite') { m.bumpMap = getCheckTex(); m.bumpScale = 1.5; }
    }
    return (cache[key] = m);
  };
}

// ======================= ПМ =======================
function buildPM() {
  const AY = 0.0085, SB = -0.007, TOP = 0.0175, SY = 0.0214, FT = -0.006;
  const nodes = [
    { name: 'slide' },
    { name: 'magBase', pos: [0, -0.058, 0.0805], rot: [-0.254, 0, 0] }, // вдоль наклона рукояти
    { name: 'mag', parent: 'magBase' },
  ];
  const k = kit(nodes);

  // --- затвор ---
  k.add('slide', 'steel', side([[0.0625, SB + 0.006], [0.0625, TOP - 0.0045], [0.0595, TOP - 0.0005], [0.0565, TOP],
    [-0.087, TOP], [-0.0915, TOP - 0.0035], [-0.0915, SB], [0.057, SB], [0.061, SB + 0.002]], 0.0255, 0.003));
  const ser = box(0.0007, 0.0135, 0.0011);
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) k.add('slide', 'steel', ser, s * 0.0129, SB + 0.0125, 0.0625 + i * 0.0028, 0.12);
  k.add('slide', 'black', box(0.0012, 0.0095, 0.019), 0.0124, AY + 0.0015, 0.003);     // окно выброса
  k.add('slide', 'bright', box(0.0012, 0.0055, 0.014), 0.0125, AY + 0.001, 0.0035);    // в окне — патронник
  k.add('slide', 'steel', box(0.0008, 0.0028, 0.0075), 0.013, AY + 0.0055, -0.0115);  // выбрасыватель
  k.add('slide', 'black', ring(0.0066, 0.0006, 16), 0, AY, -0.0627);                  // отверстие под ствол
  // мушка и целик
  k.add('slide', 'steel', side([[0.0555, TOP - 0.001], [0.054, SY], [0.0505, SY], [0.0485, TOP - 0.001]], 0.0032));
  k.add('slide', 'accent', box(0.0016, 0.0016, 0.0008), 0, SY - 0.0013, -0.0499);
  k.add('slide', 'steel', box(0.0135, 0.0028, 0.0065), 0, SY - 0.003, 0.0835);
  for (const s of [-1, 1]) k.add('slide', 'steel', box(0.0045, 0.0016, 0.0065), s * 0.00375, SY - 0.0008, 0.0835);
  // флажок предохранителя (слева сзади) и красная метка «огонь»
  k.add('slide', 'steel', cylX(0.0042, 0.0022, 14), -0.0136, AY + 0.004, 0.0795);
  k.add('slide', 'steel', box(0.0022, 0.0034, 0.012), -0.0138, AY + 0.0011, 0.0848, 0.5);
  k.add('slide', 'red', box(0.0007, 0.0022, 0.0022), -0.0129, AY + 0.0075, 0.072);
  // неоновые полосы по низу затвора
  for (const s of [-1, 1]) k.add('slide', 'accent', box(0.0006, 0.0011, 0.07), s * 0.01295, SB + 0.0055, -0.016);

  // --- рамка, спусковая скоба, крючок, курок ---
  k.add('body', 'steel', side([[0.058, FT], [0.058, -0.0125], [0.054, -0.0155], [0.006, -0.0155], [-0.047, -0.0135],
    [-0.062, -0.032], [-0.086, -0.012], [-0.0975, -0.0075], [-0.0975, FT]], 0.0235, 0.0015));
  k.add('body', 'steel', side([[0.020, -0.0125], [0.0165, -0.017], [0.0125, -0.024], [0.007, -0.031], [0.0, -0.037],
    [-0.009, -0.0415], [-0.020, -0.0435], [-0.032, -0.043], [-0.042, -0.0395], [-0.051, -0.0335], [-0.0505, -0.0285],
    [-0.0465, -0.0305], [-0.039, -0.035], [-0.030, -0.038], [-0.019, -0.0385], [-0.008, -0.0355], [-0.0005, -0.0305],
    [0.005, -0.0245], [0.0095, -0.0175], [0.0125, -0.0125]], 0.0085, 0.001));
  k.add('body', 'steel', triggerGeo(-0.012, 0.0045));
  k.add('body', 'steel', side([[-0.0855, FT + 0.002], [-0.0855, 0.0075], [-0.0885, 0.0145], [-0.0935, 0.0182],
    [-0.0978, 0.0158], [-0.0985, 0.0095], [-0.0955, 0.0035], [-0.0915, FT + 0.002]], 0.0085, 0.0007,
  [arcPts(-0.0932, 0.0108, 0.0021, 0.0021, 0, Math.PI * 2, 10).slice(0, 10)]));
  k.add('body', 'steel', box(0.0016, 0.0042, 0.016), -0.0124, -0.0105, 0.044);         // затворная задержка
  // ствол (неподвижен, виден при откате затвора)
  k.add('body', 'steel', cylZ(0.0058, 0.0058, 0.064, 14), 0, AY, -0.0314);
  k.add('body', 'black', discF(0.0041, 12), 0, AY, -0.0636);

  // --- рукоять: стальной остов + бакелитовые щёчки со звездой ---
  k.add('body', 'steel', sideB(GRIP_PTS, 0.022, 0.004));
  k.add('body', 'bakelite', sideB([[-0.053, -0.0115], [-0.0585, -0.035], [-0.0565, -0.05], [-0.066, -0.072],
    [-0.0735, -0.098], [-0.078, -0.1015], [-0.1135, -0.1015], [-0.1195, -0.097], [-0.1015, -0.04], [-0.0925, -0.0115]], 0.0285, 0.004));
  const star = starGeo(0.0042, 0.0017, 0.0006), ringE = ring(0.0058, 0.00075, 20);
  for (const s of [-1, 1]) {
    k.add('body', 'bakelite', star, s * 0.01435, -0.027, 0.077);
    k.add('body', 'bakelite', ringE, s * 0.01435, -0.027, 0.077, 0, Math.PI / 2, 0);
  }
  k.add('body', 'steel', ring(0.0038, 0.0009, 12), -0.0115, -0.1105, 0.113, 0, Math.PI / 2, 0); // антабка
  k.add('body', 'steel', box(0.009, 0.006, 0.0045), 0, -0.1035, 0.1205);                       // защёлка магазина

  // --- магазин (локальные координаты: -Y — вниз вдоль рукояти) ---
  k.addL('mag', 'steel', box(0.0105, 0.094, 0.0285));
  k.addL('mag', 'brass', cylZ(0.0046, 0.0046, 0.017, 10), 0, 0.05, 0.0045);
  k.addL('mag', 'copper', lathe([[0.0045, 0], [0.0045, 0.003], [0.0036, 0.0065], [0.002, 0.0085], [0, 0.0092]], 10), 0, 0.05, -0.004);
  k.add('mag', 'steel', box(0.0225, 0.003, 0.043), 0, -0.1105, 0.0935);                       // крышка — горизонтально

  return {
    id: 'pm', nodes, parts: k.parts(),
    muzzle: [0, AY, -0.064], ejector: [0.013, AY + 0.002, 0.004],
    sight: [0, SY, 0.087], eyeDist: 0.42,
    kick: { back: 0.025, pitch: 0.22, ret: 0.12, yaw: 0.02 },
    flashes: [
      { p: [0, AY, -0.074], s: [0.05, 0.05], c: 0xffd27a, rnd: true },
      { p: [0, AY, -0.088], s: [0.075, 0.075], c: 0xff8a2a, a: 0.6, rnd: true },
    ],
    flashDur: 0.055, cant: 0.06, sway: 1,
  };
}

// ======================= АК-74М =======================
function buildAK() {
  const AY = 0.025, RB = -0.008, RT = 0.034, SY = 0.062, GT = 0.044; // GT — ось газовой трубки
  const nodes = [
    { name: 'handle', pos: [0.0155, 0.031, -0.09] },
    { name: 'magBase', pos: [0, -0.004, -0.047] },
    { name: 'mag', parent: 'magBase' },
  ];
  const k = kit(nodes);

  // --- ствольная коробка и крышка ---
  k.add('body', 'steel', side([[0.118, RT], [0.118, 0.004], [0.106, RB], [-0.146, RB], [-0.15, RB + 0.004], [-0.15, RT]], 0.03, 0.0015));
  k.add('body', 'steel', front([[-0.0158, 0.029], ...arcPts(0, 0.034, 0.0158, 0.0142, Math.PI, 0, 12), [0.0158, 0.029]], 0.264, 0.0015), 0, 0, 0.02);
  const rib = ring(0.0161, 0.001, 14, Math.PI);
  for (let i = 0; i < 7; i++) k.add('body', 'steel', rib, 0, 0.034, 0.034 + i * 0.016, 0, 0, 0, 1, 0.9, 1); // рёбра крышки
  k.add('body', 'steel', box(0.009, 0.006, 0.006), 0, 0.037, 0.154);                       // кнопка крышки
  k.add('body', 'steel', side([[-0.15, 0.031], [-0.15, RB + 0.004], [-0.166, RB + 0.004], [-0.166, 0.029]], 0.034, 0.002));
  k.add('body', 'steel', box(0.007, 0.026, 0.022), -0.018, 0.012, 0.158);                  // шарнир приклада
  k.add('body', 'steel', box(0.004, 0.013, 0.075), -0.0165, 0.013, 0.015);                 // боковая планка
  const rivet = sphere(0.0021, 8, 6);
  for (const [y, z] of [[0.003, -0.108], [0.017, -0.108], [0.003, -0.096], [0.017, -0.096], [0.006, 0.141], [0.02, 0.141], [0.012, 0.13], [0.004, 0.022], [0.004, 0.05]]) {
    for (const s of [-1, 1]) k.add('body', 'bright', rivet, s * 0.015, y, z, 0, 0, 0, 0.45, 1, 1);
  }
  k.add('body', 'black', box(0.0012, 0.0095, 0.066), 0.0151, 0.0245, -0.043);               // окно выброса
  k.add('body', 'black', box(0.0012, 0.0032, 0.137), 0.0151, 0.0292, -0.0285);              // паз рукоятки под крышкой
  // переводчик огня (справа), положение «АВ»
  k.add('body', 'steel', side([[0.004, 0.0055], [0.004, -0.0055], [0.03, -0.0042], [0.098, -0.0032], [0.104, -0.0115],
    [0.1095, -0.0115], [0.1085, 0.003], [0.03, 0.0042]], 0.0016), 0.0161, 0.027, 0.125, -0.28);
  k.add('body', 'steel', cylX(0.0062, 0.003, 14), 0.016, 0.027, 0.125);

  // --- рукоятка затворной рамы (подвижная) ---
  k.add('handle', 'bright', box(0.0012, 0.0028, 0.016), 0.0156, 0.0292, -0.08);
  k.add('handle', 'steel', box(0.016, 0.0055, 0.0075), 0.0232, 0.0285, -0.09);
  k.add('handle', 'steel', sphere(0.0052), 0.0322, 0.0292, -0.09, 0, 0, 0, 1, 1, 1.25);

  // --- прицельная колодка и планка ---
  k.add('body', 'steel', side([[0.112, RT + 0.002], [0.112, 0.012], [0.118, 0.009], [0.166, 0.011], [0.17, 0.028],
    [0.17, 0.05], [0.16, 0.056], [0.114, 0.056]], 0.026, 0.0015));
  k.add('body', 'steel', box(0.012, 0.0025, 0.054), 0, 0.05725, -0.1385);
  k.add('body', 'steel', box(0.016, 0.004, 0.01), 0, 0.059, -0.148);                       // хомутик
  for (const s of [-1, 1]) k.add('body', 'steel', box(0.0022, 0.004, 0.006), s * 0.0091, 0.059, -0.148);
  k.add('body', 'steel', box(0.015, 0.0035, 0.002), 0, SY - 0.00475, -0.109);              // целик: прорезь 3 мм
  for (const s of [-1, 1]) k.add('body', 'steel', box(0.0057, 0.003, 0.002), s * 0.00435, SY - 0.0015, -0.109);

  // --- ствол, цевьё, газовая трубка ---
  k.add('body', 'steel', cylZ(0.0092, 0.0078, 0.317, 14), 0, AY, -0.3265);
  k.add('body', 'plum', front([[-0.0225, AY + 0.008], [-0.0235, AY - 0.006], [-0.0205, AY - 0.018], [-0.012, AY - 0.025],
    [0, AY - 0.027], [0.012, AY - 0.025], [0.0205, AY - 0.018], [0.0235, AY - 0.006], [0.0225, AY + 0.008]], 0.177, 0.003), 0, 0, -0.2565);
  for (const s of [-1, 1]) {
    k.add('body', 'plum', box(0.0016, 0.0022, 0.15), s * 0.0237, AY - 0.001, -0.257);
    k.add('body', 'plum', box(0.0016, 0.0022, 0.15), s * 0.0226, AY - 0.012, -0.257);
    k.add('body', 'accent', box(0.0008, 0.0012, 0.15), s * 0.0232, AY + 0.0045, -0.257);
  }
  k.add('body', 'steel', front([[-0.0238, AY + 0.009], [-0.0248, AY - 0.006], [-0.0216, AY - 0.019], [-0.0126, AY - 0.0265],
    [0, AY - 0.0285], [0.0126, AY - 0.0265], [0.0216, AY - 0.019], [0.0248, AY - 0.006], [0.0238, AY + 0.009]], 0.012, 0.001), 0, 0, -0.351);
  k.add('body', 'plum', front([[-0.0145, AY + 0.008], ...arcPts(0, GT, 0.0145, 0.0123, Math.PI, 0, 12), [0.0145, AY + 0.008]], 0.16, 0.002), 0, 0, -0.25);
  k.add('body', 'steel', cylZ(0.0082, 0.0082, 0.07, 12), 0, GT, -0.363);
  k.add('body', 'steel', side([[0.395, 0.0135], [0.395, 0.04], [0.398, 0.0545], [0.412, 0.0545], [0.422, 0.042], [0.422, 0.0135]], 0.021, 0.002));
  k.add('body', 'steel', ring(0.0055, 0.0011, 12), -0.0115, AY - 0.006, -0.409, 0, Math.PI / 2, 0);

  // --- мушка ---
  k.add('body', 'steel', side([[0.45, 0.0165], [0.456, 0.04], [0.462, 0.047], [0.48, 0.047], [0.486, 0.031], [0.486, 0.0165]], 0.017, 0.002));
  k.add('body', 'steel', box(0.01, 0.006, 0.02), 0, 0.013, -0.47);                         // упор штыка
  const ear = side([[0.461, 0.046], [0.461, 0.062], [0.464, 0.066], [0.4745, 0.066], [0.4775, 0.062], [0.4775, 0.046]], 0.002);
  for (const s of [-1, 1]) k.add('body', 'steel', ear, s * 0.0074, 0, 0);
  k.add('body', 'steel', cylY(0.0035, 0.003, 10), 0, 0.0485, -0.469);
  k.add('body', 'steel', cylY(0.0011, 0.013, 8), 0, 0.0545, -0.469);
  k.add('body', 'accent', cylY(0.0013, 0.002, 8), 0, SY - 0.001, -0.469);

  // --- дульный тормоз АК-74 ---
  k.add('body', 'steel', lathe([[0.0078, 0], [0.0108, 0.0015], [0.0108, 0.01], [0.0122, 0.012], [0.0122, 0.08], [0.0112, 0.084], [0.0062, 0.084]], 18), 0, AY, -0.483);
  k.add('body', 'black', discF(0.0064, 14), 0, AY, -0.5668);
  for (const s of [-1, 1]) k.add('body', 'black', box(0.003, 0.0085, 0.016), s * 0.0112, AY, -0.528);
  for (const z of [-0.546, -0.554, -0.562]) k.add('body', 'black', cylY(0.0016, 0.004, 8), -0.004, AY + 0.0113, z, 0, 0, 0.35);
  k.add('body', 'black', box(0.0255, 0.0035, 0.007), 0, AY, -0.5635);

  // --- рукоять, скоба, спуск, защёлка ---
  k.add('body', 'plum', sideB(GRIP_PTS, 0.026, 0.004));
  k.add('body', 'steel', side([[0.016, RB + 0.002], [0.016, -0.027], [0.011, -0.0345], [-0.05, -0.0345], [-0.0525, -0.031],
    [-0.049, -0.0305], [0.009, -0.0305], [0.0125, -0.026], [0.0125, RB + 0.002]], 0.01, 0.001));
  k.add('body', 'steel', triggerGeo(RB, 0.0055));
  k.add('body', 'steel', box(0.011, 0.012, 0.0035), 0, -0.016, -0.0195, -0.25);

  // --- приклад (разложен) ---
  k.add('body', 'plum', side([[-0.164, 0.031], [-0.164, -0.003], [-0.2, -0.024], [-0.357, -0.117], [-0.366, -0.121],
    [-0.366, -0.001], [-0.357, 0.007], [-0.2, 0.027]], 0.036, 0.006));
  k.add('body', 'rubber', side([[-0.3655, 0], [-0.3655, -0.122], [-0.376, -0.125], [-0.376, 0.001]], 0.038, 0.003));
  for (const s of [-1, 1]) k.add('body', 'accent', box(0.0008, 0.0016, 0.15), s * 0.0183, 0.0063, 0.272, 0.12);

  // --- магазин 5,45 на 30 (изогнутый профиль) ---
  const R = 0.32, L = 0.205, A0 = 0.1, N = 12;
  const Cx = R * Math.cos(A0), Cy = R * Math.sin(A0);
  const fr = [], rr = [];
  for (let i = 0; i <= N; i++) {
    const s = (L * i) / N, a = A0 + s / R, nx = Math.cos(a), ny = Math.sin(a);
    const cx = Cx - R * nx, cy = Cy - R * ny, w = (0.05 - (0.004 * s) / L) / 2;
    fr.push([cx + nx * w, cy + ny * w]);
    rr.push([cx - nx * w, cy - ny * w]);
  }
  k.addL('mag', 'plum', side(fr.concat(rr.reverse()), 0.024, 0.003));
  const aL = A0 + L / R, bx = Cx - R * Math.cos(aL), by = Cy - R * Math.sin(aL);
  k.addL('mag', 'plum', box(0.027, 0.0055, 0.053), 0, by - Math.cos(aL) * 0.0015, -(bx + Math.sin(aL) * 0.0015), aL);
  k.addL('mag', 'plum', box(0.01, 0.006, 0.007), 0, -0.003, -0.0285);
  k.addL('mag', 'brass', cylZ(0.0049, 0.0049, 0.03, 10), 0, 0.003, -0.003);
  k.addL('mag', 'copper', lathe([[0.0028, 0], [0.0028, 0.006], [0.0018, 0.012], [0, 0.0145]], 10), 0, 0.003, -0.018);

  return {
    id: 'ak', nodes, parts: k.parts(),
    muzzle: [0, AY, -0.567], ejector: [0.017, 0.0255, -0.04],
    sight: [0, SY, -0.108], eyeDist: 0.3,
    kick: { back: 0.018, pitch: 0.05, ret: 0.07, yaw: 0.012 },
    flashes: [
      { p: [0, AY, -0.575], s: [0.035, 0.035], c: 0xffd27a, rnd: true },
      { p: [0.032, AY, -0.528], s: [0.075, 0.03], c: 0xffa040 },
      { p: [-0.032, AY, -0.528], s: [0.075, 0.03], c: 0xffa040 },
      { p: [-0.006, AY + 0.02, -0.554], s: [0.02, 0.04], c: 0xff9a30, a: 0.6 },
    ],
    flashDur: 0.05, cant: 0.04, sway: 1,
  };
}

// ======================= МР-133 =======================
function buildShotgun() {
  const AY = 0.036, RB = -0.012, RT = 0.0535, RIB = 0.055, TY = 0.0125; // TY — ось подствольного магазина
  const nodes = [
    { name: 'pump', pos: [0, TY, -0.325] },
    { name: 'shell', pos: [0, -0.022, -0.06], hidden: true },
  ];
  const k = kit(nodes);

  // --- ствольная коробка (алюминий) ---
  k.add('body', 'alu', side([[0.125, RT - 0.009], [0.121, RT - 0.002], [0.114, RT], [-0.097, RT], [-0.106, RT - 0.008],
    [-0.106, 0.004], [-0.098, RB], [0.118, RB], [0.125, RB + 0.007]], 0.034, 0.003));
  k.add('body', 'steel', box(0.008, 0.0018, 0.208), 0, RIB - 0.0009, -0.008);              // прицельная планка коробки
  k.add('body', 'black', box(0.0012, 0.022, 0.072), 0.0172, AY - 0.001, -0.04);           // окно выброса
  k.add('body', 'black', box(0.021, 0.0012, 0.078), 0, RB - 0.0002, -0.066);              // окно заряжания
  for (const z of [0.064, 0.01]) k.add('body', 'steel', cylX(0.0022, 0.0348, 8), 0, -0.003, z);
  k.add('body', 'steel', box(0.0018, 0.008, 0.005), -0.0175, -0.006, -0.004);             // затворная задержка
  for (const s of [-1, 1]) k.add('body', 'accent', box(0.0008, 0.0014, 0.18), s * 0.0174, 0.0045, -0.012);

  // --- спусковая скоба, спуск, предохранитель, рукоять ---
  k.add('body', 'polymer', side([[0.012, -0.01], [0.012, -0.03], [0.006, -0.039], [-0.05, -0.039], [-0.0535, -0.034],
    [-0.049, -0.035], [0.004, -0.035], [0.0085, -0.029], [0.0085, -0.01]], 0.012, 0.0012));
  k.add('body', 'steel', triggerGeo(-0.01, 0.0055));
  k.add('body', 'steel', cylX(0.0028, 0.016, 10), 0, -0.016, -0.0105);
  k.add('body', 'polymer', sideB(GRIP_PTS, 0.026, 0.004));

  // --- ствол с вентилируемой планкой и мушкой ---
  k.add('body', 'steel', cylZ(0.0108, 0.01, 0.556, 16), 0, AY, -0.403);
  k.add('body', 'black', discF(0.0092, 14), 0, AY, -0.6812);
  k.add('body', 'steel', box(0.008, 0.0016, 0.552), 0, RIB - 0.0008, -0.401);
  const post = box(0.0035, 0.0085, 0.003);
  for (let i = 0; i < 18; i++) k.add('body', 'steel', post, 0, 0.0496, -0.14 - i * 0.031);
  k.add('body', 'accent', sphere(0.0019), 0, RIB + 0.0016, -0.672);

  // --- подствольный магазин, заглушка, хомут ---
  k.add('body', 'steel', cylZ(0.0115, 0.0115, 0.43, 16), 0, TY, -0.34);
  k.add('body', 'steel', lathe([[0.0118, 0], [0.0125, 0.002], [0.0125, 0.016], [0.0118, 0.0185], [0.009, 0.021], [0, 0.0215]], 16), 0, TY, -0.555);
  k.add('body', 'steel', front(roundRectPts(0.025, 0.048, 0.0115), 0.01, 0.001), 0, (TY + AY) / 2, -0.546);

  // --- цевьё-помпа с направляющими ---
  // в покое цевьё на ход помпы впереди коробки; направляющие уходят в коробку
  for (const s of [-1, 1]) k.add('pump', 'steel', box(0.0016, 0.0062, 0.165), s * 0.0118, TY, -0.1425);
  const fp = [[0.0118, 0], [0.0185, 0.0015], [0.0212, 0.007]];
  for (let i = 0; i < 9; i++) { const h = 0.02 + i * 0.019; fp.push([0.0212, h], [0.0198, h + 0.003], [0.0198, h + 0.009], [0.0212, h + 0.012]); }
  fp.push([0.0212, 0.198], [0.0185, 0.2035], [0.0118, 0.205]);
  k.add('pump', 'polymer', lathe(fp, 20), 0, TY, -0.225, 0, 0, 0, 1.1, 1, 1);
  const pr = ring(0.02, 0.0009, 24);
  for (const z of [-0.251, -0.403]) k.add('pump', 'accent', pr, 0, TY, z, 0, 0, 0, 1.1, 1, 1);

  // --- приклад с затыльником ---
  // приклад с понижением (гребень ниже прицельной линии — не закрывает вид при прицеливании)
  k.add('body', 'polymer', side([[-0.104, 0.049], [-0.135, 0.044], [-0.3, 0.012], [-0.309, 0.01], [-0.309, -0.118],
    [-0.297, -0.122], [-0.15, -0.036], [-0.122, -0.014], [-0.104, -0.009]], 0.038, 0.006));
  k.add('body', 'rubber', side([[-0.3085, 0.011], [-0.3085, -0.119], [-0.3265, -0.1225], [-0.3265, 0.0135]], 0.04, 0.004));

  // --- патрон для заряжания (локально: вдоль -Z) ---
  k.addL('shell', 'red', cylZ(0.0102, 0.0102, 0.058, 14), 0, 0, -0.006);
  k.addL('shell', 'brass', cylZ(0.0106, 0.0106, 0.012, 14), 0, 0, 0.029);
  k.addL('shell', 'brass', cylZ(0.0113, 0.0113, 0.0015, 14), 0, 0, 0.03575);

  return {
    id: 'shotgun', nodes, parts: k.parts(),
    muzzle: [0, AY, -0.681], ejector: [0.018, AY, -0.035],
    sight: [0, RIB, 0.094], eyeDist: 0.32,
    kick: { back: 0.06, pitch: 0.3, ret: 0.25, yaw: 0.03 },
    flashes: [
      { p: [0, AY, -0.7], s: [0.09, 0.09], c: 0xffd27a, rnd: true },
      { p: [0, AY, -0.725], s: [0.14, 0.14], c: 0xff8a2a, a: 0.55, rnd: true },
    ],
    flashDur: 0.065, cant: 0.04, sway: 1,
  };
}

// ======================= СВ-98 =======================
function buildSniper() {
  const AY = 0.032, RR = 0.0165, SC = 0.083, RAIL = 0.0547, SZ = -0.02; // SC — ось прицела, SZ — барабанчики
  const nodes = [
    { name: 'bolt', pos: [0, AY, 0] },                      // ось затвора = ось ствола
    { name: 'magBase', pos: [0, -0.022, -0.058] },
    { name: 'mag', parent: 'magBase' },
  ];
  const k = kit(nodes);

  // --- ствольная коробка ---
  k.add('body', 'steel', cylZ(RR, RR, 0.217, 20), 0, AY, -0.0165);
  k.add('body', 'steel', cylZ(0.0178, 0.0178, 0.012, 20), 0, AY, -0.119);
  // окно выброса — изогнутая полоса по поверхности коробки (справа)
  const port = new THREE.CylinderGeometry(0.0167, 0.0167, 0.07, 8, 1, true, Math.PI / 2 - 0.3, 1.1);
  port.rotateX(Math.PI / 2);
  k.add('body', 'black', port, 0, AY, -0.03);

  // --- затвор (подвижный): стебель, муфта, рукоятка ---
  k.add('bolt', 'bright', cylZ(0.0095, 0.0095, 0.152, 14), 0, AY, 0.016);
  k.add('bolt', 'steel', lathe([[0, 0], [0.0085, 0.0005], [0.0105, 0.003], [0.0112, 0.008], [0.0112, 0.026]], 16), 0, AY, 0.118);
  k.add('bolt', 'steel', box(0.009, 0.009, 0.012), 0.0155, AY - 0.001, 0.073);
  k.rod('bolt', 'steel', [0.017, AY - 0.002, 0.073], [0.043, AY - 0.023, 0.086], 0.0034, 10);
  k.add('bolt', 'steel', sphere(0.0088, 14, 10), 0.047, AY - 0.026, 0.0885);

  // --- планка Пикатинни ---
  k.add('body', 'dark', box(0.0212, 0.008, 0.18), 0, 0.0475, -0.0275);
  const tooth = box(0.0212, 0.0032, 0.0052);
  for (let i = 0; i < 18; i++) k.add('body', 'dark', tooth, 0, RAIL - 0.0016, 0.058 - i * 0.01);

  // --- прицел 7× ---
  for (const z of [-0.085, 0.035]) {
    k.add('body', 'dark', box(0.026, 0.01, 0.016), 0, 0.0597, z);
    k.add('body', 'dark', cylZ(0.0186, 0.0186, 0.015, 20), 0, SC, z);
    k.add('body', 'steel', cylX(0.0032, 0.006, 8), 0.0158, 0.058, z);
  }
  k.add('body', 'alu', cylZ(0.015, 0.015, 0.2, 20), 0, SC, -0.015);
  k.add('body', 'alu', lathe([[0.015, 0], [0.0165, 0.012], [0.0215, 0.038], [0.0235, 0.044], [0.0235, 0.098], [0.024, 0.1],
    [0.024, 0.105], [0.0212, 0.107]], 24), 0, SC, -0.115);
  k.add('body', 'glass', discF(0.0213, 24), 0, SC, -0.2205);
  k.add('body', 'accent', ring(0.0238, 0.0008, 32), 0, SC, -0.198);
  k.add('body', 'alu', lathe([[0.0172, 0], [0.0205, 0.0005], [0.021, 0.003], [0.021, 0.024], [0.0195, 0.028], [0.017, 0.034],
    [0.0155, 0.042], [0.015, 0.051]], 24), 0, SC, 0.136);
  k.add('body', 'rubber', ring(0.0195, 0.0012, 28), 0, SC, 0.1355);
  k.add('body', 'accent', ring(0.0212, 0.0007, 28), 0, SC, 0.118);
  // седло и барабанчики
  k.add('body', 'alu', front(roundRectPts(0.027, 0.027, 0.006), 0.036, 0.0015), 0, SC, SZ);
  k.add('body', 'alu', cylY(0.0105, 0.016, 20), 0, SC + 0.0215, SZ);
  k.add('body', 'alu', cylY(0.0098, 0.004, 20), 0, SC + 0.0315, SZ);
  k.add('body', 'alu', cylX(0.0105, 0.016, 20), 0.0215, SC, SZ);
  k.add('body', 'alu', cylX(0.0098, 0.004, 20), 0.0315, SC, SZ);
  k.add('body', 'alu', cylX(0.0085, 0.01, 16), -0.0185, SC, SZ);
  const ribV = box(0.0024, 0.012, 0.0016), ribH = box(0.012, 0.0024, 0.0016);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, sa = Math.sin(a) * 0.0108, ca = Math.cos(a) * 0.0108;
    k.add('body', 'alu', ribV, sa, SC + 0.0215, SZ + ca, 0, a, 0);
    k.add('body', 'alu', ribH, 0.0215, SC + sa, SZ + ca, -a, 0, 0);
  }

  // --- ствол и дульное устройство ---
  k.add('body', 'steel', cylZ(0.0115, 0.0095, 0.587, 16), 0, AY, -0.4215);
  k.add('body', 'steel', lathe([[0.0095, 0], [0.0125, 0.002], [0.0125, 0.012], [0.0135, 0.014], [0.0135, 0.074],
    [0.0125, 0.078], [0.006, 0.078]], 18), 0, AY, -0.712);
  k.add('body', 'black', discF(0.0062, 14), 0, AY, -0.7898);
  const slot = box(0.003, 0.0035, 0.018);
  for (const s of [-1, 1]) for (const dy of [-0.0055, 0.0055]) for (const z of [-0.738, -0.762]) k.add('body', 'black', slot, s * 0.0125, AY + dy, z);

  // --- ложа: цевьё, приклад с отверстием под большой палец, щека, затыльник ---
  k.add('body', 'laminate', side([[0.42, 0.034], [0.42, -0.004], [0.414, -0.016], [0.4, -0.022], [0.005, -0.022], [-0.035, -0.009],
    [-0.095, -0.004], [-0.095, 0.019], [-0.085, 0.026], [0.12, 0.026], [0.14, 0.031], [0.4, 0.034]], 0.046, 0.006));
  k.add('body', 'laminate', side([[-0.088, 0.019], [-0.21, 0.019], [-0.235, 0.044], [-0.36, 0.047], [-0.392, 0.047], [-0.398, 0.041],
    [-0.398, -0.114], [-0.392, -0.12], [-0.36, -0.116], [-0.15, -0.108], [-0.117, -0.106], [-0.1185, -0.1], [-0.101, -0.04], [-0.092, -0.006]],
  0.036, 0.003, [[[-0.108, 0], [-0.125, 0.004], [-0.19, 0.004], [-0.226, -0.006], [-0.248, -0.03], [-0.246, -0.066], [-0.222, -0.088],
    [-0.15, -0.093], [-0.128, -0.091], [-0.118, -0.072], [-0.11, -0.04], [-0.106, -0.015]]]));
  k.add('body', 'laminate', sideB(GRIP_PTS, 0.026, 0.004));
  k.add('body', 'laminate', side([[-0.24, 0.052], [-0.24, 0.0615], [-0.247, 0.0655], [-0.33, 0.0655], [-0.336, 0.061], [-0.336, 0.052]], 0.032, 0.003));
  for (const z of [0.255, 0.322]) k.add('body', 'steel', cylY(0.0032, 0.01, 8), 0, 0.049, z);
  k.add('body', 'steel', cylX(0.0055, 0.008, 12), 0.0205, 0.04, 0.29);
  k.add('body', 'rubber', side([[-0.4025, 0.044], [-0.4025, -0.116], [-0.418, -0.12], [-0.418, 0.048]], 0.04, 0.004));
  for (const y of [0.02, -0.08]) k.add('body', 'steel', cylZ(0.003, 0.003, 0.007, 8), 0, y, 0.4);
  for (const s of [-1, 1]) k.add('body', 'accent', box(0.0008, 0.0016, 0.25), s * 0.0233, 0.01, -0.26);
  // спусковая скоба и крючок
  k.add('body', 'steel', side([[0.012, -0.018], [0.012, -0.034], [0.006, -0.042], [-0.05, -0.042], [-0.0535, -0.036],
    [-0.049, -0.038], [0.004, -0.038], [0.0085, -0.033], [0.0085, -0.018]], 0.011, 0.0012));
  k.add('body', 'steel', triggerGeo(-0.01, 0.0055));
  // сошки (сложены под цевьём)
  k.add('body', 'dark', box(0.03, 0.012, 0.024), 0, -0.028, -0.392);
  k.add('body', 'dark', cylX(0.0062, 0.034, 12), 0, -0.031, -0.398);
  for (const s of [-1, 1]) {
    k.add('body', 'dark', cylZ(0.0042, 0.0042, 0.165, 10), s * 0.0105, -0.031, -0.31);
    k.add('body', 'bright', cylZ(0.003, 0.003, 0.02, 8), s * 0.0105, -0.031, -0.218);
    k.add('body', 'rubber', sphere(0.0055), s * 0.0105, -0.031, -0.207);
  }

  // --- магазин на 10 (локально) ---
  k.addL('mag', 'steel', box(0.022, 0.07, 0.086), 0, -0.012, 0);
  k.addL('mag', 'steel', box(0.026, 0.006, 0.091), 0, -0.049, 0);
  k.addL('mag', 'brass', cylZ(0.0062, 0.006, 0.05, 12), 0, 0.027, 0.012);
  k.addL('mag', 'copper', lathe([[0.0042, 0], [0.0042, 0.008], [0.0032, 0.017], [0.0012, 0.025], [0, 0.026]], 12), 0, 0.027, -0.013);

  return {
    id: 'sniper', nodes, parts: k.parts(),
    muzzle: [0, AY, -0.79], ejector: [0.0175, AY + 0.005, -0.03],
    sight: [0, SC, 0.1355], eyeDist: 0.08,
    lens: { r: 0.0172, p: [0, SC, 0.1355] },
    kick: { back: 0.07, pitch: 0.22, ret: 0.3, yaw: 0.025 },
    flashes: [
      { p: [0, AY, -0.8], s: [0.06, 0.06], c: 0xffd27a, rnd: true },
      { p: [0.028, AY, -0.75], s: [0.06, 0.025], c: 0xffa040, a: 0.7 },
      { p: [-0.028, AY, -0.75], s: [0.06, 0.025], c: 0xffa040, a: 0.7 },
    ],
    flashDur: 0.06, cant: 0.03, sway: 1,
  };
}

const BUILD = { pm: buildPM, ak: buildAK, shotgun: buildShotgun, sniper: buildSniper };
const DEFS = {};
const getDef = (id) => DEFS[id] || (DEFS[id] = BUILD[id]());

// ---------- анимации ----------
// фазы смены магазина (доли общего времени; согласованы с arsenal.js: выпал 0.15, вставлен 0.62/0.5, досыл 0.82)
const MAG_T = { tilt: [0, 0.12, 0.8, 1], out: [0.13, 0.3], inn: [0.4, 0.6], seat: [0.58, 0.68] };
const MAG_E = { tilt: [0, 0.1, 0.88, 1], out: [0.12, 0.27], inn: [0.32, 0.48], seat: [0.46, 0.54] };
const isMag = (r) => !!r && (r.kind === 'mag' || r.kind === 'mag-empty');

// d — доля выхода магазина 0..1, vis — виден ли, w — наклон оружия, seat — толчок досылания
function magPhase(r) {
  const t = clamp01(r.t), T = r.kind === 'mag-empty' ? MAG_E : MAG_T;
  let d = 0, vis = true;
  if (t >= T.out[0] && t < T.out[1]) { const u = (t - T.out[0]) / (T.out[1] - T.out[0]); d = u * u; }
  else if (t >= T.out[1] && t < T.inn[0]) { d = 1; vis = false; }
  else if (t >= T.inn[0] && t < T.inn[1]) { const u = 1 - (t - T.inn[0]) / (T.inn[1] - T.inn[0]); d = u * u; }
  return { d, vis, w: win(t, T.tilt[0], T.tilt[1], T.tilt[2], T.tilt[3]), seat: bump(t, T.seat[0], T.seat[1]) };
}
function magSet(n, m, rx, rz) {
  n.mag.position.set(0, -0.25 * m.d, 0);
  n.mag.rotation.set(rx * m.d, 0, rz * m.d);
  n.mag.visible = m.vis;
}
function magRest(n) { n.mag.position.set(0, 0, 0); n.mag.rotation.set(0, 0, 0); n.mag.visible = true; }

const ANIM = {
  pm(dt, s, st, n, P) {
    // затвор: свободный откат при выстреле, затворная задержка на пустом магазине
    const r = s.reload;
    let lock = s.empty ? 1 : 0;
    if (r && r.kind === 'mag-empty') lock = r.t < 0.82 ? 1 : 0;
    st.lock = approach(st.lock, lock, dt / 0.035);
    n.slide.position.z = Math.max(pulse(st.shotT, 0.015, 0.06) * 0.028, st.lock * 0.024);
    if (isMag(r)) {
      const m = magPhase(r);
      magSet(n, m, 0.15, 0.35);
      // рукоятью к камере (низом влево), ствол вверх
      P.rx += 0.3 * m.w - 0.04 * m.seat; P.ry += 0.2 * m.w; P.rz -= 0.5 * m.w;
      P.px -= 0.025 * m.w; P.py += 0.03 * m.w + 0.006 * m.seat;
      if (r.kind === 'mag-empty') { const k = bump(r.t, 0.74, 0.9); P.rx += 0.06 * k; P.rz += 0.25 * k; }
    } else magRest(n);
  },

  ak(dt, s, st, n, P) {
    const r = s.reload;
    let pull = 0;
    if (isMag(r)) {
      const m = magPhase(r);
      magSet(n, m, 0.45, 0.2); // выход «перекатом» вперёд
      P.rx += 0.16 * m.w - 0.03 * m.seat; P.ry += 0.22 * m.w; P.rz -= 0.4 * m.w;
      P.px -= 0.03 * m.w; P.py += 0.025 * m.w + 0.006 * m.seat;
      if (r.kind === 'mag-empty') {
        // рукоятку затворной рамы — до упора назад и отпустить; правым боком к камере
        pull = ss(0.66, 0.79, r.t) * (1 - clamp01((r.t - 0.82) / 0.025));
        const k = win(r.t, 0.6, 0.68, 0.84, 0.9);
        P.rz += 0.55 * k; P.ry += 0.08 * k;
      }
    } else magRest(n);
    n.handle.position.z = n.handle.userData.p0.z + Math.max(pulse(st.shotT, 0.012, 0.055) * 0.035, pull * 0.105);
  },

  shotgun(dt, s, st, n, P) {
    const r = s.reload;
    // наклон на время поштучного заряжания (shell-start → shell… → shell-end)
    const loading = !!r && (r.kind === 'shell-start' || r.kind === 'shell');
    st.load = approach(st.load, loading ? 1 : 0, dt / 0.22);
    const w = ss(0, 1, st.load);
    P.rx += 0.14 * w; P.ry += 0.12 * w; P.rz -= 0.55 * w; P.px -= 0.02 * w; P.py += 0.025 * w;
    const sh = n.shell, p0 = sh.userData.p0;
    if (r && r.kind === 'shell') {
      const t = clamp01(r.t);
      sh.visible = t > 0.04 && t < 0.66;
      if (t < 0.45) {
        const u = 1 - ss(0.04, 0.45, t);
        sh.position.set(p0.x - 0.03 * u, p0.y - 0.09 * u, p0.z + 0.03 * u);
        sh.rotation.set(0.5 * u, 0, 0.4 * u);
      } else {
        const u = ss(0.45, 0.64, t);
        sh.position.set(p0.x, p0.y + 0.026 * u, p0.z - 0.035 * u);
        sh.rotation.set(0, 0, 0);
      }
      const k = bump(t, 0.5, 0.68);
      P.rx += 0.03 * k; P.py += 0.004 * k;
    } else sh.visible = false;
    // помпа: назад (выброс на 0.35) и вперёд
    let back = 0;
    if (s.cycle != null) {
      const u = clamp01(s.cycle), d = Math.sin(Math.PI * u);
      back = ss(0, 0.32, u) - ss(0.45, 0.8, u);
      P.rx -= 0.05 * d; P.py -= 0.008 * d;
    }
    n.pump.position.z = n.pump.userData.p0.z + 0.09 * back;
  },

  sniper(dt, s, st, n, P) {
    const r = s.reload;
    let u = -1;
    if (isMag(r)) {
      const m = magPhase(r);
      magSet(n, m, 0.12, 0.25);
      P.rx += 0.12 * m.w - 0.025 * m.seat; P.ry += 0.18 * m.w; P.rz -= 0.35 * m.w;
      P.px -= 0.03 * m.w; P.py += 0.03 * m.w + 0.005 * m.seat;
      if (r.kind === 'mag-empty') {
        if (r.t >= 0.64 && r.t <= 0.9) u = (r.t - 0.64) / 0.26;
        P.rz += 0.45 * win(r.t, 0.58, 0.65, 0.86, 0.92);
      }
    } else magRest(n);
    if (s.cycle != null) u = clamp01(s.cycle);
    const b = n.bolt;
    if (u >= 0) {
      // вверх → назад (выброс на 0.35) → вперёд → вниз
      const lift = ss(0, 0.15, u) - ss(0.62, 0.78, u);
      const back = ss(0.15, 0.35, u) - ss(0.42, 0.62, u);
      b.rotation.z = 1.2 * lift;
      b.position.z = b.userData.p0.z + 0.09 * back;
      const d = Math.sin(Math.PI * u); // лёгкий клевок и крен затвором к камере
      P.rx -= 0.04 * d; P.ry -= 0.03 * d; P.rz += 0.12 * d; P.py -= 0.008 * d;
    } else {
      b.rotation.z = 0;
      b.position.z = b.userData.p0.z;
    }
  },
};

// поза: покачивание, кант от бедра, бег, смена оружия + добавки анимаций (P); вращение вокруг рукояти
function applyPose(pose, st, s, dt, cfg, P) {
  const aim = clamp01(s.aim), draw = clamp01(s.draw), sprint = clamp01(s.sprint);
  st.sway += (clamp01(s.moving) - st.sway) * Math.min(1, dt * 5);
  if (st.sway > 0.001) st.walk += dt * (8 + 3 * sprint);
  const sa = st.sway * (1 - 0.85 * aim) * cfg.sway;
  const ia = (1 - 0.9 * aim) * cfg.sway, t = st.t;
  let rx = Math.cos(st.walk * 2) * 0.012 * sa + Math.sin(t * 1.3) * 0.005 * ia;
  let ry = Math.sin(t * 0.8 + 1) * 0.004 * ia;
  let rz = Math.sin(st.walk) * 0.035 * sa + cfg.cant * (1 - aim);
  let px = Math.sin(st.walk) * 0.006 * sa;
  let py = (Math.cos(st.walk * 2) - 1) * 0.0035 * sa + Math.sin(t * 1.3) * 0.0006 * ia;
  // бег: ствол вниз и внутрь
  rx -= 0.5 * sprint; ry += 0.6 * sprint; rz += 0.25 * sprint; px -= 0.03 * sprint; py -= 0.02 * sprint;
  // смена оружия: опустить из поля зрения
  rx -= 1.2 * draw; py -= 0.25 * draw;
  pose.position.set(GRIP.x + px + P.px, GRIP.y + py + P.py, GRIP.z + P.pz);
  pose.rotation.set(rx + P.rx, ry + P.ry, rz + P.rz);
}

// иерархия: group (не трогаем) → pose (вокруг рукояти) → recoil → body (координаты group)
function rig() {
  const group = new THREE.Group();
  const pose = new THREE.Group(); pose.position.copy(GRIP);
  const recoil = new THREE.Group();
  const body = new THREE.Group(); body.position.copy(GRIP).negate();
  group.add(pose); pose.add(recoil); recoil.add(body);
  return { group, pose, recoil, body };
}

let lensGeo = null;

function assemble(def, color) {
  const { group, pose, recoil, body } = rig();
  group.name = 'gun-' + def.id;
  const nodes = { body };
  for (const n of def.nodes) {
    const o = new THREE.Group(); o.name = n.name;
    if (n.pos) o.position.set(n.pos[0], n.pos[1], n.pos[2]);
    if (n.rot) o.rotation.set(n.rot[0], n.rot[1], n.rot[2]);
    o.userData.p0 = o.position.clone();
    if (n.hidden) o.visible = false;
    nodes[n.parent || 'body'].add(o);
    nodes[n.name] = o;
  }
  const mat = materials(color);
  for (const p of def.parts) nodes[p.node].add(new THREE.Mesh(p.geo, mat(p.mat)));

  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle';
  muzzle.position.fromArray(def.muzzle); body.add(muzzle);
  const ejector = new THREE.Object3D(); ejector.name = 'ejector'; // +X — вправо, как у оружия
  ejector.position.fromArray(def.ejector); body.add(ejector);

  // линза окуляра: свой материал на экземпляр (в VR в map кладётся картинка прицела)
  let lens = null;
  if (def.lens) {
    if (!lensGeo) lensGeo = new THREE.CircleGeometry(def.lens.r, 28);
    lens = new THREE.Mesh(lensGeo, new THREE.MeshBasicMaterial({ color: 0x0a1622 }));
    lens.name = 'lens';
    lens.position.fromArray(def.lens.p);
    body.add(lens);
  }

  // вспышка: спрайты (tintWeapon их не трогает)
  const flashes = def.flashes.map((f) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getFlashTex(), color: f.c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0,
    }));
    sp.position.fromArray(f.p);
    sp.visible = false;
    sp.userData.f = f;
    sp.userData.j = 1;
    body.add(sp);
    return sp;
  });

  const st = { t: 0, kickT: 9, shotT: 9, kickYaw: 0, flashT: 0, walk: 0, sway: 0, lock: 0, load: 0 };
  const P = { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 };
  const anim = ANIM[def.id];
  const { kick } = def;

  function fire() {
    st.kickT = 0; st.shotT = 0;
    st.kickYaw = (Math.random() * 2 - 1) * kick.yaw;
    st.flashT = def.flashDur;
    for (const sp of flashes) {
      sp.visible = true;
      sp.userData.j = 0.8 + Math.random() * 0.4;
      if (sp.userData.f.rnd) sp.material.rotation = Math.random() * Math.PI * 2;
    }
  }

  function update(dt, s) {
    s = s || NO_STATE;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    st.t += dt; st.kickT += dt; st.shotT += dt;
    P.rx = P.ry = P.rz = P.px = P.py = P.pz = 0;
    anim(dt, s, st, nodes, P);
    applyPose(pose, st, s, dt, def, P);
    // отдача вокруг рукояти
    const k = pulse(st.kickT, 0.012, kick.ret);
    recoil.position.set(0, 0, kick.back * k);
    recoil.rotation.set(kick.pitch * k, st.kickYaw * k, 0);
    // вспышка
    if (st.flashT > 0) {
      st.flashT -= dt;
      const f = st.flashT > 0 ? st.flashT / def.flashDur : 0;
      for (const sp of flashes) {
        const d = sp.userData.f, g = (0.55 + 0.45 * f) * sp.userData.j;
        sp.material.opacity = f * (d.a ?? 1);
        sp.scale.set(d.s[0] * g, d.s[1] * g, 1);
        if (f <= 0) sp.visible = false;
      }
    }
  }

  return {
    id: def.id, group, muzzle, ejector,
    sight: new THREE.Vector3().fromArray(def.sight), eyeDist: def.eyeDist,
    lens, fire, update,
  };
}

// ======================= бластер (обёртка weapon.js) =======================
let heatGeo = null;
function createBlaster(color) {
  const w = createWeapon({ color });
  const { group, pose, body } = rig();
  group.name = 'gun-blaster';
  body.add(w.group);
  // перегрев: светящаяся накладка на кожух и ствол
  if (!heatGeo) {
    const a = cylZ(0.0183, 0.0183, 0.064, 16); a.translate(0, 0.012, -0.134);
    const b = cylZ(0.0084, 0.0084, 0.032, 12); b.translate(0, 0.012, -0.173);
    heatGeo = mergeGeos([a.toNonIndexed(), b.toNonIndexed()]);
    a.dispose(); b.dispose();
  }
  const heat = new THREE.Mesh(heatGeo, new THREE.MeshBasicMaterial({
    color: 0xff5a1f, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  heat.visible = false;
  body.add(heat);

  const st = { t: 0, walk: 0, sway: 0, vent: 0 };
  const cfg = { sway: 0, cant: 0.04 };   // покачивание при ходьбе — у самого бластера
  const P = { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 };
  const fwd = { moving: false };

  function update(dt, s) {
    s = s || NO_STATE;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    st.t += dt;
    // сброс тепла: оружие наклоняется, «стравливая» перегрев
    st.vent = approach(st.vent, s.reload && s.reload.kind === 'vent' ? 1 : 0, dt / 0.2);
    const v = ss(0, 1, st.vent);
    P.rx = 0.25 * v; P.ry = 0.15 * v; P.rz = 0.5 * v; P.px = 0; P.py = 0.02 * v; P.pz = 0;
    applyPose(pose, st, s, dt, cfg, P);
    fwd.moving = (s.moving || 0) > 0.1 && (s.aim || 0) < 0.5;
    w.update(dt, fwd);
    const h = clamp01(s.heat);
    heat.visible = h > 0.02;
    if (heat.visible) heat.material.opacity = h * h * 0.55 * (0.9 + 0.1 * Math.sin(st.t * 25));
  }

  return {
    id: 'blaster', group, muzzle: w.muzzle, ejector: null,
    sight: new THREE.Vector3(0, 0.062, 0.03), eyeDist: 0.2,
    lens: null, fire: () => w.fire(), update,
  };
}

export function createGun(id, { color = 0x3ec5ff } = {}) {
  if (id === 'blaster') return createBlaster(color);
  if (!BUILD[id]) return null;
  return assemble(getDef(id), color);
}
