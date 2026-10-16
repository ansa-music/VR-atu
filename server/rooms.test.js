import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomStore, MAX_PLAYERS, safeName } from './rooms.js';

let counter = 0;
const player = () => ({ id: 'p' + ++counter, roomCode: null });

test('room creation, join and host transfer', () => {
  const store = new RoomStore();
  const host = player(), guest = player();
  const room = store.create(host, 'Host');
  assert.match(room.code, /^\\d{3}$/);
  store.join(room.code.toLowerCase(), guest, 'Guest');
  assert.equal(store.snapshot(room).players.length, 2);
  store.leave(host);
  assert.equal(room.hostId, guest.id);
  store.leave(guest);
  assert.equal(store.rooms.size, 0);
});

test('host starts round, cannot start while running, round times out', () => {
  let now = 1000;
  const store = new RoomStore({ now: () => now });
  const host = player(), guest = player();
  const room = store.create(host, 'Host');
  store.join(room.code, guest, 'Guest');
  assert.throws(() => store.start(room, guest.id), /HOST_ONLY/);
  store.start(room, host.id);
  assert.throws(() => store.start(room, host.id), /ROUND_IN_PROGRESS/);
  now += 60_001;
  assert.equal(store.snapshot(room).phase, 'finished');
  store.start(room, host.id);
  assert.equal(room.phase, 'playing');
});

test('room capacity and invalid code', () => {
  const store = new RoomStore();
  const room = store.create(player(), 'H');
  for (let i = 1; i < MAX_PLAYERS; i++) store.join(room.code, player(), 'G');
  assert.throws(() => store.join(room.code, player(), 'G'), /ROOM_FULL/);
  assert.throws(() => store.join('NOTREAL', player(), 'G'), /ROOM_NOT_FOUND/);
});

test('names are limited and sanitized', () => {
  assert.equal(safeName('<Bob>'), 'Bob');
  assert.equal(safeName(''), 'Игрок');
  assert.equal(safeName('a'.repeat(40)).length, 20);
});

test('custom 123 code, collision and configurable room', () => {
  const store = new RoomStore();
  const host = player();
  const room = store.create(host, 'Хозяин', { code: '123', title: 'Турнир', maxPlayers: 2, durationSec: 90 });
  assert.equal(room.code, '123');
  assert.equal(store.snapshot(room).title, 'Турнир');
  assert.equal(store.snapshot(room).maxPlayers, 2);
  assert.equal(store.snapshot(room).durationSec, 90);
  assert.throws(() => store.create(player(), 'Друг', { code: '123' }), /CODE_TAKEN/);
  store.join('123', player(), 'Друг');
  assert.throws(() => store.join('123', player(), 'Третий'), /ROOM_FULL/);
  store.start(room, host.id);
  assert.equal(room.endsAt - room.startedAt, 90000);
});

test('reject invalid requested code and constrain duration/capacity', () => {
  const store = new RoomStore();
  assert.throws(() => store.create(player(), 'A', {code:'12a'}), /INVALID_CODE/);
  const room = store.create(player(), 'B', {maxPlayers:100, durationSec:999});
  assert.equal(room.maxPlayers,8);
  assert.equal(room.durationSec,60);
});
