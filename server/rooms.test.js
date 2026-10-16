import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomStore, MAX_PLAYERS, safeName } from './rooms.js';

let counter = 0;
const player = () => ({ id: 'p' + ++counter, roomCode: null });

test('room creation, join and host transfer', () => {
  const store = new RoomStore();
  const host = player(), guest = player();
  const room = store.create(host, 'Host');
  assert.match(room.code, /^[A-Z2-9]{6}$/);
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
