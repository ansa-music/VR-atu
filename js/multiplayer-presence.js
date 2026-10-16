import * as THREE from 'three';
import { MultiplayerClient } from './multiplayer.js';
import { createRemoteAvatar, skinId } from './skins.js';

// Experimental network presence. Solo gameplay, scoring and targets remain LOCAL.
export function initializeMultiplayerPresence(scene, camera) {
  const participants = new Map();
  const remoteSkins = new Map();
  let client = null;
  let lastPublish = 0;

  function clear() {
    for (const avatar of participants.values()) scene.remove(avatar.group);
    participants.clear();
    remoteSkins.clear();
  }

  function ensure(id) {
    if (participants.has(id)) return participants.get(id);
    const { group } = createRemoteAvatar(remoteSkins.get(id) || 'cyan');
    scene.add(group);
    const item = { group, target: new THREE.Vector3(), quaternion: new THREE.Quaternion(), lastSeen: performance.now() };
    participants.set(id, item);
    return item;
  }

  function roomUpdate() {
    const players = client?.room?.players || [];
    const ids = new Set(players.map(p => p.id));
    for (const p of players) {
      const nextSkin = skinId(p.skin);
      if (remoteSkins.get(p.id) !== nextSkin) {
        remoteSkins.set(p.id, nextSkin);
        const existing = participants.get(p.id);
        if (existing) {
          const { group: replacement } = createRemoteAvatar(nextSkin);
          replacement.position.copy(existing.group.position);
          replacement.quaternion.copy(existing.group.quaternion);
          scene.remove(existing.group);
          scene.add(replacement);
          existing.group = replacement;
        }
      }
    }
    for (const [id, avatar] of participants) {
      if (!ids.has(id)) { scene.remove(avatar.group); participants.delete(id); remoteSkins.delete(id); }
    }
  }

  window.addEventListener('mp:configure', async (event) => {
    const { url, action, code, name, options } = event.detail || {};
    if (typeof url !== 'string' || !/^wss?:\/\//i.test(url)) return;
    client?.disconnect();
    clear();
    client = new MultiplayerClient(url);
    window.dispatchEvent(new CustomEvent('mp:transport', { detail: { send: (type, data) => client.send(type, data) } }));
    client.addEventListener('room:joined', e => {
      roomUpdate();
      client.send('player:skin', { skin: skinId(window.vrAtuSelectedSkin) });
    });
    client.addEventListener('room:update', roomUpdate);
    client.addEventListener('room:left', clear);
    client.addEventListener('status', e => { if (e.detail.state === 'disconnected') clear(); });
    client.addEventListener('player:pose', e => {
      const p = e.detail;
      if (p.id === client.playerId) return;
      const avatar = ensure(p.id);
      avatar.target.fromArray(p.position);
      avatar.quaternion.fromArray(p.rotation);
      avatar.lastSeen = performance.now();
    });
    const relay = type => client.addEventListener(type, e => window.dispatchEvent(new CustomEvent('mp:' + type, { detail: e.detail })));
    ['room:joined', 'room:update', 'room:left', 'targets:update', 'shot:result', 'error', 'status'].forEach(relay);
    try {
      await client.connect();
      if (action === 'create') client.createRoom(name, options);
      else client.joinRoom(code, name);
    } catch (error) {
      window.dispatchEvent(new CustomEvent('mp:error', { detail: { code: 'CONNECTION_FAILED' } }));
    }
  });
  window.addEventListener('skin:changed', e => client?.send('player:skin', { skin: skinId(e.detail?.skin) }));
  window.addEventListener('mp:start-round', () => client?.startRound());
  window.addEventListener('mp:leave', () => { client?.leaveRoom(); clear(); });

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
