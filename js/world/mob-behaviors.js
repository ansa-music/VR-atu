// js/world/mob-behaviors.js — поведение 32 мобов по ролям (AI_PROFILES) + телеграфы атак (VR-читаемые) + элитные аффиксы.
// ЧИСТЫЙ модуль: без three и DOM (тестируется в node). Визуал и исполнение — js/world/mob-roster.js.
import { MOBS, AI_PROFILES, ELITE_AFFIXES } from '../../shared/defs/index.js';

export const TELE_MIN_S = 0.4;             // правило VR: телеграф не короче 0,4 с, аффиксы его НЕ сокращают
export const TYPE_COLORS = { physical: '#ffb347', fire: '#ff5a1a', frost: '#7fe3ff', lightning: '#fff36a', arcane: '#c27bff', poison: '#8aff4a', none: '#7dffb0' };
/** Роль поведения по ai из MOBS. burrower — по special (зарывается/вылезают из песка). */
export const ROLE_OF_AI = { ai_swarm: 'swarm', ai_melee: 'melee', ai_pack: 'pack', ai_charger: 'charger', ai_kiter: 'ranged', ai_caster: 'caster', ai_support: 'support', ai_tank: 'tank', ai_flyer: 'flyer', ai_ambush: 'ambusher', ai_kamikaze: 'kamikaze', ai_bonus: 'bonus' };
export function roleOf(id) {
  const d = MOBS[id]; if (!d) return 'melee';
  if (/зарыва|вылезают из песка/i.test(d.special || '')) return 'burrower';
  return ROLE_OF_AI[d.ai] || 'melee';
}
const prefRange = (d) => AI_PROFILES[d.ai]?.prefRange || (d.ai === 'ai_flyer' ? [6, 12] : [10, 18]);

// ---------- телеграфы ----------
/** Форма телеграфа атаки. at: self — от моба, target — точка игрока, зафиксированная в начале замаха (уклоняемо). */
export function telegraphOf(atk) {
  const tele = Math.max(TELE_MIN_S, atk.tele || 0), color = TYPE_COLORS[atk.type] || TYPE_COLORS.physical;
  const R = atk.range || 1.5, A = atk.aoe || 0;
  switch (atk.kind) {
    case 'melee': return { shape: 'cone', len: R + 0.6, ang: 75, at: 'self', tele, color };
    case 'arc': return { shape: 'cone', len: Math.max(R, A) + 0.4, ang: 200, at: 'self', tele, color };
    case 'cone': return { shape: 'cone', len: R, ang: 50, at: 'self', tele, color, channel: atk.dur || 0, tick: atk.tick || 0 };
    case 'dash': return { shape: 'rect', len: R + 1, w: 1.6, at: 'self', tele, color };
    case 'line': return { shape: 'rect', len: R, w: Math.max(1.2, A * 2), at: 'self', tele, color };
    case 'beam': return { shape: 'rect', len: R, w: 0.9, at: 'self', tele, color, channel: atk.dur || 0, tick: atk.tick || 0.25 };
    case 'lob': case 'debuff': return { shape: 'circle', r: A || 2, at: 'target', tele, color };
    case 'aoe': return { shape: 'circle', r: A || 2.5, at: R > A + 1 ? 'target' : 'self', tele, color, channel: atk.dur || 0, tick: atk.tick || 0 };
    case 'aura': return { shape: 'ring', r: R + 0.3, at: 'self', tele: 0, color, persistent: true, tick: atk.tick || 0.5 };
    case 'proj': return { shape: 'aim', len: R, at: 'self', tele, color };
    case 'buff': case 'summon': return { shape: 'glyph', r: 1.2, at: 'self', tele, color: TYPE_COLORS.none };
    default: return { shape: 'circle', r: 2, at: 'self', tele, color };
  }
}
/** Попадает ли точка P в телеграф. o — центр (self: моб, target: зафиксированная точка); fx,fz — единичное направление удара. */
export function inTelegraph(tg, o, fx, fz, P, pad = 0.35) {
  const dx = P.x - o.x, dz = P.z - o.z, d = Math.hypot(dx, dz);
  switch (tg.shape) {
    case 'circle': case 'ring': case 'glyph': return d <= (tg.r || 0) + pad;
    case 'cone': { if (d > tg.len + pad) return false; if (d < 0.6) return true; const c = (dx * fx + dz * fz) / d; return c >= Math.cos((tg.ang / 2) * Math.PI / 180); }
    case 'rect': case 'aim': { const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx); return along >= -0.5 && along <= tg.len + pad && side <= (tg.w || 0.8) / 2 + pad; }
  }
  return false;
}

// ---------- аффиксы ----------
/** Сводит аффиксы элиты в множители. Учитывает excl и notFor (роль). */
export function affixMods(ids = [], id) {
  const role = MOBS[id]?.role, out = { ids: [], res: {}, hpMult: 1, moveMult: 1, cdMult: 1, scale: 1, staggerImmune: false, shieldFrac: 0, lifesteal: 0, onHit: {}, colors: [] };
  for (const a of ids) {
    const A = ELITE_AFFIXES[a]; if (!A) continue;
    if (A.notFor?.includes(role) || out.ids.some((b) => A.excl?.includes(b) || ELITE_AFFIXES[b].excl?.includes(a))) continue;
    out.ids.push(a);
    for (const [k, v] of Object.entries(A.res || {})) out.res[k] = (out.res[k] || 0) + v;
    out.hpMult *= A.hpMult || 1; out.moveMult *= A.moveMult || 1; out.cdMult *= A.cdMult || 1; out.scale *= A.scale || 1;
    out.staggerImmune ||= !!A.staggerImmune; out.shieldFrac = Math.max(out.shieldFrac, A.shieldFrac || 0); out.lifesteal = Math.max(out.lifesteal, A.lifesteal || 0);
    Object.assign(out.onHit, A.onHit || {});
  }
  return out;
}
export const AFFIX_COLORS = { aff_burning: '#ff7a1a', aff_frozen: '#8fe6ff', aff_storm: '#fff06a', aff_venom: '#7aff4a', aff_shielded: '#ffffff', aff_vampiric: '#b01530', aff_swift: '#9ad7ff', aff_juggernaut: '#9a8a70', aff_blinker: '#b06aff', aff_summoner: '#ffd84a' };

// ---------- выбор атаки ----------
/** Лучшая доступная атака по дистанции. ctx.ally — раненый союзник (для buff), ctx.summonOk. */
export function chooseAttack(m, dist, ctx = {}) {
  let best = null, bs = -1;
  for (const a of m.def.attacks || []) {
    if ((m.cd[a.id] || 0) > 0 || a.kind === 'aura') continue;
    const R = a.range || 1.5; let ok = false, score = (a.dmg || 0) * (a.tick ? (a.dur || 1) / a.tick : 1);
    switch (a.kind) {
      case 'melee': case 'arc': ok = dist <= R + 0.4; break;
      case 'cone': ok = dist <= R * 0.85; break;
      case 'dash': ok = dist >= Math.min(4, R * 0.5) && dist <= R; score += 6; break;
      case 'buff': ok = !!ctx.ally; score = 60; break;
      case 'summon': ok = ctx.summonOk !== false && dist < 25; score = 50; break;
      case 'debuff': ok = dist <= R; score = 25; break;
      case 'aoe': ok = dist <= R + (a.aoe || 0) * 0.5; if (m.def.ai === 'ai_kamikaze') ok = dist <= 2.2; break;
      default: ok = dist <= R && dist >= 2; // proj, lob, line, beam
    }
    if (ok && score > bs) { bs = score; best = a; }
  }
  return best;
}

// ---------- мозг: роль → намерение ----------
const I = () => ({ dx: 0, dz: 0, speed: 0, face: true, attack: null, hover: null, hidden: false, despawn: false, alert: false, exposed: false });
const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
/**
 * think(m, ctx) → намерение. m: {def,id,x,z,hp,hpMax,cd,home,bh,damaged,uid,mods}; ctx: {P:{x,z,dead,aggroImmune}, dt, now, allies[], tokens:{attackers}, rand, alerted}
 * Состояния роли хранятся в m.bh (обнуляется при спавне). Никакой случайности, кроме ctx.rand (детерминируемо в тестах).
 */
export function think(m, ctx) {
  const d = m.def, P = ctx.P, bh = (m.bh ||= {}), it = I(), role = m.role || (m.role = roleOf(m.id));
  const dx = P.x - m.x, dz = P.z - m.z, dist = Math.hypot(dx, dz) || 0.001, [ux, uz] = [dx / dist, dz / dist];
  const spd = (d.speed || 3) * (m.mods?.moveMult || 1) * (bh.enraged ? 1.25 : 1), aggro = (d.aggro || 14) * (ctx.blizzard && d.ai === 'ai_pack' ? 0.7 : 1);
  const leashD = Math.hypot(m.x - m.home.x, m.z - m.home.z), rand = ctx.rand || Math.random;
  bh.t = (bh.t || 0) + ctx.dt;
  // --- глобальное: агро / поводок ---
  const canSee = !P.dead && !(P.aggroImmune > 0 && !m.damaged);
  if (!bh.aggro && canSee && (dist < aggro || (m.damaged && dist < aggro * 2.5) || ctx.alerted)) { bh.aggro = true; it.alert = true; }
  if (bh.aggro && (!canSee || leashD > (d.leash || 30) || dist > aggro * 3.2)) { bh.aggro = false; bh.returning = true; }
  if (bh.returning) {
    const hx = m.home.x - m.x, hz = m.home.z - m.z, hd = Math.hypot(hx, hz);
    if (hd < 2) { bh.returning = false; it.resetHp = true; } else { [it.dx, it.dz] = norm(hx, hz); it.speed = spd * 1.3; it.invuln = true; }
    if (role === 'flyer' || role === 'bonus') it.hover = (AI_PROFILES.ai_flyer.hoverHeight[0]);
    return it;
  }
  if (!bh.aggro) { // бродим у дома
    if ((bh.wt = (bh.wt || 0) - ctx.dt) <= 0) { bh.wt = 2 + rand() * 4; bh.wa = rand() * 6.283; bh.walk = rand() < 0.5; }
    if (bh.walk && leashD < 10) { it.dx = Math.cos(bh.wa); it.dz = Math.sin(bh.wa); it.speed = spd * 0.3; }
    else if (leashD >= 10) { [it.dx, it.dz] = norm(m.home.x - m.x, m.home.z - m.z); it.speed = spd * 0.4; }
    if (role === 'ambusher') it.hidden = true;
    if (role === 'flyer' || role === 'bonus') it.hover = 5;
    return it;
  }
  const atk = (extra) => chooseAttack(m, dist, { ally: ctx.woundedAlly, summonOk: ctx.summonOk, ...extra });
  switch (role) {
    case 'swarm': { // роем, с покачиванием, разлетаются на 0,8 с, когда сосед гибнет
      if (ctx.allyDied && !bh.scatter) bh.scatter = 0.8;
      if (bh.scatter > 0) { bh.scatter -= ctx.dt; it.dx = -uz; it.dz = ux; it.speed = spd; break; }
      const wob = Math.sin(ctx.now * 3 + m.uid) * 0.5; [it.dx, it.dz] = norm(ux - uz * wob, uz + ux * wob); it.speed = dist > 1.2 ? spd : 0; it.attack = atk(); break;
    }
    case 'kamikaze': {
      if (!bh.lock && dist < 12) bh.lock = true;
      [it.dx, it.dz] = [ux, uz]; it.speed = bh.lock ? spd : spd * 0.4; if (dist < 1.6) it.speed = 0;
      it.attack = atk(); if (it.attack) it.suicide = true; break;
    }
    case 'charger': {
      if (bh.stuck > 0) { bh.stuck -= ctx.dt; it.exposed = true; it.face = false; break; }
      [it.dx, it.dz] = [ux, uz]; it.speed = dist > 2.2 ? spd : 0; it.attack = atk(); break;
    }
    case 'pack': { // окружают: слот-угол вокруг игрока; бьют не больше maxSimultaneousAttackers
      const n = Math.max(1, ctx.packSize || 1), slotA = ((m.packIdx || 0) / n) * 6.283 + (bh.rot = (bh.rot || 0) + ctx.dt * 0.25);
      const maxA = AI_PROFILES.ai_pack.maxSimultaneousAttackers, tokenFree = (ctx.tokens?.attackers || 0) < maxA;
      if (ctx.packLeft === 1 && m.hp < m.hpMax * 0.5) { bh.flee = true; }
      if (bh.flee) { it.dx = -ux; it.dz = -uz; it.speed = spd; it.howl = !bh.howled; bh.howled = true; break; }
      if (tokenFree && dist < 7) { [it.dx, it.dz] = [ux, uz]; it.speed = dist > 1.8 ? spd : 0; it.attack = atk(); if (it.attack && ctx.tokens) ctx.tokens.attackers++; }
      else { const tx = P.x + Math.cos(slotA) * 5, tz = P.z + Math.sin(slotA) * 5; [it.dx, it.dz] = norm(tx - m.x, tz - m.z); it.speed = Math.hypot(tx - m.x, tz - m.z) > 0.8 ? spd * 0.8 : 0; }
      break;
    }
    case 'melee': case 'burrower': {
      if (role === 'burrower') { // зарывается: 0,6 с облако пыли → выныривает СБОКУ от игрока (не за спиной в VR)
        bh.bt = (bh.bt ?? 6) - ctx.dt;
        if (bh.under > 0) { bh.under -= ctx.dt; it.hidden = true; if (bh.under <= 0) { const side = rand() < 0.5 ? 1 : -1; it.teleport = { x: P.x - uz * side * 2.5 + ux * -1.2, z: P.z + ux * side * 2.5 + uz * -1.2 }; it.emerge = true; } break; }
        if (bh.bt <= 0 && dist > 5) { bh.bt = 9; bh.under = 0.9; it.burrow = true; it.hidden = true; break; }
      }
      const a = atk(); const R = (d.attacks?.[0]?.range || 1.5) + 0.3;
      if (a) { it.attack = a; [it.dx, it.dz] = [ux, uz]; break; }
      if (dist > R + 1.2) { [it.dx, it.dz] = [ux, uz]; it.speed = spd; }
      else { const s = (m.uid % 2 ? 1 : -1); it.dx = -uz * s; it.dz = ux * s; it.speed = spd * 0.45; } // кружит, пока откат
      break;
    }
    case 'ranged': case 'caster': case 'support': {
      const [lo, hi] = prefRange(d);
      if (role === 'ranged' && d.special?.includes('20 %') && m.hp < m.hpMax * 0.2 && !bh.called) { bh.called = true; it.callHelp = 2; bh.flee = 3; }
      if (bh.flee > 0) { bh.flee -= ctx.dt; it.dx = -ux; it.dz = -uz; it.speed = spd; break; }
      if (role === 'caster' && dist < 8 && (bh.blinkCd = (bh.blinkCd ?? 0) - ctx.dt) <= 0) { bh.blinkCd = 7; const s = rand() < 0.5 ? 1 : -1; it.blink = { x: m.x - uz * s * 6 - ux * 4, z: m.z + ux * s * 6 - uz * 4, tele: 0.6 }; break; }
      if (role === 'support' && ctx.allyCenter) { // держится за спинами союзников
        const bx = ctx.allyCenter.x - ux * 4, bz = ctx.allyCenter.z - uz * 4; [it.dx, it.dz] = norm(bx - m.x, bz - m.z); it.speed = Math.hypot(bx - m.x, bz - m.z) > 1.5 ? spd : 0;
      } else if (dist > hi) { [it.dx, it.dz] = [ux, uz]; it.speed = spd; }
      else if (dist < lo) { it.dx = -ux; it.dz = -uz; it.speed = spd * 0.8; }
      else { const s = Math.sin(ctx.now * 0.7 + m.uid) > 0 ? 1 : -1; it.dx = -uz * s; it.dz = ux * s; it.speed = spd * 0.35; } // стрейф
      it.attack = atk(); break;
    }
    case 'tank': {
      if (!bh.enraged && m.hp < m.hpMax * 0.3) { bh.enraged = true; it.enrage = true; }
      if (bh.exposed > 0) { bh.exposed -= ctx.dt; it.exposed = true; it.face = false; break; } // «окно» после тяжёлого удара: слабое место открыто
      [it.dx, it.dz] = [ux, uz]; it.speed = dist > 2.4 ? spd : 0; it.attack = atk(); break;
    }
    case 'flyer': { // кружит на высоте, пикирует (dash), набирает высоту
      const [h0, h1] = AI_PROFILES.ai_flyer.hoverHeight;
      if (bh.climb > 0) { bh.climb -= ctx.dt; it.hover = h1; it.dx = -ux; it.dz = -uz; it.speed = spd * 0.6; break; }
      const a = atk(); if (a) { it.attack = a; it.hover = a.kind === 'dash' ? 1.2 : h0; [it.dx, it.dz] = [ux, uz]; break; }
      const ang = Math.atan2(m.z - P.z, m.x - P.x) + 0.6 * (m.uid % 2 ? 1 : -1), tx = P.x + Math.cos(ang) * 9, tz = P.z + Math.sin(ang) * 9;
      [it.dx, it.dz] = norm(tx - m.x, tz - m.z); it.speed = spd * 0.7; it.hover = h0 + (h1 - h0) * 0.5 + Math.sin(ctx.now + m.uid) * 1.2; break;
    }
    case 'ambusher': {
      if (!bh.revealed) { const rr = d.special?.match(/≤\s*(\d+)/)?.[1] ? +d.special.match(/≤\s*(\d+)/)[1] : 7; it.hidden = true;
        if (dist <= rr || m.damaged) { bh.revealed = true; bh.rise = 0.6; it.reveal = true; } break; }
      if (bh.rise > 0) { bh.rise -= ctx.dt; it.rising = true; break; } // пузыри/нить: 0,6 с телеграф появления
      if (m.def.role === 'ranged') { const [lo, hi] = [6, 14]; if (dist > hi) { [it.dx, it.dz] = [ux, uz]; it.speed = spd; } else if (dist < lo) { it.dx = -ux; it.dz = -uz; it.speed = spd * 0.7; } }
      else { [it.dx, it.dz] = [ux, uz]; bh.burst = Math.max(0, (bh.burst ?? 1.2) - ctx.dt); it.speed = dist > 1.8 ? spd * (bh.burst > 0 ? 1.8 : 1) : 0; } // рывок из воды/укрытия 1,2 с
      it.attack = atk(); break;
    }
    case 'bonus': { it.dx = -ux; it.dz = -uz; it.speed = spd; it.hover = 2.5; if ((bh.life = (bh.life ?? 6) - ctx.dt) <= 0) it.despawn = true; break; }
  }
  if (it.attack) { it.speed = it.attack.kind === 'proj' || it.attack.kind === 'buff' ? it.speed * 0.3 : 0; }
  return it;
}

/** Что делать после атаки (по роли): окно уязвимости танка, набор высоты летуна, «врезался» у тарана. */
export function afterAttack(m, atk, { hitPlayer = false } = {}) {
  const bh = (m.bh ||= {}), role = m.role || roleOf(m.id);
  if (role === 'tank' && (atk.dmg || 0) >= 30) bh.exposed = 2;
  if (role === 'flyer' && atk.kind === 'dash') bh.climb = 1.5;
  if (role === 'charger' && atk.kind === 'dash' && !hitPlayer) bh.stuck = 1.2;
}
/** Кулдаун атаки с аффиксами (swift ×0,8) — телеграф при этом не меняется. */
export const attackCd = (m, atk) => (atk.cd || 1.5) * (m.mods?.cdMult || 1);
/** Время замаха (VR-правило). */
export const windupS = (atk) => Math.max(TELE_MIN_S, atk.tele || 0);
