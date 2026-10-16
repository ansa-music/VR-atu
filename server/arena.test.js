import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomStore } from './rooms.js';
import { clearArena, tickArena, targetsSnapshot, shoot } from './arena.js';

const makeRound = () => {
  let time = 1000;
  const store = new RoomStore({ now: () => time });
  const player = { id: 'p1', roomCode: null };
  const room = store.create(player, 'Tester', { mode: 'targets' });
  store.start(room, player.id);
  clearArena(room);
  return { room, player, setNow: v => { time = v; } };
};

test('shared targets spawn and expire', () => {
  const { room } = makeRound();
  assert.equal(tickArena(room, 1000), true);
  assert.equal(targetsSnapshot(room).length, 1);
  const id = targetsSnapshot(room)[0].id;
  tickArena(room, 8000);
  assert.ok(!room.targets.has(id));
});

test('server calculates hit points and prevents double scoring', () => {
  const { room, player } = makeRound();
  room.targets.set('first', { id: 'first', type: 'gold', position: [0, 1.6, -5], radius: 0.37, expiresAt: 8000 });
  const ray = { origin: [0, 1.6, 0], direction: [0, 0, -1] };
  const first = shoot(room, player.id, ray, 2000);
  assert.equal(first.hit, true);
  assert.equal(first.points, 3);
  assert.equal(room.players.get(player.id).score, 3);
  const second = shoot(room, player.id, ray, 2001);
  assert.equal(second.hit, false);
  assert.equal(room.players.get(player.id).score, 3);
});

test('bomb reduces score without going below zero', () => {
  const { room, player } = makeRound();
  room.targets.set('bomb', { id: 'bomb', type: 'bomb', position: [0, 1.6, -3], radius: 0.37, expiresAt: 8000 });
  const result = shoot(room, player.id, { origin: [0, 1.6, 0], direction: [0, 0, -1] }, 2000);
  assert.equal(result.points, -5);
  assert.equal(room.players.get(player.id).score, 0);
});

test('invalid rays and inactive rounds do not award points', () => {
  const { room, player } = makeRound();
  assert.equal(shoot(room, player.id, { origin: [0, 0, 0], direction: [0, 0, 12] }, 2000).error, 'INVALID_RAY');
  room.phase = 'finished';
  assert.equal(shoot(room, player.id, { origin: [0, 0, 0], direction: [0, 0, -1] }, 2000).error, 'ROUND_NOT_ACTIVE');
});

test('expired targets cannot score between arena ticks', () => {
  const { room, player } = makeRound();
  room.targets.set('expired', { id: 'expired', type: 'gold', position: [0, 1.6, -3], radius: 0.37, expiresAt: 2000 });
  const result = shoot(room, player.id, { origin: [0, 1.6, 0], direction: [0, 0, -1] }, 2000);
  assert.equal(result.hit, false);
  assert.equal(room.players.get(player.id).score, 0);
});
