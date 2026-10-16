import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { buildEnvironment } from './env.js';
import { sfx } from './sfx.js';
import { createFx } from './fx.js';
import { createScoreboard, createMenu } from './ui.js';

const ROUND_TIME = 60;
const MAX_TARGETS = 14;
const COLORS = [0x3ec5ff, 0x7c5cff, 0x34e89e, 0xff7ad9];

// ---------- рендер и сцена ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 200);
camera.position.set(0, 1.6, 0);

const env = buildEnvironment(scene);
const fx = createFx(scene);

const board = createScoreboard();
board.mesh.position.set(0, 3.9, -7);
scene.add(board.mesh);

const menu = createMenu();
menu.mesh.position.set(0, 1.6, -3);
menu.mesh.userData.readyAt = 0;
menu.showStart(ROUND_TIME);
scene.add(menu.mesh);

// ---------- состояние игры ----------
let state = 'menu'; // menu | play | over
let score = 0, combo = 0, shots = 0, hits = 0;
let timeLeft = ROUND_TIME, elapsed = 0, spawnTimer = 0;
let best = 0;
try { best = Number(localStorage.getItem('vr-tir-best')) || 0; } catch {}

const multiplier = () => Math.min(4, 1 + Math.floor(combo / 5));

function startGame() {
  state = 'play';
  score = combo = shots = hits = 0;
  timeLeft = ROUND_TIME;
  elapsed = 0;
  spawnTimer = 0.4;
  clearTargets();
  menu.mesh.visible = false;
  sfx.start();
}

function endGame() {
  state = 'over';
  clearTargets();
  const newRecord = score > best;
  if (newRecord) {
    best = score;
    try { localStorage.setItem('vr-tir-best', String(best)); } catch {}
  }
  const accuracy = shots ? Math.round((hits / shots) * 100) : 0;
  menu.showResults({ score, best, accuracy, newRecord });
  menu.mesh.visible = true;
  menu.mesh.userData.readyAt = performance.now() + 1200; // защита от случайного рестарта
  sfx.end();
}

// ---------- мишени ----------
const targets = new THREE.Group();
scene.add(targets);
const targetGeo = new THREE.IcosahedronGeometry(1, 1);
const ringGeo = new THREE.TorusGeometry(1.35, 0.12, 8, 32);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xff2244 });
const rand = THREE.MathUtils;

function spawnTarget() {
  const r = Math.random();
  const type = r < 0.12 ? 'gold' : r < 0.25 ? 'bomb' : 'normal';
  const color = type === 'gold' ? 0xffd23f : type === 'bomb' ? 0x330a0a : COLORS[(Math.random() * COLORS.length) | 0];
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: type === 'bomb' ? 0xff0022 : color,
    emissiveIntensity: type === 'gold' ? 0.5 : 0.35,
    roughness: type === 'gold' ? 0.25 : 0.4,
    metalness: type === 'gold' ? 0.6 : 0.1,
    flatShading: true,
  });
  const t = new THREE.Mesh(targetGeo, mat);
  if (type === 'bomb') t.add(new THREE.Mesh(ringGeo, ringMat));

  // появление по дуге перед игроком
  const az = rand.degToRad(rand.randFloatSpread(80));
  const dist = rand.randFloat(3.5, 8);
  t.position.set(Math.sin(az) * dist, rand.randFloat(0.8, 3), -Math.cos(az) * dist);
  t.scale.setScalar(0.001);

  const speed = type === 'gold' ? 1.8 : 1 + elapsed / 60;
  t.userData = {
    type,
    color: type === 'bomb' ? 0xff2244 : color,
    radius: type === 'gold' ? 0.18 : 0.28,
    age: 0,
    life: type === 'gold' ? 3 : rand.randFloat(4, 6),
    phase: Math.random() * Math.PI * 2,
    vel: new THREE.Vector3(rand.randFloatSpread(1), rand.randFloatSpread(0.6), rand.randFloatSpread(0.4)).multiplyScalar(speed),
  };
  targets.add(t);
}

function removeTarget(t) {
  targets.remove(t);
  t.material.dispose();
}

function clearTargets() {
  while (targets.children.length) removeTarget(targets.children[0]);
}

function updateTargets(dt, time) {
  for (const t of [...targets.children]) {
    const u = t.userData, p = t.position, v = u.vel;
    u.age += dt;
    p.addScaledVector(v, dt);
    p.y += Math.sin(u.age * 2 + u.phase) * 0.003;
    // отскок от границ игровой зоны
    if ((p.x < -6 && v.x < 0) || (p.x > 6 && v.x > 0)) v.x *= -1;
    if ((p.y < 0.6 && v.y < 0) || (p.y > 3.3 && v.y > 0)) v.y *= -1;
    if ((p.z < -9 && v.z < 0) || (p.z > -3 && v.z > 0)) v.z *= -1;

    // рост при появлении, сжатие перед исчезновением
    let s = Math.min(1, u.age / 0.25);
    const left = u.life - u.age;
    if (left < 0.4) s = Math.max(0, left / 0.4);
    t.scale.setScalar(u.radius * s);

    if (u.type === 'bomb') t.material.emissiveIntensity = 0.6 + 0.4 * Math.sin(time * 8);
    else t.rotation.y += dt * (u.type === 'gold' ? 4 : 1);

    if (u.age >= u.life) removeTarget(t);
  }
}

function hitTarget(t, point, controller) {
  const u = t.userData;
  if (u.type === 'bomb') {
    score = Math.max(0, score - 5);
    combo = 0;
    fx.burst(point, 0xff2244, 30);
    fx.popup(point, '−5', '#ff5a6e');
    sfx.bomb();
    vibrate(controller, 1, 250);
  } else {
    hits++;
    combo++;
    const pts = (u.type === 'gold' ? 3 : 1) * multiplier();
    score += pts;
    fx.burst(point, u.color, u.type === 'gold' ? 26 : 16);
    fx.popup(point, '+' + pts, u.type === 'gold' ? '#ffd23f' : '#ffffff');
    if (u.type === 'gold') sfx.gold(); else sfx.hit(multiplier());
    vibrate(controller, 0.7, 80);
  }
  removeTarget(t);
}

// ---------- стрельба ----------
const raycaster = new THREE.Raycaster();
const tmpMat = new THREE.Matrix4();
const farPoint = new THREE.Vector3();

function shootables() {
  if (state === 'play') return targets.children;
  return menu.mesh.visible ? [menu.mesh] : [];
}

// луч уже выставлен в raycaster
function fire(from, controller) {
  const hit = raycaster.intersectObjects(shootables(), false)[0];
  const end = hit ? hit.point : raycaster.ray.at(15, farPoint);
  fx.tracer(from, end, controller ? controller.userData.color : 0xffffff);
  sfx.shot();
  vibrate(controller, 0.3, 40);

  if (state !== 'play') {
    if (hit && performance.now() >= menu.mesh.userData.readyAt) startGame();
    return;
  }
  shots++;
  if (hit) hitTarget(hit.object, hit.point.clone(), controller);
  else { combo = 0; sfx.miss(); }
}

function vibrate(controller, intensity, ms) {
  try { controller?.userData.src?.gamepad?.hapticActuators?.[0]?.pulse(intensity, ms); } catch {}
}

function setRayFromController(c) {
  c.updateMatrixWorld(true);
  tmpMat.identity().extractRotation(c.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMat);
}

// ПК: клик мышью
const ndc = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (renderer.xr.isPresenting) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const from = new THREE.Vector3(0.25, -0.3, -0.5).applyMatrix4(camera.matrixWorld);
  fire(from, null);
});

// ---------- VR-контроллеры ----------
function makeGun(color) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x222838, roughness: 0.4, metalness: 0.6 });
  const glow = new THREE.MeshBasicMaterial({ color });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.14), body);
  box.position.set(0, 0, 0.03);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 12), glow);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.008, -0.07);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.035), body);
  grip.position.set(0, -0.05, 0.07);
  grip.rotation.x = -0.35;
  g.add(box, barrel, grip);
  return g;
}

const laserGeo = new THREE.CylinderGeometry(0.002, 0.002, 1, 6);
laserGeo.rotateX(Math.PI / 2);
laserGeo.translate(0, 0, -0.5);
const dotGeo = new THREE.SphereGeometry(0.02, 12, 8);

const controllers = [0, 1].map((i) => {
  const c = renderer.xr.getController(i);
  const color = i === 0 ? 0x3ec5ff : 0xff7ad9;
  const laser = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }));
  const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color }));
  dot.visible = false;
  c.add(makeGun(color), laser);
  c.userData = { color, laser, dot, src: null };
  c.addEventListener('connected', (e) => { c.userData.src = e.data; });
  c.addEventListener('disconnected', () => { c.userData.src = null; dot.visible = false; });
  c.addEventListener('selectstart', () => {
    setRayFromController(c);
    fire(raycaster.ray.origin.clone(), c);
  });
  scene.add(c, dot);
  return c;
});

// лазер-указка: длина до ближайшей мишени
function updateControllers() {
  for (const c of controllers) {
    const { laser, dot } = c.userData;
    if (!renderer.xr.isPresenting || !c.visible) { dot.visible = false; continue; }
    setRayFromController(c);
    const hit = raycaster.intersectObjects(shootables(), false)[0];
    laser.scale.z = hit ? hit.distance : 12;
    dot.visible = !!hit;
    if (hit) dot.position.copy(hit.point);
  }
}

// ---------- игровой цикл ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (state === 'play') {
    timeLeft -= dt;
    elapsed += dt;
    spawnTimer -= dt;
    if (spawnTimer <= 0 && targets.children.length < MAX_TARGETS) {
      spawnTarget();
      spawnTimer = Math.max(0.35, 1.0 - elapsed * 0.011); // темп растёт
    }
    if (timeLeft <= 0) { timeLeft = 0; endGame(); }
  }

  updateTargets(dt, time);
  fx.update(dt);
  env.update(dt, time);
  updateControllers();
  menu.mesh.position.y = 1.6 + Math.sin(time * 1.5) * 0.03;
  board.update({ score, timeLeft, multiplier: multiplier() });

  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
