import test from 'node:test';
import assert from 'node:assert/strict';
import { VRButton } from '../vendor/addons/webxr/VRButton.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
class Session extends EventTarget { async end() { this.dispatchEvent(new Event('end')); } }
function setup(t, requestSession, setSession = async () => {}) {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  globalThis.window = new EventTarget();
  globalThis.document = { createElement() { return { style: {}, disabled: false, textContent: '', click() { this.onclick?.(); } }; } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { xr: { isSessionSupported: async () => true, requestSession } } });
  t.after(() => {
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator;
    globalThis.window = oldWindow; globalThis.document = oldDocument;
  });
  return VRButton.createButton({ xr: { setSession } });
}

test('отказ в разрешении VR возвращает доступную кнопку и понятное событие ошибки', async t => {
  const button = setup(t, async () => { throw new DOMException('denied', 'NotAllowedError'); });
  let error; window.addEventListener('game:vr-error', e => { error = e.detail.name; });
  await settle(); button.click(); await settle();
  assert.equal(error, 'NotAllowedError'); assert.equal(button.disabled, false); assert.equal(button.textContent, 'ВОЙТИ В VR');
});

test('двойной клик не создаёт две XR-сессии; после выхода можно войти заново', async t => {
  let complete, requests = 0;
  const button = setup(t, () => { requests++; return new Promise(resolve => { complete = resolve; }); });
  await settle(); button.click(); button.click(); assert.equal(requests, 1);
  complete(new Session()); await settle(); assert.equal(button.textContent, 'ВЫЙТИ ИЗ VR');
  button.click(); await settle(); assert.equal(button.textContent, 'ВОЙТИ В VR');
  button.click(); assert.equal(requests, 2); complete(new Session()); await settle(); button.click(); await settle();
});

test('завершение сессии во время настройки renderer не оставляет кнопку выхода', async t => {
  let finishSetup; const session = new Session();
  const button = setup(t, async () => session, () => new Promise(resolve => { finishSetup = resolve; }));
  await settle(); button.click(); await settle(); await session.end(); finishSetup(); await settle();
  assert.equal(button.textContent, 'ВОЙТИ В VR'); assert.equal(button.disabled, false);
});

test('ошибка настройки renderer закрывает XR-сессию и позволяет повторить вход', async t => {
  const session = new Session(); let ended = false; session.addEventListener('end', () => { ended = true; });
  const button = setup(t, async () => session, async () => { throw new Error('renderer failed'); });
  await settle(); button.click(); await settle();
  assert.ok(ended); assert.equal(button.disabled, false); assert.equal(button.textContent, 'ВОЙТИ В VR');
});
