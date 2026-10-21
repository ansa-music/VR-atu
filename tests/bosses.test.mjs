// tests/bosses.test.mjs — логика боссов и событий без браузера.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOSSES, WORLD_EVENTS, MOBS, POIS } from '../shared/defs/index.js';
import { BossFight, BossRegistry, FLOORS, PHASE_SCRIPTS, computeRewards, nextFloor, RULES } from '../js/world/bosses.js';
import { EventScheduler, roamDef, SCHED } from '../js/world/world-events.js';
import { KZ_BOSSES } from '../shared/defs/theme_kz.js';

const seq = (v = 0.42) => () => v;
const run = (f, s, p = { x: f.center.x, z: f.center.z + 3 }) => { for (let t = 0; t < s; t += 0.1) f.update(0.1, p); };

test('6 этажей = 6 боссов, у каждого арена-POI и kz-имя', () => {
  assert.equal(FLOORS.length, 6); for (const f of FLOORS) { const b = BOSSES[f.boss]; assert.ok(b); assert.equal(b.biome, f.biome); assert.ok(POIS.find((p) => p.id === b.arena.poi)); assert.ok(KZ_BOSSES[f.boss]?.nameKk); }
  for (const id of ['boss_roam_headless', 'boss_roam_sandworm']) assert.ok(KZ_BOSSES[id]);
});
test('скрипты фаз ссылаются только на существующие мобы и атаки', () => {
  for (const [id, ph] of Object.entries(PHASE_SCRIPTS)) for (const [i, sc] of Object.entries(ph)) {
    assert.ok(BOSSES[id].phases[i], `${id} фаза ${i}`);
    for (const [m] of [...(sc.adds || []), ...(sc.onEnter || [])]) assert.ok(MOBS[m], m);
    for (const [a, list] of Object.entries(sc.summonOn || {})) { assert.ok(BOSSES[id].phases.some((p) => p.attacks.some((x) => x.id === a)), a); for (const [m] of list) assert.ok(MOBS[m], m); } }
});
test('все боссы: телеграф → удар, фазы по порогам, смерть', () => {
  for (const { boss } of FLOORS) {
    const f = new BossFight(boss, { rng: seq(), center: { x: 0, z: 0 } }); f.engage(); run(f, RULES.introS + 0.2);
    assert.equal(f.state, 'fight'); run(f, 8); const ev = f.events.map((e) => e.kind);
    assert.ok(ev.includes('telegraph') && ev.includes('strike'), boss + ' атакует');
    const tele = f.events.find((e) => e.kind === 'telegraph'), strike = f.events.find((e) => e.kind === 'strike');
    assert.ok(strike.t - tele.t >= tele.tele - 0.11, 'удар не раньше телеграфа');
    f.events.length = 0; let phases = 0;
    while (f.alive) { f.shield = 0; f.damage({ base: 400, type: 'physical', zone: 'body' }); if (f.state === 'staggered') { f.state = 'fight'; f.stagger = 0; } }
    phases = f.events.filter((e) => e.kind === 'phase').length;
    assert.equal(phases, BOSSES[boss].phases.length - 1, boss + ' все фазы'); assert.ok(f.events.some((e) => e.kind === 'defeated'));
  }
});
test('оглушение: полоса stagger.bar от слабого места, затем уязвимость', () => {
  const f = new BossFight('boss_slime_king', { rng: seq() }); f.engage(); run(f, 3);
  while (f.state !== 'staggered') f.damage({ base: 50, type: 'fire', zone: 'head' });
  assert.equal(f.state, 'staggered'); const a = f.damage({ base: 50, type: 'fire', zone: 'head' }); assert.equal(a.zone, 'weak');
  run(f, BOSSES.boss_slime_king.stagger.dur + 0.2); assert.equal(f.state, 'fight');
});
test('ярость по таймеру ×1,5 урона', () => {
  const f = new BossFight('boss_slime_king', { rng: seq() }); f.engage(); run(f, BOSSES.boss_slime_king.enrage.time + 3); assert.ok(f.enraged); assert.equal(f.dmgMul, 1.5);
});
test('выход за 1,5 R на 10 с → полное HP и фаза 0', () => {
  const f = new BossFight('boss_rotroot', { rng: seq() }); f.engage(); run(f, 3); f.damage({ base: 7000, type: 'fire', zone: 'body' });
  assert.ok(f.phase >= 1); run(f, RULES.leashS + 0.5, { x: f.radius * 2, z: 0 }); assert.equal(f.hp, f.hpMax); assert.equal(f.phase, 0); assert.equal(f.state, 'idle');
});
test('Ймир: щит 3000 от кристаллов снимается их разрушением', () => {
  const f = new BossFight('boss_ymir', { rng: seq() }); f.engage(); run(f, 3); while (f.phase < 1) f.damage({ base: 3000, type: 'arcane' }); f.state = 'fight';
  assert.equal(f.shield, 3000); assert.equal(f.objectives.length, 4); for (let i = 0; i < 4; i++) f.damage({ base: 1000, type: 'lightning', objective: i }); assert.equal(f.shield, 0);
});
test('адды: слизь каждые 15 % во 2-й фазе, имп каждые 25 с в 3-й фазе дракона', () => {
  const f = new BossFight('boss_slime_king', { rng: seq() }); f.engage(); run(f, 3); for (let i = 0; i < 30; i++) { f.damage({ base: 300, type: 'arcane' }); f.state = 'fight'; f.stagger = 0; }
  assert.ok(f.events.filter((e) => e.kind === 'adds').length >= 2);
  const d = new BossFight('boss_ignarok', { rng: seq() }); d.engage(); run(d, 3); while (d.phase < 2) { d.damage({ base: 5000, type: 'frost' }); d.state = 'fight'; } d.events.length = 0; run(d, 26); assert.ok(d.events.some((e) => e.kind === 'adds' && e.mobs[0][0] === 'm_magma_imp'));
});
test('награды: уникальные и легендарки только первое убийство, очки навыков', () => {
  const leg = [{ id: 'lgv_hammer_ymir', unlock: { boss: 'boss_ymir' } }];
  const a = computeRewards('boss_ymir', { firstKill: true, legendaries: leg }), b = computeRewards('boss_ymir', { firstKill: false, legendaries: leg });
  assert.ok(a.items.some((i) => i.id.startsWith('it_uniq_'))); assert.deepEqual(a.legendaryUnlocks, ['lgv_hammer_ymir']); assert.equal(a.skillPoints, 2);
  assert.ok(!b.items.some((i) => i.id.startsWith('it_uniq_'))); assert.equal(b.profile, 'elite'); assert.equal(b.legendaryUnlocks.length, 0);
  assert.equal(nextFloor('boss_slime_king').boss, 'boss_rotroot'); assert.equal(nextFloor('boss_ignarok'), null);
});
test('респаун через 1 ночь, в кровавую луну — нет', () => {
  const r = new BossRegistry(); assert.ok(r.onDefeat('boss_rotroot', 3)); assert.ok(!r.isAvailable('boss_rotroot', 3)); assert.ok(r.isAvailable('boss_rotroot', 4));
  assert.ok(!r.isAvailable('boss_rotroot', 4, { bloodMoon: true })); assert.ok(!r.onDefeat('boss_rotroot', 4)); assert.ok(!r.isFirstKill('boss_rotroot'));
});
test('минибоссы: совместимы с BossFight, спешивание на 50 %', () => {
  for (const id of ['boss_roam_headless', 'boss_roam_sandworm']) { const d = roamDef(id); const f = new BossFight(id, { def: d, rng: seq() }); f.engage(); run(f, 10);
    assert.ok(f.events.some((e) => e.kind === 'strike')); f.damage({ base: f.hpMax * 0.55, type: 'frost' }); assert.equal(f.phase, 1); }
});
test('планировщик: кровавая луна каждую 5-ю ночь, червь от шума, ≤1 события', () => {
  const s = new EventScheduler({ rng: seq(0.1) }); let blood = 0;
  for (let n = 0; n < 10; n++) { blood += s.tick(1, { biome: 'b_swamp', night: true }).filter((o) => o.id === 'ev_blood_moon').length; s.tick(1, { biome: 'b_swamp', night: false }); }
  assert.equal(blood, 2);
  const w = new EventScheduler({ rng: seq(0.9) }); for (let i = 0; i < SCHED.wormShots; i++) w.noteShot();
  assert.ok(w.tick(0.1, { biome: 'b_desert_ruins', inDunes: true }).some((o) => o.kind === 'tremor'));
  assert.ok(w.tick(SCHED.wormDelayS, { biome: 'b_desert_ruins', inDunes: true }).some((o) => o.id === 'boss_roam_sandworm' && o.kind === 'roaming_miniboss'));
  const e = new EventScheduler({ rng: seq(0.1) }); let started = 0; for (let i = 0; i < 20; i++) started += e.tick(SCHED.periodS, { biome: 'b_meadow' }).filter((o) => o.kind === 'event').length;
  assert.ok(started >= 1); assert.ok(e.active.filter((a) => a.kind === 'event').length <= SCHED.maxActive + 1);
  for (const [id, ev] of Object.entries(WORLD_EVENTS)) for (const [m] of [...(ev.spawns || []), ...Object.values(ev.spawnsByBiome || {}).flat()]) assert.ok(MOBS[m], id + ' ' + m);
});
