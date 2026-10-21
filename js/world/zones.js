// js/world/zones.js — J: «этажи» в духе SAO поверх 6 биомов, ворота и барьеры, опасности (яд/холод/жар), декор, погода, лава.
// Источник истины по побеждённым боссам: isGateOpen(bossId|gateId), floorUnlocked[n]. Остальные части импортируют отсюда.
// Логика без three (тестируется в node); визуал строится в install(ow, { THREE, heightAt, biomeAt, biomeWeights }).
import { WORLD_CONFIG, BIOMES, POIS, GATES } from '../../shared/defs/index.js';
import { lavaAt, nearLava, BIOME_PROPS, SHAPES } from './biome-terrain.js';
import { FogGrid, newlyDiscovered, travelTargets, canTravel, poiLabel, biomeLabel, isTravelPoint, MapUI, DISCOVER } from './discovery.js';

const W = WORLD_CONFIG;
const poi = (id) => POIS.find((p) => p.id === id);
/** Этажи: порядок = рост уровней биомов. Победа над боссом этажа n открывает ворота на n+1. */
export const FLOORS = Object.freeze([
  ['b_meadow', 'poi_hub_dawnford'], ['b_forest', 'poi_hub_rootvale'], ['b_swamp', 'poi_hub_stilt_market'],
  ['b_mountains', 'poi_hub_pass_camp'], ['b_desert_ruins', 'poi_hub_mirage_oasis'], ['b_volcano', 'poi_hub_ash_forge'],
].map(([biome, hub], i) => Object.freeze({ n: i + 1, biome, hub, boss: BIOMES[biome].boss, arena: POIS.find((p) => p.boss === BIOMES[biome].boss)?.id || null, levels: BIOMES[biome].levels })));
export const floorOf = (biome) => FLOORS.find((f) => f.biome === biome)?.n || 1;
const STORE_KEY = 'vr-atu-zones-v1';

// ---------------- состояние (синглтон модуля) ----------------
const S = { defeated: new Set(), discovered: new Set(['poi_hub_dawnford']), fog: new FogGrid(), devFloors: 0, listeners: new Set(), storage: null };
export const floorUnlocked = [true, true, false, false, false, false, false]; // индекс = номер этажа (0 не используется)
function recompute() {
  const before = floorUnlocked.slice();
  for (const f of FLOORS) floorUnlocked[f.n] = f.n === 1 || f.n <= S.devFloors || S.defeated.has(FLOORS[f.n - 2].boss);
  for (const f of FLOORS) if (floorUnlocked[f.n] && !before[f.n]) for (const cb of S.listeners) { try { cb(f); } catch {} }
}
export function maxFloor() { let m = 1; for (const f of FLOORS) if (floorUnlocked[f.n]) m = f.n; return m; }
export const isFloorUnlocked = (n) => !!floorUnlocked[n];
export const isBiomeOpen = (b) => isFloorUnlocked(floorOf(b));
export const isBossDefeated = (id) => S.defeated.has(id);
/** true если: босс побеждён; ворота gate_floor_N — открыт этаж N; ворота из GATES — выполнены требования-боссы (предметы — открытием этажа цели). */
export function isGateOpen(id) {
  if (!id) return false;
  if (id.startsWith('boss_')) return S.defeated.has(id);
  const m = /^gate_floor_(\d)$/.exec(id) || /^fgate_\d+_(\d+)/.exec(id); if (m) return isFloorUnlocked(+m[1]); // fgate_* — формат части I (buildings)
  const g = GATES.find((q) => q.id === id); if (!g) return false;
  return isBiomeOpen(g.to) && g.requires.filter((r) => r.startsWith('boss_')).every((r) => S.defeated.has(r));
}
export function markBossDefeated(id) {
  if (!id || S.defeated.has(id)) return false; S.defeated.add(id); recompute(); save(); return true;
}
export function onFloorUnlocked(cb) { S.listeners.add(cb); return () => S.listeners.delete(cb); }
export function zoneState() { return S; }
export function resetZones({ storage = null, devFloors = 0 } = {}) {
  S.defeated.clear(); S.discovered = new Set(['poi_hub_dawnford']); S.fog = new FogGrid(); S.devFloors = devFloors; S.storage = storage; recompute();
}
export function save() { try { S.storage?.setItem(STORE_KEY, JSON.stringify({ v: 1, defeated: [...S.defeated], discovered: [...S.discovered], fog: S.fog.toString() })); } catch {} }
export function load(storage) {
  S.storage = storage; try { const d = JSON.parse(storage?.getItem(STORE_KEY) || 'null'); if (d?.v === 1) { d.defeated.forEach((b) => S.defeated.add(b)); d.discovered.forEach((p) => S.discovered.add(p)); S.fog.load(d.fog); } } catch {}
  recompute();
}

/** Ворота этажей: точка на линии хаб(n-1)→хаб(n), где начинается биом этажа n (минус 6 м), и направление прохода. */
export function computeGates(biomeAt) {
  const out = [];
  for (let i = 1; i < FLOORS.length; i++) {
    const a = poi(FLOORS[i - 1].hub).pos, b = poi(FLOORS[i].hub).pos, L = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
    let t = L * 0.5; for (let s = 0; s <= L; s += 4) if (biomeAt(a[0] + dx * s, a[1] + dz * s) === FLOORS[i].biome) { t = s; break; }
    t = Math.max(0, t - 6); out.push({ id: `gate_floor_${i + 1}`, floor: i + 1, boss: FLOORS[i - 1].boss, x: a[0] + dx * t, z: a[1] + dz * t, dir: [dx, dz] });
  }
  return out;
}

// ---------------- опасности ----------------
export const HAZARD_ITEMS = Object.freeze({ poison: ['it_purity_amulet', 'it_antidote'], cold: ['it_warm_tonic'], heat: ['it_frost_salve'], heat_sun: ['it_water_flask'] });
/** Вид опасности в точке. ctx: { biome, h (земля), y (игрок), night, hour, nearWarm } */
export function hazardKind(x, z, c) {
  if (c.biome === 'b_swamp' && c.h < W.seaLevel + 0.25) return 'poison';
  if (c.biome === 'b_mountains' && c.y > SHAPES.mountains.coldLine) return 'cold';
  if (c.biome === 'b_volcano' && nearLava(x, z, c.h)) return 'heat';
  if (c.biome === 'b_desert_ruins' && !c.night && c.hour > 10 && c.hour < 17) return 'heat_sun';
  return null;
}
/** Шаг шкалы 0..100: заполнение за WORLD_CONFIG.hazard.fillTimeS, спад decayPerS; урон при 100. */
export function hazardStep(meter, kind, dt, { night = false, nearWarm = false, immune = false } = {}) {
  const H = W.hazard;
  if (!kind || immune || (nearWarm && kind === 'cold')) return { meter: Math.max(0, meter - H.decayPerS * dt * (nearWarm ? 2 : 1)), dps: 0 };
  const rate = (100 / H.fillTimeS) * (kind === 'cold' && night ? 1.5 : 1) * (kind === 'heat_sun' ? 0.35 : 1);
  const m = Math.min(100, meter + rate * dt);
  const B = { poison: BIOMES.b_swamp, cold: BIOMES.b_mountains, heat: BIOMES.b_volcano, heat_sun: null }[kind];
  return { meter: m, dps: m >= 100 ? (B?.hazard?.dps ?? 1) * (kind === 'cold' && night ? (B.hazard.nightMul || 1) : 1) : 0 };
}

// ---------------- runtime ----------------
const TOAST_FLOOR = (f) => [`${f.n}-ҚАБАТ · ЭТАЖ ${f.n}`, biomeLabel(f.biome).kk, `${biomeLabel(f.biome).ru} · ур. ${f.levels[0]}–${f.levels[1]}`];
export async function install(ow, { THREE, heightAt, biomeAt, biomeWeights, gateVisuals = !ow?.buildings } = {}) {
  if (!ow || !THREE || !heightAt || !biomeAt) throw new Error('zones.install: нужны ow, THREE, heightAt, biomeAt');
  const Q = new URLSearchParams(location.search), storage = Q.has('owfresh') ? null : globalThis.localStorage;
  resetZones({ storage, devFloors: +(Q.get('owfloors') || 0) }); load(storage);
  for (const id of S.discovered) ow.discovered.add(id); for (const id of ow.discovered) S.discovered.add(id);
  const qId = ow.quality || 'pc_low', WQ = W.quality[qId] || W.quality.pc_low, st = ow.state, scene = ow.scene;
  const gates = computeGates(biomeAt).map((g) => ({ ...g, open: isGateOpen(g.id) }));
  const ui = new MapUI({ heightAt, biomeAt }, { fog: S.fog, discovered: S.discovered, floors: FLOORS, floorUnlocked, gates, lavaAt });
  const now = () => performance.now() / 1000;

  // --- ворота: два балбала + арка + мерцающий барьер ---
  const gMat = { stone: new THREE.MeshToonMaterial({ color: '#9c9488' }), gold: new THREE.MeshToonMaterial({ color: '#e9c46a', emissive: '#7a5a10' }),
    veil: new THREE.MeshBasicMaterial({ color: 0x3ec5ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }) };
  const pillarG = new THREE.CylinderGeometry(0.9, 1.2, 9, 6), archG = new THREE.BoxGeometry(16, 1.2, 1.6), veilG = new THREE.PlaneGeometry(14, 9);
  for (const g of gates) {
    if (!gateVisuals) { g.veil = { visible: false, material: {} }; continue; } // ворота рисует часть I
    const grp = new THREE.Group(), y = heightAt(g.x, g.z); grp.position.set(g.x, y, g.z); grp.rotation.y = Math.atan2(g.dir[0], g.dir[1]);
    for (const s of [-7.5, 7.5]) { const p = new THREE.Mesh(pillarG, gMat.stone); p.position.set(s, 4.5, 0); grp.add(p); }
    const a = new THREE.Mesh(archG, gMat.gold); a.position.y = 9.4; grp.add(a);
    const v = new THREE.Mesh(veilG, gMat.veil); v.position.y = 4.5; grp.add(v); g.veil = v; g.group = grp; v.visible = !g.open; scene.add(grp);
  }
  // --- лава кратера Отты тау ---
  const C = SHAPES.volcano.crater, lavaMat = new THREE.MeshBasicMaterial({ color: 0xff5a1a });
  const lava = new THREE.Mesh(new THREE.CircleGeometry(C.r, 40).rotateX(-Math.PI / 2), lavaMat); lava.position.set(C.x, SHAPES.volcano.lavaLevel, C.z); scene.add(lava);
  // --- погода по биому: одна Points-система, следует за камерой ---
  const NP = Math.min(WQ.weatherParticles || 200, 1000), pg = new THREE.BufferGeometry(), pp = new Float32Array(NP * 3);
  for (let i = 0; i < NP * 3; i++) pp[i] = (Math.random() - 0.5) * 40; pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const pm = new THREE.PointsMaterial({ size: 0.18, transparent: true, opacity: 0.8, depthWrite: false, color: 0xffffff });
  const pts = new THREE.Points(pg, pm); pts.frustumCulled = false; scene.add(pts);
  const WX = { b_meadow: [0xfff3a0, 0.3, 0.1, 0.25], b_forest: [0xc8ff80, 0.2, 0.15, 0.3], b_swamp: [0x9cff6a, 0.25, 0.3, 0.6], b_mountains: [0xffffff, -2.2, 0.4, 1], b_desert_ruins: [0xe8b77a, -0.3, 5, 0.8], b_volcano: [0xff7a2a, 1.2, 0.6, 1] }; // [цвет, vy, ветер, доля]
  const FOG_MUL = { b_meadow: 1, b_forest: 0.85, b_swamp: 0.55, b_mountains: 0.8, b_desert_ruins: 0.75, b_volcano: 0.65 };
  const baseFogFar = ow.sky?.fogFar || 150;
  // --- декор по биому в ближних чанках (Quest: кольцо 1) ---
  const ring = qId === 'quest' || qId === 'phone' ? 1 : 2, propChunks = new Map(), geoCache = {}, matCache = {};
  const prim = (d) => geoCache[d.id] ||= ({ cone: () => new THREE.ConeGeometry(d.s[0], d.s[1], 6), cyl: () => new THREE.CylinderGeometry(d.s[0], d.s[0] * 1.2, d.s[1], 6), ico: () => new THREE.IcosahedronGeometry(d.s[0], 0).scale(1, d.s[1] / d.s[0], 1), oct: () => new THREE.OctahedronGeometry(d.s[0]).scale(1, d.s[1] / d.s[0], 1), box: () => new THREE.BoxGeometry(d.s[0], d.s[1], d.s[0] * 0.6) }[d.prim])();
  const mat = (d) => matCache[d.id] ||= new THREE.MeshToonMaterial({ color: d.col, emissive: d.emissive ? d.col : '#000', emissiveIntensity: d.emissive || 0 });
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), vv = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function buildProps(cx, cz) {
    const CS = W.chunkSize, b = biomeAt(cx * CS + CS / 2, cz * CS + CS / 2) || 'b_meadow', grp = new THREE.Group();
    let seed = (cx * 92837111) ^ (cz * 689287499) ^ 777; const rnd = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822519) + 0x9e3779b9 | 0) >>> 0) / 4294967295;
    for (const d of BIOME_PROPS[b] || []) {
      const mats = [];
      for (let i = 0; i < d.n; i++) {
        const x = cx * CS + rnd() * CS, z = cz * CS + rnd() * CS, h = heightAt(x, z), k = 0.7 + rnd() * 0.6, ry = rnd() * 6.28;
        const water = h < W.seaLevel; if (d.on === 'water' ? !water : water) continue; if (d.near === 'water' && h > 1.4) continue; if (lavaAt(x, z, h)) continue;
        if (POIS.some((p) => Math.hypot(p.pos[0] - x, p.pos[1] - z) < (p.r || 14) + 4)) continue;
        m4.compose(vv.set(x, Math.max(h, W.seaLevel) + d.y * k, z), qq.setFromAxisAngle(up, ry), sc.setScalar(k)); mats.push(m4.clone());
      }
      if (!mats.length) continue;
      const im = new THREE.InstancedMesh(prim(d), mat(d), mats.length); mats.forEach((m, i) => im.setMatrixAt(i, m)); im.computeBoundingSphere(); grp.add(im);
    }
    scene.add(grp); return grp;
  }
  function updateProps(px, pz) {
    const CS = W.chunkSize, pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS); let built = 0;
    for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
      const cx = pcx + dx, cz = pcz + dz, k = cx + ',' + cz; if (cx < 0 || cz < 0 || cx >= W.chunks || cz >= W.chunks || propChunks.has(k) || built >= 1) continue;
      propChunks.set(k, buildProps(cx, cz)); built++;
    }
    for (const [k, g] of propChunks) { const [cx, cz] = k.split(',').map(Number); if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > ring + 1) { scene.remove(g); g.children.forEach((m) => m.dispose?.()); propChunks.delete(k); } }
  }

  // --- телепорт ---
  let fading = 0;
  function travel(id) {
    const p = poi(id), pl = ow.player.pos;
    if (!p || !S.discovered.has(id) || !isTravelPoint(p)) return { ok: false, why: 'не открыто' };
    if (!isBiomeOpen(p.biome)) return { ok: false, why: 'этаж закрыт' };
    if (!canTravel(ow.mobs?.list, pl.x, pl.z)) { ui.toast('ЖЫЛДАМ САПАР', 'Ұрыс жүріп жатыр', 'Нельзя телепортироваться в бою', 1800); return { ok: false, why: 'бой' }; }
    fading = W.fastTravel.fadeS; ow.tp(p.pos[0] + 6, p.pos[1] + 6); st.mapOpen = false; lastSafe = { x: ow.player.pos.x, z: ow.player.pos.z };
    const l = poiLabel(id); ui.toast('ЖЫЛДАМ САПАР · ТЕЛЕПОРТ', l.kk, l.ru, 2200); return { ok: true };
  }

  // --- тик ---
  let last = now(), acc4 = 0, lastSafe = { x: ow.player.pos.x, z: ow.player.pos.z }, curFloor = 0, meter = 0, hzKind = null, bossPoll = 0, lavaCd = 0;
  const immuneUntil = {}, seenFloors = new Set();
  onFloorUnlocked((f) => { const g = gates.find((q) => q.floor === f.n); if (g) { g.open = true; g.veil.visible = false; } const [t, kk, ru] = TOAST_FLOOR(f); ui.toast('ҚАҚПА АШЫЛДЫ · ВРАТА ОТКРЫТЫ', kk, `Этаж ${f.n}: ${ru}`, 4000); });
  function tick() {
    const tn = now(), dt = Math.min(0.1, tn - last); if (dt <= 0.0005) return; last = tn;
    const P = ow.player.pos, px = P.x, pz = P.z; if (fading > 0) fading -= dt;
    // мерцание барьеров, лава
    for (const g of gates) if (g.veil.visible) g.veil.material.opacity = 0.25 + 0.12 * Math.sin(tn * 3 + g.floor);
    lavaMat.color.setRGB(1, 0.32 + 0.08 * Math.sin(tn * 2), 0.08);
    // погода
    const b0 = ow._zoneBiome || 'b_meadow', wx = WX[b0], cam = ow.camera.getWorldPosition(vv); pts.position.copy(cam); pm.color.setHex(wx[0]); pm.opacity = 0.8 * wx[3];
    pg.drawRange.count = Math.floor(NP * wx[3]);
    for (let i = 0; i < NP; i++) { const o = i * 3; pp[o] += wx[2] * dt; pp[o + 1] += wx[1] * dt + Math.sin(tn + i) * 0.01; if (pp[o + 1] < -20) pp[o + 1] += 40; if (pp[o + 1] > 20) pp[o + 1] -= 40; if (pp[o] > 20) pp[o] -= 40; }
    pg.attributes.position.needsUpdate = true;
    if (ow.sky) ow.sky.fogFar += (baseFogFar * (FOG_MUL[b0] || 1) - ow.sky.fogFar) * Math.min(1, dt * 0.8);
    if (ow.state?.dead || ow.player.dead) return;
    // барьер этажа: каждый кадр (дешёво: один biomeAt)
    const b = biomeAt(px, pz) || b0, fl = floorOf(b);
    if (!isFloorUnlocked(fl)) {
      P.x = lastSafe.x; P.z = lastSafe.z; P.y = Math.max(P.y, heightAt(P.x, P.z));
      if (tn - (ow._zoneDenyT || 0) > 2.5) { ow._zoneDenyT = tn; const prev = FLOORS[fl - 2]; ui.toast(`${fl}-ҚАБАТ ЖАБЫҚ · ЭТАЖ ЗАКРЫТ`, biomeLabel(b).kk, `Победи босса этажа ${fl - 1}: ${prev ? (globalThis.__OW_BOSSNAME?.(prev.boss) || prev.boss) : ''}`, 2600); }
      return;
    }
    const gh = heightAt(px, pz);
    if (lavaAt(px, pz, gh) && P.y < SHAPES.volcano.lavaLevel + 0.5 && (lavaCd -= dt) <= 0) {
      lavaCd = 1; st.hp -= st.hpMax * (BIOMES.b_volcano.hazard.lavaContact.hpLoss || 0.3); P.x = lastSafe.x; P.z = lastSafe.z; P.y = heightAt(P.x, P.z);
      ui.toast('ЛАВА', 'Абайла!', 'Лава: −30 % здоровья', 1500); if (st.hp <= 0) ow.die?.(); return;
    }
    if (!lavaAt(px, pz, gh)) lastSafe = { x: px, z: pz };
    ow._zoneBiome = b;
    if (fl !== curFloor) { curFloor = fl; if (!seenFloors.has(fl)) { seenFloors.add(fl); const f = FLOORS[fl - 1], [t, kk, ru] = TOAST_FLOOR(f); ui.toast(t, kk, ru, 3800); } }
    // опасности
    const night = !!ow.sky?.night, hour = ow.sky?.hour ?? 12, warm = POIS.some((p) => (p.type === 'hub' || p.stations?.includes('stn_campfire')) && Math.hypot(p.pos[0] - px, p.pos[1] - pz) < (p.r || 14) + 6);
    hzKind = hazardKind(px, pz, { biome: b, h: gh, y: P.y, night, hour });
    if (hzKind && meter > 70 && !(immuneUntil[hzKind] > tn)) for (const it of HAZARD_ITEMS[hzKind]) if (st.inv?.[it] > 0) {
      if (!it.includes('amulet')) st.inv[it]--; immuneUntil[hzKind] = tn + (it.includes('amulet') ? 1e9 : 300); meter = 0; ui.toast('ҚОРҒАНЫС', 'Қорғаныс белсенді', `Защита: ${it}`, 1500); break; }
    const r = hazardStep(meter, hzKind, dt, { night, nearWarm: warm, immune: immuneUntil[hzKind] > tn }); meter = r.meter;
    if (r.dps > 0 && tn > (st.invulnUntil || 0)) { st.hp -= r.dps * dt; st.lastHit = ow._zoneClock = tn; if (st.hp <= 0) ow.die?.(); }
    if (hzKind === 'heat_sun') st.stamina = Math.max(0, st.stamina - 3 * dt);
    st.hazard = { kind: hzKind, meter };
    // 4 Гц: открытия, туман, карта, боссы
    if ((acc4 += dt) < 0.25) return; acc4 = 0;
    S.fog.reveal(px, pz, DISCOVER.walkRevealM);
    for (const id of ow.discovered) if (!S.discovered.has(id)) S.discovered.add(id);
    for (const p of newlyDiscovered(px, pz, S.discovered)) {
      S.discovered.add(p.id); ow.discovered.add(p.id); if (p.revealRadius) S.fog.reveal(p.pos[0], p.pos[1], p.revealRadius);
      const l = poiLabel(p.id); ui.toast(isTravelPoint(p) ? 'ЖАҢА ОРЫН · ТОЧКА ТЕЛЕПОРТА' : 'ЖАҢА ОРЫН · НОВОЕ МЕСТО', l.kk, l.ru); save();
    }
    if ((bossPoll += 0.25) >= 1) { bossPoll = 0; for (const m of ow.mobs?.list || []) if (m.state === 'dead' && (m.id || m.def?.id || '').startsWith('boss_')) markBossDefeated(m.id || m.def.id); }
    ui.bakeStep(6); ui.hazard(hzKind, meter, immuneUntil[hzKind] > tn);
    const yaw = ow.player.yaw || 0, pl = { x: px, z: pz, yaw }, F = FLOORS[fl - 1];
    ui.drawMini(pl, `${fl}-қабат · ${biomeLabel(F.biome).kk}`);
    ui.drawWorld(pl, !!st.mapOpen, travelTargets(S.discovered, isBiomeOpen));
    if (Math.random() < 0.05) save();
  }
  // тик: ow.addTick (если интегратор завёл) иначе onBeforeRender пустого меша (работает и в WebXR)
  if (typeof ow.addTick === 'function') ow.addTick(tick);
  else { const t = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()); t.frustumCulled = false; t.onBeforeRender = tick; scene.add(t); }
  addEventListener('ow:boss-defeated', (e) => markBossDefeated(e.detail?.id));
  S.fog.reveal(lastSafe.x, lastSafe.z, 120);
  const api = { FLOORS, floorUnlocked, gates, isGateOpen, isFloorUnlocked, markBossDefeated, travel, travelTargets: () => travelTargets(S.discovered, isBiomeOpen), state: S, ui, onFloorUnlocked, unlockAll: () => { S.devFloors = 6; recompute(); } };
  ow.zones = api; console.info(`[openworld] zones installed: floors ${maxFloor()}/6, gates ${gates.length}, discovered ${S.discovered.size}`);
  return api;
}
