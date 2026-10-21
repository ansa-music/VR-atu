// tests/buildings.test.mjs — I: здания/поселения/врата этажей (чистая часть, без three).
import test from 'node:test';
import assert from 'node:assert/strict';
import { POIS, BOSSES, BIOMES } from '../shared/defs/index.js';
import * as K from '../js/world/buildings.js';
import { FLOORS, BUILD_BUDGET, layoutPoi, planFloors, buildWorldLayout, ColliderGrid, FloorLock, platformHeight } from '../js/world/settlements.js';

const hAt = (x, z) => 10 + Math.sin(x * 0.01) * 4 + Math.cos(z * 0.013) * 3;
const hubs = POIS.filter((p) => p.type === 'hub');
const biomeAt = (x, z) => { let b = null, d = 1e9; for (const h of hubs) { const q = Math.hypot(h.pos[0] - x, h.pos[1] - z); if (q < d) { d = q; b = h.biome; } } return b; };
const world = buildWorldLayout({ heightAt: hAt, biomeAt, waterAt: () => false });

test('6 этажей по биомам, у каждого хаб и босс', () => {
  assert.equal(FLOORS.length, Object.keys(BIOMES).length);
  for (const f of FLOORS) { assert.ok(f.hub, f.biome); assert.ok(BOSSES[f.boss], f.biome); }
});
test('каждый POI получает постройку с деталями; детерминированно', () => {
  for (const p of POIS) { const b = layoutPoi(p, hAt); assert.ok(b.parts.length > 0, p.id + ' ' + p.type); }
  const a = layoutPoi(POIS[0], hAt), b = layoutPoi(POIS[0], hAt); assert.deepEqual(a.parts, b.parts);
});
test('бюджет треугольников Quest: на POI и всего', () => {
  let tot = 0; for (const s of world.sites) { assert.ok(s.tris[0] <= BUILD_BUDGET.trisNearPerPoi, `${s.poi} near ${s.tris[0]}`); assert.ok(s.tris[1] <= BUILD_BUDGET.trisFarPerPoi, `${s.poi} far ${s.tris[1]}`); tot += s.tris[0]; }
  assert.ok(tot <= BUILD_BUDGET.trisNearTotal, 'total ' + tot);
});
test('у всех хабов стена с 2 воротами и центр (r<8) свободен для алтаря/спавна', () => {
  for (const h of hubs) { const b = layoutPoi(h, hAt); for (const c of b.colliders) { const d = Math.hypot(c[0] - h.pos[0], c[2] - h.pos[1]); assert.ok(d - 0.3 * c[3] > 8, `${h.id} коллайдер в центре d=${d.toFixed(1)}`); }
    assert.ok(b.colliders.filter((c) => c[4] === 'wall').length > 40); }
});
test('проход ворот хаба свободен (юг/север)', () => {
  for (const h of hubs) { const b = layoutPoi(h, hAt), WR = Math.max(26, h.r), g = new ColliderGrid(); b.colliders.forEach((c) => g.add(c));
    for (const s of [1, -1]) { const x = h.pos[0], z = h.pos[1] + s * WR; const blocked = g.near(x, z).some((c) => Math.hypot(c[0] - x, c[2] - z) < 0.3 * c[3] + 0.3); assert.ok(!blocked, h.id + ' gate ' + s); } }
});
test('врата этажей: 5 штук, между соседними этажами, требуют босса предыдущего', () => {
  const gs = planFloors(biomeAt); assert.equal(gs.length, FLOORS.length - 1);
  gs.forEach((g, i) => { assert.equal(g.bossId, FLOORS[i].boss); assert.equal(g.to, FLOORS[i + 1].biome); assert.ok(Number.isFinite(g.x) && Number.isFinite(g.z)); });
});
test('FloorLock: SAO-прогрессия и isGateOpen(bossId)', () => {
  const L = new FloorLock(); assert.equal(L.maxFloor(), 1); assert.ok(L.canEnter('b_meadow')); assert.ok(!L.canEnter('b_forest'));
  assert.ok(!L.isGateOpen('boss_slime_king')); L.defeat('boss_slime_king'); assert.ok(L.isGateOpen('boss_slime_king')); assert.ok(L.isGateOpen('fgate_1_2')); assert.equal(L.maxFloor(), 2);
  L.defeat('boss_hydra_tinara'); assert.equal(L.maxFloor(), 2, 'босс через этаж не открывает'); L.defeat('boss_rotroot'); assert.equal(L.maxFloor(), 4);
});
test('печать врат блокирует до победы, потом пропускает', () => {
  const s = world.sites.find((x) => x.type === 'floor_gate'), g = new ColliderGrid(); s.colliders.forEach((c) => g.add(c));
  const seal = s.colliders.find((c) => c[4]?.startsWith('seal:')); assert.ok(seal);
  const L = new FloorLock(); const has = () => g.near(seal[0], seal[2], (id) => L.isGateOpen(id)).includes(seal);
  assert.ok(has()); L.defeat(s.gate.bossId); assert.ok(!has());
});
test('башня: платформа наверху, лифт вверх/вниз и быстрое перемещение', () => {
  for (const t of POIS.filter((p) => p.type === 'tower')) { const b = layoutPoi(t, hAt); const kinds = b.triggers.map((x) => x.kind);
    for (const k of ['lift_up', 'lift_down', 'fast_travel']) assert.ok(kinds.includes(k), t.id + k);
    const top = b.platforms.find((p) => p.tag === 'tower_top'); assert.ok(top.y > b.y0 + 20);
    assert.equal(platformHeight(b.platforms, top.x, top.z, top.y, b.y0), top.y); assert.equal(platformHeight(b.platforms, top.x, top.z, b.y0, b.y0), b.y0, 'с земли не телепортирует на крышу'); }
});
test('подземелья и пещеры имеют вход-триггер, арены боссов отмечены', () => {
  for (const p of POIS.filter((q) => q.type === 'dungeon' || q.type === 'cave')) assert.ok(layoutPoi(p, hAt).triggers.some((t) => t.kind === 'dungeon_enter'), p.id);
  const arenas = world.sites.flatMap((s) => s.triggers.filter((t) => t.kind === 'boss_arena')).map((t) => t.bossId).sort();
  assert.deepEqual(arenas, Object.keys(BOSSES).sort());
});
test('лагерь врагов: частокол с проходами, коллайдеры', () => {
  for (const c of POIS.filter((p) => p.type === 'camp')) { const b = layoutPoi(c, hAt); assert.ok(b.colliders.filter((x) => x[4] === 'palisade').length > 15); assert.ok(b.triggers.some((t) => t.kind === 'camp')); }
});
test('ColliderGrid: находит коллайдер через границу ячейки', () => { const g = new ColliderGrid(16); g.add([15.8, 0, 5, 10]); assert.equal(g.near(16.5, 5).length, 1); assert.equal(g.near(40, 40).length, 0); });
test('палитра и triEstimate', () => { assert.equal(K.triEstimate({ k: 'cyl', a: [1, 1, 1, 12] }), 48); assert.ok(/^#/.test(K.KZ_PAL.felt)); });
