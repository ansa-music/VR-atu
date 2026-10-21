import test from 'node:test';
import assert from 'node:assert/strict';
import { SPAWN_TABLES, PERF_CAPS, WORLD_CONFIG, POIS, MOBS } from '../shared/defs/index.js';
import { PLAYER_SPAWN, SPAWN_RULES, CAMP_LAYOUTS } from '../shared/defs/spawn.js';
import { generateChunkPoints, generateNodePoints, poissonDisk, rng, findSafeSpawn } from '../js/world/spawn-points.js';
import { SpawnDirector, inView, chooseRespawnAnchor, deathPenalty, lerpCurve, levelDensityMul } from '../js/world/spawn-director.js';

const flat = { heightAt: () => 10, biomeAt: (x, z) => (x < 768 ? 'b_forest' : 'b_meadow'), waterAt: () => false };
const player = { x: 1000, z: 1000, yaw: 0 };

test('точки чанка детерминированы и соблюдают Poisson-дистанцию', () => {
  const a = generateChunkPoints(5, 7, flat), b = generateChunkPoints(5, 7, flat);
  assert.deepEqual(a, b); assert.ok(a.length > 0 && a.length <= SPAWN_RULES.points.maxPerChunk);
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++)
    assert.ok(Math.hypot(a[i].x - a[j].x, a[i].z - a[j].z) >= SPAWN_RULES.points.poissonMinDist - 1e-9);
  assert.notDeepEqual(a, generateChunkPoints(5, 8, flat));
});
test('крутой склон и безопасная зона хаба отсекаются', () => {
  const steep = { ...flat, heightAt: (x) => x * 2 };
  assert.equal(generateChunkPoints(5, 7, steep).length, 0);
  const hub = POIS.find((p) => p.id === 'poi_hub_dawnford');
  const pts = generateChunkPoints(Math.floor(hub.pos[0] / 64), Math.floor(hub.pos[1] / 64), flat);
  for (const p of pts) assert.ok(Math.hypot(p.x - hub.pos[0], p.z - hub.pos[1]) >= hub.r + 25);
});
test('poissonDisk внутри квадрата', () => {
  for (const [x, z] of poissonDisk(rng(1), 0, 0, 64, 10)) assert.ok(x >= 0 && z >= 0 && x < 64 && z < 64);
});
test('ресурсы и сундуки только из ресурсов биома, детерминированы', () => {
  let chests = 0, n = 0;
  for (let cx = 0; cx < 24; cx++) for (let cz = 0; cz < 24; cz++) {
    const nodes = generateNodePoints(cx, cz, flat); n += nodes.length;
    for (const nd of nodes) if (nd.chest) chests++; else assert.ok(['b_forest', 'b_meadow'].some((b) => nd.id && flat.biomeAt(cx * 64 + 32, 0) === b));
  }
  assert.deepEqual(generateNodePoints(3, 3, flat), generateNodePoints(3, 3, flat));
  assert.ok(chests > 150 && chests < 300, 'сундуков ≈220: ' + chests); assert.ok(n > 500);
});
test('безопасный спавн уходит от моба и воды', () => {
  const t = { ...flat, waterAt: (x, z) => Math.hypot(x - 100, z - 100) < 3 };
  const s = findSafeSpawn([100, 100], t, [{ x: 100, z: 100 }], PLAYER_SPAWN);
  assert.ok(s.ring !== 0);
  const s2 = findSafeSpawn([100, 100], t, [], PLAYER_SPAWN); assert.ok(Math.hypot(s2.x - 100, s2.z - 100) >= 3);
  const none = findSafeSpawn([100, 100], t, [{ x: 100, z: 100 }, { x: 100, z: 100 }].map((m) => m), { ...PLAYER_SPAWN, safe: { ...PLAYER_SPAWN.safe, noHostileRadius: 1000 } });
  assert.equal(none.ring, -1);
});
test('конус взгляда: впереди видно, сзади нет', () => {
  assert.equal(inView(player, { x: 1000, z: 960 }), true);
  assert.equal(inView(player, { x: 1000, z: 1040 }), false);
  assert.equal(inView(player, { x: 1000, z: 960 }, () => false), false);
});
test('директор никогда не спавнит в поле зрения и ближе 30 м', () => {
  const d = new SpawnDirector({ quality: 'quest', seed: 7 });
  const pts = []; for (let a = 0; a < 36; a++) for (const r of [10, 35, 60]) pts.push({ x: 1000 + Math.sin(a * 0.1745) * r, z: 1000 - Math.cos(a * 0.1745) * r });
  for (let i = 0; i < 200; i++) {
    d.tick(10); const req = d.requestPack({ biome: 'b_meadow', points: pts, player });
    if (req?.kind === 'pack') {
      assert.ok(Math.hypot(req.pos.x - 1000, req.pos.z - 1000) >= 30);
      assert.equal(inView(player, req.pos), false);
      for (const m of req.mobs) d.release(m.uid);
    }
  }
});
test('бюджет слотов PERF_CAPS не превышается', () => {
  for (const q of Object.keys(WORLD_CONFIG.quality)) {
    const d = new SpawnDirector({ quality: q, seed: 3 }); const pts = [{ x: 1000, z: 1060 }];
    for (let i = 0; i < 100; i++) { d.tick(20); d.requestPack({ biome: 'b_desert_ruins', points: pts, player, night: true, bloodMoon: true }); assert.ok(d.slotsUsed <= PERF_CAPS[q].activeMobs + 1e-9); }
    assert.ok(d.slotsUsed > PERF_CAPS[q].activeMobs * 0.6);
  }
});
test('напряжение: отдых выше 60 и спад 1/с', () => {
  const d = new SpawnDirector(); d.onDamageTaken(700); assert.equal(d.phase, 'relax'); assert.equal(d.paceMul(), 0);
  d.tick(50); assert.notEqual(d.phase, 'relax'); assert.ok(d.tension <= 20 + 1e-9);
  assert.equal(lerpCurve(SPAWN_RULES.tension.paceCurve, 20), 1);
  const e = new SpawnDirector({ difficulty: 'easy' }); e.onDamageTaken(500); assert.equal(e.phase, 'relax');
});
test('элиты: только при низком напряжении, не больше maxAlive, аффиксы по уровню', () => {
  const d = new SpawnDirector(); assert.ok(d.eliteChance('b_volcano') > 0);
  d.tension = 30; assert.equal(d.eliteChance('b_volcano'), 0);
  assert.equal(d.affixCount(5), 1); assert.equal(d.affixCount(12), 2); assert.equal(d.affixCount(25), 3);
  assert.equal(new Set(d.rollAffixes(3)).size, 3);
});
test('респаун чанка: таймер таблицы И дистанция > 120 м', () => {
  const d = new SpawnDirector(); d.markChunkCleared('3,3', 'b_meadow');
  d.tick(SPAWN_TABLES.b_meadow.respawn - 1); assert.equal(d.chunkReady('3,3', 500), false);
  d.tick(SPAWN_RULES.respawn.jitterS + 2); assert.equal(d.chunkReady('3,3', 50), false); assert.equal(d.chunkReady('3,3', 200), true);
});
test('leash по MOBS и despawn вне зоны', () => {
  const d = new SpawnDirector({ seed: 11 }); let req;
  for (let i = 0; i < 50 && req?.kind !== 'pack'; i++) { d.tick(10); req = d.requestPack({ biome: 'b_forest', points: [{ x: 1000, z: 1050 }], player }); }
  const m = req.mobs.find((x) => !x.elite) ?? req.mobs[0];
  assert.equal(d.shouldLeash(m.uid, { x: 1000, z: 1050 + MOBS[m.id].leash + 1 }), true);
  if (!m.elite) { assert.equal(d.shouldDespawn(m.uid, { distToPlayer: 500, outOfViewS: 30 }), true); assert.equal(d.shouldDespawn(m.uid, { distToPlayer: 500, outOfViewS: 30, damaged: true }), false); }
});
test('засада только в фазе build и с кулдауном', () => {
  const d = new SpawnDirector(); const a = d.requestAmbush('b_forest', player); assert.ok(a && a.groups.length >= 1);
  assert.equal(d.requestAmbush('b_forest', player), null);
  d.tick(91); d.tension = 50; assert.equal(d.requestAmbush('b_forest', player), null);
});
test('события: раз в 90 с, не больше 1 одновременно', () => {
  const d = new SpawnDirector({ seed: 2 }); let got = 0;
  for (let i = 0; i < 100; i++) { d.tick(90); const e = d.rollEvent('b_swamp'); if (e) { got++; assert.ok(SPAWN_RULES.events.pool.b_swamp.includes(e.id)); assert.equal(d.rollEvent('b_swamp'), null); d.endEvent(); } }
  assert.ok(got > 15 && got < 60);
});
test('арена босса блокирует спавн мира', () => {
  const d = new SpawnDirector(); d.enterBossArena(1000, 1060, 22);
  assert.equal(d.choosePoint([{ x: 1000, z: 1060 }], player), null);
});
test('возрождение у ближайшего открытого якоря, иначе стартовый хаб; штраф 10 % золота', () => {
  assert.equal(chooseRespawnAnchor({ x: 400, z: 600 }, new Set(), 'b_forest').id, 'poi_hub_dawnford');
  assert.equal(chooseRespawnAnchor({ x: 450, z: 560 }, new Set(['poi_wisp_shrine', 'poi_hub_rootvale', 'poi_hub_dawnford']), 'b_forest').id, 'poi_wisp_shrine');
  assert.deepEqual([deathPenalty(1000).keep, deathPenalty(1000).grave], [900, 100]);
});
test('плотность по уровню и раскладки лагерей в радиусе', () => {
  assert.equal(levelDensityMul(10, 10), 1); assert.ok(levelDensityMul(1, 20) < 1); assert.ok(levelDensityMul(20, 10) < 1);
  for (const c of Object.values(CAMP_LAYOUTS)) for (const s of c.slots) assert.ok(Math.hypot(...s.at) <= c.r);
});
test('валидатор ID спавна без ошибок', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const out = execFileSync(process.execPath, [fileURLToPath(new URL('../tools/validate-spawn.mjs', import.meta.url))]).toString();
  assert.match(out, /errors: 0/);
});
