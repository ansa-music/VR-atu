// js/world/bosses.js — боссы открытого мира (SAO-этажи): логика боя без Three.js (тестируется в node) + install(ow) для runtime.
// Данные — только из shared/defs (BOSSES, WORLD_EVENTS, LEVEL_CURVE, KZ_BOSSES). main.js не трогаем: install() оборачивает
// ow.mobs.raycast/damage/update, поэтому оружие, рывок и заклинания попадают по боссу без правок основного цикла.
import { BOSSES, LEVEL_CURVE } from '../../shared/defs/index.js';
import { resolveHit } from '../../shared/damage.js';

export const FLOORS = Object.freeze([
  { floor: 1, boss: 'boss_slime_king', biome: 'b_meadow' }, { floor: 2, boss: 'boss_rotroot', biome: 'b_forest' },
  { floor: 3, boss: 'boss_hydra_tinara', biome: 'b_swamp' }, { floor: 4, boss: 'boss_ymir', biome: 'b_mountains' },
  { floor: 5, boss: 'boss_akhmaret', biome: 'b_desert_ruins' }, { floor: 6, boss: 'boss_ignarok', biome: 'b_volcano' }]);
export const RULES = Object.freeze({ leashMul: 1.5, leashS: 10, regenS: 10, worldSpawnOffPad: 30, enrageDmg: 1.5, staggerVuln: 0.3,
  respawnNights: 1, firstKillSkillPoints: 2, repeatSkillPoints: 0, aggroDelayS: 2.5, introS: 2.2, globalAtkGapS: 1.1, safeZoneM: 4 });
// Скриптовые механики фаз (текст mech из BOSSES → поведение). Только ссылки на реальные m_* и ba_*.
export const PHASE_SCRIPTS = Object.freeze({
  boss_slime_king: { 1: { addsEveryHpPct: 0.15, adds: [['m_meadow_slime', 4]], onEnter: [['m_meadow_slime', 4]] }, 2: { scale: 0.7, speed: 1.3, weakAlways: true } },
  boss_rotroot: { 1: { onEnter: [['m_thorn_treant', 2, 0.5]], objectives: { kind: 'anchor', n: 3, hp: 600, weakTo: 'fire', reward: { stagger: 6 } } }, 2: { speed: 1.4, mobile: true } },
  boss_hydra_tinara: { 1: { dmg: 1.2, hazard: 'flood' }, 2: { weakAlways: true } },
  boss_ymir: { 1: { shield: 3000, objectives: { kind: 'crystal', n: 4, hp: 800, weakTo: 'lightning' } }, 2: { aura: { status: 'st_chill', every: 4, r: 8 }, hazard: 'blizzard' } },
  boss_akhmaret: { 0: { summonOn: { ba_scarab_call: [['m_scarab_swarm', 2]] } }, 1: { teleport: 'obelisk', objectives: { kind: 'mirror', n: 4, hp: 1, reward: { stagger: 4, vuln: 0.3 } } }, 2: { hazard: 'eclipse' } },
  boss_ignarok: { 1: { airborne: true, objectives: { kind: 'ballista', n: 4, hp: 1, reward: { stagger: 8, vuln: 0.3 } } }, 2: { addsEveryS: 25, adds: [['m_magma_imp', 4]], cover: 'obsidian' } },
});

const hpAtLevel = (def) => Math.round(def.hp * (LEVEL_CURVE?.hpMult ? LEVEL_CURVE.hpMult(def.lvl) : 1));
export function bossDef(id) { return BOSSES[id] || null; }
export function floorOf(id) { return FLOORS.find((f) => f.boss === id)?.floor ?? 0; }
export function nextFloor(id) { const f = floorOf(id); return FLOORS.find((x) => x.floor === f + 1) || null; }

/** Награды: уникальные it_uniq_* и легендарки — только за первое убийство; повтор — профиль elite (без уникальных). */
export function computeRewards(id, { firstKill = true, legendaries = [] } = {}) {
  const d = BOSSES[id]; if (!d) return null; const r = d.rewards;
  const items = r.items.filter(([it]) => firstKill || !it.startsWith('it_uniq_')).map(([it, pct]) => ({ id: it, chance: pct / 100 }));
  const leg = firstKill ? legendaries.filter((l) => l.unlock?.boss === id).map((l) => l.id) : [];
  return { xp: firstKill ? r.xp : Math.round(r.xp * 0.5), profile: firstKill ? r.rw : 'elite', items, legendaryUnlocks: leg,
    skillPoints: firstKill ? RULES.firstKillSkillPoints : RULES.repeatSkillPoints, fastTravel: firstKill ? r.fastTravel || null : null, firstKill, gateOf: id };
}

/** Машина состояний одного боя. Время — секунды, позиции — {x,z}. События копятся в this.events (читает визуал/HUD). */
export class BossFight {
  constructor(id, { def = BOSSES[id], rng = Math.random, center = { x: 0, z: 0 }, radius = def?.arena?.radius || 24, hp } = {}) {
    if (!def) throw new Error('unknown boss ' + id);
    Object.assign(this, { id, def, rng, center, radius });
    this.hpMax = hp ?? hpAtLevel(def); this.events = []; this.script = PHASE_SCRIPTS[id] || {}; this.reset(true);
  }
  reset(silent = false) {
    Object.assign(this, { hp: this.hpMax, state: 'idle', phase: 0, t: 0, fightT: 0, enraged: false, stagger: 0, staggerT: 0, vulnT: 0, vuln: 0,
      shield: 0, cast: null, gap: RULES.aggroDelayS, cds: {}, objectives: [], lastAddHp: 1, addT: 0, auraT: 0, leashT: 0, pos: { ...this.center }, scale: 1, speed: 1 });
    if (!silent) this.emit('reset', {});
  }
  emit(kind, data) { this.events.push({ kind, t: this.fightT, ...data }); if (this.events.length > 64) this.events.shift(); }
  get frac() { return this.hp / this.hpMax; }
  get alive() { return this.state !== 'dead'; }
  get phaseDef() { return this.def.phases[this.phase]; }
  get weakOpen() { return this.state === 'staggered' || !!this.script[this.phase]?.weakAlways; }
  get dmgMul() { return (this.enraged ? RULES.enrageDmg : 1) * (this.script[this.phase]?.dmg || 1); }
  /** Пул атак: атаки текущей фазы + все предыдущие (фаза без атак не обнуляет набор). */
  attackPool() { const out = []; for (let i = 0; i <= this.phase; i++) out.push(...(this.def.phases[i].attacks || [])); return out; }
  engage() { if (this.state !== 'idle') return false; this.state = 'intro'; this.t = 0; this.emit('engage', { name: this.def.name }); return true; }

  update(dt, player) {
    if (this.state === 'idle' || this.state === 'dead') return;
    const dist = Math.hypot(player.x - this.center.x, player.z - this.center.z);
    // правило выхода: дальше 1,5 R дольше 10 с → полное HP и сброс фазы (игрока не убиваем)
    if (dist > this.radius * RULES.leashMul) { this.leashT += dt; if (this.leashT >= RULES.leashS) { this.reset(); return; } } else this.leashT = 0;
    if (player.dead) { this.leashT += dt; if (this.leashT >= RULES.leashS) { this.reset(); return; } }
    this.t += dt;
    if (this.state === 'intro') { if (this.t >= RULES.introS) { this.state = 'fight'; this.t = 0; this.emit('phase', { phase: 0, name: this.phaseDef.name }); } return; }
    this.fightT += dt;
    if (!this.enraged && this.fightT >= this.def.enrage.time) { this.enraged = true; this.emit('enrage', { effect: this.def.enrage.effect }); }
    if (this.vulnT > 0 && (this.vulnT -= dt) <= 0) this.vuln = 0;
    for (const k in this.cds) this.cds[k] -= dt;
    if (this.state === 'staggered') { if ((this.staggerT -= dt) <= 0) { this.state = 'fight'; this.stagger = 0; this.emit('recover', {}); } return; }
    const sc = this.script[this.phase] || {};
    if (sc.addsEveryS && (this.addT += dt) >= sc.addsEveryS) { this.addT = 0; this.emit('adds', { mobs: sc.adds }); }
    if (sc.aura && (this.auraT += dt) >= sc.aura.every) { this.auraT = 0; if (dist <= sc.aura.r) this.emit('aura', { status: sc.aura.status }); }
    // преследование: босс держится внутри арены, мобильные фазы — быстрее
    const sp = (sc.mobile || this.phase > 0 ? 2.2 : 1.2) * (sc.speed || 1), dx = player.x - this.pos.x, dz = player.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    if (!this.cast && d > 4) { this.pos.x += dx / d * sp * dt; this.pos.z += dz / d * sp * dt; const cr = Math.hypot(this.pos.x - this.center.x, this.pos.z - this.center.z), lim = this.radius - 3;
      if (cr > lim) { this.pos.x = this.center.x + (this.pos.x - this.center.x) * lim / cr; this.pos.z = this.center.z + (this.pos.z - this.center.z) * lim / cr; } }
    if (this.cast) {
      this.cast.t += dt;
      if (this.cast.t >= this.cast.atk.tele) { const a = this.cast.atk, at = this.cast.at;
        const hits = []; const n = a.count || 1;
        const inR = Math.hypot(player.x - at.x, player.z - at.z) <= (a.aoe || 5) + 0.5;
        const arenaWide = /Сверхнова|Лавина|Накат|Вращающиеся/.test(a.name);
        if (inR || arenaWide) hits.push({ base: a.dmg * this.dmgMul, type: a.type, count: n, status: a.status, stagger: /st_stagger/.test(JSON.stringify(a.status || '')) ? 0.5 : 0, arenaWide, coverable: arenaWide });
        this.emit('strike', { atk: a, at, hits }); this.cast = null; this.gap = RULES.globalAtkGapS;
        const sum = this.script[0]?.summonOn?.[a.id]; if (sum) this.emit('adds', { mobs: sum });
      }
      return;
    }
    if ((this.gap -= dt) > 0) return;
    const pool = this.attackPool().filter((a) => (this.cds[a.id] ?? 0) <= 0);
    if (pool.length) { const a = pool[Math.floor(this.rng() * pool.length)]; this.cds[a.id] = a.cd;
      const at = a.aoe ? { x: player.x, z: player.z } : { ...this.pos }; this.cast = { atk: a, t: 0, at }; this.emit('telegraph', { atk: a, at, tele: a.tele, r: a.aoe || 2.5 }); }
  }

  /** Урон по боссу. hit: {base,type,zone:'body'|'head'|'weak'|'objective',zoneKind,stagger,control,objective}. Возвращает результат resolveHit. */
  damage(hit) {
    if (this.state === 'dead' || this.state === 'idle' && !this.engage()) return null;
    if (hit.objective != null) return this.damageObjective(hit.objective, hit);
    let zone = hit.zone === 'head' || hit.zone === 'weak' ? (this.weakOpen ? 'weak' : 'body') : 'body';
    const vuln = []; if (this.vuln) vuln.push(this.vuln); if (this.state === 'staggered') vuln.push(RULES.staggerVuln);
    const r = resolveHit({ ...hit, zone, zoneKind: hit.zoneKind || 'other', weakMult: this.def.zones.weak.mult, vuln, target: { hp: this.hp, shield: this.shield, armor: 0, res: this.def.res } });
    this.shield = Math.max(0, this.shield - (r.shieldDmg || 0)); this.hp = Math.max(0, this.hp - r.hpDmg);
    if (this.state !== 'staggered' && this.state !== 'intro') { this.stagger += (zone === 'weak' || hit.zone === 'head' ? r.dmg : r.dmg * 0.25) + (hit.stagger || 0) * 150 + (hit.control ? 200 : 0);
      if (this.stagger >= this.def.stagger.bar) this.doStagger(this.def.stagger.dur); }
    this.checkPhase(); if (this.hp <= 0) this.die();
    return { ...r, zone, boss: true, killed: this.hp <= 0 };
  }
  doStagger(sec, vuln = 0) { this.state = 'staggered'; this.staggerT = sec; this.cast = null; this.stagger = this.def.stagger.bar; if (vuln) { this.vuln = vuln; this.vulnT = sec; } this.emit('stagger', { sec }); }
  damageObjective(i, hit) {
    const o = this.objectives[i]; if (!o || o.hp <= 0) return null;
    const mul = o.weakTo && hit.type === o.weakTo ? 1.5 : 1; o.hp -= Math.max(1, hit.base * mul); if (o.hp > 0) return { dmg: hit.base * mul, objective: true };
    this.emit('objective', { i, kind: o.kind });
    if (this.objectives.every((x) => x.hp <= 0) || o.kind === 'mirror' || o.kind === 'ballista') {
      const rw = this.script[this.phase]?.objectives?.reward || {};
      if (o.kind === 'crystal' && this.objectives.every((x) => x.hp <= 0)) { this.shield = 0; this.emit('shieldBroken', {}); }
      if (rw.stagger) this.doStagger(rw.stagger, rw.vuln || 0);
      if (o.kind === 'mirror' || o.kind === 'ballista') o.hp = o.max; // многоразовые: зеркало/гарпун можно использовать снова
    }
    return { dmg: hit.base * mul, objective: true };
  }
  checkPhase() {
    const ph = this.def.phases; let p = this.phase; while (p + 1 < ph.length && this.frac <= ph[p + 1].from) p++;
    if (p !== this.phase) { this.phase = p; const sc = this.script[p] || {}; this.addT = 0; this.lastAddHp = this.frac; this.cast = null;
      if (sc.shield) this.shield = sc.shield; this.scale = sc.scale || 1; this.speed = sc.speed || 1;
      this.objectives = sc.objectives ? Array.from({ length: sc.objectives.n }, (_, i) => ({ kind: sc.objectives.kind, hp: sc.objectives.hp, max: sc.objectives.hp, weakTo: sc.objectives.weakTo, i })) : [];
      this.emit('phase', { phase: p, name: ph[p].name, mech: ph[p].mech || '' }); if (sc.onEnter) this.emit('adds', { mobs: sc.onEnter });
    }
    const sc = this.script[this.phase] || {};
    if (sc.addsEveryHpPct && this.lastAddHp - this.frac >= sc.addsEveryHpPct) { this.lastAddHp = this.frac; this.emit('adds', { mobs: sc.adds }); }
  }
  die() { this.state = 'dead'; this.cast = null; this.emit('defeated', { id: this.id, timeS: Math.round(this.fightT) }); }
}

/** Реестр поражений/респауна (1 игровая ночь; в кровавую луну поверженные не воскресают). Сериализуется в localStorage. */
export class BossRegistry {
  constructor(saved = {}) { this.s = { kills: {}, ...saved }; }
  isFirstKill(id) { return !this.s.kills[id]; }
  onDefeat(id, nightIdx) { const k = this.s.kills[id] || { count: 0 }; k.count++; k.lastNight = nightIdx; this.s.kills[id] = k; return k.count === 1; }
  isAvailable(id, nightIdx, { bloodMoon = false } = {}) { const k = this.s.kills[id]; if (!k) return true; if (bloodMoon) return false; return nightIdx - k.lastNight >= RULES.respawnNights; }
  defeated(id) { return !!this.s.kills[id]; }
  toJSON() { return this.s; }
}

// ======================= runtime (браузер) =======================
/**
 * install(ow): ow = window.__OW (api из js/openworld/main.js) + опционально ow.zones. Подключение — одна строка в main.js
 * после `window.__OW = api`:  import('../world/bosses.js').then((m) => m.install(api)).catch((e) => console.warn('[bosses]', e));
 */
export async function install(ow) {
  if (!ow?.scene || !ow?.mobs || ow.bosses) return ow?.bosses;
  const THREE = await import('three');
  const AR = await import('./boss-arena.js');
  const { POIS } = await import('../../shared/defs/index.js');
  let KZ = {}; try { KZ = await import('../../shared/defs/theme_kz.js'); } catch {}
  let LEG = []; try { const fx = await import('../../shared/defs/fantasy_extras.js'); LEG = Object.entries(fx.LEGENDARY_VARIANTS || {}).map(([id, v]) => ({ id, ...v })); } catch {}
  let PM = null; try { PM = await import('./procedural-models.js'); } catch {}
  const Q = new URLSearchParams(location.search), mobs = ow.mobs, st = ow.state || {};
  let reg; try { reg = new BossRegistry(JSON.parse(localStorage.getItem('ow_bosses_v1') || '{}')); } catch { reg = new BossRegistry(); }
  const save = () => { try { localStorage.setItem('ow_bosses_v1', JSON.stringify(reg)); } catch {} };
  const hud = AR.createBossHud(document, KZ);
  const { heightAt } = await import('./terrain.js');
  const music = AR.createBossMusic();
  let nightIdx = 0, wasNight = false;
  const fights = [];
  for (const f of FLOORS) {
    const def = BOSSES[f.boss], p = POIS.find((x) => x.id === def.arena.poi); if (!p) continue;
    const c = { x: p.pos[0], z: p.pos[1] }, y = safeH(heightAt, c.x, c.z);
    const fight = new BossFight(f.boss, { center: c, radius: def.arena.radius });
    const arena = AR.buildArena(THREE, { id: f.boss, center: c, y, radius: def.arena.radius, floor: f.floor, kz: KZ.KZ_BOSSES?.[f.boss], poiKz: KZ.KZ_POIS?.[def.arena.poi] });
    ow.scene.add(arena.group);
    const view = AR.buildBossView(THREE, PM, f.boss, def); view.group.visible = reg.isAvailable(f.boss, nightIdx); ow.scene.add(view.group);
    view.group.position.set(c.x, y, c.z);
    fights.push({ f, def, fight, arena, view, y, proxy: makeProxy(fight, view) });
  }
  function makeProxy(fight, view) { return { __boss: fight, state: 'alive', g: view.group, def: { name: fight.def.name, zones: fight.def.zones }, hit: { body: [view.bodyY, view.bodyR], head: [view.weakY, view.weakR] } }; }

  // --- оружие/рывок/заклинания: расширяем raycast и damage MobManager ---
  const origRay = mobs.raycast.bind(mobs), origDmg = mobs.damage.bind(mobs), origUpd = mobs.update.bind(mobs);
  const ext = []; // доп. цели (боссы, объекты фаз, цели событий): { test(o,d,max)->{dist,zone,objective}|null, proxy }
  const V = new THREE.Vector3(), W = new THREE.Vector3();
  const sphere = (o, d, c, r) => { V.copy(c).sub(o); const t = V.dot(d); if (t < 0) return null; const q = V.lengthSq() - t * t; return q > r * r ? null : t - Math.sqrt(r * r - q); };
  for (const F of fights) ext.push({ proxy: F.proxy, test(o, d, max) {
    if (!F.fight.alive || !F.view.group.visible) return null; const g = F.view.group, s = F.fight.scale; let best = null;
    const tw = sphere(o, d, W.set(g.position.x, g.position.y + F.view.weakY * s, g.position.z), F.view.weakR * s); if (tw != null && tw < max) best = { dist: tw, zone: 'head' };
    const tb = sphere(o, d, W.set(g.position.x, g.position.y + F.view.bodyY * s, g.position.z), F.view.bodyR * s); if (tb != null && tb < max && (!best || tb < best.dist - 0.3)) best = { dist: tb, zone: 'body' };
    F.arena.objectives.forEach((ob, i) => { if (!ob.visible) return; const t = sphere(o, d, ob.getWorldPosition(W), ob.userData.r || 1.2); if (t != null && t < max && (!best || t < best.dist)) best = { dist: t, zone: 'body', objective: i }; });
    return best; } });
  mobs.raycast = (o, d, maxD) => { let h = origRay(o, d, maxD); for (const e of ext) { const r = e.test(o, d, h ? h.dist : maxD); if (r && (!h || r.dist < h.dist)) h = { mob: e.proxy, zone: r.zone, dist: r.dist, objective: r.objective, point: o.clone().addScaledVector(d, r.dist) }; } if (h?.objective != null) h.mob = { ...h.mob, __objective: h.objective }; return h; };
  mobs.damage = (m, hit) => { if (m?.__boss) { const r = m.__boss.damage({ ...hit, objective: m.__objective }); if (r && !r.objective) { m.__boss.__lastHitAt = performance.now(); } return r ? { ...r, dmg: r.dmg ?? 0, hpDmg: r.hpDmg ?? 0 } : null; } if (m?.__ext) return m.__ext.damage(hit); return origDmg(m, hit); };
  mobs.update = (dt, player, o) => { origUpd(dt, player, o); try { tick(dt, player); } catch (e) { if (!tick.err) console.warn('[bosses] tick', e); tick.err = e; } };
  const stats = { strikes: 0, playerHits: 0 }; const hitPlayer = (h) => { stats.playerHits++; try { mobs.onPlayerHit?.(h); } catch (e) { console.warn('[bosses] hit', e); } };
  const addsAlive = [];
  let active = null, tAnim = 0;

  function tick(dt, player) {
    tAnim += dt; const P = player.pos;
    const night = !!ow.sky?.night; if (night && !wasNight) nightIdx++; wasNight = night;
    for (const F of fights) {
      const { fight, arena, view } = F; const d = Math.hypot(P.x - fight.center.x, P.z - fight.center.z);
      // респаун через 1 ночь
      if (fight.state === 'dead' && F.handled && reg.isAvailable(F.f.boss, nightIdx, { bloodMoon: !!st.bloodMoon })) { F.handled = false; fight.reset(true); view.group.visible = true; view.group.scale.setScalar(1); }
      arena.update(dt, { active: fight.state !== 'idle' && fight.state !== 'dead', near: d < fight.radius + 40, t: tAnim });
      if (d > 160 && fight.state === 'idle') { view.group.visible = view.group.visible && true; continue; }
      // вход через туманную стену (как комнаты боссов SAO): пересёк радиус минус безопасная зона → бой
      if (fight.state === 'idle' && view.group.visible && d < fight.radius - RULES.safeZoneM && !player.dead) { fight.engage(); }
      fight.update(dt, { x: P.x, z: P.z, dead: !!player.dead });
      for (const ev of fight.events.splice(0)) onEvent(F, ev, player);
      // визуал
      if (fight.alive && view.group.visible) {
        const g = view.group; g.position.x = fight.pos.x; g.position.z = fight.pos.z; g.position.y = safeH(heightAt, fight.pos.x, fight.pos.z) + (fight.script[fight.phase]?.airborne && fight.state !== 'staggered' ? 6 : 0);
        g.scale.setScalar(fight.scale); g.rotation.y = Math.atan2(P.x - g.position.x, P.z - g.position.z);
        view.animate(fight.cast ? 'attack_a' : fight.state === 'staggered' ? 'stagger' : fight.state === 'fight' ? 'walk' : 'idle', tAnim);
        arena.setObjectives(fight.objectives);
      }
      if (fight.state !== 'idle' && fight.state !== 'dead') active = F; else if (active === F) active = null;
    }
    // HUD/музыка/спавн мира
    if (active) { const f = active.fight; hud.show(active.f.boss, f, active.f.floor); music.play(active.def.biome, f.enraged ? 1 : 0.7 + 0.1 * f.phase);
      if (ow.director) ow.director.__bossLock = { x: f.center.x, z: f.center.z, r: f.radius + RULES.worldSpawnOffPad }; }
    else { hud.hide(); music.stop(); if (ow.director) ow.director.__bossLock = null; }
    for (let i = addsAlive.length - 1; i >= 0; i--) if (addsAlive[i].state === 'dead') addsAlive.splice(i, 1);
  }
  // гасим паки мира внутри арены + 30 м, не меняя main.js
  if (ow.director?.requestPack) { const orig = ow.director.requestPack.bind(ow.director); ow.director.requestPack = (a) => { const L = ow.director.__bossLock; if (L && a?.player && Math.hypot(a.player.x - L.x, a.player.z - L.z) < L.r) return null; return orig(a); }; }

  function onEvent(F, ev, player) {
    const { fight, arena } = F; (stats.log ||= []).push(ev.kind); if (stats.log.length > 40) stats.log.shift();
    switch (ev.kind) {
      case 'engage': arena.setFog(true); ow.hud?.flash?.(`⚔ ${AR.bossTitle(F.f.boss, KZ)} — этаж ${F.f.floor}`, 2500); break;
      case 'telegraph': arena.telegraph(ev.atk, ev.at, ev.tele, ev.r, (x, z) => safeH(heightAt, x, z)); break;
      case 'strike': stats.strikes++; arena.flashStrike(ev.at, ev.atk);
        for (const h of ev.hits) { if (h.coverable && arena.inCover(player.pos, fight.pos)) continue; for (let i = 0; i < Math.min(h.count, 6); i++) hitPlayer({ base: h.base, type: h.type, stagger: h.stagger }); } break;
      case 'aura': hitPlayer({ base: 1, type: 'frost', status: { [ev.status]: 1 } }); break;
      case 'adds': for (const [id, n, hpMul = 1] of ev.mobs) for (let i = 0; i < n; i++) { try { const a = (i / n) * Math.PI * 2; const m = mobs.spawn(id, { x: fight.pos.x + Math.cos(a) * 5, z: fight.pos.z + Math.sin(a) * 5 }, { lvl: fight.def.lvl, hpMul, uid: -9000 - i }); if (m) { m.state = 'chase'; addsAlive.push(m); } } catch {} } break;
      case 'phase': hud.phase(ev.name, ev.mech); arena.setPhase(ev.phase, F.f.boss); break;
      case 'stagger': hud.flashStagger(); break;
      case 'enrage': ow.hud?.flash?.('ЯРОСТЬ: ' + ev.effect, 3000); arena.setEnrage(true); break;
      case 'reset': arena.setFog(false); arena.setEnrage(false); arena.clearTelegraphs(); for (const m of addsAlive) if (m.state !== 'dead') m.state = 'return'; ow.hud?.flash?.('Босс восстановился: вы покинули арену', 2500); break;
      case 'defeated': {
        arena.setFog(false); arena.setEnrage(false); arena.clearTelegraphs(); const first = reg.onDefeat(F.f.boss, nightIdx); F.handled = true; save();
        const rw = computeRewards(F.f.boss, { firstKill: first, legendaries: LEG }); grant(rw); F.view.group.visible = false;
        try { ow.zones?.markBossDefeated?.(F.f.boss); } catch (e) { console.warn('[bosses] zones', e); }
        const nx = nextFloor(F.f.boss); hud.victory(F.f.boss, rw, nx ? `Ворота на этаж ${nx.floor} открыты` : 'Финал: Айдаһар повержен');
        window.dispatchEvent(new CustomEvent('ow:boss-defeated', { detail: { id: F.f.boss, rewards: rw, floor: F.f.floor } })); break; }
    }
  }
  function grant(rw) {
    st.xp = (st.xp || 0) + rw.xp; st.skillPoints = (st.skillPoints || 0) + rw.skillPoints; st.inv = st.inv || {};
    for (const it of rw.items) if (Math.random() < it.chance) { if (it.id === 'it_gold') st.gold = (st.gold || 0) + 150; else st.inv[it.id] = (st.inv[it.id] || 0) + 1; }
    for (const l of rw.legendaryUnlocks) (st.legendaries ||= []).push(l);
    try { ow.progression?.addXp?.(rw.xp, 'boss'); ow.progression?.addSkillPoints?.(rw.skillPoints); } catch {}
  }
  const api = { stats, fights, registry: reg, FLOORS, isDefeated: (id) => reg.defeated(id), get active() { return active?.fight || null; },
    tp(id) { const F = fights.find((x) => x.f.boss === id) || fights[0]; const c = F.fight.center; ow.tp?.(c.x, c.z + F.fight.radius + 2); if (ow.player) ow.player.yaw = 0; return F; },
    start(id) { const F = api.tp(id); F.view.group.visible = true; if (F.fight.state === 'dead') F.fight.reset(true); ow.tp?.(F.fight.center.x, F.fight.center.z + F.fight.radius - 8); F.fight.engage(); return F.fight; },
    hurt(n, zone = 'body') { const f = active?.fight; return f?.damage({ base: n, type: 'physical', zone }); }, kill() { const f = active?.fight; if (f) { f.hp = 1; f.damage({ base: 1e6, type: 'arcane' }); } } };
  ow.bosses = api; window.__OW_BOSS = api;
  const dbg = Q.get('owboss'); if (dbg) setTimeout(() => { api.start(BOSSES[dbg] ? dbg : FLOORS[0].boss); console.info('[bosses] debug fight', dbg); }, 400);
  try { (await import('./world-events.js')).install?.(ow); } catch (e) { console.warn('[bosses] world-events', e); }
  console.info(`[bosses] installed ${fights.length} arenas`);
  return api;
}
function safeH(h, x, z) { try { const v = h(x, z); return Number.isFinite(v) ? v : 0; } catch { return 0; } }
