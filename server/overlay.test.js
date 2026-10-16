import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/overlay.js', import.meta.url), 'utf8');

function element() {
  const classes = new Set();
  const handlers = new Map();
  return {
    hidden: false, disabled: false, textContent: '', inert: false,
    classList: {
      contains(name) { return classes.has(name); },
      toggle(name, force) {
        if (force === undefined ? !classes.has(name) : force) classes.add(name);
        else classes.delete(name);
      },
    },
    attrs: {},
    setAttribute(k, value) { this.attrs[k] = value; },
    addEventListener(name, callback) { handlers.set(name, callback); },
    focus() {},
    blur() {},
    click() { handlers.get('click')?.({ stopPropagation() {} }); },
  };
}

test('multiplayer start hides solo launch and opens arena for every player', async () => {
  const ids = ['overlay', 'play', 'help-btn', 'mk-status', 'mk-connect'];
  const elements = Object.fromEntries(ids.map(id => [id, element()]));
  const body = { classList: element().classList };
  globalThis.window = new EventTarget();
  globalThis.document = { body, getElementById(id) { return elements[id] || null; } };
  globalThis.CustomEvent ??= class extends Event {
    constructor(type, options = {}) { super(type); this.detail = options.detail; }
  };
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64') + '#multiplayer');
  const send = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail }));

  send('game:ready');
  assert.equal(elements.play.hidden, false);
  assert.match(elements.play.textContent, /ОДИНОЧНАЯ/);

  send('mp:room:joined', { room: { phase: 'lobby', code: '123' } });
  assert.equal(elements.play.hidden, true);
  assert.equal(elements.overlay.inert, false);
  assert.equal(body.classList.contains('mp-in-room'), true);

  let startedSolo = 0;
  window.addEventListener('game:start', () => startedSolo++);
  elements.play.click();
  assert.equal(startedSolo, 0, 'solo play is disabled while in room');

  send('mp:room:update', { room: { phase: 'playing', code: '123' } });
  assert.equal(elements.overlay.inert, true);
  assert.equal(elements.overlay.classList.contains('is-hidden'), true);

  elements.helpBtn = elements['help-btn'];
  elements.helpBtn.click();
  assert.equal(elements.overlay.inert, false, 'help can open mid-match');
  let focusCalled = 0;
  window.addEventListener('mp:focus-controls', () => focusCalled++);
  send('mp:resume');
  assert.equal(elements.overlay.inert, true);
  assert.equal(focusCalled, 1);

  send('mp:room:update', { room: { phase: 'finished', code: '123' } });
  assert.equal(elements.overlay.inert, false);
  assert.equal(elements.play.hidden, true, 'solo play stays hidden until leaving room');

  send('mp:room:left');
  assert.equal(elements.play.hidden, false);
  assert.equal(body.classList.contains('mp-in-room'), false);
});
