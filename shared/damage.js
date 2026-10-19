// shared/damage.js — эталонная реализация формулы урона (раздел 3). Чистая функция, без Three.js.
// base → falloff → zone → attacker (≤ +50 %) → charge → vuln (≤ +30 %) → mitigation (≤ 75 %) → shield → HP → statuses.
import { CAPS, ZONE } from './defs/core.js';

const sum = (a = []) => a.reduce((x, y) => x + y, 0);
/** Линейное падение: до start — 1, после end — min (как calculateDamage в server/weapon-rules.js). */
export function falloffMul(falloff, range) {
  if (!falloff) return 1;
  const [start, end, min] = falloff;
  if (range <= start) return 1;
  return 1 - (1 - min) * Math.min(1, (range - start) / Math.max(1e-6, end - start));
}
/**
 * @param {object} p
 * @param {number} p.base           урон до формулы (уже × ilvlMul / levelMul × ранг)
 * @param {string} p.type           physical | fire | frost | lightning | arcane | poison
 * @param {string} [p.zoneKind]     bullet | other | aoe
 * @param {string} [p.zone]         head | body | limb | weak
 * @param {number} [p.weakMult]     множитель слабого места (вместо head)
 * @param {number} [p.headBonus]    прибавка к голове (Твёрдая рука, аффиксы); итог ≤ CAPS.headZoneMax
 * @param {number[]} [p.falloff]    [start, end, min]; range — дистанция
 * @param {number[]} [p.attacker]   аддитивные бонусы атакующего (уровень, аффиксы, навыки)
 * @param {number} [p.charge]       0.5..1.5
 * @param {number[]} [p.vuln]       дебаффы цели (Метка, шок, слабость, заморозка для physical)
 * @param {object} p.target         { hp, shield, armor, res: {type: v}, defBuffs: number[], invulnerable }
 * @param {boolean} [p.dot]         DoT: без falloff/зоны/заряда
 */
export function resolveHit(p) {
  const t = p.target;
  if (t.invulnerable) return { dmg: 0, shieldDmg: 0, hpDmg: 0, applyStatuses: false };
  let d = p.base;
  if (!p.dot) {
    d *= falloffMul(p.falloff, p.range ?? 0);
    const z = ZONE[p.zoneKind || 'other'];
    let zm = p.zone === 'weak' ? (p.weakMult || 1) : p.zone ? z[p.zone] : 1;
    if (p.zone === 'head') zm = Math.min(CAPS.headZoneMax, zm + (p.headBonus || 0));
    d *= zm;
  }
  d *= 1 + Math.min(CAPS.attackerBonus, sum(p.attacker));
  if (!p.dot) d *= p.charge ?? 1;
  d *= 1 + Math.min(CAPS.vulnerability, sum(p.vuln));
  const res = Math.max(CAPS.resistMin, Math.min(CAPS.resistMax, t.res?.[p.type] || 0));
  const arm = p.type === 'physical' ? (t.armor || 0) : p.type === 'arcane' ? (t.armor || 0) / 2 : 0;
  const mit = Math.min(CAPS.mitigation, arm + res + sum(t.defBuffs));
  d *= 1 - mit;
  const dmg = Math.max(1, Math.round(d));
  // щит первым; lightning по щиту ×1,5 (только на этом шаге)
  let shieldDmg = 0, left = dmg;
  if (t.shield > 0) {
    const k = p.type === 'lightning' ? 1.5 : 1;
    shieldDmg = Math.min(t.shield, Math.round(left * k));
    left = Math.max(0, left - Math.round(shieldDmg / k));
  }
  const hpDmg = Math.min(t.hp, left);
  return { dmg, shieldDmg, hpDmg, applyStatuses: dmg >= 1 };
}
