import test from 'node:test';
import assert from 'node:assert/strict';
import { POIS, BIOMES, WORLD_CONFIG } from '../shared/defs/index.js';
import { shapeHeight, tintAt, lavaAt, SHAPES, BIOME_PROPS } from '../js/world/biome-terrain.js';
import { FogGrid, newlyDiscovered, travelTargets, canTravel, poiLabel } from '../js/world/discovery.js';
import { FLOORS, floorOf, floorUnlocked, isGateOpen, markBossDefeated, resetZones, computeGates, hazardKind, hazardStep, maxFloor, load, save, zoneState } from '../js/world/zones.js';

const one = (b) => ({ [b]: 1 });
const grid = (fn, step = 24) => { const out = []; for (let x = 0; x < 1536; x += step) for (let z = 0; z < 1536; z += step) out.push(fn(x, z)); return out; };
// грубый Вороной по POI вместо terrain.js (тот тянет three)
const biomeAt = (x, z) => { let b = null, d = Infinity; for (const p of POIS) { const q = Math.hypot(p.pos[0] - x, p.pos[1] - z); if (q < d) { d = q; b = p.biome; } } return b; };

test('6 этажей по порядку уровней, у каждого босс, хаб и арена/данж', () => {
  assert.equal(FLOORS.length, 6); assert.deepEqual(FLOORS.map((f) => f.biome), ['b_meadow', 'b_forest', 'b_swamp', 'b_mountains', 'b_desert_ruins', 'b_volcano']);
  for (const f of FLOORS) { assert.equal(f.boss, BIOMES[f.biome].boss); assert.ok(POIS.find((p) => p.id === f.hub && p.biome === f.biome)); }
  for (let i = 1; i < 6; i++) assert.ok(FLOORS[i].levels[0] > FLOORS[i - 1].levels[0]);
});
test('рельеф: топь с водой, горы высокие со снегом, каньоны, кратер с лавой', () => {
  const sw = grid((x, z) => shapeHeight(x, z, 6, one('b_swamp')));
  const wet = sw.filter((h) => h < WORLD_CONFIG.seaLevel).length / sw.length; assert.ok(wet > 0.08 && wet < 0.7, 'доля воды топи ' + wet);
  assert.ok(Math.max(...sw) < 5);
  const mt = grid((x, z) => shapeHeight(x, z, 75, one('b_mountains'))); assert.ok(Math.max(...mt) > 180 && Math.max(...mt) <= SHAPES.mountains.maxH);
  assert.ok(mt.filter((h) => h > SHAPES.mountains.snowLine).length / mt.length > 0.3);
  const ds = grid((x, z) => shapeHeight(x, z, 40, one('b_desert_ruins')), 8); assert.ok(Math.min(...ds) < 20, 'каньон глубже 20 м');
  const C = SHAPES.volcano.crater, hc = shapeHeight(C.x, C.z, 60, one('b_volcano'));
  assert.ok(hc < SHAPES.volcano.lavaLevel && lavaAt(C.x, C.z, hc)); assert.ok(shapeHeight(C.x + C.r + 5, C.z, 60, one('b_volcano')) > 120, 'кромка кратера');
  assert.equal(shapeHeight(100, 100, 12, one('b_meadow')), 12, 'луг не трогаем');
  const c = { r: 0.2, g: 0.6, b: 0.2 }; tintAt(0, 0, 200, one('b_mountains'), c); assert.ok(c.r > 0.8, 'снег');
  for (const b of Object.keys(BIOMES)) assert.ok(BIOME_PROPS[b]?.length, 'декор ' + b);
});
test('кратер не задевает площадки POI', () => {
  const C = SHAPES.volcano.crater; for (const p of POIS) assert.ok(Math.hypot(p.pos[0] - C.x, p.pos[1] - C.z) > C.r - 5, p.id);
});
test('прогресс этажей: босс открывает следующий этаж и ворота', () => {
  const mem = new Map(), storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  resetZones({ storage }); assert.equal(maxFloor(), 1); assert.equal(floorUnlocked[2], false); assert.equal(isGateOpen('gate_floor_2'), false);
  assert.ok(markBossDefeated('boss_slime_king')); assert.equal(floorUnlocked[2], true); assert.ok(isGateOpen('boss_slime_king')); assert.ok(isGateOpen('gate_floor_2'));
  assert.equal(isGateOpen('gate_floor_3'), false); assert.equal(isGateOpen('gate_ice_bridge'), false); assert.ok(isGateOpen('fgate_1_2')); assert.equal(isGateOpen('fgate_2_3'), false);
  for (const f of FLOORS) markBossDefeated(f.boss); assert.equal(maxFloor(), 6); assert.ok(isGateOpen('gate_ice_bridge'));
  zoneState().fog.reveal(500, 500, 100); save(); resetZones({ storage }); assert.equal(maxFloor(), 1); load(storage); assert.equal(maxFloor(), 6); assert.ok(zoneState().fog.isRevealed(500, 500));
  resetZones({ devFloors: 3 }); assert.equal(maxFloor(), 3);
});
test('ворота стоят на границе соседних этажей', () => {
  const g = computeGates(biomeAt); assert.equal(g.length, 5);
  for (const q of g) { assert.ok(q.x > 0 && q.x < 1536 && q.z > 0 && q.z < 1536); const ahead = biomeAt(q.x + q.dir[0] * 12, q.z + q.dir[1] * 12); assert.equal(floorOf(ahead), q.floor, q.id); }
});
test('опасности: яд в воде топи, холод на высоте, жар у лавы; противоядие/костёр', () => {
  assert.equal(hazardKind(0, 0, { biome: 'b_swamp', h: -0.5, y: -0.5 }), 'poison');
  assert.equal(hazardKind(0, 0, { biome: 'b_mountains', h: 150, y: 151 }), 'cold');
  const C = SHAPES.volcano.crater; assert.equal(hazardKind(C.x + C.r, C.z, { biome: 'b_volcano', h: 33, y: 33 }), 'heat');
  assert.equal(hazardKind(0, 0, { biome: 'b_meadow', h: 10, y: 10 }), null);
  let m = 0, dps = 0; for (let i = 0; i < 110; i++) ({ meter: m, dps } = hazardStep(m, 'poison', 0.1)); assert.equal(m, 100); assert.equal(dps, BIOMES.b_swamp.hazard.dps);
  assert.equal(hazardStep(100, 'poison', 1, { immune: true }).dps, 0); assert.ok(hazardStep(100, 'cold', 1, { nearWarm: true }).meter < 100);
  assert.ok(hazardStep(0, 'cold', 1, { night: true }).meter > hazardStep(0, 'cold', 1).meter);
});
test('открытие локаций, туман войны, телепорт', () => {
  const hub = POIS.find((p) => p.id === 'poi_hub_rootvale'); const found = newlyDiscovered(hub.pos[0], hub.pos[1], new Set()); assert.ok(found.some((p) => p.id === hub.id));
  const l = poiLabel('poi_hub_dawnford'); assert.ok(l.kk && l.ru && l.kk !== l.ru);
  const f = new FogGrid(); assert.ok(f.reveal(768, 768, 100) > 100); const s = f.toString(), f2 = new FogGrid(); f2.load(s); assert.equal(f2.count, f.count);
  const t = travelTargets(new Set(['poi_hub_dawnford', 'poi_tower_meadow', 'poi_old_bunker', 'poi_hub_rootvale']), (b) => b === 'b_meadow');
  assert.deepEqual(t.map((p) => p.id).sort(), ['poi_hub_dawnford', 'poi_tower_meadow']);
  assert.equal(canTravel([{ state: 'chase', g: { position: { x: 5, z: 0 } } }], 0, 0), false); assert.equal(canTravel([{ state: 'idle', g: { position: { x: 5, z: 0 } } }], 0, 0), true);
});
