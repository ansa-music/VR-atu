import * as THREE from 'three';

// Multiplayer scene is separate from the existing solo target logic.
export function createSharedArena(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const meshes = new Map();
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const mats = {
    normal: new THREE.MeshStandardMaterial({ color: 0x3ec5ff, emissive: 0x166a94, emissiveIntensity: 0.6 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.35, roughness: 0.3, emissive: 0x997100 }),
    bomb: new THREE.MeshStandardMaterial({ color: 0xff2244, emissive: 0x661122 }),
  };
  const ray = new THREE.Raycaster();
  let active = false;
  let phase = 'lobby';
  let mode = 'targets';
  let endsAt = null;
  let serverOffset = 0;
  let ownId = null;
  let players = [];
  let me = null;
  let clientSend = null;
  let lastShot = 0;

  function clear() {
    for (const mesh of meshes.values()) group.remove(mesh);
    meshes.clear();
  }
  function setRoom(room) {
    active = !!room;
    phase = room?.phase || 'lobby';
    mode = room?.mode || 'targets';
    if (!room) { clear(); players = []; me = null; ownId = null; return; }
    players = room.players || [];
    me = players.find(p => p.id === ownId) || null;
    endsAt = room.endsAt;
    serverOffset = room.serverTime - Date.now();
    if (phase !== 'playing' || mode === 'pvp') clear();
    window.dispatchEvent(new CustomEvent('mp:scoreboard', { detail: {
      players: [...players].sort((a, b) => b.score - a.score), phase, mode,
      remaining: Math.max(0, Math.ceil(((endsAt || 0) - Date.now() - serverOffset) / 1000)),
    } }));
  }
  window.addEventListener('mp:room:joined', e => { ownId = e.detail.playerId; setRoom(e.detail.room); });
  window.addEventListener('mp:room:update', e => setRoom(e.detail.room));
  window.addEventListener('mp:room:left', () => setRoom(null));
  window.addEventListener('mp:status', e => { if (e.detail.state === 'disconnected') setRoom(null); });
  window.addEventListener('mp:targets:update', e => {
    if (!active || phase !== 'playing' || mode === 'pvp') return;
    const targetList = Array.isArray(e.detail.targets) ? e.detail.targets : [];
    const ids = new Set(targetList.map(t => t.id));
    for (const [id, mesh] of meshes) if (!ids.has(id)) { group.remove(mesh); meshes.delete(id); }
    for (const target of targetList) {
      if (!Array.isArray(target.position) || target.position.length !== 3) continue;
      let mesh = meshes.get(target.id);
      if (!mesh) {
        mesh = new THREE.Mesh(geometry, mats[target.type] || mats.normal);
        mesh.scale.setScalar(target.radius);
        group.add(mesh);
        meshes.set(target.id, mesh);
      }
      mesh.position.fromArray(target.position);
    }
  });
  window.addEventListener('mp:shot:result', e => {
    const data = e.detail;
    window.dispatchEvent(new CustomEvent('mp:shot-feedback', { detail: data }));
  });
  window.addEventListener('mp:transport', e => { clientSend = e.detail.send; });

  function fire(origin, direction, weapon = 'ak') {
    if (!active || phase !== 'playing' || !clientSend || (mode === 'pvp' && !me?.alive)) return false;
    const now = performance.now();
    // No artificial 115 ms cap on the AK-74M. Server applies the real profile.
    if (now - lastShot < (mode === 'pvp' ? 65 : 115)) return false;
    lastShot = now;
    return !!clientSend('player:shot', {
      origin: origin.toArray(), direction: direction.toArray(), weapon,
    });
  }

  return {
    get active() { return active; },
    get mode() { return mode; },
    get isPvp() { return active && mode === 'pvp'; },
    get health() { return me?.health ?? 100; },
    get kills() { return me?.kills || 0; },
    get alive() { return !active || mode !== 'pvp' || !!me?.alive; },
    get team() { return me?.team || 'alpha'; },
    get playing() { return active && phase === 'playing'; },
    get score() { return me?.score || 0; },
    get timeLeft() { return phase === 'playing' ? Math.max(0, ((endsAt || 0) - Date.now() - serverOffset) / 1000) : 0; },
    fire,
    update(dt) {
      if (!active) return;
      for (const mesh of meshes.values()) mesh.rotation.y += dt * 0.8;
    },
    dispose() { clear(); scene.remove(group); geometry.dispose(); Object.values(mats).forEach(m => m.dispose()); },
  };
}
