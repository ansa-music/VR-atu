import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/multiplayer.js', import.meta.url), 'utf8');
const { MultiplayerClient } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
class FakeSocket extends EventTarget {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances = [];
  constructor() { super(); this.readyState = 0; FakeSocket.instances.push(this); }
  open() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
  close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
  message(data) { this.dispatchEvent(new MessageEvent('message', { data })); }
}

test('concurrent connect calls wait for the same socket opening', async t => {
  const original = globalThis.WebSocket;
  globalThis.WebSocket = FakeSocket;
  t.after(() => { globalThis.WebSocket = original; });
  const client = new MultiplayerClient('ws://test');
  const first = client.connect(), second = client.connect();
  assert.equal(first, second);
  assert.equal(client.state, 'connecting');
  client.socket.open();
  await first;
  assert.equal(client.state, 'connected');
  client.disconnect();
  assert.equal(client.state, 'disconnected');
});

test('cancelled connection rejects and a later connection can succeed', async t => {
  const original = globalThis.WebSocket;
  globalThis.WebSocket = FakeSocket;
  t.after(() => { globalThis.WebSocket = original; });
  const client = new MultiplayerClient('ws://test');
  const pending = client.connect();
  client.disconnect();
  await assert.rejects(pending, /closed before connecting/);
  const retry = client.connect();
  client.socket.open();
  await retry;
  client.socket.message(JSON.stringify({ type: 'welcome', playerId: 'new-player' }));
  assert.equal(client.playerId, 'new-player');
  client.disconnect();
  assert.equal(client.playerId, null);
  assert.equal(client.room, null);
});

test('events from a previous socket cannot overwrite the new session', async t => {
  const original = globalThis.WebSocket;
  globalThis.WebSocket = FakeSocket;
  t.after(() => { globalThis.WebSocket = original; });
  const client = new MultiplayerClient('ws://test');
  const initial = client.connect();
  const oldSocket = client.socket;
  oldSocket.open();
  await initial;
  client.disconnect();
  const retry = client.connect();
  client.socket.open();
  await retry;
  client.socket.message(JSON.stringify({ type: 'welcome', playerId: 'current' }));
  oldSocket.message(JSON.stringify({ type: 'welcome', playerId: 'obsolete' }));
  oldSocket.dispatchEvent(new Event('close'));
  assert.equal(client.playerId, 'current');
  assert.equal(client.state, 'connected');
  client.disconnect();
});
