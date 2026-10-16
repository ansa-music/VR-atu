import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { RoomStore, newPlayer } from './rooms.js';
import { clearArena, tickArena, targetsSnapshot, shoot } from './arena.js';

const PORT = Number(process.env.PORT || 8080);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
const rooms = new RoomStore();
const peers = new Map();
const HEARTBEAT_MS = 15_000;
const MAX_MESSAGES_PER_SECOND = 90;
const MAX_PAYLOAD_BYTES = 4096;

function send(socket, type, data = {}) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, ...data }));
}

function broadcast(room, type, data = {}, exceptId = null) {
  for (const id of room.players.keys()) {
    if (id !== exceptId) {
      const peer = peers.get(id);
      if (peer) send(peer.socket, type, data);
    }
  }
}

function leave(player) {
  const room = rooms.leave(player);
  if (room) broadcast(room, 'room:update', { room: rooms.snapshot(room) });
}

function validVector(v, n, bound = 100) {
  return Array.isArray(v) && v.length === n && v.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= bound);
}

function handle(player, msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.type !== 'string') return;
  const room = rooms.getFor(player);

  switch (msg.type) {
    case 'room:create': {
      if (room) return send(player.socket, 'error', { code: 'ALREADY_IN_ROOM' });
      const created = rooms.create(player, msg.name, msg.options || {});
      send(player.socket, 'room:joined', { playerId: player.id, room: rooms.snapshot(created) });
      break;
    }
    case 'room:join': {
      if (room) return send(player.socket, 'error', { code: 'ALREADY_IN_ROOM' });
      const joined = rooms.join(msg.code, player, msg.name);
      send(player.socket, 'room:joined', { playerId: player.id, room: rooms.snapshot(joined) });
      send(player.socket, 'targets:update', { targets: targetsSnapshot(joined) });
      broadcast(joined, 'room:update', { room: rooms.snapshot(joined) });
      break;
    }
    case 'room:leave':
      leave(player);
      send(player.socket, 'room:left');
      break;
    case 'round:start':
      if (!room) return send(player.socket, 'error', { code: 'NOT_IN_ROOM' });
      rooms.start(room, player.id);
      clearArena(room);
      tickArena(room, Date.now());
      // Сначала переводим всех в состояние игры, затем публикуем первые мишени.
      broadcast(room, 'room:update', { room: rooms.snapshot(room) });
      broadcast(room, 'targets:update', { targets: targetsSnapshot(room) });
      break;
    case 'player:shot': {
      if (!room) return send(player.socket, 'error', { code: 'NOT_IN_ROOM' });
      const now = Date.now();
      if (now - player.lastShotAt < 110) return;
      player.lastShotAt = now;
      if (!player.lastPosition || !Array.isArray(msg.origin) ||
          msg.origin.length !== 3 ||
          !msg.origin.every((v, i) => Number.isFinite(v) && Math.abs(v - player.lastPosition[i]) <= 2.5)) {
        return send(player.socket, 'error', { code: 'UNVERIFIED_SHOT_ORIGIN' });
      }
      const result = shoot(room, player.id, msg, now);
      if (result.error) return send(player.socket, 'error', { code: result.error });
      broadcast(room, 'shot:result', result);
      if (result.hit) {
        broadcast(room, 'targets:update', { targets: targetsSnapshot(room) });
        broadcast(room, 'room:update', { room: rooms.snapshot(room) });
      }
      break;
    }
    case 'player:skin': {
      if (!room) return send(player.socket, 'error', { code: 'NOT_IN_ROOM' });
      const allowed = ['cyan', 'crimson', 'gold', 'obsidian'];
      if (!allowed.includes(msg.skin)) return send(player.socket, 'error', { code: 'INVALID_SKIN' });
      const member = room.players.get(player.id);
      if (member.skin === msg.skin) return;
      member.skin = msg.skin;
      broadcast(room, 'room:update', { room: rooms.snapshot(room) });
      break;
    }
    case 'player:pose': {
      if (!room) return;
      const now = Date.now();
      if (now - player.lastPoseAt < 45) return;
      if (!validVector(msg.position, 3, 50) || !validVector(msg.rotation, 4, 1)) return;
      player.lastPoseAt = now;
      player.lastPosition = [...msg.position];
      broadcast(room, 'player:pose', { id: player.id, position: msg.position, rotation: msg.rotation }, player.id);
      break;
    }
    default: send(player.socket, 'error', { code: 'UNKNOWN_MESSAGE' });
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.rooms.size, players: peers.size }));
  } else {
    res.writeHead(404); res.end('Not found');
  }
});
const wss = new WebSocketServer({
  server, maxPayload: MAX_PAYLOAD_BYTES,
  verifyClient: ({ origin }) => !ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin),
});
wss.on('connection', socket => {
  const player = newPlayer(socket);
  player.alive = true;
  peers.set(player.id, player);
  send(socket, 'welcome', { playerId: player.id, protocol: 1 });

  socket.on('pong', () => { player.alive = true; });
  socket.on('message', raw => {
    const now = Date.now();
    if (now - player.windowStart >= 1000) { player.windowStart = now; player.messageCount = 0; }
    if (++player.messageCount > MAX_MESSAGES_PER_SECOND) { socket.close(1008, 'Rate limit'); return; }
    try { handle(player, JSON.parse(raw.toString())); }
    catch (error) { send(socket, 'error', { code: error.message === 'Unexpected end of JSON input' ? 'BAD_JSON' : (error.message || 'BAD_REQUEST') }); }
  });
  socket.on('close', () => { leave(player); peers.delete(player.id); });
  socket.on('error', () => {});
});

const timer = setInterval(() => {
  for (const player of peers.values()) {
    if (!player.alive) { player.socket.terminate(); continue; }
    player.alive = false; player.socket.ping();
  }
  for (const room of rooms.rooms.values()) {
    const previous = room.phase;
    rooms.tick(room);
    if (tickArena(room, Date.now())) broadcast(room, 'targets:update', { targets: targetsSnapshot(room) });
    if (previous !== room.phase) broadcast(room, 'room:update', { room: rooms.snapshot(room) });
  }
}, HEARTBEAT_MS);

const arenaTimer = setInterval(() => {
  for (const room of rooms.rooms.values()) {
    // Раунд завершается с точностью примерно 100 мс, а не с задержкой до 15 секунд.
    const previous = room.phase;
    rooms.tick(room);
    if (previous !== room.phase) broadcast(room, 'room:update', { room: rooms.snapshot(room) });
    if (tickArena(room, Date.now())) broadcast(room, 'targets:update', { targets: targetsSnapshot(room) });
  }
}, 100);

server.listen(PORT, () => console.log('VR-ATU multiplayer server listening on', server.address().port));
function shutdown() {
  clearInterval(timer);
  clearInterval(arenaTimer);
  for (const { socket } of peers.values()) socket.terminate();
  wss.close();
  server.close();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
