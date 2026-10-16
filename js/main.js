import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { buildEnvironment } from './env.js';
import * as audio from './sfx.js';
import { createFx } from './fx.js';
import { createScoreboard, createMenu } from './ui.js';
import { mk } from './mk.js';
import { initializeMultiplayerPresence } from './multiplayer-presence.js?v=atu-bastion-v2';
import { createSharedArena } from './multiplayer-arena.js?v=atu-bastion-v2';
import { createPvpMap } from './pvp-map.js';
import { slideMovement } from './pvp-layout.js?v=atu-bastion-v2';
import { Arsenal, Breath, MODE_LABEL, WEAPONS, scopeSway, sampleSpread, samplePellet, zeroAngle, toRad } from './arsenal.js';
import { tintWeapon, tintCharacter, skinId, skinColor } from './skins.js';

const { sfx } = audio;
const music = audio.music || { start() {}, stop() {}, setIntensity() {} };
const emit = (name, detail) => dispatchEvent(new CustomEvent(name, { detail }));
const sound = (name, ...args) => { try { sfx[name]?.(...args); } catch {} };

// модули оружия, персонажа, графики и интерфейса: если какой-то не загрузился, игра всё равно работает
const load = (path) => import(path).catch((e) => { console.warn('Модуль не загружен:', path, e); return {}; });
const [gunMod, charMod, gfxMod, ballMod, rangeMod, logoMod, hudMod] = await Promise.all([
  load('./guns.js'), load('./character.js'), load('./graphics.js'), load('./ballistics.js'),
  load('./range.js'), load('./logo.js'), load('./hud.js'),
]);
const safeCall = (fn, ...args) => { try { return fn ? fn(...args) : null; } catch (e) { console.warn(e); return null; } };

const ROUND_TIME = 60;
const MAX_TARGETS = 14;
const COLORS = [0x3ec5ff, 0x7c5cff, 0x34e89e, 0xff7ad9];
const ARENA = 11;        // радиус, по которому может ходить игрок
const TARGET_BOUND = 12; // границы полёта мишеней
const TURN_SPEED = 2;    // рад/с (клавиши Q/E)
const EYE_HEIGHT = 1.6;
const CROUCH_EYE = 1.05;
const BASE_FOV = 70;
// движение: скорости м/с, ускорение 1/с, прыжок на 0.5 м
const MOVE = { walk: 3.2, sprint: 5.8, crouch: 1.5, ads: 0.6, accel: 12, airAccel: 1.6, jump: 0.5, gravity: 9.81 };
const HINT = 'ЛКМ — огонь · ПКМ — прицел · R — перезарядка · 1–5 / колесо — оружие · B — режим огня · Shift — бег · C — присед · Пробел — прыжок · Tab / Esc — курсор и меню';

// ---------- рендер и сцена ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.03, 300);
camera.rotation.order = 'YXZ';

// игрок: камера и контроллеры внутри рига, двигаем риг
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);
const updateMultiplayerPresence = initializeMultiplayerPresence(scene, camera);
const sharedArena = createSharedArena(scene);

// PvP: подсказки о попаданиях, хедшотах и убийствах
const pvpFeed = document.createElement('div');
pvpFeed.id = 'pvp-feedback';
pvpFeed.style.cssText = 'position:fixed;top:14%;left:50%;transform:translateX(-50%);z-index:9;color:#effaff;text-shadow:0 1px 9px #050813;font:800 24px system-ui;text-align:center;pointer-events:none;opacity:0';
document.body.appendChild(pvpFeed);
let pvpFeedbackTime = 0;
addEventListener('mp:shot-feedback', event => {
  const shot = event.detail;
  if (!shot || !shot.hit || !pvpEnabled) return;
  if (shot.playerId === multiplayerPlayerId) {
    pvpFeed.textContent = shot.eliminated ? 'ПРОТИВНИК УНИЧТОЖЕН  +1' :
      shot.headshot ? 'ПОПАДАНИЕ В ГОЛОВУ  -' + shot.damage : 'ПОПАДАНИЕ  -' + shot.damage;
    pvpFeed.style.color = shot.eliminated ? '#ffd23f' : '#9fe7ff';
    pvpFeedbackTime = performance.now() + 1100;
    hud?.hitMarker(shot.eliminated ? 'kill' : 'hit');
    if (shot.position) {
      fx.popup?.(new THREE.Vector3(...shot.position),
        shot.eliminated ? 'ФРАГ!' : '-' + shot.damage, shot.eliminated ? '#ffd23f' : '#3ec5ff');
    }
  } else if (shot.victimId === multiplayerPlayerId) {
    pvpFeed.textContent = shot.eliminated ? 'ВЫ УНИЧТОЖЕНЫ — ВОЗРОЖДЕНИЕ' : 'УРОН  -' + shot.damage;
    pvpFeed.style.color = '#ff9b54';
    pvpFeedbackTime = performance.now() + 1350;
  }
});

const envBefore = new Set(scene.children);
const env = buildEnvironment(scene);
const range = safeCall(rangeMod.createRange, scene);
const logo = safeCall(logoMod.createAtuLogo, scene);
// тир, рубеж и вывеска скрываются, когда идёт PvP на карте «Бастион»
const soloEnvironment = scene.children.filter(obj => !envBefore.has(obj) && !obj.isLight);
const pvpMap = createPvpMap(scene);
let pvpEnabled = false;
let lastMySpawnSeq = 0;
const pvpPos = new THREE.Vector3();
function updatePvpWorld(room) {
  pvpEnabled = !!room && room.mode === 'pvp';
  pvpMap.setVisible(pvpEnabled);
  for (const obj of soloEnvironment) obj.visible = !pvpEnabled;
  if (!pvpEnabled) { lastMySpawnSeq = 0; return; }
  if (!room.players || room.phase !== 'playing') return;
  const myPlayer = room.players.find(p => p.id === multiplayerPlayerId);
  if (myPlayer?.spawn && myPlayer.spawnSeq !== lastMySpawnSeq) {
    lastMySpawnSeq = myPlayer.spawnSeq;
    // Recenter the tracked headset position without moving a VR player physically.
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(pvpPos);
    rig.position.x += myPlayer.spawn[0] - pvpPos.x;
    rig.position.z += myPlayer.spawn[2] - pvpPos.z;
    if (!renderer.xr.isPresenting) {
      yaw = myPlayer.team === 'bravo' ? Math.PI : 0;
      pitch = 0;
      rig.rotation.y = 0;
    }
    feet = vy = 0;
    onGround = true;
    vel.set(0, 0, 0);
    recoilP = recoilY = punch = 0;
    arsenal.resetAll();
  }
}
let multiplayerPlayerId = null;
addEventListener('mp:room:joined', e => {
  multiplayerPlayerId = e.detail?.playerId;
  updatePvpWorld(e.detail?.room);
});
addEventListener('mp:room:update', e => updatePvpWorld(e.detail?.room));
addEventListener('mp:room:left', () => { multiplayerPlayerId = null; updatePvpWorld(null); });
addEventListener('mp:status', e => {
  if (e.detail?.state === 'disconnected') { multiplayerPlayerId = null; updatePvpWorld(null); }
});
const gfx = safeCall(gfxMod.setupGraphics, renderer, scene);
const hud = safeCall(hudMod.createHud);

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
// The solo VR panel must not obscure the multiplayer targets.
addEventListener('mp:room:update', e => {
  if (e.detail?.room?.phase === 'playing') menu.mesh.visible = false;
});
addEventListener('mp:room:joined', e => {
  if (e.detail?.room?.phase === 'playing') menu.mesh.visible = false;
});
const restoreSoloMenu = () => {
  if (state === 'menu' || state === 'over') {
    menu.showStart(ROUND_TIME);
    menu.mesh.visible = true;
  }
};
addEventListener('mp:room:left', restoreSoloMenu);
addEventListener('mp:status', e => {
  if (e.detail?.state === 'disconnected') restoreSoloMenu();
});

// ---------- оружие ----------
const arsenal = new Arsenal(WEAPONS);
const breath = new Breath();
const SLOTS = WEAPONS.map((d) => ({ slot: d.slot, name: d.short || d.name }));
const ballistics = safeCall(ballMod.createBallistics, scene, {
  onCasingBounce: (kind, pos) => { if (pos.distanceToSquared(headPos) < 100) sound('casing', kind === 'shell' ? 'shell' : 'brass'); },
}) || createHitscan();

// запасной вариант без баллистики: мгновенный луч
function createHitscan() {
  const pending = [];
  const end = new THREE.Vector3();
  return {
    fire(o) { pending.push({ ...o, origin: o.origin.clone(), dir: o.dir.clone(), visualFrom: o.visualFrom.clone() }); },
    update(dt, hitTest, onHit, onEnd) {
      for (const o of pending.splice(0)) {
        const h = hitTest(o.origin, o.dir, o.maxRange || 300, new Set());
        if (h) onHit(o.shot, h, { speed: o.speed, traveled: h.distance });
        fx.tracer(o.visualFrom, h ? h.point : end.copy(o.origin).addScaledVector(o.dir, 40), o.color);
        onEnd(o.shot);
      }
    },
    eject() {}, spark() {}, clear() { pending.length = 0; },
  };
}

// ---------- состояние игры ----------
let state = 'menu'; // menu | countdown | play | over
let score = 0, combo = 0, maxCombo = 0, shots = 0, hits = 0;
let timeLeft = ROUND_TIME, elapsed = 0, spawnTimer = 0;
let countdown = 0, lastCount = -1, goHide = 0, lastTickSec = 99, lastMult = 1, lastIntensity = -1;
let best = 0;
try { best = Number(localStorage.getItem('vr-tir-best')) || 0; } catch {}

const multiplier = () => Math.min(4, 1 + Math.floor(combo / 5));
const scoring = () => state === 'play' && !sharedArena.active;

// Сетевой матч не должен запускать локальные таймеры и меню одиночного тира.
let lastMultiplayerPhase = null;
addEventListener('mp:room:joined', e => {
  if (!e.detail?.room) return;
  if (state === 'play' || state === 'countdown') {
    setState('menu');
    clearTargets();
    music.stop();
  }
  lastMultiplayerPhase = e.detail.room.phase;
  menu.mesh.visible = false;
});
addEventListener('mp:room:update', e => {
  const phase = e.detail?.room?.phase;
  if (!phase) return;
  if (phase === 'playing' && lastMultiplayerPhase !== 'playing') {
    arsenal.resetAll();
    clearTargets();
    music.start();
    music.setIntensity(0.35);
    mk.send('S');
  } else if (phase === 'finished' && lastMultiplayerPhase === 'playing') {
    music.stop();
    sfx.end();
    mk.send('E');
  }
  lastMultiplayerPhase = phase;
  menu.mesh.visible = false;
});
addEventListener('mp:room:left', () => {
  lastMultiplayerPhase = null;
  music.stop();
});
addEventListener('mp:status', e => {
  if (e.detail?.state === 'disconnected') {
    lastMultiplayerPhase = null;
    music.stop();
  }
});

function setState(s) {
  state = s;
  emit('game:state', { state: s });
}

// старт: сначала отсчёт 3-2-1, потом раунд
function startGame() {
  arsenal.resetAll();
  ballistics.clear();
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
  arsenal.resetAll(); // после раунда — полный боекомплект для тренировки
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

function addCombo(point, controller) {
  combo++;
  maxCombo = Math.max(maxCombo, combo);
  const m = multiplier();
  if (m > lastMult) {
    // новый уровень множителя
    fx.banner?.(point.clone().add(BANNER_OFFSET), `КОМБО x${m}!`, '#ffd23f');
    sfx.combo?.(m);
  }
  lastMult = m;
  return m;
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
    hud?.hitMarker('bomb');
  } else {
    const m = addCombo(point, controller);
    const pts = (u.type === 'gold' ? 3 : 1) * m;
    score += pts;
    fx.burst(point, u.color, u.type === 'gold' ? 26 : 16);
    fx.shockwave?.(point, u.color);
    fx.popup(point, '+' + pts, u.type === 'gold' ? '#ffd23f' : '#ffffff');
    if (u.type === 'gold') sfx.gold(); else sfx.hit(m);
    vibrate(controller, 0.7, 80);
    mk.send(u.type === 'gold' ? 'G' : 'H');
    hud?.hitMarker('kill');
  }
  removeTarget(t);
}

// ---------- стрельба ----------
const raycaster = new THREE.Raycaster();
const bulletRay = new THREE.Raycaster();
const tmpMat = new THREE.Matrix4();
const CENTER = new THREE.Vector2(0, 0);
const BANNER_OFFSET = new THREE.Vector3(0, 0.6, 0);
const shotOrigin = new THREE.Vector3();
const shotDir = new THREE.Vector3();
const pelletDir = new THREE.Vector3();
const muzzlePos = new THREE.Vector3();
const basisX = new THREE.Vector3();
const basisY = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

const plateSet = new Set(range?.meshes || []);
const staticColliders = [...(env.colliders || []), ...(range?.colliders || []), ...(logo?.colliders || [])];
const hittables = [];

function shootables() {
  if (sharedArena.active) return [];
  if (state === 'play') return targets.children;
  if (state === 'countdown') return [];
  return menu.mesh.visible ? [menu.mesh] : [];
}

// всё, обо что бьются пули в этом кадре
function collectHittables() {
  hittables.length = 0;
  if (scoring()) for (const t of targets.children) hittables.push(t);
  if (!sharedArena.active && menu.mesh.visible && state !== 'play') hittables.push(menu.mesh);
  if (pvpEnabled) return; // на «Бастионе» рубежа нет, попадания считает сервер
  for (const p of plateSet) hittables.push(p);
  for (const c of staticColliders) hittables.push(c);
}

function kindOf(o) {
  if (o.parent === targets) return 'target';
  if (plateSet.has(o)) return 'plate';
  if (o === menu.mesh) return 'menu';
  return 'collider';
}

const hitResult = { object: null, point: new THREE.Vector3(), distance: 0, kind: '' };
function hitTest(from, dir, length, exclude) {
  bulletRay.set(from, dir);
  bulletRay.near = 0;
  bulletRay.far = length;
  const list = bulletRay.intersectObjects(hittables, false);
  for (const h of list) {
    if (exclude && exclude.has(h.object)) continue;
    hitResult.object = h.object;
    hitResult.point.copy(h.point);
    hitResult.distance = h.distance;
    hitResult.kind = kindOf(h.object);
    return hitResult;
  }
  return null;
}

// попадание пули: true — пуля летит дальше (пробитие)
function onBulletHit(shot, hit) {
  const point = hit.point.clone();
  const near = point.distanceTo(headPos) < 30;
  switch (hit.kind) {
    case 'ground':
      if (near) sound('impact', 'ground');
      return false;
    case 'target': {
      const t = hit.object;
      if (t.parent !== targets) return false;
      ballistics.spark?.(point, 'crystal');
      if (!scoring()) return false;
      const bomb = t.userData.type === 'bomb';
      if (!shot.hit) { shot.hit = true; hits++; }
      shot.kills++;
      hitTarget(t, point, shot.controller);
      if (!bomb && shot.kills === 2) {
        fx.banner?.(point.clone().add(BANNER_OFFSET), 'ПРОСТРЕЛ!', '#ff9a3c');
        hud?.toast('ПРОСТРЕЛ!', '#ff9a3c');
      }
      return !bomb;
    }
    case 'plate': {
      ballistics.spark?.(point, 'metal');
      const res = range?.hit(hit.object, point);
      const dist = res?.distance || point.distanceTo(headPos);
      sound('plateHit', point.distanceTo(headPos));
      if (!shot.hit) { shot.hit = true; if (scoring()) hits++; }
      hud?.hitMarker('plate');
      if (res?.scored && scoring()) {
        const m = addCombo(point, shot.controller);
        const pts = res.points * m;
        score += pts;
        fx.popup(point.clone().add(tmpV.set(0, 0.8 + dist * 0.02, 0)), '+' + pts, '#ffd23f', Math.max(1, dist / 7));
        hud?.toast(`+${pts} · ${res.label}`, '#ffd23f');
        mk.send('G');
        vibrate(shot.controller, 0.5, 60);
      }
      return false;
    }
    case 'menu':
      return false;
    default:
      ballistics.spark?.(point, 'metal');
      if (near) sound('impact', 'pillar');
      return false;
  }
}

// пуля (или вся дробь выстрела) исчезла: промах сбрасывает серию
function onBulletEnd(shot) {
  if (--shot.pending > 0) return;
  if (!shot.hit && shot.round && state === 'play') {
    combo = 0;
    lastMult = 1;
    sfx.miss();
  }
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

// луч выстрела: ПК — из камеры через точку экрана, VR — из контроллера
function aimRay(source) {
  if (source.controller) {
    setRayFromController(source.controller);
    const g = handGun(source.controller);
    if (g?.muzzle) g.muzzle.getWorldPosition(muzzlePos); else muzzlePos.copy(raycaster.ray.origin);
  } else {
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(source.ndc || CENTER, camera);
    const g = pcGun();
    if (g?.muzzle && viewModel.visible) g.muzzle.getWorldPosition(muzzlePos);
    else muzzlePos.set(0.25, -0.3, -0.5).applyMatrix4(camera.matrixWorld);
  }
}

// ортонормированный базис поперёк направления выстрела
function basisFor(dir) {
  basisX.crossVectors(dir, UP);
  if (basisX.lengthSq() < 1e-6) basisX.set(1, 0, 0);
  basisX.normalize();
  basisY.crossVectors(basisX, dir).normalize();
}

let sprinting = false, sprintLock = 0;
let vrKick = 0; // накопленный подброс ствола в VR, рад

function tryShoot(first, source) {
  if (sharedArena.active && (!sharedArena.playing || !sharedArena.alive)) return;
  if (!arsenal.ready) return;
  if (sprinting) {
    // с бега стрелять нельзя: сначала остановиться
    if (first) { sprinting = false; sprintLock = 0.2; }
    return;
  }
  if (sprintLock > 0) return;
  const w = arsenal.current, d = w.def;
  aimRay(source);
  const controller = source.controller || null;
  const color = d.bolt ? skinColor(chosenSkin) : d.color;

  // меню: выстрел в панель запускает раунд (без расхода патронов)
  if (first && !sharedArena.active && (state === 'menu' || state === 'over') && menu.mesh.visible) {
    const hit = raycaster.intersectObject(menu.mesh, false)[0];
    if (hit && performance.now() >= menu.mesh.userData.readyAt) {
      fx.tracer(muzzlePos, hit.point, color);
      currentGun(controller)?.fire?.();
      sound('gunshot', d.id);
      vibrate(controller, 0.3, 40);
      startGame();
      return;
    }
  }

  const r = w.pull(first);
  if (!r) return;
  if (r.dry) {
    if (!w.startReload() && w.reserve <= 0) hud?.toast('НЕТ ПАТРОНОВ', '#ff5a6e');
    return;
  }

  // направление: рассеивание стрелка + пристрелка прицела
  shotOrigin.copy(raycaster.ray.origin);
  shotDir.copy(raycaster.ray.direction);
  basisFor(shotDir);
  if (controller && vrKick) shotDir.addScaledVector(basisY, vrKick).normalize();
  const ctx = { aim: aimAmt, speed: speedFrac, air: !onGround, crouch: isCrouched() };
  const [sx, sy] = sampleSpread(w.spread(ctx));
  shotDir.addScaledVector(basisX, sx).addScaledVector(basisY, sy + zeroAngle(d)).normalize();

  const shot = { pending: d.pellets, hit: false, kills: 0, round: scoring(), controller };
  for (let i = 0; i < d.pellets; i++) {
    pelletDir.copy(shotDir);
    if (d.pellets > 1) {
      const [px, py] = samplePellet(d.pelletSpread);
      pelletDir.addScaledVector(basisX, px).addScaledVector(basisY, py).normalize();
    }
    ballistics.fire({
      origin: shotOrigin, dir: pelletDir,
      speed: d.velocity * (d.pellets > 1 ? rand.randFloat(0.96, 1.04) : 1),
      drag: d.drag, gravity: d.gravity, penetration: d.penetration,
      visualFrom: muzzlePos, color, tracer: r.tracer, bolt: !!d.bolt,
      maxRange: d.pellets > 1 ? 150 : 700, shot,
    });
  }
  if (shot.round) shots++;
  if (sharedArena.playing) sharedArena.fire(shotOrigin, shotDir, d.id); // урон и темп оружия проверяются на сервере

  currentGun(controller)?.fire?.();
  sound('gunshot', d.id);
  vibrate(controller, d.id === 'pm' || d.bolt ? 0.35 : 0.8, d.id === 'ak' ? 40 : 90);

  // отдача
  const k = w.kick(ctx);
  if (controller) {
    vrKick = Math.min(0.12, vrKick + toRad(k.pitch) * 0.35);
  } else {
    recoilP += toRad(k.pitch);
    recoilY += toRad(k.yaw);
    punch += toRad(k.punch);
    recoilT = 0;
  }
}

// звук, гильзы и подсказки по событиям оружия
function handleWeaponEvent(w, e) {
  const d = w.def;
  const isCurrent = w === arsenal.current;
  switch (e.type) {
    case 'dry': sound('dryFire'); break;
    case 'eject': if (isCurrent && d.casing) ejectCasing(d.casing); break;
    case 'cycle-start': sound(d.action === 'pump' ? 'pumpBack' : 'boltOpen'); break;
    case 'cycle-end': sound(d.action === 'pump' ? 'pumpForward' : 'boltClose'); break;
    case 'mag-out': sound('magOut'); break;
    case 'mag-in': sound('magIn'); break;
    case 'rack':
      if (d.action === 'bolt') { sound('boltOpen'); setTimeout(() => sound('boltClose'), 260); }
      else sound('slideRack');
      break;
    case 'shell-in': sound('shellIn'); break;
    case 'overheat': sound('overheat'); hud?.toast('ПЕРЕГРЕВ!', '#ff5a6e'); break;
    case 'vent-start': case 'vented': sound('vent'); break;
    case 'mode': sound('fireMode'); hud?.toast('Режим огня: ' + (e.mode === 'auto' ? 'автоматический' : 'одиночный'), '#9fe7ff'); break;
  }
}

const ejectPos = new THREE.Vector3();
const ejectVel = new THREE.Vector3();
const ejectQuat = new THREE.Quaternion();
function ejectCasing(kind) {
  const g = currentGun(renderer.xr.isPresenting ? weaponHand : null);
  if (!g?.ejector || !g.group.visible) return;
  g.ejector.getWorldPosition(ejectPos);
  g.ejector.getWorldQuaternion(ejectQuat);
  ejectVel.set(rand.randFloat(1.8, 2.6), rand.randFloat(1.2, 1.9), rand.randFloat(-0.2, 0.5)).applyQuaternion(ejectQuat);
  ejectVel.x += vel.x; ejectVel.z += vel.z;
  ballistics.eject?.({ position: ejectPos, velocity: ejectVel, kind });
}

// ---------- ПК: мышь и клавиатура ----------
const canvas = renderer.domElement;
const keys = new Set();
let yaw = 0, pitch = 0;
const locked = () => document.pointerLockElement === canvas;
const pcTrigger = { held: false, first: false, ndc: null };
let aimHeld = false;

const grabMouse = () => { try { canvas.requestPointerLock()?.catch?.(() => {}); } catch {} };
// mousedown приходит для каждой кнопки, в том числе ЛКМ при зажатой ПКМ (pointerdown — нет)
canvas.addEventListener('mousedown', (e) => {
  if (renderer.xr.isPresenting) return;
  if (e.button === 2) {
    aimHeld = true;
    if (!locked()) grabMouse(); // прицеливание может быть первым действием
    return;
  }
  if (e.button !== 0) return;
  // Первый клик после начала сетевого матча захватывает мышь, не тратя патрон.
  if (sharedArena.playing && !locked() && !aimHeld) {
    grabMouse();
    return;
  }
  pcTrigger.held = true;
  pcTrigger.first = true;
  if (locked() || aimHeld) {
    pcTrigger.ndc = null;
    if (!locked()) grabMouse();
  } else {
    // без захвата мыши стреляем по курсору и пробуем захватить мышь для обзора
    pcTrigger.ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    grabMouse();
  }
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) pcTrigger.held = false;
  if (e.button === 2) aimHeld = false;
});

document.addEventListener('mousemove', (e) => {
  if (!locked()) return;
  const sens = 0.0022 * (camera.fov / BASE_FOV); // в оптике мышь медленнее
  yaw -= e.movementX * sens;
  pitch = rand.clamp(pitch - e.movementY * sens, -1.4, 1.4);
});

const mpControlsTip = document.getElementById('mp-controls-tip');
function updateMultiplayerControlsTip() {
  if (mpControlsTip) mpControlsTip.hidden = !sharedArena.playing || locked() || renderer.xr.isPresenting;
}
document.addEventListener('pointerlockchange', () => {
  document.body.classList.toggle('locked', locked());
  if (!locked()) { keys.clear(); aimHeld = false; pcTrigger.held = false; }
  updateMultiplayerControlsTip();
});
addEventListener('mp:room:update', updateMultiplayerControlsTip);
addEventListener('mp:room:joined', updateMultiplayerControlsTip);
addEventListener('mp:room:left', updateMultiplayerControlsTip);
addEventListener('mp:status', updateMultiplayerControlsTip);
addEventListener('mp:focus-controls', () => {
  if (sharedArena.playing && !renderer.xr.isPresenting && !locked()) {
    try { canvas.requestPointerLock()?.catch?.(() => {}); } catch {}
  }
});

let wheelAt = 0;
addEventListener('wheel', (e) => {
  if (renderer.xr.isPresenting || !locked()) return; // свободный курсор — колесо просто прокручивает
  const now = performance.now();
  if (now - wheelAt < 120 || Math.abs(e.deltaY) < 1) return;
  wheelAt = now;
  arsenal.step(e.deltaY > 0 ? 1 : -1);
}, { passive: true });

let jumpRequested = false;
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Space' && !renderer.xr.isPresenting) { e.preventDefault(); jumpRequested = true; }
  if (e.code === 'KeyR') arsenal.current.startReload();
  if (e.code === 'KeyB') arsenal.current.toggleMode();
  const digit = /^Digit([1-9])$/.exec(e.code);
  if (digit && Number(digit[1]) <= WEAPONS.length) arsenal.select(Number(digit[1]) - 1);
  if (e.code === 'Enter' && !sharedArena.active && (state === 'menu' || state === 'over')) startGame();
});

// кнопка «Играть» на стартовом экране (клик пользователя — можно захватить мышь)
addEventListener('game:start', () => {
  if (!renderer.xr.isPresenting) {
    try { canvas.requestPointerLock()?.catch?.(() => {}); } catch {}
  }
  if (!sharedArena.active && (state === 'menu' || state === 'over')) startGame();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); aimHeld = false; pcTrigger.held = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

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

// набор моделей всего арсенала для одной руки (или для вида от первого лица)
function buildGunSet(parent, color) {
  const set = {};
  for (const d of WEAPONS) {
    const g = safeCall(gunMod.createGun, d.id, { color });
    if (!g?.group) continue;
    g.group.visible = false;
    parent.add(g.group);
    set[d.id] = g;
  }
  return set;
}

const laserGeo = new THREE.CylinderGeometry(0.002, 0.002, 1, 6);
laserGeo.rotateX(Math.PI / 2);
laserGeo.translate(0, 0, -0.5);
const dotGeo = new THREE.SphereGeometry(0.02, 12, 8);

let weaponHand = null; // контроллер, в котором оружие
const controllers = [0, 1].map((i) => {
  const c = renderer.xr.getController(i);
  const color = i === 0 ? 0x3ec5ff : 0xff7ad9;
  const laser = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }));
  const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color }));
  dot.visible = false;
  c.add(laser);
  c.userData = { color, laser, dot, src: null, turned: false, guns: null, fallback: null, hand: null, wrist: null, trigHeld: false, trigFirst: false, prevButtons: [] };
  c.addEventListener('connected', (e) => {
    c.userData.src = e.data;
    if (!c.userData.guns) {
      c.userData.guns = buildGunSet(c, color);
      if (!Object.keys(c.userData.guns).length) { c.userData.fallback = makeGun(color); c.add(c.userData.fallback); }
      applySelectedSkin(chosenSkin);
    }
    // перчатка по реальной руке; на левой — наручный экран
    const side = e.data.handedness === 'left' ? 'left' : 'right';
    if (c.userData.hand) c.remove(c.userData.hand.group);
    c.userData.hand = safeCall(charMod.createHand, { side, color });
    if (c.userData.hand?.group) c.add(c.userData.hand.group);
    tintCharacter(c.userData.hand, skinId(window.vrAtuSelectedSkin));
    if (c.userData.wrist) { c.remove(c.userData.wrist.group); c.userData.wrist = null; }
    if (side === 'left') {
      c.userData.wrist = safeCall(charMod.createWristHud);
      if (c.userData.wrist?.group) c.add(c.userData.wrist.group);
    }
    if (side === 'right' || !weaponHand) weaponHand = c;
  });
  c.addEventListener('disconnected', () => {
    c.userData.src = null;
    dot.visible = false;
    if (weaponHand === c) weaponHand = controllers.find((k) => k !== c && k.userData.src) || null;
  });
  c.addEventListener('selectstart', () => { c.userData.trigHeld = true; c.userData.trigFirst = true; });
  c.addEventListener('selectend', () => { c.userData.trigHeld = false; });
  // хват: в руке с оружием — прицеливание, в другой — перезарядка
  c.addEventListener('squeezestart', () => { if (c === weaponHand) vrAim = true; else arsenal.current.startReload(); });
  c.addEventListener('squeezeend', () => { if (c === weaponHand) vrAim = false; });
  rig.add(c);
  scene.add(dot);
  return c;
});
let vrAim = false, vrCrouch = false, vrSprint = false;

// ПК: оружие и рука от первого лица в правом нижнем углу
const viewModel = new THREE.Group();
camera.add(viewModel);
const vmHip = new THREE.Vector3();
const vmAds = new THREE.Vector3();
// на узком экране оружие ближе к центру, чтобы не уходило за край
function placeViewModel() {
  const halfW = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * camera.aspect * 0.38;
  vmHip.set(Math.min(0.17, halfW * 0.5), -0.17, -0.38);
}
placeViewModel();
const pcGuns = buildGunSet(viewModel, 0xff7ad9);
const hasGuns = Object.keys(pcGuns).length > 0;
const vmArm = safeCall(charMod.createArm, { color: 0xff7ad9 });
if (vmArm?.group) viewModel.add(vmArm.group);
let chosenSkin = skinId(window.vrAtuSelectedSkin);
function applySelectedSkin(id) {
  chosenSkin = skinId(id);
  for (const g of Object.values(pcGuns)) tintWeapon(g, chosenSkin);
  tintCharacter(vmArm, chosenSkin);
  for (const c of controllers) {
    for (const g of Object.values(c.userData.guns || {})) tintWeapon(g, chosenSkin);
    tintCharacter(c.userData.hand, chosenSkin);
  }
}
applySelectedSkin(chosenSkin);
addEventListener('skin:changed', e => applySelectedSkin(e.detail?.skin));

viewModel.visible = hasGuns;
const pcGun = () => pcGuns[arsenal.current.def.id];
const handGun = (c) => c?.userData.guns?.[arsenal.current.def.id] || null;
const currentGun = (controller) => (controller ? handGun(controller) : renderer.xr.isPresenting ? handGun(weaponHand) : pcGun());

// показываем только текущее оружие и только в нужной руке
function syncGunVisibility() {
  const id = arsenal.current.def.id;
  for (const [gid, g] of Object.entries(pcGuns)) g.group.visible = gid === id;
  for (const c of controllers) {
    const mine = c === weaponHand;
    for (const [gid, g] of Object.entries(c.userData.guns || {})) g.group.visible = mine && gid === id;
    if (c.userData.fallback) c.userData.fallback.visible = mine;
  }
}

// лазер-указка: в меню всегда, в раунде — только у бластера
function updateControllers() {
  const laserOn = state !== 'play' || arsenal.current.def.bolt || sharedArena.active;
  for (const c of controllers) {
    const { laser, dot } = c.userData;
    laser.visible = laserOn;
    if (!renderer.xr.isPresenting || !c.visible || !laserOn) { dot.visible = false; continue; }
    setRayFromController(c);
    raycaster.far = Infinity;
    const hit = raycaster.intersectObjects(shootables(), false)[0];
    laser.scale.z = hit ? hit.distance : 12;
    dot.visible = !!hit;
    if (hit) dot.position.copy(hit.point);
  }
}

// кнопки шлема: A — прыжок, B/Y — оружие, X — присед, стики — бег и режим огня
function pollVrButtons() {
  for (const c of controllers) {
    const src = c.userData.src;
    const b = src?.gamepad?.buttons;
    if (!b) continue;
    const prev = c.userData.prevButtons;
    const pressed = (i) => !!b[i]?.pressed && !prev[i];
    if (src.handedness === 'right') {
      if (pressed(4)) jumpRequested = true;
      if (pressed(5)) arsenal.step(1);
      if (pressed(3)) arsenal.current.toggleMode();
    } else if (src.handedness === 'left') {
      if (pressed(4)) vrCrouch = !vrCrouch;
      if (pressed(5)) arsenal.step(-1);
      if (pressed(3)) vrSprint = !vrSprint;
    }
    for (let i = 0; i < b.length; i++) prev[i] = !!b[i]?.pressed;
  }
}

// курки и кнопка МК
function handleTriggers() {
  if (renderer.xr.isPresenting) {
    for (const c of controllers) {
      const u = c.userData;
      if (!u.trigHeld && !u.trigFirst) continue;
      if (c !== weaponHand && u.trigFirst) {
        // курок свободной руки: перекладываем оружие в эту руку
        weaponHand = c;
        sound('draw');
      } else if (c === weaponHand) {
        tryShoot(u.trigFirst, { controller: c });
      }
      u.trigFirst = false;
    }
  } else if (pcTrigger.held || pcTrigger.first) {
    tryShoot(pcTrigger.first, { ndc: pcTrigger.ndc });
    pcTrigger.first = false;
    if (!locked() && pcTrigger.ndc) pcTrigger.held = false; // без захвата мыши — только одиночные
  }
  if (mkTrigger.first || (mk.connected && mk.btn)) {
    const src = renderer.xr.isPresenting && weaponHand ? { controller: weaponHand } : { ndc: null };
    tryShoot(mkTrigger.first, src);
    mkTrigger.first = false;
  }
}
const mkTrigger = { first: false };

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
const vel = new THREE.Vector3(); // горизонтальная скорость, м/с
let feet = 0, vy = 0, onGround = true, crouchAmt = 0, sprintAmt = 0, landDip = 0;
let walkPhase = 0, lastStep = 0, speedFrac = 0, aimAmt = 0;
let recoilP = 0, recoilY = 0, recoilT = 0, punch = 0, roll = 0;

function isCrouched() {
  if (renderer.xr.isPresenting) return crouchAmt > 0.5 || headPos.y - rig.position.y < 1.25; // в шлеме можно присесть по-настоящему
  return crouchAmt > 0.5;
}

function updateMovement(dt) {
  const xr = renderer.xr.isPresenting;
  move.set(0, 0);

  // клавиатура
  if (keys.has('KeyW') || keys.has('ArrowUp')) move.y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) move.y -= 1;
  if (keys.has('KeyD')) move.x += 1;
  if (keys.has('KeyA')) move.x -= 1;
  if (!xr) {
    if (keys.has('ArrowLeft') || keys.has('KeyQ')) yaw += TURN_SPEED * dt;
    if (keys.has('ArrowRight') || keys.has('KeyE')) yaw -= TURN_SPEED * dt;
  }

  // джойстик микроконтроллера
  move.x += mk.x;
  move.y += mk.y;

  // VR: левый стик — ходьба, правый — поворот рывком на 45°
  if (xr) {
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

  const w = arsenal.current;
  const wantCrouch = xr ? vrCrouch : keys.has('KeyC');
  const shift = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const wantSprint = (xr ? vrSprint : shift) && move.y > 0.5 && onGround && !wantCrouch && aimAmt < 0.3 && !aimHeld && !vrAim;
  if (sprinting && !wantSprint) sprintLock = Math.max(sprintLock, 0.18); // переход с бега на стрельбу
  sprinting = wantSprint;
  if (xr && vrSprint && move.y < 0.3) vrSprint = false;
  sprintLock = Math.max(0, sprintLock - dt);
  sprintAmt += ((sprinting ? 1 : 0) - sprintAmt) * Math.min(1, dt * 8);

  // присед плавно за ~0.2 с
  crouchAmt += ((wantCrouch && !sprinting ? 1 : 0) - crouchAmt) * Math.min(1, dt * 10);
  const crouched = crouchAmt > 0.5;

  // скорость: бег / шаг / присед, тяжёлое оружие и прицеливание замедляют
  let speed = sprinting ? MOVE.sprint : crouched ? MOVE.crouch : MOVE.walk;
  speed *= w.def.speedMul * (1 - (1 - MOVE.ads) * aimAmt);
  const tx = (fwd.x * move.y + right.x * move.x) * speed;
  const tz = (fwd.z * move.y + right.z * move.x) * speed;
  const k = 1 - Math.exp(-(onGround ? MOVE.accel : MOVE.airAccel) * dt); // в воздухе почти без управления
  vel.x += (tx - vel.x) * k;
  vel.z += (tz - vel.z) * k;
  rig.position.x += vel.x * dt;
  rig.position.z += vel.z * dt;
  const r = pvpEnabled ? 0 : Math.hypot(rig.position.x, rig.position.z);
  if (r > ARENA) {
    const nx = rig.position.x / r, nz = rig.position.z / r;
    rig.position.x = nx * ARENA;
    rig.position.z = nz * ARENA;
    const out = vel.x * nx + vel.z * nz;
    if (out > 0) { vel.x -= nx * out; vel.z -= nz * out; }
  }
  if (pvpEnabled && sharedArena.playing) {
    // стены и укрытия «Бастиона»: скольжение вдоль препятствий
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(pvpPos);
    const [newX, newZ] = slideMovement(headPos.x, headPos.z, pvpPos.x, pvpPos.z);
    rig.position.x += newX - pvpPos.x;
    rig.position.z += newZ - pvpPos.z;
  }
  const hspeed = Math.hypot(vel.x, vel.z);
  speedFrac = hspeed / MOVE.walk;

  // прыжок: v = √(2gh), в воздухе действует только тяжесть
  if (jumpRequested && onGround) {
    vy = Math.sqrt(2 * MOVE.gravity * MOVE.jump);
    onGround = false;
    sound('jump');
  }
  jumpRequested = false;
  if (!onGround) {
    vy -= MOVE.gravity * dt;
    feet += vy * dt;
    if (feet <= 0) {
      const impact = -vy;
      feet = 0; vy = 0; onGround = true;
      landDip = Math.min(0.12, impact * 0.022);
      sound('land', Math.min(1, impact / 5));
      arsenal.current.bloom = Math.min(arsenal.current.def.spread.bloomMax + 0.5, arsenal.current.bloom + 0.4);
    }
  }
  landDip *= Math.exp(-9 * dt);

  // шаги: частота растёт со скоростью, звук на каждый шаг
  if (onGround && hspeed > 0.4) {
    walkPhase += dt * (sprinting ? 11.5 : crouched ? 6 : 8.5) * Math.min(1.2, Math.sqrt(hspeed / speed || 0));
    const step = Math.floor(walkPhase / Math.PI);
    if (step !== lastStep) { lastStep = step; if (!crouched) sound('footstep', sprinting); }
  }
  const bobA = onGround ? Math.min(1, hspeed / MOVE.walk) * (sprinting ? 0.05 : crouched ? 0.015 : 0.03) * (1 - 0.8 * aimAmt) : 0;

  if (!xr) {
    camera.position.set(
      Math.cos(walkPhase * 0.5) * bobA * 0.5,
      EYE_HEIGHT + (CROUCH_EYE - EYE_HEIGHT) * crouchAmt + feet - landDip + Math.sin(walkPhase) * bobA,
      0,
    );
  } else {
    rig.position.y = feet - crouchAmt * 0.5; // искусственный присед в шлеме — кнопкой X
  }
}

// ---------- прицеливание, отдача, раскачка ----------
const scopeFov = (d) => d.scopeFov || THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(toRad(BASE_FOV / 2)) / d.zoom));
let scoped = false, lastWeaponId = null;

function updateAim(dt, time) {
  const xr = renderer.xr.isPresenting;
  const w = arsenal.current, d = w.def;
  // в прицел нельзя на бегу, при перезарядке и смене оружия
  const want = (xr ? vrAim : aimHeld) && arsenal.ready && !w.reloading && !sprinting;
  aimAmt = want ? Math.min(1, aimAmt + dt / d.adsTime) : Math.max(0, aimAmt - dt / (d.adsTime * 0.8));
  const nowScoped = !xr && !!d.zoom && aimAmt >= 0.95;
  if (nowScoped && !scoped) sound('scopeIn');
  scoped = nowScoped;

  // дыхание: Shift в оптике
  const shift = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const be = breath.update(dt, scoped && shift);
  if (be === 'hold') sound('breathHold');
  else if (be === 'release' || be === 'out') sound('breathOut');

  // отдача уходит после короткой задержки
  const rec = d.recoil;
  recoilT += dt;
  if (recoilT > rec.delay) {
    const step = toRad(rec.recover) * dt;
    recoilP = Math.max(0, recoilP - Math.max(step, recoilP * 4 * dt));
    recoilY -= Math.sign(recoilY) * Math.min(Math.abs(recoilY), step * 0.7 + Math.abs(recoilY) * 3 * dt);
  }
  punch *= Math.exp(-16 * dt);
  vrKick *= Math.exp(-6 * dt);

  if (xr) return;
  let swayP = 0, swayY = 0;
  if (d.zoom && aimAmt > 0.5) {
    const s = scopeSway(time, d, { crouch: isCrouched(), moving: speedFrac, breath: breath.factor });
    swayP = toRad(s.pitch) * aimAmt;
    swayY = toRad(s.yaw) * aimAmt;
  }
  roll += ((-(vel.x * right.x + vel.z * right.z) * 0.006) - roll) * Math.min(1, dt * 6); // лёгкий крен при стрейфе
  camera.rotation.set(pitch + recoilP + punch + swayP, yaw + recoilY + swayY, roll);

  // поле зрения: бег шире, прицел уже, оптика 7×
  const baseFov = BASE_FOV + 6 * sprintAmt;
  const fov = scoped ? scopeFov(d) : THREE.MathUtils.lerp(baseFov, d.adsFov, aimAmt * aimAmt * (3 - 2 * aimAmt));
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

// оружие от первого лица: от бедра к глазу по прицельной линии
function updateViewModel(dt) {
  if (renderer.xr.isPresenting || !hasGuns) return;
  const g = pcGun();
  const e = aimAmt * aimAmt * (3 - 2 * aimAmt);
  if (g?.sight) vmAds.set(-g.sight.x, -g.sight.y, -(g.eyeDist ?? 0.3) - g.sight.z);
  else vmAds.set(0, -0.1, -0.35);
  viewModel.position.lerpVectors(vmHip, vmAds, e);
  viewModel.rotation.set(0.03 * (1 - e), 0.06 * (1 - e), 0);
  viewModel.visible = !scoped;
  if (vmArm?.group) vmArm.group.visible = aimAmt < 0.6; // у глаза предплечье закрывает пол-экрана
}

// ---------- VR: оптика СВ-98 рисуется в текстуру на линзе ----------
let scopeRT = null, scopeCam = null;
function renderScopeLens() {
  const g = handGun(weaponHand);
  if (!g?.lens || !g.group.visible) return;
  if (!scopeRT) {
    scopeRT = new THREE.WebGLRenderTarget(512, 512);
    scopeCam = new THREE.PerspectiveCamera(scopeFov(arsenal.current.def), 1, 1.2, 300); // поле зрения прицела 7×
  }
  g.lens.getWorldPosition(scopeCam.position);
  weaponHand.getWorldQuaternion(scopeCam.quaternion);
  if (g.lens.material.map !== scopeRT.texture) { g.lens.material.map = scopeRT.texture; g.lens.material.color?.set(0xffffff); g.lens.material.needsUpdate = true; }
  const xrOn = renderer.xr.enabled;
  const prev = renderer.getRenderTarget();
  renderer.xr.enabled = false;
  g.lens.visible = false;
  renderer.setRenderTarget(scopeRT);
  renderer.render(scene, scopeCam);
  renderer.setRenderTarget(prev);
  g.lens.visible = true;
  renderer.xr.enabled = xrOn;
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
  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
  camera.fov = BASE_FOV;
  camera.updateProjectionMatrix();
  emit('game:xr', { active: true });
});
renderer.xr.addEventListener('sessionend', () => {
  viewModel.visible = hasGuns;
  rig.position.y = 0;
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
mk.onButtonDown = () => { mkTrigger.first = true; };
mkButton?.addEventListener('click', () => {
  mkButton.blur(); // чтобы Пробел не нажимал кнопку повторно
  if (mk.connected) mk.disconnect(); else mk.connect();
});
if (!mk.supported && mkStatus) mkStatus.textContent = 'Web Serial недоступен: нужен Chrome или Edge на ПК';
mk.autoConnect();

// ---------- HUD ----------
function weaponStatus(w) {
  const d = w.def;
  const pvp = pvpEnabled && sharedArena.playing;
  if (pvp && !sharedArena.alive) return { text: 'ВОЗРОЖДЕНИЕ…', progress: null };
  if (!arsenal.ready) return { text: 'СМЕНА ОРУЖИЯ', progress: 1 - arsenal.lowered };
  if (w.overheat > 0) return { text: 'ПЕРЕГРЕВ', progress: 1 - w.overheat / d.overheatTime };
  const r = w.reloading;
  if (r) {
    if (r.kind === 'vent') return { text: 'СБРОС ТЕПЛА', progress: r.t / r.dur };
    if (r.kind.startsWith('shell')) return { text: 'СНАРЯЖЕНИЕ', progress: w.mag / d.mag };
    return { text: 'ПЕРЕЗАРЯДКА', progress: r.t / r.dur };
  }
  if (w.cycle > 0) return { text: d.action === 'pump' ? 'ПОМПА' : 'ПЕРЕЗАРЯЖАНИЕ ЗАТВОРОМ', progress: w.cycleProgress };
  if (w.empty) return { text: w.reserve > 0 ? 'ПУСТО — R' : 'НЕТ ПАТРОНОВ', progress: null };
  if (pvp) return { text: `♥ ${sharedArena.health} HP · убийств: ${sharedArena.kills}`, progress: sharedArena.health / 100 };
  return null;
}

const hudInfo = { weapon: {}, slots: SLOTS, ammo: { loaded: 0, chamber: 0, reserve: 0, capacity: 0 }, hint: HINT };
const wristInfo = { score: 0, timeLeft: 0, multiplier: 1, mk: false, weapon: { name: '', ammo: '', status: '' } };
function updateHud() {
  const w = arsenal.current, d = w.def;
  const status = weaponStatus(w);
  if (renderer.xr.isPresenting) {
    wristInfo.weapon.name = d.short || d.name;
    wristInfo.weapon.ammo = w.energy ? `${Math.round(w.heat * 100)}%` : `${w.mag}${w.chamber ? '+1' : ''} / ${w.reserve}`;
    wristInfo.weapon.status = status?.text || '';
  }
  if (!hud) return;
  const spreadDeg = w.spread({ aim: aimAmt, speed: speedFrac, air: !onGround, crouch: isCrouched() });
  const half = innerHeight / 2 / Math.tan(toRad(camera.fov / 2));
  hudInfo.visible = !renderer.xr.isPresenting;
  hudInfo.weapon = d;
  hudInfo.ammo = w.energy ? null : { loaded: w.mag, chamber: w.chamber, reserve: w.reserve, capacity: d.mag };
  hudInfo.heat = w.energy ? w.heat : null;
  hudInfo.overheated = w.overheat > 0;
  hudInfo.mode = MODE_LABEL[w.mode] || '';
  hudInfo.status = status;
  hudInfo.stance = !onGround ? 'В ПРЫЖКЕ' : sprinting ? 'БЕГ' : crouchAmt > 0.5 ? 'ПРИСЕД' : 'СТОЯ';
  hudInfo.crosshair = aimAmt < 0.5 && !scoped;
  hudInfo.spreadPx = Math.tan(toRad(spreadDeg)) * half + 6;
  hudInfo.scope = scoped ? { pxPerMil: 0.001 * half } : null;
  hudInfo.breath = scoped ? { value: breath.value, holding: breath.holding, exhausted: breath.exhausted > 0 } : null;
  hud.update(hudInfo);
}

// ---------- игровой цикл ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  const xr = renderer.xr.isPresenting;

  updateHead();
  if (xr) pollVrButtons();
  updateMovement(dt);
  updateAim(dt, time);
  updateHead();
  updateMultiplayerPresence(performance.now(), dt);
  sharedArena.update(dt);

  // оружие: смена, перезарядка, события
  arsenal.update(dt);
  for (const e of arsenal.drain()) if (e.type === 'draw') sound('draw');
  if (arsenal.current.def.id !== lastWeaponId) { lastWeaponId = arsenal.current.def.id; syncGunVisibility(); aimAmt = 0; }
  if (xr) syncGunVisibility();
  handleTriggers();
  for (const w of arsenal.list) for (const e of w.drain()) handleWeaponEvent(w, e);

  // полёт пуль
  collectHittables();
  ballistics.update(dt, hitTest, onBulletHit, onBulletEnd);

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
  range?.update?.(dt, time);
  logo?.update?.(dt, time);
  gfx?.update?.(dt, time);
  updateControllers();
  updateViewModel(dt);
  updateCharacter(dt);
  updateHud();
  pvpFeed.style.opacity = pvpEnabled && performance.now() < pvpFeedbackTime ? '1' : '0';

  follow(board.mesh, 7, headPos.y + 2.6, 1.5, dt);
  if (menu.mesh.visible) follow(menu.mesh, 3, Math.max(1.1, headPos.y) + Math.sin(time * 1.5) * 0.03, 3, dt);
  board.update(sharedArena.active
    ? { score: sharedArena.score, timeLeft: sharedArena.timeLeft, multiplier: 1, timeFrac: sharedArena.timeLeft / ROUND_TIME }
    : { score, timeLeft, multiplier: multiplier(), timeFrac: state === 'play' ? timeLeft / ROUND_TIME : 1 });

  if (xr && arsenal.current.def.zoom) {
    try { renderScopeLens(); } catch (e) { console.warn(e); }
  }
  renderer.render(scene, camera);
  if (!ready) { ready = true; emit('game:ready'); }
});
let ready = false;
emit('game:state', { state });

// оружие, перчатки, наручный экран и тень
const gunState = { moving: 0, sprint: 0, aim: 0, draw: 0, reload: null, cycle: null, empty: false, heat: 0 };
function updateCharacter(dt) {
  const w = arsenal.current;
  gunState.moving = Math.min(1, speedFrac);
  gunState.sprint = sprintAmt;
  gunState.aim = aimAmt;
  gunState.draw = arsenal.lowered;
  gunState.reload = w.reloadState;
  gunState.cycle = w.cycleProgress;
  gunState.empty = w.def.action === 'semi' && w.empty;
  gunState.heat = w.heat;
  if (renderer.xr.isPresenting) {
    handGun(weaponHand)?.update?.(dt, gunState);
  } else if (viewModel.visible || scoped) {
    pcGun()?.update?.(dt, gunState);
  }
  wristInfo.score = sharedArena.active ? sharedArena.score : score;
  wristInfo.timeLeft = sharedArena.active ? sharedArena.timeLeft : timeLeft;
  wristInfo.multiplier = multiplier();
  wristInfo.mk = mk.connected;
  for (const c of controllers) {
    const u = c.userData;
    if (!c.visible) continue;
    u.hand?.update?.(dt);
    u.wrist?.update?.(wristInfo);
  }
  if (shadowBlob) shadowBlob.position.set(headPos.x, 0.012, headPos.z);
}

// отладка: ?debug — повернуть взгляд и выбрать оружие из консоли
if (/[?&]debug\b/.test(location.search)) {
  window.vrTirDebug = {
    look(yawDeg, pitchDeg = 0) { yaw = toRad(yawDeg); pitch = toRad(pitchDeg); },
    aim(on = true) { aimHeld = on; },
    fire() { pcTrigger.held = true; pcTrigger.first = true; pcTrigger.ndc = null; setTimeout(() => { pcTrigger.held = false; }, 30); },
    select(i) { arsenal.select(i); },
    get state() { return { state, score, combo, shots, hits, weapon: arsenal.current.def.id, mag: arsenal.current.mag, aimAmt, scoped }; },
  };
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  placeViewModel();
});
