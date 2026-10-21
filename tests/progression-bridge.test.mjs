import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { CREATURE_MOBS, canonicalMob, createProgressionBridge, MARKET, nearMarket, bossBiomeAt } from '../js/world/progression-bridge.js';
import { BIOMES } from '../shared/defs/world.js';
import { createProgression, createQuestLog, questEvent, addXp, harvestQuestResource, applyQuestReward } from '../js/world/progression.js';
import { Inventory, rollMobLoot } from '../js/world/inventory.js';
import { createSaveStore, createAutosaver, snapshot, exportB64, importB64 } from '../js/world/save.js';
import { POIS } from '../shared/defs/pois.js';
import { BOSSES } from '../shared/defs/enemies.js';
import { QUESTS } from '../shared/defs/quests.js';

test('каждый тип каждого биома соответствует канону; кальдера = Игнарок', () => {
  for (const [biome, types] of Object.entries(CREATURE_MOBS)) for (const [type, id] of Object.entries(types)) {
    assert.ok(type === 'boss' ? BIOMES[biome].boss === id : BIOMES[biome].mobs.includes(id), `${biome}/${type}: ${id}`);
    assert.ok(canonicalMob(type, biome).lvl >= 1);
  }
  assert.equal(canonicalMob('wisp').id, 'm_meadow_slime');
  assert.equal(canonicalMob('boss', 'b_volcano').id, 'boss_ignarok');
  assert.equal(canonicalMob('missing'), null);
});

async function fixture() {
  const pos = { x: 1300, y: 3, z: 1420 }, prog = createProgression(), inv = new Inventory(), quests = createQuestLog();
  const bridge = await createProgressionBridge({ headPos: pos, world: { biome: 'b_meadow', heightAt: () => 7 },
    moveTo(x, y, z) { Object.assign(pos, { x, y, z }); },
    installMenus: async ow => {
      ow.mobs.onKill = m => { questEvent(quests, { type: 'kill', mob: m.id }); addXp(prog, 14); const loot = rollMobLoot(m, { r: () => 0 }); inv.gold += loot.gold; for (const [id, n] of loot.items) inv.add(id, n); };
      return { prog, inv, quests, tick() {} };
    },
  }); return bridge;
}

test('мост использует живую позицию и высоту рельефа, обнаруживает POI', async () => {
  const b = await fixture(); b.update(0.3); assert.ok(b.ow.discovered.has('poi_old_bunker'));
  b.ow.tp(1180, 1300); assert.deepEqual(b.player.pos, { x: 1180, y: 7, z: 1300 });
  b.update(0.3); assert.ok(b.ow.discovered.has('poi_hub_dawnford'));
});

test('три слизня продвигают первый квест; повторное событие не платит; пул переиспользуется', async () => {
  const b = await fixture(); questEvent(b.api.quests, { type: 'goto', poi: 'poi_old_bunker' });
  const enemy = { type: 'wisp' };
  for (let i = 0; i < 3; i++) { b.bindEnemy(enemy); assert.ok(b.killed(enemy)); assert.equal(b.killed(enemy), false); }
  assert.equal(b.api.quests.step, 2); assert.ok(b.api.inv.gold > 0); assert.ok(b.api.inv.count('it_mat_slime_gel') > 0);
  b.bindEnemy(enemy, 'b_desert_ruins'); assert.equal(enemy.worldMob.id, 'm_scarab_swarm');
});

test('зона торговли совпадает с южным базаром', () => {
  assert.ok(nearMarket(MARKET)); assert.ok(nearMarket({ x: 1180, z: 1300 }));
  assert.equal(nearMarket({ x: 1180, z: 1260 }), false);
});

test('сюжетные боссы доступны у своих арен во всех шести биомах', () => {
  for (const b of Object.values(BIOMES)) {
    const p = POIS.find(p => p.id === BOSSES[b.boss].arena.poi);
    assert.equal(bossBiomeAt({ x: p.pos[0], z: p.pos[1] }), BOSSES[b.boss].biome);
  }
  assert.equal(canonicalMob('boss', 'b_meadow').name, 'Мөлдір');
});

test('сейв моста переносит сумку, квест, позицию и открытия через base64', async () => {
  const b = await fixture(), store = await createSaveStore(); b.update(0.3); b.api.inv.gold = 123;
  addXp(b.api.prog, 500); b.api.inv.add('it_potion_hp_s', 2);
  const s = snapshot({ progression: b.api.prog, inventory: b.api.inv, questLog: b.api.quests, player: { pos: Object.values(b.player.pos), hp: 75 }, world: { discovered: [...b.ow.discovered] } });
  await store.save('auto', importB64(exportB64(s))); const loaded = await store.latest();
  assert.equal(loaded.progression.level, b.api.prog.level); assert.equal(loaded.inventory.gold, 123);
  assert.equal(loaded.inventory.stacks.it_potion_hp_s, 2); assert.deepEqual(loaded.questLog, b.api.quests);
  assert.ok(loaded.world.discovered.includes('poi_old_bunker')); assert.equal(loaded.player.hp, 75);
});

test('модули прогрессии подключены только в world и с версией main.js', () => {
  const main = readFileSync(fileURLToPath(new URL('../js/main.js', import.meta.url)), 'utf8');
  assert.match(main, /if \(world\) \{[^]*const bridgeMod = await import\('\.\/world\/progression-bridge\.js' \+ new URL\(import.meta.url\).search\)/);
  assert.ok(!main.includes('js/openworld/main.js'));
});

test('импорт отвергает повреждённые координаты и отрицательный опыт', async () => {
  const b = await fixture();
  const s = snapshot({ progression: b.api.prog, inventory: b.api.inv, player: { pos: [1, 2, 3] } });
  s.player.pos = [1, 2]; assert.throws(() => importB64(exportB64(s)), /player/);
  s.player.pos = [1, 2, 3]; s.progression.xp = -1; assert.throws(() => importB64(exportB64(s)), /progression/);
});

test('level-up после предыдущего автосейва остаётся в очереди до истечения 5 секунд', async () => {
  const calls = []; let level = 1;
  const a = createAutosaver({ save: async (_, s) => calls.push(s) }, () => ({ level }));
  await a.trigger('hub'); level = 2; assert.equal(await a.trigger('levelup'), false);
  await a.tick(4); assert.equal(calls.length, 1);
  await a.tick(1); assert.deepEqual(calls, [{ level: 1 }, { level: 2 }]);
});

test('все 12 сюжетных заданий достижимы: ресурсы биомов собираются один раз на POI и сохраняются', () => {
  const p = createProgression(), log = createQuestLog(), inv = new Inventory();
  for (let guard = 0; log.active && guard < 100; guard++) {
    const q = QUESTS[log.active], step = q.steps[log.step]; let done;
    if (step.type === 'collect') {
      const sites = POIS.filter(poi => poi.biome === q.biome);
      for (const poi of sites) {
        if (harvestQuestResource(p, log, inv, poi)) {
          assert.equal(harvestQuestResource(p, log, inv, poi), null);
          done = questEvent(log, { type: 'collect', item: step.item, have: inv.count(step.item) });
          if (inv.count(step.item) >= step.n) break;
        }
      }
      assert.ok(inv.count(step.item) >= step.n, `${q.title}: ${step.item}`);
    } else for (let i = 0; i < (step.n || 1); i++) {
      done = questEvent(log, { ...step, type: ['puzzle', 'interact', 'photo'].includes(step.type) ? 'interact' : step.type });
    }
    if (done) { const reward = applyQuestReward(p, done); for (const item of reward.items) inv.add(item); }
  }
  assert.equal(log.active, null); assert.equal(log.done.length, 12);
  const restored = importB64(exportB64(snapshot({ progression: p, inventory: inv, questLog: log, player: { pos: [1180, 26, 1300] } })));
  assert.deepEqual(restored.progression.harvested, p.harvested); assert.equal(restored.questLog.done.length, 12);
});
