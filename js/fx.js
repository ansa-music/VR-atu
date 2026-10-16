// Визуальные эффекты попаданий: частицы, всплывающий текст, трассер выстрела
import * as THREE from 'three';

const { randFloat, randFloatSpread } = THREE.MathUtils;
const GRAVITY = -6;      // м/с²
const POPUP_LIFE = 0.9;  // с
const TRACER_LIFE = 0.12;

export function createFx(scene) {
  // Общая геометрия и кэш материалов (кэшированные не освобождаем)
  const cubeGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
  const beamGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 6);
  beamGeo.rotateX(Math.PI / 2); // ось вдоль Z для lookAt
  const matCache = new Map();
  const particles = [];
  const popups = [];
  const tracers = [];

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
  function popup(position, text, cssColor) {
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
    sprite.scale.set(0.8, 0.4, 1);
    sprite.position.copy(position);
    sprite.renderOrder = 10;
    scene.add(sprite);
    popups.push({ sprite, mat, tex, life: POPUP_LIFE });
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
      p.sprite.position.y += 0.8 * dt;
      p.mat.opacity = p.life / POPUP_LIFE;
    }
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      t.life -= dt;
      if (t.life <= 0) { scene.remove(t.mesh); t.mat.dispose(); tracers.splice(i, 1); continue; }
      t.mat.opacity = 0.9 * (t.life / TRACER_LIFE);
    }
  }

  return { burst, popup, tracer, update };
}
