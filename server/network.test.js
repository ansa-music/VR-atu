import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';

// Queue messages immediately, including those received before an assertion waits.
async function connect(url) {
  const socket = new WebSocket(url);
  const queue = [];
  socket.on('message', raw => queue.push(JSON.parse(raw)));
  await once(socket, 'open');
  return {
    socket,
    send: (type, data = {}) => socket.send(JSON.stringify({ type, ...data })),
    async take(type, predicate = () => true) {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const i = queue.findIndex(m => m.type === type && predicate(m));
        if (i >= 0) return queue.splice(i, 1)[0];
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error('Missing message: ' + type);
    },
  };
}

test('two WebSocket players share round, hits, ownership and cleanup', { timeout: 15000 }, async t => {
  const server = spawn(process.execPath, ['index.js'], {
    cwd: new URL('.', import.meta.url), env: { ...process.env, PORT: '0', ALLOWED_ORIGINS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill('SIGTERM');
      await exited;
    }
  });
  const [chunk] = await once(server.stdout, 'data');
  const port = Number(String(chunk).trim().split(' ').at(-1));
  assert.ok(port > 0);
  const url = `ws://127.0.0.1:${port}`;
  const a = await connect(url), b = await connect(url);
  t.after(() => { a.socket.terminate(); b.socket.terminate(); });
  const { playerId } = await a.take('welcome');
  a.send('room:create', { name: 'Host', options: { code: '123', mode: 'targets' } });
  await a.take('room:joined');
  b.send('room:join', { code: '123', name: 'Guest' });
  const guest = await b.take('room:joined');
  b.send('round:start');
  assert.equal((await b.take('error')).code, 'HOST_ONLY');
  a.send('round:start');
  await a.take('room:update', m => m.room.phase === 'playing');
  await b.take('room:update', m => m.room.phase === 'playing');
  const { targets } = await a.take('targets:update', m => m.targets.length > 0);
  const shared = await b.take('targets:update', m => m.targets.length > 0);
  assert.deepEqual(shared.targets, targets);
  const target = targets[0];
  const origin = [target.position[0], target.position[1], target.position[2] + 1];
  a.send('player:pose', { position: origin, rotation: [0, 0, 0, 1] });
  await b.take('player:pose');
  a.send('player:shot', { origin, direction: [0, 0, -1] });
  const hit = await a.take('shot:result');
  assert.equal(hit.hit, true);
  assert.equal(hit.playerId, playerId);
  assert.deepEqual(await b.take('shot:result'), hit);
  a.send('room:leave');
  await a.take('room:left');
  await b.take('room:update', m => m.room.hostId === guest.playerId);
  b.send('room:leave');
  await b.take('room:left');
  const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.equal(health.rooms, 0);
});
