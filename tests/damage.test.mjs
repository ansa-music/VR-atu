// tests/damage.test.mjs — шаги формулы и потолки
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHit, falloffMul } from '../shared/damage.js';
const T = (o = {}) => ({ hp: 150, shield: 0, armor: 0, res: {}, defBuffs: [], ...o });

test('падение с дистанцией как calculateDamage', () => { assert.equal(falloffMul([13, 40, 0.66], 5), 1); assert.equal(falloffMul([13, 40, 0.66], 40), 0.66); });
test('зона: пуля в голову ×2, потолок 2,4', () => {
  assert.equal(resolveHit({ base: 26, type: 'physical', zoneKind: 'bullet', zone: 'head', target: T() }).dmg, 52);
  assert.equal(resolveHit({ base: 100, type: 'physical', zoneKind: 'bullet', zone: 'head', headBonus: 1, target: T() }).dmg, 240);
});
test('attacker ≤ +50 %, vuln ≤ +30 %, снижение ≤ 75 %', () => {
  assert.equal(resolveHit({ base: 100, type: 'fire', attacker: [0.4, 0.4], vuln: [0.2, 0.2], target: T() }).dmg, 195);
  assert.equal(resolveHit({ base: 100, type: 'physical', target: T({ armor: 0.4, defBuffs: [0.5] }) }).dmg, 25);
});
test('arcane игнорирует половину брони', () => assert.equal(resolveHit({ base: 100, type: 'arcane', target: T({ armor: 0.2 }) }).dmg, 90));
test('щит первым, lightning по щиту ×1,5', () => {
  const r = resolveHit({ base: 40, type: 'lightning', target: T({ shield: 75 }) });
  assert.equal(r.shieldDmg, 60); assert.equal(r.hpDmg, 0);
  const r2 = resolveHit({ base: 100, type: 'physical', target: T({ shield: 75 }) });
  assert.equal(r2.shieldDmg, 75); assert.equal(r2.hpDmg, 25);
});
test('неуязвимость обнуляет; минимум 1', () => {
  assert.equal(resolveHit({ base: 50, type: 'fire', target: T({ invulnerable: true }) }).dmg, 0);
  assert.equal(resolveHit({ base: 0.2, type: 'fire', target: T() }).dmg, 1);
});
