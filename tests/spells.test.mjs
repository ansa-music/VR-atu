// tests/spells.test.mjs — магия стихий: распознаватель, автомат каста, канон формулы.  node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { GLYPHS, SPELLS, FUSIONS, RUNES, CAST_RULES } from '../shared/defs/spells.js';
import { STATUSES, CAPS } from '../shared/defs/index.js';
import { resolveHit } from '../shared/damage.js';
import { GlyphRecognizer, glyphPoints, stickPathToStroke } from '../js/world/glyph-recognizer.js';
import { CastingMachine, findCastable, castParams, runeMods } from '../js/world/casting.js';

let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const distort = (pts, { scale = 200, rot = 0, jitter = 0.03, dx = 50 } = {}) => {
  const c = Math.cos(rot), s = Math.sin(rot); const dense = [];
  pts = pts.map(([x, y]) => [x + (rnd() - 0.5) * jitter, y + (rnd() - 0.5) * jitter]); // дрожание низкой частоты (как у руки), затем плотная выборка
  for (let i = 1; i < pts.length; i++) for (let k = 0; k < 8; k++) { const t = k / 8; dense.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]); }
  dense.push(pts[pts.length - 1]);
  return dense.map(([x, y]) => { return [dx + scale * (x * c - y * s), dx + scale * (x * s + y * c)]; });
};
const rec = new GlyphRecognizer();

test('каждый глиф узнаётся при масштабе, сдвиге, повороте ±15° и дрожании руки', () => {
  for (const [id, g] of Object.entries(GLYPHS)) for (const rot of [-0.26, 0, 0.26]) for (let i = 0; i < 4; i++) {
    const r = rec.recognize(distort(glyphPoints(g), { rot, scale: 50 + rnd() * 400 }));
    assert.equal(r.id, id, `${id} rot ${rot}`); assert.ok(r.score >= CAST_RULES.minGlyphScore, `${id} score ${r.score}`);
  }
});
test('обратное направление обхода тоже узнаётся', () => {
  for (const [id, g] of Object.entries(GLYPHS)) assert.equal(rec.recognize(distort(glyphPoints(g).reverse())).id, id);
});
test('ориентация важна: перевёрнутая галочка (Λ) — не мороз', () => {
  const r = rec.recognize([[0, 1], [0.5, 0], [1, 1]]); assert.notEqual(r.id, 'gl_vee');
});
test('Arduino: путь стика превращается в штрих', () => {
  const pts = glyphPoints(GLYPHS.gl_zigzag).map(([x, y]) => [x * 2 - 1, -(y * 2 - 1)]);
  assert.equal(rec.recognize(stickPathToStroke(distort(pts, { scale: 1, dx: 0, jitter: 0.01 }), 0)).id, 'gl_zigzag');
});
test('мусор/точка не падает', () => { assert.equal(rec.recognize([[1, 1]]).id, null); assert.equal(rec.recognize([[1, 1], [1, 1], [1, 1]]).id, null); });

test('findCastable: стихия×форма и слияние без учёта порядка', () => {
  assert.equal(findCastable(['fire'], 'bolt').id, 'sp_fire_bolt');
  assert.equal(findCastable(['frost', 'fire'], 'nova').id, 'fu_steam');
  assert.equal(findCastable(['frost', 'lightning'], 'bolt').id, 'fu_conduction');
  assert.equal(findCastable(['earth'], 'storm'), null);
});
test('обычный каст: casting → fire → cooldown/gcd', () => {
  const m = new CastingMachine(); m.enterStance(); m.addElement('fire');
  const r = m.release('bolt', 100); assert.ok(r.ok); assert.equal(r.energy, 15); assert.equal(m.state, 'casting');
  m.update(0.3); const ev = m.drain().map((e) => e.type); assert.ok(ev.includes('fire')); assert.equal(m.state, 'stance');
  m.addElement('fire'); assert.equal(m.release('bolt', 100).reason, 'gcd'); m.update(0.7); m.addElement('fire'); assert.equal(m.release('bolt', 100).reason, 'cooldown');
});
test('заряд: тап 1.0, полный 1.5 (шаг 5 формулы)', () => {
  const m = new CastingMachine(); m.enterStance(); m.addElement('fire'); m.release('bolt', 100, { holdS: 5 }); assert.equal(m.charge, 1.5);
  const n = new CastingMachine(); n.enterStance(); n.addElement('frost'); n.release('nova', 100, { holdS: 5 }); assert.equal(n.charge, 1);
});
test('канал тратит энергию/с, тикает и прерывается стаггером без возврата', () => {
  const m = new CastingMachine(); m.enterStance(); m.addElement('fire'); m.release('beam', 100); m.update(0.31, 100);
  assert.equal(m.state, 'channeling'); let spent = 0; for (let i = 0; i < 10; i++) spent += m.update(0.1, 100);
  assert.ok(Math.abs(spent - 10) < 1e-6); assert.ok(m.drain().filter((e) => e.type === 'tick').length >= 4);
  assert.ok(m.interrupt('st_stagger')); const e = m.drain().find((x) => x.type === 'interrupted'); assert.equal(e.refund, 0); assert.ok(m.lock > 0);
});
test('прерывание во время каста возвращает 50 % энергии; урон не наносится', () => {
  const m = new CastingMachine(); m.enterStance(); m.addElement('fire'); m.release('storm', 100); m.update(0.5);
  assert.ok(m.interrupt('st_freeze')); const ev = m.drain(); assert.equal(ev.find((x) => x.type === 'interrupted').refund, 30); assert.ok(!ev.some((x) => x.type === 'fire'));
  assert.equal(m.interrupt('st_burn'), false);
});
test('перекаст: долг ≤ 30, откат HP = долг × 1.5, заряд ≤ 1.0; больше — отказ', () => {
  const m = new CastingMachine(); m.enterStance(); m.addElement('fire'); const r = m.release('bolt', 5, { holdS: 2 });
  assert.ok(r.ok); assert.equal(r.overcast, 10); assert.equal(m.charge, 1); m.update(1); assert.equal(m.drain().find((e) => e.type === 'backlash').hp, 15);
  const n = new CastingMachine(); n.enterStance(); n.addElement('fire'); assert.equal(n.release('storm', 20).reason, 'energy');
});
test('руна слияния: окно 1,2 с, затем руны сбрасываются', () => {
  const m = new CastingMachine(); m.enterStance(); m.addElement('fire'); m.update(1.3); assert.equal(m.elements.length, 0);
  m.addElement('fire'); m.update(0.5); m.addElement('poison'); assert.equal(m.release('nova', 100).id, 'fu_toxic_flame');
});
test('руны-модификаторы не превышают 50 % CAPS даже все сразу', () => {
  const r = runeMods(Object.keys(RUNES)); assert.ok(r.attacker <= CAPS.attackerBonus / 2); assert.ok(r.energyCostReduction <= CAPS.energyCostReduction / 2); assert.ok(r.cooldownReduction <= CAPS.cooldownReduction / 2);
  const p = castParams(SPELLS.sp_fire_bolt, { runes: ['rn_thrift'], extCostRed: 1 }); assert.equal(p.energy, Math.round(15 * (1 - CAPS.energyCostReduction)));
});
test('урон через resolveHit: ранг и уровень — шаг 1; attacker режется по CAPS', () => {
  const p = castParams(SPELLS.sp_fire_bolt, { rank: 3, level: 10 }); assert.ok(Math.abs(p.base - 38 * 1.24 * 1.54) < 1e-9);
  const T = { hp: 1e6, shield: 0, armor: 0, res: {} };
  assert.equal(resolveHit({ base: 38, type: 'fire', attacker: [0.9], target: T }).dmg, 57);
  assert.equal(resolveHit({ base: 45, type: 'arcane', zoneKind: 'aoe', target: { ...T, armor: 0.2 } }).dmg, 41);
});
test('все статусы и стаки — из STATUSES', () => {
  for (const s of [...Object.values(SPELLS), ...Object.values(FUSIONS)]) for (const st of [s.status, s.status2].filter(Boolean)) { assert.ok(STATUSES[st.id], s.id); if (st.stacks) assert.ok(st.stacks <= STATUSES[st.id].maxStacks); }
});
