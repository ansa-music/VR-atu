// tests/progression.test.mjs — прогрессия, инвентарь, аффиксы, лут, крафт, магазин, сейвы (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../js/world/progression.js';
import { Inventory, rng, rollGear, rollMobLoot, rollRarity, tierForIl, SHOP, sellPrice } from '../js/world/inventory.js';
import { createSaveStore, createAutosaver, snapshot, migrate, exportB64, importB64, SAVE_VERSION } from '../js/world/save.js';
import { LEVEL_CURVE } from '../shared/defs/core.js';
import { GEAR_AFFIXES, AFFIX_COUNT_BY_RARITY, POINTS } from '../shared/defs/progression.js';
import { QUESTS } from '../shared/defs/quests.js';
import { RECIPES } from '../shared/defs/crafting.js';
import { ITEMS } from '../shared/defs/items.js';
import { MOBS } from '../shared/defs/enemies.js';

test('кривая XP: L30 ≈ 190 тыс., очки по канону', () => {
  const p = P.createProgression(); let total = 0; for (let L = 1; L < 30; L++) total += LEVEL_CURVE.xpToNext(L);
  assert.ok(total > 150_000 && total < 230_000, 'total ' + total);
  const ups = P.addXp(p, total + 5000); assert.equal(p.level, 30); assert.equal(ups.length, 29);
  assert.equal(p.sp, 1 + 29); assert.equal(p.ap, 58); assert.equal(p.ap, POINTS.attributePoints.total); assert.equal(p.tp, 10);
  assert.equal(p.xp, 0); assert.ok(ups.at(-1).hpMax > 150);
});
test('XP за моба: разница уровней, элита, босс', () => {
  const base = P.xpForKill({ id: 'm_meadow_slime', def: MOBS.m_meadow_slime, lvl: 5 }, 5);
  assert.equal(P.xpForKill({ id: 'm_meadow_slime', def: MOBS.m_meadow_slime, lvl: 5 }, 10), Math.round(base * 0.25));
  assert.equal(P.xpForKill({ id: 'm_meadow_slime', def: MOBS.m_meadow_slime, lvl: 5, elite: true }, 5), base * 4);
  assert.ok(P.xpForKill({ id: 'boss_slime_king', lvl: 6 }, 6) > base * 40);
});
test('ранги навыков: стоимость ОН и уровень', () => {
  const p = P.createProgression(); p.sp = 10; const id = 's_grapple';
  assert.ok(P.rankUpSkill(p, id).ok); assert.equal(P.rankUpSkill(p, id).ok, false, 'r2 требует L3');
  p.level = 22; for (let i = 0; i < 4; i++) assert.ok(P.rankUpSkill(p, id).ok); assert.equal(p.skills[id], 5); assert.equal(p.sp, 10 - 7);
  assert.ok(P.pickTalent(p, id, 'B')); assert.equal(P.rankUpSkill(p, id).ok, false);
});
test('атрибуты, HP и созвездия', () => {
  const p = P.createProgression('guardian'); p.ap = 3; P.spendAttr(p, 'vit'); P.spendAttr(p, 'vit');
  assert.equal(P.maxHp(p), 150 + 8); p.tp = 5;
  assert.equal(P.buyConstellation(p, 'guardian.A.1'), false, 'нужен предыдущий узел');
  assert.ok(P.buyConstellation(p, 'guardian.A.0')); assert.ok(P.buyConstellation(p, 'rogue.B.0')); assert.equal(p.tp, 5 - 1 - 2);
});
test('квест-трекер проходит q_main_01 → q_main_02 и выдаёт награду', () => {
  const p = P.createProgression(), log = P.createQuestLog(); const q = QUESTS.q_main_01;
  assert.equal(P.questEvent(log, { type: 'goto', poi: q.steps[0].poi }), null);
  for (let i = 0; i < q.steps[1].n; i++) P.questEvent(log, { type: 'kill', mob: q.steps[1].mob });
  const done = P.questEvent(log, { type: 'goto', poi: q.steps[2].poi }); assert.equal(done, 'q_main_01'); assert.equal(log.active, 'q_main_02');
  const r = P.applyQuestReward(p, done); assert.equal(r.xp, 100); assert.ok(P.questText(log).title);
  // все сюжетные квесты сцеплены
  let id = 'q_main_01', n = 0; while (id && n < 40) { assert.ok(QUESTS[id], id); id = QUESTS[id].next; n++; } assert.ok(n >= 12);
});
test('аффиксы: число по редкости, слоты, ступень по il, без дублей', () => {
  const r = rng(42);
  for (let i = 0; i < 400; i++) {
    const rar = ['common', 'uncommon', 'rare', 'epic', 'legendary'][i % 5]; const g = rollGear({ il: 1 + (i % 30), rarity: rar, r });
    assert.ok(g.affixes.length <= AFFIX_COUNT_BY_RARITY[rar] && g.affixes.length >= 1, g.slot + rar);
    assert.equal(new Set(g.affixes.map((a) => a.id)).size, g.affixes.length);
    for (const a of g.affixes) { assert.ok(GEAR_AFFIXES[a.id]); assert.equal(a.tier, tierForIl(g.il) + 1); if (a.id === 'af_skill_rank') assert.ok(['epic', 'legendary'].includes(rar)); }
  }
});
test('редкость: профили весов и поиск добычи', () => {
  const r = rng(7), c = {}; for (let i = 0; i < 5000; i++) { const k = rollRarity('boss', r); c[k] = (c[k] || 0) + 1; }
  assert.equal(c.common, undefined); assert.ok(c.legendary > 400 && c.legendary < 1100);
});
test('лут с таблиц мобов и боссов', () => {
  const r = rng(3); let gold = 0, mats = 0;
  for (let i = 0; i < 200; i++) { const l = rollMobLoot({ id: 'm_meadow_slime', def: MOBS.m_meadow_slime, lvl: 2 }, { r }); gold += l.gold; mats += l.items.length; }
  assert.ok(gold > 0 && mats > 0);
  const b = rollMobLoot({ id: 'boss_slime_king' }, { playerL: 6, r }); assert.ok(b.gear.length >= 1); assert.ok(b.items.some(([id]) => id === 'it_uniq_slime_crown'));
  for (const g of b.gear) assert.notEqual(g.rarity, 'common');
});
test('инвентарь: экипировка, кольца, статы, разбор, продажа', () => {
  const inv = new Inventory(), r = rng(9);
  const a = rollGear({ slot: 'ring1', il: 5, rarity: 'rare', r }), b = rollGear({ slot: 'ring2', il: 5, rarity: 'rare', r }), big = rollGear({ slot: 'body', il: 20, rarity: 'epic', r });
  [a, b, big].forEach((g) => inv.addGear(g));
  assert.equal(inv.equip(a.uid, 5).slot, 'ring1'); assert.equal(inv.equip(b.uid, 5).slot, 'ring2'); assert.equal(inv.equip(big.uid, 5).ok, false);
  const s = inv.gearStats(); assert.ok(Object.keys(s).length >= 1);
  assert.equal(inv.salvage(a.uid), false, 'надетое не разбирается'); inv.unequip('ring1'); assert.ok(inv.salvage(a.uid)); assert.ok(inv.count('it_arcane_dust') >= 1);
  const p = sellPrice(big); assert.equal(inv.sell(big.uid), p); assert.equal(inv.gold, p);
  inv.add('it_uniq_slime_crown'); assert.ok(inv.gear.some((g) => g.base === 'it_uniq_slime_crown' && g.rarity === 'legendary'));
});
test('крафт на станции и магазин хаба', () => {
  const inv = new Inventory(); inv.add('it_mat_herb', 2); inv.add('it_mat_slime_gel', 1);
  assert.equal(inv.craft('rc_potion_hp_s', ['stn_workbench']).ok, false);
  assert.ok(inv.craft('rc_potion_hp_s', ['stn_alchemy']).ok); assert.equal(inv.count('it_potion_hp_s'), 1); assert.equal(inv.count('it_mat_herb'), 0);
  for (const rc of Object.values(RECIPES)) for (const [id] of rc.in) assert.ok(ITEMS[id], id);
  inv.gold = 30; const [id, price] = SHOP.stock[0]; assert.ok(inv.buy(id, price)); assert.equal(inv.gold, 30 - price);
  for (const [sid] of SHOP.stock) assert.ok(ITEMS[sid]);
});
test('сейв: снимок, валидация, миграция v1→v2, base64, автосейв вне боя', async () => {
  const mem = new Map(); const backend = { kind: 'memory', get: async (k) => mem.get(k) ?? null, put: async (k, v) => { mem.set(k, v); }, del: async (k) => mem.delete(k), keys: async () => [...mem.keys()] };
  const store = await createSaveStore({ backend }); const p = P.createProgression(); P.addXp(p, 1000); const inv = new Inventory(); inv.gold = 77;
  const snap = snapshot({ progression: p, inventory: inv, questLog: P.createQuestLog(), player: { pos: [1, 2, 3] } });
  assert.equal(snap.v, SAVE_VERSION); await store.save('slot1', snap); const back = await store.load('slot1'); assert.equal(back.progression.level, p.level); assert.equal(back.inventory.gold, 77);
  await assert.rejects(store.save('slot2', { v: 2 }));
  const v1 = { v: 1, player: { pos: [0, 0, 0], level: 4, xp: 10, gold: 5, archetype: 'mystic' }, inventory: [{ id: 'it_wood', n: 3 }], equipped: { skills: ['s_dash'] }, quests: { q_main_01: { state: 'done' }, q_main_02: { state: 'active' } } };
  const m = migrate(structuredClone(v1)); assert.equal(m.v, 2); assert.equal(m.progression.level, 4); assert.equal(m.inventory.stacks.it_wood, 3); assert.equal(m.questLog.active, 'q_main_02');
  assert.deepEqual(importB64(exportB64(snap)).progression, snap.progression);
  let saved = 0; const as = createAutosaver(store, () => snap, { onSaved: () => saved++ });
  await as.tick(130, { inCombat: true }); assert.equal(saved, 0); await as.tick(10); await as.tick(1); assert.equal(saved, 1);
  assert.ok(new Inventory(back.inventory).gold === 77);
});
