// js/world/world-events.js — бродячие минибоссы (boss_roam_*) и мировые события (ev_*) из WORLD_EVENTS.
// Планировщик чистый (node-тесты), runtime — install(ow) (вызывается из bosses.install автоматически).
import { WORLD_EVENTS, BOSSES } from '../../shared/defs/index.js';
import { BossFight } from './bosses.js';

export const SCHED = Object.freeze({ periodS: 90, chance: 0.35, minD: 150, maxD: 400, maxActive: 1, headlessNightChance: 0.15, bloodMoonEvery: 5,
  wormShots: 20, wormWindowS: 30, wormDelayS: 8, roamLeashM: 70 });
const fits = (e, biome) => e.biomes.includes('*') || e.biomes.includes(biome);

/** Делает из WORLD_EVENTS.boss_roam_* определение, совместимое с BossFight (одна фаза + спешивание на 50 %). */
export function roamDef(id) {
  const e = WORLD_EVENTS[id]; if (!e || e.kind !== 'roaming_miniboss') return null;
  const lvl = Array.isArray(e.lvl) ? e.lvl[1] : 10;
  return { name: e.name, biome: e.biomes[0], lvl, hp: e.hp, res: e.res, zones: e.zones, arena: { poi: null, radius: 30 },
    phases: [{ from: 1, name: 'Охота', attacks: e.attacks }, { from: 0.5, name: id === 'boss_roam_headless' ? 'Спешен' : 'Ярость песков', mech: e.mech, attacks: [] }],
    enrage: { time: 300, effect: 'урон +50 %' }, stagger: { bar: Math.round(e.hp / 8), dur: 3 }, rewards: e.rewards, roaming: true };
}

export class EventScheduler {
  constructor({ rng = Math.random } = {}) { Object.assign(this, { rng, t: 0, active: [], nights: 0, wasNight: false, shots: [], wormPending: -1, headlessRolled: false, bloodMoon: false }); }
  /** ctx: {biome, night, inDunes, onStone}. Возвращает список стартов [{id, kind}]. */
  tick(dt, ctx) {
    const out = []; this.t += dt;
    if (ctx.night && !this.wasNight) { this.nights++; this.headlessRolled = false; this.bloodMoon = this.nights % SCHED.bloodMoonEvery === 0; if (this.bloodMoon) out.push({ id: 'ev_blood_moon', kind: 'event' }); }
    if (!ctx.night && this.wasNight) this.bloodMoon = false;
    this.wasNight = ctx.night;
    if (ctx.night && !this.headlessRolled && WORLD_EVENTS.boss_roam_headless.biomes.includes(ctx.biome)) { this.headlessRolled = true; if (this.rng() < SCHED.headlessNightChance * (this.bloodMoon ? 2 : 1)) out.push({ id: 'boss_roam_headless', kind: 'roaming_miniboss' }); }
    this.shots = this.shots.filter((s) => this.t - s < SCHED.wormWindowS);
    if (this.wormPending < 0 && ctx.inDunes && this.shots.length >= SCHED.wormShots && !this.isActive('boss_roam_sandworm')) { this.wormPending = this.t + SCHED.wormDelayS; out.push({ id: 'boss_roam_sandworm', kind: 'tremor' }); }
    if (this.wormPending >= 0 && this.t >= this.wormPending) { this.wormPending = -1; this.shots = []; if (!ctx.onStone) out.push({ id: 'boss_roam_sandworm', kind: 'roaming_miniboss' }); }
    if (this.t >= SCHED.periodS) { this.t -= SCHED.periodS; this.shots = this.shots.map((s) => s - SCHED.periodS); if (this.wormPending >= 0) this.wormPending -= SCHED.periodS;
      const plain = this.active.filter((a) => a.kind === 'event' && a.id !== 'ev_blood_moon');
      const chance = SCHED.chance * (ctx.night && this.rng() < 0.5 ? 2 : 1);
      if (plain.length < SCHED.maxActive && this.rng() < chance) { const pool = Object.entries(WORLD_EVENTS).filter(([id, e]) => e.kind === 'event' && id !== 'ev_blood_moon' && fits(e, ctx.biome));
        if (pool.length) out.push({ id: pool[Math.floor(this.rng() * pool.length)][0], kind: 'event' }); } }
    for (const o of out) if (o.kind !== 'tremor') this.active.push({ ...o, left: WORLD_EVENTS[o.id].duration || 600 });
    for (const a of this.active) a.left -= dt; this.active = this.active.filter((a) => a.left > 0 && !a.done);
    return out;
  }
  noteShot() { this.shots.push(this.t); }
  isActive(id) { return this.active.some((a) => a.id === id); }
  finish(id) { for (const a of this.active) if (a.id === id) a.done = true; }
}

export function eventPos(px, pz, rng = Math.random) { const a = rng() * Math.PI * 2, d = SCHED.minD + rng() * (SCHED.maxD - SCHED.minD); return { x: px + Math.cos(a) * d, z: pz + Math.sin(a) * d }; }

// ======================= runtime =======================
export async function install(ow) {
  if (!ow?.mobs || ow.worldEvents) return ow?.worldEvents;
  const THREE = await import('three'); const { heightAt, biomeAt } = await import('./terrain.js');
  const AR = await import('./boss-arena.js'); let PM = null; try { PM = await import('./procedural-models.js'); } catch {}
  let KZ = {}; try { KZ = await import('../../shared/defs/theme_kz.js'); } catch {}
  const sch = new EventScheduler(), mobs = ow.mobs, st = ow.state || {}, live = [];
  const hud = AR.createBossHud(document, KZ); hud.el.style.top = '118px';
  // шум для червя: считаем выстрелы через обёртку shoot (если есть) и клики мыши как запасной вариант
  if (typeof ow.shoot === 'function') { const s = ow.shoot; ow.shoot = (...a) => { sch.noteShot(); return s(...a); }; }
  addEventListener('mousedown', (e) => { if (e.button === 0) sch.noteShot(); });
  const origUpd = mobs.update.bind(mobs);
  mobs.update = (dt, player, o) => { origUpd(dt, player, o); try { tick(dt, player); } catch (e) { if (!tick.err) console.warn('[world-events]', e); tick.err = e; } };
  const origRay = mobs.raycast.bind(mobs), V = new THREE.Vector3();
  mobs.raycast = (o, d, maxD) => { let h = origRay(o, d, maxD); for (const L of live) { if (!L.target?.visible) continue; V.copy(L.target.position).setY(L.target.position.y + 1).sub(o); const t = V.dot(d); if (t < 0) continue;
    const q = V.lengthSq() - t * t, r = L.hitR || 1.6; if (q > r * r) continue; const dist = t - Math.sqrt(r * r - q); if (dist < (h ? h.dist : maxD)) h = { mob: L.proxy, zone: L.fight ? (q < 0.4 ? 'head' : 'body') : 'body', dist, point: o.clone().addScaledVector(d, dist) }; } return h; };
  const prevDmg = mobs.damage; mobs.damage = (m, hit) => m?.__ev ? m.__ev(hit) : prevDmg(m, hit);

  function start(ev, player) {
    const e = WORLD_EVENTS[ev.id], P = player.pos;
    if (ev.kind === 'tremor') { ow.hud?.flash?.('Земля дрожит… уходите на камень руин!', 3000); return; }
    if (ev.id === 'ev_blood_moon') { st.bloodMoon = true; ow.hud?.flash?.('Қанды ай · Кровавая луна: элиты ×3, XP +50 %', 4000); live.push({ id: ev.id, left: e.duration, end() { st.bloodMoon = false; } }); return; }
    const pos = ev.kind === 'roaming_miniboss' ? { x: P.x + 40, z: P.z + 40 } : eventPos(P.x, P.z);
    const y = heightAt(pos.x, pos.z);
    if (ev.kind === 'roaming_miniboss') {
      const fight = new BossFight(ev.id, { def: roamDef(ev.id), center: { ...pos }, radius: SCHED.roamLeashM / 1.5 });
      const view = AR.buildBossView(THREE, PM, ev.id, fight.def); view.group.position.set(pos.x, y, pos.z); ow.scene.add(view.group);
      const L = { id: ev.id, fight, view, target: view.group, hitR: view.bodyR, left: 600 }; L.proxy = { __ev: (h) => fight.damage(h), g: view.group, state: 'alive', def: { name: fight.def.name }, hit: { body: [view.bodyY, view.bodyR] } };
      fight.engage(); live.push(L); ow.hud?.flash?.(`☠ ${AR.bossTitle(ev.id, KZ)} рядом!`, 3500); return;
    }
    // обычное событие: объект (повозка/кристалл/разлом) + волны мобов
    const obj = new THREE.Mesh(ev.id.includes('caravan') ? new THREE.BoxGeometry(2.4, 1.6, 4) : new THREE.OctahedronGeometry(1.4), new THREE.MeshLambertMaterial({ color: ev.id === 'ev_starfall' ? '#7fd8ff' : ev.id === 'ev_rift' ? '#b06aff' : '#9a6a3a', emissive: '#221' }));
    obj.position.set(pos.x, y + 1, pos.z); ow.scene.add(obj);
    const hpObj = /HP (\d+)/.exec(e.mech || '')?.[1]; const L = { id: ev.id, target: hpObj ? obj : null, obj, hp: +hpObj || 0, left: e.duration, wave: 0, pos };
    L.proxy = { __ev: (h) => { L.hp -= h.base; if (L.hp <= 0) L.win = true; return { dmg: h.base, hpDmg: h.base }; }, g: obj, state: 'alive', def: { name: e.name }, hit: { body: [0, 1.6] } };
    spawnWave(L, e); live.push(L); ow.hud?.flash?.(`✦ Событие: ${e.name}`, 3000);
  }
  function spawnWave(L, e) { const list = (e.spawnsByBiome?.[biomeAt(L.pos.x, L.pos.z)] || e.spawns || []); L.wave++;
    for (const [id, n] of list) for (let i = 0; i < n; i++) { try { const m = mobs.spawn(id, { x: L.pos.x + (Math.random() - 0.5) * 10, z: L.pos.z + (Math.random() - 0.5) * 10 }, { lvl: 8, elite: L.wave === 2 && i === 0 && e.mech?.includes('элита'), uid: -8000 - i }); if (m) m.state = 'chase'; } catch {} } }
  function reward(L, ok) { const e = WORLD_EVENTS[L.id]; sch.finish(L.id); if (!ok || !e.rewards) return; const xp = typeof e.rewards.xp === 'number' ? e.rewards.xp : 0;
    st.xp = (st.xp || 0) + Math.round(xp * (st.bloodMoon ? 1.5 : 1)); st.inv = st.inv || {}; for (const [it] of e.rewards.items || []) st.inv[it] = (st.inv[it] || 0) + 1;
    ow.hud?.flash?.(`Событие «${e.name}» завершено: +${xp} XP`, 3000); }
  function tick(dt, player) {
    const P = player.pos, biome = biomeAt(P.x, P.z);
    const starts = sch.tick(dt, { biome, night: !!ow.sky?.night, inDunes: biome === 'b_desert_ruins', onStone: false });
    for (const s of starts) start(s, player);
    for (let i = live.length - 1; i >= 0; i--) { const L = live[i]; L.left -= dt; let done = L.left <= 0;
      if (L.fight) { const f = L.fight; f.center.x = f.pos.x; f.center.z = f.pos.z; f.update(dt, { x: P.x, z: P.z, dead: !!player.dead }); // бродит за игроком, поводок от текущей точки
        for (const ev of f.events.splice(0)) if (ev.kind === 'strike') for (const h of ev.hits) for (let k = 0; k < Math.min(h.count, 3); k++) mobs.onPlayerHit?.(h);
        if (f.phase === 1) f.speed = L.id === 'boss_roam_headless' ? 0.6 : 1.2;
        L.view.group.position.set(f.pos.x, heightAt(f.pos.x, f.pos.z), f.pos.z); L.view.animate(f.cast ? 'attack_a' : 'run', performance.now() / 1000);
        if (Math.hypot(P.x - f.pos.x, P.z - f.pos.z) < 60) hud.show(L.id, f, '—');
        if (f.state === 'dead') { st.xp = (st.xp || 0) + f.def.rewards.xp; st.inv = st.inv || {}; for (const [it] of f.def.rewards.items) st.inv[it] = (st.inv[it] || 0) + 1; st.skillPoints = (st.skillPoints || 0) + 1;
          hud.victory(L.id, { xp: f.def.rewards.xp, skillPoints: 1, legendaryUnlocks: [] }, 'Минибосс повержен'); done = true; } }
      else if (L.obj) { L.obj.rotation.y += dt; if (L.wave === 1 && L.left < WORLD_EVENTS[L.id].duration / 2 && WORLD_EVENTS[L.id].mech?.includes('волн')) spawnWave(L, WORLD_EVENTS[L.id]);
        if (L.win) { reward(L, true); done = true; } else if (done) reward(L, !L.target); }
      if (done) { L.end?.(); if (L.view) ow.scene.remove(L.view.group); if (L.obj) ow.scene.remove(L.obj); live.splice(i, 1); if (!live.some((x) => x.fight)) hud.hide(); } }
  }
  const api = { scheduler: sch, live, start: (id) => start({ id, kind: WORLD_EVENTS[id]?.kind || 'event' }, ow.player) };
  ow.worldEvents = api; window.__OW_EVENTS = api;
  const q = new URLSearchParams(location.search).get('owevent'); if (q && WORLD_EVENTS[q]) setTimeout(() => api.start(q), 600);
  return api;
}
