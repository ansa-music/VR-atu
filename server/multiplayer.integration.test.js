import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

function spawnServer() {
  const server = spawn(process.execPath, ['index.js'], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, PORT: '0', ALLOWED_ORIGINS: 'https://ansa-music.github.io' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  server.stderr.on('data', data => { stderr += data; });
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server did not start: ' + stderr)), 12_000);
    server.stdout.on('data', data => {
      stdout += data;
      const match = stdout.match(/server listening on (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
    server.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error('Server exited with ' + code + ': ' + stderr));
    });
  });
  return { server, ready };
}

async function connect(port) {
  const ws = new WebSocket('ws://127.0.0.1:' + port, {
    headers: { Origin: 'https://ansa-music.github.io' },
  });
  const history = [];
  const watchers = [];
  ws.on('message', payload => {
    const msg = JSON.parse(payload.toString());
    history.push(msg);
    for (const watcher of [...watchers]) {
      if (watcher.type === msg.type && watcher.predicate(msg)) {
        watchers.splice(watchers.indexOf(watcher), 1);
        clearTimeout(watcher.timer);
        watcher.resolve(msg);
      }
    }
  });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return {
    ws,
    waitFor(type, predicate = () => true) {
      const previous = history.find(msg => msg.type === type && predicate(msg));
      if (previous) return Promise.resolve(previous);
      return new Promise((resolve, reject) => {
        const watcher = { type, predicate, resolve, timer: null };
        watcher.timer = setTimeout(() => {
          const index = watchers.indexOf(watcher);
          if (index !== -1) watchers.splice(index, 1);
          reject(new Error('Timed out waiting for ' + type));
        }, 7_000);
        watchers.push(watcher);
      });
    },
    send(type, values = {}) { ws.send(JSON.stringify({ type, ...values })); },
  };
}

test('two browsers join room 123 and receive server match start and targets', { timeout: 25_000 }, async () => {
  const { server, ready } = spawnServer();
  let host, guest;
  try {
    const port = await ready;
    host = await connect(port);
    guest = await connect(port);
    host.send('room:create', {
      name: 'Хозяин',
      options: { mode: 'targets', code: '123', title: 'Тестовый тир', maxPlayers: 2, durationSec: 30 },
    });
    const created = await host.waitFor('room:joined');
    assert.equal(created.room.code, '123');
    assert.equal(created.room.phase, 'lobby');
    guest.send('room:join', { code: '123', name: 'Друг' });
    const joined = await guest.waitFor('room:joined');
    assert.equal(joined.room.players.length, 2);
    assert.equal((await host.waitFor('room:update', m => m.room.players.length === 2)).room.code, '123');

    host.send('round:start');
    const hostStart = await host.waitFor('room:update', m => m.room.phase === 'playing');
    const guestStart = await guest.waitFor('room:update', m => m.room.phase === 'playing');
    assert.equal(hostStart.room.phase, 'playing');
    assert.equal(guestStart.room.phase, 'playing');
    assert.equal(hostStart.room.endsAt - hostStart.room.startedAt, 30_000);
    assert.ok((await host.waitFor('targets:update', m => m.targets.length > 0)).targets.length > 0);
    assert.ok((await guest.waitFor('targets:update', m => m.targets.length > 0)).targets.length > 0);
  } finally {
    host?.ws.close();
    guest?.ws.close();
    server.kill('SIGTERM');
  }
});
