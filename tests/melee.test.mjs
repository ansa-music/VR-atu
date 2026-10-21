// tests/melee.test.mjs — мечи и мечевые навыки: баланс через resolveHit, движок навыков, парирование, Switch, комбо, мастерство, sweep.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MELEE_WEAPONS, SWORD_SKILLS, ALL_WEAPONS, DEFAULT_SLOTS, PARRY, SWITCH, COMBO, MASTERY, meleeClassOf } from '../shared/defs/melee.js';
import { WEAPONS } from '../shared/defs/weapons.js';
import { CAPS } from '../shared/defs/core.js';
import { resolveHit } from '../shared/damage.js';
import { SwordEngine, sweepHitsSphere, swingMul, classifyPose, classifyDir, masteryFromXp, comboAttacker, skillHitParams } from '../js/world/sword-skills.js';

const T = (o = {}) => ({ hp: 9999, shield: 0, armor: 0, res: {}, ...o });
test('5 мечей и ≥15 навыков, WEAPONS не изменён', () => {
  assert.equal(Object.keys(MELEE_WEAPONS).length, 5); assert.ok(Object.keys(SWORD_SKILLS).length >= 15);
  for (const id of Object.keys(MELEE_WEAPONS)) { assert.ok(!WEAPONS[id]); assert.ok(ALL_WEAPONS[id]); }
  assert.equal(meleeClassOf('w_soul_blade'), 'one_hand'); assert.equal(meleeClassOf('w_ak74'), null);
});
test('удар мечом идёт через resolveHit и режется CAPS', () => {
  const e = new SwordEngine({ weaponId: 'w_greatsword' });
  const p = e.lightAttackParams(1); assert.equal(resolveHit({ ...p, target: T() }).dmg, 120);
  const huge = resolveHit({ ...p, attacker: [0.4, 0.4, 0.4], target: T() }).dmg; assert.equal(huge, Math.round(120 * (1 + CAPS.attackerBonus)));
  assert.equal(resolveHit({ ...p, target: T({ armor: 0.5 }) }).dmg, 60);
});
test('навык: удары по расписанию, стихия, задержка после навыка', () => {
  const ev = []; const e = new SwordEngine({ weaponId: 'w_steel_longsword', emit: (k) => ev.push(k) });
  for (let i = 0; i < 20; i++) e.addXp(1000); // мастерство до 10
  const r = e.tryActivate('ssk_horizontal_square', 10, 100); assert.ok(r.ok);
  const got = []; const res = (p, i) => { got.push([i, p.type, Math.round(p.base)]); return { hit: true }; };
  e.update(10.0, res); assert.equal(got.length, 1); e.update(10.2, res); assert.equal(got.length, 2); e.update(10.5, res);
  assert.equal(got.length, 4); assert.equal(got[0][1], 'lightning'); assert.equal(e.state, 'post');
  assert.equal(e.tryActivate('ssk_slant', 10.55, 100).reason, 'delay');
  assert.equal(e.tryActivate('ssk_horizontal_square', 20, 100).ok, true, 'откат прошёл');
  assert.equal(e.combo, 4); assert.ok(ev.includes('skill') && ev.includes('skillEnd'));
});
test('мастерство закрывает навыки и растёт от ударов', () => {
  const e = new SwordEngine({ weaponId: 'w_twin_blades' });
  assert.equal(e.tryActivate('ssk_starburst_stream', 1, 100).reason, 'locked');
  assert.equal(e.tryActivate('ssk_vorpal_strike', 1, 100).reason, 'locked', 'не тот класс');
  assert.equal(e.tryActivate('ssk_double_circular', 1, 5).reason, 'energy');
  assert.deepEqual(masteryFromXp(0), { level: 1, into: 0, need: 100 }); assert.equal(masteryFromXp(1e9).level, MASTERY.maxLevel);
  const before = e.mastery().level; for (let i = 0; i < 60; i++) e.registerHit(i * 0.1); assert.ok(e.mastery().level > before);
});
test('идеальное парирование гасит удар и открывает Switch; Switch снимает задержку и даёт +10 %', () => {
  const e = new SwordEngine({ weaponId: 'w_steel_longsword' }); e.addXp(500);
  assert.ok(e.parry(5)); const r = e.incoming(5 + PARRY.perfectS - 0.01, 1.5); assert.equal(r.mul, 0); assert.ok(r.perfect);
  assert.ok(e.switchUntil > 5); const a = e.tryActivate('ssk_slant', 5.3, 100); assert.ok(a.ok); assert.equal(a.energy, 10 - SWITCH.energyRefund);
  assert.ok(e.attackerBonuses().includes(SWITCH.attacker));
  e.parryAt = 7; assert.equal(e.incoming(7.5, 1).mul, PARRY.blockMul, 'обычный блок');
  assert.equal(e.incoming(7.5, 20).mul, 1, 'снаряд издалека не блокируется');
});
test('Switch-цепочка: финал с оглушением → следующий навык другой позы без задержки', () => {
  const e = new SwordEngine({ weaponId: 'w_steel_longsword' }); for (let i = 0; i < 20; i++) e.addXp(1000);
  e.tryActivate('ssk_vorpal_strike', 1, 100); e.update(1.2, () => ({ hit: true, staggered: true }));
  assert.equal(e.state, 'post'); assert.ok(e.switchUntil > 1.2);
  assert.equal(e.tryActivate('ssk_vorpal_strike', 1.3, 100).reason, 'cooldown');
  assert.ok(e.tryActivate('ssk_slant', 1.3, 100).ok, 'другая поза идёт в задержке');
});
test('контрстойка: удар по игроку → контратака', () => {
  const e = new SwordEngine({ weaponId: 'w_sabyl' }); e.addXp(300);
  assert.ok(e.tryActivate('ssk_steel_wall', 1, 100).ok); const r = e.incoming(1.2, 1); assert.equal(r.mul, 0); assert.ok(r.counter);
  let hits = 0; e.update(1.21, () => { hits++; return { hit: true }; }); assert.equal(hits, 1); assert.equal(e.state, 'post');
  const e2 = new SwordEngine({ weaponId: 'w_sabyl' }); e2.addXp(300); e2.tryActivate('ssk_steel_wall', 1, 100); let h2 = 0; e2.update(1.7, () => { h2++; }); assert.equal(h2, 0, 'без удара — промах');
});
test('комбо: бонус шагами и в потолке, сброс при пропущенном ударе', () => {
  assert.equal(comboAttacker(9), 0); assert.equal(comboAttacker(10), COMBO.attackerPerStep); assert.equal(comboAttacker(999), COMBO.attackerMax);
  const e = new SwordEngine(); for (let i = 0; i < 12; i++) e.registerHit(1); e.parryAt = -99; e.incoming(2, 1); assert.equal(e.combo, 0);
  const e2 = new SwordEngine(); e2.registerHit(1); e2.update(1 + COMBO.windowS + 0.1); assert.equal(e2.combo, 0);
});
test('VR: sweep ловит быстрый взмах сквозь цель; скорость кончика → множитель', () => {
  // кончик пролетел с x=-1 до x=+1 за кадр, сфера в x=0 — точечная проверка концов бы промахнулась
  assert.ok(sweepHitsSphere([-0.2, 1, 0], [-1, 1, -0.9], [0.2, 1, 0], [1, 1, -0.9], [0, 1, -0.8], 0.2) >= 0);
  assert.equal(sweepHitsSphere([0, 1, 0], [0, 2, 0], [0, 1, 0], [0, 2, 0], [3, 1, 0], 0.3), -1);
  const sw = MELEE_WEAPONS.w_steel_longsword.swing; assert.equal(swingMul(1, sw), null); assert.equal(swingMul(2, sw), 0.7); assert.equal(swingMul(9, sw), 1.3);
});
test('позы VR и направления ПК/свайпа', () => {
  assert.equal(classifyPose([0.1, 0.4, 0], [0.2, 0, -0.1]), 'overhead');
  assert.equal(classifyPose([0.1, -0.2, -0.8], [0.1, -0.25, -0.2]), 'thrust');
  assert.equal(classifyPose([0.9, -0.3, -0.3], [0.2, -0.3, -0.3]), 'side');
  assert.equal(classifyPose([0.2, -0.9, -0.3], [0.2, -0.4, -0.3]), 'low');
  assert.equal(classifyDir(0, 80), 'up'); assert.equal(classifyDir(-90, 10), 'left'); assert.equal(classifyDir(5, 5), 'none');
});
test('слоты по умолчанию валидны, назначение из радиала проверяет класс', () => {
  for (const [c, s] of Object.entries(DEFAULT_SLOTS)) for (const id of Object.values(s)) assert.ok(SWORD_SKILLS[id].classes.includes(c));
  const e = new SwordEngine({ weaponId: 'w_naiza' }); assert.equal(e.assignSlot('up', 'ssk_starburst_stream'), false); assert.equal(e.assignSlot('up', 'ssk_cyclone'), true);
  assert.equal(e.slotSkill('up'), 'ssk_cyclone'); const s = e.serialize(); const e2 = new SwordEngine({ weaponId: 'w_naiza', save: s }); assert.equal(e2.slotSkill('up'), 'ssk_cyclone');
});
test('AoE-удар навыка помечен zoneKind aoe, урон навыка ≤ потолка одиночного удара', () => {
  const p = skillHitParams(SWORD_SKILLS.ssk_avalanche, 0, MELEE_WEAPONS.w_greatsword); assert.equal(p.zoneKind, 'aoe'); assert.equal(p.type, 'fire');
  assert.ok(resolveHit({ ...p, zone: 'head', target: T() }).dmg <= 384);
});
