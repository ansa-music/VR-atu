// Визуальные эффекты попаданий: частицы, всплывающий текст, трассер выстрела
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

export function createFx(scene) {
  // Общая геометрия и кэш материалов (кэшированные не освобождаем)
  const cubeGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
  const beamGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 6);
  beamGeo.rotateX(Math.PI / 2); // ось вдоль Z для lookAt
  const matCache = new Map();
  const particles = [];
  const popups = [];
  const tracers = [];
  const shocks = [];
  const muzzles = [];
  const banners = [];

  // Общая геометрия ударной волны
  const shockGeo = new THREE.IcosahedronGeometry(1, 2);

  // Общая текстура вспышки (радиальный градиент), создаётся лениво
  let muzzleTex = null;
  function getMuzzleTex() {
    if (muzzleTex) return muzzleTex;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    muzzleTex = new THREE.CanvasTexture(canvas);
    muzzleTex.colorSpace = THREE.SRGBColorSpace;
    return muzzleTex;
  }

  // Взрыв кубиков
  function burst(position, color, count = 16) {
    let mat = matCache.get(color);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color });
      matCache.set(color, mat);
    }
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(cubeGeo, mat);
      mesh.position.copy(position); // копия: вызывающий может переиспользовать вектор
      const vel = new THREE.Vector3(randFloatSpread(2), randFloatSpread(2), randFloatSpread(2));
      vel.normalize().multiplyScalar(randFloat(1.5, 4));
      const life = randFloat(0.4, 0.8);
      const spin = new THREE.Vector3(randFloatSpread(20), randFloatSpread(20), randFloatSpread(20));
      scene.add(mesh);
      particles.push({ mesh, vel, spin, life, max: life });
    }
  }

  // Всплывающий текст очков
  function popup(position, text, cssColor, scale = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 90px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(text, 128, 64);
    ctx.fillStyle = cssColor;
    ctx.fillText(text, 128, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.8 * scale, 0.4 * scale, 1); // дальние гонги — крупнее
    sprite.position.copy(position);
    sprite.renderOrder = 10;
    scene.add(sprite);
    popups.push({ sprite, mat, tex, life: POPUP_LIFE, rise: 0.8 * scale });
  }

  // Луч выстрела
  function tracer(from, to, color) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(beamGeo, mat);
    mesh.position.addVectors(from, to).multiplyScalar(0.5);
    mesh.lookAt(to);
    mesh.scale.z = Math.max(from.distanceTo(to), 1e-4); // без нулевого масштаба
    scene.add(mesh);
    tracers.push({ mesh, mat, life: TRACER_LIFE });
  }

  // Расширяющаяся ударная волна в точке попадания
  function shockwave(position, color) {
    const mat = new THREE.MeshBasicMaterial({
      color, wireframe: true, transparent: true, opacity: 0.8, depthWrite: false,
    });
    const mesh = new THREE.Mesh(shockGeo, mat);
    mesh.position.copy(position);
    mesh.scale.setScalar(SHOCK_R0);
    scene.add(mesh);
    shocks.push({ mesh, mat, life: SHOCK_LIFE });
  }

  // Вспышка выстрела (аддитивный спрайт)
  function muzzle(position, color) {
    const mat = new THREE.SpriteMaterial({
      map: getMuzzleTex(), color, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.scale.set(MUZZLE_SIZE, MUZZLE_SIZE, 1);
    scene.add(sprite);
    muzzles.push({ sprite, mat, life: MUZZLE_LIFE });
  }

  // Крупный баннер («КОМБО x2!»)
  function banner(position, text, cssColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 80px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(text, 256, 64);
    ctx.fillStyle = cssColor;
    ctx.fillText(text, 256, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.8 * 0.6, 0.45 * 0.6, 1); // старт «попа» с 0.6x
    sprite.position.copy(position);
    sprite.renderOrder = 10;
    scene.add(sprite);
    banners.push({ sprite, mat, tex, life: BANNER_LIFE });
  }

  function update(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); continue; }
      p.vel.y += GRAVITY * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      p.mesh.scale.setScalar(p.life / p.max);
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.life -= dt;
      if (p.life <= 0) {
        scene.remove(p.sprite);
        p.tex.dispose();
        p.mat.dispose();
        popups.splice(i, 1);
        continue;
      }
      p.sprite.position.y += p.rise * dt;
      p.mat.opacity = p.life / POPUP_LIFE;
    }
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      t.life -= dt;
      if (t.life <= 0) { scene.remove(t.mesh); t.mat.dispose(); tracers.splice(i, 1); continue; }
      t.mat.opacity = 0.9 * (t.life / TRACER_LIFE);
    }
    // Ударные волны: радиус растёт с ease-out, прозрачность падает до 0
    for (let i = shocks.length - 1; i >= 0; i--) {
      const s = shocks[i];
      s.life -= dt;
      if (s.life <= 0) { scene.remove(s.mesh); s.mat.dispose(); shocks.splice(i, 1); continue; }
      const k = 1 - s.life / SHOCK_LIFE;      // 0..1
      const e = 1 - (1 - k) * (1 - k) * (1 - k); // ease-out (cubic)
      s.mesh.scale.setScalar(SHOCK_R0 + (SHOCK_R1 - SHOCK_R0) * e);
      s.mat.opacity = 0.8 * (1 - k);
    }
    // Вспышки выстрела: размер линейно до 0 (текстура общая — не освобождаем)
    for (let i = muzzles.length - 1; i >= 0; i--) {
      const m = muzzles[i];
      m.life -= dt;
      if (m.life <= 0) { scene.remove(m.sprite); m.mat.dispose(); muzzles.splice(i, 1); continue; }
      const sz = MUZZLE_SIZE * (m.life / MUZZLE_LIFE);
      m.sprite.scale.set(sz, sz, 1);
    }
    // Баннеры: «поп» в начале, подъём, затухание в конце
    for (let i = banners.length - 1; i >= 0; i--) {
      const b = banners[i];
      b.life -= dt;
      if (b.life <= 0) {
        scene.remove(b.sprite);
        b.tex.dispose();
        b.mat.dispose();
        banners.splice(i, 1);
        continue;
      }
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
