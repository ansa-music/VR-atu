// Режиссёр режимов с заглушкой противников: node tests/node/waves.test.mjs
import assert from 'node:assert/strict';
import { createWaveDirector, MODES, waveRecipe } from '../../js/fantasy/waves.js';

function mockEnemies() {
  const list = [];
  return {
    list,
    spawn(type) { const e = { type }; list.push(e); return e; },
    clear() { list.length = 0; },
    countOf(type) { return list.filter((e) => e.type === type).length; },
    get boss() { return list.find((e) => e.type === 'boss') || null; },
    killAll(pred = () => true) { for (let i = list.length - 1; i >= 0; i--) if (pred(list[i])) list.splice(i, 1); },
  };
}
const run = (d, sec, opts) => { const out = []; for (let i = 0; i < sec * 72; i++) for (const e of d.update(1 / 72, opts)) out.push({ ...e }); return out; };

assert.equal(MODES.length, 3);
assert.equal(waveRecipe(5).boss, 1);
// испытание: минута, духи, феи, черепа, победа по времени; при замедлении время идёт медленнее
{
  const en = mockEnemies(); const d = createWaveDirector(en, { rng: () => 0.5 });
  d.start('trial');
  let ev = run(d, 10);
  assert.equal(ev[0].type, 'wave-start'); assert.equal(ev[0].label, 'Испытание духов');
  assert.ok(en.countOf('wisp') >= 4 && en.countOf('fairy') >= 1 && en.countOf('skull') >= 1);
  const left = d.timeLeft; run(d, 4, { timeScale: 0.25 }); assert.ok(Math.abs(left - d.timeLeft - 1) < 0.05);
  ev = run(d, 60); assert.ok(ev.some((e) => e.type === 'victory')); assert.equal(d.running, false);
}
// волны: очистка → следующая волна, 5-я — босс, урон → поражение
{
  const en = mockEnemies(); const d = createWaveDirector(en, { rng: () => 0.3 });
  d.start('waves');
  let ev = run(d, 0.1); assert.equal(ev[0].label, 'Волна 1');
  for (let w = 1; w <= 4; w++) {
    run(d, 15); assert.equal(d.queued, 0);
    en.killAll((e) => e.type !== 'skull' && e.type !== 'fairy');
    ev = run(d, 0.1); assert.ok(ev.some((e) => e.type === 'wave-clear' && e.wave === w), 'clear ' + w);
    ev = run(d, 3.2); assert.ok(ev.some((e) => e.type === 'wave-start' && e.wave === w + 1));
  }
  assert.ok(ev.some((e) => e.type === 'boss'));
  run(d, 10); assert.ok(en.boss);
  d.damagePlayer(4); d.damagePlayer(20); ev = run(d, 0.1); assert.equal(ev[0].type, 'defeat'); assert.equal(d.running, false);
}
// дуэль: босс через 2 с, прислужники, победа после смерти босса
{
  const en = mockEnemies(); const d = createWaveDirector(en);
  d.start('boss');
  let ev = run(d, 2.5); assert.ok(ev.some((e) => e.type === 'boss')); assert.ok(en.boss);
  run(d, 9); assert.ok(en.countOf('eye') >= 1);
  en.killAll((e) => e.type === 'boss'); ev = run(d, 0.1); assert.equal(ev.at(-1).type, 'victory');
}
console.log('waves: OK');
