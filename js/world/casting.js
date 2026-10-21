// js/world/casting.js — конечный автомат каста (чистая логика: без THREE/DOM; время передаётся в update(dt)).
// Состояния: idle → stance → (руны: 1–2 стихии) → casting → [channeling] → recovery(gcd) → stance|idle ; interrupted → lockout.
import { SPELLS, FUSIONS, CAST_RULES, SPELL_INPUT, RUNES, GRIMOIRE } from '../../shared/defs/spells.js';
import { CAPS, levelMul } from '../../shared/defs/core.js';
import { SKILL_RANK_MULT } from '../../shared/defs/skills.js';

/** Найти заклинание по набору стихий и форме. Слияние: порядок рун не важен. */
export function findCastable(elements, form) {
  if (elements.length === 1) return Object.values(SPELLS).find((s) => s.element === elements[0] && s.form === form) || null;
  if (elements.length === 2) return Object.values(FUSIONS).find((f) => f.elements.includes(elements[0]) && f.elements.includes(elements[1]) && elements[0] !== elements[1]) || null; // у слияния своя форма
  return null;
}
/** Суммы модификаторов рун с обрезкой по 50 % CAPS (GRIMOIRE.modSumCaps). */
export function runeMods(runeIds = []) {
  const m = { attacker: 0, energyCostReduction: 0, cooldownReduction: 0, statusDuration: 0, castTimeMul: 1, channelEnergyMul: 1, overcastDeficit: 0, backlashMul: 1, echoEveryN: 0, echoMul: 0 };
  for (const id of runeIds) { const r = RUNES[id]; if (!r || r.kind !== 'mod') continue;
    for (const [k, v] of Object.entries(r.mod)) { if (k.endsWith('Mul')) m[k] *= v; else if (k === 'echoEveryN') m[k] = v; else m[k] += v; } }
  for (const [k, cap] of Object.entries(GRIMOIRE.modSumCaps)) m[k] = Math.min(cap, m[k]);
  return m;
}
/** Итоговые параметры каста (после ранга, уровня, рун, внешних снижений). */
export function castParams(def, { rank = 1, level = 1, runes = [], extCostRed = 0, extCdRed = 0 } = {}) {
  const m = runeMods(runes);
  const costRed = Math.min(CAPS.energyCostReduction, m.energyCostReduction + extCostRed), cdRed = Math.min(CAPS.cooldownReduction, m.cooldownReduction + extCdRed);
  return {
    id: def.id, base: (def.base || 0) * SKILL_RANK_MULT[Math.min(2, rank - 1)] * levelMul(level),
    energy: Math.round(def.energy * (1 - costRed)), energyPerS: (def.energyPerS || 0) * (1 - costRed) * m.channelEnergyMul,
    castS: def.castS * m.castTimeMul, channelS: def.channelS || 0, cooldownS: def.cooldownS * (1 - cdRed),
    attacker: m.attacker, statusDurMul: 1 + Math.min(CAPS.statusDuration, m.statusDuration),
    maxDeficit: CAST_RULES.overcast.maxDeficit + m.overcastDeficit, backlashMul: m.backlashMul, echo: m.echoEveryN ? { n: m.echoEveryN, mul: m.echoMul } : null,
  };
}

export class CastingMachine {
  /** @param {{unlocked?:(id)=>boolean, rankOf?:(id)=>number, level?:number, runes?:string[]}} opts */
  constructor(opts = {}) {
    const o = Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined));
    this.opts = { unlocked: () => true, rankOf: () => 1, level: 1, runes: [], ...o };
    this.state = 'idle'; this.elements = []; this.t = 0; this.glyphT = 0; this.cd = {}; this.gcd = 0; this.lock = 0;
    this.spell = null; this.p = null; this.charge = 1; this.chargeT = 0; this.overcast = 0; this.events = []; this.counts = {};
  }
  emit(type, data = {}) { this.events.push({ type, ...data }); }
  drain() { const e = this.events; this.events = []; return e; }
  enterStance() { if (this.state === 'idle') { if (this.opts?.requireAdvanced && !this.opts.advancedGlyphs) return; this.state = 'stance'; this.elements = []; this.emit('stance', { on: true }); } }
  exitStance() { if (['stance', 'idle'].includes(this.state)) { this.state = 'idle'; this.elements = []; this.emit('stance', { on: false }); } }
  /** Начерчена руна (или нажата клавиша стихии / паттерн стика). */
  addElement(el) {
    if (this.state !== 'stance' || this.lock > 0) return false;
    if (this.elements.length >= 2 || this.elements.includes(el)) this.elements = [];
    this.elements.push(el); this.glyphT = SPELL_INPUT.glyphWindowS; this.emit('rune', { element: el, elements: [...this.elements] }); return true;
  }
  /** Выпуск: форма из SPELL_FORMS. energy — текущая энергия игрока. Возвращает {ok, reason}. */
  release(form, energy, { holdS = 0 } = {}) {
    if (this.state !== 'stance') return { ok: false, reason: 'state' };
    if (this.lock > 0 || this.gcd > 0) return { ok: false, reason: 'gcd' };
    const def = findCastable(this.elements, form);
    if (!def) return { ok: false, reason: 'no_spell' };
    if (!this.opts.unlocked(def.id)) return { ok: false, reason: 'locked' };
    if ((this.cd[def.id] || 0) > 0) return { ok: false, reason: 'cooldown' };
    const p = castParams(def, { rank: this.opts.rankOf(def.id), level: this.opts.level, runes: this.opts.runes });
    const deficit = Math.max(0, p.energy - energy);
    if (deficit > p.maxDeficit) return { ok: false, reason: 'energy' };
    this.spell = def; this.p = p; this.overcast = deficit; this.t = p.castS; this.state = 'casting';
    const [c0, c1] = CAST_RULES.chargeRange;
    this.charge = def.chargeable ? Math.min(c1, c0 + (c1 - c0) * Math.min(1, holdS / CAST_RULES.chargeS)) : 1;
    if (deficit > 0) this.charge = Math.min(this.charge, CAST_RULES.overcast.maxChargeMul);
    this.emit('cast_start', { id: def.id, castS: p.castS, energy: p.energy, overcast: deficit, charge: this.charge });
    if (p.castS <= 0) this._fire();
    return { ok: true, id: def.id, energy: p.energy - deficit, overcast: deficit };
  }
  _fire() {
    const def = this.spell, p = this.p; this.counts[def.id] = (this.counts[def.id] || 0) + 1;
    const hit = { base: p.base, type: def.dmgType, zoneKind: def.zoneKind, attacker: p.attacker ? [p.attacker] : [], charge: this.charge };
    this.emit('fire', { id: def.id, def, hit, n: this.counts[def.id] });
    if (p.echo && def.form === 'bolt' && this.counts[def.id] % p.echo.n === 0) this.emit('fire', { id: def.id, def, hit: { ...hit, base: hit.base * p.echo.mul }, echo: true });
    if (this.overcast > 0) {
      const backlash = Math.round(this.overcast * CAST_RULES.overcast.backlashHpPerEnergy * p.backlashMul);
      this.emit('backlash', { id: def.id, hp: backlash, dmgType: def.dmgType, regenLockS: CAST_RULES.overcast.regenLockS });
    }
    this.cd[def.id] = p.cooldownS; this.gcd = CAST_RULES.gcdS;
    if (p.channelS > 0) { this.state = 'channeling'; this.t = p.channelS; this.tick = 0; }
    else this._finish();
  }
  _finish() { this.state = 'stance'; this.elements = []; this.spell = null; this.emit('cast_end', {}); }
  /** Отпустить канал досрочно. */
  stopChannel() { if (this.state === 'channeling') { this.emit('channel_end', { id: this.spell.id }); this._finish(); } }
  /** Стаггер/заморозка/отбрасывание прерывают каст и канал. */
  interrupt(cause = 'st_stagger') {
    if (!CAST_RULES.interrupt.by.includes(cause) || !['casting', 'channeling'].includes(this.state)) return false;
    const refund = this.state === 'casting' ? Math.round((this.p.energy - this.overcast) * CAST_RULES.interrupt.refundCasting) : 0;
    this.emit('interrupted', { id: this.spell.id, cause, refund });
    this.state = 'stance'; this.elements = []; this.spell = null; this.lock = CAST_RULES.interrupt.lockoutS; return true;
  }
  /** @param energy текущая энергия — для канала; возвращает энергию, потраченную в этом кадре. */
  update(dt, energy = Infinity) {
    let spent = 0;
    for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt);
    this.gcd = Math.max(0, this.gcd - dt); this.lock = Math.max(0, this.lock - dt);
    if (this.state === 'stance' && this.elements.length) { this.glyphT -= dt; if (this.glyphT <= 0) { this.elements = []; this.emit('rune_timeout'); } }
    if (this.state === 'casting') { this.t -= dt; if (this.t <= 0) this._fire(); }
    else if (this.state === 'channeling') {
      const need = this.p.energyPerS * dt;
      if (energy < need) { this.stopChannel(); return 0; }
      spent = need; this.t -= dt; this.tick -= dt;
      while (this.tick <= 0 && this.t > -1e-9) { this.tick += this.spell.tickS; this.emit('tick', { id: this.spell.id, hit: { base: this.p.base, type: this.spell.dmgType, zoneKind: this.spell.zoneKind, attacker: this.p.attacker ? [this.p.attacker] : [], charge: 1 } }); }
      if (this.t <= 0) this.stopChannel();
    }
    return spent;
  }
}
