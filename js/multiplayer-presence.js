import * as THREE from 'three';
import { MultiplayerClient } from './multiplayer.js?v=atu-mpnav-20261016d';
import { createRemoteAvatar, skinId } from './skins.js';

// Experimental network presence. Solo gameplay, scoring and targets remain LOCAL.
export function initializeMultiplayerPresence(scene, camera) {
  const participants = new Map();
  const remoteSkins = new Map();
  const remoteTeams = new Map();
  let client = null;
  let lastPublish = 0;

  function clear() {
    for (const avatar of participants.values()) scene.remove(avatar.group);
    participants.clear();
    remoteSkins.clear();
    remoteTeams.clear();
  }

  function ensure(id) {
    if (participants.has(id)) return participants.get(id);
    const group = makeTeamAvatar(id);
    scene.add(group);
    const item = { group, target: new THREE.Vector3(), quaternion: new THREE.Quaternion(), lastSeen: performance.now() };
    participants.set(id, item);
    return item;
  }

  function makeTeamAvatar(id) {
    const { group } = createRemoteAvatar(remoteSkins.get(id) || 'cyan');
    group.scale.setScalar(0.80); // feet near floor for a 1.6m tracked head.
    const team = remoteTeams.get(id) || 'alpha';
    const color = team === 'alpha' ? 0x3ec5ff : 0xff9b54;
    const glow = new THREE.MeshBasicMaterial({color});
    for (const x of [-0.16,0.16]) {
      const patch = new THREE.Mesh(new THREE.BoxGeometry(.12,.055,.018),glow);
      patch.position.set(x,-.44,-.195);
      group.add(patch);
    }
    const badge = new THREE.Mesh(new THREE.BoxGeometry(.14,.018,.018),glow);
    badge.position.set(0,-.52,-.201);
    group.add(badge);
    return group;
  }

  function roomUpdate() {
    const players = client?.room?.players || [];
    const ids = new Set(players.map(p => p.id));
    for (const p of players) {
      const nextSkin = skinId(p.skin);
      const nextTeam = p.team || 'alpha';
      if (remoteSkins.get(p.id) !== nextSkin || remoteTeams.get(p.id) !== nextTeam) {
        remoteSkins.set(p.id, nextSkin);
        remoteTeams.set(p.id, nextTeam);
        const existing = participants.get(p.id);
        if (existing) {
          const replacement = makeTeamAvatar(p.id);
          replacement.position.copy(existing.group.position);
          replacement.quaternion.copy(existing.group.quaternion);
          scene.remove(existing.group);
          scene.add(replacement);
          existing.group = replacement;
        }
      }
    }
    for (const p of players) {
      const avatar = participants.get(p.id);
      if (!avatar) continue;
      avatar.group.visible = p.alive !== false;
      if (Array.isArray(p.spawn) && p.spawnSeq && avatar.spawnSeq !== p.spawnSeq) {
        avatar.spawnSeq = p.spawnSeq;
        avatar.target.fromArray(p.spawn);
        avatar.group.position.copy(avatar.target);
        avatar.lastSeen = performance.now();
      }
    }
    for (const [id, avatar] of participants) {
      if (!ids.has(id)) { scene.remove(avatar.group); participants.delete(id); remoteSkins.delete(id); remoteTeams.delete(id); }
    }
  }

  window.addEventListener('mp:configure', async (event) => {
    const { url, action, code, name, options } = event.detail || {};
    if (typeof url !== 'string' || !/^wss?:\/\//i.test(url)) return;
    client?.disconnect();
    clear();
    const connection = new MultiplayerClient(url);
    client = connection;
    window.dispatchEvent(new CustomEvent('mp:transport', { detail: { send: (type, data) => client === connection && connection.send(type, data) } }));
    client.addEventListener('room:joined', e => {
      if (client !== connection) return;
      roomUpdate();
      client.send('player:skin', { skin: skinId(window.vrAtuSelectedSkin) });
    });
    client.addEventListener('room:update', () => { if (client === connection) roomUpdate(); });
    client.addEventListener('room:left', () => { if (client === connection) clear(); });
    client.addEventListener('status', e => { if (client === connection && e.detail.state === 'disconnected') clear(); });
    client.addEventListener('player:pose', e => {
      if (client !== connection) return;
      const p = e.detail;
      if (p.id === client.playerId) return;
      const fresh = !participants.has(p.id);
      const avatar = ensure(p.id);
      avatar.target.fromArray(p.position);
      if (fresh) avatar.group.position.copy(avatar.target);
      avatar.quaternion.fromArray(p.rotation);
      avatar.lastSeen = performance.now();
    });
    const relay = type => connection.addEventListener(type, e => {
      if (client === connection) window.dispatchEvent(new CustomEvent('mp:' + type, { detail: e.detail }));
    });
    ['room:joined', 'room:update', 'room:left', 'targets:update', 'shot:result', 'error', 'status'].forEach(relay);
    try {
      await connection.connect();
      if (client !== connection) return;
      if (action === 'create') client.createRoom(name, options);
      else client.joinRoom(code, name);
    } catch (error) {
      if (client !== connection) return;
      window.dispatchEvent(new CustomEvent('mp:error', { detail: { code: 'CONNECTION_FAILED' } }));
    }
  });
  window.addEventListener('skin:changed', e => client?.send('player:skin', { skin: skinId(e.detail?.skin) }));
  window.addEventListener('mp:start-round', () => client?.startRound());
  function disconnectRoom() {
    const previous = client;
    client = null; // Ignore delayed events from the connection we are closing.
    previous?.disconnect();
    clear();
    window.dispatchEvent(new CustomEvent('mp:room:left', { detail: {} }));
  }
  window.addEventListener('mp:leave', disconnectRoom);
  window.addEventListener('mp:cancel', disconnectRoom);

  return function update(now, dt) {
    if (client?.room && client.state === 'connected' && now - lastPublish >= 60) {
      lastPublish = now;
      camera.updateWorldMatrix(true, false);
      const pos = camera.getWorldPosition(new THREE.Vector3());
      const rot = camera.getWorldQuaternion(new THREE.Quaternion());
      client.sendPose(pos.toArray(), rot.toArray());
    }
    for (const [id, avatar] of participants) {
      if (now - avatar.lastSeen > 10000) { scene.remove(avatar.group); participants.delete(id); continue; }
      const alpha = 1 - Math.exp(-Math.max(0, dt) * 12);
      avatar.group.position.lerp(avatar.target, alpha);
      avatar.group.quaternion.slerp(avatar.quaternion, alpha);
    }
  };
}
