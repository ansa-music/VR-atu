// Проверка маны и фэнтези-арсенала: node tests/node/weapons.test.mjs
import assert from 'node:assert/strict';
import { Arsenal, WEAPONS, Weapon } from '../../js/arsenal.js';
import { FANTASY_WEAPONS, createFantasyArsenal, nextElement, shotParams, bowRelease, bladeWave } from '../../js/fantasy/weapons.js';

const step = (w, t, dt = 1 / 72) => { for (let i = 0; i < t / dt; i++) w.update(dt); };

// старое оружие не сломано
{
  const a = new Arsenal(WEAPONS);
  assert.equal(a.current.def.id, 'ak');
  const pm = a.list[0];
  assert.ok(pm.pull(true).shot); assert.equal(pm.mag, 6);
  assert.equal(pm.manaFed, false);
  const bl = a.list[4]; assert.ok(bl.pull(true).shot); assert.ok(bl.heat > 0);
}
const a = createFantasyArsenal(() => 0.5);
assert.deepEqual(a.list.map((w) => w.def.id), ['wand', 'staff', 'blade', 'bow', 'gauntlet']);
assert.equal(a.current.def.id, 'staff');
for (const w of a.list) { assert.equal(w.manaFed, true); assert.equal(w.mana, w.def.manaMax); }

// жезл: короткое нажатие — обычная стрела, удержание — заряд
{
  const w = a.list[0];
  assert.equal(w.pull(true), null); assert.equal(w.charge01, 0);
  step(w, 0.05);
  let r = w.release(); assert.ok(r.shot); assert.equal(r.charge, 0);
  assert.equal(w.mana, 100 - 4);
  step(w, 0.3);
  w.pull(true); step(w, 1.3);
  assert.equal(w.charge01, 1);
  assert.ok(w.drain().some((e) => e.type === 'charge-full'));
  r = w.release(); assert.equal(r.charge, 1);
  const p = shotParams(w, r); assert.ok(p.damage >= 4.9 && p.speed > 90 && p.radius > 1);
  assert.ok(w.mana < 80);
}
// посох: очередь, стихии, мана кончается, кристалл восполняет
{
  const w = a.list[1];
  assert.equal(w.element, 'fire');
  assert.equal(nextElement(w), 'ice'); assert.equal(shotParams(w, { shot: true }).element, 'ice');
  assert.equal(nextElement(w), 'lightning'); assert.equal(nextElement(w), 'fire');
  let shots = 0, dry = 0;
  for (let i = 0; i < 72 * 6; i++) { const r = w.pull(i === 0); if (r?.shot) shots++; if (r?.dry) dry++; w.update(1 / 72); }
  assert.ok(shots >= 24 && shots < 40, 'выстрелов ' + shots);
  assert.ok(w.mana < 5);
  assert.ok(w.pull(true).dry);
  assert.ok(w.manualMagSwap()); assert.equal(w.mana, 120);
  // медленное восполнение «перезарядкой»
  w.mana = 0; assert.ok(w.startReload()); step(w, 1.6); assert.equal(w.mana, 120); assert.equal(w.reloading, null);
  // сам восполняется
  w.mana = 0; w.sinceSpend = 0; step(w, 2); assert.ok(w.mana > 10 && w.mana < 20, 'реген ' + w.mana);
}
// лук
{
  const w = a.list[3];
  assert.equal(w.pull(true), null);
  assert.equal(bowRelease(w, 0.05), null);
  const r = bowRelease(w, 1); assert.ok(r.shot);
  const p = shotParams(w, r, 1); assert.equal(p.speed, 95); assert.equal(p.damage, 4);
  assert.equal(shotParams(w, r, 0.2).speed < 40, true);
  assert.equal(bowRelease(w, 1), null); // откат
  step(w, 0.4); assert.ok(bowRelease(w, 0.5));
}
// клинок
{
  const w = a.list[2];
  assert.ok(bladeWave(w, 1)); step(w, 0.3); assert.ok(bladeWave(w, 1)); step(w, 0.3);
  assert.ok(bladeWave(w, 1)); step(w, 0.3); assert.ok(bladeWave(w, 1)); step(w, 0.3);
  assert.equal(bladeWave(w, 1), null);
}
// смена слотов
a.select(3); step(a, 1); assert.equal(a.current.def.id, 'bow');
console.log('weapons: OK');
