// js/world/settlements.js — расстановка зданий и поселений по всем POI (I) + врата этажей «как в SAO»,
// коллайдеры, LOD, башни-лифты с быстрым перемещением, входы в подземелья. Подключение: install(ow).
// Чистая часть (layoutPoi / planFloors / buildWorldLayout / ColliderGrid / FloorLock) тестируется в node без three.
import { POIS, BIOMES, BOSSES, WORLD_CONFIG } from '../../shared/defs/index.js';
import * as K from './buildings.js';

/** Порядок этажей = порядок биомов (уровни 1–6 … 24–30). Этаж N открыт, если повержены боссы этажей 1..N-1. */
export const FLOORS = Object.freeze(Object.keys(BIOMES).map((b, i) => ({ floor: i + 1, biome: b, boss: Object.keys(BOSSES).find((k) => BOSSES[k].biome === b) || null, levels: BIOMES[b].levels, hub: POIS.find((p) => p.type === 'hub' && p.biome === b)?.id || null })));
export const BUILD_BUDGET = Object.freeze({ trisNearPerPoi: 14000, trisFarPerPoi: 3500, trisNearTotal: 160000, drawCallsPerPoi: 4 });
const hubOf = (b) => POIS.find((p) => p.type === 'hub' && p.biome === b);

/** Раскладка одного POI → Builder (детали, коллайдеры, платформы, триггеры). */
export function layoutPoi(poi, hAt) {
  const b = new K.Builder(poi.pos[0], poi.pos[1], hAt), rng = K.rngFrom(poi.id), R = poi.r || 12;
  b.poi = poi.id; b.type = poi.type;
  switch (poi.type) {
    case 'hub': {
      const WR = Math.max(26, R); const seg = 14, gates = [0, 7]; // ворота: юг (+z) и север (−z)
      for (let i = 0; i < seg; i++) { if (gates.includes(i)) continue; const a0 = (i - 0.5) / seg * Math.PI * 2, a1 = (i + 0.5) / seg * Math.PI * 2; K.wall(b, Math.sin(a0) * WR, Math.cos(a0) * WR, Math.sin(a1) * WR, Math.cos(a1) * WR); }
      for (const gi of gates) { const a = gi / seg * Math.PI * 2; K.townGate(b, Math.sin(a) * WR, Math.cos(a) * WR, a); }
      const ny = Math.round(WR / 3.2); // кольцо юрт
      for (let i = 0; i < ny; i++) { const a = (i + 0.5) / ny * Math.PI * 2; if (Math.abs(Math.cos(a)) > 0.9) continue; const r = WR * (0.62 + rng() * 0.14); K.yurt(b, Math.sin(a) * r, Math.cos(a) * r, a + Math.PI, 2.6 + rng() * 0.8); }
      K.kiyizUy(b, -WR * 0.4, -WR * 0.4, Math.PI * 0.75, Math.min(6, WR * 0.18));
      for (let i = 0; i < 6; i++) { const a = -0.9 + i * 0.36, r = 12.5; K.stall(b, Math.sin(a) * r, Math.cos(a) * r, a + Math.PI, rng); } // базар у южных ворот
      K.shanyrakShrine(b, WR * 0.4, -WR * 0.36, 0, poi.id);
      break;
    }
    case 'tower': K.tower(b, 0, 0, rng() * 6.28, 22, poi.id); for (let i = 0; i < 2; i++) K.balbal(b, [b.ox + 6 + i * 2, b.oz + 5], rng); break;
    case 'dungeon': K.mausoleum(b, 0, 0, rng() * 6.28, R > 14 ? 1.3 : 1, poi.id); break;
    case 'cave': K.caveMouth(b, 0, 0, rng() * 6.28, poi.id); break;
    case 'shrine': K.shanyrakShrine(b, 0, 0, 0, poi.id); break;
    case 'camp': K.enemyCamp(b, 0, 0, rng() * 6.28, Math.max(9, R - 1), rng, poi.biome === 'b_mountains' ? '#6d8fb0' : '#b23a2e'); break;
    case 'ruin': K.ruins(b, 0, 0, rng() * 6.28, R, rng); break;
    case 'arena': K.bossArena(b, R, rng); break;
    case 'puzzle': K.standingStones(b, Math.min(9, R * 0.6), rng); break;
    case 'viewpoint': K.lookout(b); break;
    case 'treasure': K.cairn(b, rng); break;
  }
  // Боссовые POI других типов (крепость Имира, храм Солнца, цитадель) — добавляем кольцо арены
  const boss = Object.entries(BOSSES).find(([, v]) => v.arena?.poi === poi.id);
  if (boss && poi.type !== 'arena') K.bossArena(b, Math.max(18, boss[1].arena.radius || 22), rng);
  if (boss) b.triggers.push({ kind: 'boss_arena', x: b.ox, z: b.oz, r: boss[1].arena.radius || 22, y: b.y0, bossId: boss[0] });
  return b;
}

/** Врата между этажами: на отрезке хаб_N → хаб_N+1 ищем первую точку, где начинается биом следующего этажа. */
export function planFloors(biomeAt) {
  const out = [];
  for (let i = 0; i < FLOORS.length - 1; i++) {
    const A = hubOf(FLOORS[i].biome), B = hubOf(FLOORS[i + 1].biome); if (!A || !B) continue;
    const [ax, az] = A.pos, [bx, bz] = B.pos, L = Math.hypot(bx - ax, bz - az); let t = 0.5;
    for (let s = 0; s <= L; s += 4) { const tt = 1 - s / L; if (biomeAt(ax + (bx - ax) * tt, az + (bz - az) * tt) !== FLOORS[i + 1].biome) { t = Math.min(1 - 30 / L, tt + 8 / L); break; } }
    out.push({ id: `fgate_${i + 1}_${i + 2}`, floorFrom: i + 1, floorTo: i + 2, from: FLOORS[i].biome, to: FLOORS[i + 1].biome, bossId: FLOORS[i].boss, x: ax + (bx - ax) * t, z: az + (bz - az) * t, ry: Math.atan2(bx - ax, bz - az) + Math.PI / 2 });
  }
  return out;
}
/** Мосты: дорога хаб→хаб пересекает воду коротким участком (≤ 60 м) → мост. */
export function planBridges(waterAt, heightAt) {
  const out = []; const hubs = FLOORS.map((f) => hubOf(f.biome)).filter(Boolean);
  for (let i = 0; i < hubs.length - 1; i++) {
    const [ax, az] = hubs[i].pos, [bx, bz] = hubs[i + 1].pos, L = Math.hypot(bx - ax, bz - az); let s0 = -1;
    for (let s = 0; s <= L; s += 2) { const x = ax + (bx - ax) * s / L, z = az + (bz - az) * s / L, w = waterAt(x, z);
      if (w && s0 < 0) s0 = s; if (!w && s0 >= 0) { const len = s - s0; if (len >= 4 && len <= 60) { const p = (q) => [ax + (bx - ax) * q / L, az + (bz - az) * q / L]; const [x1, z1] = p(s0 - 4), [x2, z2] = p(s + 4); out.push({ id: `bridge_${i}_${out.length}`, x1, z1, x2, z2, deckY: Math.max(heightAt(x1, z1), heightAt(x2, z2), WORLD_CONFIG.seaLevel + 0.8) }); } s0 = -1; } }
  }
  return out;
}

/** Полная раскладка мира: все POI + врата этажей + мосты. Детерминирована (seed = id). */
export function buildWorldLayout({ heightAt, biomeAt, waterAt }) {
  const sites = POIS.map((p) => layoutPoi(p, heightAt));
  const gates = planFloors(biomeAt);
  for (const g of gates) { const b = new K.Builder(g.x, g.z, heightAt); b.poi = g.id; b.type = 'floor_gate'; b.gate = g; K.floorGate(b, 0, 0, g.ry, g.id, g.bossId); sites.push(b); }
  for (const br of planBridges(waterAt || (() => false), heightAt)) { const cx = (br.x1 + br.x2) / 2, cz = (br.z1 + br.z2) / 2, b = new K.Builder(cx, cz, heightAt); b.poi = br.id; b.type = 'bridge'; K.bridge(b, br.x1 - cx, br.z1 - cz, br.x2 - cx, br.z2 - cz, br.deckY - b.y0); sites.push(b); }
  return { sites, gates };
}

/** Пространственная сетка коллайдеров (ячейка 16 м; коллайдер попадает во все ячейки, которые задевает). */
export class ColliderGrid {
  constructor(cell = 16) { this.cell = cell; this.map = new Map(); this.count = 0; }
  key(ix, iz) { return ix * 4096 + iz; }
  add(c) { const R = 0.3 * c[3] + 1, C = this.cell; for (let ix = Math.floor((c[0] - R) / C); ix <= Math.floor((c[0] + R) / C); ix++) for (let iz = Math.floor((c[2] - R) / C); iz <= Math.floor((c[2] + R) / C); iz++) { const k = this.key(ix, iz); let a = this.map.get(k); if (!a) this.map.set(k, (a = [])); a.push(c); } this.count++; }
  near(x, z, isOpen) { const a = this.map.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))); if (!a) return EMPTY; if (!isOpen) return a; return a.filter((c) => !(c[4] && c[4].startsWith('seal:') && isOpen(c[4].slice(5)))); }
}
const EMPTY = [];

/** Замок этажей: какой максимальный этаж доступен по набору поверженных боссов. */
export class FloorLock {
  constructor(defeated = []) { this.defeated = new Set(defeated); }
  isBossDefeated(id) { return this.defeated.has(id); }
  isGateOpen(bossIdOrGate) { const f = FLOORS.find((x) => x.boss === bossIdOrGate); if (f) return this.defeated.has(bossIdOrGate); const g = /^fgate_(\d+)_/.exec(bossIdOrGate || ''); return g ? this.defeated.has(FLOORS[+g[1] - 1]?.boss) : false; }
  maxFloor() { let n = 1; for (const f of FLOORS) { if (f.boss && this.defeated.has(f.boss) && f.floor === n) n++; else break; } return Math.min(n, FLOORS.length); }
  floorOfBiome(b) { return FLOORS.find((f) => f.biome === b)?.floor || 1; }
  canEnter(biome) { return this.floorOfBiome(biome) <= this.maxFloor(); }
  defeat(id) { this.defeated.add(id); }
}
/** Высота опоры с учётом платформ (крыша башни, мост, подиум): платформа «ловит», если ноги не ниже top−step. */
export function platformHeight(platforms, x, z, footY, groundY, step = 0.6) {
  let y = groundY; for (const p of platforms) { if (Math.hypot(x - p.x, z - p.z) <= p.r && footY >= p.y - step && p.y > y) y = p.y; } return y;
}

// ======================= рантайм (браузер) =======================
/**
 * install(ow) — ow = объект api из js/openworld/main.js (window.__OW) + { hud, heightAt, biomeAt, waterAt }.
 * Использует: ow.scene, ow.player (pos, update, teleport, xr, rig), ow.terrain.obstaclesNear (оборачивается),
 * ow.mobs.list (детект смерти босса: m.def.id startsWith 'boss_' && state==='dead'), ow.hud.flash, ow.tp, ow.discovered, ow.quality.
 * Ничего не меняет в main.js: оборачивает методы экземпляров terrain.obstaclesNear и player.update.
 */
export async function install(ow, opts = {}) {
  const THREE = await import('three'); const { makeToon } = await import('../render/toon.js'); const T = await import('./terrain.js');
  const heightAt = ow.heightAt || T.heightAt, biomeAt = ow.biomeAt || T.biomeAt, waterAt = ow.waterAt || T.waterAt;
  const Q = new URLSearchParams(location.search), t0 = performance.now();
  let saved = []; try { saved = JSON.parse(localStorage.getItem('ow-bosses-defeated') || '[]'); } catch {}
  const lock = new FloorLock(Q.get('owgates') === 'open' ? FLOORS.map((f) => f.boss) : saved);
  const { sites, gates } = buildWorldLayout({ heightAt, biomeAt, waterAt });
  const mat = makeToon({ vertexColors: true }), glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const sealMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  glowMat.userData.transparent = sealMat;
  const farDist = { quest: 70, phone: 70, pc_low: 110, pc_high: 160 }[ow.quality] || 110, cullDist = farDist * 3.2;
  const root = new THREE.Group(); root.name = 'ow-buildings'; ow.scene.add(root);
  const grid = new ColliderGrid(16), platforms = [], triggers = [], seals = [], lods = []; let trisNear = 0;
  for (const s of sites) {
    for (const c of s.colliders) grid.add(c); platforms.push(...s.platforms); triggers.push(...s.triggers.map((t) => ({ ...t, site: s.poi })));
    const m = K.bakeMeshes(THREE, s.parts, { material: mat, glowMaterial: glowMat });
    const lod = new THREE.LOD(); lod.position.set(s.ox, s.y0, s.oz); lod.name = s.poi;
    const nearG = new THREE.Group(); if (m.near) nearG.add(m.near); if (m.glow) nearG.add(m.glow);
    for (const tag in m.tagged) for (const mm of m.tagged[tag]) { nearG.add(mm); if (tag === 'seal') seals.push({ mesh: mm, gate: s.gate }); }
    const farG = new THREE.Group(); if (m.far) farG.add(m.far); if (m.glow) farG.add(m.glow.clone());
    for (const tag in m.tagged) if (tag === 'seal') for (const mm of m.tagged[tag]) farG.add(mm.clone());
    lod.addLevel(nearG, 0); lod.addLevel(farG, farDist); lod.addLevel(new THREE.Object3D(), cullDist);
    for (const g of [nearG, farG]) g.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    root.add(lod); lods.push(lod); trisNear += s.tris[0];
  }
  for (const m of [...root.children]) m.updateMatrix();
  const refreshSeals = () => { for (const s of seals) s.mesh.visible = !lock.isGateOpen(s.gate.bossId); };
  refreshSeals();
  const isGateOpen = (id) => (ow.zones?.isGateOpen ? ow.zones.isGateOpen(id) : lock.isGateOpen(id)); // J — источник истины

  // --- коллайдеры: деревья рантайма + здания (запечатанные врата блокируют, открытые — нет)
  const terr = ow.terrain, origNear = terr.obstaclesNear.bind(terr), cache = { k: null, v: null };
  terr.obstaclesNear = (x, z) => { const a = origNear(x, z), b = grid.near(x, z, isGateOpen); return !b.length ? a : !a.length ? b : a.concat(b); };

  // --- игрок: платформы, лифт башни, быстрое перемещение, замок этажей, входы в подземелья
  const pl = ow.player, origUpd = pl.update.bind(pl), hud = ow.hud || { flash: (t) => console.info('[buildings]', t) };
  const st = { lift: null, stand: {}, lastSafe: { x: pl.pos.x, z: pl.pos.z }, lockMsgT: 0, bossPollT: 0, attuned: new Set(), panel: null, curBiome: null };
  const flash = (t, ms) => { try { hud.flash(t, ms); } catch {} };
  function inTrig(t, p) { return Math.hypot(p.x - t.x, p.z - t.z) <= t.r && Math.abs(p.y - t.y) < 2.5; }
  pl.update = (dt, o) => {
    const prevY = pl.pos.y, px = pl.pos.x, pz = pl.pos.z;
    const r = origUpd(dt, o); const p = pl.pos;
    if (st.lift) { // лифт: плавный подъём/спуск в световой шахте
      st.lift.t += dt; const k = Math.min(1, st.lift.t / 2.5), e = k * k * (3 - 2 * k); p.x = st.lift.x; p.z = st.lift.z; p.y = st.lift.from + (st.lift.to - st.lift.from) * e; pl.vy = 0; pl.onGround = true;
      if (k >= 1) { st.lift = null; st.stand = {}; } return r;
    }
    const g = heightAt(p.x, p.z), py = platformHeight(platforms, p.x, p.z, Math.max(prevY, p.y), g);
    if (py > g && p.y < py) { p.y = py; pl.vy = Math.max(0, pl.vy || 0); pl.onGround = true; }
    // замок этажей (SAO): в биом закрытого этажа не пускаем
    if ((st.lockT = (st.lockT || 0) - dt) <= 0) { st.lockT = 0.2; const b = biomeAt(p.x, p.z);
      if (b && !lock.canEnter(b)) { p.x = st.lastSafe.x; p.z = st.lastSafe.z; p.y = Math.max(heightAt(p.x, p.z), p.y); if ((st.lockMsgT -= 0.2) <= 0) { st.lockMsgT = 3; const f = FLOORS[lock.maxFloor() - 1]; flash(`Этаж ${lock.floorOfBiome(b)} запечатан. Победи босса этажа ${f.floor} (${BOSSES[f.boss]?.name || f.boss}), чтобы открыть врата.`, 2600); } }
      else { st.lastSafe.x = p.x; st.lastSafe.z = p.z; if (b && b !== st.curBiome) { st.curBiome = b; flash(`Этаж ${lock.floorOfBiome(b)} · ${BIOMES[b].name}`, 1800); } } }
    // триггеры (стоять ~1.2 с)
    for (const t of triggers) {
      if (Math.abs(t.x - p.x) > t.r + 2 || Math.abs(t.z - p.z) > t.r + 2) continue;
      const inside = inTrig(t, p), key = t.kind + t.site; if (!inside) { delete st.stand[key]; continue; }
      st.stand[key] = (st.stand[key] || 0) + dt; const s = st.stand[key];
      if (t.kind === 'lift_up' && s > 1.2) { st.lift = { x: t.x, z: t.z, from: p.y, to: t.top, t: 0 }; flash('Подъём на башню…', 1200); }
      else if (t.kind === 'lift_down' && s > 1.2) { st.lift = { x: t.x, z: t.z, from: p.y, to: heightAt(t.x, t.z), t: 0 }; }
      else if (t.kind === 'fast_travel' && s > 0.05 && !st.attuned.has(t.poi)) { st.attuned.add(t.poi); ow.discovered?.add(t.poi); flash('Башня настроена: быстрое перемещение доступно', 2000); }
      else if (t.kind === 'fast_travel' && s > 1.2 && !st.panel) openTravel(t);
      else if (t.kind === 'dungeon_enter' && s > 0.6 && !st['d' + t.poi]) { st['d' + t.poi] = 1; flash('Вход в подземелье: ' + (POIS.find((q) => q.id === t.poi)?.name || t.poi), 1800); dispatchEvent(new CustomEvent('ow:dungeon-enter', { detail: { poiId: t.poi } })); }
      else if (t.kind === 'gate' && s > 0.3 && !st['g' + t.gateId]) { st['g' + t.gateId] = 1; setTimeout(() => (st['g' + t.gateId] = 0), 6000); flash(isGateOpen(t.bossId) ? 'Врата этажа открыты' : `Врата запечатаны: победи «${BOSSES[t.bossId]?.name || t.bossId}»`, 2200); }
    }
    if ((st.bossPollT -= dt) <= 0) { st.bossPollT = 1; for (const m of ow.mobs?.list || []) { const id = m.def?.id || m.id; if (id && BOSSES[id] && m.state === 'dead' && !lock.isBossDefeated(id)) defeatBoss(id); } }
    return r;
  };
  function defeatBoss(id) { if (!BOSSES[id] || lock.isBossDefeated(id)) return false; lock.defeat(id); try { localStorage.setItem('ow-bosses-defeated', JSON.stringify([...lock.defeated])); } catch {} refreshSeals(); flash(`Босс повержен! Врата на этаж ${lock.maxFloor()} открыты`, 3500); dispatchEvent(new CustomEvent('ow:gate-opened', { detail: { bossId: id, maxFloor: lock.maxFloor() } })); return true; }
  addEventListener('ow:boss-defeated', (e) => defeatBoss(e.detail?.bossId));
  function destinations() { return FLOORS.filter((f) => f.floor <= lock.maxFloor()).map((f) => POIS.find((p) => p.id === f.hub)).filter(Boolean).concat(POIS.filter((p) => st.attuned.has(p.id))); }
  function fastTravel(poiId) { const p = POIS.find((q) => q.id === poiId); if (!p || !lock.canEnter(p.biome)) return false; closeTravel(); (ow.tp || ((x, z) => pl.teleport(x, z)))(p.pos[0] + (p.type === 'hub' ? 4 : 6), p.pos[1] + (p.type === 'hub' ? 4 : 6)); st.lastSafe = { x: pl.pos.x, z: pl.pos.z }; flash('Перемещение: ' + (p.name || p.id), 1500); return true; }
  function openTravel(t) {
    const list = destinations(); if (pl.xr) { const hub = list.filter((p) => p.type === 'hub').pop(); if (hub) fastTravel(hub.id); return; }
    const d = document.createElement('div'); d.id = 'ow-travel'; d.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;background:#1b1712ee;border:2px solid #e2b23c;border-radius:12px;padding:14px 18px;color:#efe6d2;font:15px system-ui;min-width:280px';
    d.innerHTML = '<b style="color:#e2b23c">Шаңырақ · быстрое перемещение</b><br><small>цифра или клик · Esc — закрыть</small>' + list.map((p, i) => `<div data-id="${p.id}" style="cursor:pointer;padding:4px 0">${i + 1}. ${p.name || p.id} <small style="opacity:.6">этаж ${lock.floorOfBiome(p.biome)}</small></div>`).join('');
    d.onclick = (e) => { const id = e.target.closest('[data-id]')?.dataset.id; if (id) fastTravel(id); };
    const key = (e) => { if (e.code === 'Escape') { closeTravel(); e.stopPropagation(); } const n = /^Digit(\d)$/.exec(e.code); if (n && list[+n[1] - 1]) { e.stopPropagation(); e.preventDefault(); fastTravel(list[+n[1] - 1].id); } };
    addEventListener('keydown', key, true); document.exitPointerLock?.(); document.body.appendChild(d); st.panel = { d, key };
  }
  function closeTravel() { if (!st.panel) return; removeEventListener('keydown', st.panel.key, true); st.panel.d.remove(); st.panel = null; st.stand = {}; }
  // анимация печатей и порталов — дёшево, раз в кадр через onBeforeRender одного меша
  const anim = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()); anim.frustumCulled = false; root.add(anim);
  anim.onBeforeRender = () => { const tt = performance.now() / 1000; sealMat.opacity = 0.35 + Math.sin(tt * 2.2) * 0.12; if (st.panel && !triggers.some((t) => t.kind === 'fast_travel' && inTrig(t, pl.pos))) closeTravel(); };
  const api = { isGateOpen, defeatBoss, fastTravel, destinations, lock, floors: FLOORS, gates, sites: sites.length, colliders: grid.count, platforms: platforms.length, triggers: triggers.length, trisNear, root,
    stats: () => ({ sites: sites.length, colliders: grid.count, trisNear, ms: Math.round(performance.now() - t0), maxFloor: lock.maxFloor() }) };
  ow.buildings = api; window.__OW_BUILD = api;
  console.info(`[openworld] buildings: ${sites.length} sites, ${grid.count} colliders, ${trisNear} tris near, gates ${gates.length}, ${api.stats().ms} ms`);
  return api;
}
