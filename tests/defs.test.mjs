// tests/defs.test.mjs — перекрёстные ссылки и структура данных открытого мира
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDefs } from '../tools/validate-defs.mjs';
import * as D from '../shared/defs/index.js';

test('validate-defs: 0 ошибок', () => { const r = validateDefs(); assert.deepEqual(r.errors, []); assert.ok(r.refs > 1000); });
test('объёмы канона', () => {
  assert.equal(Object.keys(D.WEAPONS).length, 20); assert.equal(Object.keys(D.SKILLS).length, 20);
  assert.equal(Object.keys(D.BIOMES).length, 6); assert.equal(Object.keys(D.BOSSES).length, 6);
  assert.equal(D.POIS.length, 49); assert.equal(Object.keys(D.WORLD_EVENTS).length, 12);
  assert.equal(Object.keys(D.STATUSES).length, 6);
});
test('st_ только статусы, stn_ только станции, aff_ ≠ af_', () => {
  for (const k of Object.keys(D.STATUSES)) assert.match(k, /^st_[a-z]+$/);
  for (const k of Object.keys(D.STATIONS)) assert.match(k, /^stn_/);
  for (const k of Object.keys(D.ELITE_AFFIXES)) assert.match(k, /^aff_/);
  for (const k of Object.keys(D.GEAR_AFFIXES)) assert.match(k, /^af_/);
});
test('единая кривая уровня', () => {
  assert.equal(D.levelMul(1), 1); assert.ok(Math.abs(D.levelMul(30) - 2.74) < 1e-9);
  assert.equal(D.ilvlMul, D.levelMul); assert.equal(D.LEVEL_CURVE.hpMult(30), D.levelMul(30));
  assert.equal(D.LEVEL_CURVE.elite.hp, 3); assert.equal(D.BALANCE_REF.eliteHpMul, 3);
  assert.equal(D.LEVEL_CURVE.playerPoolRef(1), 225);
});
test('день 40 минут', () => assert.equal(D.WORLD_CONFIG.dayMin + D.WORLD_CONFIG.nightMin + D.WORLD_CONFIG.dawnMin + D.WORLD_CONFIG.duskMin, D.WORLD_CONFIG.dayLengthMin));
test('у каждого навыка (кроме пассивов) раскладка на 4 платформы', () => {
  for (const s of Object.values(D.SKILLS)) if (s.type !== 'passive') for (const k of ['vr', 'pc', 'phone', 'arduino']) assert.ok(s.input[k] && s.input[k] !== '—', `${s.id}.${k}`);
  for (const s of Object.values(D.SKILLS)) if (s.type === 'active') assert.match(s.input.pc, /Q \/ E \/ X/);
});
