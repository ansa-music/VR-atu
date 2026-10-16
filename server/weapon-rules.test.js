import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS } from '../js/arsenal.js';
import { WEAPON_RULES, weaponRule, calculateDamage } from './weapon-rules.js';

test('server knows exactly the five weapons available in the client arsenal', () => {
  assert.deepEqual(Object.keys(WEAPON_RULES).sort(), WEAPONS.map(w => w.id).sort());
  for (const d of WEAPONS) {
    const rule = weaponRule(d.id);
    assert.ok(rule, d.id);
    const expectedInterval = Math.max(d.interval, d.cycleTime || 0) * 1000;
    assert.ok(Math.abs(rule.intervalMs - expectedInterval) < 2, d.id + ' fire interval mismatch');
    assert.equal(rule.pellets, d.pellets, d.id + ' pellet count mismatch');
  }
});

test('headshots dominate body damage, limbs reduce damage, range falloff is bounded', () => {
  for (const rule of Object.values(WEAPON_RULES)) {
    const head = calculateDamage(rule, 'head', 2);
    const body = calculateDamage(rule, 'body', 2);
    const limb = calculateDamage(rule, 'limb', 2);
    assert.ok(head > body, rule.id);
    assert.ok(body > limb, rule.id);
    assert.ok(calculateDamage(rule, 'body', rule.falloffEnd) <= body);
    assert.equal(calculateDamage(rule, 'body', rule.range + 1), 0);
  }
  assert.equal(weaponRule('infinite_railgun'), null);
});
