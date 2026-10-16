// Баллистика: летящие пули вместо hitscan (гравитация, квадратичное сопротивление,
// пробитие), следы и трассеры, энергетические болты, гильзы и искры попаданий
import * as THREE from 'three';

const { randFloat, randFloatSpread, randInt } = THREE.MathUtils;
const TAU = Math.PI * 2;

// Полёт
const SUB_DT = 1 / 240;     // с, макс. под-шаг интегрирования
const SUB_LEN = 10;         // м, макс. длина под-шага
const MAX_DT = 0.1;         // с, защита от огромного dt (вкладка была в фоне)
const MAX_SUBSTEPS = 64;
const CONVERGE = 6;         // м, на этой дистанции видимый след сходится с физическим путём
const PEN_SLOW = 0.7;       // множитель скорости после пробития
const MAX_BULLETS = 256;    // лимит живых пуль (старейшая гасится)
const DEF_GRAVITY = 9.81;
const DEF_RANGE = 600;      // м
const DEF_LIFE = 3;         // с
const DEF_COLOR = 0xffd9a0;

// Следы (аддитивные: яркость цвета = «непрозрачность»)
const THIN_CAP = 160;       // тонкие следы обычных пуль
const BRIGHT_CAP = 256;     // трассеры и болты (итого ~400 сегментов)
const THIN_LIFE = 0.08;     // с
const BRIGHT_LIFE = 0.15;   // с (одинаковая для всего кольца — гаснут по порядку)
const THIN_R = 0.0015;      // м
const THIN_I = 0.25;        // яркость тонкого следа
const TRACER_R = 0.003;
const TRACER_HALO_R = 0.009;
const BOLT_TRAIL_R = 0.005;
const BOLT_HALO_R = 0.016;
const BOLT_LEN = 0.5;       // м, длина светящегося ядра болта
const BOLT_R = 0.014;       // м, радиус ядра

// Искры
const STREAK_CAP = 160;
const GLINT_CAP = 192;
const DUST_CAP = 96;
const GLINT_SIZE = 0.04;    // м, базовый размер блёстки
const DUST_SIZE = 0.22;     // м, базовый размер клуба пыли

// Гильзы
const CASING_MAX = 40;
const CASING_LIFE = 4;      // с
const CASING_FADE = 0.5;    // с, «таяние» (сжатие) в конце
const CASING_REST = 0.35;   // упругость отскока
const CASING_FRICTION = 0.6;
const CASING_G = 9.81;

// Профили гильз для LatheGeometry, мм: [радиус, высота от донца]
// r — радиус корпуса (лёжа на боку), len — длина
const CASING_DEFS = {
  pistol: { // 9×18
    len: 18, r: 4.9, segs: 10,
    profile: [[0, 0], [4.5, 0], [4.9, 0.4], [4.9, 1.0], [4.2, 1.3], [4.2, 1.9], [4.9, 2.4],
      [4.85, 18], [4.45, 18], [4.45, 15], [0, 15]],
  },
  rifle: { // 5,45×39, бутылочная
    len: 39, r: 5.0, segs: 10,
    profile: [[0, 0], [4.6, 0], [5.0, 0.5], [5.0, 1.1], [4.2, 1.4], [4.2, 2.0], [5.0, 2.6],
      [4.7, 26.5], [3.4, 30], [3.15, 31], [3.15, 39], [2.8, 39], [2.8, 35], [0, 35]],
  },
  sniper: { // 7,62×54R, с закраиной
    len: 54, r: 6.0, segs: 12,
    profile: [[0, 0], [6.9, 0], [7.2, 0.4], [7.2, 1.6], [6.1, 1.8], [6.05, 2.4],
      [5.75, 42.5], [4.6, 46.5], [4.25, 47.5], [4.25, 54], [3.9, 54], [3.9, 50], [0, 50]],
  },
  shell: { // 12 калибр: латунное донце + красная пластиковая гильза
    len: 70, r: 11.0, segs: 14,
    profile: [[0, 0], [10.9, 0], [11.3, 0.5], [11.3, 1.4], [10.9, 1.7], [10.9, 16], [10.3, 16]],
    hull: [[10.5, 15], [10.5, 67.5], [9.6, 69.5], [6, 70], [0, 69.3]],
  },
};

// Временные объекты (без аллокаций в кадре)
const _Z = new THREE.Vector3(0, 0, 1);
const _UP = new THREE.Vector3(0, 1, 0);
const _from = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _vis = new THREE.Vector3();
const _vdir = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _v = new THREE.Vector3();
const _ru = new THREE.Vector3();
const _bounce = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _euler = new THREE.Euler();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const ZERO_MAT = new THREE.Matrix4().makeScale(0, 0, 0);

// Эффекты не должны попадать под лучи игры
function noRaycast() {}

// Мягкая круглая текстура для точек
function makeSoftTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Размер точки из атрибута pSize (PointsMaterial умеет только общий size)
function patchPointSize(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float pSize;')
    .replace('gl_PointSize = size;', 'gl_PointSize = size * pSize;');
}

// Профиль в мм -> LatheGeometry в метрах, центр по длине
function lathe(profile, segs, halfMm) {
  const pts = [];
  for (let i = 0; i < profile.length; i++) {
    pts.push(new THREE.Vector2(profile[i][0] * 0.001, (profile[i][1] - halfMm) * 0.001));
  }
  return new THREE.LatheGeometry(pts, segs);
}

// Случайный единичный вектор
function randUnit(out) {
  const u = Math.random() * 2 - 1;
  const t = Math.random() * TAU;
  const s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(t), u, s * Math.sin(t));
}

// Индекс с наименьшим остатком жизни (замена самой старой частицы)
function minLifeIndex(life, n) {
  let idx = 0;
  let min = life[0];
  for (let i = 1; i < n; i++) if (life[i] < min) { min = life[i]; idx = i; }
  return idx;
}

export function createBallistics(scene, { onCasingBounce } = {}) {
  // --- Общие геометрии, текстура, материалы ---
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  beamGeo.rotateX(Math.PI / 2); // ось вдоль Z, длина 1 (масштаб: r, r, длина)
  const boltGeo = new THREE.SphereGeometry(1, 10, 8);
  const softTex = makeSoftTexture();
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.3 });
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xb3261e, metalness: 0, roughness: 0.55 });
  const boltMats = new Map(); // цвет -> { inner, outer }

  // Цвета (линейные)
  const WHITE = new THREE.Color(1, 1, 1);
  const SPARK_HOT = new THREE.Color(0xfff2c8);
  const SPARK_WARM = new THREE.Color(0xffa63d);
  const CYAN = new THREE.Color(0x5fe6ff);
  const DUST_A = new THREE.Color(0x6b5e50);
  const DUST_B = new THREE.Color(0x8a8072);
  const CHIP = new THREE.Color(0x3e3226);

  // Гильзы: геометрии и пулы по типам
  const casingGeo = {};
  const freeCasings = {};
  for (const kind in CASING_DEFS) {
    const d = CASING_DEFS[kind];
    const half = d.len / 2;
    casingGeo[kind] = {
      geo: lathe(d.profile, d.segs, half),
      hull: d.hull ? lathe(d.hull, d.segs, half) : null,
      h: half * 0.001, // м, полудлина
      r: d.r * 0.001,  // м, радиус
    };
    freeCasings[kind] = [];
  }

  const bullets = [];
  const freeBullets = [];
  const freeCores = [];
  const casings = [];
  let updating = false;
  let pendingClear = false;
  let pendingClearCb = null;
  let warm = 3; // первые кадры всё видно — шейдеры компилируются заранее

  // --- Пул следов: InstancedMesh, кольцевой буфер, гаснет цветом ---
  function additiveMat() {
    return new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, fog: false,
    });
  }

  function makeInstanced(cap) {
    const mat = additiveMat();
    const mesh = new THREE.InstancedMesh(beamGeo, mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.raycast = noRaycast;
    scene.add(mesh);
    return { mesh, mat };
  }

  function makeTrailPool(cap) {
    const { mesh, mat } = makeInstanced(cap);
    return {
      mesh, mat, cap, head: 0, used: 0,
      life: new Float32Array(cap), max: new Float32Array(cap), base: new Float32Array(cap * 3),
    };
  }

  const thin = makeTrailPool(THIN_CAP);
  const bright = makeTrailPool(BRIGHT_CAP);

  // Сегмент следа a -> b
  function addTrail(p, a, b, radius, life, r, g, bl) {
    _seg.subVectors(b, a);
    const len = _seg.length();
    if (len < 1e-4) return;
    _seg.divideScalar(len);
    _mid.addVectors(a, b).multiplyScalar(0.5);
    _q.setFromUnitVectors(_Z, _seg);
    _scl.set(radius, radius, len);
    _m.compose(_mid, _q, _scl);
    const i = p.head; // самый старый слот кольца
    p.head = (i + 1) % p.cap;
    if (i + 1 > p.used) p.used = i + 1;
    p.mesh.setMatrixAt(i, _m);
    p.life[i] = life;
    p.max[i] = life;
    const i3 = i * 3;
    const col = p.mesh.instanceColor.array;
    p.base[i3] = col[i3] = r;
    p.base[i3 + 1] = col[i3 + 1] = g;
    p.base[i3 + 2] = col[i3 + 2] = bl;
    p.mesh.count = p.used;
    p.mesh.visible = true;
    p.mesh.instanceMatrix.needsUpdate = true;
    p.mesh.instanceColor.needsUpdate = true;
  }

  function updateTrails(p, dt) {
    const col = p.mesh.instanceColor.array;
    let live = false;
    for (let i = 0; i < p.used; i++) {
      let l = p.life[i];
      if (l <= 0) continue;
      l -= dt;
      p.life[i] = l;
      const i3 = i * 3;
      if (l <= 0) {
        // погас: схлопываем в точку
        p.mesh.setMatrixAt(i, ZERO_MAT);
        col[i3] = col[i3 + 1] = col[i3 + 2] = 0;
        p.mesh.instanceMatrix.needsUpdate = true;
      } else {
        const k = l / p.max[i];
        col[i3] = p.base[i3] * k;
        col[i3 + 1] = p.base[i3 + 1] * k;
        col[i3 + 2] = p.base[i3 + 2] * k;
      }
      live = true;
    }
    if (live) p.mesh.instanceColor.needsUpdate = true;
    else if (p.used) resetTrails(p); // всё погасло — сброс кольца
    p.mesh.visible = p.used > 0 || warm > 0;
  }

  function resetTrails(p) {
    p.life.fill(0);
    p.used = 0;
    p.head = 0;
    p.mesh.count = 0;
  }

  // --- Искры-штрихи (металл, кристалл): InstancedMesh, ориентированы по скорости ---
  const streaks = (() => {
    const { mesh, mat } = makeInstanced(STREAK_CAP);
    const cap = STREAK_CAP;
    return {
      mesh, mat, cap, n: 0,
      pos: new Float32Array(cap * 3), vel: new Float32Array(cap * 3), base: new Float32Array(cap * 3),
      life: new Float32Array(cap), max: new Float32Array(cap),
      rad: new Float32Array(cap), lenK: new Float32Array(cap), grav: new Float32Array(cap),
    };
  })();

  function emitStreak(x, y, z, vx, vy, vz, r, g, bl, life, rad, lenK, grav) {
    const s = streaks;
    let i = s.n;
    if (i >= s.cap) i = minLifeIndex(s.life, s.cap);
    else s.n++;
    const i3 = i * 3;
    s.pos[i3] = x; s.pos[i3 + 1] = y; s.pos[i3 + 2] = z;
    s.vel[i3] = vx; s.vel[i3 + 1] = vy; s.vel[i3 + 2] = vz;
    s.base[i3] = r; s.base[i3 + 1] = g; s.base[i3 + 2] = bl;
    s.life[i] = life; s.max[i] = life;
    s.rad[i] = rad; s.lenK[i] = lenK; s.grav[i] = grav;
  }

  function copyStreak(s, from, to) {
    const f3 = from * 3, t3 = to * 3;
    for (let k = 0; k < 3; k++) {
      s.pos[t3 + k] = s.pos[f3 + k];
      s.vel[t3 + k] = s.vel[f3 + k];
      s.base[t3 + k] = s.base[f3 + k];
    }
    s.life[to] = s.life[from]; s.max[to] = s.max[from];
    s.rad[to] = s.rad[from]; s.lenK[to] = s.lenK[from]; s.grav[to] = s.grav[from];
  }

  function updateStreaks(dt) {
    const s = streaks;
    const prevN = s.n;
    let n = s.n;
    // 1) убираем погасшие (на место — последний, он уже обработан)
    for (let i = n - 1; i >= 0; i--) {
      const l = s.life[i] - dt;
      s.life[i] = l;
      if (l <= 0) { n--; if (i !== n) copyStreak(s, n, i); }
    }
    s.n = n;
    // 2) физика и матрицы
    const mesh = s.mesh;
    const col = mesh.instanceColor.array;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      let vx = s.vel[i3], vy = s.vel[i3 + 1] - s.grav[i] * dt, vz = s.vel[i3 + 2];
      const x = s.pos[i3] + vx * dt, z = s.pos[i3 + 2] + vz * dt;
      let y = s.pos[i3 + 1] + vy * dt;
      if (y < 0.003) { y = 0.003; if (vy < 0) vy = -vy * 0.35; vx *= 0.6; vz *= 0.6; }
      s.pos[i3] = x; s.pos[i3 + 1] = y; s.pos[i3 + 2] = z;
      s.vel[i3] = vx; s.vel[i3 + 1] = vy; s.vel[i3 + 2] = vz;
      const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (sp > 1e-4) _seg.set(vx / sp, vy / sp, vz / sp);
      else _seg.set(0, 1, 0);
      let len = sp * s.lenK[i];
      if (len < 0.01) len = 0.01; else if (len > 0.3) len = 0.3;
      _mid.set(x, y, z).addScaledVector(_seg, -0.5 * len); // голова штриха — в точке частицы
      _q.setFromUnitVectors(_Z, _seg);
      _scl.set(s.rad[i], s.rad[i], len);
      _m.compose(_mid, _q, _scl);
      mesh.setMatrixAt(i, _m);
      const k = s.life[i] / s.max[i];
      col[i3] = s.base[i3] * k;
      col[i3 + 1] = s.base[i3 + 1] * k;
      col[i3 + 2] = s.base[i3 + 2] * k;
    }
    mesh.count = n;
    if (n || prevN) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.visible = n > 0 || warm > 0;
  }

  // --- Точечные частицы (блёстки — аддитивно, пыль — обычное смешивание) ---
  function makePointPool(cap, size, additive) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(cap * 3);
    const col = new Float32Array(cap * 4);
    const psz = new Float32Array(cap);
    const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    const aCol = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
    const aSz = new THREE.BufferAttribute(psz, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', aPos);
    geo.setAttribute('color', aCol);
    geo.setAttribute('pSize', aSz);
    geo.setDrawRange(0, 0);
    const mat = new THREE.PointsMaterial({
      size, map: softTex, vertexColors: true, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: !additive, fog: !additive,
    });
    mat.onBeforeCompile = patchPointSize;
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.raycast = noRaycast;
    scene.add(points);
    return {
      points, geo, mat, aPos, aCol, aSz, pos, col, psz, cap, n: 0, fadeIn: !additive,
      vel: new Float32Array(cap * 3), base: new Float32Array(cap * 4),
      life: new Float32Array(cap), max: new Float32Array(cap),
      grav: new Float32Array(cap), drag: new Float32Array(cap),
      size0: new Float32Array(cap), grow: new Float32Array(cap),
      tw: new Float32Array(cap), // фаза мерцания (0 — без мерцания)
    };
  }

  const glints = makePointPool(GLINT_CAP, GLINT_SIZE, true);
  const dust = makePointPool(DUST_CAP, DUST_SIZE, false);

  function emitPoint(p, x, y, z, vx, vy, vz, r, g, bl, a, life, grav, drag, size0, grow, tw) {
    let i = p.n;
    if (i >= p.cap) i = minLifeIndex(p.life, p.cap);
    else p.n++;
    const i3 = i * 3, i4 = i * 4;
    p.pos[i3] = x; p.pos[i3 + 1] = y; p.pos[i3 + 2] = z;
    p.vel[i3] = vx; p.vel[i3 + 1] = vy; p.vel[i3 + 2] = vz;
    p.base[i4] = r; p.base[i4 + 1] = g; p.base[i4 + 2] = bl; p.base[i4 + 3] = a;
    p.life[i] = life; p.max[i] = life;
    p.grav[i] = grav; p.drag[i] = drag;
    p.size0[i] = size0; p.grow[i] = grow; p.tw[i] = tw;
  }

  function copyPoint(p, from, to) {
    const f3 = from * 3, t3 = to * 3, f4 = from * 4, t4 = to * 4;
    for (let k = 0; k < 3; k++) {
      p.pos[t3 + k] = p.pos[f3 + k];
      p.vel[t3 + k] = p.vel[f3 + k];
    }
    for (let k = 0; k < 4; k++) p.base[t4 + k] = p.base[f4 + k];
    p.life[to] = p.life[from]; p.max[to] = p.max[from];
    p.grav[to] = p.grav[from]; p.drag[to] = p.drag[from];
    p.size0[to] = p.size0[from]; p.grow[to] = p.grow[from]; p.tw[to] = p.tw[from];
  }

  function updatePoints(p, dt) {
    const prevN = p.n;
    let n = p.n;
    for (let i = n - 1; i >= 0; i--) {
      const l = p.life[i] - dt;
      p.life[i] = l;
      if (l <= 0) { n--; if (i !== n) copyPoint(p, n, i); }
    }
    p.n = n;
    const pos = p.pos, vel = p.vel, col = p.col, base = p.base;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3, i4 = i * 4;
      let vx = vel[i3], vy = vel[i3 + 1] - p.grav[i] * dt, vz = vel[i3 + 2];
      const d = p.drag[i];
      if (d > 0) { const f = 1 / (1 + d * dt); vx *= f; vy *= f; vz *= f; }
      const x = pos[i3] + vx * dt, z = pos[i3 + 2] + vz * dt;
      let y = pos[i3 + 1] + vy * dt;
      if (y < 0.005) { y = 0.005; if (vy < 0) vy = -vy * 0.3; vx *= 0.5; vz *= 0.5; }
      pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = z;
      vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz;
      const age = p.max[i] - p.life[i];
      let a = base[i4 + 3] * (p.life[i] / p.max[i]);
      const ph = p.tw[i];
      if (ph > 0) a *= 0.35 + 0.65 * Math.abs(Math.sin(ph + age * 38)); // мерцание
      if (p.fadeIn) a *= Math.min(1, 0.3 + age * 12);                    // мягкое появление
      col[i4] = base[i4]; col[i4 + 1] = base[i4 + 1]; col[i4 + 2] = base[i4 + 2]; col[i4 + 3] = a;
      p.psz[i] = p.size0[i] * (1 + p.grow[i] * age);
    }
    if (n || prevN) {
      p.aPos.needsUpdate = true;
      p.aCol.needsUpdate = true;
      p.aSz.needsUpdate = true;
      p.geo.setDrawRange(0, n);
    }
    p.points.visible = n > 0 || warm > 0;
  }

  // --- Искры попадания ---
  function spark(point, kind) {
    const x = point.x, z = point.z;
    const y = point.y > 0.01 ? point.y : 0.01;
    if (kind === 'ground') {
      // Клуб пыли: мягкие частицы растут и тают
      const nd = randInt(4, 6);
      for (let i = 0; i < nd; i++) {
        _c.lerpColors(DUST_A, DUST_B, Math.random());
        emitPoint(dust, x + randFloatSpread(0.08), y + 0.03, z + randFloatSpread(0.08),
          randFloatSpread(1.2), randFloat(0.4, 1.3), randFloatSpread(1.2),
          _c.r, _c.g, _c.b, randFloat(0.4, 0.6),
          randFloat(0.4, 0.6), 1.2, 3, randFloat(0.7, 1.1), 1.8, 0);
      }
      // Комочки земли
      const nc = randInt(3, 5);
      for (let i = 0; i < nc; i++) {
        emitPoint(dust, x, y + 0.01, z,
          randFloatSpread(1.6), randFloat(1.5, 3), randFloatSpread(1.6),
          CHIP.r, CHIP.g, CHIP.b, 0.95,
          randFloat(0.35, 0.5), 9.81, 0, randFloat(0.08, 0.14), 0, 0);
      }
    } else if (kind === 'crystal') {
      // Голубые мерцающие блёстки + пара штрихов
      emitPoint(glints, x, y, z, 0, 0, 0, 0.7, 1, 1, 1, 0.07, 0, 0, 3, 1, 0); // вспышка
      const ng = randInt(7, 11);
      for (let i = 0; i < ng; i++) {
        randUnit(_ru).multiplyScalar(randFloat(0.8, 2.5));
        _c.copy(CYAN).lerp(WHITE, Math.random() * 0.5);
        emitPoint(glints, x, y, z, _ru.x, _ru.y, _ru.z, _c.r, _c.g, _c.b, 1,
          randFloat(0.3, 0.5), 2, 1.5, randFloat(0.6, 1.3), 0, randFloat(0.1, TAU));
      }
      const ns = randInt(3, 4);
      for (let i = 0; i < ns; i++) {
        randUnit(_ru).multiplyScalar(randFloat(2, 5));
        emitStreak(x, y, z, _ru.x, _ru.y, _ru.z, CYAN.r, CYAN.g, CYAN.b,
          randFloat(0.12, 0.22), 0.0012, 0.03, 3);
      }
    } else {
      // Металл: вспышка + веер раскалённых искр с гравитацией
      emitPoint(glints, x, y, z, 0, 0, 0, 1, 0.92, 0.7, 1, 0.06, 0, 0, 4, 2, 0);
      const n = randInt(8, 14);
      for (let i = 0; i < n; i++) {
        randUnit(_ru);
        _ru.y = _ru.y * 0.6 + 0.35; // чуть вверх
        _ru.normalize().multiplyScalar(randFloat(3, 9));
        _c.lerpColors(SPARK_HOT, SPARK_WARM, Math.random());
        emitStreak(x, y, z, _ru.x, _ru.y, _ru.z, _c.r, _c.g, _c.b,
          randFloat(0.15, 0.32), 0.0016, 0.02, 9.81);
      }
      const ng = randInt(2, 3);
      for (let i = 0; i < ng; i++) {
        randUnit(_ru).multiplyScalar(randFloat(1.5, 4));
        emitPoint(glints, x, y, z, _ru.x, _ru.y, _ru.z, SPARK_HOT.r, SPARK_HOT.g, SPARK_HOT.b, 1,
          randFloat(0.2, 0.3), 9.81, 0, 0.5, 0, randFloat(0.1, TAU));
      }
    }
  }

  // --- Ядро энергетического болта ---
  function acquireCore(hex, at, dir) {
    let mats = boltMats.get(hex);
    if (!mats) {
      const inner = additiveMat();
      inner.color.set(hex).lerp(WHITE, 0.55);
      const outer = additiveMat();
      outer.color.set(hex);
      outer.opacity = 0.35;
      mats = { inner, outer };
      boltMats.set(hex, mats);
    }
    let core = freeCores.pop();
    if (!core) {
      core = new THREE.Mesh(boltGeo, mats.inner);
      const halo = new THREE.Mesh(boltGeo, mats.outer);
      halo.scale.set(2.6, 2.6, 1.25);
      halo.raycast = noRaycast;
      core.add(halo);
      core.raycast = noRaycast;
    }
    core.material = mats.inner;
    core.children[0].material = mats.outer;
    core.position.copy(at);
    core.quaternion.setFromUnitVectors(_Z, dir);
    core.scale.set(BOLT_R, BOLT_R, 0.03);
    scene.add(core);
    return core;
  }

  function placeCore(b, vis) {
    // направление — по видимому движению (след сходится к линии прицела)
    _vdir.subVectors(vis, b.prevVis);
    const l = _vdir.length();
    if (l > 1e-5) _vdir.divideScalar(l);
    else _vdir.copy(b.vel).normalize();
    const len = Math.min(BOLT_LEN, b.traveled + 0.05);
    b.core.position.copy(vis).addScaledVector(_vdir, -0.5 * len); // нос ядра — в точке пули
    b.core.quaternion.setFromUnitVectors(_Z, _vdir);
    b.core.scale.set(BOLT_R, BOLT_R, 0.5 * len);
  }

  // --- Пули ---
  function newBullet() {
    return {
      pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      visOff: new THREE.Vector3(), prevVis: new THREE.Vector3(),
      exclude: new Set(),
      k: 0, g: 0, pen: 0, traveled: 0, age: 0, maxRange: DEF_RANGE, maxLife: DEF_LIFE,
      shot: null, tracer: false, bolt: false, core: null,
      alive: false, killed: false, ended: true,
      r1: 1, g1: 1, b1: 1, r2: 0, g2: 0, b2: 0, // цвет следа: ядро и ореол
    };
  }

  function fire(o) {
    // лимит: самую старую живую пулю гасим на следующем update
    if (bullets.length >= MAX_BULLETS) {
      for (let i = 0; i < bullets.length; i++) {
        const ob = bullets[i];
        if (ob.alive && !ob.killed) { ob.killed = true; break; }
      }
    }
    const b = freeBullets.pop() || newBullet();
    const speed = o.speed || 0;
    b.pos.copy(o.origin);
    b.vel.copy(o.dir);
    const dl = b.vel.length();
    b.vel.multiplyScalar(dl > 0 ? speed / dl : 0);
    if (o.visualFrom) {
      b.visOff.subVectors(o.visualFrom, o.origin);
      b.prevVis.copy(o.visualFrom);
    } else {
      b.visOff.set(0, 0, 0);
      b.prevVis.copy(o.origin);
    }
    b.k = o.drag || 0;
    b.g = o.gravity ?? DEF_GRAVITY;
    b.pen = Math.max(0, Math.floor(o.penetration || 0));
    b.maxRange = o.maxRange ?? DEF_RANGE;
    b.maxLife = o.maxLife ?? DEF_LIFE;
    b.traveled = 0;
    b.age = 0;
    b.alive = true;
    b.killed = false;
    b.ended = false;
    b.shot = o.shot;
    b.tracer = !!o.tracer;
    b.bolt = !!o.bolt;
    b.exclude.clear();

    // Цвета следа (линейные)
    const hex = o.color ?? DEF_COLOR;
    _c.set(hex);
    if (b.bolt) {
      _c2.copy(_c).lerp(WHITE, 0.5);
      b.r1 = _c2.r; b.g1 = _c2.g; b.b1 = _c2.b;
      b.r2 = _c.r * 0.45; b.g2 = _c.g * 0.45; b.b2 = _c.b * 0.45;
    } else if (b.tracer) {
      _c2.copy(_c).lerp(WHITE, 0.35);
      b.r1 = _c2.r; b.g1 = _c2.g; b.b1 = _c2.b;
      b.r2 = _c.r * 0.3; b.g2 = _c.g * 0.3; b.b2 = _c.b * 0.3;
    } else {
      _c2.copy(_c).lerp(WHITE, 0.5);
      b.r1 = _c2.r * THIN_I; b.g1 = _c2.g * THIN_I; b.b1 = _c2.b * THIN_I;
      b.r2 = b.g2 = b.b2 = 0;
    }

    if (b.bolt) {
      _vdir.copy(b.vel);
      if (_vdir.lengthSq() > 0) _vdir.normalize(); else _vdir.copy(_Z);
      b.core = acquireCore(hex, b.prevVis, _vdir);
    } else {
      b.core = null;
    }
    bullets.push(b);
  }

  // Видимая позиция: физическая + смещение от дула, сходящееся к нулю за CONVERGE м
  function visPos(b, out) {
    const f = 1 - b.traveled / CONVERGE;
    out.copy(b.pos);
    if (f > 0) out.addScaledVector(b.visOff, f);
    return out;
  }

  function drawTrail(b, to) {
    if (b.bolt) {
      addTrail(bright, b.prevVis, to, BOLT_HALO_R, BRIGHT_LIFE, b.r2, b.g2, b.b2);
      addTrail(bright, b.prevVis, to, BOLT_TRAIL_R, BRIGHT_LIFE, b.r1, b.g1, b.b1);
    } else if (b.tracer) {
      addTrail(bright, b.prevVis, to, TRACER_HALO_R, BRIGHT_LIFE, b.r2, b.g2, b.b2);
      addTrail(bright, b.prevVis, to, TRACER_R, BRIGHT_LIFE, b.r1, b.g1, b.b1);
    } else {
      addTrail(thin, b.prevVis, to, THIN_R, THIN_LIFE, b.r1, b.g1, b.b1);
    }
  }

  // Отрезок под-шага: попадания, пробитие, пол. true — пуля остановилась.
  // _from и dir отдаются в hitTest — игра не должна их менять.
  function traceSegment(b, dir, len, hitTest, onHit) {
    _from.copy(b.pos);
    let rem = len;
    let done = 0;
    for (let guard = 0; guard < 16; guard++) {
      // пол y = 0
      let tF = Infinity;
      if (dir.y < 0) tF = Math.max(0, _from.y) / -dir.y;
      const hit = hitTest ? hitTest(_from, dir, rem, b.exclude) : null;
      let hd = Infinity;
      if (hit) {
        hd = hit.distance;
        if (!(hd >= 0)) hd = hit.point ? _from.distanceTo(hit.point) : 0;
      }
      if (hit && hd <= rem && hd <= tF) {
        const traveled = b.traveled + done + hd;
        const pass = onHit ? onHit(b.shot, hit, { speed: b.vel.length(), traveled }) === true : false;
        if (pass && b.pen > 0) {
          // пробитие: теряем скорость, объект больше не задеваем, продолжаем тот же отрезок
          b.pen--;
          b.vel.multiplyScalar(PEN_SLOW);
          if (hit.object) b.exclude.add(hit.object);
          const adv = Math.min(rem, hd + 1e-3);
          _from.addScaledVector(dir, adv);
          rem -= adv;
          done += adv;
          if (rem <= 0) break;
          continue;
        }
        if (hit.point) b.pos.copy(hit.point);
        else b.pos.copy(_from).addScaledVector(dir, hd);
        b.traveled = traveled;
        return true;
      }
      if (tF <= rem) {
        const traveled = b.traveled + done + tF;
        const point = new THREE.Vector3().copy(_from).addScaledVector(dir, tF);
        point.y = 0;
        b.pos.copy(point);
        b.traveled = traveled;
        if (onHit) onHit(b.shot, { kind: 'ground', point, object: null, distance: tF }, { speed: b.vel.length(), traveled });
        spark(point, 'ground');
        return true;
      }
      break;
    }
    b.pos.copy(_from).addScaledVector(dir, rem);
    b.traveled += done + rem;
    return false;
  }

  function finish(b, onEnd) {
    b.alive = false;
    if (!b.ended) {
      b.ended = true;
      if (onEnd) onEnd(b.shot);
    }
  }

  function releaseBullet(b) {
    if (b.core) {
      scene.remove(b.core);
      freeCores.push(b.core);
      b.core = null;
    }
    b.exclude.clear();
    b.shot = null;
    freeBullets.push(b);
  }

  function stepBullet(b, dt, hitTest, onHit, onEnd) {
    if (b.killed) { finish(b, onEnd); return; }
    b.age += dt;
    let sp = b.vel.length();
    let steps = Math.ceil(Math.max(dt / SUB_DT, sp * dt / SUB_LEN));
    if (steps < 1) steps = 1; else if (steps > MAX_SUBSTEPS) steps = MAX_SUBSTEPS;
    const h = dt / steps;
    let stopped = false;
    for (let s = 0; s < steps; s++) {
      // квадратичное сопротивление (неявно — точно для прямолинейного участка, устойчиво)
      sp = b.vel.length();
      if (b.k > 0 && sp > 0) b.vel.multiplyScalar(1 / (1 + b.k * sp * h));
      b.vel.y -= b.g * h;
      sp = b.vel.length();
      if (sp < 1e-6) continue;
      _dir.copy(b.vel).divideScalar(sp);
      if (traceSegment(b, _dir, sp * h, hitTest, onHit)) { stopped = true; break; }
      if (b.traveled >= b.maxRange) break;
    }
    // След за кадр; при попадании — ровно в точку удара
    if (stopped) _vis.copy(b.pos);
    else visPos(b, _vis);
    drawTrail(b, _vis);
    if (b.core && !stopped) placeCore(b, _vis);
    b.prevVis.copy(_vis);
    if (stopped || b.traveled >= b.maxRange || b.age >= b.maxLife) finish(b, onEnd);
  }

  // --- Гильзы ---
  function newCasing(kind) {
    const g = casingGeo[kind];
    const mesh = new THREE.Mesh(g.geo, brassMat);
    mesh.raycast = noRaycast;
    if (g.hull) {
      const hull = new THREE.Mesh(g.hull, hullMat);
      hull.raycast = noRaycast;
      mesh.add(hull);
    }
    return {
      mesh, kind, g, vel: new THREE.Vector3(), ang: new THREE.Vector3(), target: new THREE.Quaternion(),
      age: 0, bounces: 0, rest: false,
    };
  }

  function releaseCasing(c) {
    scene.remove(c.mesh);
    freeCasings[c.kind].push(c);
  }

  function eject(o) {
    const kind = CASING_DEFS[o.kind] ? o.kind : 'pistol';
    if (casings.length >= CASING_MAX) releaseCasing(casings.shift()); // убираем самую старую
    const c = freeCasings[kind].pop() || newCasing(kind);
    const m = c.mesh;
    m.position.copy(o.position);
    if (o.velocity) c.vel.copy(o.velocity); else c.vel.set(0, 0, 0);
    c.ang.set(randFloatSpread(40), randFloatSpread(40), randFloatSpread(40)); // рад/с
    _euler.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
    m.quaternion.setFromEuler(_euler);
    m.scale.setScalar(1);
    c.age = 0;
    c.bounces = 0;
    c.rest = false;
    scene.add(m);
    casings.push(c);
  }

  // Укладка на бок: цель — поворот оси гильзы в горизонталь
  function settle(c, axis) {
    c.rest = true;
    c.vel.y = 0;
    c.ang.set(0, 0, 0);
    _v.copy(axis);
    _v.y = 0;
    if (_v.lengthSq() < 1e-6) _v.set(1, 0, 0);
    else _v.normalize();
    _q2.setFromUnitVectors(axis, _v);
    c.target.copy(_q2).multiply(c.mesh.quaternion);
  }

  function updateCasings(dt) {
    for (let i = casings.length - 1; i >= 0; i--) {
      const c = casings[i];
      const m = c.mesh;
      c.age += dt;
      if (c.age >= CASING_LIFE) { releaseCasing(c); casings.splice(i, 1); continue; }
      if (!c.rest) {
        c.vel.y -= CASING_G * dt;
        m.position.addScaledVector(c.vel, dt);
        const w = c.ang.length();
        if (w > 1e-4) {
          _q.setFromAxisAngle(_axis.copy(c.ang).divideScalar(w), w * dt);
          m.quaternion.premultiply(_q);
        }
        // нижняя точка цилиндра при текущем наклоне
        _axis.copy(_UP).applyQuaternion(m.quaternion);
        const ay = Math.abs(_axis.y);
        const ext = c.g.h * ay + c.g.r * Math.sqrt(Math.max(0, 1 - ay * ay));
        if (m.position.y < ext) {
          m.position.y = ext;
          if (c.vel.y < 0) {
            const impact = -c.vel.y;
            c.vel.y = impact * CASING_REST;
            c.vel.x *= CASING_FRICTION;
            c.vel.z *= CASING_FRICTION;
            c.ang.multiplyScalar(0.5);
            c.ang.x += randFloatSpread(impact * 10);
            c.ang.z += randFloatSpread(impact * 10);
            c.bounces++;
            if (c.bounces <= 2 && impact > 0.15 && onCasingBounce) {
              onCasingBounce(c.kind, _bounce.copy(m.position));
            }
            if (c.vel.y < 0.45 || c.bounces >= 5) settle(c, _axis);
          }
        }
      } else {
        // лежит: доваливается на бок и докатывается
        const k = 1 - Math.exp(-14 * dt);
        m.quaternion.slerp(c.target, k);
        m.position.y += (c.g.r - m.position.y) * k;
        const f = Math.exp(-5 * dt);
        c.vel.x *= f;
        c.vel.z *= f;
        m.position.x += c.vel.x * dt;
        m.position.z += c.vel.z * dt;
      }
      const left = CASING_LIFE - c.age;
      if (left < CASING_FADE) m.scale.setScalar(left / CASING_FADE);
    }
  }

  // --- Кадр ---
  function update(dt, hitTest, onHit, onEnd) {
    if (!(dt > 0)) return;
    if (dt > MAX_DT) dt = MAX_DT;
    updating = true;
    updateTrails(thin, dt);
    updateTrails(bright, dt);
    // пули: шаг + уплотнение массива на месте (порядок = возраст)
    const n = bullets.length;
    let w = 0;
    for (let i = 0; i < n; i++) {
      const b = bullets[i];
      if (!pendingClear) stepBullet(b, dt, hitTest, onHit, onEnd);
      if (b.alive) bullets[w++] = b;
      else releaseBullet(b);
    }
    for (let i = n; i < bullets.length; i++) bullets[w++] = bullets[i]; // выпущенные из колбэков
    bullets.length = w;
    updateCasings(dt);
    updateStreaks(dt);
    updatePoints(glints, dt);
    updatePoints(dust, dt);
    if (warm > 0) warm--;
    updating = false;
    if (pendingClear) {
      const cb = pendingClearCb;
      pendingClear = false;
      pendingClearCb = null;
      clear(cb);
    }
  }

  // Убрать все пули, гильзы, следы и искры. onEnd (необязательно) — вызвать для живых пуль.
  function clear(onEnd) {
    if (updating) { pendingClear = true; pendingClearCb = onEnd || null; return; }
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      b.alive = false;
      if (!b.ended) {
        b.ended = true;
        if (onEnd) onEnd(b.shot);
      }
      releaseBullet(b);
    }
    bullets.length = 0;
    for (let i = 0; i < casings.length; i++) releaseCasing(casings[i]);
    casings.length = 0;
    resetTrails(thin);
    resetTrails(bright);
    streaks.n = 0;
    streaks.mesh.count = 0;
    glints.n = 0;
    glints.geo.setDrawRange(0, 0);
    dust.n = 0;
    dust.geo.setDrawRange(0, 0);
  }

  // Полное освобождение GPU-ресурсов (после этого объект не использовать)
  function dispose() {
    clear();
    for (const o of [thin.mesh, bright.mesh, streaks.mesh, glints.points, dust.points]) scene.remove(o);
    thin.mesh.dispose(); bright.mesh.dispose(); streaks.mesh.dispose();
    thin.mat.dispose(); bright.mat.dispose(); streaks.mat.dispose();
    glints.geo.dispose(); glints.mat.dispose();
    dust.geo.dispose(); dust.mat.dispose();
    for (const mats of boltMats.values()) { mats.inner.dispose(); mats.outer.dispose(); }
    boltMats.clear();
    for (const kind in casingGeo) {
      casingGeo[kind].geo.dispose();
      if (casingGeo[kind].hull) casingGeo[kind].hull.dispose();
      freeCasings[kind].length = 0;
    }
    beamGeo.dispose();
    boltGeo.dispose();
    softTex.dispose();
    brassMat.dispose();
    hullMat.dispose();
    freeCores.length = 0;
    freeBullets.length = 0;
  }

  return {
    fire,
    update,
    eject,
    spark,
    clear,
    dispose,
    get count() { return bullets.length; },
  };
}
