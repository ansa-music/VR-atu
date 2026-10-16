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
  // Short numeric room code. 000–999 are valid; rooms are discoverable by guessing.
  const alphabet = '0123456789';
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = Array.from(randomBytes(3), n => alphabet[n % alphabet.length]).join('');
    if (!existing.has(code)) return code;
  }
  throw new Error('Cannot allocate room code');
}

export class RoomStore {
  constructor({ now = () => Date.now() } = {}) {
    this.rooms = new Map();
    this.now = now;
  }

  create(player, name, options = {}) {
    const requested = String(options.code ?? '').trim();
    if (requested && !/^\d{3}$/.test(requested)) throw new Error('INVALID_CODE');
    const code = requested || makeCode(this.rooms);
    if (this.rooms.has(code)) throw new Error('CODE_TAKEN');
    const limit = Number(options.maxPlayers);
    const duration = Number(options.durationSec);
    const room = { code, hostId: player.id, phase: 'lobby', players: new Map(), startedAt: null, endsAt: null,
      title: safeName(options.title || 'Комната ATU'), maxPlayers: Number.isInteger(limit) && limit >= 2 && limit <= 8 ? limit : 8,
      durationSec: [30, 60, 90, 120].includes(duration) ? duration : 60,
      mode: options.mode === 'targets' ? 'targets' : 'pvp' };
    this.rooms.set(code, room);
    this.addPlayer(room, player, name);
    return room;
  }

  addPlayer(room, player, name) {
    this.tick(room);
    if (room.phase === 'playing') throw new Error('ROUND_IN_PROGRESS');
    if (room.players.size >= room.maxPlayers) throw new Error('ROOM_FULL');
    const alphaCount=[...room.players.values()].filter(p=>p.team==='alpha').length;
    const bravoCount=room.players.size-alphaCount;
    const team = alphaCount <= bravoCount ? 'alpha' : 'bravo';
    room.players.set(player.id, {
      id:player.id,name:safeName(name),team,score:0,shots:0,hits:0,kills:0,deaths:0,
      combo:0,ready:false,skin:'cyan',health:100,alive:true,spawn:null,spawnSeq:0,
    });
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
    room.endsAt = room.startedAt + room.durationSec * 1000;
    for (const p of room.players.values()) { p.score = 0; p.shots = 0; p.hits = 0; p.combo = 0; }
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
      title: room.title, maxPlayers: room.maxPlayers, durationSec: room.durationSec, mode: room.mode,
      serverTime: this.now(), startedAt: room.startedAt, endsAt: room.endsAt,
      players: [...room.players.values()].map(p => ({ ...p })),
    };
  }
}

export function newPlayer(socket) {
  return { id: randomUUID(), socket, roomCode: null, lastPoseAt: 0, lastShotAt: 0, windowStart: Date.now(), messageCount: 0 };
}
