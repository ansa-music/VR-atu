// js/world/progression.js — опыт, уровни, очки (ОН/ОТ/ОХ), ранги навыков, таланты, характеристики, трекер квестов.
// Чистая логика без DOM/THREE: работает в браузере и в node --test. Данные — только из shared/defs (канон v4).
import { LEVEL_CURVE, PLAYER_BASE } from '../../shared/defs/core.js';
import { POINTS, ATTRIBUTES, CONSTELLATIONS } from '../../shared/defs/progression.js';
import { SKILLS, RANK_LEVEL_REQ, RANK_COST_SP } from '../../shared/defs/skills.js';
import { MOBS, BOSSES } from '../../shared/defs/enemies.js';
import { QUESTS } from '../../shared/defs/quests.js';
import { ITEMS } from '../../shared/defs/items.js';
import { NPCS } from '../../shared/defs/pois.js';
import { KZ_POIS, KZ_BOSSES } from '../../shared/defs/theme_kz.js';

export const MAX_LEVEL = LEVEL_CURVE.maxLevel;
export const ATTR_KEYS = Object.freeze(['vit', 'agi', 'wil', 'pre']);
export const STARTER_SKILLS = Object.freeze(['s_dash', 's_scan']); // бесплатные стартовые навыки среза E

export function createProgression(archetype = 'gunslinger') {
  return { level: 1, xp: 0, xpTotal: 0, sp: 1, tp: 0, ap: 0, archetype,
    attrs: { vit: 0, agi: 0, wil: 0, pre: 0 }, skills: Object.fromEntries(STARTER_SKILLS.filter((s) => SKILLS[s]).map((s) => [s, 1])),
    talents: {}, constellations: [], mastery: 0, shrines: [], trials: [], bossQuestsPaid: [] };
}
export const xpToNext = (L) => (L >= MAX_LEVEL ? Infinity : LEVEL_CURVE.xpToNext(L));

/** Опыт за моба/босса с поправкой на разницу уровней (раздел 3.4/5.8). */
export function xpForKill(m, playerL) {
  const id = m.id || m.def?.id, lvl = m.lvl || 1;
  if (BOSSES[id]) return LEVEL_CURVE.mobXp(10, BOSSES[id].lvl || lvl) * 50;
  const def = m.def || MOBS[id] || {};
  let xp = LEVEL_CURVE.mobXp(def.xp ?? 10, lvl);
  if (m.elite) xp *= LEVEL_CURVE.elite.xp;
  if (playerL - lvl >= 5) xp *= LEVEL_CURVE.xpLevelDelta.lowerBy5; else if (lvl - playerL >= 3) xp *= LEVEL_CURVE.xpLevelDelta.higherBy3;
  return Math.max(1, Math.round(xp));
}
export const xpForPoi = (L) => 20 * L;
export const xpForQuest = (q, L) => q?.rewards?.xp ?? (q?.kind === 'main' ? 150 : 60) * L;

/** Начислить опыт; возвращает массив событий level-up [{level, sp, ap, tp, hpMax}]. xpMul — аффикс af_xp (≤ +15 %). */
export function addXp(p, amount, xpMul = 0) {
  const ups = []; amount = Math.round(amount * (1 + Math.min(0.15, xpMul)));
  if (p.level >= MAX_LEVEL) { p.xpTotal += amount; p.mastery = Math.min(POINTS.ngPlusMastery.maxPoints, Math.floor(p.xpTotal / POINTS.ngPlusMastery.xpPerPoint)); return ups; }
  p.xp += amount; p.xpTotal += amount;
  while (p.level < MAX_LEVEL && p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level); p.level++;
    const ev = { level: p.level, sp: POINTS.skillPoints.perLevel, ap: POINTS.attributePoints.perLevelFrom2, tp: p.level % POINTS.talentPoints.everyLevels === 0 ? 1 : 0 };
    p.sp += ev.sp; p.ap += ev.ap; p.tp += ev.tp; ev.hpMax = maxHp(p); ups.push(ev);
  }
  if (p.level >= MAX_LEVEL) p.xp = 0;
  return ups;
}

/** Итоговые характеристики игрока: база × уровень + атрибуты + экипировка (gear — агрегат inventory.gearStats()). */
export function maxHp(p, gear = {}) { return Math.round(LEVEL_CURVE.playerHpRef(p.level) + (p.attrs.vit || 0) * ATTRIBUTES.vit.perPoint.hp + Math.min(60, gear.af_hp || 0)); }
export function derivedStats(p, gear = {}) {
  const A = p.attrs;
  return { hpMax: maxHp(p, gear), shieldMax: PLAYER_BASE.shieldMax,
    staminaMax: 100 + A.agi * ATTRIBUTES.agi.perPoint.stamina + Math.min(60, gear.af_stamina || 0),
    moveSpeed: Math.min(0.15, A.agi * ATTRIBUTES.agi.perPoint.moveSpeed + (gear.af_move_speed || 0)),
    energyRegen: PLAYER_BASE.energyRegen + A.wil * ATTRIBUTES.wil.perPoint.energyRegen + Math.min(4, gear.af_energy_regen || 0),
    headZone: A.pre * ATTRIBUTES.pre.perPoint.headZone + (gear.af_head_mult || 0),
    dmgMul: p.level, // уровень оружия берётся из il предмета; сюда — для HUD
    cdr: Math.min(0.3, gear.af_cdr || 0), lootFind: Math.min(0.25, gear.af_loot_find || 0), xpMul: Math.min(0.15, gear.af_xp || 0) };
}

export function spendAttr(p, key) {
  if (!ATTR_KEYS.includes(key) || p.ap <= 0 || p.attrs[key] >= POINTS.attributePoints.maxPerAttribute) return false;
  p.ap--; p.attrs[key]++; return true;
}
/** Открыть (r1) или поднять ранг навыка. Возвращает {ok, reason}. */
export function rankUpSkill(p, id) {
  const s = SKILLS[id]; if (!s) return { ok: false, reason: 'нет навыка' };
  const cur = p.skills[id] || 0; if (cur >= 5) return { ok: false, reason: 'максимальный ранг' };
  const req = RANK_LEVEL_REQ[cur], cost = RANK_COST_SP[cur];
  if (p.level < req) return { ok: false, reason: `нужен уровень ${req}` };
  if (p.sp < cost) return { ok: false, reason: `нужно ОН: ${cost}` };
  p.sp -= cost; p.skills[id] = cur + 1; return { ok: true, rank: cur + 1 };
}
export function pickTalent(p, id, ab) { if ((p.skills[id] || 0) < 3 || !['A', 'B'].includes(ab)) return false; p.talents[id] = ab; return true; }
export function grantSkill(p, id) { if (SKILLS[id] && !p.skills[id]) p.skills[id] = 1; }
/** Узел созвездия: key = 'guardian.A.0' / 'wanderer.2' */
export function buyConstellation(p, key) {
  if (p.constellations.includes(key)) return false;
  const [arch, br, idx] = key.split('.'); const i = +(idx ?? br);
  let cost = arch === 'wanderer' ? 1 : CONSTELLATIONS.nodeCost[i]; if (cost == null) return false;
  if (arch !== 'wanderer') { if (!CONSTELLATIONS[arch]?.[br]) return false; if (i > 0 && !p.constellations.includes(`${arch}.${br}.${i - 1}`)) return false; if (arch !== p.archetype) cost += CONSTELLATIONS.offArchetypeExtra; }
  if (p.tp < cost) return false; p.tp -= cost; p.constellations.push(key); return true;
}

// ───────── Трекер основной линии квестов ─────────
export function createQuestLog() { return { active: 'q_main_01', step: 0, counters: {}, done: [] }; }
/** ev: {type:'kill',mob}|{type:'goto'|'interact',poi}|{type:'collect',item,have}|{type:'talk',npc}|{type:'boss',boss}. Возвращает выполненный квест или null. */
export function questEvent(log, ev) {
  const q = QUESTS[log.active]; if (!q) return null; const st = q.steps[log.step]; if (!st) return null;
  let hit = false;
  if (st.type === 'kill' && ev.type === 'kill' && ev.mob === st.mob) { log.counters.n = (log.counters.n || 0) + 1; hit = log.counters.n >= (st.n || 1); }
  else if ((st.type === 'goto' || st.type === 'interact' || st.type === 'puzzle' || st.type === 'photo') && (ev.type === 'goto' || ev.type === 'interact') && ev.poi === st.poi) hit = true;
  else if (st.type === 'collect' && ev.type === 'collect' && ev.item === st.item) { log.counters.n = ev.have || 0; hit = log.counters.n >= (st.n || 1); }
  else if (st.type === 'talk' && ev.type === 'talk' && ev.npc === st.npc) hit = true;
  else if (st.type === 'boss' && (ev.type === 'boss' || ev.type === 'kill') && (ev.boss || ev.mob) === st.boss) hit = true;
  else if (st.type === 'escort' && ev.type === 'goto' && ev.poi === st.poi) hit = true;
  if (!hit) return null;
  log.step++; log.counters = {};
  if (log.step < q.steps.length) return null;
  const doneId = log.active; log.done.push(doneId); log.active = q.next || null; log.step = 0; return doneId;
}
export function questText(log) {
  const q = QUESTS[log.active]; if (!q) return { title: 'Основная линия пройдена', step: '' };
  const s = q.steps[log.step] || {}; const n = s.n ? ` (${log.counters.n || 0}/${s.n})` : '';
  const verb = { goto: 'Дойти до', interact: 'Активировать', kill: 'Победить', collect: 'Собрать', talk: 'Поговорить:', boss: 'Босс:', puzzle: 'Решить загадку:', photo: 'Сфотографировать', escort: 'Сопроводить до' }[s.type] || s.type;
  const id = s.boss || s.mob || s.item || s.npc || s.poi || '';
  const label = KZ_POIS[id]?.nameRu || KZ_POIS[id]?.nameKk || KZ_BOSSES[id]?.nameKk || MOBS[id]?.name || ITEMS[id]?.name || NPCS[id]?.name || BOSSES[id]?.name || id;
  return { id: log.active, title: q.title, level: q.level, step: `${verb} ${label}${n}`, stepIdx: log.step, steps: q.steps.length };
}
/** Награда квеста → прогрессия. Возвращает {xp, ups, items, skills}. */
export function applyQuestReward(p, qid) {
  const q = QUESTS[qid]; const r = q?.rewards || {}; const xp = xpForQuest(q, p.level); const ups = addXp(p, xp);
  for (const s of r.skills || []) grantSkill(p, s);
  if (r.skillPoints && POINTS.skillPoints.bossQuests.includes(qid) && !p.bossQuestsPaid.includes(qid)) { p.sp += r.skillPoints; p.bossQuestsPaid.push(qid); }
  return { xp, ups, items: r.items || [], skills: r.skills || [] };
}
/** Скрытые святилища (+1 ОН) и испытания (+1 ОТ) — один раз. */
export function onPoiDiscovered(p, poi) {
  const out = { xp: xpForPoi(p.level), sp: 0, tp: 0 };
  if (POINTS.skillPoints.shrines.includes(poi) && !p.shrines.includes(poi)) { p.shrines.push(poi); p.sp++; out.sp = 1; }
  if (POINTS.talentPoints.trialPois.includes(poi) && !p.trials.includes(poi)) { p.trials.push(poi); p.tp++; out.tp = 1; }
  out.ups = addXp(p, out.xp); return out;
}
