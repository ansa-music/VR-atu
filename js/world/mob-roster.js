// js/world/mob-roster.js — «Монстры K»: все 32 моба из MOBS играбельны в любом биоме.
// Подключение: install(ow) поверх MobManager из js/world/mobs.js (main.js НЕ меняется, кроме хука).
// Делает: пул моделей, роли-поведения (mob-behaviors.js), телеграфы атак, элитные аффиксы (визуал + эффекты),
// зоны попадания по сокетам моделей (hitzones.js), таблички «имя (каз.) · уровень · HP», агро/поводок, лагеря/гнёзда CAMP_LAYOUTS,
// лимиты PERF_CAPS (Quest: 18 активных) и тиры тика ИИ.
import * as THREE from 'three';
import { MOBS, POIS, SPAWN_TABLES, PERF_CAPS, ELITE_AFFIXES, STATUSES, levelMul } from '../../shared/defs/index.js';
import { CAMP_LAYOUTS } from '../../shared/defs/spawn.js';
import { KZ_MOBS } from '../../shared/defs/theme_kz.js';
import { getModel, toonColor } from './models.js';
import { heightAt, biomeAt } from './terrain.js';
import { computeHitZones, raycastZones } from './hitzones.js';
import { think, telegraphOf, inTelegraph, affixMods, afterAttack, attackCd, windupS, roleOf, AFFIX_COLORS, TYPE_COLORS } from './mob-behaviors.js';

const Q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const v3 = new THREE.Vector3();
const nameOf = (id) => KZ_MOBS?.[id]?.nameKk || MOBS[id]?.name || id;

// ---------- общие геометрии (один раз на всю игру) ----------
const GEO = {
  disc: new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2),
  ring: new THREE.RingGeometry(0.92, 1, 40).rotateX(-Math.PI / 2),
  rect: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5), // от моба вперёд (−Z)
  bubble: new THREE.SphereGeometry(1, 14, 10),
  orb: new THREE.IcosahedronGeometry(0.22, 0),
  wall: new THREE.BoxGeometry(4, 2, 0.5),
};
const coneGeo = new Map();
function cone(angDeg) { // сектор, ось −Z
  if (!coneGeo.has(angDeg)) { const a = (angDeg * Math.PI) / 180; const g = new THREE.CircleGeometry(1, Math.max(8, Math.round(angDeg / 8)), Math.PI / 2 - a / 2, a).rotateX(-Math.PI / 2); coneGeo.set(angDeg, g); }
  return coneGeo.get(angDeg);
}
const matCache = new Map();
const decalMat = (col, op) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

// ---------- телеграфы ----------
class Telegraphs {
  constructor(scene) { this.scene = scene; this.live = []; this.pool = []; }
  show(tg, x, z, fx, fz, dur) {
    let o = this.pool.pop();
    if (!o) { o = { g: new THREE.Group(), edge: new THREE.Mesh(GEO.ring, decalMat('#fff', 0.9)), base: new THREE.Mesh(GEO.disc, decalMat('#fff', 0.22)), fill: new THREE.Mesh(GEO.disc, decalMat('#fff', 0.45)) }; o.g.add(o.base, o.fill, o.edge); o.g.renderOrder = 3; }
    const c = new THREE.Color(tg.color); for (const k of ['edge', 'base', 'fill']) o[k].material.color.copy(c);
    const sh = tg.shape;
    const geo = sh === 'cone' ? cone(tg.ang) : (sh === 'rect' || sh === 'aim') ? GEO.rect : GEO.disc;
    o.base.geometry = geo; o.fill.geometry = geo; o.edge.visible = sh === 'circle' || sh === 'ring' || sh === 'glyph';
    const sx = sh === 'rect' || sh === 'aim' ? (tg.w || (sh === 'aim' ? 0.18 : 1)) : (tg.r || tg.len || 1), sz = sh === 'rect' || sh === 'aim' || sh === 'cone' ? tg.len : sx;
    o.g.scale.set(sx, 1, sz); o.g.position.set(x, heightAt(x, z) + 0.07, z); o.g.rotation.y = Math.atan2(-fx, -fz);
    o.t = 0; o.dur = Math.max(0.05, dur); o.tg = tg; o.persist = !!tg.persistent; this.scene.add(o.g); this.live.push(o); return o;
  }
  hide(o) { if (!o) return; const i = this.live.indexOf(o); if (i >= 0) this.live.splice(i, 1); this.scene.remove(o.g); this.pool.push(o); }
  update(dt) {
    for (const o of this.live) {
      o.t += dt; const k = Math.min(1, o.t / o.dur);
      if (o.persist) { o.fill.scale.setScalar(1); o.base.material.opacity = 0.1 + 0.06 * Math.sin(o.t * 6); o.fill.material.opacity = 0.05; continue; }
      // заполнение от центра к краю + белая вспышка в последние 0,12 с (VR: видно периферией)
      o.fill.scale.set(o.tg.shape === 'rect' || o.tg.shape === 'aim' ? 1 : k, 1, k);
      const late = o.dur - o.t < 0.12; o.fill.material.opacity = late ? 0.85 : 0.35 + 0.15 * Math.sin(o.t * 18); if (late) o.fill.material.color.set('#ffffff');
    }
  }
}

// ---------- табличка над мобом ----------
class Plate {
  constructor(m) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 72; this.cv = cv; this.ctx = cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(cv); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthTest: true, transparent: true })); this.sp.scale.set(1.7, 0.48, 1); this.sp.renderOrder = 5;
    this.key = ''; this.draw(m);
  }
  draw(m) {
    const hpK = Math.max(0, Math.ceil((m.hp / m.hpMax) * 20)), sh = m.shield > 0 ? Math.ceil(m.shield / Math.max(1, m.shieldMax) * 10) : 0, key = hpK + '|' + sh + '|' + m.lvl;
    if (key === this.key) return; this.key = key; const c = this.ctx, W = 256;
    c.clearRect(0, 0, W, 72); c.fillStyle = 'rgba(12,10,28,.72)'; c.beginPath(); c.roundRect?.(2, 2, W - 4, 68, 12); c.fill();
    c.font = 'bold 26px sans-serif'; c.textAlign = 'center'; c.fillStyle = m.elite ? '#ffcf4a' : '#f4efe0';
    const name = (m.elite ? '★ ' : '') + nameOf(m.id); let fs = 26; c.font = `bold ${fs}px sans-serif`; while (c.measureText(name).width > W - 92 && fs > 14) c.font = `bold ${--fs}px sans-serif`;
    c.textAlign = 'left'; c.fillText(name, 14, 30);
    c.fillStyle = '#9ff'; c.font = 'bold 22px sans-serif'; c.textAlign = 'right'; c.fillText('Lv' + m.lvl, W - 10, 30);
    c.fillStyle = '#3a1a22'; c.fillRect(14, 42, W - 28, 16); c.fillStyle = m.elite ? '#ff5a3a' : '#e8314a'; c.fillRect(14, 42, (W - 28) * hpK / 20, 16);
    if (sh) { c.fillStyle = '#dff6ff'; c.fillRect(14, 60, (W - 28) * sh / 10, 6); }
    if (m.elite && m.mods?.ids.length) { let x = 18; for (const a of m.mods.ids) { c.fillStyle = AFFIX_COLORS[a] || '#fff'; c.beginPath(); c.arc(x, 16, 6, 0, 6.29); c.fill(); x += 15; } }
    this.tex.needsUpdate = true;
  }
}

// ---------- лагеря / гнёзда ----------
function campCenters() {
  const out = [], used = new Set();
  for (const [key, L] of Object.entries(CAMP_LAYOUTS)) {
    let p = L.poi ? POIS.find((q) => q.id === L.poi) : null, off = [0, 0];
    if (!p && L.biome) { p = POIS.find((q) => q.biome === L.biome && q.type !== 'hub' && !used.has(q.id) && !Object.values(CAMP_LAYOUTS).some((l) => l.poi === q.id)); off = [34, -26]; }
    if (!p) continue; used.add(p.id);
    const biome = p.biome || L.biome || 'b_meadow';
    out.push({ key, L, x: p.pos[0] + off[0], z: p.pos[1] + off[1], biome, poi: p.id, uids: [], spawned: false, clearedAt: -1e9, alert: false, props: null, eggT: 0 });
  }
  return out;
}

export function install(ow) {
  const mobs = ow?.mobs; if (!mobs || mobs.__roster) return ow?.monsters;
  mobs.__roster = true;
  const scene = ow.scene, q = ow.quality || 'quest', CAP = PERF_CAPS[q] || PERF_CAPS.quest, director = ow.director;
  const tele = new Telegraphs(scene), pool = new Map(), hazards = [], walls = [];
  const plateMax = q === 'pc_high' ? 10 : 6, platesOn = !Q.has('noplates');
  let uidCamp = -1000, frame = 0, clock = 0;
  const pstat = { burn: 0, poison: 0, chill: 0, chillT: 0, vuln: 0, tickT: 0 };
  const stats = { spawned: 0, pooledReuse: 0, telegraphs: 0, hitsOnPlayer: 0, capped: 0, campsSpawned: 0, byRole: {} };

  // ----- пул моделей -----
  function takeModel(id) {
    const arr = pool.get(id); if (arr?.length) { stats.pooledReuse++; return arr.pop(); }
    return getModel(id);
  }
  function giveModel(id, mdl) { mdl.object3d.removeFromParent(); (pool.get(id) || pool.set(id, []).get(id)).push(mdl); }

  // ----- спавн (замена MobManager.spawn) -----
  const origKill = mobs.kill.bind(mobs), origDamage = mobs.damage.bind(mobs), origUpdate = mobs.update.bind(mobs);
  mobs.spawn = function (id, pos, { lvl = 1, uid = 0, elite = false, affixes = [], hpMul = 1, dmgMul = 1, camp = null, perch = 0, home = null, force = false } = {}) {
    const def0 = MOBS[id]; if (!def0) return null;
    const alive = this.list.length, hard = CAP.activeMobs + 6;
    if (!force && hpMul >= 1 && alive >= (camp ? hard : CAP.activeMobs)) { stats.capped++; director?.release(uid); return null; }
    const mods = elite ? affixMods(affixes.length ? affixes : ['aff_swift'], id) : null;
    const def = mods && Object.keys(mods.res).length ? { ...def0, res: Object.fromEntries(Object.keys({ ...def0.res, ...mods.res }).map((k) => [k, Math.max(-0.5, Math.min(0.75, (def0.res?.[k] || 0) + (mods.res[k] || 0)))])) } : def0;
    const mdl = takeModel(id), g = new THREE.Group(); g.add(mdl.object3d);
    const zones = computeHitZones(id), role = roleOf(id);
    const sc = (elite ? 1.3 : 1) * (mods?.scale || 1); g.scale.setScalar(sc);
    const gy = heightAt(pos.x, pos.z); g.position.set(pos.x, gy + perch, pos.z); this.scene.add(g);
    const hpMax = Math.round(def.hp * levelMul(lvl) * (elite ? 2.2 : 1) * (mods?.hpMult || 1) * hpMul);
    const m = { animate: mdl.animate, model: mdl.object3d, mdl, id, def, uid, lvl, elite, g, hit: zones.legacy, zones, role, mods, flyer: role === 'flyer' || role === 'bonus',
      hp: hpMax, hpMax, shield: mods?.shieldFrac ? Math.round(hpMax * mods.shieldFrac) : 0, state: 'idle', t: 0, cd: {}, home: home || { x: pos.x, z: pos.z }, vel: new THREE.Vector3(),
      dmgMul: (1 + 0.03 * (Math.min(30, Math.max(1, lvl)) - 1)) * (elite ? 1.25 : 1) * dmgMul, mark: 0, scanned: 0, flash: 0, stagger: 0, outOfView: 0, damaged: false, split: hpMul < 1, fy: 0, hoverY: 0,
      bh: {}, camp, perch, buffs: {}, lastDmgAt: -99, accDt: 0, animT: 0, clip: 'spawn', x: pos.x, z: pos.z };
    m.shieldMax = m.shield;
    // spawn-анимация + VFX
    if (m.elite) addEliteFx(m);
    if (def.attacks?.some((a) => a.kind === 'aura')) { const a = def.attacks.find((x) => x.kind === 'aura'); m.auraTg = tele.show(telegraphOf(a), pos.x, pos.z, 0, -1, 1); }
    this.list.push(m); stats.spawned++; stats.byRole[role] = (stats.byRole[role] || 0) + 1; return m;
  };
  mobs.spawnPack = function (req) {
    req.mobs.forEach((r, i) => { const a = (i / req.mobs.length) * Math.PI * 2, d = 1.5 + Math.random() * 3;
      this.spawn(r.id, { x: req.pos.x + Math.cos(a) * d, z: req.pos.z + Math.sin(a) * d }, { lvl: r.lvl, uid: r.uid, elite: r.elite, affixes: r.affixes || [], home: { x: req.pos.x, z: req.pos.z } }); });
  };
  function addEliteFx(m) {
    const col = AFFIX_COLORS[m.mods.ids[0]] || '#ffd84a', ring = new THREE.Mesh(GEO.ring, decalMat(col, 0.8)); ring.scale.setScalar(Math.max(0.8, m.zones.body.r * 1.6)); ring.position.y = 0.06; m.g.add(ring); m.fxRing = ring;
    if (m.mods.ids.includes('aff_shielded')) { const b = new THREE.Mesh(GEO.bubble, new THREE.MeshBasicMaterial({ color: '#dff6ff', transparent: true, opacity: 0.16, depthWrite: false })); b.scale.setScalar(m.zones.body.r * 1.5); b.position.set(...m.zones.body.c); m.g.add(b); m.fxBubble = b; }
    m.affT = {}; for (const a of m.mods.ids) m.affT[a] = 2 + Math.random() * 3;
  }

  // ----- попадания: 3D-зоны по сокетам + стены-препятствия -----
  mobs.raycast = function (origin, dir, maxD) {
    const T = []; for (const m of this.list) if (m.state !== 'dead' && !m.hidden) T.push({ pos: m.g.position, yaw: m.g.rotation.y, scale: m.g.scale.x, zones: m.zones, exposed: weakOpen(m), m });
    const h = raycastZones(T, origin, dir, maxD); if (!h) return null;
    for (const w of walls) { const t = rayBox(origin, dir, w); if (t >= 0 && t < h.dist) return null; }
    return { mob: h.target.m, zone: h.zone === 'weak' ? 'head' : h.zone, weak: h.zone === 'weak', dist: h.dist, point: origin.clone().addScaledVector(dir, h.dist) };
  };
  const weakOpen = (m) => !/открыт/i.test(m.def.zones?.weak?.name || '') || (m.bh.exposed > 0 || m.bh.stuck > 0);
  function rayBox(o, d, w) { const lp = v3.copy(o).sub(w.o.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), -w.o.rotation.y), ld = d.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -w.o.rotation.y); let t0 = 0, t1 = 1e9; for (const [ax, h] of [['x', 2], ['y', 1], ['z', 0.25]]) { const p = lp[ax], dd = ld[ax]; if (Math.abs(dd) < 1e-6) { if (Math.abs(p) > h) return -1; continue; } let a = (-h - p) / dd, b = (h - p) / dd; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return -1; } return t0; }

  mobs.damage = function (m, hit) {
    if (!m || m.state === 'dead') return null;
    hit = { ...hit };
    if (m.mods?.staggerImmune) delete hit.stagger;
    if (m.buffs.veil > clock) hit.base *= 0.75;
    if (hit.zone === 'head' && m.zones.weak && !m.zones.head) { /* слабое место без головы — обработано raycast */ }
    if (m.shield > 0) { // щит аффикса/кобольда: lightning ×1,5 по щиту
      const raw = hit.base * (hit.type === 'lightning' ? 1.5 : 1), ab = Math.min(m.shield, raw); m.shield -= ab; hit.base *= 1 - ab / raw; m.lastDmgAt = clock;
      if (hit.base <= 0.01) { m.damaged = true; m.bh.aggro = true; plateDirty(m); return { dmg: 0, hpDmg: 0, shieldDmg: ab, zone: hit.zone, killed: false }; }
    }
    const wz = m.def.zones?.weak; let r;
    if (hit.weakHit || (hit.zone === 'head' && m.zones.weak && weakOpen(m) && hit._weak)) r = origDamage(m, { ...hit, zone: 'weak', weakMult: wz?.mult });
    else r = origDamage(m, hit);
    m.lastDmgAt = clock; m.bh.aggro = true; m.bh.returning = false; if (m.hidden) { m.bh.revealed = true; m.bh.rise = 0.3; }
    if (m.camp) m.camp.alert = true;
    if (hit.stagger) { m.clip = 'stagger'; m.animT = 0; } else if (r) { m.clip = 'hit'; m.animT = 0; }
    // прерывание замаха поддержки уроном ≥ 25 / 40
    if (m.windup && m.windup.atk.kind === 'buff' && (r?.dmg || 0) >= (m.id === 'm_obsidian_priest' ? 40 : 25)) cancelWindup(m);
    plateDirty(m); return r;
  };
  // попадание в слабое место: shoot() в main передаёт zone 'head' — помечаем через raycast-результат
  const origRay = mobs.raycast.bind(mobs);
  mobs.raycast = function (o, d, maxD) { const h = origRay(o, d, maxD); if (h) h.mob.__weakNext = !!h.weak; return h; };
  const dmg2 = mobs.damage; mobs.damage = function (m, hit) { if (m?.__weakNext) { m.__weakNext = false; hit = { ...hit, _weak: true }; } return dmg2.call(this, m, hit); };

  mobs.kill = function (m) {
    if (m.state === 'dead') return;
    cancelWindup(m); if (m.auraTg) { tele.hide(m.auraTg); m.auraTg = null; }
    const P = ow.player.pos, dist = Math.hypot(P.x - m.g.position.x, P.z - m.g.position.z);
    if (m.role === 'kamikaze' && !m.exploded && dist < 3) { m.exploded = true; const a = m.def.attacks[0]; resolveAt(m, a, telegraphOf(a), m.g.position.x, m.g.position.z, 0, -1, 0.5); }
    if (m.mods?.ids.includes('aff_frozen')) { const n = ELITE_AFFIXES.aff_frozen.onDeath.nova; queueHazard({ x: m.g.position.x, z: m.g.position.z, r: n.r, tele: n.tele, dmg: n.dmg, type: n.type, status: n.status, mob: m, once: true }); }
    if (m.def.onDeath?.puddle) { const p = m.def.onDeath.puddle; hazards.push({ x: m.g.position.x, z: m.g.position.z, r: p.r, dps: p.dps, type: p.type, life: p.dur, tick: 0, decal: tele.show({ shape: 'circle', r: p.r, color: TYPE_COLORS[p.type], persistent: true }, m.g.position.x, m.g.position.z, 0, -1, 1), mob: m }); }
    if (m.plate) { m.plate.sp.visible = false; }
    if (m.camp) m.camp.uids = m.camp.uids.filter((x) => x !== m);
    origKill(m); m.clip = 'death'; m.animT = 0;
  };

  // ----- статусы игрока (горение/яд DoT, озноб = замедление) -----
  const origHitP = mobs.onPlayerHit;
  mobs.onPlayerHit = (h) => {
    if (h.mob?.buffs?.empower > clock) h.base *= 1.2;
    if (pstat.vuln > clock) h.base *= 1.15;
    origHitP?.(h); stats.hitsOnPlayer++;
    const st = { ...(h.atk?.status || {}), ...(h.mob?.mods?.onHit || {}) };
    if (st.st_burn) pstat.burn = Math.min(3, Math.max(pstat.burn, st.st_burn)), pstat.burnT = clock + (STATUSES.st_burn?.durS || 3);
    if (st.st_poison) pstat.poison = Math.min(3, pstat.poison + st.st_poison), pstat.poisonT = clock + 4;
    if (st.st_chill) pstat.chill = Math.min(3, pstat.chill + st.st_chill), pstat.chillT = clock + 3;
    if (st.st_stagger) ow.state && (ow.state.staggeredThisFrame = true);
    if (h.mob?.mods?.lifesteal && h.mob.state !== 'dead') { const ls = h.mob.mods.lifesteal * h.base * (pstat.burn || pstat.poison ? 0.5 : 1); h.mob.hp = Math.min(h.mob.hpMax, h.mob.hp + ls); plateDirty(h.mob); }
  };
  if (ow.player?.update && !ow.player.__chillWrap) { const pu = ow.player.update.bind(ow.player); ow.player.__chillWrap = true;
    ow.player.update = (dt, o = {}) => pu(dt, { ...o, speedMul: (o.speedMul || 1) * (pstat.chillT > clock ? 1 - 0.15 * pstat.chill : 1) }); }
  function playerDots(dt) {
    if ((pstat.tickT -= dt) > 0) return; pstat.tickT = 1;
    if (pstat.burnT > clock && pstat.burn) origHitP?.({ base: (STATUSES.st_burn?.dps || 5) * pstat.burn, type: 'fire' }); else pstat.burn = 0;
    if (pstat.poisonT > clock && pstat.poison) origHitP?.({ base: 4 * pstat.poison, type: 'poison' }); else pstat.poison = 0;
    if (pstat.chillT <= clock) pstat.chill = 0;
  }

  // ----- исполнение атак -----
  function cancelWindup(m) { if (m.windup) { tele.hide(m.windup.o); m.windup = null; } }
  function startWindup(m, atk, P) {
    const tg = telegraphOf(atk), dur = windupS(atk), p = m.g.position;
    const [fx, fz] = (() => { const dx = P.x - p.x, dz = P.z - p.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; })();
    const at = tg.at === 'target' ? { x: P.x, z: P.z } : { x: p.x, z: p.z };
    const o = tele.show(tg, at.x, at.z, fx, fz, dur);
    m.windup = { atk, tg, o, t: 0, dur, fx, fz, at }; m.clip = atk.kind === 'buff' || atk.kind === 'summon' ? 'special' : 'attack_a'; m.animT = 0; stats.telegraphs++;
    if (tg.at === 'self' && tg.shape !== 'aim') m.lockFace = true;
  }
  function resolveAt(m, atk, tg, x, z, fx, fz, mul = 1) {
    const P = ow.player.pos, hit = inTelegraph(tg, { x, z }, fx, fz, P);
    if (hit && atk.dmg > 0 && !ow.player.dead) mobs._hitPlayer(m, { ...atk, dmg: atk.dmg * mul });
    return hit;
  }
  function execute(m, w, P) {
    const { atk, tg } = w, p = m.g.position; let hitP = false;
    switch (atk.kind) {
      case 'proj': mobs.fireProjectile(m, atk, new THREE.Vector3(P.x, P.y + 1.2, P.z)); break;
      case 'lob': mobs.fireProjectile(m, { ...atk, dmg: 0 }, new THREE.Vector3(w.at.x, heightAt(w.at.x, w.at.z) + 0.5, w.at.z)); queueHazard({ x: w.at.x, z: w.at.z, r: tg.r, tele: 0.25, dmg: atk.dmg, type: atk.type, status: atk.status, mob: m, atk, once: true, noDecal: true }); break;
      case 'dash': { const d = Math.min(atk.range || 8, Math.hypot(P.x - p.x, P.z - p.z) + 1.5); hitP = inTelegraph(tg, { x: p.x, z: p.z }, w.fx, w.fz, P); p.x += w.fx * d; p.z += w.fz * d; if (hitP) mobs._hitPlayer(m, atk); break; }
      case 'buff': { const ally = w.ally && w.ally.state !== 'dead' ? w.ally : m; if (atk.heal) ally.hp = Math.min(ally.hpMax, ally.hp + atk.heal * (1 + 0.08 * (m.lvl - 1))); if (atk.shield) { ally.shield = Math.max(ally.shield, atk.shield); ally.shieldMax = Math.max(ally.shieldMax || 0, atk.shield); }
        if (atk.id === 'a_empower') ally.buffs.empower = clock + 6; if (atk.id === 'a_obsidian_veil') ally.buffs.veil = clock + 5; beam(m, ally, '#7dffb0'); plateDirty(ally); break; }
      case 'summon': { if (atk.summon) { const [sid, n] = atk.summon; const near = mobs.list.filter((o) => o.id === sid && o.state !== 'dead').length; for (let i = 0; i < Math.min(n, (atk.maxAlive || 4) - near); i++) mobs.spawn(sid, { x: p.x + (i ? 2 : -2), z: p.z + 1.5 }, { lvl: m.lvl, uid: --uidCamp, home: m.home, force: true }); }
        else spawnWall(m, P); break; }
      case 'debuff': hitP = resolveAt(m, atk, tg, w.at.x, w.at.z, w.fx, w.fz); if (hitP) pstat.vuln = clock + 4; break;
      case 'beam': case 'cone': if (tg.channel) { m.channel = { atk, tg, t: 0, dur: tg.channel, tick: tg.tick, acc: 0, fx: w.fx, fz: w.fz, o: tele.show({ ...tg, color: '#ffffff' }, p.x, p.z, w.fx, w.fz, tg.channel) }; break; } // fallthrough
      default: { const per = atk.tick && atk.dur ? Math.round(atk.dur / atk.tick) : 0;
        if (per && atk.kind === 'aoe') hazards.push({ x: w.at.x, z: w.at.z, r: tg.r, dps: atk.dmg / atk.tick, type: atk.type, life: atk.dur, tick: 0, status: atk.status, mob: m, atk, decal: tele.show({ ...tg, persistent: true }, w.at.x, w.at.z, 0, -1, 1) });
        else hitP = resolveAt(m, atk, tg, w.at.x, w.at.z, w.fx, w.fz);
        if (m.role === 'kamikaze') { m.exploded = true; m.hp = 0; mobs.kill(m); } }
    }
    m.cd[atk.id] = attackCd(m, atk); afterAttack(m, atk, { hitPlayer: hitP });
  }
  function queueHazard(hz) { hz.t = 0; hz.pending = true; hz.decal = hz.noDecal ? null : tele.show({ shape: 'circle', r: hz.r, color: TYPE_COLORS[hz.type] || '#fff', tele: hz.tele }, hz.x, hz.z, 0, -1, hz.tele); hazards.push(hz); }
  function updateHazards(dt) {
    const P = ow.player.pos;
    for (const h of hazards) {
      if (h.pending) { h.t += dt; if (h.t >= h.tele) { h.pending = false; h.life = 0; if (!ow.player.dead && Math.hypot(P.x - h.x, P.z - h.z) <= h.r + 0.35) mobs._hitPlayer(h.mob, { ...(h.atk || {}), dmg: h.dmg, type: h.type, status: h.status }); } continue; }
      h.life -= dt; h.tick -= dt;
      if (h.tick <= 0 && h.dps) { h.tick = 0.5; if (!ow.player.dead && Math.hypot(P.x - h.x, P.z - h.z) <= h.r) mobs._hitPlayer(h.mob, { dmg: h.dps * 0.5, type: h.type, status: h.status }); }
    }
    for (let i = hazards.length - 1; i >= 0; i--) if (!hazards[i].pending && hazards[i].life <= 0) { tele.hide(hazards[i].decal); hazards.splice(i, 1); }
  }
  const beams = [];
  function beam(a, b, col) { const geo = new THREE.BufferGeometry().setFromPoints([a.g.position.clone().setY(a.g.position.y + 1), b.g.position.clone().setY(b.g.position.y + 1)]); const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col })); scene.add(l); beams.push({ l, t: 0.5 }); }
  function spawnWall(m, P) { const p = m.g.position, dx = P.x - p.x, dz = P.z - p.z, l = Math.hypot(dx, dz) || 1, o = new THREE.Mesh(GEO.wall, toonColor('#bfeaff', 0.4)); o.position.set(p.x + dx / l * 3, heightAt(p.x + dx / l * 3, p.z + dz / l * 3) + 1, p.z + dz / l * 3); o.rotation.y = Math.atan2(dx, dz); scene.add(o); walls.push({ o, hp: 150, life: 8 }); }

  // ----- лагеря -----
  const camps = Q.has('nocamps') ? [] : campCenters();
  function buildCampProps(c) {
    const g = new THREE.Group(), y = heightAt(c.x, c.z); g.position.set(c.x, y, c.z);
    for (const s of c.L.slots) {
      const [sx, sz] = s.at, hy = heightAt(c.x + sx, c.z + sz) - y;
      if (s.kind === 'loot') { const b = new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 0.7), toonColor(s.chest === 'iron' ? '#7a7f88' : '#9a6a3a')); b.position.set(sx, hy + 0.35, sz); g.add(b); }
      else if (s.kind) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.2, 8), toonColor(s.kind === 'brazier' ? '#ff7a1a' : s.kind === 'egg_sac' ? '#e8e0c8' : '#b89a4a', s.kind === 'brazier' ? 1 : 0.2)); k.position.set(sx, hy + 0.6, sz); g.add(k); }
      if (s.perch) { const t = new THREE.Mesh(new THREE.BoxGeometry(1.6, s.perch, 1.6), toonColor('#6a4a2a')); t.position.set(sx, hy + s.perch / 2, sz); g.add(t); }
    }
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4, tent = new THREE.Mesh(new THREE.ConeGeometry(2, 2.6, 6), toonColor(['#d9c49a', '#c98a5a', '#a8b0a0'][i])); tent.position.set(Math.cos(a) * c.L.r * 0.75, heightAt(c.x + Math.cos(a) * c.L.r * 0.75, c.z + Math.sin(a) * c.L.r * 0.75) - y + 1.3, Math.sin(a) * c.L.r * 0.75); g.add(tent); }
    scene.add(g); c.props = g;
  }
  function updateCamps(dt) {
    const P = ow.player.pos;
    for (const c of camps) {
      const d = Math.hypot(P.x - c.x, P.z - c.z), T = SPAWN_TABLES[c.biome] || SPAWN_TABLES.b_meadow;
      if (!c.props && d < 160) buildCampProps(c);
      if (!c.spawned && d < 90 && clock - c.clearedAt > (T.respawn || 200)) {
        c.spawned = true; c.alert = false; c.uids = []; stats.campsSpawned++; const lvl = Math.round((T.lvl[0] + T.lvl[1]) / 2);
        for (const s of c.L.slots) if (s.mob) { const m = mobs.spawn(s.mob, { x: c.x + s.at[0], z: c.z + s.at[1] }, { lvl, uid: --uidCamp, camp: c, perch: s.perch || 0, home: { x: c.x + s.at[0], z: c.z + s.at[1] } }); if (m) c.uids.push(m); }
      }
      if (c.spawned) {
        const eg = c.L.slots.find((s) => s.kind === 'egg_sac'); if (eg && c.alert && (c.eggT -= dt) <= 0) { c.eggT = eg.everyS; if (c.uids.length < eg.max + 2) { const m = mobs.spawn(eg.spawns, { x: c.x, z: c.z }, { lvl: c.uids[0]?.lvl || 6, uid: --uidCamp, camp: c }); if (m) c.uids.push(m); } }
        if (!c.uids.length) { c.spawned = false; c.clearedAt = clock; director?.markChunkCleared?.(c.key, c.biome); }
        else if (d > 220) { for (const m of c.uids) { m.camp = null; despawn(m); } c.uids = []; c.spawned = false; }
      }
    }
  }

  function despawn(m) { cancelWindup(m); if (m.auraTg) tele.hide(m.auraTg); director?.release(m.uid); m.gone = true; m.g.removeFromParent(); m.plate && (m.plate.sp.visible = false); giveModel(m.id, m.mdl); }
  function plateDirty(m) { if (m?.plate) m.plate.key = ''; }

  // ----- главный шаг (замена MobManager.update; снаряды и лут — оригинальным кодом) -----
  mobs.update = function (dt, player, opts = {}) {
    clock += dt; frame++;
    const P = player.pos, list = this.list, near = [];
    const tokens = { attackers: 0 }, deadThisFrame = new Set();
    for (const m of list) if (m.state === 'dead' && m.t === 0) deadThisFrame.add(m.id);
    for (const m of list) {
      const g = m.g, p = g.position;
      m.animT += dt;
      if (m.flash > 0) { m.flash -= dt; }
      if (m.mark > 0) m.mark -= dt; if (m.scanned > 0) m.scanned -= dt;
      this._marker(m);
      if (m.state === 'dead') { m.t += dt; try { m.animate?.(m.model, 'death', m.t); } catch {} g.position.y -= dt * 0.6; if (m.t > 1.0) { despawn(m); } continue; }
      const dx = P.x - p.x, dz = P.z - p.z, dist = Math.hypot(dx, dz);
      if (dist > 110) { m.outOfView += dt; if (director?.shouldDespawn(m.uid, { distToPlayer: dist, outOfViewS: m.outOfView, damaged: m.damaged }) && !m.camp) despawn(m); continue; }
      // тиры ИИ: дальше aiFullTickRadius — думает раз в 4 кадра
      m.accDt += dt; if (dist > CAP.aiFullTickRadius && (frame + m.uid) % 4) continue; const tdt = m.accDt; m.accDt = 0;
      if (m.stagger > 0) { m.stagger -= tdt; cancelWindup(m); animateMob(m, 'stagger'); continue; }
      for (const k in m.cd) m.cd[k] -= tdt;
      if (m.shield < m.shieldMax && m.mods?.shieldFrac && clock - m.lastDmgAt > 4) m.shield = Math.min(m.shieldMax, m.shield + m.shieldMax * 0.25 * tdt);
      // замах / канал
      if (m.windup) {
        const w = m.windup; w.t += tdt; if (!m.lockFace) faceTo(m, dx, dz, tdt);
        if (w.t >= w.dur) { tele.hide(w.o); m.windup = null; m.lockFace = false; execute(m, w, P); }
        animateMob(m, m.clip); finishPos(m, tdt, 0); continue;
      }
      if (m.channel) { const c = m.channel; c.t += tdt; c.acc += tdt; c.o.g.position.set(p.x, heightAt(p.x, p.z) + 0.08, p.z);
        if (c.acc >= c.tick) { c.acc = 0; if (inTelegraph(c.tg, { x: p.x, z: p.z }, c.fx, c.fz, P)) mobs._hitPlayer(m, c.atk); }
        if (c.t >= c.dur) { tele.hide(c.o); m.channel = null; } animateMob(m, 'attack_b'); finishPos(m, tdt, 0); continue; }
      // контекст роли
      const allies = list.filter((o) => o !== m && o.state !== 'dead' && Math.abs(o.g.position.x - p.x) < 22 && Math.abs(o.g.position.z - p.z) < 22);
      const wounded = allies.filter((o) => o.hp < o.hpMax * 0.7).sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax)[0];
      const pack = m.role === 'pack' ? allies.filter((o) => o.id === m.id) : [];
      if (m.role === 'pack') m.packIdx = pack.filter((o) => o.uid < m.uid).length;
      const ac = allies.length && m.role === 'support' ? allies.filter((o) => o.role !== 'support').reduce((s, o, _, a) => ({ x: s.x + o.g.position.x / a.length, z: s.z + o.g.position.z / a.length }), { x: 0, z: 0 }) : null;
      m.x = p.x; m.z = p.z;
      const it = think(m, { P: { x: P.x, z: P.z, dead: player.dead, aggroImmune: player.aggroImmune }, dt: tdt, now: clock, allies, tokens, woundedAlly: wounded || (m.def.attacks?.some((a) => a.shield || a.id === 'a_empower' || a.id === 'a_obsidian_veil') ? allies[0] : null),
        summonOk: true, packSize: pack.length + 1, packLeft: pack.length + 1, alerted: m.camp?.alert, allyDied: deadThisFrame.has(m.id), blizzard: false });
      if (it.alert && m.camp) m.camp.alert = true;
      if (it.resetHp) { m.hp = m.hpMax; m.damaged = false; plateDirty(m); }
      if (it.despawn) { despawn(m); continue; }
      m.hidden = it.hidden; m.model.visible = !it.hidden || !!it.rising;
      if (it.teleport) { p.x = it.teleport.x; p.z = it.teleport.z; m.clip = 'spawn'; m.animT = 0; }
      if (it.blink) { p.x = it.blink.x; p.z = it.blink.z; m.clip = 'spawn'; m.animT = 0; }
      if (it.burrow) dust(p.x, p.z);
      if (it.callHelp && m.camp) m.camp.alert = true;
      if (it.attack) { if (it.attack.kind === 'buff') m.pendingAlly = wounded || allies[0] || m; startWindup(m, it.attack, P); if (m.windup && it.attack.kind === 'buff') m.windup.ally = m.pendingAlly; }
      // аффиксы
      if (m.elite) eliteTick(m, tdt, P, it);
      // движение
      let nx = p.x + it.dx * it.speed * tdt, nz = p.z + it.dz * it.speed * tdt;
      for (const o of allies) { const ox = nx - o.g.position.x, oz = nz - o.g.position.z, od = Math.hypot(ox, oz), rr = (m.zones.body.r + o.zones.body.r) * 0.8; if (od < rr && od > 1e-3) { nx += ox / od * (rr - od) * 0.5; nz += oz / od * (rr - od) * 0.5; } }
      for (const t of opts.obstacles?.(nx, nz) || []) { const ox = nx - t[0], oz = nz - t[2], od = Math.hypot(ox, oz), rr = 0.5 * t[3] + 0.4; if (od < rr && od > 1e-3) { nx = t[0] + ox / od * rr; nz = t[2] + oz / od * rr; } }
      if (!m.flyer && heightAt(nx, nz) < 0.2 && !(m.role === 'ambusher')) { nx = p.x; nz = p.z; } // не лезут в море (кроме засадных)
      p.x = nx; p.z = nz;
      if (it.face && (it.speed > 0.05 || it.attack || m.bh.aggro)) faceTo(m, it.speed > 0.05 && !m.bh.aggro ? it.dx : dx, it.speed > 0.05 && !m.bh.aggro ? it.dz : dz, tdt);
      if (it.hover != null) m.hoverY += (it.hover - m.hoverY) * Math.min(1, tdt * 2.5); else m.hoverY *= Math.max(0, 1 - tdt * 3);
      finishPos(m, tdt, it.speed);
      const clip = m.clip === 'hit' && m.animT < 0.25 || m.clip === 'spawn' && m.animT < 0.8 ? m.clip : it.rising ? 'spawn' : it.speed > (m.def.speed || 3) * 0.6 ? 'run' : it.speed > 0.05 ? 'walk' : m.bh.aggro ? 'alert' : 'idle';
      animateMob(m, clip);
      near.push([dist, m]);
      m.outOfView = dist > 60 ? m.outOfView + tdt : 0;
      if (!m.camp && director?.shouldDespawn(m.uid, { distToPlayer: dist, outOfViewS: m.outOfView, damaged: m.damaged })) despawn(m);
    }
    this.list = list.filter((m) => !m.gone);
    // снаряды/лут — оригинальным кодом (подменяем список мобов на пустой)
    const keep = this.list; this.list = []; origUpdate(dt, player, opts); this.list = keep;
    tele.update(dt); updateHazards(dt); playerDots(dt); updateCamps(dt);
    for (const b of beams) { b.t -= dt; if (b.t <= 0) { scene.remove(b.l); b.l.geometry.dispose(); } } for (let i = beams.length - 1; i >= 0; i--) if (beams[i].t <= 0) beams.splice(i, 1);
    for (const w of walls) { w.life -= dt; if (w.life <= 0) scene.remove(w.o); } for (let i = walls.length - 1; i >= 0; i--) if (walls[i].life <= 0) walls.splice(i, 1);
    for (const m of this.list) if (m.auraTg) { const p = m.g.position; m.auraTg.g.position.set(p.x, heightAt(p.x, p.z) + 0.07, p.z); m.auraTg.g.visible = !m.hidden; const a = m.def.attacks.find((x) => x.kind === 'aura'); m.auraAcc = (m.auraAcc || 0) + dt; if (m.auraAcc >= (a.tick || 0.5)) { m.auraAcc = 0; if (Math.hypot(P.x - p.x, P.z - p.z) <= a.range + 0.3 && !player.dead) mobs._hitPlayer(m, { ...a, status: (Math.random() < (a.chance ?? 1)) ? a.status : null }); } }
    // таблички: ближайшие N в 28 м + все раненые/элиты в 40 м
    if (platesOn && frame % 3 === 0) { near.sort((a, b) => a[0] - b[0]); let shown = 0;
      for (const [d, m] of near) { const want = !m.hidden && d > 3 && ((d < 28 && shown < plateMax) || ((m.damaged || m.elite) && d < 40)); if (want) { if (!m.plate) { m.plate = new Plate(m); scene.add(m.plate.sp); } shown++; m.plate.draw(m); }
        if (m.plate) { m.plate.sp.visible = want; const k = Math.max(0.45, Math.min(1, d / 12)); m.plate.sp.scale.set(1.7 * k, 0.48 * k, 1); } }
      for (const m of this.list) if (m.plate) { if (m.state === 'dead' || m.gone) m.plate.sp.visible = false; const p = m.g.position, top = (m.zones.head || m.zones.body).c[1] + (m.zones.head || m.zones.body).r; m.plate.sp.position.set(p.x, p.y + (top + 0.45) * m.g.scale.y, p.z); } }
  };
  function faceTo(m, dx, dz, dt) { const tgt = Math.atan2(-dx, -dz); let d = tgt - m.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); m.g.rotation.y += d * Math.min(1, dt * 8); }
  function finishPos(m, dt) {
    const p = m.g.position, gy = heightAt(p.x, p.z);
    const bob = m.role === 'swarm' && m.bh.aggro ? Math.abs(Math.sin(clock * 8 + m.uid)) * 0.15 : 0;
    p.y = gy + (m.perch && Math.hypot(p.x - m.home.x, p.z - m.home.z) < 1.5 ? m.perch : 0) + m.hoverY + bob - (m.hidden && !m.flyer ? 0.9 : 0);
    if (m.fxBubble) m.fxBubble.visible = m.shield > 0;
    if (m.fxRing) { m.fxRing.rotation.y += dt * 1.5; m.fxRing.material.opacity = 0.55 + 0.3 * Math.sin(clock * 5); }
    if (m.flash > 0) m.g.visible = Math.floor(clock * 30) % 2 === 0; else m.g.visible = true;
  }
  function animateMob(m, clip) { if (m.clipName !== clip) { m.clipName = clip; m.clipT = 0; } m.clipT = (m.clipT || 0) + 1 / 60; try { m.animate?.(m.model, clip, clip === 'idle' || clip === 'walk' || clip === 'run' || clip === 'alert' ? clock + m.uid * 0.37 : m.animT); } catch {} }
  function dust(x, z) { queueHazard({ x, z, r: 1.2, tele: 0.6, dmg: 0, type: 'physical', mob: null, once: true }); }
  function eliteTick(m, dt, P, it) {
    const p = m.g.position;
    for (const a of m.mods.ids) {
      const A = ELITE_AFFIXES[a]; if ((m.affT[a] -= dt) > 0) continue;
      if (a === 'aff_burning' && it.speed > 0.1) { m.affT[a] = 0.6; hazards.push({ x: p.x, z: p.z, r: 0.9, dps: A.trail.dps, type: 'fire', life: A.trail.dur, tick: 0, mob: m, decal: tele.show({ shape: 'circle', r: 0.9, color: TYPE_COLORS.fire, persistent: true }, p.x, p.z, 0, -1, 1) }); }
      else if (a === 'aff_venom') { m.affT[a] = A.pools.every; hazards.push({ x: p.x, z: p.z, r: A.pools.r, dps: A.pools.dps, type: 'poison', life: A.pools.dur, tick: 0, status: { st_poison: 1 }, mob: m, decal: tele.show({ shape: 'circle', r: A.pools.r, color: TYPE_COLORS.poison, persistent: true }, p.x, p.z, 0, -1, 1) }); }
      else if (a === 'aff_storm' && m.bh.aggro) { m.affT[a] = A.periodic.every; queueHazard({ x: P.x, z: P.z, r: 2.5, tele: Math.max(0.6, A.periodic.tele), dmg: A.periodic.dmg, type: 'lightning', status: A.periodic.status, mob: m, once: true }); }
      else if (a === 'aff_blinker' && m.bh.aggro) { m.affT[a] = A.blink.every; const dx = P.x - p.x, dz = P.z - p.z, l = Math.hypot(dx, dz) || 1, s = Math.random() < 0.5 ? 1 : -1; const tx = P.x - dx / l * Math.max(A.blink.minDist, 5) - dz / l * s * 4, tz = P.z - dz / l * Math.max(A.blink.minDist, 5) + dx / l * s * 4; dust(tx, tz); setTimeout(() => { if (m.state !== 'dead') { p.x = tx; p.z = tz; } }, A.blink.tele * 1000); }
      else if (a === 'aff_summoner' && m.bh.aggro) { m.affT[a] = A.summon.every; const sw = Object.keys(MOBS).find((id) => MOBS[id].biome === (biomeAt(p.x, p.z) || MOBS[m.id].biome) && MOBS[id].role === 'swarm') || 'm_meadow_slime';
        const near = mobs.list.filter((o) => o.summonedBy === m && o.state !== 'dead').length; for (let i = 0; i < Math.min(A.summon.count, A.summon.max - near); i++) { const s = mobs.spawn(sw, { x: p.x + (i ? 1.8 : -1.8), z: p.z - 1 }, { lvl: m.lvl, uid: --uidCamp, home: m.home, force: true }); if (s) s.summonedBy = m; } }
      else m.affT[a] = 1;
    }
  }

  // ----- отладка / витрина -----
  function spawnAll({ r = 16, lvl = 6, elites = true } = {}) {
    const ids = Object.keys(MOBS), P = ow.player.pos, out = [];
    ids.forEach((id, i) => { const a = (i / ids.length) * Math.PI * 2, x = P.x + Math.cos(a) * r * (1 + (i % 2) * 0.35), z = P.z + Math.sin(a) * r * (1 + (i % 2) * 0.35);
      const elite = elites && i % 5 === 0, aff = elite ? [Object.keys(ELITE_AFFIXES)[(i / 5) % 10]] : [];
      const m = mobs.spawn(id, { x, z }, { lvl, uid: --uidCamp, elite, affixes: aff, force: true }); if (m) { m.bh.aggro = false; out.push(m); } });
    return out;
  }
  const api = { spawnAll, spawn: (id, o = {}) => { const P = ow.player.pos; return mobs.spawn(id, { x: P.x - Math.sin(ow.player.yaw) * (o.d || 8), z: P.z - Math.cos(ow.player.yaw) * (o.d || 8) }, { lvl: o.lvl || 5, uid: --uidCamp, elite: !!o.elite, affixes: o.affixes || [], force: true }); },
    camps, stats: () => ({ ...stats, alive: mobs.count, pool: [...pool.values()].reduce((s, a) => s + a.length, 0), hazards: hazards.length, telegraphsLive: tele.live.length }), pstat, tele };
  ow.monsters = api;
  if (Q.get('owmobs') === 'all') setTimeout(() => spawnAll({ r: +(Q.get('owmobsr') || 14) }), 300);
  console.info(`[openworld] monsters K: ${Object.keys(MOBS).length} mobs, camps=${camps.length}, cap=${CAP.activeMobs}, plates=${platesOn}`);
  return api;
}
