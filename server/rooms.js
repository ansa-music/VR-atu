import { randomBytes, randomUUID } from 'node:crypto';

export const MAX_PLAYERS = 8;
export const ROUND_MS = 60_000;
export const MAX_NAME_LENGTH = 20;

export function safeName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const cleaned = value.replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, MAX_NAME_LENGTH);
  return cleaned || 'Игрок';
}

export function makeCode(existing) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = Array.from(randomBytes(6), n => alphabet[n % alphabet.length]).join('');
    if (!existing.has(code)) return code;
  }
  throw new Error('Cannot allocate room code');
}

export class RoomStore {
  constructor({ now = () => Date.now() } = {}) {
    this.rooms = new Map();
    this.now = now;
  }

  create(player, name) {
    const code = makeCode(this.rooms);
    const room = { code, hostId: player.id, phase: 'lobby', players: new Map(), startedAt: null, endsAt: null };
    this.rooms.set(code, room);
    this.addPlayer(room, player, name);
    return room;
  }

  addPlayer(room, player, name) {
    if (room.phase !== 'lobby') throw new Error('ROUND_IN_PROGRESS');
    if (room.players.size >= MAX_PLAYERS) throw new Error('ROOM_FULL');
    room.players.set(player.id, { id: player.id, name: safeName(name), score: 0, shots: 0, hits: 0, ready: false });
    player.roomCode = room.code;
    return room;
  }

  join(code, player, name) {
    if (typeof code !== 'string') throw new Error('INVALID_CODE');
    const room = this.rooms.get(code.trim().toUpperCase());
    if (!room) throw new Error('ROOM_NOT_FOUND');
    return this.addPlayer(room, player, name);
  }

  getFor(player) { return player.roomCode ? this.rooms.get(player.roomCode) : null; }

  leave(player) {
    const room = this.getFor(player);
    player.roomCode = null;
    if (!room) return null;
    room.players.delete(player.id);
    if (!room.players.size) this.rooms.delete(room.code);
    else if (room.hostId === player.id) room.hostId = room.players.keys().next().value;
    return this.rooms.has(room.code) ? room : null;
  }

  start(room, playerId) {
    if (room.hostId !== playerId) throw new Error('HOST_ONLY');
    if (room.phase !== 'lobby' && room.phase !== 'finished') throw new Error('ROUND_IN_PROGRESS');
    room.phase = 'playing';
    room.startedAt = this.now();
    room.endsAt = room.startedAt + ROUND_MS;
    for (const p of room.players.values()) { p.score = 0; p.shots = 0; p.hits = 0; }
    return room;
  }

  tick(room) {
    if (room.phase === 'playing' && this.now() >= room.endsAt) room.phase = 'finished';
    return room.phase;
  }

  snapshot(room) {
    this.tick(room);
    return {
      code: room.code, hostId: room.hostId, phase: room.phase,
      serverTime: this.now(), endsAt: room.endsAt,
      players: [...room.players.values()].map(p => ({ ...p })),
    };
  }
}

export function newPlayer(socket) {
  return { id: randomUUID(), socket, roomCode: null, lastPoseAt: 0, lastShotAt: 0, windowStart: Date.now(), messageCount: 0 };
}
