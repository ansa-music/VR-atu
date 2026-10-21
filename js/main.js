import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { buildEnvironment } from './env.js';
import * as audio from './sfx.js';
import { createFx } from './fx.js';
import { createScoreboard, createMenu } from './ui.js';
import { mk } from './mk.js';
import { initializeMultiplayerPresence } from './multiplayer-presence.js?v=atu-anim-v1';
import { createSharedArena } from './multiplayer-arena.js?v=atu-pvp-v3';
import { createPvpMap } from './pvp-map.js';
import { slideMovement } from './pvp-layout.js?v=atu-pvp-v3';
import { Arsenal, Breath, MODE_LABEL, WEAPONS, scopeSway, sampleSpread, samplePellet, zeroAngle, toRad } from './arsenal.js';
import { tintWeapon, tintCharacter, skinId, skinColor } from './skins.js';
import { QUALITY, detectQuality, isStandaloneHeadset } from './quality.js';
import { createVrMirror } from './vr-mirror.js';

const { sfx } = audio;
const classicMusic = audio.music || { start() {}, stop() {}, setIntensity() {} };
let music = classicMusic; // в фэнтези-режиме — оркестр «Арены магов»
const emit = (name, detail) => dispatchEvent(new CustomEvent(name, { detail }));
const sound = (name, ...args) => { try { sfx[name]?.(...args); } catch {} };

// модули оружия, персонажа, графики и интерфейса: если какой-то не загрузился, игра всё равно работает
const load = (path) => import(path).catch((e) => { console.warn('Модуль не загружен:', path, e); return {}; });
const [gunMod, charMod, gfxMod, ballMod, rangeMod, logoMod, hudMod, comfortMod, settingsMod, holsterMod, handlingMod, touchMod] = await Promise.all([
  load('./guns.js'), load('./character.js'), load('./graphics.js'), load('./ballistics.js'),
  load('./range.js'), load('./logo.js'), load('./hud.js'), load('./vr-comfort.js'),
  load('./settings.js' + new URL(import.meta.url).search), load('./vr-holsters.js'), load('./vr-handling.js'), load('./touch.js'),
]);
// фэнтези-режим VR «Арена магов»
const [fworldMod, fuiMod, fbracerMod, faudioMod, skillsMod, gesturesMod] = await Promise.all([
  load('./fantasy/world.js'), load('./fantasy/ui.js'), load('./fantasy/bracer.js'), load('./fantasy/audio.js'),
  load('./fantasy/skills.js'), load('./fantasy/gestures.js'),
]);
const [wpnMod, fmodelsMod, bowMod, meleeMod, enemiesMod, wavesMod] = await Promise.all([
  load('./fantasy/weapons.js'), load('./fantasy/models.js'), load('./fantasy/bow.js'),
  load('./fantasy/melee.js'), load('./fantasy/enemies.js'), load('./fantasy/waves.js'),
]);
// настройки игрока; если модуль не загрузился — значения по умолчанию
const userSettings = settingsMod.settings || { sensitivity: 1, fov: 70, invertY: false, musicVolume: 0.7, sfxVolume: 1, turn: 'snap', vignette: true, vrReload: 'hands', holsters: true, leftHanded: false };
const deskFov = () => THREE.MathUtils.clamp(Number(userSettings.fov) || 70, 60, 100);
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
const quality = detectQuality();
const urlParams = new URLSearchParams(location.search);
const WORLD_MODE = urlParams.get('mode') === 'world'; // «Открытый мир»: рельеф вместо арены, без раундов тира
const SPECTATE = (urlParams.get('spectate') || '').replace(/\D/g, '').slice(0, 6) || null; // экран зрителя: код трансляции
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
let pixelCap = Math.min(devicePixelRatio, quality.pixelRatio); // динамическое разрешение опускает его при просадках
renderer.setPixelRatio(pixelCap);
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setFramebufferScaleFactor(quality.framebufferScale);
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));
// трансляция VR на монитор (ПК-VR); на автономном шлеме выключена; ?mirror=1 / ?mirror=0 — включить / выключить
const mirrorParam = new URLSearchParams(location.search).get('mirror');
const vrMirror = createVrMirror(renderer, { enabled: mirrorParam === '1' || (mirrorParam !== '0' && !isStandaloneHeadset()) });

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(deskFov(), innerWidth / innerHeight, 0.03, 300);
camera.rotation.order = 'YXZ';

// игрок: камера и контроллеры внутри рига, двигаем риг
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);
const updateMultiplayerPresence = initializeMultiplayerPresence(scene, camera);
const sharedArena = createSharedArena(scene);

// PvP: подсказки о попаданиях, хедшотах и убийствах
const pvpState = document.createElement('div');
pvpState.id = 'pvp-state';
pvpState.hidden = true;
pvpState.style.cssText = 'position:fixed;top:32%;left:50%;transform:translateX(-50%);padding:18px 28px;z-index:9;background:rgba(5,11,22,.84);border:1px solid rgba(255,152,82,.55);border-radius:16px;color:#fff;font:700 18px system-ui;text-align:center;pointer-events:none;text-shadow:0 2px 8px #080b13;box-shadow:0 10px 38px rgba(0,0,0,.3)';
document.body.appendChild(pvpState);

const pvpFeed = document.createElement('div');
pvpFeed.id = 'pvp-feedback';
pvpFeed.style.cssText = 'position:fixed;top:14%;left:50%;transform:translateX(-50%);z-index:9;color:#effaff;text-shadow:0 1px 9px #050813;font:800 24px system-ui;text-align:center;pointer-events:none;opacity:0';
document.body.appendChild(pvpFeed);
let pvpFeedbackTime = 0;
addEventListener('mp:shot-feedback', event => {
  const shot = event.detail;
  if (!shot || !shot.hit || !pvpEnabled) return;
  // Shotguns can damage multiple players; resolve our own victim entry rather
  // than only the server's highest-damage primary target.
  const myHit = Array.isArray(shot.victims)
    ? shot.victims.find(v => v.victimId === multiplayerPlayerId)
    : (shot.victimId === multiplayerPlayerId ? shot : null);
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
  } else if (myHit) {
    pvpFeed.textContent = myHit.eliminated ? 'ВЫ УНИЧТОЖЕНЫ — ВОЗРОЖДЕНИЕ' : 'УРОН  -' + myHit.damage;
    pvpFeed.style.color = '#ff9b54';
    pvpFeedbackTime = performance.now() + 1350;
  }
});

const envBefore = new Set(scene.children);
const env = buildEnvironment(scene, { quality });
const range = safeCall(rangeMod.createRange, scene);
const logo = safeCall(logoMod.createAtuLogo, scene);
// тир, рубеж и вывеска скрываются, когда идёт PvP на карте «Бастион»
const soloEnvironment = scene.children.filter(obj => !envBefore.has(obj) && !obj.isLight);
// открытый мир (?mode=world): тир, рубеж и его свет скрыты; не загрузился — остаётся тир
let world = null;
let progressionBridge = null, progressionVr = null;
if (WORLD_MODE) {
  try {
    const worldMod = await import('./world/index.js' + new URL(import.meta.url).search); // версия как у main.js — без старого кэша
    const coarse = !!globalThis.matchMedia?.('(pointer: coarse)').matches;
    const presetId = worldMod.worldPresetId(quality, { coarse, override: urlParams.get('wq') });
    const timeOverride = urlParams.has('time') ? Number(urlParams.get('time')) : null;
    world = await worldMod.createWorld({ scene, camera, quality, presetId, timeOverride });
    for (const obj of soloEnvironment) obj.visible = false;
    for (const obj of scene.children) if (obj.isLight) obj.visible = false;
  } catch (e) {
    console.warn('Открытый мир не загрузился, остаётся тир:', e);
    world = null;
  }
}
const pvpMap = createPvpMap(scene);
let pvpEnabled = false;
let lastMySpawnSeq = 0;
const pvpPos = new THREE.Vector3();
function updatePvpWorld(room) {
  pvpEnabled = !!room && room.mode === 'pvp';
  pvpMap.setVisible(pvpEnabled);
  for (const obj of soloEnvironment) obj.visible = !pvpEnabled && !world;
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
const gfx = safeCall(gfxMod.setupGraphics, renderer, scene, { quality });
const hud = safeCall(hudMod.createHud);

// тень игрока на полу
const shadowBlob = safeCall(charMod.createShadowBlob);
if (shadowBlob) scene.add(shadowBlob);
const fx = createFx(scene, { maxParticles: quality.maxParticles });

// всплывающее сообщение: на ПК — в HUD, в шлеме — перед глазами
function notify(text, color) {
  if (renderer.xr.isPresenting) comfort?.toast?.(text, color);
  else hud?.toast(text, color);
}

const classicBoard = createScoreboard();
let board = classicBoard; // в фэнтези-режиме — каменная скрижаль
board.mesh.position.set(0, 4.2, -7);
scene.add(board.mesh);

// индикатор МК на табло: зелёный — подключён
const mkLed = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x555a66 }));
mkLed.position.set(1.85, 0.36, 0.02);
board.mesh.add(mkLed);

const classicMenu = createMenu();
let menu = classicMenu; // в фэнтези-режиме — скрижаль с выбором режима
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
const classicArsenal = new Arsenal(WEAPONS);
let arsenal = classicArsenal; // в фэнтези-бою — жезл, посох, клинок, лук, перчатка
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
const scoring = () => (state === 'play' || !!world) && !sharedArena.active; // в открытом мире очки идут всегда

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
  if (fantasy) skills?.reset?.();
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
    if (combatOn) startCombat();
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
  if (combatOn) { director.stop(); enemies.clear(); }
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
  menu.showResults({ score, best, accuracy, newRecord, top, maxCombo, wave: combatOn && director?.mode === 'waves' ? director.wave : undefined });
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
  let t = safeCall(gfxMod.createTargetVisual, type, type === 'bomb' ? 0xff2244 : color, { quality });
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
  for (let i = targets.children.length - 1; i >= 0; i--) { // с конца: удаление не сбивает обход
    const t = targets.children[i];
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
    const pts = Math.round((u.type === 'gold' ? 3 : 1) * m * (fantasy ? skills?.power || 1 : 1));
    score += pts;
    if (fantasy) skills?.addCharge?.(u.type === 'gold' ? 3 : 1);
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
  if (progressionVr?.mesh.visible) return progressionVr.targets;
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
  if (world) { if (combatOn) for (const m of enemies.meshes) hittables.push(m); return; } // в мире — только существа
  if (fantasy) {
    if (combatOn) for (const m of enemies.meshes) hittables.push(m);
    for (const r of runeSet) hittables.push(r);
    for (const c of fantasyWorld.colliders) hittables.push(c);
    return;
  }
  for (const p of plateSet) hittables.push(p);
  for (const c of staticColliders) hittables.push(c);
}

function kindOf(o) {
  if (enemyMeshSet.has(o)) return 'enemy';
  if (o.parent === targets) return 'target';
  if (plateSet.has(o) || runeSet.has(o)) return 'plate';
  if (o === menu.mesh) return 'menu';
  return 'collider';
}

const hitResult = { object: null, point: new THREE.Vector3(), distance: 0, kind: '', instanceId: undefined, projectile: null };
const hitTo = new THREE.Vector3();
function hitTest(from, dir, length, exclude) {
  bulletRay.set(from, dir);
  bulletRay.near = 0;
  bulletRay.far = length;
  const list = bulletRay.intersectObjects(hittables, false);
  let best = null;
  for (const h of list) {
    if (exclude && exclude.has(h.object)) continue;
    if (!h.object.visible) continue;
    hitResult.object = h.object;
    hitResult.point.copy(h.point);
    hitResult.distance = h.distance;
    hitResult.kind = kindOf(h.object);
    hitResult.instanceId = h.instanceId;
    hitResult.projectile = null;
    best = hitResult;
    break;
  }
  if (world) {
    // рельеф: марш по лучу шагом 1 м, затем уточнение делением пополам
    const max = best ? best.distance : length;
    let prev = 0;
    for (let t = Math.min(1, max); t <= max + 1e-6; t = Math.min(max, t + 1)) {
      hitTo.copy(from).addScaledVector(dir, t);
      if (hitTo.y < world.heightAt(hitTo.x, hitTo.z)) {
        let a = prev, b = t;
        for (let k = 0; k < 6; k++) {
          const m = (a + b) / 2;
          hitTo.copy(from).addScaledVector(dir, m);
          if (hitTo.y < world.heightAt(hitTo.x, hitTo.z)) b = m; else a = m;
        }
        hitResult.object = null; hitResult.point.copy(from).addScaledVector(dir, b); hitResult.distance = b;
        hitResult.kind = 'ground'; hitResult.instanceId = undefined; hitResult.projectile = null;
        best = hitResult;
        break;
      }
      prev = t;
      if (t >= max) break;
    }
  }
  if (combatOn) {
    // огненные шары противников можно сбить
    hitTo.copy(from).addScaledVector(dir, length);
    const ph = enemies.projectiles.hitTest(from, hitTo, 0.08);
    if (ph && (!best || ph.distance < best.distance)) {
      hitResult.object = null; hitResult.point.copy(ph.point); hitResult.distance = ph.distance;
      hitResult.kind = 'fireball'; hitResult.instanceId = undefined; hitResult.projectile = ph.projectile;
      best = hitResult;
    }
  }
  return best;
}

// попадание пули: true — пуля летит дальше (пробитие)
function onBulletHit(shot, hit) {
  const point = hit.point.clone();
  if (shot.explode) { explodeAt(point, shot.explode.radius, shot.explode.power); return false; } // огненный шар
  const near = point.distanceTo(headPos) < 30;
  switch (hit.kind) {
    case 'ground':
      if (near) sound('impact', 'ground');
      if (world) worldImpact(point, shot);
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
        notify('ПРОСТРЕЛ!', '#ff9a3c');
      }
      return !bomb;
    }
    case 'plate': {
      ballistics.spark?.(point, 'metal');
      const res = runeSet.has(hit.object) ? fantasyWorld.runes.hit(hit.object, point) : range?.hit(hit.object, point);
      const dist = res?.distance || point.distanceTo(headPos);
      sound('plateHit', point.distanceTo(headPos));
      if (!shot.hit) { shot.hit = true; if (scoring()) hits++; }
      hud?.hitMarker('plate');
      if (res?.scored && scoring()) {
        const m = addCombo(point, shot.controller);
        const pts = res.points * m;
        score += pts;
        // в оптике (поле зрения ~6°) надпись в 12 раз ближе по угловому размеру — делаем её меньше
        const popScale = scoped ? Math.max(1, dist / 40) : Math.max(1, dist / 9);
        fx.popup(point.clone().add(tmpV.set(0, 0.6 + popScale * 0.25, 0)), '+' + pts, '#ffd23f', popScale);
        notify(`+${pts} · ${res.label}`, '#ffd23f');
        mk.send('G');
        vibrate(shot.controller, 0.5, 60);
      }
      return false;
    }
    case 'fireball':
      enemies.projectiles.destroy(hit.projectile);
      fx.burst(point, 0xffa040, 10);
      playSpell('barrier-hit', { volume: 0.6 });
      return false;
    case 'enemy': {
      const r = enemies.hit(hit.object, point, { damage: shot.damage ?? 1, element: shot.element ?? null, instanceId: hit.instanceId });
      if (r && !r.blocked && !shot.hit && scoring()) { shot.hit = true; hits++; }
      scoreEnemy(r, point, shot.controller);
      if (shot.radius > 0) enemyExplode(point, shot.radius, (shot.damage ?? 1) * 0.6, shot.element);
      if (world) worldImpact(point, shot);
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

// луч выстрела: ПК — из камеры через точку экрана, VR — из дула вдоль ствола
// (ствол может быть повёрнут хватом двумя руками, поэтому берём ориентацию самой модели)
const gunQuat = new THREE.Quaternion();
function aimRay(source) {
  if (source.controller) {
    const g = handGun(source.controller);
    if (g?.muzzle && g.group.visible) {
      g.group.updateWorldMatrix(true, true);
      g.muzzle.getWorldPosition(muzzlePos);
      g.group.getWorldQuaternion(gunQuat);
      raycaster.ray.direction.set(0, 0, -1).applyQuaternion(gunQuat);
      raycaster.ray.origin.copy(muzzlePos).addScaledVector(raycaster.ray.direction, -0.05);
    } else {
      setRayFromController(source.controller);
      muzzlePos.copy(raycaster.ray.origin);
    }
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
    // «⇄ ФЭНТЕЗИ» под обычным меню в шлеме
    if (modeButton.visible && raycaster.intersectObject(modeButton, false)[0]) { setMode('fantasy'); vibrate(controller, 0.3, 40); return; }
    if (combatModeButton.visible && raycaster.intersectObject(combatModeButton, false)[0]) { cycleCombatMode(); vibrate(controller, 0.3, 40); return; }
    const hit = raycaster.intersectObject(menu.mesh, false)[0];
    const action = hit ? (menu.pick ? menu.pick(hit.uv) : 'start') : null;
    if (action === 'mode-fantasy' || action === 'mode-realism') { setMode(action === 'mode-fantasy' ? 'fantasy' : 'realism'); vibrate(controller, 0.3, 40); return; }
    if (action === 'start' && performance.now() >= menu.mesh.userData.readyAt) {
      fx.tracer(muzzlePos, hit.point, color);
      currentGun(controller)?.fire?.();
      sound('gunshot', d.id);
      vibrate(controller, 0.3, 40);
      startGame();
      return;
    }
  }

  if (combatOn && (d.action === 'bow' || d.action === 'melee')) {
    if (!controller && first) pcBowOrBlade(w, d); // на ПК: лук стреляет полным натяжением, клинок — взмах
    return; // в шлеме лук и клинок — руками
  }
  const r = w.pull(first);
  if (!r) return;
  if (w.manaFed) {
    if (r.dry) { if (w.startReload()) notify('Мана восполняется…', '#9fe7ff'); return; }
    if (r.shot) fireSpell(w, r, controller);
    return;
  }
  if (r.dry) {
    if (!w.startReload() && w.reserve <= 0) notify('НЕТ ПАТРОНОВ', '#ff5a6e');
    return;
  }

  // направление: рассеивание стрелка + пристрелка прицела
  shotOrigin.copy(raycaster.ray.origin);
  shotDir.copy(raycaster.ray.direction);
  basisFor(shotDir);
  if (controller && vrKick) shotDir.addScaledVector(basisY, vrKick).normalize();
  const steady = controller && handling?.twoHand ? handling.stability : 0; // хват двумя руками
  const ctx = { aim: Math.max(aimAmt, steady), speed: speedFrac, air: !onGround, crouch: isCrouched() };
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
    vrKick = Math.min(0.12, vrKick + toRad(k.pitch) * 0.35 * (1 - 0.6 * steady));
  } else {
    recoilP += toRad(k.pitch);
    recoilY += toRad(k.yaw);
    punch += toRad(k.punch);
    recoilT = 0;
  }
}

// звук, гильзы и подсказки по событиям оружия
function handleWeaponEvent(w, e) {
  if (w.manaFed) { fantasyWeaponEvent(e); return; }
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
    case 'overheat': sound('overheat'); notify('ПЕРЕГРЕВ!', '#ff5a6e'); break;
    case 'vent-start': case 'vented': sound('vent'); break;
    case 'mode': sound('fireMode'); notify('Режим огня: ' + (e.mode === 'auto' ? 'автоматический' : 'одиночный'), '#9fe7ff'); break;
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
  if (e.button === 0) {
    pcTrigger.held = false;
    if (combatOn && !renderer.xr.isPresenting) releaseSpell(null); // заряженный выстрел жезла
  }
  if (e.button === 2) aimHeld = false;
});

document.addEventListener('mousemove', (e) => {
  if (!locked()) return;
  const sens = 0.0022 * (userSettings.sensitivity || 1) * (camera.fov / deskFov()); // в оптике мышь медленнее
  yaw -= e.movementX * sens;
  pitch = rand.clamp(pitch - e.movementY * sens * (userSettings.invertY ? -1 : 1), -1.4, 1.4);
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
  if (progressionBridge && !progressionBridge.player.enabled) return;
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Space' && !renderer.xr.isPresenting) { e.preventDefault(); jumpRequested = true; }
  if (world && !e.repeat && castSkillKey(e.code)) return;
  if (e.code === 'KeyR') arsenal.current.startReload();
  if (e.code === 'KeyB' && !swords?.on) { if (combatOn && arsenal.current.def.id === 'staff') wpnMod.nextElement?.(arsenal.current); else arsenal.current.toggleMode?.(); }
  const digit = /^Digit([1-9])$/.exec(e.code);
  if (digit && Number(digit[1]) <= WEAPONS.length && !swords?.on) arsenal.select(Number(digit[1]) - 1);
  if (e.code === 'Enter' && !world && !sharedArena.active && (state === 'menu' || state === 'over')) startGame();
});

// кнопка «Играть» на стартовом экране (клик пользователя — можно захватить мышь)
addEventListener('game:start', () => {
  if (!renderer.xr.isPresenting) {
    try { canvas.requestPointerLock()?.catch?.(() => {}); } catch {}
  }
  if (world) return; // открытый мир без раундов: просто гуляем
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
    // Низкий пресет мира: убираем отдельные декоративные слои перчаток (−8 стереовызовов).
    if (world && quality.id === 'low') c.userData.hand?.group.traverse(o => { if (o.name === 'glove-graph' || o.name === 'glove-glow') o.visible = false; });
    if (c.userData.wrist) { c.remove(c.userData.wrist.group); c.userData.wrist = null; }
    if (side === 'left') {
      c.userData.wrist = safeCall(charMod.createWristHud);
      if (c.userData.wrist?.group) c.add(c.userData.wrist.group);
    }
    if (side === (userSettings.leftHanded ? 'left' : 'right') || !weaponHand) weaponHand = c;
  });
  c.addEventListener('disconnected', () => {
    c.userData.src = null;
    dot.visible = false;
    if (weaponHand === c) weaponHand = controllers.find((k) => k !== c && k.userData.src) || null;
  });
  c.addEventListener('selectstart', () => {
    if (progressionVr?.select(c)) { c.userData.progressionTrig = true; return; }
    // фэнтези: курок свободной руки рисует руну, у руки с оружием — ульта
    const bowString = combatOn && c !== weaponHand && arsenal.current.def.action === 'bow'; // курок свободной руки — тетива
    if ((fantasy || world) && !bowString && skills?.onTrigger?.(c, true)) { c.userData.skillTrig = true; return; }
    c.userData.trigHeld = true; c.userData.trigFirst = true;
  });
  c.addEventListener('selectend', () => {
    if (c.userData.progressionTrig) { c.userData.progressionTrig = false; return; }
    c.userData.trigHeld = false;
    if (c.userData.skillTrig) { c.userData.skillTrig = false; skills?.onTrigger?.(c, false); }
    else if (c === weaponHand) c.userData.trigReleased = true; // заряженный выстрел жезла
  });
  c.addEventListener('squeezestart', () => onSqueeze(c, true));
  c.addEventListener('squeezeend', () => onSqueeze(c, false));
  rig.add(c);
  scene.add(dot);
  return c;
});
let vrAim = false, vrCrouch = false, vrSprint = false;
// комфорт в шлеме: виньетка при движении, моргание при повороте, подсказки по кнопкам
const comfort = safeCall(comfortMod.createVrComfort, { renderer, camera, controllers });
// VR: кобуры на теле, хват двумя руками и ручная перезарядка
const holsters = safeCall(holsterMod.createVrHolsters, { camera, rig });
const handling = safeCall(handlingMod.createVrHandling, { scene, camera });

// настройки игрока (блок «Настройки» на стартовом экране)
settingsMod.buildSettingsUi?.({ qualityLabel: quality.label.toLowerCase() });
function applySettings(key) {
  if (!key || key === 'musicVolume' || key === 'sfxVolume') {
    audio.setVolumes?.({ music: userSettings.musicVolume ?? 0.7, sfx: userSettings.sfxVolume ?? 1 });
  }
  if (comfort?.settings && (!key || key === 'turn' || key === 'vignette')) {
    comfort.settings.turn = userSettings.turn === 'smooth' ? 'smooth' : 'snap';
    comfort.settings.vignette = userSettings.vignette !== false;
  }
  if (!key || key === 'leftHanded') holsters?.setLeftHanded?.(!!userSettings.leftHanded);
  if (!key || key === 'fov') placeViewModel?.();
}
settingsMod.onSettingsChange?.((key) => applySettings(key));

const offHand = () => controllers.find((k) => k !== weaponHand && k.userData.src) || null;

// хват (grip) по приоритету: кобура → свободной рукой цевьё/подсумок/затвор → прицел или перезарядка
function onSqueeze(c, down) {
  const u = c.userData;
  u.gripHeld = down;
  if (!down) {
    if (u.skill) { u.skill = false; skills?.onSqueeze?.(c, false); }
    if (u.grabbed) { handling?.release?.(c); u.grabbed = null; }
    if (c === weaponHand) vrAim = false;
    return;
  }
  const slot = userSettings.holsters !== false ? curHolsters()?.zoneOf?.(c) ?? -1 : -1;
  if (slot >= 0) {
    if (c !== weaponHand) { handling?.release?.(c); weaponHand = c; vrAim = false; }
    if (!arsenal.select(slot)) sound('draw');
    vibrate(c, 0.5, 40);
    u.grabbed = 'holster';
    return;
  }
  if (c !== weaponHand && combatOn && arsenal.current.def.action === 'bow') return; // хват свободной руки — тетива
  if (c !== weaponHand && (fantasy || world)) {
    // ладонь вверх — энергосфера, ладонь вперёд — барьер; иначе перезарядка кнопкой
    if (skills?.onSqueeze?.(c, true)) u.skill = true;
    else arsenal.current.startReload();
    return;
  }
  if (c !== weaponHand) {
    const what = handling?.grab?.(c, { gun: handGun(weaponHand), weaponHand, weapon: arsenal.current });
    if (what === 'pouch' && userSettings.vrReload === 'button') handling.release(c);
    else if (what) { u.grabbed = what; return; }
    if (userSettings.vrReload !== 'hands') arsenal.current.startReload();
    return;
  }
  vrAim = true;
}

// каждый кадр в шлеме: кобуры и действия свободной руки
function updateVrHands(dt) {
  curHolsters()?.update?.(dt, { controllers, current: arsenal.index, weaponHand, enabled: userSettings.holsters !== false });
  if (!handling) return;
  const events = handling.update(dt, {
    gun: handGun(weaponHand), weaponHand, offHand: offHand(), weapon: arsenal.current,
    enabled: arsenal.ready && !fantasy, leftHanded: !!userSettings.leftHanded,
  });
  for (const e of events || []) {
    if (e.type === 'mag-inserted' || e.type === 'shell-inserted' || e.type === 'racked') vibrate(weaponHand, 0.4, 40);
    if (e.type === 'mag-inserted' && arsenal.current.needsRack) notify('Передёрните затвор', '#ffd23f');
  }
}

// телефон и планшет: экранный джойстик, обзор пальцем, кнопки
const touch = safeCall(touchMod.createTouchControls);
touch?.onAction?.((name) => {
  if (name === 'reload') arsenal.current.startReload();
  else if (name === 'jump') jumpRequested = true;
  else if (name === 'next') arsenal.step(1);
  else if (name === 'prev') arsenal.step(-1);
  else if (name === 'mode') arsenal.current.toggleMode();
});

// ПК: оружие и рука от первого лица в правом нижнем углу
const viewModel = new THREE.Group();
camera.add(viewModel);
const vmHip = new THREE.Vector3();
const vmAds = new THREE.Vector3();
// на узком экране оружие ближе к центру, чтобы не уходило за край
function placeViewModel() {
  const halfW = Math.tan(THREE.MathUtils.degToRad(deskFov() / 2)) * camera.aspect * 0.38;
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
let pcFGuns = null; // фэнтези-оружие у камеры на ПК (открытый мир), создаётся при включении боя
const pcGun = () => (combatOn ? pcFGuns || {} : pcGuns)[arsenal.current.def.id];
const handGun = (c) => (combatOn ? c?.userData.fguns : c?.userData.guns)?.[arsenal.current.def.id] || null;
const currentGun = (controller) => (controller ? handGun(controller) : renderer.xr.isPresenting ? handGun(weaponHand) : pcGun());

// показываем только текущее оружие и только в нужной руке
function syncGunVisibility() {
  const id = arsenal.current.def.id;
  for (const [gid, g] of Object.entries(pcGuns)) g.group.visible = gid === id && !combatOn;
  for (const [gid, g] of Object.entries(pcFGuns || {})) g.group.visible = gid === id && combatOn;
  for (const c of controllers) {
    const mine = c === weaponHand;
    for (const [gid, g] of Object.entries(c.userData.guns || {})) g.group.visible = mine && gid === id && !combatOn;
    for (const [gid, g] of Object.entries(c.userData.fguns || {})) g.group.visible = mine && gid === id && combatOn;
    if (c.userData.fallback) c.userData.fallback.visible = mine;
  }
}

// лазер-указка: в меню всегда, в раунде — только у бластера
function updateControllers() {
  const laserOn = state !== 'play' || arsenal.current.def.bolt || sharedArena.active;
  for (const c of controllers) {
    const { laser, dot } = c.userData;
    const showLaser = laserOn && (!world || c !== weaponHand);
    laser.visible = showLaser;
    if (!renderer.xr.isPresenting || !c.visible || !showLaser) { dot.visible = false; continue; }
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
      if (pressed(5)) {
        if (combatOn && arsenal.current.def.elements) {
          // посох: огонь → лёд → молния
          const el = wpnMod.nextElement?.(arsenal.current);
          if (el) handGun(weaponHand)?.setElement?.(el);
        } else arsenal.step(1);
      }
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
  if (progressionBridge && !progressionBridge.player.enabled) { pcTrigger.held = pcTrigger.first = false; return; }
  if (renderer.xr.isPresenting) {
    for (const c of controllers) {
      const u = c.userData;
      if (u.trigReleased) { u.trigReleased = false; if (combatOn && c === weaponHand) releaseSpell(c); }
      if (!u.trigHeld && !u.trigFirst) continue;
      if (c !== weaponHand && u.trigFirst && !fantasy) {
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
  if (touch?.active && !renderer.xr.isPresenting) {
    const first = touch.takeFirePress();
    if (first || touch.fire) tryShoot(first, { ndc: null });
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

let turnRate = 0; // скорость искусственного поворота, рад/с (для виньетки)
function updateMovement(dt) {
  if (progressionBridge && !progressionBridge.player.enabled) { keys.clear(); return; }
  const xr = renderer.xr.isPresenting;
  move.set(0, 0);
  turnRate = 0;

  // клавиатура
  if (keys.has('KeyW') || keys.has('ArrowUp')) move.y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) move.y -= 1;
  if (keys.has('KeyD')) move.x += 1;
  if (keys.has('KeyA')) move.x -= 1;
  if (!xr) {
    if (keys.has('ArrowLeft') || (!world && keys.has('KeyQ'))) yaw += TURN_SPEED * dt;
    if (keys.has('ArrowRight') || (!world && keys.has('KeyE'))) yaw -= TURN_SPEED * dt;
  }

  // джойстик микроконтроллера
  move.x += mk.x;
  move.y += mk.y;

  // экранный джойстик на телефоне
  if (touch?.active && !xr) { move.x += touch.move.x; move.y += touch.move.y; }

  // VR: левый стик — ходьба, правый — поворот рывком на 45°
  if (xr) {
    for (const c of controllers) {
      const src = c.userData.src;
      const axes = src?.gamepad?.axes;
      if (!axes || axes.length < 4) continue;
      const sx = axes[2], sy = axes[3];
      if (src.handedness === 'left' && !(fantasy && skills?.flashAiming)) {
        if (Math.abs(sx) > 0.15) move.x += sx;
        if (Math.abs(sy) > 0.15) move.y -= sy;
      } else if (src.handedness === 'right') {
        if (comfort?.settings?.turn === 'smooth') {
          // плавный поворот: 120°/с, с мёртвой зоной
          if (Math.abs(sx) > 0.2) {
            const rate = -Math.sign(sx) * (Math.abs(sx) - 0.2) / 0.8 * 2.1;
            snapTurn(rate * dt);
            turnRate = Math.abs(rate);
          }
        } else if (!c.userData.turned && Math.abs(sx) > 0.7) {
          comfort?.onSnapTurn?.();
          snapTurn(-Math.sign(sx) * Math.PI / 4);
          c.userData.turned = true;
        } else if (Math.abs(sx) < 0.3) {
          c.userData.turned = false;
        }
      }
    }
  }
  if (move.lengthSq() > 1) move.normalize();
  // Defeated players may look around, but cannot move or leave their corpse
  // position until the server provides a new randomized spawn.
  if (sharedArena.isPvp && sharedArena.playing && !sharedArena.alive) {
    move.set(0, 0);
    vel.set(0, 0, 0);
    jumpRequested = false;
  }

  const w = arsenal.current;
  const wantCrouch = xr ? vrCrouch : keys.has('KeyC') || !!touch?.crouch;
  const shift = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const wantSprint = (xr ? vrSprint : shift || !!touch?.sprint) && move.y > 0.5 && onGround && !wantCrouch && aimAmt < 0.3 && !aimHeld && !vrAim;
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
  if (progressionBridge) speed *= 1 + (progressionBridge.state.derived?.moveSpeed || 0);
  speed *= w.def.speedMul * (1 - (1 - MOVE.ads) * aimAmt);
  const tx = (fwd.x * move.y + right.x * move.x) * speed;
  const tz = (fwd.z * move.y + right.z * move.x) * speed;
  const k = 1 - Math.exp(-(onGround ? MOVE.accel : MOVE.airAccel) * dt); // в воздухе почти без управления
  vel.x += (tx - vel.x) * k;
  vel.z += (tz - vel.z) * k;
  if (world) {
    const [bx, bz] = world.borderPush(headPos.x, headPos.z);
    vel.x += bx * dt;
    vel.z += bz * dt;
  }
  const ox = rig.position.x, oz = rig.position.z;
  rig.position.x += vel.x * dt;
  rig.position.z += vel.z * dt;
  if (world) worldStep(ox, oz);
  const r = pvpEnabled || world ? 0 : Math.hypot(rig.position.x, rig.position.z);
  const arenaR = fantasy ? FANTASY_ARENA : ARENA;
  if (r > arenaR) {
    const nx = rig.position.x / r, nz = rig.position.z / r;
    rig.position.x = nx * arenaR;
    rig.position.z = nz * arenaR;
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
  } else if (jumpRequested && (fantasy || world)) {
    skills?.onJump?.(true, tmpV.set(headPos.x, groundY + feet, headPos.z));
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
      if (world && impact > 2) world.particles.spawn(LAND_DUST, tmpV.set(headPos.x, groundY + 0.05, headPos.z), null, Math.min(2, impact / 4));
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
    if (world) rig.position.y = groundY;
    camera.position.set(
      Math.cos(walkPhase * 0.5) * bobA * 0.5,
      EYE_HEIGHT + (CROUCH_EYE - EYE_HEIGHT) * crouchAmt + feet - landDip + Math.sin(walkPhase) * bobA,
      0,
    );
  } else {
    rig.position.y = groundY + feet - crouchAmt * 0.5; // опора (пол или платформа) + прыжок − присед кнопкой X
  }
}

// заклинания и мечи открытого мира (создаются при старте мира)
let spells = null, swords = null, swordPlayer = null;
const swordState = { energy: 999, level: 1 }; // энергия мечей бесконечная — только откаты
// луч по существам (для заклинаний и мечей)
const enemyRaycaster = new THREE.Raycaster();
function raycastEnemies(ro, rd, range) {
  if (!enemies) return null;
  enemyRaycaster.set(ro, rd); enemyRaycaster.near = 0; enemyRaycaster.far = range;
  for (const h of enemyRaycaster.intersectObjects(enemies.meshes, false)) {
    if (h.object.visible) return { object: h.object, instanceId: h.instanceId, point: h.point, distance: h.distance };
  }
  return null;
}
// кадр: заклинания и мечи; рывок меча двигает игрока
const swordPrev = new THREE.Vector3();
function updateSpellsAndSwords(dt) {
  if (!world) return;
  spells?.update(dt);
  if (!swordPlayer) return;
  if (renderer.xr.isPresenting) { if (swords?.on) swords.toggle(false); return; }
  swordState.energy = 999;
  swordPlayer.pos.set(headPos.x, groundY + feet, headPos.z);
  swordPrev.copy(swordPlayer.pos);
  swordPlayer.endFrame();
  const dx = swordPlayer.pos.x - swordPrev.x, dz = swordPlayer.pos.z - swordPrev.z;
  if (dx || dz) { rig.position.x += dx; rig.position.z += dz; }
}
// пыль при приземлении в открытом мире (формат эмиттера DAMAGE_TYPE_VFX)
const LAND_DUST = { blend: 'alpha', count: 10, speed: [0.6, 1.6], spread: 85, life: [0.4, 0.8], size: [0.12, 0.45], gravity: -0.3, color: '#d9c7a3' };
// открытый мир: шаг по рельефу под головой. Склон круче 45° и глубокая вода — стена
// (скольжение вдоль неё по одной оси), с обрыва — падение, на уступ до 0,4 м — шаг вверх.
const WORLD_SLOPE = Math.tan(THREE.MathUtils.degToRad(45));
function worldStep(ox, oz) {
  const hx = headPos.x - ox, hz = headPos.z - oz; // голова внутри рига (в шлеме — где стоит игрок)
  const top = groundY + feet;
  const heightIfWalkable = (x, z) => {
    const h = world.heightAt(x + hx, z + hz);
    if (h < world.seaLevel - 1) return null; // плавания пока нет
    const rise = h - top;
    return rise > (onGround ? 0.05 + Math.hypot(x - ox, z - oz) * WORLD_SLOPE : 0.4) ? null : h;
  };
  let h = heightIfWalkable(rig.position.x, rig.position.z);
  if (h === null) {
    h = heightIfWalkable(rig.position.x, oz);
    if (h !== null) { rig.position.z = oz; vel.z = 0; }
    else {
      h = heightIfWalkable(ox, rig.position.z);
      if (h !== null) { rig.position.x = ox; vel.x = 0; }
      else { rig.position.x = ox; rig.position.z = oz; vel.x = vel.z = 0; h = world.heightAt(ox + hx, oz + hz); }
    }
  }
  // постройки аулов: выталкиваем голову из юрт и мавзолеев
  const hp = { x: rig.position.x + hx, z: rig.position.z + hz };
  world.collide(hp, 0.3);
  rig.position.x = hp.x - hx; rig.position.z = hp.z - hz;
  const lim = world.size - 1;
  rig.position.x = THREE.MathUtils.clamp(rig.position.x + hx, 1, lim) - hx;
  rig.position.z = THREE.MathUtils.clamp(rig.position.z + hz, 1, lim) - hz;
  const step = Math.hypot(rig.position.x - ox, rig.position.z - oz);
  if (onGround && top - h > 0.1 + step * WORLD_SLOPE * 1.2) {
    feet = top - h; vy = 0; onGround = false; // сошёл с обрыва
  } else if (!onGround) {
    feet = top - h;
  } else {
    feet = 0;
  }
  groundY = h;
}

// ---------- прицеливание, отдача, раскачка ----------
const scopeFov = (d) => d.scopeFov || THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(toRad(BASE_FOV / 2)) / d.zoom));
let scoped = false, lastWeaponId = null;

function updateAim(dt, time) {
  const xr = renderer.xr.isPresenting;
  const w = arsenal.current, d = w.def;
  // в прицел нельзя на бегу, при перезарядке и смене оружия
  const want = (xr ? vrAim : aimHeld || !!touch?.aim) && arsenal.ready && !w.reloading && !sprinting;
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
  const baseFov = deskFov() + 6 * sprintAmt;
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
let scopeRT = null, scopeCam = null, scopeFrame = 0, reticleTex = null;

// сетка ПСО поверх линзы: красный угольник, шкала поправок, тёмное кольцо по краю
function addLensReticle(lens) {
  if (!reticleTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const k = 128, mil = 256 / 105; // поле зрения ~6° ≈ 105 тысячных
    g.strokeStyle = 'rgba(10,10,14,0.95)';
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(k - 10 * mil, k); g.lineTo(k - 1.2 * mil, k); g.moveTo(k + 1.2 * mil, k); g.lineTo(k + 10 * mil, k); g.stroke();
    for (let i = -10; i <= 10; i++) {
      if (!i) continue;
      const h = i % 5 ? 2.5 : 5;
      g.beginPath(); g.moveTo(k + i * mil, k); g.lineTo(k + i * mil, k + h); g.stroke();
    }
    g.beginPath(); g.moveTo(k, k + 4 * mil); g.lineTo(k, k + 24 * mil); g.stroke();
    const chevron = (y, s, color) => {
      g.strokeStyle = color;
      g.beginPath(); g.moveTo(k - s, y + s * 1.4); g.lineTo(k, y); g.lineTo(k + s, y + s * 1.4); g.stroke();
    };
    g.lineWidth = 2.2;
    chevron(k, 3 * mil, '#ff3b30');
    g.lineWidth = 1.4;
    for (let i = 1; i <= 3; i++) chevron(k + i * mil * 1.6, 1.4 * mil, 'rgba(10,10,14,0.95)');
    const ring = g.createRadialGradient(k, k, k * 0.82, k, k, k);
    ring.addColorStop(0, 'rgba(0,0,0,0)');
    ring.addColorStop(1, 'rgba(0,0,0,0.85)');
    g.fillStyle = ring;
    g.fillRect(0, 0, 256, 256);
    reticleTex = new THREE.CanvasTexture(c);
    reticleTex.colorSpace = THREE.SRGBColorSpace;
  }
  lens.geometry.computeBoundingSphere();
  const r = lens.geometry.boundingSphere.radius;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2),
    new THREE.MeshBasicMaterial({ map: reticleTex, transparent: true, depthWrite: false, toneMapped: false }));
  m.position.z = 0.0004; // чуть ближе к глазу, чем изображение
  m.renderOrder = 5;
  lens.add(m);
  return m;
}
const lensPos = new THREE.Vector3();
function renderScopeLens() {
  const g = handGun(weaponHand);
  if (!g?.lens || !g.group.visible) return;
  // вторая отрисовка сцены дорогая: каждый кадр — только когда прицел у глаза, иначе изредка
  g.lens.getWorldPosition(lensPos);
  const nearEye = lensPos.distanceToSquared(headPos) < 0.3 * 0.3;
  if (!nearEye && scopeFrame++ % 8 !== 0) return;
  if (!scopeRT) {
    scopeRT = new THREE.WebGLRenderTarget(quality.scopeRes, quality.scopeRes);
    scopeCam = new THREE.PerspectiveCamera(scopeFov(arsenal.current.def), 1, 1.2, 300); // поле зрения прицела 7×
  }
  scopeCam.position.copy(lensPos);
  g.group.getWorldQuaternion(scopeCam.quaternion); // по стволу: учитывает хват двумя руками
  if (g.lens.material.map !== scopeRT.texture) { g.lens.material.map = scopeRT.texture; g.lens.material.color?.set(0xffffff); g.lens.material.needsUpdate = true; }
  if (!g.lens.userData.reticle) g.lens.userData.reticle = addLensReticle(g.lens);
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

function returnToSoloMenu() {
  ballistics.clear(); clearTargets(); music.stop(); countdown = 0; timeLeft = ROUND_TIME; elapsed = 0;
  setState('menu'); menu.mesh.visible = true; menu.showStart(ROUND_TIME, fantasy ? 'fantasy' : 'realism');
  menu.mesh.userData.readyAt = performance.now() + 300;
}
function resetSessionInput() {
  keys.clear(); pcTrigger.held = pcTrigger.first = false; mkTrigger.first = false;
  aimHeld = vrAim = vrSprint = vrCrouch = jumpRequested = false; vel.set(0, 0, 0);
  bowCtl?.cancel?.(); melee?.reset?.(); if (arsenal.current.manaFed) arsenal.current.charging = null;
  for (const c of controllers) {
    const u = c.userData;
    u.trigHeld = u.trigFirst = u.trigReleased = u.skillTrig = u.progressionTrig = false;
    u.gripHeld = u.skill = u.turned = false; u.prevButtons.fill(false);
    if (u.grabbed) { handling?.release?.(c); u.grabbed = null; }
  }
}
// после выхода из VR возвращаем камеру в «рост»
renderer.xr.addEventListener('sessionstart', () => {
  resetSessionInput();
  if (progressionBridge?.api.menuOpen) progressionBridge.api.closeMenu();
  try { document.exitPointerLock?.(); } catch {}
  // фиксированный фовеальный рендер: края кадра в шлеме рисуются в меньшем разрешении
  try { renderer.xr.setFoveation(quality.foveation); } catch {}
  frameStats.reset();
  viewModel.visible = false; // в шлеме оружие в руках, а не у камеры
  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
  camera.fov = deskFov();
  camera.updateProjectionMatrix();
  touch?.setVisible?.(false);
  const enterFantasy = wantFantasy();
  if (enterFantasy && !fantasy && (state === 'play' || state === 'countdown')) returnToSoloMenu();
  setFantasy(enterFantasy);
  emit('game:xr', { active: true });
});
renderer.xr.addEventListener('sessionend', () => {
  resetSessionInput();
  const wasFantasy = fantasy;
  setFantasy(false);
  if (wasFantasy && !world && !sharedArena.active) returnToSoloMenu();
  viewModel.visible = hasGuns;
  rig.position.y = world ? groundY : 0;
  camera.position.set(0, EYE_HEIGHT, 0);
  touch?.setVisible?.(true);
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

// ---------- фэнтези-режим «Арена магов» (только в шлеме) ----------
// Остров вместо неоновой арены, скрижали вместо табло и меню, наруч вместо наручного экрана,
// оркестровая музыка, мана и навыки. ПК, телефон и мультиплеер остаются в реализме.
const FANTASY_ARENA = 15; // остров шире неоновой арены
const fantasyWorld = safeCall(fworldMod.createFantasyWorld, scene, { quality });
const fantasyBoard = safeCall(fuiMod.createFantasyBoard);
const fantasyMenu = safeCall(fuiMod.createFantasyMenu);
const bracer = safeCall(fbracerMod.createBracer);
const playSpell = (name, opts) => { try { return faudioMod.playSpell?.(name, opts) ?? null; } catch { return null; } };
const fantasyAvailable = !!(fantasyWorld && fantasyBoard && fantasyMenu);
const runeSet = new Set(fantasyWorld?.runes?.meshes || []);
if (fantasyBoard) { fantasyBoard.mesh.visible = false; fantasyBoard.mesh.position.copy(classicBoard.mesh.position); scene.add(fantasyBoard.mesh); }
if (fantasyMenu) {
  fantasyMenu.mesh.visible = false;
  fantasyMenu.mesh.userData.readyAt = 0;
  fantasyMenu.mesh.position.copy(classicMenu.mesh.position);
  scene.add(fantasyMenu.mesh);
  fantasyMenu.showStart(ROUND_TIME, 'fantasy');
}
if (bracer?.group) bracer.group.visible = false;

let fantasy = false;      // сейчас идёт фэнтези-режим
let groundY = 0;          // высота опоры под ногами: пол острова или верх платформы
let hitstopT = 0;         // стоп-кадр: мир замирает на долю секунды
const fxA = new THREE.Vector3();
const fxB = new THREE.Vector3();

function wantFantasy() {
  return renderer.xr.isPresenting && fantasyAvailable && userSettings.mode !== 'realism' && !sharedArena.active && !world;
}

// кнопка «⇄ ФЭНТЕЗИ» под обычным меню: вернуться из реализма, не снимая шлем
const modeButton = (() => {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(20,12,48,0.92)';
  g.beginPath(); g.roundRect(4, 4, 504, 120, 40); g.fill();
  g.lineWidth = 6; g.strokeStyle = '#b48cff'; g.stroke();
  g.fillStyle = '#ffd23f'; g.font = 'bold 54px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('⇄ ФЭНТЕЗИ', 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.225), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
  m.visible = false;
  scene.add(m);
  return m;
})();
function updateModeButton() {
  const show = renderer.xr.isPresenting && fantasyAvailable && !fantasy && !sharedArena.active && menu.mesh.visible && (state === 'menu' || state === 'over');
  modeButton.visible = show;
  if (!show) return;
  modeButton.position.copy(menu.mesh.position);
  modeButton.position.y -= 0.85;
  modeButton.quaternion.copy(menu.mesh.quaternion);
}

function setMode(mode) {
  userSettings.mode = mode === 'realism' ? 'realism' : 'fantasy';
  settingsMod.setSetting?.('mode', userSettings.mode);
  setFantasy(wantFantasy());
  notify(userSettings.mode === 'fantasy' ? 'Режим: Арена магов' : 'Режим: реализм', '#b48cff');
}

function setFantasy(on) {
  on = !!on && fantasyAvailable;
  if (on === fantasy) return;
  fantasy = on;
  // мир: остров вместо неоновой арены
  for (const obj of soloEnvironment) obj.visible = !on && !pvpEnabled && !world;
  fantasyWorld?.setVisible(on);
  // табло и меню: новые встают туда, где были старые
  const prevMenu = menu, prevBoard = board;
  menu = on ? fantasyMenu : classicMenu;
  board = on ? fantasyBoard : classicBoard;
  menu.mesh.position.copy(prevMenu.mesh.position);
  menu.mesh.quaternion.copy(prevMenu.mesh.quaternion);
  board.mesh.position.copy(prevBoard.mesh.position);
  board.mesh.quaternion.copy(prevBoard.mesh.quaternion);
  menu.mesh.visible = prevMenu.mesh.visible;
  prevMenu.mesh.visible = false;
  prevBoard.mesh.visible = false;
  board.mesh.visible = true;
  menu.mesh.userData.readyAt = prevMenu.mesh.userData.readyAt || 0;
  if (state === 'menu' || state === 'over') menu.showStart(ROUND_TIME, on ? 'fantasy' : 'realism');
  // музыка
  const playing = state === 'play' || state === 'countdown';
  music.stop();
  music = on && faudioMod.fantasyMusic ? faudioMod.fantasyMusic : classicMusic;
  if (playing) { music.start(); music.setIntensity(lastIntensity > 0 ? lastIntensity : 0.35); }
  // наруч вместо наручного экрана
  for (const c of controllers) if (c.userData.wrist?.group) c.userData.wrist.group.visible = !on;
  if (bracer?.group) bracer.group.visible = on;
  skills?.setEnabled?.(on);
  if (on) skills?.reset?.();
  groundY = 0; feet = 0; vy = 0; onGround = true;
  setCombat(on);
}

function attachBracer() {
  if (!bracer?.group) return;
  const left = controllers.find((c) => c.userData.src?.handedness === 'left');
  if (left && bracer.group.parent !== left) left.add(bracer.group);
}

// мир замедляется навыком «Ускорение восприятия» и замирает при стоп-кадре; игрок — нет
function worldDt(dt) {
  if (hitstopT > 0) { hitstopT -= dt; return 0; }
  return (fantasy || world) && skills ? dt * skills.timeScale : dt;
}

// опора под ногами: верх платформы или пол острова; сошёл с края — падаешь
function supportAt(x, z) {
  let h = 0;
  for (const p of fantasyWorld?.platforms || []) {
    const dx = x - p.position.x, dz = z - p.position.z, r = p.radius + 0.25;
    if (dx * dx + dz * dz <= r * r) h = Math.max(h, p.position.y);
  }
  return h;
}
function updateSupport() {
  const sup = supportAt(headPos.x, headPos.z);
  if (sup < groundY - 0.05) {
    feet += groundY - sup;
    groundY = sup;
    onGround = false;
  }
}

// перенос игрока: голова встаёт над точкой, опора — её высота
function moveHeadTo(p) {
  rig.position.x += p.x - headPos.x;
  rig.position.z += p.z - headPos.z;
  groundY = p.y;
  feet = 0; vy = 0; onGround = true;
  vel.set(0, 0, 0);
  updateHead();
}

// урон навыками по мишеням (бомбы не трогаем); test(центр, радиус мишени)
const skillPoint = new THREE.Vector3();
function skillDamage(test) {
  if (!scoring()) return 0;
  let n = 0;
  for (let i = targets.children.length - 1; i >= 0; i--) {
    const t = targets.children[i];
    if (t.userData.type === 'bomb' || !test(t.position, t.userData.radius)) continue;
    n++;
    hitTarget(t, skillPoint.copy(t.position), weaponHand);
  }
  if (n) hits++;
  return n;
}
// расстояние от точки до отрезка луча
function rayDist(o, d, len, p) {
  const t = rand.clamp(fxA.subVectors(p, o).dot(d), 0, len);
  return fxB.copy(o).addScaledVector(d, t).distanceTo(p);
}
// молния: до count ближайших мишеней в конусе ~37°
function skillLightning(origin, dir, count, range) {
  if (!scoring()) return [];
  const list = targets.children
    .filter((t) => t.userData.type !== 'bomb' && t.position.distanceTo(origin) < range &&
      fxA.subVectors(t.position, origin).normalize().dot(dir) > 0.8)
    .sort((a, b) => a.position.distanceToSquared(origin) - b.position.distanceToSquared(origin))
    .slice(0, count);
  const points = list.map((t) => t.position.clone());
  list.forEach((t, i) => hitTarget(t, points[i], weaponHand));
  if (list.length) hits++;
  return points;
}
// взрыв по области (огненные снаряды с пометкой explode)
function explodeAt(point, radius, power = 1) {
  fx.shockwave?.(point, 0x8fd8ff);
  fx.burst(point, 0x9fe7ff, Math.round(14 + 14 * power));
  playSpell('enemy-die', { distance: point.distanceTo(headPos) });
  if (skillDamage((p, rad) => p.distanceTo(point) < radius + rad)) hitstopT = Math.max(hitstopT, 0.06);
}

// навыки «Арены магов»: мир, мишени и перемещение — через hooks
const skills = safeCall(skillsMod.createSkills, {
  scene, camera, quality,
  hooks: {
    teleport: (p) => moveHeadTo(p),
    skyJump() { vy = Math.sqrt(2 * MOVE.gravity * 0.8); onGround = false; },
    blink() { comfort?.onSnapTurn?.(); },
    damageSphere: (c, r) => (combatOn ? enemyExplode(c, r, 3 * (skills?.power || 1), 'rune') : skillDamage((p, rad) => p.distanceTo(c) < r + rad)),
    damageRay: (o, d, len, r) => (combatOn ? enemyRay(o, d, len, r) : skillDamage((p, rad) => rayDist(o, d, len, p) < r + rad)),
    lightning: (o, d, n, range) => (combatOn ? enemyLightning(o, d, n, range) : skillLightning(o, d, n, range)),
    hitTest: (from, dir, len) => hitTest(from, dir, len, null),
    hitstop(sec) { hitstopT = Math.max(hitstopT, Math.min(0.08, sec)); },
    sound: playSpell, notify, vibrate,
    projectiles: () => (combatOn ? enemies?.projectiles || null : null),
    surfaces: () => ({ radius: FANTASY_ARENA, platforms: fantasyWorld?.platforms || [] }),
    // открытый мир: земля по рельефу, встать можно на суше на пологом склоне
    groundAt: world ? world.heightAt : null,
    canStand: world ? (x, z) => world.heightAt(x, z) > world.seaLevel - 0.5 && world.normalAt(x, z).y > 0.7 : null,
  },
});

// ПК в открытом мире: навыки по клавишам (в шлеме — жестами, как на арене)
const SKILL_KEYS = {
  KeyQ: ['orb', 'Сфера'], KeyE: ['ki', 'Волна ки'], KeyV: ['flash', 'Шаг'], KeyX: ['focus', 'Восприятие'],
  KeyZ: ['ult', 'Ульта'], KeyR: ['fireball', 'Огненный шар'], KeyT: ['lightning', 'Молния'], KeyH: ['shield', 'Щит'],
};
const SKILL_CD_ID = { fireball: 'rune', lightning: 'rune', shield: 'rune' };
const skillDir = new THREE.Vector3();
function castSkillKey(code) {
  const k = SKILL_KEYS[code];
  if (!k || !skills?.castKey || renderer.xr.isPresenting || spells?.state !== undefined && spells.state !== 'idle') return false;
  camera.getWorldDirection(skillDir);
  if (!skills.castKey(k[0], { headPos, dir: skillDir, feetY: groundY + feet })) {
    const left = skills.cooldown?.(SKILL_CD_ID[k[0]] || k[0]) || 0;
    if (left > 0.05) notify(`${k[1]}: ещё ${left.toFixed(1)} с`, '#9fe7ff');
  }
  return true;
}

const skillCtx = { left: null, right: null, weaponHand: null, headPos, fwd, airborne: false, feetY: 0 };
function updateFantasy(dt) {
  if (!fantasy && !world) return;
  if (fantasy) attachBracer();
  skillCtx.left = skillCtx.right = null;
  for (const c of controllers) {
    const h = c.userData.src?.handedness;
    if (h === 'left' || h === 'right') skillCtx[h] = c;
  }
  skillCtx.weaponHand = weaponHand;
  skillCtx.airborne = !onGround;
  skillCtx.feetY = groundY + feet;
  skills?.update?.(dt, skillCtx);
  if (fantasy) updateSupport(); // платформы острова — только на арене
}

// наруч: мана, навыки, ульта, оружие, очки, FPS
const bracerInfo = { mana: 0, maxMana: 100, skills: [], ult01: 0, score: 0, timeLeft: 0, weapon: { name: '', mana01: 1 }, fps: 0 };
function updateBracer() {
  if (!bracer || !fantasy) return;
  const w = arsenal.current;
  bracerInfo.mana = skills ? Math.round(skills.mana) : 0;
  bracerInfo.maxMana = skills?.maxMana ?? 100;
  bracerInfo.skills = skills?.skillStatus?.() || bracerInfo.skills;
  bracerInfo.ult01 = skills?.ult01 ?? 0;
  bracerInfo.score = score;
  bracerInfo.timeLeft = timeLeft;
  bracerInfo.weapon.name = w.def.short || w.def.name;
  bracerInfo.weapon.mana01 = w.manaFed ? w.mana01 : w.energy ? 1 - w.heat : (w.mag + w.chamber) / (w.def.mag + 1);
  bracerInfo.fps = Math.round(1 / Math.max(1e-3, frameStats.ema));
  bracer.update(bracerInfo);
}

// ---------- бой «Арены магов»: фэнтези-оружие, противники, волны ----------
const fantasyArsenal = safeCall(wpnMod.createFantasyArsenal);
const enemies = safeCall(enemiesMod.createEnemies, scene, { quality, groundAt: world ? world.heightAt : undefined });
const director = enemies ? safeCall(wavesMod.createWaveDirector, enemies, { roundTime: ROUND_TIME }) : null;
const bowCtl = safeCall(bowMod.createBowController);
const melee = safeCall(meleeMod.createMelee);
const slashes = safeCall(meleeMod.createSlashWaves, scene, { quality });
const COMBAT_MODES = wavesMod.MODES || [{ id: 'trial', name: 'Испытание духов' }];
const combatReady = !!(fantasyArsenal && enemies && director && fmodelsMod.createFantasyGun);
let combatOn = false;   // в руках фэнтези-оружие, вместо кристаллов — противники
let combatModeIdx = 0;
let bowWasNocked = false;
enemies?.setVisible?.(false);
const enemyMeshSet = new Set();
const ENEMY_COLORS = { wisp: 0xbfefff, fairy: 0xffd34a, skull: 0xb05cff, guardian: 0x7fd8ff, eye: 0xff8a3a, boss: 0xff5a1f };
// кобуры фэнтези-оружия: те же места, свои названия
const fantasyHolsters = combatReady ? safeCall(holsterMod.createVrHolsters, { camera, rig, slots: [
  { index: 0, name: 'Жезл', place: 'hip-right' }, { index: 4, name: 'Перчатка', place: 'hip-left' },
  { index: 1, name: 'Посох', place: 'shoulder-right' }, { index: 3, name: 'Лук', place: 'shoulder-left' },
  { index: 2, name: 'Клинок', place: 'back' },
] }) : null;
const curHolsters = () => (combatOn && fantasyHolsters ? fantasyHolsters : holsters);

function buildFantasyGunSet(parent) {
  const set = {};
  for (const d of wpnMod.FANTASY_WEAPONS || []) {
    // процедурные модели: у GLB-лука не натягивается тетива
    const g = safeCall(fmodelsMod.createFantasyGun, d.id, { color: d.color, quality, glb: false });
    if (!g?.group) continue;
    g.group.visible = false;
    parent.add(g.group);
    set[d.id] = g;
  }
  return set;
}
function ensureFantasyGuns() {
  for (const c of controllers) if (c.userData.src && !c.userData.fguns) c.userData.fguns = buildFantasyGunSet(c);
}

function setCombat(on) {
  on = !!on && combatReady;
  if (on === combatOn) return;
  combatOn = on;
  arsenal = on ? fantasyArsenal : classicArsenal;
  if (on) { ensureFantasyGuns(); pcFGuns ||= buildFantasyGunSet(viewModel); }
  melee?.reset?.();
  bowCtl?.cancel?.();
  director?.stop?.();
  enemies?.clear?.();
  enemies?.setVisible?.(on);
  enemyMeshSet.clear();
  if (on) { for (const m of enemies.meshes) enemyMeshSet.add(m); clearTargets(); }
  lastWeaponId = null;
}

function startCombat() {
  const mode = COMBAT_MODES[combatModeIdx]?.id || 'trial';
  director.start(mode);
  enemies.setVisible(true);
}

// кнопка выбора режима боя под скрижалью меню
const combatModeButton = (() => {
  const c = document.createElement('canvas');
  c.width = 768; c.height = 128;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.225), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
  m.visible = false;
  m.userData.draw = () => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 768, 128);
    g.fillStyle = 'rgba(20,12,48,0.92)';
    g.beginPath(); g.roundRect(4, 4, 760, 120, 40); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#ffd23f'; g.stroke();
    g.fillStyle = '#ffe9a8'; g.font = 'bold 50px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('⚔ ' + (COMBAT_MODES[combatModeIdx]?.name || 'Испытание духов') + '  ⇄', 384, 66);
    tex.needsUpdate = true;
  };
  m.userData.draw();
  scene.add(m);
  return m;
})();
function updateCombatModeButton() {
  const show = combatOn && menu.mesh.visible && (state === 'menu' || state === 'over');
  combatModeButton.visible = show;
  if (!show) return;
  combatModeButton.position.copy(menu.mesh.position);
  combatModeButton.position.y -= 0.85;
  combatModeButton.quaternion.copy(menu.mesh.quaternion);
}
function cycleCombatMode() {
  combatModeIdx = (combatModeIdx + 1) % COMBAT_MODES.length;
  combatModeButton.userData.draw();
  notify('Бой: ' + COMBAT_MODES[combatModeIdx].name, '#ffd23f');
}

// выстрел заклинанием: рассеивание, снаряд по баллистике, противники уворачиваются
const spellDir = new THREE.Vector3();
function launchSpell(origin, dir, p, halfDeg, controller) {
  if (halfDeg > 0) {
    basisFor(dir);
    const [a, b] = sampleSpread(halfDeg);
    dir.addScaledVector(basisX, a).addScaledVector(basisY, b).normalize();
  }
  const shot = { pending: 1, hit: false, kills: 0, round: scoring(), controller, damage: p.damage, element: p.element, radius: p.radius || 0 };
  if (shot.round) shots++;
  ballistics.fire({
    origin, dir, speed: p.speed, drag: p.drag ?? 0, gravity: p.gravity ?? 0, penetration: p.penetration ?? 0,
    visualFrom: origin, color: p.color, tracer: !p.bolt, bolt: !!p.bolt, maxRange: p.maxRange ?? 200, shot,
  });
  enemies?.threat?.(origin, dir);
}
function fireSpell(w, r, controller) {
  spellDir.copy(raycaster.ray.direction);
  launchSpell(muzzlePos, spellDir, wpnMod.shotParams(w, r), w.spread({ aim: Math.max(aimAmt, 0.6) }), controller);
  currentGun(controller)?.fire?.();
  playSpell(r.charge ? 'cast-orb' : 'cast-bolt');
  vibrate(controller, 0.35, 40);
}
// отпускание курка: заряженный выстрел жезла
function releaseSpell(c) {
  const w = arsenal.current;
  if (!w.manaFed || !arsenal.ready || !w.release) return;
  aimRay({ controller: c });
  const r = w.release();
  if (r?.shot) fireSpell(w, r, c);
}

// очки за противников
function addScore(points, point, controller, type, weak) {
  if (!scoring()) return;
  if (points < 0) {
    score = Math.max(0, score + points);
    combo = 0; lastMult = 1;
    fx.popup(point, String(points), '#ff5a7a');
    playSpell('skull');
    mk.send('B');
    vibrate(controller, 1, 200);
    return;
  }
  const m = addCombo(point, controller);
  const pts = Math.round(points * m * (skills?.power || 1));
  score += pts;
  skills?.addCharge?.(points >= 5 ? 3 : 1);
  fx.burst(point, ENEMY_COLORS[type] ?? 0xffe27a, 18);
  fx.popup(point, '+' + pts + (weak ? ' руна!' : ''), '#ffe27a');
  playSpell(type === 'fairy' ? 'fairy' : 'enemy-die');
  mk.send(points >= 3 ? 'G' : 'H');
  vibrate(controller, 0.7, 70);
}
function scoreEnemy(r, point, controller) {
  if (!r || !scoring()) return;
  if (r.blocked) { fx.burst(point, 0x9a9aa8, 5); playSpell('barrier-hit', { volume: 0.5 }); return; }
  if (!r.killed) { fx.burst(point, 0xffffff, 4); playSpell('enemy-hit'); vibrate(controller, 0.4, 30); return; }
  progressionBridge?.killed(r.enemy);
  addScore(r.points, point, controller, r.type, r.weakPoint);
}
// урон навыками по противникам
function enemyExplode(center, radius, damage, element) {
  const res = enemies?.explode?.(center, radius, { damage, element });
  let n = 0;
  if (res) for (const r of res) { scoreEnemy(r, r.position || center, weaponHand); if (r.killed) n++; }
  return n;
}
function enemyRay(o, d, len, r) {
  let n = 0;
  const step = Math.max(1, r * 1.5);
  for (let t = step * 0.5; t < Math.min(len, 60); t += step) n += enemyExplode(fxA.copy(o).addScaledVector(d, t), r, 2 * (skills?.power || 1), 'rune');
  return n;
}
function enemyLightning(o, d, count, range) {
  const c = fxB.copy(o).addScaledVector(d, Math.min(range, 10) * 0.5);
  const res = enemies?.explode?.(c, 4, { damage: 2, element: 'lightning' }) || [];
  const pts = [];
  for (const r of res.slice(0, count)) {
    scoreEnemy(r, r.position || c, weaponHand);
    if (r.position) pts.push(r.position.clone());
  }
  return pts;
}

// звуки и подсказки по событиям фэнтези-оружия
function fantasyWeaponEvent(e) {
  switch (e.type) {
    case 'dry': playSpell('rune-fail'); break;
    case 'mana-empty': notify('Мана оружия кончилась — левый хват', '#9fe7ff'); break;
    case 'charge-start': playSpell('charge', { volume: 0.6 }); break;
    case 'charge-full': vibrate(weaponHand, 0.3, 30); break;
    case 'reload-start': case 'mana-restore': playSpell('mana-restore'); break;
    case 'element-switch': playSpell('element-switch', { element: e.element }); break;
  }
}

function onEnemyEvent(e) {
  switch (e.type) {
    case 'fireball': playSpell('fireball', { distance: e.origin ? e.origin.distanceTo(headPos) : 10 }); break;
    case 'charge': playSpell('charge', { volume: 0.5 }); break;
    case 'player-hit': {
      const hp = world ? worldDamage(e.damage ?? 1) : director.damagePlayer(e.damage ?? 1);
      for (const c of controllers) vibrate(c, 1, 120);
      notify(`♥ ${Math.ceil(hp)} / ${world ? worldMaxHp() : director.maxHp}`, '#ff5a6e');
      playSpell('enemy-hit');
      combo = 0; lastMult = 1;
      break;
    }
    case 'killed': case 'projectile-hit':
      if (e.type === 'killed' || e.killed) progressionBridge?.killed(e.enemy);
      if (e.points && (e.killed ?? true)) addScore(e.points, e.position || headPos, weaponHand, e.enemy?.type);
      break;
    case 'burst': if (e.position) fx.burst(e.position, e.color ?? 0xffa040, 12); break;
    case 'chain': if (e.from && e.to) fx.tracer(e.from, e.to, 0xd8a0ff); break;
    case 'boss-roar': playSpell('boss-roar'); break;
    case 'boss-phase': playSpell('boss-roar'); notify('КОЛОСС В ЯРОСТИ!', '#ff7a2a'); break;
  }
}
function onDirectorEvent(e) {
  if (e.label) notify(e.label, e.type === 'defeat' ? '#ff5a7a' : '#ffd23f');
  if (e.type === 'wave-start' || e.type === 'boss') playSpell('level-up');
  if ((e.type === 'victory' || e.type === 'defeat') && state === 'play') endGame();
}

// каждый кадр: лук, клинок, модель оружия, противники и волны
const palmLocal = new THREE.Vector3(0, -0.055, 0.075);
const drawPos = new THREE.Vector3();
const headDirV = new THREE.Vector3();
function updateCombat(dt, wdt) {
  if (!combatOn) return;
  ensureFantasyGuns();
  const w = arsenal.current, def = w.def, g = renderer.xr.isPresenting ? handGun(weaponHand) : pcGun();
  camera.getWorldDirection(headDirV);
  const ts = dt > 0 ? wdt / dt : 1;
  if (renderer.xr.isPresenting && g && weaponHand && arsenal.ready) {
    if (def.action === 'bow' && bowCtl) {
      const off = offHand();
      if (off) off.localToWorld(drawPos.copy(palmLocal));
      const rel = bowCtl.update(dt, { bow: g, bowHand: weaponHand, drawHand: off ? drawPos : null, drawing: !!(off?.userData.trigHeld || off?.userData.gripHeld) });
      if (bowCtl.nocked && !bowWasNocked) playSpell('bow-draw');
      bowWasNocked = !!bowCtl.nocked;
      if (rel) {
        const r = wpnMod.bowRelease(w, rel.power);
        if (r) {
          spellDir.copy(rel.dir);
          launchSpell(rel.origin, spellDir, wpnMod.shotParams(w, r, rel.power), w.spread({ aim: 1 }), weaponHand);
          g.fire?.();
          playSpell('bow-release');
          vibrate(weaponHand, 0.6, 50);
        }
      }
    } else if (def.action === 'melee' && melee) {
      const hits = melee.update(dt, { blade: g, hand: weaponHand, hittables: enemies.meshes });
      for (const h of hits) {
        const r = enemies.hit(h.object, h.point, { damage: def.swing.damage * (0.5 + h.strength), instanceId: h.instanceId });
        scoreEnemy(r, h.point, weaponHand);
        playSpell('sword-hit');
        vibrate(weaponHand, 0.8, 60);
      }
      if (melee.wave && wpnMod.bladeWave(w, melee.wave.power)) { slashes?.spawn?.(melee.wave, def.wave); playSpell('sword-swing', { volume: 1.2 }); }
      if (melee.tipSpeed > def.swing.minSpeed) {
        const ph = enemies.projectiles.hitTest(melee.segment.from, melee.segment.to, 0.12);
        if (ph) { enemies.projectiles.deflect(ph.projectile, headDirV); fx.burst(ph.point, 0x7fd8ff, 12); playSpell('barrier-hit'); }
      }
    }
  }
  g?.update?.(dt, { mana01: w.mana01, charge01: w.charge01 ?? 0, element: w.element, draw01: bowCtl?.draw01 ?? 0, moving: Math.min(1, speedFrac), aim: aimAmt });
  if (director.running || enemies.count) {
    for (const e of enemies.update(dt, { headPos, headDir: headDirV, timeScale: ts })) onEnemyEvent(e);
    for (const e of director.update(dt, { timeScale: ts })) onDirectorEvent(e);
  }
  slashes?.update?.(dt, {
    hittables: enemies.meshes, timeScale: ts,
    onHit: (h) => scoreEnemy(enemies.hit(h.object, h.point, { damage: h.damage, instanceId: h.instanceId }), h.point, weaponHand),
  });
}

// ---------- открытый мир: существа по биомам, здоровье игрока, вспышки попаданий ----------
function worldMaxHp() { return progressionBridge?.state.hpMax || 150; }
const WORLD_SPAWNS = {
  b_meadow: ['wisp', 'wisp', 'fairy'], b_forest: ['wisp', 'fairy', 'guardian'], b_swamp: ['skull', 'wisp', 'eye'],
  b_mountains: ['guardian', 'eye', 'wisp'], b_desert_ruins: ['eye', 'guardian', 'skull'], b_volcano: ['eye', 'skull', 'guardian'],
};
const WORLD_CAP = { wisp: 4, fairy: 1, skull: 2, guardian: 1, eye: 2 };
const WORLD_CRATER = { x: 1390, z: 320 }; // кальдера: здесь живёт колосс
let worldHp = 150, worldHurtT = 0, worldSpawnT = 3, worldBossCd = 0;
function updateWorldCreatures(dt) {
  if (!world || !combatOn || !enemies || SPECTATE) return;
  if (progressionBridge) worldHp = progressionBridge.state.hp;
  worldHurtT -= dt;
  if (worldHurtT <= 0 && worldHp < worldMaxHp()) worldHp = Math.min(worldMaxHp(), worldHp + dt * 0.5);
  if (progressionBridge) progressionBridge.state.hp = worldHp;
  worldBossCd -= dt;
  if ((worldSpawnT -= dt) > 0) return;
  worldSpawnT = 2.5 + Math.random() * 2.5;
  // колосс — у кальдеры вулкана, раз в 3 минуты
  const bossBiome = progressionBridge?.bossBiome() || (world.biome === 'b_volcano' && Math.hypot(headPos.x - WORLD_CRATER.x, headPos.z - WORLD_CRATER.z) < 160 ? 'b_volcano' : null);
  if (bossBiome && worldBossCd <= 0 && spawnWorldCreature('boss', bossBiome)) {
    worldBossCd = 180;
    notify(progressionBridge.bossTitle(bossBiome) + ' — босс пробудился!', '#ff7a2a');
    playSpell('boss-roar');
    return;
  }
  const list = WORLD_SPAWNS[world.biome] || WORLD_SPAWNS.b_meadow;
  const type = list[Math.floor(Math.random() * list.length)];
  if (enemies.count < 8 && enemies.countOf(type) < WORLD_CAP[type]) spawnWorldCreature(type);
}
function spawnWorldCreature(type, biome = world.biome) { return progressionBridge?.bindEnemy(enemies.spawn(type), biome) || null; }
// урон игроку; при нуле — возвращение в Рассветный Брод
function worldDamage(dmg) {
  if (progressionBridge) { worldHp = progressionBridge.state.hp; progressionBridge.state.lastHit++; }
  worldHp -= dmg;
  worldHurtT = 4;
  if (worldHp <= 0) {
    worldHp = worldMaxHp();
    enemies.clear();
    moveHeadTo(new THREE.Vector3(world.spawn.x, world.spawn.y, world.spawn.z));
    notify('Вы пали — возвращение в Рассветный Брод', '#ff5a7a');
  }
  if (progressionBridge) progressionBridge.state.hp = worldHp;
  return worldHp;
}
// вспышка попадания по стихии заклинания (формат DAMAGE_TYPE_VFX)
const ELEMENT_VFX = { fire: 'fire', ice: 'frost', lightning: 'lightning', rune: 'arcane' };
function worldImpact(point, shot) {
  const v = world.vfx?.[ELEMENT_VFX[shot.element] || (combatOn ? 'arcane' : 'physical')];
  if (v && point.distanceToSquared(headPos) < 6400) world.particles.burst(v.hit, point, null, 0.8);
}
// ПК: лук — выстрел полным натяжением, клинок — удар перед собой и волна
const bladeOrigin = new THREE.Vector3();
function pcBowOrBlade(w, d) {
  if (d.action === 'bow') {
    const r = wpnMod.bowRelease(w, 1);
    if (!r) return;
    spellDir.copy(raycaster.ray.direction);
    launchSpell(muzzlePos, spellDir, wpnMod.shotParams(w, r, 1), w.spread({ aim: Math.max(aimAmt, 0.6) }), null);
    pcGun()?.fire?.();
    playSpell('bow-release');
    return;
  }
  bladeOrigin.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, 1.4);
  const n = enemyExplode(bladeOrigin, 1.3, d.swing?.damage ?? 2, null);
  playSpell(n ? 'sword-hit' : 'sword-swing');
  pcGun()?.fire?.();
  if (wpnMod.bladeWave(w, 1)) slashes?.spawn?.({ origin: raycaster.ray.origin.clone(), dir: raycaster.ray.direction.clone(), up: new THREE.Vector3(0, 1, 0), power: 1 }, d.wave);
}

// ---------- «экран зрителя» по Wi-Fi: шлем передаёт позу, ПК рисует тот же мир глазами игрока ----------
const castMod = await load('./cast.js');
const ENEMY_TYPE_IDS = ['wisp', 'fairy', 'skull', 'guardian', 'eye', 'boss'];
const r3 = (x) => Math.round(x * 1000) / 1000;
const castQ = new THREE.Quaternion(), castP = new THREE.Vector3(), castS = new THREE.Vector3();
const castSender = SPECTATE ? null : safeCall(castMod.createCastSender, {
  onStatus: (s, info) => {
    if (s === 'ready' && renderer.xr.isPresenting) notify('📺 Трансляция: код ' + info, '#9fe7ff');
    if (s === 'error') console.warn('Трансляция:', info);
  },
  onViewer: (n) => notify(n ? '📺 Зритель подключился' : '📺 Зритель отключился', '#9fe7ff'),
});
// стартовый экран: код этого устройства и «Смотреть трансляцию»
{
  const codeEl = document.getElementById('cast-code');
  if (codeEl && castMod.castCode) codeEl.textContent = castMod.castCode();
  const form = document.getElementById('cast-watch');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = (document.getElementById('cast-input')?.value || '').replace(/\D/g, '');
    if (v.length === 6) location.href = '?spectate=' + v;
  });
}
if (castSender && urlParams.get('cast') === '1') castSender.start();
renderer.xr.addEventListener('sessionstart', () => {
  if (!castSender) return;
  castSender.start();
  notify('📺 Трансляция: код ' + castSender.code, '#9fe7ff');
});

let castT = 0;
function castState(dt) {
  if (!castSender?.viewers) return;
  if ((castT -= dt) > 0) return;
  castT = 1 / 30;
  camera.getWorldQuaternion(castQ);
  const hands = [];
  if (renderer.xr.isPresenting) {
    for (const c of controllers) {
      if (!c.visible || !c.userData.src) continue;
      c.matrixWorld.decompose(castP, castQ.clone(), castS);
      const q = new THREE.Quaternion(); c.getWorldQuaternion(q);
      hands.push([c.userData.src.handedness === 'left' ? 0 : 1, r3(castP.x), r3(castP.y), r3(castP.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), c === weaponHand ? 1 : 0]);
    }
    camera.getWorldQuaternion(castQ);
  }
  const foes = [];
  if (combatOn && enemies) for (const e of enemies.active) if (e.alive) foes.push([ENEMY_TYPE_IDS.indexOf(e.type), r3(e.center.x), r3(e.center.y), r3(e.center.z)]);
  castSender.send({
    v: 1, mode: world ? 'world' : fantasy ? 'fantasy' : 'range', xr: renderer.xr.isPresenting,
    h: [r3(headPos.x), r3(headPos.y), r3(headPos.z), r3(castQ.x), r3(castQ.y), r3(castQ.z), r3(castQ.w)],
    hands, w: arsenal.current.def.id, c: combatOn, hr: world ? r3(world.hour) : null, e: foes,
    s: score, hp: world ? Math.ceil(worldHp) : director?.hp ?? null,
  });
}

// зритель (?spectate=КОД): камера — голова игрока, руки с оружием, существа — светящиеся шары
const spectator = { state: null, has: false, head: new THREE.Vector3(), quat: new THREE.Quaternion(), pos: new THREE.Vector3(), rot: new THREE.Quaternion(), status: 'connecting' };
const specLabel = SPECTATE ? (() => {
  const el = document.createElement('div');
  el.id = 'spectator-label';
  el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:20;padding:8px 16px;border-radius:999px;background:rgba(7,11,26,.72);border:1px solid rgba(159,231,255,.5);color:#dff6ff;font:700 15px system-ui;pointer-events:none';
  document.body.appendChild(el);
  return el;
})() : null;
const specHands = [0, 1].map(() => {
  const g = new THREE.Group();
  g.visible = false;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshBasicMaterial({ color: 0x9fe7ff }));
  g.add(ball);
  scene.add(g);
  g.userData.sets = null;
  return g;
});
const specFoes = (() => {
  const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.35, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 64);
  m.count = 0;
  m.frustumCulled = false;
  m.visible = !!SPECTATE;
  scene.add(m);
  return m;
})();
const specM = new THREE.Matrix4(), specC = new THREE.Color(), specV = new THREE.Vector3(), specQ = new THREE.Quaternion(), specScale = new THREE.Vector3();
let specModeSet = false;
function setSpecStatus(s) {
  spectator.status = s;
}
const castViewer = SPECTATE ? safeCall(castMod.createCastViewer, SPECTATE, {
  onStatus: setSpecStatus,
  onState: (s) => {
    if (!s || s.v !== 1) return;
    // режим как у игрока: открытый мир — своя страница
    if ((s.mode === 'world') !== !!world) {
      const u = new URL(location.href);
      if (s.mode === 'world') u.searchParams.set('mode', 'world'); else u.searchParams.delete('mode');
      location.replace(u.href);
      return;
    }
    if (!specModeSet || (s.mode === 'fantasy') !== fantasy) { specModeSet = true; if (!world) setFantasy(s.mode === 'fantasy'); }
    spectator.state = s;
    spectator.status = 'connected';
  },
}) : null;
if (SPECTATE) {
  const ov = document.getElementById('overlay');
  ov?.classList.add('is-hidden');
  if (ov) ov.inert = true;
  document.body.classList.remove('ov-open');
  addEventListener('game:ready', () => { document.body.classList.remove('ov-open'); }, { once: true });
}

function updateSpectator(dt) {
  const s = spectator.state;
  if (specLabel) {
    const st = spectator.status === 'connected' && s
      ? `📺 Трансляция ${SPECTATE} · очки ${s.s ?? 0}${s.hp != null ? ' · ♥ ' + s.hp : ''}`
      : spectator.status === 'error' ? `📺 ${SPECTATE}: нет связи с сервером знакомства` : `📺 Ждём игрока с кодом ${SPECTATE}…`;
    if (specLabel.textContent !== st) specLabel.textContent = st;
  }
  viewModel.visible = false;
  if (!s) return;
  // камера = голова игрока (сглаженно)
  spectator.head.set(s.h[0], s.h[1], s.h[2]);
  spectator.quat.set(s.h[3], s.h[4], s.h[5], s.h[6]).normalize();
  rig.position.set(0, 0, 0);
  rig.rotation.set(0, 0, 0);
  const first = !spectator.has;
  spectator.has = true;
  // своя сглаженная поза: обычный код ПК каждый кадр сбрасывает камеру к «росту»
  spectator.pos.lerp(spectator.head, first ? 1 : 1 - Math.exp(-dt * 18));
  spectator.rot.slerp(spectator.quat, first ? 1 : 1 - Math.exp(-dt * 10));
  camera.position.copy(spectator.pos);
  camera.quaternion.copy(spectator.rot);
  camera.updateMatrixWorld(true);
  updateHead();
  // оружие игрока
  const idx = arsenal.list.findIndex((w) => w.def.id === s.w);
  if (s.c !== combatOn) setCombat(s.c);
  if (idx >= 0 && idx !== arsenal.index) arsenal.select(idx);
  if (world && s.hr != null && Math.abs(world.hour - s.hr) > 0.05) world.setTime(s.hr);
  // руки
  for (const g of specHands) g.visible = false;
  for (const h of s.hands || []) {
    const g = specHands[h[0]];
    g.visible = true;
    g.position.set(h[1], h[2], h[3]);
    g.quaternion.set(h[4], h[5], h[6], h[7]);
    if (!g.userData.sets) g.userData.sets = { classic: buildGunSet(g, 0xff7ad9), magic: combatReady ? buildFantasyGunSet(g) : {} };
    const sets = g.userData.sets;
    for (const [id, gun] of Object.entries(sets.classic)) gun.group.visible = !!h[8] && !s.c && id === s.w;
    for (const [id, gun] of Object.entries(sets.magic)) gun.group.visible = !!h[8] && s.c && id === s.w;
  }
  // существа
  let k = 0;
  for (const f of s.e || []) {
    if (k >= specFoes.instanceMatrix.count) break;
    const type = ENEMY_TYPE_IDS[f[0]] || 'wisp';
    const sc = type === 'boss' ? 4 : type === 'guardian' ? 2.2 : 1;
    specM.compose(specV.set(f[1], f[2], f[3]), specQ.identity(), specScale.setScalar(sc));
    specFoes.setMatrixAt(k, specM);
    specFoes.setColorAt(k, specC.setHex(ENEMY_COLORS[type] ?? 0xffffff));
    k++;
  }
  specFoes.count = k;
  specFoes.instanceMatrix.needsUpdate = true;
  if (specFoes.instanceColor) specFoes.instanceColor.needsUpdate = true;
}

// ---------- динамическое качество ----------
// долгие просадки: на ПК снижаем разрешение, в шлеме усиливаем фовеальный рендер; запас — возвращаем
const frameStats = {
  ema: 1 / 60, slow: 0, fast: 0, foveation: quality.foveation,
  reset() { this.ema = 1 / 60; this.slow = this.fast = 0; },
  update(raw) {
    if (raw <= 0 || raw > 0.25) return; // вкладка спала или первый кадр
    this.ema += (raw - this.ema) * 0.05;
    if (renderer.xr.isPresenting) {
      // кадры в шлеме идут с частотой дисплея (72–120 Гц): дольше ~17 мс — уже пропуски
      this.slow = this.ema > 1 / 58 ? this.slow + raw : 0;
      if (this.slow > 1.5 && this.foveation < 1) {
        this.foveation = 1;
        try { renderer.xr.setFoveation(1); } catch {}
        this.slow = 0;
      }
      return;
    }
    const cap = Math.min(devicePixelRatio, quality.pixelRatio);
    this.slow = this.ema > 1 / 45 ? this.slow + raw : 0;
    this.fast = this.ema < 1 / 80 ? this.fast + raw : 0;
    if (this.slow > 2 && pixelCap > 0.75) {
      pixelCap = Math.max(0.75, pixelCap - 0.25);
      renderer.setPixelRatio(pixelCap);
      this.slow = 0;
    } else if (this.fast > 6 && pixelCap < cap) {
      pixelCap = Math.min(cap, pixelCap + 0.25);
      renderer.setPixelRatio(pixelCap);
      this.fast = 0;
    }
  },
};

// шейдеры всех видов мишеней и оружия компилируем заранее, чтобы первая мишень не дёргала кадр
function warmup() {
  safeCall(gfxMod.warmupTargets, renderer, scene, camera, { quality });
  for (const g of Object.values(pcGuns)) g.group.visible = true;
  try { renderer.compile(scene, camera); } catch (e) { console.warn(e); }
  syncGunVisibility();
  if (fantasyWorld && !world) {
    fantasyWorld.setVisible(true);
    try { renderer.compile(scene, camera); } catch (e) { console.warn(e); }
    fantasyWorld.setVisible(false);
  }
}
applySettings();
warmup();

// открытый мир: старт в деревне Рассветный Брод, табло и меню тира не нужны
if (world) {
  rig.position.set(world.spawn.x, world.spawn.y, world.spawn.z);
  groundY = world.spawn.y;
  board.mesh.visible = false;
  menu.mesh.visible = false;
  setCombat(true); // магическое оружие и существа
  skills?.setEnabled?.(true);
  if (skills) skills.freeMana = true; // в мире навыки без маны — только откаты
  // заклинания по рунам (раздел F) и мечевые навыки (раздел N) — на ПК; в шлеме руны и клинок арены
  try {
    const ver = new URL(import.meta.url).search;
    const [spellMod, meleeMod2, adapterMod] = await Promise.all([
      import('./world/spell-bridge.js' + ver), import('./world/melee.js' + ver), import('./world/enemy-adapter.js' + ver),
    ]);
    const enemyDeps = { enemies, raycastEnemies, scoreEnemy: (r, p) => scoreEnemy(r, p, null) };
    spells = spellMod.createSpellBridge({
      scene, camera, enemies, headPos, notify, fx, particles: world.particles, vfx: world.vfx,
      ...enemyDeps, isActive: () => !!world && combatOn && !renderer.xr.isPresenting && !swords?.on,
    });
    swordPlayer = {
      pos: new THREE.Vector3(), get yaw() { return yaw; }, set yaw(v) { yaw = v; }, xr: false, rig, dead: false, enabled: true,
      touch: false, fire: false, firePressed: false, vignette: null, endFrame() {},
    };
    const swordRenderer = { domElement: renderer.domElement, xr: { getSession: () => null, getControllerGrip: () => ({ addEventListener() {} }) } };
    swords = meleeMod2.install({ scene, camera, renderer: swordRenderer, player: swordPlayer, mobs: adapterMod.createMobAdapter(enemyDeps), state: swordState });
    // без ограничений: все мечевые навыки открыты сразу (мастерство на максимуме), ограничивают только откаты
    if (swords?.engine?.xp) for (const k of Object.keys(swords.engine.xp)) swords.engine.xp[k] = Math.max(swords.engine.xp[k], 1e6);
  } catch (e) { console.warn('[world] заклинания или мечи не загрузились', e); }
  setTimeout(() => notify('Навыки: Q сфера · E волна ки · V шаг · X замедление · Z ульта · R огненный шар · T молния · H щит · U заклинания · G меч', '#b49cff'), 2500);
  // название места по-казахски, ниже — по-русски
  world.onTitle = (t) => notify(t.kk + (t.ru && t.ru !== t.kk ? ' · ' + t.ru : ''), '#ffd23f');
  syncGunVisibility();
  camera.getWorldPosition(headPos);
  const bridgeMod = await import('./world/progression-bridge.js' + new URL(import.meta.url).search);
  progressionBridge = await bridgeMod.createProgressionBridge({ world, headPos, scene, renderer, notify, moveTo: (x, y, z) => moveHeadTo(new THREE.Vector3(x, y, z)) });
  const vrMod = await import('./world/progression-vr.js' + new URL(import.meta.url).search);
  progressionVr = vrMod.createProgressionVr({ bridge: progressionBridge, camera, renderer });
  worldHp = progressionBridge.state.hp;
}

// ---------- игровой цикл ----------
const clock = new THREE.Clock();
// кадр игры; forcedDt — шаг для отладки (vrTirDebug.tick), когда скрытая вкладка не даёт кадров
function frame(_time, _xrFrame, forcedDt, skipRender = false) {
  const raw = forcedDt ?? clock.getDelta();
  const dt = Math.min(raw, 0.05);
  const time = clock.elapsedTime;
  const xr = renderer.xr.isPresenting;
  frameStats.update(raw);
  const wdt = worldDt(dt); // мир медленнее при «Ускорении восприятия», стоит при стоп-кадре

  updateHead();
  if (xr) pollVrButtons();
  if (!xr && touch?.active) {
    const [dx, dy] = touch.consumeLook();
    const sens = 0.004 * (userSettings.sensitivity || 1) * (camera.fov / deskFov());
    yaw -= dx * sens;
    pitch = rand.clamp(pitch - dy * sens * (userSettings.invertY ? -1 : 1), -1.4, 1.4);
  }
  if (!SPECTATE) { // зритель не ходит сам: камера — голова игрока
    updateMovement(dt);
    updateAim(dt, time);
  }
  updateHead();
  updateMultiplayerPresence(performance.now(), dt);
  sharedArena.update(dt);
  if (pvpEnabled && sharedArena.playing && !renderer.xr.isPresenting &&
      !document.body.classList.contains('ov-open')) {
    if (!sharedArena.alive) {
      pvpState.hidden = false;
      pvpState.textContent = 'ВЫ ПОГИБЛИ · ВОЗРОЖДЕНИЕ ЧЕРЕЗ ' +
        sharedArena.respawnSeconds.toFixed(1) + ' С';
    } else if (sharedArena.shieldSeconds > .1) {
      pvpState.hidden = false;
      pvpState.textContent = 'ЗАЩИТА ПОСЛЕ ПОЯВЛЕНИЯ · ' +
        sharedArena.shieldSeconds.toFixed(1) + ' С';
    } else {
      pvpState.hidden = true;
    }
  } else {
    pvpState.hidden = true;
  }

  // оружие: смена, перезарядка, события
  arsenal.update(dt);
  for (const e of arsenal.drain()) {
    if (e.type !== 'draw') continue;
    sound('draw');
    if (combatOn) { melee?.reset?.(); bowCtl?.cancel?.(); }
    if (xr) comfort?.showWeapon?.(arsenal.current.def.short || arsenal.current.def.name, weaponHand);
  }
  if (arsenal.current.def.id !== lastWeaponId) { lastWeaponId = arsenal.current.def.id; syncGunVisibility(); aimAmt = 0; }
  if (xr) syncGunVisibility();
  if (xr) updateVrHands(dt);
  if (xr || world) updateFantasy(dt);
  handleTriggers();
  for (const w of arsenal.list) for (const e of w.drain()) handleWeaponEvent(w, e);
  updateCombat(dt, wdt);
  world?.update(dt, headPos, renderer);
  progressionBridge?.update(dt);
  progressionVr?.update(dt);
  updateWorldCreatures(dt);
  updateSpellsAndSwords(dt);
  if (world && combatOn) for (const w of arsenal.list) if (w.manaFed && w.def.manaMax) w.mana = w.def.manaMax; // в мире без перезарядки
  if (world) world.combat = Math.min(1, (enemies?.count || 0) / 4);

  // полёт пуль
  collectHittables();
  ballistics.update(wdt, hitTest, onBulletHit, onBulletEnd);

  if (state === 'countdown') updateCountdown(dt);

  if (state === 'play') {
    elapsed += dt;
    if (goHide > 0 && (goHide -= dt) <= 0) menu.mesh.visible = false;
    if (combatOn) timeLeft = director.mode === 'trial' ? director.timeLeft : 0; // конец раунда — по событиям волн
    else { timeLeft -= dt; spawnTimer -= dt; }
    if (!combatOn && spawnTimer <= 0 && targets.children.length < MAX_TARGETS) {
      spawnTarget();
      spawnTimer = Math.max(0.35, 1.0 - elapsed * 0.011); // темп растёт
    }
    // тиканье в последние 10 секунд
    const sec = Math.ceil(timeLeft);
    if (sec <= 10 && sec > 0 && sec !== lastTickSec) { lastTickSec = sec; sfx.tick?.(); }
    // музыка нарастает к концу раунда
    const intensity = Math.round((0.35 + 0.65 * Math.min(1, elapsed / ROUND_TIME)) * 20) / 20;
    if (intensity !== lastIntensity) { lastIntensity = intensity; music.setIntensity(intensity); }
    if (!combatOn && timeLeft <= 0) { timeLeft = 0; endGame(); }
  }

  updateTargets(wdt, time);
  fx.update(wdt);
  if (!world) {
    env.update(dt, time);
    range?.update?.(dt, time);
    logo?.update?.(dt, time);
  }
  if (fantasy) fantasyWorld.update(wdt, time);
  updateModeButton();
  updateCombatModeButton();
  gfx?.update?.(dt, time);
  updateControllers();
  updateViewModel(dt);
  updateCharacter(dt);
  updateHud();
  pvpFeed.style.opacity = pvpEnabled && performance.now() < pvpFeedbackTime ? '1' : '0';
  if (xr) comfort?.update?.(dt, { speed: Math.hypot(vel.x, vel.z), angularSpeed: turnRate, airborne: !onGround, sprinting });

  follow(board.mesh, 7, headPos.y + 2.6, 1.5, dt);
  if (menu.mesh.visible) follow(menu.mesh, 3, Math.max(1.1, headPos.y) + Math.sin(time * 1.5) * 0.03, 3, dt);
  board.update(sharedArena.active
    ? { score: sharedArena.score, timeLeft: sharedArena.timeLeft, multiplier: 1, timeFrac: sharedArena.timeLeft / ROUND_TIME }
    : { score, timeLeft, multiplier: multiplier(), timeFrac: state === 'play' ? timeLeft / ROUND_TIME : 1, wave: combatOn && director?.mode === 'waves' ? director.wave : undefined });

  if (xr && arsenal.current.def.zoom) {
    try { renderScopeLens(); } catch (e) { console.warn(e); }
  }
  if (SPECTATE) updateSpectator(dt);
  else castState(dt);
  if (!skipRender) renderer.render(scene, camera);
  if (xr && !skipRender) vrMirror.render(scene, camera, dt);
  if (!ready) { ready = true; emit('game:ready'); }
}
renderer.setAnimationLoop(frame);
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
    if (!combatOn) handGun(weaponHand)?.update?.(dt, gunState);
  } else if (viewModel.visible || scoped) {
    if (!combatOn) pcGun()?.update?.(dt, gunState);
  }
  wristInfo.score = sharedArena.active ? sharedArena.score : score;
  wristInfo.timeLeft = sharedArena.active ? sharedArena.timeLeft : timeLeft;
  wristInfo.multiplier = multiplier();
  wristInfo.mk = mk.connected;
  for (const c of controllers) {
    const u = c.userData;
    if (!c.visible) continue;
    u.hand?.update?.(dt);
    if (u.wrist?.group && world) u.wrist.group.visible = false;
    if (!fantasy && !world) u.wrist?.update?.(wristInfo);
  }
  updateBracer();
  if (shadowBlob) shadowBlob.position.set(headPos.x, (world ? groundY : 0) + 0.012, headPos.z);
}

// отладка: ?debug — повернуть взгляд и выбрать оружие из консоли
if (/[?&]debug\b/.test(location.search)) {
  window.vrTirDebug = {
    look(yawDeg, pitchDeg = 0) { yaw = toRad(yawDeg); pitch = toRad(pitchDeg); },
    aim(on = true) { aimHeld = on; },
    fire() { pcTrigger.held = true; pcTrigger.first = true; pcTrigger.ndc = null; setTimeout(() => { pcTrigger.held = false; if (combatOn && !renderer.xr.isPresenting) releaseSpell(null); }, 30); },
    select(i) { arsenal.select(i); },
    get touch() { return touch; },
    get fantasy() { return { active: fantasy, mode: userSettings.mode, mana: skills?.mana, ult: skills?.ult01, timeScale: skills?.timeScale, lastCast: skills?.lastCast, kiState: skills?.kiState, groundY, menu: menu === fantasyMenu ? 'fantasy' : 'classic', modeButton: modeButton.visible }; },
    setMode(m) { setMode(m); },
    teleport(x, y, z) { moveHeadTo(new THREE.Vector3(x, y ?? world?.heightAt(x, z) ?? 0, z)); },
    get world() { return world ? { ...world.stats(), pos: [+headPos.x.toFixed(1), +headPos.y.toFixed(2), +headPos.z.toFixed(1)], groundY: +groundY.toFixed(2), feet: +feet.toFixed(2), onGround } : null; },
    setTime(h, mul) { world?.setTime(h, mul); },
    get scene() { return scene; },
    get spells() { return spells; },
    get swords() { return swords; },
    get spectator() { return { code: SPECTATE, status: spectator.status, foes: specFoes.count, hands: specHands.filter((g) => g.visible).length, sendCode: castSender?.code, viewers: castSender?.viewers }; },
    get mirror() { return { enabled: vrMirror.enabled, frames: vrMirror.frames }; },
    get worldCombat() { return world ? { hp: +worldHp.toFixed(1), enemies: enemies?.count, weapon: arsenal.current.def.id, score, combat: combatOn } : null; },
    spawn(type) { return !!(world ? spawnWorldCreature(type) : enemies?.spawn(type)); },
    get progression() { return progressionBridge?.debug || null; },
    giveXp(n) { if (Number.isFinite(n) && n > 0) progressionBridge?.api.gainXp(n, "Отладка"); return this.progression; },
    get progressionVr() { return progressionVr?.debug || null; },
    damageNearest(damage = 1) {
      if (!world || !Number.isFinite(damage) || damage <= 0) return 0;
      let nearest = null, d = Infinity; for (const e of enemies.active) if (e.alive && e.center.distanceToSquared(headPos) < d) { nearest = e; d = e.center.distanceToSquared(headPos); }
      return nearest ? enemyExplode(nearest.center, 0.5, damage, "rune") : 0;
    },
    aimNearest() {
      const e = (enemies?.active || []).filter((x) => x.alive).sort((a, b) => a.center.distanceTo(headPos) - b.center.distanceTo(headPos))[0];
      if (!e) return null;
      const dx = e.center.x - headPos.x, dy = e.center.y - headPos.y, dz = e.center.z - headPos.z;
      yaw = Math.atan2(-dx, -dz); pitch = Math.atan2(dy, Math.hypot(dx, dz));
      return { type: e.type, dist: +Math.hypot(dx, dy, dz).toFixed(1), y: +e.center.y.toFixed(1) };
    },
    burst(type = 'fire') { import('../shared/defs/damage-vfx.js').then(m => world?.particles.burst(m.DAMAGE_TYPE_VFX[type].hit, headPos.clone().add(new THREE.Vector3(0, -0.3, -2)), null)); },
    move(keyCode, ms = 500) { keys.add(keyCode); setTimeout(() => keys.delete(keyCode), ms); },
    get skills() { return skills; },
    get combat() { return { on: combatOn, mode: director?.mode, running: director?.running, enemies: enemies?.count, hp: director?.hp, weapon: arsenal.current.def.id, mana: arsenal.current.mana, wave: director?.wave }; },
    startRound() { if (state === 'menu' || state === 'over') startGame(); },
    tick(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(0, null, dt, i < n - 1); return this.world || this.state; },
    get holsters() { return holsters; },
    get handling() { return handling; },
    get state() { return { state, score, combo, shots, hits, weapon: arsenal.current.def.id, mag: arsenal.current.mag, aimAmt, scoped }; },
    get info() {
      const i = renderer.info;
      return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length, sceneObjects: scene.children.length, quality: quality.id, pixelRatio: renderer.getPixelRatio(), frameMs: +(frameStats.ema * 1000).toFixed(1) };
    },
  };
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  placeViewModel();
});
