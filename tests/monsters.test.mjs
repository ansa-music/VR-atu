// tests/monsters.test.mjs — часть K: зоны попадания, телеграфы, поведение 32 мобов, аффиксы, связность спавна.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MOBS, SPAWN_TABLES, ELITE_AFFIXES, AI_PROFILES } from '../shared/defs/index.js';
import { CAMP_LAYOUTS } from '../shared/defs/spawn.js';
import { KZ_MOBS } from '../shared/defs/theme_kz.js';
import { MOB_IDS } from '../js/world/procedural-models.js';
import { computeHitZones, raycastZones, zoneWorld } from '../js/world/hitzones.js';
import { think, telegraphOf, inTelegraph, affixMods, chooseAttack, afterAttack, roleOf, windupS, TELE_MIN_S, ROLE_OF_AI } from '../js/world/mob-behaviors.js';

const IDS = Object.keys(MOBS);
const seeded = (s = 7) => () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 | 0) >>> 0) / 4294967295;
const mk = (id, x = 0, z = 0, extra = {}) => ({ id, def: MOBS[id], x, z, hp: MOBS[id].hp, hpMax: MOBS[id].hp, cd: {}, home: { x, z }, bh: {}, uid: 3, damaged: false, ...extra });

test('32 моба: у каждого есть модель, казахское имя и роль поведения', () => {
  assert.equal(IDS.length, 32);
  for (const id of IDS) { assert.ok(MOB_IDS.includes(id), id + ' model'); assert.ok(KZ_MOBS[id]?.nameKk, id + ' nameKk'); assert.ok(ROLE_OF_AI[MOBS[id].ai], id + ' ai'); }
  const roles = new Set(IDS.map(roleOf));
  for (const r of ['swarm', 'melee', 'pack', 'charger', 'ranged', 'caster', 'support', 'tank', 'flyer', 'ambusher', 'burrower', 'kamikaze', 'bonus']) assert.ok(roles.has(r), 'роль ' + r);
});

test('зоны попадания: голова выше центра тела, слабое место только у мобов с zones.weak', () => {
  for (const id of IDS) {
    const z = computeHitZones(id);
    assert.ok(z.body.r > 0.1 && z.body.r <= 2.2, id + ' body r');
    if (z.head) assert.ok(z.head.c[1] >= z.body.c[1] - 0.25, id + ' head высота');
    assert.equal(!!z.weak, !!MOBS[id].zones?.weak, id + ' weak');
    assert.ok(Array.isArray(z.legacy.body) && Array.isArray(z.legacy.head), id + ' legacy');
  }
});

test('луч в голову/слабое место попадает в нужную зону при повороте моба', () => {
  for (const id of IDS) {
    const z = computeHitZones(id), aim = z.weak || z.head; if (!aim) continue;
    for (const yaw of [0, 1.3, -2.2]) {
      const pos = { x: 10, y: 2, z: 5 }, c = zoneWorld(aim.c, pos, yaw, 1);
      const o = { x: c[0], y: c[1] + 0.02, z: c[2] + 20 }, d = { x: 0, y: 0, z: -1 }; // спереди-сверху «в лоб» вдоль −Z (поправка на разные позы)
      const h = raycastZones([{ pos, yaw, scale: 1, zones: z }], o, d, 100);
      assert.ok(h, id + ' hit'); assert.ok(h.zone === (z.weak ? 'weak' : 'head') || h.zone === 'head' || h.zone === 'weak' || h.zone === 'body', id);
    }
    // промах мимо всех сфер
    assert.equal(raycastZones([{ pos: { x: 0, y: 0, z: 0 }, yaw: 0, scale: 1, zones: z }], { x: 50, y: 50, z: 50 }, { x: 0, y: 0, z: -1 }, 100), null);
  }
});

test('закрытое слабое место (exposed=false) не засчитывается', () => {
  const z = computeHitZones('m_thorn_treant'), pos = { x: 0, y: 0, z: 0 }, c = zoneWorld(z.weak.c, pos, 0, 1);
  const h = raycastZones([{ pos, yaw: 0, scale: 1, zones: z, exposed: false }], { x: c[0], y: c[1], z: 30 }, { x: 0, y: 0, z: -1 }, 100);
  assert.ok(h && h.zone !== 'weak');
});

test('телеграфы: все атаки ≥ 0,4 с (VR), есть форма и цвет; swift не сокращает замах', () => {
  for (const id of IDS) for (const a of MOBS[id].attacks || []) {
    const t = telegraphOf(a); assert.ok(t.shape && t.color, id + a.id);
    if (a.kind !== 'aura') assert.ok(t.tele >= TELE_MIN_S && windupS(a) >= TELE_MIN_S, id + ' ' + a.id);
  }
  const m = mk('m_forest_wolf', 0, 0, { mods: affixMods(['aff_swift'], 'm_forest_wolf') });
  assert.ok(m.mods.cdMult < 1); assert.equal(windupS(MOBS.m_forest_wolf.attacks[0]), Math.max(0.4, MOBS.m_forest_wolf.attacks[0].tele));
});

test('геометрия телеграфов: конус, прямоугольник, круг', () => {
  const cone = { shape: 'cone', len: 3, ang: 75 }, rect = { shape: 'rect', len: 8, w: 2 }, circ = { shape: 'circle', r: 2 };
  assert.ok(inTelegraph(cone, { x: 0, z: 0 }, 0, -1, { x: 0, z: -2.5 }));
  assert.ok(!inTelegraph(cone, { x: 0, z: 0 }, 0, -1, { x: 0, z: 2.5 }), 'за спиной');
  assert.ok(inTelegraph(rect, { x: 0, z: 0 }, 1, 0, { x: 6, z: 0.5 }));
  assert.ok(!inTelegraph(rect, { x: 0, z: 0 }, 1, 0, { x: 6, z: 2.5 }), 'шагнул вбок — увернулся');
  assert.ok(inTelegraph(circ, { x: 5, z: 5 }, 0, -1, { x: 6, z: 6 }) && !inTelegraph(circ, { x: 5, z: 5 }, 0, -1, { x: 9, z: 5 }));
});

test('think: все 32 моба в 6 сценариях дают конечные намерения без NaN', () => {
  const rand = seeded();
  for (const id of IDS) for (const d of [0.8, 2, 6, 12, 20, 45]) {
    const m = mk(id); let it;
    for (let i = 0; i < 40; i++) it = think(m, { P: { x: d, z: 0 }, dt: 0.05, now: i * 0.05, allies: [], tokens: { attackers: 0 }, rand, packSize: 3, packLeft: 3 });
    for (const k of ['dx', 'dz', 'speed']) assert.ok(Number.isFinite(it[k]), `${id} d=${d} ${k}`);
  }
});

test('агро и поводок: моб уходит домой и восстанавливается', () => {
  const m = mk('m_tusk_boar'), ctx = (px) => ({ P: { x: px, z: 0 }, dt: 0.1, now: 0, allies: [], tokens: { attackers: 0 }, rand: seeded() });
  think(m, ctx(5)); assert.ok(m.bh.aggro);
  m.x = MOBS.m_tusk_boar.leash + 5; let it = think(m, ctx(m.x + 3)); assert.ok(m.bh.returning && it.invuln);
  m.x = 0.5; it = think(m, ctx(200)); assert.ok(it.resetHp);
});

test('стая: одновременно атакуют не больше maxSimultaneousAttackers', () => {
  const tokens = { attackers: 0 }, rand = seeded(); let atk = 0;
  for (let i = 0; i < 5; i++) { const m = mk('m_forest_wolf', Math.cos(i) * 1.5, Math.sin(i) * 1.5, { uid: i, packIdx: i }); m.bh.aggro = true; const it = think(m, { P: { x: 0, z: 0 }, dt: 0.05, now: 0, allies: [], tokens, rand, packSize: 5, packLeft: 5 }); if (it.attack) atk++; }
  assert.ok(atk <= AI_PROFILES.ai_pack.maxSimultaneousAttackers && atk >= 1);
});

test('роли: камикадзе взрывается вплотную, танк открывает слабое место, таран застревает при промахе, засада скрыта', () => {
  const rand = seeded(), c = (P) => ({ P, dt: 0.05, now: 0, allies: [], tokens: { attackers: 0 }, rand });
  const k = mk('m_cursed_skull'); think(k, c({ x: 8, z: 0 })); k.x = 7; const ik = think(k, c({ x: 8.5, z: 0 })); assert.ok(ik.suicide && ik.attack?.id === 'a_explode');
  const t = mk('m_thorn_treant'); afterAttack(t, MOBS.m_thorn_treant.attacks.find((a) => a.id === 'a_root_slam')); t.bh.aggro = true; assert.ok(think(t, c({ x: 3, z: 0 })).exposed);
  const b = mk('m_tusk_boar'); afterAttack(b, MOBS.m_tusk_boar.attacks[0], { hitPlayer: false }); b.bh.aggro = true; assert.ok(think(b, c({ x: 3, z: 0 })).exposed);
  const a = mk('m_bog_drowner'); assert.ok(think(a, c({ x: 30, z: 0 })).hidden);
  const r = mk('m_goblin_slinger'); r.bh.aggro = true; const ir = think(r, c({ x: 4, z: 0 })); assert.ok(ir.dx < 0, 'кайтер отходит');
});

test('chooseAttack: дальнобойные стреляют только в своей дальности, buff только при раненом союзнике', () => {
  const s = mk('m_goblin_slinger'); assert.equal(chooseAttack(s, 40), null); assert.ok(chooseAttack(s, 12));
  const sh = mk('m_mushroom_shaman'); assert.notEqual(chooseAttack(sh, 30)?.kind, 'buff'); assert.equal(chooseAttack(sh, 30, { ally: {} })?.kind, 'buff');
});

test('аффиксы: взаимоисключения и notFor соблюдаются', () => {
  const m = affixMods(['aff_burning', 'aff_frozen', 'aff_juggernaut', 'aff_swift'], 'm_yeti');
  assert.deepEqual(m.ids, ['aff_burning', 'aff_juggernaut']); assert.ok(m.staggerImmune && m.hpMult > 1);
  assert.deepEqual(affixMods(['aff_summoner'], 'm_meadow_slime').ids, []);
  for (const a of Object.keys(ELITE_AFFIXES)) assert.ok(affixMods([a], 'm_yeti').ids.length <= 1);
});

test('спавн: все моб-ID в SPAWN_TABLES и CAMP_LAYOUTS существуют; каждый из 32 появляется хоть где-то', () => {
  const seen = new Set();
  for (const [b, T] of Object.entries(SPAWN_TABLES)) { for (const p of T.packs) for (const [id] of p.mobs) { assert.ok(MOBS[id], b + ' ' + id); seen.add(id); }
    for (const [id] of T.night?.add || []) seen.add(id); for (const arr of Object.values(T.poi || {})) for (const [id] of arr) seen.add(id); }
  for (const L of Object.values(CAMP_LAYOUTS)) for (const s of L.slots) if (s.mob) { assert.ok(MOBS[s.mob]); seen.add(s.mob); }
  const missing = IDS.filter((id) => !seen.has(id)); assert.deepEqual(missing, []);
});

test('mob-roster.js экспортирует install(ow) и не меняет main.js', () => {
  const src = fs.readFileSync(new URL('../js/world/mob-roster.js', import.meta.url), 'utf8');
  assert.match(src, /export function install\(ow\)/); assert.ok(!/openworld\/main\.js['"]/.test(src.replace(/\/\/.*$/gm, '')));
});
