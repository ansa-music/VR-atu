import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { buildEnvironment } from './env.js';
import * as audio from './sfx.js';
import { createFx } from './fx.js';
import { createScoreboard, createMenu } from './ui.js';
import { mk } from './mk.js';
import { initializeMultiplayerPresence } from './multiplayer-presence.js';
import { createSharedArena } from './multiplayer-arena.js';

const { sfx } = audio;
const music = audio.music || { start() {}, stop() {}, setIntensity() {} };
const emit = (name, detail) => dispatchEvent(new CustomEvent(name, { detail }));

// оружие, персонаж и графика: если модуль не загрузился, игра работает со старой графикой
const load = (path) => import(path).catch((e) => { console.warn('Модуль не загружен:', path, e); return {}; });
const [weaponMod, charMod, gfxMod] = await Promise.all([load('./weapon.js'), load('./character.js'), load('./graphics.js')]);
const safeCall = (fn, ...args) => { try { return fn ? fn(...args) : null; } catch (e) { console.warn(e); return null; } };

const ROUND_TIME = 60;
const MAX_TARGETS = 14;
const COLORS = [0x3ec5ff, 0x7c5cff, 0x34e89e, 0xff7ad9];
const ARENA = 11;        // радиус, по которому может ходить игрок
const TARGET_BOUND = 12; // границы полёта мишеней
const WALK_SPEED = 3;    // м/с
const TURN_SPEED = 2;    // рад/с (клавиши ←/→)
const EYE_HEIGHT = 1.6;

// ---------- рендер и сцена ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 200);
camera.rotation.order = 'YXZ';

// игрок: камера и контроллеры внутри рига, двигаем риг
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);
const updateMultiplayerPresence = initializeMultiplayerPresence(scene, camera);
const sharedArena = createSharedArena(scene);

const env = buildEnvironment(scene);
const gfx = safeCall(gfxMod.setupGraphics, renderer, scene);

// тень игрока на полу
const shadowBlob = safeCall(charMod.createShadowBlob);
if (shadowBlob) scene.add(shadowBlob);
const fx = createFx(scene);

const board = createScoreboard();
board.mesh.position.set(0, 4.2, -7);
scene.add(board.mesh);

// индикатор МК на табло: зелёный — подключён
const mkLed = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x555a66 }));
mkLed.position.set(1.85, 0.36, 0.02);
board.mesh.add(mkLed);

const menu = createMenu();
menu.mesh.position.set(0, EYE_HEIGHT, -3);
menu.mesh.userData.readyAt = 0;
menu.showStart(ROUND_TIME);
scene.add(menu.mesh);

// ---------- состояние игры ----------
let state = 'menu'; // menu | countdown | play | over
let score = 0, combo = 0, maxCombo = 0, shots = 0, hits = 0;
let timeLeft = ROUND_TIME, elapsed = 0, spawnTimer = 0;
let countdown = 0, lastCount = -1, goHide = 0, lastTickSec = 99, lastMult = 1, lastIntensity = -1;
let best = 0;
try { best = Number(localStorage.getItem('vr-tir-best')) || 0; } catch {}

const multiplier = () => Math.min(4, 1 + Math.floor(combo / 5));

function setState(s) {
  state = s;
  emit('game:state', { state: s });
}

// старт: сначала отсчёт 3-2-1, потом раунд
function startGame() {
  setState('countdown');
  countdown = 3;
  lastCount = -1;
  score = combo = maxCombo = shots = hits = 0;
  lastMult = 1;
  lastTickSec = 99;
  timeLeft = ROUND_TIME;
  elapsed = 0;
  spawnTimer = 0.4;
  clearTargets();
  menu.mesh.visible = true;
  music.start();
  music.setIntensity(0.3);
  lastIntensity = 0.3;
  mk.send('S');
}

function updateCountdown(dt) {
  countdown -= dt;
  const n = Math.max(0, Math.ceil(countdown));
  if (n !== lastCount) {
    lastCount = n;
    menu.showCountdown?.(n);
    if (n > 0) sfx.tick?.();
  }
  if (countdown <= 0) {
    setState('play');
    (sfx.go || sfx.start)();
    goHide = 0.6; // «ВПЕРЁД!» висит ещё чуть-чуть
  }
}

function loadTop() {
  try {
    const t = JSON.parse(localStorage.getItem('vr-tir-top') || '[]');
    return Array.isArray(t) ? t.filter(Number.isFinite) : [];
  } catch { return []; }
}

function endGame() {
  setState('over');
  clearTargets();
  music.stop();
  const newRecord = score > best;
  if (newRecord) {
    best = score;
    try { localStorage.setItem('vr-tir-best', String(best)); } catch {}
  }
  let top = loadTop();
  if (score > 0) {
    top = [...top, score].sort((a, b) => b - a).slice(0, 5);
    try { localStorage.setItem('vr-tir-top', JSON.stringify(top)); } catch {}
  }
  const accuracy = shots ? Math.round((hits / shots) * 100) : 0;
  menu.showResults({ score, best, accuracy, newRecord, top, maxCombo });
  menu.mesh.visible = true;
  menu.mesh.userData.readyAt = performance.now() + 1200; // защита от случайного рестарта
  sfx.end();
  mk.send('E');
}

// ---------- взгляд игрока ----------
const UP = new THREE.Vector3(0, 1, 0);
const headPos = new THREE.Vector3();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();

// позиция головы и направление взгляда по горизонтали
function updateHead() {
  camera.getWorldPosition(headPos);
  camera.getWorldDirection(fwd);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize();
  right.crossVectors(fwd, UP);
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
  let t = safeCall(gfxMod.createTargetVisual, type, type === 'bomb' ? 0xff2244 : color);
  if (!t?.isMesh || !t.material) {
    // запасной вид мишени
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: type === 'bomb' ? 0xff0022 : color,
      emissiveIntensity: type === 'gold' ? 0.5 : 0.35,
      roughness: type === 'gold' ? 0.25 : 0.4,
      metalness: type === 'gold' ? 0.6 : 0.1,
      flatShading: true,
    });
    t = new THREE.Mesh(targetGeo, mat);
    if (type === 'bomb') t.add(new THREE.Mesh(ringGeo, ringMat));
  }

  // появление по дуге перед игроком, куда бы он ни смотрел
  const ang = Math.atan2(fwd.x, -fwd.z) + rand.degToRad(rand.randFloatSpread(100));
  const dist = rand.randFloat(4, 8);
  t.position.set(
    rand.clamp(headPos.x + Math.sin(ang) * dist, -TARGET_BOUND, TARGET_BOUND),
    rand.randFloat(0.8, 3),
    rand.clamp(headPos.z - Math.cos(ang) * dist, -TARGET_BOUND, TARGET_BOUND),
  );
  t.scale.setScalar(0.001);

  const speed = type === 'gold' ? 1.8 : 1 + elapsed / 60;
  t.userData = {
    type,
    color: type === 'bomb' ? 0xff2244 : color,
    radius: type === 'gold' ? 0.18 : 0.28,
    age: 0,
    life: type === 'gold' ? 3 : rand.randFloat(4, 6),
    phase: Math.random() * Math.PI * 2,
    vel: new THREE.Vector3(rand.randFloatSpread(1), rand.randFloatSpread(0.6), rand.randFloatSpread(1)).multiplyScalar(speed),
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
    // отскок от границ арены
    if ((p.x < -TARGET_BOUND && v.x < 0) || (p.x > TARGET_BOUND && v.x > 0)) v.x *= -1;
    if ((p.y < 0.6 && v.y < 0) || (p.y > 3.3 && v.y > 0)) v.y *= -1;
    if ((p.z < -TARGET_BOUND && v.z < 0) || (p.z > TARGET_BOUND && v.z > 0)) v.z *= -1;

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
    lastMult = 1;
    fx.burst(point, 0xff2244, 30);
    fx.shockwave?.(point, 0xff2244);
    fx.popup(point, '−5', '#ff5a6e');
    sfx.bomb();
    vibrate(controller, 1, 250);
    mk.send('B');
  } else {
    hits++;
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    const m = multiplier();
    const pts = (u.type === 'gold' ? 3 : 1) * m;
    score += pts;
    if (m > lastMult) {
      // новый уровень множителя
      fx.banner?.(point.clone().add(BANNER_OFFSET), `КОМБО x${m}!`, '#ffd23f');
      sfx.combo?.(m);
    }
    lastMult = m;
    fx.burst(point, u.color, u.type === 'gold' ? 26 : 16);
    fx.shockwave?.(point, u.color);
    fx.popup(point, '+' + pts, u.type === 'gold' ? '#ffd23f' : '#ffffff');
    if (u.type === 'gold') sfx.gold(); else sfx.hit(multiplier());
    vibrate(controller, 0.7, 80);
    mk.send(u.type === 'gold' ? 'G' : 'H');
  }
  removeTarget(t);
}

// ---------- стрельба ----------
const raycaster = new THREE.Raycaster();
const tmpMat = new THREE.Matrix4();
const farPoint = new THREE.Vector3();
const CENTER = new THREE.Vector2(0, 0);
const BANNER_OFFSET = new THREE.Vector3(0, 0.6, 0);

function shootables() {
  if (sharedArena.active) return [];
  if (state === 'play') return targets.children;
  if (state === 'countdown') return [];
  return menu.mesh.visible ? [menu.mesh] : [];
}

// луч уже выставлен в raycaster
function fire(from, controller) {
  const hit = raycaster.intersectObjects(shootables(), false)[0];
  const end = hit ? hit.point : raycaster.ray.at(15, farPoint);
  const color = controller ? controller.userData.color : 0xffffff;
  fx.tracer(from, end, color);
  fx.muzzle?.(from, color);
  sfx.shot();
  vibrate(controller, 0.3, 40);

  if (sharedArena.active) {
    if (sharedArena.playing) {
      // Server decides whether ray intersects a shared target and awards points.
      sharedArena.fire(raycaster.ray.origin, raycaster.ray.direction);
    }
    return;
  }
  if (state !== 'play') {
    if (hit && performance.now() >= menu.mesh.userData.readyAt) startGame();
    return;
  }
  shots++;
  if (hit) hitTarget(hit.object, hit.point.clone(), controller);
  else { combo = 0; lastMult = 1; sfx.miss(); }
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

// выстрел из «ружья у бедра» по точке экрана (ПК)
function fireFromScreen(ndc) {
  camera.updateMatrixWorld(true);
  raycaster.setFromCamera(ndc, camera);
  let from;
  if (vmWeapon?.muzzle && viewModel.visible) {
    from = vmWeapon.muzzle.getWorldPosition(new THREE.Vector3());
    safeCall(vmWeapon.fire);
  } else {
    from = new THREE.Vector3(0.25, -0.3, -0.5).applyMatrix4(camera.matrixWorld);
  }
  fire(from, null);
}

// выстрел из контроллера: луч от контроллера, трассер — из дула бластера
function fireFromController(c) {
  setRayFromController(c);
  const w = c.userData.weapon;
  const from = w?.muzzle ? w.muzzle.getWorldPosition(new THREE.Vector3()) : raycaster.ray.origin.clone();
  safeCall(w?.fire);
  fire(from, c);
}

// выстрел кнопкой МК: в VR — из правого контроллера (или взглядом), на ПК — в прицел
function fireFromAim() {
  if (renderer.xr.isPresenting) {
    const c = controllers.find((k) => k.visible && k.userData.src?.handedness === 'right')
      || controllers.find((k) => k.visible);
    if (c) {
      fireFromController(c);
      return;
    }
  }
  fireFromScreen(CENTER);
}

// ---------- ПК: мышь и клавиатура ----------
const canvas = renderer.domElement;
const keys = new Set();
let yaw = 0, pitch = 0;
const ndc = new THREE.Vector2();
const locked = () => document.pointerLockElement === canvas;

canvas.addEventListener('pointerdown', (e) => {
  if (renderer.xr.isPresenting) return;
  if (locked()) {
    fireFromScreen(CENTER);
  } else {
    // без захвата мыши стреляем по курсору и пробуем захватить мышь для обзора
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    fireFromScreen(ndc);
    try { canvas.requestPointerLock()?.catch?.(() => {}); } catch {}
  }
});

document.addEventListener('mousemove', (e) => {
  if (!locked()) return;
  yaw -= e.movementX * 0.0022;
  pitch = rand.clamp(pitch - e.movementY * 0.0022, -1.3, 1.3);
});

document.addEventListener('pointerlockchange', () => {
  document.body.classList.toggle('locked', locked());
});

addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space' && !e.repeat && !renderer.xr.isPresenting) {
    e.preventDefault();
    fireFromScreen(CENTER);
  }
  if (e.code === 'Enter' && !e.repeat && !sharedArena.active && (state === 'menu' || state === 'over')) startGame();
});

// кнопка «Играть» на стартовом экране (клик пользователя — можно захватить мышь)
addEventListener('game:start', () => {
  if (!renderer.xr.isPresenting) {
    try { canvas.requestPointerLock()?.catch?.(() => {}); } catch {}
  }
  if (!sharedArena.active && (state === 'menu' || state === 'over')) startGame();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

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
  const weapon = safeCall(weaponMod.createWeapon, { color });
  c.add(weapon?.group || makeGun(color), laser);
  c.userData = { color, laser, dot, src: null, turned: false, weapon, hand: null, wrist: null };
  c.addEventListener('connected', (e) => {
    c.userData.src = e.data;
    // перчатка по реальной руке; на левой — наручный экран
    const side = e.data.handedness === 'left' ? 'left' : 'right';
    if (c.userData.hand) c.remove(c.userData.hand.group);
    c.userData.hand = safeCall(charMod.createHand, { side, color });
    if (c.userData.hand?.group) c.add(c.userData.hand.group);
    if (c.userData.wrist) { c.remove(c.userData.wrist.group); c.userData.wrist = null; }
    if (side === 'left') {
      c.userData.wrist = safeCall(charMod.createWristHud);
      if (c.userData.wrist?.group) c.add(c.userData.wrist.group);
    }
  });
  c.addEventListener('disconnected', () => { c.userData.src = null; dot.visible = false; });
  c.addEventListener('selectstart', () => fireFromController(c));
  rig.add(c);
  scene.add(dot);
  return c;
});

// ПК: бластер и рука от первого лица в правом нижнем углу
const viewModel = new THREE.Group();
viewModel.rotation.set(0.03, 0.06, 0);
camera.add(viewModel);
// на узком экране бластер ближе к центру, чтобы не уходил за край
function placeViewModel() {
  const halfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * 0.38;
  viewModel.position.set(Math.min(0.17, halfW * 0.5), -0.17, -0.38);
}
placeViewModel();
const vmWeapon = safeCall(weaponMod.createWeapon, { color: 0xff7ad9 });
const vmArm = safeCall(charMod.createArm, { color: 0xff7ad9 });
if (vmWeapon?.group) viewModel.add(vmWeapon.group);
if (vmArm?.group) viewModel.add(vmArm.group);
viewModel.visible = !!vmWeapon?.group;
let isMoving = false;

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

// поворот рига вокруг головы (чтобы не «уносило» в сторону)
const headBefore = new THREE.Vector3();
const headAfter = new THREE.Vector3();
function snapTurn(angle) {
  camera.getWorldPosition(headBefore);
  rig.rotation.y += angle;
  rig.updateMatrixWorld(true);
  camera.getWorldPosition(headAfter);
  rig.position.x += headBefore.x - headAfter.x;
  rig.position.z += headBefore.z - headAfter.z;
}

// ---------- движение от первого лица ----------
const move = new THREE.Vector2();
let walkPhase = 0;

function updateMovement(dt) {
  move.set(0, 0);

  // клавиатура
  if (keys.has('KeyW') || keys.has('ArrowUp')) move.y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) move.y -= 1;
  if (keys.has('KeyD')) move.x += 1;
  if (keys.has('KeyA')) move.x -= 1;
  if (!renderer.xr.isPresenting) {
    if (keys.has('ArrowLeft') || keys.has('KeyQ')) yaw += TURN_SPEED * dt;
    if (keys.has('ArrowRight') || keys.has('KeyE')) yaw -= TURN_SPEED * dt;
  }

  // джойстик микроконтроллера
  move.x += mk.x;
  move.y += mk.y;

  // VR: левый стик — ходьба, правый — поворот рывком на 45°
  if (renderer.xr.isPresenting) {
    for (const c of controllers) {
      const src = c.userData.src;
      const axes = src?.gamepad?.axes;
      if (!axes || axes.length < 4) continue;
      const sx = axes[2], sy = axes[3];
      if (src.handedness === 'left') {
        if (Math.abs(sx) > 0.15) move.x += sx;
        if (Math.abs(sy) > 0.15) move.y -= sy;
      } else if (src.handedness === 'right') {
        if (!c.userData.turned && Math.abs(sx) > 0.7) {
          snapTurn(-Math.sign(sx) * Math.PI / 4);
          c.userData.turned = true;
        } else if (Math.abs(sx) < 0.3) {
          c.userData.turned = false;
        }
      }
    }
  }

  if (move.lengthSq() > 1) move.normalize();
  const moving = move.lengthSq() > 0.0001;
  isMoving = moving;
  if (moving) {
    rig.position.addScaledVector(fwd, move.y * WALK_SPEED * dt);
    rig.position.addScaledVector(right, move.x * WALK_SPEED * dt);
    const r = Math.hypot(rig.position.x, rig.position.z);
    if (r > ARENA) rig.position.multiplyScalar(ARENA / r);
    rig.position.y = 0;
  }

  // ПК: камера по мыши/клавишам + лёгкое покачивание при ходьбе
  if (!renderer.xr.isPresenting) {
    walkPhase = moving ? walkPhase + dt * 9 * Math.sqrt(move.lengthSq()) : 0;
    camera.position.set(0, EYE_HEIGHT + Math.sin(walkPhase) * 0.035, 0);
    camera.rotation.set(pitch, yaw, 0);
  }
}

// табло и меню плавно держатся перед игроком
const goal = new THREE.Vector3();
function follow(obj, dist, height, speed, dt) {
  goal.set(headPos.x + fwd.x * dist, height, headPos.z + fwd.z * dist);
  obj.position.lerp(goal, 1 - Math.exp(-speed * dt));
  obj.lookAt(headPos.x, obj.position.y, headPos.z);
}

// после выхода из VR возвращаем камеру в «рост»
renderer.xr.addEventListener('sessionstart', () => {
  viewModel.visible = false; // в шлеме оружие в руках, а не у камеры
  emit('game:xr', { active: true });
});
renderer.xr.addEventListener('sessionend', () => {
  viewModel.visible = !!vmWeapon?.group;
  camera.position.set(0, EYE_HEIGHT, 0);
  emit('game:xr', { active: false });
});

// ---------- МК ----------
const mkStatus = document.getElementById('mk-status');
const mkButton = document.getElementById('mk-connect');
mk.onStatus = (text, connected) => {
  if (mkStatus) mkStatus.textContent = text;
  if (mkButton) mkButton.textContent = connected ? 'Отключить МК' : '🔌 Подключить МК';
  mkLed.material.color.setHex(connected ? 0x34e89e : 0x555a66);
};
mk.onButtonDown = () => fireFromAim();
mkButton?.addEventListener('click', () => {
  mkButton.blur(); // чтобы Пробел не нажимал кнопку повторно
  if (mk.connected) mk.disconnect(); else mk.connect();
});
if (!mk.supported && mkStatus) mkStatus.textContent = 'Web Serial недоступен: нужен Chrome или Edge на ПК';
mk.autoConnect();

// ---------- игровой цикл ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  updateHead();
  updateMovement(dt);
  updateHead();
  updateMultiplayerPresence(performance.now(), dt);
  sharedArena.update(dt);

  if (state === 'countdown') updateCountdown(dt);

  if (state === 'play') {
    timeLeft -= dt;
    elapsed += dt;
    spawnTimer -= dt;
    if (goHide > 0 && (goHide -= dt) <= 0) menu.mesh.visible = false;
    if (spawnTimer <= 0 && targets.children.length < MAX_TARGETS) {
      spawnTarget();
      spawnTimer = Math.max(0.35, 1.0 - elapsed * 0.011); // темп растёт
    }
    // тиканье в последние 10 секунд
    const sec = Math.ceil(timeLeft);
    if (sec <= 10 && sec > 0 && sec !== lastTickSec) { lastTickSec = sec; sfx.tick?.(); }
    // музыка нарастает к концу раунда
    const intensity = Math.round((0.35 + 0.65 * Math.min(1, elapsed / ROUND_TIME)) * 20) / 20;
    if (intensity !== lastIntensity) { lastIntensity = intensity; music.setIntensity(intensity); }
    if (timeLeft <= 0) { timeLeft = 0; endGame(); }
  }

  updateTargets(dt, time);
  fx.update(dt);
  env.update(dt, time);
  gfx?.update?.(dt, time);
  updateControllers();
  updateCharacter(dt);

  follow(board.mesh, 7, headPos.y + 2.6, 1.5, dt);
  if (menu.mesh.visible) follow(menu.mesh, 3, Math.max(1.1, headPos.y) + Math.sin(time * 1.5) * 0.03, 3, dt);
  board.update({ score, timeLeft, multiplier: multiplier(), timeFrac: state === 'play' ? timeLeft / ROUND_TIME : 1 });

  renderer.render(scene, camera);
  if (!ready) { ready = true; emit('game:ready'); }
});
let ready = false;
emit('game:state', { state });

// оружие, перчатки, наручный экран и тень
const wristInfo = { score: 0, timeLeft: 0, multiplier: 1, mk: false };
function updateCharacter(dt) {
  if (viewModel.visible) vmWeapon?.update?.(dt, { moving: isMoving });
  wristInfo.score = score;
  wristInfo.timeLeft = timeLeft;
  wristInfo.multiplier = multiplier();
  wristInfo.mk = mk.connected;
  for (const c of controllers) {
    const u = c.userData;
    if (!c.visible) continue;
    u.weapon?.update?.(dt, { moving: false });
    u.hand?.update?.(dt);
    u.wrist?.update?.(wristInfo);
  }
  if (shadowBlob) shadowBlob.position.set(headPos.x, 0.012, headPos.z);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  placeViewModel();
});
