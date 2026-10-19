// tests/skills-caps.test.mjs — навыки и потолки формулы (node --test tests/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS, COMBOS, CAPS, SKILL_RANK_MULT as RM, levelMul } from '../shared/defs/index.js';
import { BALANCE_REF } from '../shared/defs/core.js';

const resolve = ({ base, type, zone = 1, attacker = [], charge = 1, vuln = [], armor = 0, resist = 0, buffs = [] }) => {
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const aM = 1 + Math.min(CAPS.attackerBonus, sum(attacker));
  const vM = 1 + Math.min(CAPS.vulnerability, sum(vuln));
  const arm = type === 'physical' ? armor : type === 'arcane' ? armor / 2 : 0;
  const mit = Math.min(CAPS.mitigation, arm + resist + sum(buffs));
  return Math.max(1, Math.round(base * Math.min(zone, CAPS.headZoneMax) * aM * charge * vM * (1 - mit)));
};

test('20 навыков, по 5 на архетип, id snake_case', () => {
  const s = Object.values(SKILLS);
  assert.equal(s.length, 20);
  for (const a of ['guardian', 'rogue', 'mystic', 'gunslinger']) assert.equal(s.filter((x) => x.archetype === a).length, 5);
  for (const [k, v] of Object.entries(SKILLS)) { assert.match(k, /^s_[a-z0-9_]+$/); assert.equal(v.id, k); }
});
test('контроль ≤ 1 с', () => {
  for (const s of Object.values(SKILLS)) { assert.ok(!(s.control?.sec > CAPS.controlS), s.id); assert.ok(!(s.status?.sec > CAPS.controlS), s.id); }
});
test('потолки формулы держат худший случай', () => {
  const b = 50 * RM[4] * levelMul(30);
  const capped = resolve({ base: b, type: 'frost', zone: 2.2, attacker: [0.24, 0.2, 0.2, 0.25, 0.15, 0.1], vuln: [0.15, 0.1, 0.3, 0.05] });
  assert.equal(capped, Math.round(b * 2.2 * 1.5 * 1.3));
  assert.equal(resolve({ base: 100, type: 'fire', buffs: [0.5, 0.5] }), 25); // снижение ≤ 75 %
});
test('ни один навык 1 ранга не убивает моба своего уровня (m_ref 240×levelMul) с одного каста; ульта ≤ 100 %', () => {
  for (const s of Object.values(SKILLS)) {
    if (!s.damage?.base) continue;
    for (const L of [1, 15, 30]) {
      const d = resolve({ base: s.damage.base * levelMul(L), type: s.damage.type, armor: 0.15 });
      const hp = BALANCE_REF.mobRef.hp * levelMul(L);
      assert.ok(d < (s.type === 'ultimate' ? hp : hp * 0.5), `${s.id} L${L} ${d}/${hp}`);
    }
  }
});
test('комбо с собственным ударом имеют ICD ≥ 2 с', () => {
  for (const c of Object.values(COMBOS)) if (c.hit) assert.ok(c.icdS >= CAPS.comboIcdS, c.id);
});
