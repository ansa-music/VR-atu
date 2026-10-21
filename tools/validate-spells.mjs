// tools/validate-spells.mjs — проверка магии стихий: ID, ссылки, канон (типы, статусы, CAPS), ввод, баланс через resolveHit.
// Запуск: node tools/validate-spells.mjs   (exit 1 при ошибке)
import * as D from '../shared/defs/index.js';
import { SPELLS, FUSIONS, RUNES, GLYPHS, SPELL_ELEMENTS, SPELL_FORMS, SPELL_VFX, SPELL_INPUT, GRIMOIRE, CAST_RULES } from '../shared/defs/spells.js';
import { EXTRA_INPUT } from '../shared/defs/fantasy_extras.js';
import { resolveHit } from '../shared/damage.js';
import { castParams, runeMods } from '../js/world/casting.js';
import { GlyphRecognizer, glyphPoints } from '../js/world/glyph-recognizer.js';

const errs = [], warn = []; const err = (m) => errs.push(m);
const TYPES = ['physical', 'fire', 'frost', 'lightning', 'arcane', 'poison'];
const known = new Set([...Object.keys(D.SKILLS), ...Object.keys(D.COMBOS), ...Object.keys(D.WEAPONS)]);
const poiIds = new Set(D.POIS.map((p) => p.id));
const B = D.BALANCE_REF, ref = B.mobRef;

// 1. ID и префиксы
for (const [k, s] of Object.entries(SPELLS)) { if (!/^sp_[a-z0-9_]+$/.test(k) || s.id !== k) err(`spell id ${k}`); }
for (const [k, f] of Object.entries(FUSIONS)) { if (!/^fu_[a-z0-9_]+$/.test(k) || f.id !== k) err(`fusion id ${k}`); }
for (const [k, r] of Object.entries(RUNES)) { if (!/^rn_[a-z0-9_]+$/.test(k) || r.id !== k) err(`rune id ${k}`); if (!poiIds.has(r.found)) err(`${k}: POI ${r.found} нет в POIS`); }
for (const k of Object.keys(GLYPHS)) if (!k.startsWith('gl_')) err(`glyph ${k}`);
const clash = [...Object.keys(SPELLS), ...Object.keys(FUSIONS), ...Object.keys(RUNES)].filter((k) => known.has(k) || D.ITEMS?.[k]); if (clash.length) err(`ID пересекаются с v2: ${clash}`);
const core = Object.keys(SPELLS).filter((k) => !SPELL_ELEMENTS[SPELLS[k].element].flavor);
if (core.length < 25) err(`основных заклинаний ${core.length} < 25`);
for (const el of ['fire', 'frost', 'lightning', 'arcane', 'poison']) { const n = core.filter((k) => SPELLS[k].element === el).length; if (n !== 5) err(`${el}: ${n} заклинаний, нужно 5`); }
if (Object.keys(FUSIONS).length < 10) err('слияний < 10');

// 2. Поля, канон, ссылки
const all = { ...SPELLS, ...FUSIONS };
for (const [k, s] of Object.entries(all)) {
  if (!TYPES.includes(s.dmgType)) err(`${k}: тип ${s.dmgType}`);
  if (typeof s.nameKk !== 'string') err(`${k}: нет nameKk`);
  if (!SPELL_VFX[s.vfx]) err(`${k}: нет vfx ${s.vfx}`); else if (SPELL_VFX[s.vfx].base !== s.dmgType) err(`${k}: vfx.base ≠ dmgType`);
  if (!SPELL_FORMS[s.form]) err(`${k}: форма ${s.form}`);
  for (const st of [s.status, s.status2].filter(Boolean)) { if (!D.STATUSES[st.id]) err(`${k}: статус ${st.id}`); if (st.sec && st.sec > D.CAPS.controlS) err(`${k}: контроль > CAPS.controlS`); if (st.stacks && st.stacks > D.STATUSES[st.id].maxStacks) err(`${k}: стаков > max`); }
  if (s.control && s.control.s > D.CAPS.controlS) err(`${k}: control > cap`);
  if (s.chain && s.chain.jumps > D.CAPS.chainJumpsMax) err(`${k}: прыжков > cap`);
  if (s.ward?.defBuff > D.CAPS.dmgReductionBuffMax) err(`${k}: defBuff > cap`);
  if (s.ward?.moveSpeed > D.CAPS.moveSpeedBonus) err(`${k}: moveSpeed > cap`);
  for (const o of s.overlaps || []) if (!known.has(o)) err(`${k}: overlaps → неизвестный ${o}`);
  if (s.energy > D.PLAYER_BASE.energy) err(`${k}: энергия > 100`);
}
for (const f of Object.values(FUSIONS)) {
  if (f.elements[0] === f.elements[1] || f.elements.some((e) => !SPELL_ELEMENTS[e])) err(`${f.id}: стихии`);
  const parents = f.elements.map((e) => Object.values(SPELLS).filter((s) => s.element === e && s.form === f.form)).flat();
  const best = Math.max(0, ...Object.values(SPELLS).filter((s) => f.elements.includes(s.element) && s.form === f.form).map((s) => s.base));
  if (best && f.base > best * 1.5 + 1e-9) err(`${f.id}: урон ${f.base} > 1,5× родителя ${best}`);
  void parents;
}
const pairs = new Set(); for (const f of Object.values(FUSIONS)) { const p = [...f.elements].sort().join('+'); if (pairs.has(p)) err(`дубль пары ${p}`); pairs.add(p); }
const formEl = new Set(); for (const s of Object.values(SPELLS)) { const p = s.element + ':' + s.form; if (formEl.has(p)) err(`дубль ${p}`); formEl.add(p); }

// 3. Ввод: новые клавиши/жесты не пересекаются с каноном
const usedPc = new Set([...D.RESERVED_PC_KEYS, ...Object.values(EXTRA_INPUT).map((x) => x.pc)]);
for (const k of ['stance', 'grimoire']) if (usedPc.has(SPELL_INPUT[k].pc)) err(`SPELL_INPUT.${k}: клавиша ${SPELL_INPUT[k].pc} занята`);
const usedArd = new Set([...Object.values(D.INPUT_MAP).map((x) => x.arduino), ...Object.values(EXTRA_INPUT).map((x) => x.arduino)]);
if (usedArd.has(SPELL_INPUT.stance.arduino)) err('Arduino-жест стойки занят');
const keys = Object.values(SPELL_ELEMENTS).map((e) => e.pcKey); if (new Set(keys).size !== keys.length) err('pcKey стихий повторяются');

// 4. Распознаватель: каждый шаблон узнаётся сам собой
const rec = new GlyphRecognizer();
for (const [id, g] of Object.entries(GLYPHS)) { const r = rec.recognize(glyphPoints(g)); if (r.id !== id || r.score < CAST_RULES.minGlyphScore) err(`глиф ${id} → ${r.id} (${r.score.toFixed(2)})`); }

// 5. Руны: худший набор модификаторов ≤ 50 % потолков
const mods = runeMods(Object.keys(RUNES));
for (const [k, cap] of Object.entries(GRIMOIRE.modSumCaps)) if (mods[k] > cap + 1e-9 || cap > D.CAPS[k === 'attacker' ? 'attackerBonus' : k] * 0.5 + 1e-9) err(`руны ${k}`);

// 6. Баланс через resolveHit (L1, ранг 1, mobRef hp 240 / броня 0.15)
const T = () => ({ hp: 1e6, shield: 0, armor: ref.armor, res: {} });
const rows = [];
for (const s of Object.values(all)) {
  if (!s.base) continue;
  const p = castParams(s); const one = resolveHit({ base: p.base, type: s.dmgType, zoneKind: s.zoneKind, target: T() }).dmg;
  const n = s.form === 'beam' ? Math.round(s.channelS / s.tickS) : s.pulses || 1;
  const total = one * n, energy = s.energy + (s.energyPerS || 0) * (s.channelS || 0);
  const window = Math.max(0.25, s.castS + (s.channelS || 0) + (s.pulses ? s.pulses * s.pulseS : 0));
  const dpe = total / energy, dps = total / window;
  const head = s.zoneKind === 'other' ? resolveHit({ base: p.base * 1.5, type: s.dmgType, zoneKind: 'other', zone: 'head', target: T() }).dmg : one;
  rows.push([s.id, s.dmgType, s.form, one, n, total, energy, dpe.toFixed(2), dps.toFixed(0), Math.ceil(ref.hp / total)]);
  if (s.form !== 'ward' && (dpe < 1.0 || dpe > 3.6)) err(`${s.id}: урон/энергия ${dpe.toFixed(2)} вне [1.0, 3.6]`);
  if (dps > B.refDps * B.peakDpsRatioMax) err(`${s.id}: пиковый DPS ${dps.toFixed(0)} > ${B.refDps * B.peakDpsRatioMax}`);
  if (s.zoneKind === 'other' && head * 1.5 >= ref.hp) err(`${s.id}: ваншот mobRef`);
}
// Устойчивый DPS только магией (энергия 8/с): ≤ 25 % refDps — магия дополняет оружие, не заменяет
const bestDpe = Math.max(...rows.map((r) => +r[7])); const sustained = bestDpe * D.PLAYER_BASE.energyRegen;
if (sustained > B.refDps * 0.25) warn.push(`устойчивый DPS магии ${sustained.toFixed(0)} > 25 % refDps`);

console.log('id | тип | форма | удар | ×N | итого | энергия | урон/эн | DPS окна | кастов на mobRef');
for (const r of rows) console.log(r.join(' | '));
console.log(`\nзаклинаний ${Object.keys(SPELLS).length} (основных ${core.length}), слияний ${Object.keys(FUSIONS).length}, рун ${Object.keys(RUNES).length}, глифов ${Object.keys(GLYPHS).length}`);
console.log(`устойчивый DPS одной магией ≈ ${sustained.toFixed(0)} (реген ${D.PLAYER_BASE.energyRegen}/с)`);
for (const w of warn) console.log('WARN', w);
if (errs.length) { for (const e of errs) console.error('ERR', e); process.exit(1); }
console.log('validate-spells: OK');
