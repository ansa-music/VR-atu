// Эмулятор Quest 3 (IWER) для tests/combat.html?xr — тот же window.xrTest, что в tests/xr.html.
// Подключается динамически до создания рендерера; адрес 'iwer' — в importmap страницы.
// Страница сообщает о входе/выходе из VR событием game:xr { active }.
import { XRDevice, XRSystem, metaQuest3 } from 'iwer';

const IWER_VERSION = '2.4.0'; // та же версия, что в importmap выше
const TAG = '[xr-test]';
// Те же optionalFeatures, что запрашивает three VRButton (нужны только для запасного пути в enter()).
const SESSION_INIT = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'] };
// Короткие имена → id кнопок в профиле Meta Quest Touch Plus (IWER).
const BUTTONS = {
  trigger: 'trigger', squeeze: 'squeeze', grip: 'squeeze',
  thumbstick: 'thumbstick', stick: 'thumbstick', thumbrest: 'thumbrest',
  a: 'a-button', b: 'b-button', x: 'x-button', y: 'y-button',
};
const BUTTON_IDS = new Set(Object.values(BUTTONS));
const ONLY_ON = { 'a-button': 'right', 'b-button': 'right', 'x-button': 'left', 'y-button': 'left' };
const ANALOG = new Set(['trigger', 'squeeze']); // остальные кнопки бинарные: только 0 или 1

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

function num(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new TypeError(`${TAG} ${name}: ожидалось число, получено ${value}`);
  return n;
}

// yaw — поворот вокруг вертикали (+ влево), pitch — наклон (+ вверх); порядок YXZ, как у камеры игры.
function yawPitchQuat(yawDeg = 0, pitchDeg = 0) {
  const hy = num(yawDeg, 'yawDeg') * Math.PI / 360; // половинные углы
  const hp = num(pitchDeg, 'pitchDeg') * Math.PI / 360;
  const cy = Math.cos(hy), sy = Math.sin(hy), cp = Math.cos(hp), sp = Math.sin(hp);
  return [cy * sp, sy * cp, -sy * sp, cy * cp]; // x, y, z, w
}

function setPose(target, x, y, z, yawDeg = 0, pitchDeg = 0) {
  const q = yawPitchQuat(yawDeg, pitchDeg);
  const px = num(x, 'x'), py = num(y, 'y'), pz = num(z, 'z');
  target.position.set(px, py, pz);
  target.quaternion.set(q[0], q[1], q[2], q[3]);
}

let device = null;
try {
  device = new XRDevice(metaQuest3);
  // В десктопном Chrome/Edge есть «родной» navigator.xr (без шлема), и без forceInstall IWER не встанет.
  device.installRuntime({ forceInstall: true });
  if (!(navigator.xr instanceof XRSystem)) throw new Error('navigator.xr не подменён эмулятором');
  // Пространство local-floor: пол на y = 0, «вперёд» — это −Z.
  device.position.set(0, 1.6, 0); // рост стоя
  device.quaternion.set(0, 0, 0, 1);
  setPose(device.controllers.left, -0.2, 1.4, -0.35);
  setPose(device.controllers.right, 0.2, 1.4, -0.35);
} catch (error) {
  device = null;
  window.xrTestError = error;
  console.error(`${TAG} Не удалось установить эмулятор WebXR (IWER ${IWER_VERSION}). VR-режим на этой странице работать не будет.`, error);
}

function controller(side) {
  const c = side === 'left' || side === 'right' ? device.controllers[side] : null;
  if (!c) throw new Error(`${TAG} side должен быть 'left' или 'right', получено: ${side}`);
  return c;
}

function buttonId(side, button) {
  const key = String(button).trim().toLowerCase();
  const id = BUTTONS[key] || (BUTTON_IDS.has(key) ? key : null);
  if (!id) throw new Error(`${TAG} неизвестная кнопка «${button}». Доступны: ${Object.keys(BUTTONS).join(', ')}`);
  const only = ONLY_ON[id];
  if (only && only !== side) {
    throw new Error(`${TAG} кнопка «${button}» есть только на ${only === 'right' ? 'правом' : 'левом'} контроллере (side = '${only}')`);
  }
  return id;
}

// Ждём n кадров XR-сессии: IWER применяет новое значение кнопки в начале следующего XR-кадра,
// а игра ловит нажатие по разнице «было/стало» между кадрами. Без сессии — просто ~16 мс на кадр.
function frames(n = 1) {
  const count = Math.max(1, Math.floor(Number(n) || 1));
  const session = device.activeSession;
  if (!session) return wait(count * 16);
  return new Promise((resolve) => {
    let left = count;
    // страховка: если кадры не идут (вкладка скрыта, сессия закрылась) — не зависаем навсегда
    const timer = setTimeout(resolve, 1000 + count * 100);
    const tick = () => {
      if (--left <= 0) { clearTimeout(timer); resolve(); } else session.requestAnimationFrame(tick);
    };
    try { session.requestAnimationFrame(tick); } catch { clearTimeout(timer); resolve(); }
  });
}

function waitEvent(name, test, timeout, what) {
  return new Promise((resolve, reject) => {
    const onEvent = (e) => { if (!test || test(e)) { done(); resolve(e); } };
    const timer = setTimeout(() => { done(); reject(new Error(`${TAG} не дождались: ${what} (${timeout} мс)`)); }, timeout);
    const done = () => { clearTimeout(timer); removeEventListener(name, onEvent); };
    addEventListener(name, onEvent);
  });
}

async function until(check, timeout, what) {
  const t0 = performance.now();
  for (;;) {
    const value = check();
    if (value) return value;
    if (performance.now() - t0 > timeout) throw new Error(`${TAG} не дождались: ${what} (${timeout} мс)`);
    await wait(50);
  }
}

const api = {
  version: IWER_VERSION,
  device,
  get session() { return device.activeSession || null; },

  // Вход в VR тем же путём, что у игрока: клик по #VRButton → requestSession → renderer.xr.setSession.
  // Промис завершается, когда игра получила сессию (событие game:xr { active: true }).
  async enter({ timeout = 10000 } = {}) {
    if (device.activeSession) { console.info(`${TAG} VR-сессия уже активна`); return device.activeSession; }
    const button = await until(() => {
      const b = document.getElementById('VRButton');
      return b && typeof b.onclick === 'function' ? b : null; // onclick появляется после isSessionSupported
    }, timeout, 'кнопка «ВОЙТИ В VR» (#VRButton)').catch((e) => {
      const b = document.getElementById('VRButton');
      console.warn(e.message, b ? `— текст кнопки: «${b.textContent}»` : '— кнопка не создана (main.js не загрузился?)');
      return null;
    });
    const started = waitEvent('game:xr', (e) => e.detail?.active === true, timeout, 'старт VR-сессии в игре (game:xr)');
    if (button) {
      button.click();
    } else if (device.sessionOffered && typeof device.grantOfferedSession === 'function') {
      // VRButton при создании вызывает navigator.xr.offerSession — принимаем предложение, это тоже путь игры.
      console.warn(`${TAG} кнопки нет — принимаю сессию, предложенную через navigator.xr.offerSession`);
      device.grantOfferedSession();
    } else {
      started.catch(() => {});
      console.warn(`${TAG} кнопки нет и игра не предлагала сессию — запрашиваю immersive-vr напрямую. ` +
        'Игра эту сессию не получит (renderer.xr.setSession не вызван): проверяется только сам эмулятор.');
      return navigator.xr.requestSession('immersive-vr', SESSION_INIT);
    }
    await started;
    console.info(`${TAG} VR-сессия запущена`);
    return device.activeSession;
  },

  async exit({ timeout = 5000 } = {}) {
    const session = device.activeSession;
    if (!session) { console.info(`${TAG} VR-сессия не активна`); return; }
    const ended = waitEvent('game:xr', (e) => e.detail?.active === false, timeout, 'выход из VR в игре (game:xr)')
      .catch((e) => console.warn(e.message));
    await session.end();
    await ended;
    console.info(`${TAG} VR-сессия завершена`);
  },

  // Шлем в local-floor (метры): y — высота глаз над полом, −Z — вперёд.
  head(x, y, z, yawDeg = 0, pitchDeg = 0) {
    setPose(device, x, y, z, yawDeg, pitchDeg);
  },

  // Контроллер (поза луча прицеливания, targetRaySpace) в local-floor; при yaw = pitch = 0 смотрит вперёд (−Z).
  hand(side, x, y, z, yawDeg = 0, pitchDeg = 0) {
    setPose(controller(side), x, y, z, yawDeg, pitchDeg);
  },

  // Держать/отпустить кнопку. on: true/false или число 0..1 (дробные — только для trigger и squeeze).
  hold(side, button, on = true) {
    const c = controller(side);
    const id = buttonId(side, button);
    let value = typeof on === 'number' ? clamp(on, 0, 1) : (on ? 1 : 0);
    if (!ANALOG.has(id)) value = value > 0 ? 1 : 0;
    c.updateButtonValue(id, value);
    c.updateButtonTouch(id, value > 0);
    return value;
  },

  // Нажать и отпустить: держим не меньше ms и не меньше 2 XR-кадров, затем ждём 2 кадра после отпускания,
  // чтобы игра увидела и нажатие, и отпускание (иначе два press подряд сольются в одно).
  async press(side, button, ms = 80) {
    api.hold(side, button, true);
    await Promise.all([wait(ms), frames(2)]);
    api.hold(side, button, false);
    await frames(2);
  },

  // Стик: x — вправо (+), y — как в WebXR: −1 = от себя (вперёд), +1 = на себя. stick(side, 0, 0) — отпустить.
  stick(side, x = 0, y = 0) {
    const c = controller(side);
    const sx = clamp(num(x, 'x'), -1, 1), sy = clamp(num(y, 'y'), -1, 1);
    c.updateAxes('thumbstick', sx, sy);
    return { x: sx, y: sy };
  },

  wait,
  frames,
};

if (device) {
  window.xrTest = api;
  console.info(
    `${TAG} IWER ${IWER_VERSION}: эмулируется Meta Quest 3, navigator.xr подменён. Команды:\n` +
    '  await xrTest.enter() / await xrTest.exit()\n' +
    '  xrTest.head(x, y, z, yawDeg, pitchDeg)\n' +
    "  xrTest.hand('left'|'right', x, y, z, yawDeg, pitchDeg)\n" +
    "  await xrTest.press('right', 'trigger' | 'squeeze' | 'a' | 'b' | 'thumbstick', ms)\n" +
    "  xrTest.hold('left', 'x', true|false|0..1)   xrTest.stick('left', x, y)   await xrTest.wait(ms)"
  );
}
