// Противники фэнтези-арены: огонёк-дух, золотая фея, проклятый череп, каменный страж,
// летучий глаз, босс «Каменный колосс»; огненные шары (пул), стихии (огонь/лёд/молния).
// Все векторы в событиях и результатах — переиспользуемые: копировать, если нужно хранить.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const MAX_DT = 0.1;           // с, защита от огромного dt
const SLOW_K = 0.4;           // замедление льдом
const SLOW_T = 3;             // с
const BURN_T = 3;             // с
const BURN_DPS = 1;           // урон/с поджога
const FLASH_T = 0.12;         // с, белая вспышка от урона
const CHAIN_R = 4;            // м, радиус перескока молнии
const CHAIN_N = 3;
const CHAIN_K = 0.6;
const POP_T = 0.35;           // с, появление
const FADE_T = 0.35;          // с, исчезание по таймеру
const DODGE_R = 1;            // м, линия выстрела ближе — уворот
const DODGE_V = 7;            // м/с, рывок
const DODGE_CD = 1.5;         // с
const PROJ_MAX = 40;
const PROJ_LIFE = 6;          // с мира
const PROJ_R = 0.16;          // м, видимый радиус ядра шара
const PROJ_HIT_R = 0.25;      // м, радиус для hitTest
const HEAD_R = 0.35;          // м, голова игрока
const DEFLECT_K = 1.3;
const DEFLECT_DMG = 3;
const EV_N = 256;             // кольцо объектов событий
const BOSS_EMERGE = 2.2;      // с, подъём из-под земли
const BOSS_CORE = new THREE.Vector3(0, 4.25, 1.12); // ядро в координатах босса

export const ENEMY_TYPES = {
  wisp: { name: 'Огонёк-дух', points: 1, hp: 1, life: 9, dist: [4, 10], height: [1.2, 3.2], radius: 0.3, color: 0x9fe8ff, cap: 16 },
  fairy: { name: 'Золотая фея', points: 3, hp: 1, life: 3, dist: [4.5, 9], height: [1.3, 2.8], radius: 0.3, color: 0xffd36b, cap: 8 },
  skull: { name: 'Проклятый череп', points: -5, hp: 1, life: 7, dist: [4, 8], height: [1.2, 2.6], radius: 0.36, color: 0xb455ff, cap: 8 },
  guardian: { name: 'Каменный страж', points: 8, hp: 2, life: 0, dist: [9, 11], height: [0, 0], radius: 0.95, color: 0x6fe3ff, cap: 4 },
  eye: { name: 'Летучий глаз', points: 5, hp: 3, life: 0, dist: [7, 12], height: [2, 4], radius: 0.45, color: 0xff8a3d, cap: 6 },
  boss: { name: 'Каменный колосс', points: 150, hp: 60, life: 0, dist: [16, 16], height: [0, 0], radius: 2.4, color: 0xff6a1a, cap: 1 },
};
const TYPES = ['wisp', 'fairy', 'skull', 'guardian', 'eye', 'boss'];
const CAP_K = { low: 1, medium: 1.5, high: 2 };

// Временные объекты (без аллокаций в кадре)
const UP = new THREE.Vector3(0, 1, 0);
const _Z = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _scl2 = new THREE.Vector3();
const _off = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qI = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _m3 = new THREE.Matrix4();
const _euler = new THREE.Euler();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const EMPTY = Object.freeze({});

function noRaycast() {}
const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

// Мягкое пятно для ореолов (DataTexture — работает и без DOM)
function makeSoftTexture() {
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (x + 0.5) / N * 2 - 1, dy = (y + 0.5) / N * 2 - 1;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      const a = Math.pow(1 - r, 2.2) * 0.85 + Math.pow(Math.max(0, 1 - r * 3), 2) * 0.15;
      const i = (y * N + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(255 * a);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// Детерминированный шум по позиции вершины (одинаковые точки сдвигаются одинаково)
function hash(a, b, c, s) {
  const h = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719 + s * 4.137) * 43758.5453;
  return h - Math.floor(h);
}

// Камень: неиндексированная геометрия с неровностями
function rock(geo, amt, seed = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.round(x * 1e4), b = Math.round(y * 1e4), c = Math.round(z * 1e4);
    p.setXYZ(i,
      x + (hash(a, b, c, seed) - 0.5) * 2 * amt,
      y + (hash(b, c, a, seed + 7) - 0.5) * 2 * amt,
      z + (hash(c, a, b, seed + 13) - 0.5) * 2 * amt);
  }
  g.computeVertexNormals();
  return g;
}

// Склейка частей в одну геометрию: position, normal, color, glow
function builder() {
  const pos = [], nor = [], col = [], glw = [];
  const c = new THREE.Color();
  const m = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion();
  const p = new THREE.Vector3(), s = new THREE.Vector3();
  return {
    // color: hex или функция (x, y, z, color) в итоговых координатах
    add(geo, color, glow, px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
      let g = geo.index ? geo.toNonIndexed() : geo.clone();
      if (!g.attributes.normal) g.computeVertexNormals();
      m.compose(p.set(px, py, pz), q.setFromEuler(e.set(rx, ry, rz)), s.set(sx, sy, sz));
      g.applyMatrix4(m);
      const P = g.attributes.position, N = g.attributes.normal;
      if (typeof color === 'number') c.setHex(color);
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        pos.push(x, y, z);
        nor.push(N.getX(i), N.getY(i), N.getZ(i));
        if (typeof color === 'function') color(x, y, z, c);
        col.push(c.r, c.g, c.b);
        glw.push(glow);
      }
      g.dispose();
      if (g !== geo) geo.dispose();
      return this;
    },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('glow', new THREE.Float32BufferAttribute(glw, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      return g;
    },
  };
}

// Свечение по атрибуту glow: emissive += цвет вершины × glow × glowGain
function addGlow(mat, gain) {
  mat.userData.glowGain = { value: gain };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.glowGain = mat.userData.glowGain;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float glowGain;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * glowGain;');
  };
  mat.customProgramCacheKey = () => 'enemy-glow';
  return mat;
}

// ---------- Модели (процедурные) ----------
function lathe(pts, segs) {
  const v = [];
  for (let i = 0; i < pts.length; i++) v.push(new THREE.Vector2(pts[i][0], pts[i][1]));
  return new THREE.LatheGeometry(v, segs);
}

function buildWisp() {
  // язычок пламени: белое ядро, голубая верхушка
  const core = builder().add(lathe([[0, -0.13], [0.07, -0.118], [0.115, -0.075], [0.13, -0.01], [0.122, 0.05],
    [0.095, 0.12], [0.06, 0.19], [0.025, 0.25], [0, 0.29]], 14), (x, y, z, c) => {
    const t = clamp01((y + 0.05) / 0.32);
    c.setRGB(1 - 0.45 * t, 1 - 0.12 * t, 1);
  }, 1).build();
  const spark = builder().add(new THREE.OctahedronGeometry(0.04, 0), 0xc8f4ff, 1).build();
  return { core, spark };
}

function buildFairy() {
  const b = builder();
  const skin = 0xfff0d2, gold = 0xffc23a, hair = 0xffe27a;
  b.add(new THREE.SphereGeometry(0.055, 12, 8), skin, 1, 0, 0.1, 0);
  b.add(new THREE.SphereGeometry(0.062, 10, 6, 0, TAU, 0, 1.6), hair, 1, 0, 0.107, -0.006);   // волосы
  b.add(new THREE.SphereGeometry(0.028, 8, 6), hair, 1, 0, 0.16, -0.025);                      // пучок
  b.add(new THREE.ConeGeometry(0.075, 0.17, 10), gold, 1, 0, -0.02, 0);                        // платье
  b.add(new THREE.CylinderGeometry(0.009, 0.007, 0.07, 5), skin, 1, 0.045, 0.01, 0.01, 0, 0, 0.8); // руки
  b.add(new THREE.CylinderGeometry(0.009, 0.007, 0.07, 5), skin, 1, -0.045, 0.01, 0.01, 0, 0, -0.8);
  b.add(new THREE.OctahedronGeometry(0.022, 0), 0xffffff, 1, 0, 0.19, 0.0);                    // звёздочка
  const body = b.build();

  // крылья: по 2 лепестка с каждой стороны
  const up = new THREE.Shape();
  up.moveTo(0, 0); up.bezierCurveTo(0.02, 0.2, 0.24, 0.32, 0.28, 0.19); up.bezierCurveTo(0.3, 0.08, 0.12, 0.02, 0, 0);
  const lo = new THREE.Shape();
  lo.moveTo(0, 0); lo.bezierCurveTo(0.1, -0.02, 0.21, -0.09, 0.18, -0.18); lo.bezierCurveTo(0.12, -0.23, 0.03, -0.1, 0, 0);
  const wc = (x, y, z, c) => {
    const t = clamp01(Math.sqrt(x * x + y * y) / 0.3);
    c.setRGB(0.95, 0.75 - 0.3 * t, 0.35 + 0.45 * t).multiplyScalar(0.55 + 0.45 * t);
  };
  const w = builder();
  w.add(new THREE.ShapeGeometry(up, 8), wc, 1, 0.01, 0.04, 0);
  w.add(new THREE.ShapeGeometry(lo, 8), wc, 1, 0.01, 0.03, 0);
  w.add(new THREE.ShapeGeometry(up, 8), wc, 1, -0.01, 0.04, 0, 0, 0, 0, -1, 1, 1);
  w.add(new THREE.ShapeGeometry(lo, 8), wc, 1, -0.01, 0.03, 0, 0, 0, 0, -1, 1, 1);
  const wings = w.build();
  return { body, wings };
}

function buildSkull() {
  const b = builder();
  const bone = 0x3a1d52, dark = 0x12061c, horn = 0x1c0b26, green = 0x5dff7a, curse = 0xb455ff;
  b.add(new THREE.SphereGeometry(0.2, 16, 12), (x, y, z, c) => {
    c.setHex(bone).multiplyScalar(0.75 + 0.5 * clamp01(y / 0.2 + 0.5));
  }, 0, 0, 0.03, 0, 0, 0, 0, 1, 0.95, 1.1);
  b.add(new THREE.BoxGeometry(0.27, 0.12, 0.18), bone, 0, 0, -0.1, 0.07);    // скулы
  b.add(new THREE.BoxGeometry(0.2, 0.07, 0.16), bone, 0, 0, -0.2, 0.06);     // челюсть
  for (let i = -2; i <= 2; i++) b.add(new THREE.BoxGeometry(0.025, 0.04, 0.02), 0xd8c8e8, 0.15, i * 0.032, -0.165, 0.145); // зубы
  b.add(new THREE.SphereGeometry(0.058, 10, 8), dark, 0, 0.075, 0.0, 0.165);  // глазницы
  b.add(new THREE.SphereGeometry(0.058, 10, 8), dark, 0, -0.075, 0.0, 0.165);
  b.add(new THREE.SphereGeometry(0.034, 10, 8), green, 1, 0.075, 0.0, 0.198); // глаза
  b.add(new THREE.SphereGeometry(0.034, 10, 8), green, 1, -0.075, 0.0, 0.198);
  b.add(new THREE.ConeGeometry(0.02, 0.05, 3), dark, 0, 0, -0.06, 0.21, -1.9, 0, 0); // нос
  b.add(new THREE.ConeGeometry(0.045, 0.2, 6), horn, 0.05, 0.14, 0.18, 0.0, 0.2, 0, -0.75);
  b.add(new THREE.ConeGeometry(0.045, 0.2, 6), horn, 0.05, -0.14, 0.18, 0.0, 0.2, 0, 0.75);
  b.add(new THREE.BoxGeometry(0.012, 0.012, 0.2), curse, 1, 0, 0.215, 0.0, -0.2, 0, 0);   // руна проклятия
  b.add(new THREE.BoxGeometry(0.12, 0.012, 0.012), curse, 1, 0, 0.2, 0.08);
  return b.build();
}

function buildGuardian() {
  const b = builder();
  const st = (hex, k) => (x, y, z, c) => { c.setHex(hex).multiplyScalar(k * (0.85 + 0.3 * hash(Math.round(x * 7), Math.round(y * 7), Math.round(z * 7), 3))); };
  const stone = 0x6b7080, stone2 = 0x585d6c, glow = 0x49e3ff;
  for (const s of [-1, 1]) {
    b.add(rock(new THREE.BoxGeometry(0.4, 0.2, 0.56, 2, 1, 2), 0.025, 2), st(stone2, 0.9), 0, s * 0.27, 0.1, 0.05);      // ступни
    b.add(rock(new THREE.BoxGeometry(0.36, 0.8, 0.4, 2, 2, 2), 0.03, 3), st(stone, 1), 0, s * 0.27, 0.55, 0);           // ноги
    b.add(rock(new THREE.DodecahedronGeometry(0.34, 0), 0.04, 5), st(stone, 1.05), 0, s * 0.8, 1.76, 0);               // плечи
    b.add(rock(new THREE.BoxGeometry(0.3, 0.55, 0.32, 1, 2, 1), 0.03, 7), st(stone2, 1), 0, s * 0.88, 1.33, 0, 0, 0, s * 0.12); // плечо
    b.add(rock(new THREE.DodecahedronGeometry(0.27, 0), 0.035, 11), st(stone, 0.95), 0, s * 0.95, 0.86, 0.06, 0, 0, 0, 1, 1.3, 1); // кулаки
    b.add(new THREE.BoxGeometry(0.03, 0.42, 0.03), glow, 1, s * 0.27, 0.55, 0.205);                                   // трещины ног
    b.add(new THREE.BoxGeometry(0.025, 0.3, 0.025), glow, 1, s * 0.85, 1.76, 0.27, 0, 0, s * 0.5);
    b.add(new THREE.ConeGeometry(0.09, 0.3, 4), st(stone2, 1.1), 0, s * 0.82, 2.06, -0.05, 0, 0, -s * 0.35);           // шипы плеч
  }
  b.add(rock(new THREE.BoxGeometry(0.86, 0.32, 0.52, 2, 1, 2), 0.03, 13), st(stone2, 1), 0, 0, 0.98, 0);                // таз
  b.add(rock(new THREE.DodecahedronGeometry(0.62, 1), 0.05, 17), st(stone, 1.1), 0, 0, 1.47, -0.02, 0, 0, 0, 1.12, 0.85, 0.62); // торс
  b.add(rock(new THREE.BoxGeometry(0.56, 0.5, 0.12, 2, 2, 1), 0.012, 19), st(stone2, 0.8), 0, 0, 1.45, 0.36);         // плита руны
  b.add(rock(new THREE.BoxGeometry(0.36, 0.32, 0.34, 1, 1, 1), 0.025, 23), st(stone, 1.1), 0, 0, 2.03, 0.02);           // голова
  b.add(new THREE.BoxGeometry(0.25, 0.045, 0.03), glow, 1, 0, 2.05, 0.19);                                             // глаза-щель
  b.add(new THREE.ConeGeometry(0.06, 0.18, 4), st(stone2, 1.1), 0, 0, 2.27, 0.0);
  b.add(new THREE.BoxGeometry(0.025, 0.28, 0.025), glow, 1, -0.33, 1.6, 0.36, 0, 0, 0.5);                             // трещины торса
  b.add(new THREE.BoxGeometry(0.025, 0.24, 0.025), glow, 1, 0.34, 1.32, 0.35, 0, 0, -0.6);
  b.add(new THREE.BoxGeometry(0.4, 0.025, 0.025), glow, 1, 0, 1.12, 0.27);
  const body = b.build();

  // руна на груди (слабое место): диск + кольцо + знак
  const r = builder();
  const cy = 1.45, cz = 0.455;
  r.add(new THREE.CircleGeometry(0.19, 24), 0x0d4a5c, 1, 0, cy, cz - 0.004);
  r.add(new THREE.RingGeometry(0.15, 0.185, 32), 0x7ff3ff, 1, 0, cy, cz);
  r.add(new THREE.RingGeometry(0.105, 0.118, 24), 0x58dcff, 1, 0, cy, cz);
  r.add(new THREE.PlaneGeometry(0.022, 0.22), 0xe8fdff, 1, 0, cy, cz + 0.002);
  r.add(new THREE.PlaneGeometry(0.022, 0.15), 0xe8fdff, 1, -0.045, cy + 0.02, cz + 0.002, 0, 0, -0.75);
  r.add(new THREE.PlaneGeometry(0.022, 0.15), 0xe8fdff, 1, 0.045, cy + 0.02, cz + 0.002, 0, 0, 0.75);
  r.add(new THREE.PlaneGeometry(0.12, 0.02), 0xe8fdff, 1, 0, cy - 0.06, cz + 0.002);
  const rune = r.build();
  return { body, rune };
}

function buildEye() {
  const b = builder();
  // глазное яблоко: белое спереди, фиолетовое сзади
  b.add(new THREE.SphereGeometry(0.35, 26, 18), (x, y, z, c) => {
    const t = smooth((z / 0.35 + 0.15) / 0.75);
    c.setRGB(0.32 + 0.66 * t, 0.1 + 0.86 * t, 0.48 + 0.48 * t);
  }, 0.12);
  // радужка: сферическая «шапочка»
  const iris = new THREE.SphereGeometry(0.353, 28, 8, 0, TAU, 0, 0.5);
  iris.rotateX(Math.PI / 2);
  b.add(iris, (x, y, z, c) => {
    const a = Math.acos(Math.min(1, z / 0.353)) / 0.5; // 0 центр .. 1 край
    if (a > 0.9) c.setRGB(0.5, 0.06, 0.02);
    else c.setRGB(1, 0.9 - 0.65 * a, 0.35 - 0.33 * a);
  }, 1);
  b.add(new THREE.CircleGeometry(0.11, 18), 0x050003, 0, 0, 0, 0.358, 0, 0, 0, 0.26, 1, 1);  // зрачок-щель
  b.add(new THREE.CircleGeometry(0.03, 10), 0xffffff, 1.2, 0.06, 0.07, 0.352);              // блик
  b.add(new THREE.CircleGeometry(0.014, 8), 0xffffff, 1.2, -0.05, -0.06, 0.354);
  for (let i = 0; i < 5; i++) {                                                             // шипы сзади
    const a = (i / 5) * TAU + 0.3;
    b.add(new THREE.ConeGeometry(0.045, 0.28, 5), 0x2a0b3a, 0.05,
      Math.cos(a) * 0.18, Math.sin(a) * 0.18, -0.36, -Math.PI / 2 - Math.sin(a) * 0.5, 0, 0, 1, 1, 1);
  }
  b.add(new THREE.TorusGeometry(0.352, 0.025, 6, 32), 0x4a1666, 0.25, 0, 0, 0.12);         // веко-ободок
  const ball = b.build();

  // перепончатое крыло (правое, шарнир в 0, вдоль +X)
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.04); sh.lineTo(0.2, 0.15); sh.lineTo(0.44, 0.26); sh.lineTo(0.66, 0.17);
  sh.quadraticCurveTo(0.53, 0.1, 0.51, -0.01);
  sh.quadraticCurveTo(0.43, 0.02, 0.35, -0.09);
  sh.quadraticCurveTo(0.27, -0.02, 0.18, -0.11);
  sh.quadraticCurveTo(0.1, -0.03, 0, -0.06);
  const w = builder();
  w.add(new THREE.ShapeGeometry(sh, 6), (x, y, z, c) => {
    const t = clamp01(x / 0.65);
    c.setRGB(0.28 + 0.5 * t, 0.07 + 0.05 * t, 0.42 + 0.2 * t);
  }, 0.35);
  w.add(new THREE.CylinderGeometry(0.012, 0.006, 0.46, 4), 0x1c0726, 0, 0.22, 0.15, 0.003, 0, 0, -Math.PI / 2 + 0.47); // кость
  w.add(new THREE.CylinderGeometry(0.008, 0.004, 0.24, 4), 0x1c0726, 0, 0.55, 0.215, 0.003, 0, 0, -Math.PI / 2 - 0.39);
  const wings = w.build();
  return { ball, wings };
}

function buildBoss() {
  const basalt = 0x4a4248, basalt2 = 0x3a3338, lava = 0xff5a0e, hot = 0xffb347;
  const st = (hex, k) => (x, y, z, c) => { c.setHex(hex).multiplyScalar(k * (0.8 + 0.4 * hash(Math.round(x * 3), Math.round(y * 3), Math.round(z * 3), 9))); };
  const b = builder();
  for (const s of [-1, 1]) {
    b.add(rock(new THREE.BoxGeometry(1.1, 0.55, 1.4, 2, 1, 2), 0.06, 31), st(basalt2, 1), 0, s * 0.95, 0.27, 0.15);
    b.add(rock(new THREE.DodecahedronGeometry(0.75, 0), 0.08, 37), st(basalt, 1), 0, s * 0.95, 1.45, 0, 0, 0, 0, 0.82, 1.5, 0.85);
    b.add(rock(new THREE.DodecahedronGeometry(0.9, 0), 0.1, 41), st(basalt, 1.1), 0, s * 2.0, 5.15, 0);          // плечи
    b.add(new THREE.ConeGeometry(0.22, 1.0, 5), st(basalt2, 1.2), 0, s * 2.15, 5.95, -0.2, 0, 0, -s * 0.4);       // шипы
    b.add(new THREE.BoxGeometry(0.07, 1.1, 0.07), lava, 1, s * 0.95, 1.45, 0.62, 0, 0, s * 0.25);                // лава ног
    b.add(new THREE.BoxGeometry(0.06, 0.7, 0.06), lava, 1, s * 1.85, 5.3, 0.78, 0, 0, s * 0.7);
    b.add(new THREE.BoxGeometry(0.22, 0.08, 0.05), hot, 1.4, s * 0.22, 6.05, 0.72, 0, 0, -s * 0.15);             // глаза
    b.add(new THREE.ConeGeometry(0.16, 0.95, 5), st(basalt2, 1.1), 0, s * 0.45, 6.75, 0.0, -0.25, 0, -s * 0.45); // рога
  }
  b.add(rock(new THREE.BoxGeometry(2.2, 0.75, 1.35, 2, 1, 2), 0.07, 43), st(basalt2, 1), 0, 0, 2.65, 0);         // таз
  b.add(rock(new THREE.DodecahedronGeometry(1.5, 1), 0.12, 47), st(basalt, 1.05), 0, 0, 4.15, 0, 0, 0, 0, 1.32, 0.95, 0.78); // торс
  b.add(rock(new THREE.TorusGeometry(0.72, 0.24, 6, 10), 0.04, 53), st(basalt2, 0.9), 0, 0, 4.25, 1.02);          // оправа ядра
  b.add(new THREE.TorusGeometry(0.56, 0.05, 6, 20), lava, 1.2, 0, 4.25, 1.1);
  b.add(rock(new THREE.BoxGeometry(1.0, 0.9, 0.95, 1, 1, 1), 0.06, 59), st(basalt, 1.1), 0, 0, 6.05, 0.25);       // голова
  b.add(rock(new THREE.BoxGeometry(0.7, 0.25, 0.5, 1, 1, 1), 0.04, 61), st(basalt2, 1), 0, 0, 5.6, 0.45);        // челюсть
  b.add(new THREE.BoxGeometry(0.5, 0.06, 0.05), lava, 1.2, 0, 5.68, 0.72);                                       // пасть
  // лавовые трещины от ядра
  const cracks = [[-0.9, 4.95, 0.6], [0.95, 4.9, 0.55], [-1.0, 3.55, 0.45], [0.85, 3.45, -0.6], [0, 3.1, 0.2], [0, 5.25, 0.2]];
  for (const [x, y, rz] of cracks) b.add(new THREE.BoxGeometry(0.07, 0.95, 0.07), lava, 1, x, y, 0.98 - Math.abs(x) * 0.12, 0, 0, rz);
  const body = b.build();

  const arm = (s) => {
    const a = builder();
    a.add(rock(new THREE.DodecahedronGeometry(0.6, 0), 0.07, 67), st(basalt, 1), 0, s * 0.25, -0.9, 0, 0, 0, 0, 0.9, 1.4, 0.9);
    a.add(rock(new THREE.DodecahedronGeometry(0.55, 0), 0.07, 71), st(basalt2, 1), 0, s * 0.35, -2.15, 0.1, 0, 0, 0, 0.9, 1.3, 0.9);
    a.add(rock(new THREE.DodecahedronGeometry(0.68, 0), 0.08, 73), st(basalt, 1.1), 0, s * 0.4, -3.1, 0.2);
    a.add(new THREE.BoxGeometry(0.06, 0.9, 0.06), lava, 1, s * 0.3, -1.5, 0.5, 0, 0, s * 0.15);
    a.add(new THREE.BoxGeometry(0.06, 0.6, 0.06), lava, 1, s * 0.42, -3.05, 0.84, 0, 0, s * 0.5);
    a.add(new THREE.BoxGeometry(0.06, 0.5, 0.06), lava, 1, s * 0.4, -3.1, 0.75, 0, 0, -s * 0.6);
    return a.build();
  };
  const core = builder().add(new THREE.IcosahedronGeometry(0.52, 1), (x, y, z, c) => {
    const t = clamp01((z - 3.75 + 0.5 - 1.12 + 3.75) / 1.04 + 0.5);
    c.setRGB(1, 0.55 + 0.4 * t, 0.15 + 0.5 * t);
  }, 1, BOSS_CORE.x, BOSS_CORE.y, BOSS_CORE.z).build();
  return { body, armL: arm(-1), armR: arm(1), core };
}

// ---------- Модуль ----------
// glb: true — модели из assets/models для огонька и стража; массив id — свой набор; false — только процедурные
export function createEnemies(scene, { quality, glb = true } = {}) {
  const qid = quality && CAP_K[quality.id] ? quality.id : 'medium';
  const capK = CAP_K[qid];
  const low = qid === 'low';
  const cap = {};
  for (const t of TYPES) cap[t] = t === 'boss' ? 1 : Math.ceil(ENEMY_TYPES[t].cap * capK);

  const root = new THREE.Group();
  root.name = 'fantasy-enemies';
  scene.add(root);
  let rootVisible = true;

  const softTex = makeSoftTexture();
  const disposables = [softTex];

  // Материалы
  function bodyMat(opts) {
    const m = low ? new THREE.MeshLambertMaterial(opts) : new THREE.MeshStandardMaterial(opts);
    disposables.push(m);
    return m;
  }
  function basicMat(opts) {
    const m = new THREE.MeshBasicMaterial(Object.assign({ toneMapped: false }, opts));
    disposables.push(m);
    return m;
  }
  const glowBasic = basicMat({ vertexColors: true });
  const wingBasic = basicMat({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const runeMat = basicMat({ vertexColors: true, side: THREE.DoubleSide });
  const skullMat = addGlow(bodyMat(low ? { vertexColors: true } : { vertexColors: true, roughness: 0.45, metalness: 0.15 }), 2.2);
  skullMat.emissive.setHex(0x12051c);
  const stoneMat = addGlow(bodyMat(low ? { vertexColors: true, flatShading: true } : { vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0 }), 2.4);
  const eyeMat = addGlow(bodyMat(low ? { vertexColors: true } : { vertexColors: true, roughness: 0.22, metalness: 0.05 }), 1.6);
  const eyeWingMat = addGlow(bodyMat(low ? { vertexColors: true, side: THREE.DoubleSide } : { vertexColors: true, side: THREE.DoubleSide, roughness: 0.6, metalness: 0 }), 0.8);
  const bossMat = addGlow(bodyMat(low ? { vertexColors: true, flatShading: true } : { vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 }), 2.6);
  const bossCoreMat = basicMat({ vertexColors: true });
  const haloMat = basicMat({ map: softTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const projMat = basicMat({});

  // Геометрии
  const G = {
    wisp: buildWisp(), fairy: buildFairy(), skull: buildSkull(), guardian: buildGuardian(), eye: buildEye(), boss: buildBoss(),
    halo: new THREE.PlaneGeometry(1, 1), proj: new THREE.IcosahedronGeometry(1, 1),
  };
  for (const k in G) {
    const g = G[k];
    if (g.isBufferGeometry) disposables.push(g);
    else for (const n in g) disposables.push(g[n]);
  }

  // InstancedMesh: упакованы в [0, count), visible = count > 0
  function inst(geo, mat, n, hittable) {
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.visible = false;
    if (hittable) {
      mesh.raycast = function (r, i) { if (rootVisible) THREE.InstancedMesh.prototype.raycast.call(this, r, i); };
    } else {
      mesh.raycast = noRaycast;
      mesh.frustumCulled = false;
    }
    root.add(mesh);
    return mesh;
  }

  const M = {
    wisp: { core: inst(G.wisp.core, glowBasic, cap.wisp, true), sparks: inst(G.wisp.spark, glowBasic, cap.wisp * 3, false) },
    fairy: { body: inst(G.fairy.body, glowBasic, cap.fairy, true), wings: inst(G.fairy.wings, wingBasic, cap.fairy, false) },
    skull: { body: inst(G.skull, skullMat, cap.skull, true) },
    guardian: { body: inst(G.guardian.body, stoneMat, cap.guardian, true), rune: inst(G.guardian.rune, runeMat, cap.guardian, true) },
    eye: { ball: inst(G.eye.ball, eyeMat, cap.eye, true), wings: inst(G.eye.wings, eyeWingMat, cap.eye * 2, false) },
  };
  M.wisp.core.name = 'enemy-wisp'; M.wisp.core.userData = { enemyType: 'wisp', part: 'body' };
  M.fairy.body.name = 'enemy-fairy'; M.fairy.body.userData = { enemyType: 'fairy', part: 'body' };
  M.skull.body.name = 'enemy-skull'; M.skull.body.userData = { enemyType: 'skull', part: 'body' };
  M.guardian.body.name = 'enemy-guardian'; M.guardian.body.userData = { enemyType: 'guardian', part: 'body' };
  M.guardian.rune.name = 'enemy-guardian-rune'; M.guardian.rune.userData = { enemyType: 'guardian', part: 'weak' };
  M.eye.ball.name = 'enemy-eye'; M.eye.ball.userData = { enemyType: 'eye', part: 'body' };
  M.guardian.rune.renderOrder = 1;

  // Ореолы всех врагов и снарядов — один аддитивный InstancedMesh
  const HALO_CAP = cap.wisp + cap.fairy + cap.skull + cap.guardian + cap.eye + 4 + PROJ_MAX * 3;
  const halos = inst(G.halo, haloMat, HALO_CAP, false);
  halos.renderOrder = 2;
  // Ядра снарядов
  const projMesh = inst(G.proj, projMat, PROJ_MAX, false);

  // Босс: обычные меши
  const bossGroup = new THREE.Group();
  bossGroup.name = 'enemy-boss';
  bossGroup.visible = false;
  root.add(bossGroup);
  function bossMesh(geo, mat, part) {
    const m = new THREE.Mesh(geo, mat);
    m.userData = { enemyType: 'boss', part };
    m.raycast = function (r, i) { if (rootVisible && boss && this.visible) THREE.Mesh.prototype.raycast.call(this, r, i); };
    return m;
  }
  const bossBody = bossMesh(G.boss.body, bossMat, 'body');
  const bossArmL = bossMesh(G.boss.armL, bossMat, 'body');
  const bossArmR = bossMesh(G.boss.armR, bossMat, 'body');
  const bossCore = bossMesh(G.boss.core, bossCoreMat, 'weak');
  bossArmL.position.set(-2.0, 5.0, 0);
  bossArmR.position.set(2.0, 5.0, 0);
  bossCore.name = 'enemy-boss-core';
  bossBody.name = 'enemy-boss';
  bossArmL.name = 'enemy-boss-arm-l';
  bossArmR.name = 'enemy-boss-arm-r';
  bossGroup.add(bossBody, bossArmL, bossArmR, bossCore);
  const coreLocal = BOSS_CORE.clone();       // ядро в координатах босса
  const runeLocal = new THREE.Vector3(0, 1.45, 0.455); // центр руны стража
  const BOSS_BASE_COLOR = bossMat.color.clone();
  const BOSS_GLOW = bossMat.userData.glowGain.value;

  const meshes = [M.wisp.core, M.fairy.body, M.skull.body, M.guardian.body, M.guardian.rune, M.eye.ball,
    bossBody, bossArmL, bossArmR, bossCore];
  // меши босса прячем вместе с группой: Raycaster не смотрит на видимость родителя
  let bossArmsOff = false; // у GLB-колосса руки свои
  function setBossMeshes(v) { bossBody.visible = bossCore.visible = v; bossArmL.visible = bossArmR.visible = v && !bossArmsOff; }
  setBossMeshes(false);

  // ---------- Пулы врагов ----------
  let nextId = 1;
  function makeEnemy(type) {
    const pos = new THREE.Vector3();
    return {
      id: 0, type, def: ENEMY_TYPES[type], alive: false, slot: -1, aIdx: -1,
      hp: 0, maxHp: 0, age: 0, life: 0, seed: 0,
      pos, position: pos, center: new THREE.Vector3(), anchor: new THREE.Vector3(),
      vel: new THREE.Vector3(), tgt: new THREE.Vector3(), dodge: new THREE.Vector3(),
      quat: new THREE.Quaternion(), scale: 1, vis: 1, yaw: 0, side: 1, zig: 0, walk: 0,
      burn: 0, slow: 0, flash: 0, dodgeCd: 0, attackT: 0, chargeT: 0, charging: false,
      phase: 1, emerge: 0, lift: 0, mark: 0,
    };
  }
  const free = {}, lists = {};
  for (const t of TYPES) {
    free[t] = [];
    lists[t] = [];
    for (let i = 0; i < cap[t]; i++) free[t].push(makeEnemy(t));
  }
  const active = [];
  let boss = null;

  // ---------- Снаряды ----------
  const projList = [];
  const projFree = [];
  for (let i = 0; i < PROJ_MAX; i++) {
    const pos = new THREE.Vector3();
    projFree.push({
      id: 0, alive: false, slot: -1, position: pos, pos, prev: new THREE.Vector3(), vel: new THREE.Vector3(),
      speed: 0, age: 0, deflected: false, damage: 1, owner: null, ownerType: null, radius: PROJ_R,
    });
  }
  let projId = 1;

  // ---------- События ----------
  const evPool = [];
  for (let i = 0; i < EV_N; i++) {
    evPool.push({
      type: '', origin: null, dir: null, point: null, position: null, from: null, to: null,
      speed: 0, damage: 0, projectile: null, enemy: null, killed: false, points: 0, color: 0, kind: null, phase: 0,
      _a: new THREE.Vector3(), _b: new THREE.Vector3(),
    });
  }
  let evHead = 0;
  const events = [];
  const pending = []; // события из hit/deflect/spawn — уходят в следующий update
  let inUpdate = false;
  function ev(type) {
    const e = evPool[evHead];
    evHead = (evHead + 1) % EV_N;
    e.type = type;
    e.origin = e.dir = e.point = e.position = e.from = e.to = null;
    e.speed = 0; e.damage = 0; e.projectile = null; e.enemy = null; e.killed = false; e.points = 0;
    e.color = 0; e.kind = null; e.phase = 0;
    (inUpdate ? events : pending).push(e);
    return e;
  }
  function burst(pos, color, kind) {
    const e = ev('burst');
    e.position = e._a.copy(pos);
    e.color = color;
    e.kind = kind;
  }

  // Состояние игрока (последний update)
  const head = new THREE.Vector3(0, 1.6, 0);
  const fwd = new THREE.Vector3(0, 0, -1);

  // Результаты (переиспользуются)
  const hitRes = { killed: false, points: 0, type: null, weakPoint: false, blocked: false, enemy: null, position: new THREE.Vector3() };
  const projRes = { projectile: null, point: new THREE.Vector3(), distance: 0 };

  // ---------- Запись экземпляров ----------
  function tint(e, out) {
    out.setRGB(1, 1, 1);
    if (e.burn > 0) out.multiply(_c2.setRGB(1.25, 0.62, 0.32));
    if (e.slow > 0) out.multiply(_c2.setRGB(0.55, 0.85, 1.35));
    if (e.flash > 0) {
      const k = clamp01(e.flash / FLASH_T);
      out.r += (4 - out.r) * k; out.g += (4 - out.g) * k; out.b += (4 - out.b) * k;
    }
    return out;
  }

  function setCounts(type) {
    const n = lists[type].length;
    const ms = M[type];
    if (!ms) return;
    for (const k in ms) {
      const mesh = ms[k];
      const per = (type === 'wisp' && k === 'sparks') || (type === 'eye' && k === 'wings') ? (type === 'wisp' ? 3 : 2) : 1;
      mesh.count = n * per;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
  }

  function writeEnemy(e) {
    const T = e.type;
    if (T === 'boss') return;
    const s = e.slot;
    const sc = e.scale * e.vis;
    _scl.set(sc, sc, sc);
    _m.compose(e.pos, e.quat, _scl);
    tint(e, _c);
    if (T === 'wisp') {
      const p = 1 + 0.08 * Math.sin(e.age * 7 + e.seed * 9);
      _scl.multiplyScalar(p);
      _m.compose(e.pos, e.quat, _scl);
      M.wisp.core.setMatrixAt(s, _m);
      M.wisp.core.setColorAt(s, _c.multiplyScalar(1.2));
      const tilt = e.seed * 2 - 1;
      for (let k = 0; k < 3; k++) {
        const a = e.age * 2.6 + k * TAU / 3 + e.seed * 6;
        const r = 0.3 * sc;
        _v.set(Math.cos(a) * r, Math.sin(a) * r * 0.45 * tilt + 0.05 * sc + Math.sin(e.age * 3 + k) * 0.04 * sc, Math.sin(a) * r).add(e.pos);
        const ss = sc * (0.7 + 0.4 * Math.sin(e.age * 9 + k * 2));
        _m2.compose(_v, _qI, _scl2.set(ss, ss, ss));
        M.wisp.sparks.setMatrixAt(s * 3 + k, _m2);
        M.wisp.sparks.setColorAt(s * 3 + k, _c);
      }
    } else if (T === 'fairy') {
      M.fairy.body.setMatrixAt(s, _m);
      M.fairy.body.setColorAt(s, _c);
      const flap = 0.2 + 0.8 * Math.abs(Math.sin(e.age * 24 + e.seed * 5));
      _m2.compose(_off.set(0, 0.03, -0.035), _qI, _scl2.set(flap, 1, 1));
      _m3.multiplyMatrices(_m, _m2);
      M.fairy.wings.setMatrixAt(s, _m3);
      M.fairy.wings.setColorAt(s, _c);
    } else if (T === 'skull') {
      M.skull.body.setMatrixAt(s, _m);
      M.skull.body.setColorAt(s, _c);
    } else if (T === 'guardian') {
      M.guardian.body.setMatrixAt(s, _m);
      M.guardian.body.setColorAt(s, _c);
      M.guardian.rune.setMatrixAt(s, _m);
      let k = 0.8 + 0.25 * Math.sin(e.age * 3.2 + e.seed * 4);
      if (e.hp < e.maxHp) k *= 0.55 + 0.45 * (Math.sin(e.age * 31) > 0 ? 1 : 0.3); // повреждённая руна мерцает
      _c2.copy(_c).multiplyScalar(k);
      M.guardian.rune.setColorAt(s, _c2);
    } else if (T === 'eye') {
      if (e.charging) {
        const k = 1 - clamp01(e.chargeT / 0.8);
        _c.multiply(_c2.setRGB(1 + 0.6 * k, 1 + 0.15 * k, 1 - 0.3 * k));
      }
      M.eye.ball.setMatrixAt(s, _m);
      M.eye.ball.setColorAt(s, _c);
      const flap = Math.sin(e.age * 8 + e.seed * 6) * 0.6 + 0.1;
      for (let k = 0; k < 2; k++) {
        const sx = k === 0 ? 1 : -1;
        _euler.set(0, sx * 0.35, sx * flap);
        _q2.setFromEuler(_euler);
        _m2.compose(_off.set(sx * 0.27, 0.08, -0.1), _q2, _scl2.set(sx, 1, 1));
        _m3.multiplyMatrices(_m, _m2);
        M.eye.wings.setMatrixAt(s * 2 + k, _m3);
        M.eye.wings.setColorAt(s * 2 + k, _c);
      }
    }
  }

  // Поворот лицом (+Z) к точке
  function faceQuat(out, from, to) {
    _m.lookAt(to, from, UP);
    return out.setFromRotationMatrix(_m);
  }

  let haloN = 0;
  function pushHalo(pos, size, r, g, b) {
    if (haloN >= HALO_CAP) return;
    faceQuat(_q2, pos, head);
    _m2.compose(pos, _q2, _scl2.set(size, size, size));
    halos.setMatrixAt(haloN, _m2);
    halos.setColorAt(haloN, _c2.setRGB(r, g, b));
    haloN++;
  }
  function writeHalos() {
    haloN = 0;
    for (let i = 0; i < active.length; i++) {
      const e = active[i];
      const sc = e.scale * e.vis;
      if (sc <= 0.001) continue;
      const fl = 1 + (e.flash > 0 ? 1.5 : 0);
      if (e.type === 'wisp') {
        const k = (0.75 + 0.25 * Math.sin(e.age * 5 + e.seed * 7)) * fl;
        pushHalo(e.pos, 1.0 * sc, 0.22 * k, 0.55 * k, 1.0 * k);
      } else if (e.type === 'fairy') {
        pushHalo(e.pos, 0.85 * sc, 0.9 * fl, 0.6 * fl, 0.18 * fl);
      } else if (e.type === 'skull') {
        const k = (0.5 + 0.15 * Math.sin(e.age * 4)) * fl;
        pushHalo(e.pos, 1.0 * sc, 0.38 * k, 0.08 * k, 0.6 * k);
      } else if (e.type === 'guardian') {
        _v.copy(runeLocal).setZ(runeLocal.z + 0.04).multiplyScalar(sc).applyQuaternion(e.quat).add(e.pos);
        const k = (0.55 + 0.2 * Math.sin(e.age * 3.2 + e.seed * 4)) * fl;
        pushHalo(_v, 0.9 * sc, 0.15 * k, 0.75 * k, 1.0 * k);
      } else if (e.type === 'eye') {
        _v.set(0, 0, 0.42).multiplyScalar(sc).applyQuaternion(e.quat).add(e.pos);
        const ch = e.charging ? 1 - clamp01(e.chargeT / 0.8) : 0;
        const k = (0.35 + 1.1 * ch) * fl;
        pushHalo(_v, (0.55 + 1.1 * ch) * sc, 1.0 * k, 0.45 * k, 0.12 * k);
      } else if (e.type === 'boss') {
        const ch = e.charging ? 1 - clamp01(e.chargeT / 1.0) : 0;
        const p2 = e.phase === 2 ? 1 : 0;
        const k = (0.7 + 0.15 * Math.sin(e.age * 4) + 0.8 * ch) * fl;
        pushHalo(e.center, (2.6 + 1.6 * ch) * e.vis, 1.0 * k, (0.45 - 0.2 * p2) * k, (0.1 - 0.05 * p2) * k);
      }
    }
    for (let i = 0; i < projList.length; i++) {
      const p = projList[i];
      const fl = 0.9 + 0.1 * Math.sin(p.age * 40 + p.id);
      _v.copy(p.vel).normalize();
      if (p.deflected) {
        pushHalo(p.pos, 1.0 * fl, 0.2, 0.55, 1.0);
        pushHalo(_v3.copy(p.pos).addScaledVector(_v, -0.22), 0.65, 0.1, 0.3, 0.75);
        pushHalo(_v3.copy(p.pos).addScaledVector(_v, -0.42), 0.45, 0.05, 0.18, 0.5);
      } else {
        pushHalo(p.pos, 1.0 * fl, 1.0, 0.42, 0.1);
        pushHalo(_v3.copy(p.pos).addScaledVector(_v, -0.22), 0.65, 0.8, 0.22, 0.04);
        pushHalo(_v3.copy(p.pos).addScaledVector(_v, -0.42), 0.45, 0.55, 0.1, 0.02);
      }
    }
    halos.count = haloN;
    halos.visible = haloN > 0;
    halos.instanceMatrix.needsUpdate = true;
    halos.instanceColor.needsUpdate = true;
  }

  function writeProjectiles() {
    for (let i = 0; i < projList.length; i++) {
      const p = projList[i];
      _v.copy(p.vel).normalize();
      _q.setFromUnitVectors(_Z, _v);
      const r = PROJ_R * (1 + 0.12 * Math.sin(p.age * 35 + p.id));
      _m.compose(p.pos, _q, _scl.set(r, r, r * 1.6));
      projMesh.setMatrixAt(i, _m);
      if (p.deflected) _c.setRGB(0.75, 0.95, 1.0);
      else _c.setRGB(1.0, 0.82, 0.35);
      projMesh.setColorAt(i, _c);
    }
    projMesh.count = projList.length;
    projMesh.visible = projList.length > 0;
    projMesh.instanceMatrix.needsUpdate = true;
    projMesh.instanceColor.needsUpdate = true;
  }

  function updateBounds() {
    for (const t of TYPES) {
      const ms = M[t];
      if (!ms || lists[t].length === 0) continue;
      for (const k in ms) if (ms[k].frustumCulled) ms[k].computeBoundingSphere();
    }
  }

  // ---------- Спавн / удаление ----------
  function pickSpawn(type, out) {
    const d = ENEMY_TYPES[type];
    const a = type === 'boss' ? 0 : rand(-70, 70) * Math.PI / 180;
    const ca = Math.cos(a), sa = Math.sin(a);
    const dx = fwd.x * ca + fwd.z * sa, dz = -fwd.x * sa + fwd.z * ca;
    const dist = rand(d.dist[0], d.dist[1]);
    return out.set(head.x + dx * dist, rand(d.height[0], d.height[1]), head.z + dz * dist);
  }

  function updateCenter(e) {
    const c = e.center.copy(e.pos);
    if (e.type === 'guardian') c.y += runeLocal.y * 0.93 * e.scale;
    else if (e.type === 'boss') {
      // центр = ядро в мире
      c.copy(coreLocal).applyAxisAngle(UP, e.yaw).add(e.pos);
    }
  }

  function spawn(type, position) {
    const def = ENEMY_TYPES[type];
    if (!def) return null;
    if (type === 'boss' && boss) return null;
    const e = free[type].pop();
    if (!e) return null;
    e.id = nextId++;
    e.alive = true;
    e.hp = e.maxHp = def.hp;
    e.age = 0;
    e.life = def.life;
    e.seed = Math.random();
    e.burn = e.slow = e.flash = e.dodgeCd = 0;
    e.charging = false; e.chargeT = 0;
    e.phase = 1; e.emerge = 0; e.lift = 0; e.walk = 0; e.mark = 0;
    e.vel.set(0, 0, 0); e.tgt.set(0, 0, 0); e.dodge.set(0, 0, 0);
    e.scale = type === 'fairy' ? 1.35 : 1;
    e.vis = 0;
    e.side = Math.random() < 0.5 ? -1 : 1;
    e.zig = 0;
    if (position) e.pos.copy(position); else pickSpawn(type, e.pos);
    if (type === 'guardian' || type === 'boss') e.pos.y = 0;
    e.anchor.copy(e.pos);
    e.yaw = Math.atan2(head.x - e.pos.x, head.z - e.pos.z);
    e.quat.setFromAxisAngle(UP, e.yaw);
    if (type === 'eye') e.attackT = rand(1.8, 3.2);
    else if (type === 'boss') e.attackT = 2.5;
    else e.attackT = 0;
    if (type === 'skull') {
      const a = Math.random() * TAU;
      e.vel.set(Math.cos(a) * 0.35, rand(-0.08, 0.08), Math.sin(a) * 0.35);
    }
    e.aIdx = active.length;
    active.push(e);
    if (type === 'boss') {
      boss = e;
      e.vis = 1;
      bossGroup.visible = true; setBossMeshes(true);
      updateBoss(e, 0);
      ev('boss-roar');
    } else {
      const list = lists[type];
      e.slot = list.length;
      list.push(e);
      updateCenter(e);
      writeEnemy(e);
      setCounts(type);
      const ms = M[type];
      for (const k in ms) if (ms[k].frustumCulled) ms[k].computeBoundingSphere();
    }
    burst(type === 'boss' ? e.pos : e.center, def.color, 'spawn');
    writeHalos();
    return e;
  }

  function removeEnemy(e) {
    if (!e.alive) return;
    e.alive = false;
    // из общего списка
    const ai = e.aIdx;
    const lastA = active.pop();
    if (lastA !== e) { active[ai] = lastA; lastA.aIdx = ai; }
    e.aIdx = -1;
    if (e.type === 'boss') {
      boss = null;
      bossGroup.visible = false; setBossMeshes(false);
    } else {
      const list = lists[e.type];
      const i = e.slot;
      const last = list.pop();
      if (last !== e) { list[i] = last; last.slot = i; writeEnemy(last); }
      setCounts(e.type);
    }
    e.slot = -1;
    free[e.type].push(e);
  }

  // Урон: true — убит (удаление делает вызывающий)
  function applyDamage(e, dmg) {
    if (!e.alive || dmg <= 0) return false;
    e.hp -= dmg;
    if (e.hp <= 0) return true;
    e.flash = FLASH_T;
    if (e.type === 'boss' && e.phase === 1 && e.hp <= e.maxHp * 0.5) {
      e.phase = 2;
      const p = ev('boss-phase'); p.phase = 2;
      ev('boss-roar');
    }
    return false;
  }

  function killBurst(e) {
    burst(e.center, e.def.color, e.type === 'boss' ? 'boss-death' : 'death');
  }

  // Смерть от эффекта (поджог, цепь)
  function killByEffect(e) {
    killBurst(e);
    const k = ev('killed');
    k.enemy = e;
    k.points = e.def.points;
    k.position = k._b.copy(e.center);
    removeEnemy(e);
  }

  // Молния: цели выбираются от источника, урон — после попадания по источнику
  let chainStamp = 1;
  const chainTargets = [];
  let chainDmg = 0;
  function chainFrom(src, dmg, fresh) {
    if (fresh || chainTargets.length === 0) chainStamp++;
    chainTargets.length = 0;
    chainDmg = dmg;
    src.mark = chainStamp;
    _v3.copy(src.center);
    for (let n = 0; n < CHAIN_N; n++) {
      let best = null, bestD = CHAIN_R * CHAIN_R;
      for (let i = 0; i < active.length; i++) {
        const o = active[i];
        if (o.mark === chainStamp || o.type === 'skull' || o.type === 'guardian') continue;
        const d2 = o.center.distanceToSquared(_v3);
        if (d2 < bestD) { bestD = d2; best = o; }
      }
      if (!best) break;
      best.mark = chainStamp;
      const c = ev('chain');
      c.from = c._a.copy(_v3);
      c.to = c._b.copy(best.center);
      c.enemy = best;
      _v3.copy(best.center);
      chainTargets.push(best);
    }
  }
  function runChain() {
    for (let i = 0; i < chainTargets.length; i++) {
      const o = chainTargets[i];
      if (!o.alive) continue;
      const d = o.type === 'boss' ? chainDmg * 0.25 : chainDmg;
      if (applyDamage(o, d)) { updateCenter(o); killByEffect(o); }
    }
    chainTargets.length = 0;
  }

  function nearestOf(list, point) {
    if (!point) return list[0] || null;
    let best = null, bestD = Infinity;
    for (let i = 0; i < list.length; i++) {
      const d = list[i].center.distanceToSquared(point);
      if (d < bestD) { bestD = d; best = list[i]; }
    }
    return best;
  }

  // Урон по врагу с учётом брони/слабого места/стихии; пишет в res
  function damageEnemy(e, weak, damage, element, res) {
    const type = e.type;
    let dmg = damage, blocked = false;
    if (type === 'guardian') {
      if (element === 'rune') dmg = e.hp;
      else if (!weak) { blocked = true; dmg = 0; }
    } else if (type === 'boss') {
      dmg *= weak ? 3 : 0.25;
    }
    const killed = applyDamage(e, dmg);
    updateCenter(e);
    res.killed = killed;
    res.points = killed ? e.def.points : 0;
    res.type = type;
    res.weakPoint = weak;
    res.blocked = blocked;
    res.enemy = e;
    res.position.copy(e.center);
    if (!killed) {
      if (element === 'fire' && !blocked) e.burn = BURN_T;
      else if (element === 'ice') e.slow = SLOW_T;
    }
    if (killed) {
      killBurst(e);
      removeEnemy(e);
    }
    return killed;
  }

  function hit(mesh, point, opts = EMPTY) {
    const ud = mesh && mesh.userData;
    const type = ud && ud.enemyType;
    if (!type || !rootVisible) return null;
    let e = null;
    if (type === 'boss') e = boss;
    else {
      const list = lists[type];
      const id = opts.instanceId;
      if (id !== undefined && id !== null && id >= 0 && id < list.length) e = list[id];
      else e = nearestOf(list, point);
    }
    if (!e || !e.alive) return null;
    const damage = opts.damage !== undefined ? opts.damage : 1;
    const element = opts.element || null;
    // молния: цепь считаем до удаления цели (её центр — начало цепи)
    if (element === 'lightning') { updateCenter(e); chainFrom(e, damage * CHAIN_K, true); }
    const killed = damageEnemy(e, ud.part === 'weak', damage, element, hitRes);
    if (element === 'lightning') runChain();
    if (killed || element === 'lightning') updateBounds();
    writeHalos();
    return hitRes;
  }

  // Урон по области: все живые враги, чей центр (с учётом радиуса тела) в radius от point.
  // Страж: щит блокирует, кроме попадания области в руну (центр руны ближе radius) или element 'rune'.
  // Возвращает переиспользуемый массив переиспользуемых результатов (как у hit()).
  const explodeRes = [];
  const explodeOut = [];
  const explodeTmp = [];
  const MAX_EXPLODE = 64;
  for (let i = 0; i < MAX_EXPLODE; i++) {
    explodeRes.push({ killed: false, points: 0, type: null, weakPoint: false, blocked: false, enemy: null, position: new THREE.Vector3(), distance: 0 });
  }
  function explode(point, radius, opts = EMPTY) {
    explodeOut.length = 0;
    if (!rootVisible || !point) return explodeOut;
    const damage = opts.damage !== undefined ? opts.damage : 1;
    const element = opts.element || null;
    explodeTmp.length = 0;
    for (let i = 0; i < active.length; i++) {
      const e = active[i];
      const r = radius + e.def.radius;
      if (e.center.distanceToSquared(point) <= r * r) explodeTmp.push(e);
    }
    for (let i = 0; i < explodeTmp.length && explodeOut.length < MAX_EXPLODE; i++) {
      const e = explodeTmp[i];
      if (!e.alive) continue; // убит цепью
      let weak = false;
      if (e.type === 'guardian') {
        _v.copy(runeLocal).multiplyScalar(e.scale).applyQuaternion(e.quat).add(e.pos);
        weak = _v.distanceToSquared(point) <= radius * radius;
      } else if (e.type === 'boss') {
        weak = e.center.distanceToSquared(point) <= (radius + 0.6) * (radius + 0.6);
      }
      const res = explodeRes[explodeOut.length];
      res.distance = Math.max(0, e.center.distanceTo(point) - e.def.radius);
      if (element === 'lightning') { updateCenter(e); chainFrom(e, damage * CHAIN_K, false); }
      damageEnemy(e, weak, damage, element, res);
      if (element === 'lightning') runChain();
      explodeOut.push(res);
    }
    explodeTmp.length = 0;
    updateBounds();
    writeHalos();
    return explodeOut;
  }

  function threat(origin, dir) {
    _seg.copy(dir).normalize();
    const list = lists.wisp;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dodgeCd > 0) continue;
      _v.subVectors(e.pos, origin);
      const t = _v.dot(_seg);
      if (t < 0) continue;
      _v2.copy(origin).addScaledVector(_seg, t);
      _off.subVectors(e.pos, _v2);
      const d = _off.length();
      if (d > DODGE_R) continue;
      if (d < 1e-3) { _off.crossVectors(_seg, UP); if (_off.lengthSq() < 1e-6) _off.set(1, 0, 0); }
      _off.normalize();
      _off.y = _off.y * 0.5 + rand(-0.25, 0.35);
      _off.normalize();
      e.dodge.copy(_off).multiplyScalar(DODGE_V);
      e.dodgeCd = DODGE_CD;
    }
  }

  // ---------- Снаряды ----------
  function spawnProjectile(origin, dir, speed, owner, damage) {
    let p = projFree.pop();
    if (!p) { // пул полон — гасим самый старый
      let oldest = projList[0];
      for (let i = 1; i < projList.length; i++) if (projList[i].age > oldest.age) oldest = projList[i];
      destroyProj(oldest);
      p = projFree.pop();
    }
    p.id = projId++;
    p.alive = true;
    p.pos.copy(origin);
    p.prev.copy(origin);
    p.vel.copy(dir).normalize().multiplyScalar(speed);
    p.speed = speed;
    p.age = 0;
    p.deflected = false;
    p.damage = damage;
    p.owner = owner;
    p.ownerType = owner ? owner.type : null;
    p.slot = projList.length;
    projList.push(p);
    const f = ev('fireball');
    f.origin = f._a.copy(origin);
    f.dir = f._b.copy(dir).normalize();
    f.speed = speed;
    f.projectile = p;
    f.enemy = owner;
    return p;
  }

  function destroyProj(p) {
    if (!p || !p.alive) return;
    p.alive = false;
    const i = p.slot;
    const last = projList.pop();
    if (last !== p) { projList[i] = last; last.slot = i; }
    p.slot = -1;
    p.owner = null;
    projFree.push(p);
  }

  // расстояние² от точки до отрезка a-b
  function segDist2(a, b, c) {
    _seg.subVectors(b, a);
    const L2 = _seg.lengthSq();
    let t = 0;
    if (L2 > 1e-12) t = clamp01(_v2.subVectors(c, a).dot(_seg) / L2);
    _v2.copy(a).addScaledVector(_seg, t);
    return _v2.distanceToSquared(c);
  }

  const projectiles = {
    list: projList,
    hitTest(from, to, radius = 0) {
      _seg.subVectors(to, from);
      const L = _seg.length();
      if (L < 1e-6) return null;
      _seg.divideScalar(L);
      let best = null, bestT = Infinity;
      for (let i = 0; i < projList.length; i++) {
        const p = projList[i];
        _v.subVectors(p.pos, from);
        let t = _v.dot(_seg);
        t = t < 0 ? 0 : t > L ? L : t;
        _v2.copy(from).addScaledVector(_seg, t);
        const r = PROJ_HIT_R + radius;
        if (_v2.distanceToSquared(p.pos) <= r * r && t < bestT) { bestT = t; best = p; }
      }
      if (!best) return null;
      projRes.projectile = best;
      projRes.distance = bestT;
      projRes.point.copy(from).addScaledVector(_seg, bestT);
      return projRes;
    },
    deflect(p, dir) {
      if (!p || !p.alive) return false;
      _v.copy(dir);
      if (_v.lengthSq() < 1e-8) _v.copy(p.vel).negate();
      p.vel.copy(_v.normalize()).multiplyScalar(p.speed * DEFLECT_K);
      p.speed *= DEFLECT_K;
      p.deflected = true;
      p.age = 0;
      burst(p.pos, 0x7fd8ff, 'deflect');
      writeProjectiles();
      writeHalos();
      return true;
    },
    destroy(p) {
      destroyProj(p);
      writeProjectiles();
      writeHalos();
    },
  };

  function fireVolley(e) {
    const n = e.phase === 2 ? 5 : 3;
    const spread = e.phase === 2 ? 0.36 : 0.22;
    _v3.copy(head).sub(e.center).normalize();
    for (let i = 0; i < n; i++) {
      const a = n > 1 ? -spread + (2 * spread * i) / (n - 1) : 0;
      _v.copy(_v3).applyAxisAngle(UP, a);
      _off.copy(e.center).addScaledVector(_v, 0.7);
      spawnProjectile(_off, _v, 7, e, 1);
    }
  }

  // ---------- Поведение ----------
  // держать точку в кольце [rMin, rMax] от игрока и в коридоре высот
  function keepRing(p, rMin, rMax, yMin, yMax) {
    const dx = p.x - head.x, dz = p.z - head.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-4) { p.z = head.z - rMin; }
    else if (d < rMin || d > rMax) {
      const k = (d < rMin ? rMin : rMax) / d;
      p.x = head.x + dx * k; p.z = head.z + dz * k;
    }
    if (p.y < yMin) p.y = yMin; else if (p.y > yMax) p.y = yMax;
  }

  function updateWisp(e, dt) {
    e.anchor.addScaledVector(e.dodge, dt);
    e.dodge.multiplyScalar(Math.exp(-3.5 * dt));
    keepRing(e.anchor, 4, 10, 1.2, 3.2);
    const t = e.age, s = e.seed * 10;
    e.pos.set(
      e.anchor.x + Math.sin(t * 0.9 + s) * 0.55 + Math.sin(t * 1.9 + s * 2) * 0.2,
      e.anchor.y + Math.sin(t * 1.3 + s * 3) * 0.3,
      e.anchor.z + Math.cos(t * 0.7 + s) * 0.55 + Math.sin(t * 1.6 + s * 1.7) * 0.15);
    _euler.set(Math.sin(t * 1.7 + s) * 0.15, 0, Math.sin(t * 2.1 + s) * 0.18);
    e.quat.setFromEuler(_euler);
  }

  function updateFairy(e, dt) {
    e.zig -= dt;
    if (e.zig <= 0) {
      e.zig = rand(0.26, 0.48);
      e.side = -e.side;
      _v.set(e.pos.x - head.x, 0, e.pos.z - head.z).normalize(); // радиально
      _v2.crossVectors(UP, _v);                                  // вбок
      e.tgt.copy(_v2).multiplyScalar(e.side * rand(2.6, 3.8))
        .addScaledVector(UP, rand(-1.3, 1.3))
        .addScaledVector(_v, rand(-0.8, 0.8));
    }
    e.vel.lerp(e.tgt, 1 - Math.exp(-9 * dt));
    e.pos.addScaledVector(e.vel, dt);
    const y0 = e.pos.y;
    keepRing(e.pos, 3.5, 11, 1.0, 3.2);
    if (e.pos.y !== y0) e.tgt.y = -e.tgt.y;
    e.yaw = Math.atan2(head.x - e.pos.x, head.z - e.pos.z);
    _v.set(Math.cos(e.yaw), 0, -Math.sin(e.yaw)); // правый вектор
    const bank = -_v.dot(e.vel) * 0.12;
    _euler.set(0.15, e.yaw, bank, 'YXZ');
    e.quat.setFromEuler(_euler);
    _euler.order = 'XYZ';
  }

  function updateSkull(e, dt) {
    e.anchor.addScaledVector(e.vel, dt);
    const y0 = e.anchor.y, x0 = e.anchor.x, z0 = e.anchor.z;
    keepRing(e.anchor, 3.5, 9, 1.1, 2.8);
    if (e.anchor.y !== y0) e.vel.y = -e.vel.y;
    if (e.anchor.x !== x0 || e.anchor.z !== z0) { e.vel.x = -e.vel.x; e.vel.z = -e.vel.z; }
    const t = e.age;
    e.pos.copy(e.anchor);
    e.pos.y += Math.sin(t * 1.6 + e.seed * 6) * 0.12;
    const toHead = Math.atan2(head.x - e.pos.x, head.z - e.pos.z);
    _euler.set(Math.sin(t * 1.1 + e.seed) * 0.3, toHead + Math.sin(t * 0.8 + e.seed * 4) * 0.9, Math.sin(t * 1.3) * 0.35); // покачивается, лицом к игроку
    e.quat.setFromEuler(_euler);
  }

  function updateGuardian(e, dt) {
    const dx = head.x - e.pos.x, dz = head.z - e.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const stop = 1.7;                     // подходит на удар клинком
    let moving = false;
    // удар кулаком: в 2.2 м — замах 0.7 с, затем урон
    if (d < 2.2 && e.vis >= 1) {
      if (!e.charging) {
        e.attackT -= dt;
        if (e.attackT <= 0) { e.charging = true; e.chargeT = 0.7; ev('charge').enemy = e; }
      } else {
        e.chargeT -= dt;
        if (e.chargeT <= 0) {
          e.charging = false;
          e.attackT = 2.5;
          const h = ev('player-hit');
          h.damage = 2;
          h.enemy = e;
          h.point = h._a.copy(head);
          burst(head, 0x9fb4ff, 'impact');
        }
      }
    } else { e.charging = false; if (e.attackT < 0.8) e.attackT = 0.8; }
    if (d > stop + 0.02) {
      const step = Math.min(0.55 * dt, d - stop);
      e.pos.x += dx / d * step;
      e.pos.z += dz / d * step;
      moving = true;
    }
    e.walk += moving ? dt * 3.2 : 0;
    // поворот к игроку
    const target = Math.atan2(dx, dz);
    let da = target - e.yaw;
    da -= Math.round(da / TAU) * TAU;
    e.yaw += da * Math.min(1, dt * 2.5);
    const sw = moving ? Math.sin(e.walk) : 0;
    e.pos.y = moving ? Math.abs(Math.sin(e.walk)) * 0.05 : 0;
    _euler.set(0, e.yaw, sw * 0.05);
    e.quat.setFromEuler(_euler);
  }

  function updateEye(e, dt) {
    const t = e.age, s = e.seed * 10;
    e.pos.set(
      e.anchor.x + Math.sin(t * 0.55 + s) * 0.45,
      e.anchor.y + Math.sin(t * 1.4 + s) * 0.15,
      e.anchor.z + Math.cos(t * 0.45 + s) * 0.3);
    faceQuat(e.quat, e.pos, head);
    if (!e.charging) {
      e.attackT -= dt;
      if (e.attackT <= 0 && e.vis >= 1) {
        e.charging = true;
        e.chargeT = 0.8;
        ev('charge').enemy = e;
      }
    } else {
      e.chargeT -= dt;
      if (e.chargeT <= 0) {
        e.charging = false;
        e.attackT = rand(3, 4.5);
        _v.set(0, 0, 0.45).applyQuaternion(e.quat).add(e.pos);
        _v2.subVectors(head, _v).normalize();
        spawnProjectile(_v, _v2, 7, e, 1);
      }
    }
  }

  function updateBoss(e, dt) {
    if (e.emerge < BOSS_EMERGE) e.emerge = Math.min(BOSS_EMERGE, e.emerge + dt);
    const em = smooth(e.emerge / BOSS_EMERGE);
    // медленный поворот к игроку
    const target = Math.atan2(head.x - e.pos.x, head.z - e.pos.z);
    let da = target - e.yaw;
    da -= Math.round(da / TAU) * TAU;
    const mx = 0.45 * dt;
    e.yaw += da > mx ? mx : da < -mx ? -mx : da;
    // атака
    if (em >= 1) {
      if (!e.charging) {
        e.attackT -= dt;
        if (e.attackT <= 0) {
          e.charging = true;
          e.chargeT = 1.0;
          ev('charge').enemy = e;
        }
      } else {
        e.chargeT -= dt;
        if (e.chargeT <= 0) {
          e.charging = false;
          e.attackT = e.phase === 2 ? 2.8 : 4;
          updateCenter(e);
          fireVolley(e);
        }
      }
    }
    const liftT = e.charging ? smooth(1 - e.chargeT / 1.0) : 0;
    e.lift += (liftT - e.lift) * Math.min(1, dt * (e.charging ? 6 : 3));
    // вид
    bossGroup.position.set(e.pos.x, e.pos.y - 7.5 * (1 - em), e.pos.z);
    bossGroup.rotation.set(0, e.yaw, 0);
    const sway = Math.sin(e.age * 1.1) * 0.06;
    bossArmL.rotation.set(-e.lift * 1.25 + sway, 0, -0.12 - e.lift * 0.25);
    bossArmR.rotation.set(-e.lift * 1.25 - sway, 0, 0.12 + e.lift * 0.25);
    bossBody.position.y = Math.sin(e.age * 1.4) * 0.04;
    const cp = 1 + 0.06 * Math.sin(e.age * 5) + 0.25 * e.lift;
    bossCore.scale.setScalar(cp);
    bossCore.position.set(coreLocal.x * (1 - cp), coreLocal.y * (1 - cp), coreLocal.z * (1 - cp)); // масштаб вокруг ядра
    // оттенки
    const bm = bossBody.material;
    const p2 = e.phase === 2;
    const pulse = (p2 ? 1.5 : 1) + 0.15 * Math.sin(e.age * (p2 ? 6 : 3)) + 0.5 * e.lift;
    bm.color.copy(bm.userData.baseColor || BOSS_BASE_COLOR);
    if (bm.userData.glowGain) { bm.emissive.setRGB(0, 0, 0); bm.userData.glowGain.value = BOSS_GLOW * pulse; }
    else { bm.emissive.setRGB(1, 1, 1); bm.emissiveIntensity = bm.userData.baseEmissive * pulse; }
    if (e.slow > 0) bm.color.multiply(_c2.setRGB(0.6, 0.85, 1.35));
    if (e.burn > 0) bm.emissive.multiply(_c2.setRGB(1.4, 0.7, 0.4));
    if (e.flash > 0) { const k = 1 + clamp01(e.flash / FLASH_T) * 3; bm.color.multiplyScalar(k); }
    bossCoreMat.color.setRGB(1, p2 ? 0.75 : 1, p2 ? 0.7 : 1);
    bossGroup.updateMatrixWorld(true);
    e.pos.y = 0;
    updateCenter(e);
    e.center.y -= 7.5 * (1 - em);
  }

  // ---------- Кадр ----------
  function update(dt, opts) {
    inUpdate = true;
    events.length = 0;
    for (let i = 0; i < pending.length; i++) events.push(pending[i]);
    pending.length = 0;

    const hp = opts && opts.headPos;
    if (hp) head.copy(hp);
    const hd = opts && opts.headDir;
    if (hd) {
      const l = Math.sqrt(hd.x * hd.x + hd.z * hd.z);
      if (l > 0.1) fwd.set(hd.x / l, 0, hd.z / l);
    }
    const ts = opts && opts.timeScale !== undefined ? opts.timeScale : 1;
    if (dt > MAX_DT) dt = MAX_DT;
    const wdt = dt > 0 ? dt * ts : 0;

    // враги (с конца: удаление — перестановкой последнего)
    for (let i = active.length - 1; i >= 0; i--) {
      const e = active[i];
      if (!e || !e.alive) continue;
      const edt = e.slow > 0 ? wdt * SLOW_K : wdt;
      e.age += edt;
      if (e.slow > 0) e.slow -= wdt;
      if (e.flash > 0) e.flash -= wdt;
      if (e.dodgeCd > 0) e.dodgeCd -= wdt;
      if (e.burn > 0) {
        const b = Math.min(e.burn, wdt);
        e.burn -= wdt;
        e.hp -= b * BURN_DPS;
        if (e.hp <= 1e-6) { updateCenter(e); killByEffect(e); continue; }
      }
      const T = e.type;
      if (T === 'wisp') updateWisp(e, edt);
      else if (T === 'fairy') updateFairy(e, edt);
      else if (T === 'skull') updateSkull(e, edt);
      else if (T === 'guardian') updateGuardian(e, edt);
      else if (T === 'eye') updateEye(e, edt);
      else if (T === 'boss') { updateBoss(e, edt); continue; }
      // появление / исчезание
      let v = smooth(e.age / POP_T);
      if (e.life > 0) {
        v *= smooth((e.life - e.age) / FADE_T);
        if (e.age >= e.life) {
          updateCenter(e);
          const x = ev('escaped');
          x.enemy = e;
          x.position = x._a.copy(e.center);
          burst(e.center, e.def.color, 'escape');
          removeEnemy(e);
          continue;
        }
      }
      e.vis = v;
      updateCenter(e);
      writeEnemy(e);
    }

    // снаряды
    for (let i = projList.length - 1; i >= 0; i--) {
      const p = projList[i];
      p.age += wdt;
      p.prev.copy(p.pos);
      p.pos.addScaledVector(p.vel, wdt);
      if (p.age >= PROJ_LIFE || p.pos.lengthSq() > 3600) { destroyProj(p); continue; }
      if (p.deflected) {
        // по врагам
        let target = null;
        for (let j = 0; j < active.length; j++) {
          const e = active[j];
          const r = e.def.radius + PROJ_R;
          if (segDist2(p.prev, p.pos, e.center) <= r * r) { target = e; break; }
        }
        if (target) {
          const dmg = target.type === 'guardian' ? target.hp : DEFLECT_DMG;
          const killed = applyDamage(target, dmg);
          const h = ev('projectile-hit');
          h.projectile = p;
          h.enemy = target;
          h.killed = killed;
          h.points = killed ? target.def.points : 0;
          h.position = h._a.copy(p.pos);
          burst(p.pos, 0x7fd8ff, 'impact');
          if (killed) { killBurst(target); removeEnemy(target); }
          destroyProj(p);
          continue;
        }
      } else if (segDist2(p.prev, p.pos, head) <= HEAD_R * HEAD_R) {
        const h = ev('player-hit');
        h.damage = p.damage;
        h.projectile = p;
        h.point = h._a.copy(p.pos);
        burst(p.pos, 0xff7a2a, 'impact');
        destroyProj(p);
        continue;
      }
      if (p.pos.y <= 0.05) {
        burst(p.pos, p.deflected ? 0x7fd8ff : 0xff7a2a, 'impact');
        destroyProj(p);
      }
    }

    // упакованные буферы
    for (const t of TYPES) if (M[t]) setCounts(t);
    writeProjectiles();
    writeHalos();
    updateBounds();
    inUpdate = false;
    return events;
  }

  function clear() {
    for (let i = active.length - 1; i >= 0; i--) removeEnemy(active[i]);
    for (let i = projList.length - 1; i >= 0; i--) destroyProj(projList[i]);
    pending.length = 0;
    writeProjectiles();
    writeHalos();
  }

  function setVisible(v) {
    rootVisible = !!v;
    root.visible = rootVisible;
  }

  function dispose() {
    disposed = true;
    clear();
    scene.remove(root);
    for (const d of disposables) d.dispose();
    for (const t of TYPES) if (M[t]) for (const k in M[t]) M[t][k].dispose();
    halos.dispose();
    projMesh.dispose();
  }

  // ---------- GLB-модели (assets/models): подмена геометрии тел, процедурный вид — запасной ----------
  // fit: масштаб; float — центрировать по рамке (парящие); hide — процедурные детали, которые прячем
  const GLB_FIT = {
    wisp: { s: 1.1, float: true, mesh: () => M.wisp.core, glow: 1.6 },
    skull: { s: 1.9, float: true, mesh: () => M.skull.body, glow: 1.5 },
    eye: { s: 2.1, float: true, mesh: () => M.eye.ball, hide: () => M.eye.wings, glow: 1.4 },
    guardian: { s: 1.12, float: false, mesh: () => M.guardian.body, glow: 1.6 },
    boss: { s: 1.17, float: false, mesh: () => bossBody, glow: 1.8 },
  };
  const GLB_DEFAULT = ['wisp', 'guardian']; // босс/череп/глаз процедурные ближе к замыслу (лава, зелёные глаза, крылья)
  const glbUsed = {};
  async function loadGlb() {
    if (!glb || typeof window === 'undefined' || typeof fetch === 'undefined') return false;
    let mod;
    try { mod = await import('./assets.js'); } catch (err) { return false; }
    // глаз по умолчанию процедурный: машущие крылья и свечение заряда — отдельные части
    const want = Array.isArray(glb) ? glb : GLB_DEFAULT;
    const ids = Object.keys(GLB_FIT).filter((id) => want.includes(id));
    const roots = await Promise.all(ids.map((id) => mod.loadModel(id).catch(() => null)));
    if (disposed) return false;
    let any = false;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i], obj = roots[i];
      if (!obj) continue;
      try { if (applyGlb(id, obj, mod.modelInfo(id))) any = true; } catch (err) { console.warn('[enemies] GLB', id, err); }
    }
    return any;
  }
  function applyGlb(id, obj, info) {
    let src = null;
    obj.updateMatrixWorld(true);
    obj.traverse((o) => { if (!src && o.isMesh) src = o; });
    if (!src) return false;
    const fit = GLB_FIT[id];
    const geo = src.geometry.clone();
    _m.copy(obj.matrixWorld).invert().multiply(src.matrixWorld);
    geo.applyMatrix4(_m);
    geo.rotateY(Math.PI); // модели смотрят в −Z, наши враги — в +Z (к игроку)
    geo.scale(fit.s, fit.s, fit.s);
    geo.computeBoundingBox();
    if (fit.float) {
      geo.boundingBox.getCenter(_v);
      geo.translate(-_v.x, -_v.y, -_v.z);
    }
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    disposables.push(geo);
    const sm = src.material;
    const opts = {
      map: sm.map || null, emissiveMap: sm.emissiveMap || null, emissive: 0xffffff,
      side: sm.side, transparent: sm.transparent, alphaTest: sm.alphaTest,
    };
    let mat;
    if (low) mat = new THREE.MeshLambertMaterial(opts);
    else mat = new THREE.MeshStandardMaterial(Object.assign(opts, { roughness: 0.75, metalness: 0.05 }));
    mat.emissiveIntensity = fit.glow;
    mat.userData.baseEmissive = fit.glow;
    mat.userData.baseColor = mat.color.clone();
    disposables.push(mat);
    const mesh = fit.mesh();
    mesh.geometry = geo;
    mesh.material = mat;
    if (mesh.isInstancedMesh) { mesh.boundingSphere = null; if (mesh.count > 0) mesh.computeBoundingSphere(); }
    if (fit.hide) { const h = fit.hide(); h.raycast = noRaycast; h.layers.disableAll(); }
    const wp = info && info.nodes && info.nodes.WeakPoint;
    if (id === 'guardian') {
      // руна-мишень — на место WeakPoint модели
      const ny = wp ? wp.y * fit.s : runeLocal.y, nz = wp ? -wp.z * fit.s + 0.012 : runeLocal.z;
      const rg = M.guardian.rune.geometry;
      rg.translate(0, ny - 1.45, nz - 0.455);
      rg.computeBoundingSphere();
      runeLocal.set(0, ny, nz);
      M.guardian.rune.boundingSphere = null;
      if (M.guardian.rune.count > 0) M.guardian.rune.computeBoundingSphere();
    } else if (id === 'boss') {
      bossArmsOff = true;
      bossArmL.visible = bossArmR.visible = false;
      if (wp) {
        const ny = wp.y * fit.s, nz = -wp.z * fit.s;
        bossCore.geometry.translate(0, ny - coreLocal.y, nz - coreLocal.z + 0.05);
        // ядро меньше под пропорции модели: масштаб вокруг нового центра
        bossCore.geometry.translate(0, -ny, -(nz + 0.05));
        bossCore.geometry.scale(0.62, 0.62, 0.62);
        bossCore.geometry.translate(0, ny, nz + 0.05);
        bossCore.geometry.computeBoundingSphere();
        coreLocal.set(0, ny, nz + 0.05);
      }
    }
    glbUsed[id] = true;
    return true;
  }
  let disposed = false;
  const modelsReady = loadGlb().catch(() => false);

  return {
    modelsReady, glbUsed,
    spawn, clear, update, meshes, hit, explode, threat, projectiles,
    get count() { return active.length; },
    countOf(type) { return type === 'boss' ? (boss ? 1 : 0) : lists[type] ? lists[type].length : 0; },
    get boss() { return boss; },
    active,
    capacity: cap,
    group: root,
    setVisible, dispose,
  };
}
