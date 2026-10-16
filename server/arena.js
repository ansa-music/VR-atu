// Server-authoritative target state and ray hits for the shared arena.
import { randomUUID } from 'node:crypto';
const TYPES = ['normal', 'normal', 'normal', 'normal', 'normal', 'gold', 'bomb'];
const MAX_TARGETS = 10;
const TARGET_LIFE_MS = 6500;
const SPAWN_MS = 950;
const RADIUS = 0.37;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const vector = v => Array.isArray(v) && v.length === 3 && v.every(x => Number.isFinite(x));

export function clearArena(room) {
  room.targets = new Map();
  room.nextSpawnAt = 0;
}

export function tickArena(room, now) {
  if (!room.targets) clearArena(room);
  if (room.phase !== 'playing') {
    if (room.targets.size) room.targets.clear();
    return false;
  }
  let changed = false;
  for (const [id, t] of room.targets) {
    if (now >= t.expiresAt) { room.targets.delete(id); changed = true; }
  }
  if (room.targets.size < MAX_TARGETS && now >= room.nextSpawnAt) {
    const type = TYPES[Math.floor(Math.random() * TYPES.length)];
    const target = {
      id: randomUUID(), type,
      position: [
        Number((Math.random() * 15 - 7.5).toFixed(2)),
        Number((1 + Math.random() * 2).toFixed(2)),
        Number((Math.random() * 15 - 7.5).toFixed(2)),
      ],
      radius: RADIUS, expiresAt: now + TARGET_LIFE_MS,
    };
    room.targets.set(target.id, target);
    room.nextSpawnAt = now + SPAWN_MS;
    changed = true;
  }
  return changed;
}

export function targetsSnapshot(room) {
  return [...(room.targets?.values() || [])].map(t => ({ ...t, position: [...t.position] }));
}

export function shoot(room, playerId, data, now) {
  if (room.phase !== 'playing' || now >= room.endsAt) return { error: 'ROUND_NOT_ACTIVE' };
  const player = room.players.get(playerId);
  if (!player) return { error: 'NOT_IN_ROOM' };
  if (!vector(data?.origin) || !vector(data?.direction)) return { error: 'INVALID_RAY' };
  const origin = data.origin, direction = data.direction;
  if (origin.some(x => Math.abs(x) > 50) || direction.some(x => Math.abs(x) > 1.01)) return { error: 'INVALID_RAY' };
  const length = Math.hypot(...direction);
  if (length < 0.98 || length > 1.02) return { error: 'INVALID_RAY' };
  player.shots++;
  let closest = null, bestDistance = 25;
  for (const target of room.targets?.values() || []) {
    const offset = target.position.map((v, i) => v - origin[i]);
    const projected = offset.reduce((sum, value, i) => sum + value * direction[i], 0);
    if (projected < 0 || projected > bestDistance) continue;
    const squared = offset.reduce((sum, value) => sum + value * value, 0) - projected * projected;
    if (squared <= target.radius * target.radius) { closest = target; bestDistance = projected; }
  }
  if (!closest) { player.combo = 0; return { hit: false, playerId }; }
  room.targets.delete(closest.id);
  const bomb = closest.type === 'bomb';
  player.combo = bomb ? 0 : (player.combo || 0) + 1;
  if (!bomb) player.hits++;
  const multiplier = clamp(1 + Math.floor(player.combo / 5), 1, 4);
  const points = bomb ? -5 : (closest.type === 'gold' ? 3 : 1) * multiplier;
  player.score = Math.max(0, player.score + points);
  return { hit: true, targetId: closest.id, targetType: closest.type, playerId, points, score: player.score };
}
