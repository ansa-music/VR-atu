import * as THREE from 'three';
import { MultiplayerClient } from './multiplayer.js';

// Experimental network presence. Solo gameplay, scoring and targets remain LOCAL.
export function initializeMultiplayerPresence(scene, camera) {
  const participants = new Map();
  const headGeometry = new THREE.SphereGeometry(0.2, 12, 8);
  const bodyGeometry = new THREE.CylinderGeometry(0.23, 0.28, 0.82, 10);
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0xe5d8ff, roughness: 0.55 });
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x563dd0, emissive: 0x271070, emissiveIntensity: 0.35 });
  let client = null;
  let lastPublish = 0;

  function clear() {
    for (const avatar of participants.values()) scene.remove(avatar.group);
    participants.clear();
  }

  function ensure(id) {
    if (participants.has(id)) return participants.get(id);
    const group = new THREE.Group();
    const head = new THREE.Mesh(headGeometry, headMaterial);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    head.position.y = 0;
    body.position.y = -0.65;
    group.add(head, body);
    scene.add(group);
    const item = { group, target: new THREE.Vector3(), quaternion: new THREE.Quaternion(), lastSeen: performance.now() };
    participants.set(id, item);
    return item;
  }

  function roomUpdate() {
    const ids = new Set((client?.room?.players || []).map(p => p.id));
    for (const [id, avatar] of participants) {
      if (!ids.has(id)) { scene.remove(avatar.group); participants.delete(id); }
    }
  }

  window.addEventListener('mp:configure', async (event) => {
    const { url, action, code, name } = event.detail || {};
    if (typeof url !== 'string' || !/^wss?:\/\//i.test(url)) return;
    client?.disconnect();
    clear();
    client = new MultiplayerClient(url);
    client.addEventListener('room:joined', roomUpdate);
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
    ['room:joined', 'room:update', 'room:left', 'error', 'status'].forEach(relay);
    try {
      await client.connect();
      if (action === 'create') client.createRoom(name);
      else client.joinRoom(code, name);
    } catch (error) {
      window.dispatchEvent(new CustomEvent('mp:error', { detail: { code: 'CONNECTION_FAILED' } }));
    }
  });
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
