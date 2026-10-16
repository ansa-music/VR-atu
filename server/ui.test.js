import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../js/multiplayer-ui.js', import.meta.url), 'utf8'))
  .replace(/^import .*server-config\.js(?:\?[^']*)?';/m, "const MULTIPLAYER_SERVER_URL = 'wss://vr-atu-multiplayer.onrender.com';");

function fakeElement(id) {
  const handlers = new Map();
  return {
    id, hidden:false, disabled:false, value:'', textContent:'',
    children: [], attrs:{}, style:{},
    addEventListener(name, callback) { handlers.set(name, callback); },
    click() { handlers.get('click')?.({ stopPropagation() {} }); },
    setAttribute(name, value) { this.attrs[name] = value; },
    replaceChildren(...items) { this.children = items; },
    focus() { this.focused = true; },
  };
}
async function loadUI({legacy = false, hostname, protocol = 'https:'} = {}) {
  const names = legacy
    ? ['mp-panel','mp-status','mp-players','mp-code','mp-start','mp-name','mp-join-code','mp-server','mp-create','mp-join']
    : ['mp-panel','mp-lobby','mp-status','mp-players','mp-code','mp-start','mp-name','mp-join-code','mp-server','mp-create','mp-join','mp-create-fields','mp-join-fields','mp-mode-create','mp-mode-join','mp-custom-code','mp-title','mp-max-players','mp-duration','mp-room-title','mp-room-info','mp-copy-code','mp-ranking','mp-leave','mp-cancel'];
  const items = new Map(names.map(id => [id, fakeElement(id)]));
  globalThis.document = { getElementById(id) { return items.get(id) || null; }, createElement: fakeElement };
  globalThis.window = new EventTarget();
  items.timers = [];
  window.setTimeout = callback => items.timers.push(callback);
  globalThis.location = {protocol, hostname};
  Object.defineProperty(globalThis, 'navigator', {value: {clipboard: {writeText: async () => {}}}, configurable: true});
  globalThis.CustomEvent ??= class extends Event {constructor(name,{detail}={}) {super(name);this.detail=detail;}};
  items.get('mp-name').value='Тест';
  if (!legacy) {
    items.get('mp-title').value='Турнир ATU';
    items.get('mp-max-players').value='4';
    items.get('mp-duration').value='90';
  }
  await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+Math.random());
  return items;
}

test('new UI creates room 123 with options', async () => {
  const elements = await loadUI();
  const sent=[];
  window.addEventListener('mp:configure', e=>sent.push(e.detail));
  elements.get('mp-custom-code').value='123';
  elements.get('mp-create').click();
  assert.equal(sent.length,1);
  assert.equal(sent[0].action,'create');
  assert.equal(sent[0].options.code,'123');
  assert.equal(sent[0].options.durationSec,90);
  assert.equal(sent[0].url,'wss://vr-atu-multiplayer.onrender.com');
});

test('new UI joins room 123 and rejects bad codes', async () => {
  const elements = await loadUI();
  const sent=[];
  window.addEventListener('mp:configure', e=>sent.push(e.detail));
  elements.get('mp-mode-join').click();
  assert.equal(elements.get('mp-join-fields').hidden,false);
  elements.get('mp-join-code').value='123';
  elements.get('mp-join').click();
  assert.equal(sent[0].code,'123');
  window.dispatchEvent(new CustomEvent('mp:error',{detail:{code:'ROOM_NOT_FOUND'}}));
  elements.get('mp-join-code').value='12a';
  elements.get('mp-join').click();
  assert.equal(sent.length,1);
  assert.match(elements.get('mp-status').textContent,/трёх цифр/);
});

test('old cached HTML does not break click listeners', async () => {
  const elements=await loadUI({legacy:true});
  const sent=[];
  window.addEventListener('mp:configure', e=>sent.push(e.detail));
  elements.get('mp-join-code').value='123';
  elements.get('mp-join').click();
  assert.equal(sent.length,1);
  assert.equal(sent[0].action,'join');
  assert.equal(sent[0].code,'123');
  window.dispatchEvent(new CustomEvent('mp:room:joined',{detail:{
    playerId:'player1',
    room:{code:'123',hostId:'player1',phase:'lobby',players:[{id:'player1',name:'Тест'}]},
  }}));
  assert.equal(elements.get('mp-code').textContent,'123');
  assert.equal(elements.get('mp-players').children.length,1);
});


test('local development connects to local backend instead of production', async () => {
  const elements = await loadUI({hostname: 'localhost', protocol: 'http:'});
  const sent = [];
  window.addEventListener('mp:configure', e => sent.push(e.detail));
  elements.get('mp-create').click();
  assert.equal(sent[0].url, 'ws://localhost:8080');
});


test('cancel restores connection controls and emits transport cancellation', async () => {
  const elements = await loadUI();
  let cancelled = 0;
  window.addEventListener('mp:cancel', () => cancelled++);
  elements.get('mp-create').click();
  assert.equal(elements.get('mp-create').disabled, true);
  assert.equal(elements.get('mp-cancel').hidden, false);
  elements.get('mp-cancel').click();
  assert.equal(cancelled, 1);
  assert.equal(elements.get('mp-create').disabled, false);
  assert.equal(elements.get('mp-cancel').hidden, true);
});

test('timeout from a previous attempt does not cancel the current attempt', async () => {
  const elements = await loadUI();
  let cancelled = 0;
  window.addEventListener('mp:cancel', () => cancelled++);
  elements.get('mp-create').click();
  window.dispatchEvent(new CustomEvent('mp:error', { detail: { code: 'NETWORK_ERROR' } }));
  elements.get('mp-create').click();
  elements.timers[0]();
  assert.equal(cancelled, 0);
  assert.equal(elements.get('mp-create').disabled, true);
  elements.timers[1]();
  assert.equal(cancelled, 1);
  assert.equal(elements.get('mp-create').disabled, false);
});
