// Визуальные эффекты попаданий: частицы, всплывающий текст, трассер выстрела.
// Всё на пулах: объекты создаются один раз, простаивающие скрыты (visible = false) —
// не стоят ни draw call'ов, ни аллокаций.
import * as THREE from 'three';

const { randFloat, randFloatSpread } = THREE.MathUtils;
const GRAVITY = -6;      // м/с²
const POPUP_LIFE = 0.9;  // с
const TRACER_LIFE = 0.12;
const SHOCK_LIFE = 0.35;   // с, ударная волна
const SHOCK_R0 = 0.1;      // м, начальный радиус
const SHOCK_R1 = 0.9;      // м, конечный радиус
const MUZZLE_LIFE = 0.08;  // с, вспышка выстрела
const MUZZLE_SIZE = 0.25;  // м, начальный размер вспышки
const BANNER_LIFE = 1.3;   // с, баннер комбо
const BANNER_POP = 0.15;   // с, «поп»-анимация масштаба в начале
const BANNER_FADE = 0.5;   // с, затухание в конце
const BANNER_RISE = 0.5;   // м/с

// размеры пулов
const SHOCK_POOL = 8;
const MUZZLE_POOL = 8;
const TRACER_POOL = 32;
const POPUP_POOL = 12;
const BANNER_POOL = 4;

const POPUP_FONT = 'bold 90px system-ui, sans-serif';
const BANNER_FONT = 'bold 80px system-ui, sans-serif';

// временные объекты для update() — без аллокаций в кадре
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// Кольцевой пул. Жизнь у всех слотов одного типа одинаковая, поэтому следующий
// по кругу слот — либо свободный, либо самый старый (его и переиспользуем).
function makePool(size, create) {
  const items = [];
  for (let i = 0; i < size; i++) items.push(create());
  let next = 0;
  return {
    items,
    take() {
      const it = items[next];
      next = (next + 1) % size;
      return it;
    },
  };
}

// Спрайт с собственным холстом под текст (холст/текстура/материал — один раз)
function makeTextSlot(scene, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 10;
  sprite.visible = false;
  scene.add(sprite);
  return { sprite, mat, tex, canvas, ctx, life: 0, rise: 0 };
}

// Перерисовка текста с обводкой по центру холста слота
function drawText(slot, text, cssColor, font, lineWidth) {
  const { ctx, canvas } = slot;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.strokeText(text, w / 2, h / 2);
  ctx.fillStyle = cssColor;
  ctx.fillText(text, w / 2, h / 2);
  slot.tex.needsUpdate = true;
}

// Загрузка на GPU только живой части буфера (объект диапазона переиспользуется)
function markRange(attr, range, count) {
  range.count = count;
  const r = attr.updateRanges;
  if (r && r.length === 0) r.push(range);
  attr.needsUpdate = true;
}

export function createFx(scene, { maxParticles = 600 } = {}) {
  // ---------- частицы: один InstancedMesh на все кубики ----------
  const MAXP = Math.max(1, maxParticles | 0);
  const cubeGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
  // цвет каждого кубика — в instanceColor (vertexColors не нужен: у куба нет атрибута color)
  const cubeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const cubes = new THREE.InstancedMesh(cubeGeo, cubeMat, MAXP);
  cubes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cubes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 3), 3);
  cubes.instanceColor.setUsage(THREE.DynamicDrawUsage);
  cubes.count = 0;
  cubes.visible = false;
  cubes.frustumCulled = false;   // кубики разлетаются, а сфера InstancedMesh кэшируется
  scene.add(cubes);

  // состояние частиц: живые лежат в [0, live), самые старые — в начале
  const pPos = new Float32Array(MAXP * 3);
  const pVel = new Float32Array(MAXP * 3);
  const pRot = new Float32Array(MAXP * 3);
  const pSpin = new Float32Array(MAXP * 3);
  const pLife = new Float32Array(MAXP);
  const pMax = new Float32Array(MAXP);
  const pMat = cubes.instanceMatrix.array;
  const pCol = cubes.instanceColor.array;
  const matRange = { start: 0, count: 0 };
  const colRange = { start: 0, count: 0 };
  let live = 0;

  // выкинуть k самых старых (сдвиг всех массивов к началу)
  function dropOldest(k) {
    pPos.copyWithin(0, k * 3, live * 3);
    pVel.copyWithin(0, k * 3, live * 3);
    pRot.copyWithin(0, k * 3, live * 3);
    pSpin.copyWithin(0, k * 3, live * 3);
    pCol.copyWithin(0, k * 3, live * 3);
    pMat.copyWithin(0, k * 16, live * 16);
    pLife.copyWithin(0, k, live);
    pMax.copyWithin(0, k, live);
    live -= k;
  }

  // Взрыв кубиков
  function burst(position, color, count = 16) {
    const n = Math.min(count | 0, MAXP);
    if (n <= 0) return;
    if (live + n > MAXP) dropOldest(live + n - MAXP);   // пул полон — старые уступают
    _c.set(color);
    for (let k = 0; k < n; k++) {
      const i = live++, i3 = i * 3, i16 = i * 16;
      // копия координат: вызывающий может переиспользовать вектор
      pPos[i3] = position.x; pPos[i3 + 1] = position.y; pPos[i3 + 2] = position.z;
      const vx = randFloatSpread(2), vy = randFloatSpread(2), vz = randFloatSpread(2);
      const sp = randFloat(1.5, 4) / (Math.sqrt(vx * vx + vy * vy + vz * vz) || 1);
      pVel[i3] = vx * sp; pVel[i3 + 1] = vy * sp; pVel[i3 + 2] = vz * sp;
      pRot[i3] = 0; pRot[i3 + 1] = 0; pRot[i3 + 2] = 0;
      pSpin[i3] = randFloatSpread(20); pSpin[i3 + 1] = randFloatSpread(20); pSpin[i3 + 2] = randFloatSpread(20);
      const life = randFloat(0.4, 0.8);
      pLife[i] = life;
      pMax[i] = life;
      _c.toArray(pCol, i3);
      // стартовая матрица: перенос без поворота, масштаб 1
      pMat.fill(0, i16, i16 + 16);
      pMat[i16] = pMat[i16 + 5] = pMat[i16 + 10] = pMat[i16 + 15] = 1;
      pMat[i16 + 12] = position.x; pMat[i16 + 13] = position.y; pMat[i16 + 14] = position.z;
    }
    cubes.count = live;
    cubes.visible = true;
    markRange(cubes.instanceMatrix, matRange, live * 16);
    markRange(cubes.instanceColor, colRange, live * 3);
  }

  function updateParticles(dt) {
    if (live === 0) return;
    const g = GRAVITY * dt;
    let w = 0, moved = false;
    for (let i = 0; i < live; i++) {
      const life = pLife[i] - dt;
      if (life <= 0) continue;   // умерла — следующая живая сдвинется на её место
      const i3 = i * 3, w3 = w * 3;
      const vx = pVel[i3], vy = pVel[i3 + 1] + g, vz = pVel[i3 + 2];
      pVel[w3] = vx; pVel[w3 + 1] = vy; pVel[w3 + 2] = vz;
      const x = pPos[i3] + vx * dt, y = pPos[i3 + 1] + vy * dt, z = pPos[i3 + 2] + vz * dt;
      pPos[w3] = x; pPos[w3 + 1] = y; pPos[w3 + 2] = z;
      const sx = pSpin[i3], sy = pSpin[i3 + 1], sz = pSpin[i3 + 2];
      const rx = pRot[i3] + sx * dt, ry = pRot[i3 + 1] + sy * dt, rz = pRot[i3 + 2] + sz * dt;
      pRot[w3] = rx; pRot[w3 + 1] = ry; pRot[w3 + 2] = rz;
      if (w !== i) {
        pSpin[w3] = sx; pSpin[w3 + 1] = sy; pSpin[w3 + 2] = sz;
        pCol[w3] = pCol[i3]; pCol[w3 + 1] = pCol[i3 + 1]; pCol[w3 + 2] = pCol[i3 + 2];
        pMax[w] = pMax[i];
        moved = true;
      }
      pLife[w] = life;
      // матрица экземпляра: позиция, вращение, уменьшение к концу жизни
      _p.set(x, y, z);
      _q.setFromEuler(_e.set(rx, ry, rz));
      _s.setScalar(life / pMax[w]);
      _m.compose(_p, _q, _s).toArray(pMat, w * 16);
      w++;
    }
    live = w;
    cubes.count = live;
    cubes.visible = live > 0;
    if (live > 0) {
      markRange(cubes.instanceMatrix, matRange, live * 16);
      if (moved) markRange(cubes.instanceColor, colRange, live * 3);
    }
  }

  // ---------- ударные волны ----------
  const shockGeo = new THREE.IcosahedronGeometry(1, 2);
  const shocks = makePool(SHOCK_POOL, () => {
    const mat = new THREE.MeshBasicMaterial({
      wireframe: true, transparent: true, opacity: 0.8, depthWrite: false,
    });
    const mesh = new THREE.Mesh(shockGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, mat, life: 0 };
  });

  // Расширяющаяся ударная волна в точке попадания
  function shockwave(position, color) {
    const s = shocks.take();
    s.mat.color.set(color);
    s.mat.opacity = 0.8;
    s.mesh.position.copy(position);
    s.mesh.scale.setScalar(SHOCK_R0);
    s.mesh.visible = true;
    s.life = SHOCK_LIFE;
  }

  // ---------- вспышки выстрела ----------
  // общая текстура вспышки (радиальный градиент)
  const muzzleTex = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const muzzles = makePool(MUZZLE_POOL, () => {
    const mat = new THREE.SpriteMaterial({
      map: muzzleTex, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, mat, life: 0 };
  });

  // Вспышка выстрела (аддитивный спрайт)
  function muzzle(position, color) {
    const m = muzzles.take();
    m.mat.color.set(color);
    m.sprite.position.copy(position);
    m.sprite.scale.set(MUZZLE_SIZE, MUZZLE_SIZE, 1);
    m.sprite.visible = true;
    m.life = MUZZLE_LIFE;
  }

  // ---------- трассеры ----------
  const beamGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 6);
  beamGeo.rotateX(Math.PI / 2); // ось вдоль Z для lookAt
  const tracers = makePool(TRACER_POOL, () => {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(beamGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, mat, life: 0 };
  });

  // Луч выстрела
  function tracer(from, to, color) {
    const t = tracers.take();
    t.mat.color.set(color);
    t.mat.opacity = 0.9;
    const mesh = t.mesh;
    mesh.position.addVectors(from, to).multiplyScalar(0.5);
    mesh.lookAt(to);
    mesh.scale.set(1, 1, Math.max(from.distanceTo(to), 1e-4)); // без нулевого масштаба
    mesh.visible = true;
    t.life = TRACER_LIFE;
  }

  // ---------- текст: всплывающие очки и баннеры ----------
  const popups = makePool(POPUP_POOL, () => makeTextSlot(scene, 256, 128));
  const banners = makePool(BANNER_POOL, () => makeTextSlot(scene, 512, 128));

  // Всплывающий текст очков
  function popup(position, text, cssColor, scale = 1) {
    const p = popups.take();
    drawText(p, text, cssColor, POPUP_FONT, 10);
    p.sprite.scale.set(0.8 * scale, 0.4 * scale, 1); // дальние гонги — крупнее
    p.sprite.position.copy(position);
    p.mat.opacity = 1;
    p.sprite.visible = true;
    p.life = POPUP_LIFE;
    p.rise = 0.8 * scale;
  }

  // Крупный баннер («КОМБО x2!»)
  function banner(position, text, cssColor) {
    const b = banners.take();
    drawText(b, text, cssColor, BANNER_FONT, 12);
    b.sprite.scale.set(1.8 * 0.6, 0.45 * 0.6, 1); // старт «попа» с 0.6x
    b.sprite.position.copy(position);
    b.mat.opacity = 1;
    b.sprite.visible = true;
    b.life = BANNER_LIFE;
  }

  function update(dt) {
    updateParticles(dt);

    const pp = popups.items;
    for (let i = 0; i < pp.length; i++) {
      const p = pp[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sprite.visible = false; continue; }
      p.sprite.position.y += p.rise * dt;
      p.mat.opacity = p.life / POPUP_LIFE;
    }
    const tt = tracers.items;
    for (let i = 0; i < tt.length; i++) {
      const t = tt[i];
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; continue; }
      t.mat.opacity = 0.9 * (t.life / TRACER_LIFE);
    }
    // Ударные волны: радиус растёт с ease-out, прозрачность падает до 0
    const ss = shocks.items;
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      const k = 1 - s.life / SHOCK_LIFE;      // 0..1
      const e = 1 - (1 - k) * (1 - k) * (1 - k); // ease-out (cubic)
      s.mesh.scale.setScalar(SHOCK_R0 + (SHOCK_R1 - SHOCK_R0) * e);
      s.mat.opacity = 0.8 * (1 - k);
    }
    // Вспышки выстрела: размер линейно до 0
    const mm = muzzles.items;
    for (let i = 0; i < mm.length; i++) {
      const m = mm[i];
      if (m.life <= 0) continue;
      m.life -= dt;
      if (m.life <= 0) { m.sprite.visible = false; continue; }
      const sz = MUZZLE_SIZE * (m.life / MUZZLE_LIFE);
      m.sprite.scale.set(sz, sz, 1);
    }
    // Баннеры: «поп» в начале, подъём, затухание в конце
    const bb = banners.items;
    for (let i = 0; i < bb.length; i++) {
      const b = bb[i];
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) { b.sprite.visible = false; continue; }
      const age = BANNER_LIFE - b.life;
      let s = 1;
      if (age < BANNER_POP) {
        const k = age / BANNER_POP;
        s = 0.6 + 0.4 * (1 - (1 - k) * (1 - k)); // 0.6x -> 1x, ease-out
      }
      b.sprite.scale.set(1.8 * s, 0.45 * s, 1);
      b.sprite.position.y += BANNER_RISE * dt;
      b.mat.opacity = b.life < BANNER_FADE ? b.life / BANNER_FADE : 1;
    }
  }

  return { burst, popup, tracer, shockwave, muzzle, banner, update };
}
