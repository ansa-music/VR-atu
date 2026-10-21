// tests/input.test.mjs — управление v2: нет конфликтов, все навыки/заклинания достижимы на всех платформах.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as V2 from '../shared/defs/input_v2.js';
import { INPUT_MAP } from '../shared/defs/input-map.js';
import { SKILLS } from '../shared/defs/skills.js';
import { SPELLS, FUSIONS } from '../shared/defs/spells.js';
import { buildRadialTree, allLeaves, pathTo, createRadial, pickSector, paginate } from '../js/world/radial-menu.js';
import { createOnboarding, ONBOARDING_STEPS } from '../js/world/onboarding.js';

const { INPUT_MAP_V2, PLATFORMS, CORE_ACTIONS } = V2;

test('обратная совместимость: все старые ключи INPUT_MAP есть в v2', () => {
  for (const k of Object.keys(INPUT_MAP)) assert.ok(INPUT_MAP_V2[k], `нет ${k}`);
  for (const [k, a] of Object.entries(V2.LEGACY_ALIASES)) assert.ok(INPUT_MAP_V2[a] && !INPUT_MAP_V2[a].alias, `${k}→${a}`);
});
test('ПК: нет конфликтов клавиш среди основных действий', () => {
  const seen = {};
  for (const [a, v] of Object.entries(INPUT_MAP_V2)) { if (v.alias) continue; for (const k of v.pcKeys ?? []) { assert.ok(!seen[k], `${k}: ${seen[k]} и ${a}`); seen[k] = a; } }
  for (const k of Object.values(V2.PC_FALLBACK_BINDS)) assert.ok(!seen[k], `запасной ${k} занят`);
  for (const k of Object.values(V2.ACCESSIBILITY.oneHand.pc.binds)) assert.ok(!seen[k] || ['fire'].includes(seen[k]) || k === 'Mouse2' || k === 'Mouse3', `one-hand ${k}`);
});
test('Arduino: жесты уникальны', () => {
  const seen = {};
  for (const [a, v] of Object.entries(INPUT_MAP_V2)) { if (v.alias || v.arduino === '—' || /^авто/.test(v.arduino) || /стик( до края)?$|до края/.test(v.arduino) && a !== 'move' && a !== 'sprint') continue; assert.ok(!seen[v.arduino], `${v.arduino}: ${seen[v.arduino]} и ${a}`); seen[v.arduino] = a; }
});
test('≤ 6 базовых действий, у каждого бинд на всех платформах', () => {
  assert.ok(CORE_ACTIONS.length <= 6);
  for (const a of CORE_ACTIONS) for (const p of PLATFORMS) assert.ok(INPUT_MAP_V2[a][p] && INPUT_MAP_V2[a][p] !== '—', `${a}/${p}`);
});
test('слоты 1-4 есть на всех платформах', () => {
  for (const s of Object.keys(V2.SKILL_SLOTS)) for (const p of PLATFORMS) assert.notEqual(INPUT_MAP_V2[s][p], '—', `${s}/${p}`);
  for (const p of PLATFORMS) assert.notEqual(INPUT_MAP_V2.radial[p], '—', `radial/${p}`);
});
test('каждый навык и заклинание достижим через радиал (значит — на всех платформах)', () => {
  const tree = buildRadialTree({ skills: SKILLS, spells: SPELLS, fusions: FUSIONS });
  const need = [...Object.values(SKILLS).filter((s) => s.type !== 'passive').map((s) => s.id), ...Object.keys(SPELLS), ...Object.keys(FUSIONS)];
  const leaves = new Set(allLeaves(tree).map((l) => l.id));
  for (const id of need) { assert.ok(leaves.has(id), id); assert.ok(pathTo(tree, id), `путь ${id}`); }
  const walk = (n) => { assert.ok(n.children.length <= 8, n.id); n.children.forEach((c) => c.kind === 'page' && walk(c)); }; walk(tree);
});
test('радиал: проход по пути выбирает нужный лист', () => {
  const tree = buildRadialTree({ skills: SKILLS, spells: SPELLS, fusions: FUSIONS });
  for (const id of ['s_fireball', 'sp_wind_ward', 'fu_void_bloom']) {
    const r = createRadial(tree); r.open('slot3'); let res;
    for (const i of pathTo(tree, id)) { const n = r.items.length, a = (i * 2 * Math.PI) / n; r.move(Math.sin(a), Math.cos(a)); res = r.confirm(); }
    assert.equal(res.picked, id); assert.equal(res.assignSlot, 'slot3');
  }
  const r = createRadial(tree); r.open(); r.move(0, 0); assert.ok(r.confirm().cancel);
  assert.equal(pickSector(0, 1, 8), 0); assert.equal(pickSector(1, 0, 8), 2); assert.equal(pickSector(0.1, 0.1, 8), null);
  assert.equal(paginate([...Array(20).keys()].map((i) => ({ id: i }))).length, 8);
});
test('стартовые наборы корректны и все навыки имеют однострочник', () => {
  for (const [arch, L] of Object.entries(V2.STARTER_LOADOUTS)) {
    for (const k of ['dash', 'slot1', 'slot2', 'slot4', 'passive']) { assert.ok(SKILLS[L[k]], `${arch}.${k}`); assert.equal(SKILLS[L[k]].archetype, arch); }
    assert.equal(SKILLS[L.slot4].type, 'ultimate'); assert.equal(SKILLS[L.passive].type, 'passive'); assert.equal(SKILLS[L.dash].type, 'movement');
    assert.ok(SPELLS[L.slot3] && SPELLS[L.slot3].unlock.level === 1, `${arch}.slot3 доступен с L1`);
  }
  for (const id of Object.keys(SKILLS)) { assert.ok(V2.SKILL_UI[id]?.line, id); assert.ok(V2.SKILL_UI[id].line.length <= 70, id); }
});
test('autoEquip, rebind, откат', () => {
  let r = V2.autoEquip({ slot1: 's_barrier' }, 's_fireball', SKILLS); assert.equal(r.slot, 'slot2');
  r = V2.autoEquip({ slot1: 'a', slot2: 'b', slot3: 'c' }, 's_scan', SKILLS); assert.ok(r.toRadial);
  assert.equal(V2.autoEquip({}, 's_ki_wave', SKILLS).slot, 'slot4');
  const b = V2.defaultPcBinds(); assert.equal(V2.rebind(b, 'slot1', 'E').reason, 'conflict'); assert.ok(V2.rebind(b, 'slot1', 'H').ok);
  assert.equal(V2.cooldownLabel(7.2), '8'); assert.equal(V2.cooldownLabel(2.34), '2.3'); assert.equal(V2.cooldownLabel(0), '');
});
test('обучение: 6 базовых шагов, проход по событиям', () => {
  const core = ONBOARDING_STEPS.filter((s) => !s.optional && s.action);
  for (const a of CORE_ACTIONS) assert.ok(core.some((s) => s.action === a) || a === 'move', a);
  const ob = createOnboarding({ platform: 'phone', skipOptional: true });
  for (const s of ONBOARDING_STEPS.filter((x) => !x.optional)) { assert.equal(ob.step.id, s.id); assert.ok(ob.prompt().key !== undefined); ob.event(s.done, s.count, { archetype: 'mystic' }); }
  assert.ok(ob.state.finished && ob.coreDone()); assert.equal(ob.state.archetype, 'mystic');
});
