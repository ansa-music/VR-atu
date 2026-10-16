import * as THREE from 'three';
import { MultiplayerClient } from './multiplayer.js?v=atu-mpnav-20261016d';
import { skinId } from './skins.js';
import { createCombatAvatar } from './combat-avatar.js';

// Single connection controls both room presence and remote characters.
// Geometries/insignia textures are shared; each avatar disposes only its
// own materials. Orientation is split into head pitch and upright torso yaw.
export function initializeMultiplayerPresence(scene, camera) {
  const participants = new Map();
  const scratchPos = new THREE.Vector3();
  const scratchRot = new THREE.Quaternion();
  const scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  let client = null;
  let lastPublish = 0;

  function removeAvatar(id) {
    const a = participants.get(id);
    if (!a) return;
    scene.remove(a.model.group);
    a.model.dispose();
    participants.delete(id);
  }
  function clear() {
    for (const id of [...participants.keys()]) removeAvatar(id);
  }
  function ensure(id, player) {
    const previous = participants.get(id);
    if (previous) return previous;
    const model = createCombatAvatar({ skin: player?.skin || 'cyan', team: player?.team || 'alpha' });
    model.group.scale.setScalar(.84);  // adult height ~1.65m from headset origin.
    scene.add(model.group);
    const avatar = {
      model, target: new THREE.Vector3(), position: model.group.position,
      targetQuaternion: new THREE.Quaternion(), filteredQuaternion: new THREE.Quaternion(),
      lastSeen: performance.now(), lastPoseAt: 0, initialized: false, spawnSeq: 0,
      skin: skinId(player?.skin), team: player?.team || 'alpha',
      health: 100, alive: true, smoothYaw: 0,
    };
    participants.set(id, avatar);
    return avatar;
  }

  function roomUpdate() {
    const players = client?.room?.players || [];
    const ids = new Set(players.map(p => p.id));
    const now = Date.now();
    for (const p of players) {
      if (p.id === client.playerId) continue;
      const a = participants.get(p.id);
      if (!a) continue; // avatar gets created when first pose arrives.
      const newSkin = skinId(p.skin);
      const newTeam = p.team === 'bravo' ? 'bravo' : 'alpha';
      if (a.skin !== newSkin || a.team !== newTeam) {
        a.skin = newSkin;
        a.team = newTeam;
        a.model.setStyle(newSkin, newTeam); // no new geometries or meshes.
      }
      a.health = p.health ?? 100;
      a.alive = p.alive !== false;
      a.model.setHealth(a.health, a.alive, now < (p.invulnerableUntil || 0));
      a.model.group.visible = a.alive && (client.room.mode !== 'pvp' || client.room.phase === 'playing');
      if (Array.isArray(p.spawn) && p.spawnSeq && a.spawnSeq !== p.spawnSeq) {
        a.spawnSeq = p.spawnSeq;
        a.target.fromArray(p.spawn);
        a.position.copy(a.target);
        a.initialized = true;
      }
    }
    for (const id of participants.keys()) if (!ids.has(id)) removeAvatar(id);
  }

  function connected(event) {
    const { url, action, code, name, options } = event.detail || {};
    if (typeof url !== 'string' || !/^wss?:\/\//i.test(url)) return;
    client?.disconnect();
    clear();
    const connection = new MultiplayerClient(url);
    client = connection;
    const send = (type, data) => client === connection && connection.send(type, data);
    window.dispatchEvent(new CustomEvent('mp:transport', { detail: { send } }));

    connection.addEventListener('room:joined', () => {
      if (client !== connection) return;
      roomUpdate();
      connection.send('player:skin', { skin: skinId(window.vrAtuSelectedSkin) });
    });
    connection.addEventListener('room:update', () => {
      if (client === connection) roomUpdate();
    });
    connection.addEventListener('room:left', () => {
      if (client === connection) clear();
    });
    connection.addEventListener('status', e => {
      if (client === connection && e.detail.state === 'disconnected') clear();
    });
    connection.addEventListener('player:pose', e => {
      if (client !== connection) return;
      const p = e.detail;
      if (p.id === connection.playerId || !Array.isArray(p.position) || !Array.isArray(p.rotation)) return;
      const member = connection.room?.players?.find(x => x.id === p.id);
      const a = ensure(p.id, member);
      a.target.fromArray(p.position);
      a.targetQuaternion.fromArray(p.rotation).normalize();
      if (!a.initialized) {
        a.position.copy(a.target);
        a.filteredQuaternion.copy(a.targetQuaternion);
        a.initialized = true;
      }
      a.lastPoseAt = a.lastSeen = performance.now();
      a.model.group.visible = member?.alive !== false &&
        (connection.room?.mode !== 'pvp' || connection.room?.phase === 'playing');
    });

    // Keep all existing high-level UI and PvP listeners working.
    const relay = type => connection.addEventListener(type, e => {
      if (client === connection) window.dispatchEvent(new CustomEvent('mp:' + type, { detail: e.detail }));
    });
    ['room:joined', 'room:update', 'room:left', 'targets:update', 'shot:result', 'error', 'status'].forEach(relay);

    connection.connect().then(() => {
      if (client !== connection) return;
      if (action === 'create') connection.createRoom(name, options);
      else connection.joinRoom(code, name);
    }).catch(() => {
      if (client === connection)
        window.dispatchEvent(new CustomEvent('mp:error', { detail: { code: 'CONNECTION_FAILED' } }));
    });
  }
  window.addEventListener('mp:configure', connected);
  window.addEventListener('skin:changed', e => client?.send('player:skin', { skin: skinId(e.detail?.skin) }));
  window.addEventListener('mp:start-round', () => client?.startRound());

  function disconnectRoom() {
    const previous = client;
    client = null;
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
      camera.getWorldPosition(scratchPos);
      camera.getWorldQuaternion(scratchRot);
      client.sendPose(scratchPos.toArray(), [scratchRot.x, scratchRot.y, scratchRot.z, scratchRot.w]);
    }
    const alpha = 1 - Math.exp(-Math.max(0, dt) * 12);
    for (const [id, a] of participants) {
      if (now - a.lastSeen > 10_000) {
        removeAvatar(id);
        continue;
      }
      const distance = a.position.distanceTo(a.target);
      const speed = dt > 0 ? Math.min(4.5, distance / dt) : 0;
      a.position.lerp(a.target, alpha);
      a.filteredQuaternion.slerp(a.targetQuaternion, alpha);
      scratchEuler.setFromQuaternion(a.filteredQuaternion, 'YXZ');
      const difference = Math.atan2(Math.sin(scratchEuler.y - a.smoothYaw), Math.cos(scratchEuler.y - a.smoothYaw));
      a.smoothYaw += difference * alpha;
      a.model.animate(dt, a.smoothYaw, scratchEuler.x, speed);
    }
  };
}
