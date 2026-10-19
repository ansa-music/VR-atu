// Противники: node --expose-gc --import ./tests/node/register.mjs tests/node/enemies.test.mjs
import * as THREE from 'three';
import { createEnemies, ENEMY_TYPES } from '../../js/fantasy/enemies.js';
import { QUALITY } from '../../js/quality.js';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const scene = new THREE.Scene();
const E = createEnemies(scene, { quality: QUALITY.low });
const head = new THREE.Vector3(0, 1.6, 0), dir = new THREE.Vector3(0, 0, -1);
const opts = { headPos: head, headDir: dir, timeScale: 1 };
E.update(0.016, opts);
for (const t of Object.keys(ENEMY_TYPES)) ok(E.spawn(t) !== null, 'spawn ' + t);
ok(E.count === 6 && E.boss, 'count 6, boss active');
ok(E.spawn('boss') === null, 'second boss refused');
// позиции перед игроком
for (const e of E.active) { const d = Math.hypot(e.pos.x, e.pos.z); if (e.type !== 'boss') ok(e.pos.z < 0 && d > 3, `${e.type} перед игроком d=${d.toFixed(1)} y=${e.pos.y.toFixed(1)}`); }
E.clear(); E.update(0.016, opts);
ok(E.count === 0 && E.projectiles.list.length === 0, 'clear');

// timeScale: время побега и выстрела
function runUntil(ts, type, evType, maxT = 60) {
  const R = Math.random; Math.random = () => 0.5; try { return runUntil0(ts, type, evType, maxT); } finally { Math.random = R; }
}
function runUntil0(ts, type, evType, maxT) {
  E.clear(); E.update(0.016, { ...opts, timeScale: ts });
  E.spawn(type, new THREE.Vector3(0, 2, -8));
  let t = 0;
  while (t < maxT) { const ev = E.update(1 / 60, { ...opts, timeScale: ts }); t += 1 / 60; if (ev.some((e) => e.type === evType)) return t; }
  return -1;
}
for (const [type, evt] of [['wisp', 'escaped'], ['fairy', 'escaped'], ['skull', 'escaped'], ['eye', 'fireball']]) {
  const a = runUntil(1, type, evt), b = runUntil(0.25, type, evt);
  ok(a > 0 && Math.abs(b / a - 4) < 0.15, `${type} ${evt}: ts1 ${a.toFixed(2)}с, ts0.25 ${b.toFixed(2)}с (×${(b / a).toFixed(2)})`);
}
// 10 с всех типов при ts=1 и 0.25
for (const ts of [1, 0.25]) {
  E.clear(); E.update(0.016, opts);
  for (const t of Object.keys(ENEMY_TYPES)) E.spawn(t);
  const cnt = {};
  for (let i = 0; i < 600; i++) for (const ev of E.update(1 / 60, { ...opts, timeScale: ts })) cnt[ev.type] = (cnt[ev.type] || 0) + 1;
  console.log(`  10с ts=${ts}:`, JSON.stringify(cnt), 'живых', E.count);
}

// страж
E.clear(); E.update(0.016, opts);
const g = E.spawn('guardian', new THREE.Vector3(0, 0, -6));
E.update(0.016, opts);
const [body, rune] = [E.meshes.find((m) => m.userData.enemyType === 'guardian' && m.userData.part === 'body'), E.meshes.find((m) => m.userData.part === 'weak' && m.userData.enemyType === 'guardian')];
let r = E.hit(body, g.center, { damage: 5 });
ok(r && r.blocked && !r.killed && r.points === 0 && !r.weakPoint, 'страж тело → blocked');
r = E.hit(rune, g.center, { damage: 1 });
ok(r && !r.killed && r.weakPoint && g.hp === 1, 'руна 1 урон → hp 1');
r = E.hit(rune, g.center, { damage: 1 });
ok(r && r.killed && r.points === 8, 'руна → убит, +8');
const g2 = E.spawn('guardian', new THREE.Vector3(2, 0, -6));
r = E.hit(body, g2.center, { element: 'rune' });
ok(r && r.killed, 'страж element rune в тело → убит');
// череп
const sk = E.spawn('skull', new THREE.Vector3(0, 2, -5));
r = E.hit(E.meshes.find((m) => m.userData.enemyType === 'skull'), sk.center);
ok(r && r.killed && r.points === -5, 'череп → -5');

// raycast
E.clear(); E.update(0.016, opts);
const w1 = E.spawn('wisp', new THREE.Vector3(-1, 2, -6));
const w2 = E.spawn('wisp', new THREE.Vector3(1, 2, -6));
for (let k = 0; k < 40; k++) E.update(1 / 60, opts);
const rc = new THREE.Raycaster();
rc.set(head, new THREE.Vector3().subVectors(w2.center, head).normalize());
let hits = rc.intersectObjects(E.meshes, false);
ok(hits.length > 0 && hits[0].instanceId !== undefined, 'raycast находит огонёк, instanceId=' + (hits[0] && hits[0].instanceId));
if (hits.length) { r = E.hit(hits[0].object, hits[0].point, { instanceId: hits[0].instanceId }); ok(r && r.killed && r.enemy === w2 && r.points === 1, 'hit по instanceId убил нужного'); }
// после swap-remove w1 — экземпляр 0
E.update(0.016, opts);
rc.set(head, new THREE.Vector3().subVectors(w1.center, head).normalize());
hits = rc.intersectObjects(E.meshes, false);
ok(hits.length && hits[0].instanceId === w1.slot, 'raycast после swap-remove');
// гвардия руной raycast
const g3 = E.spawn('guardian', new THREE.Vector3(0, 0, -6));
for (let k = 0; k < 40; k++) E.update(1 / 60, opts);
rc.set(head, new THREE.Vector3(0.05, 1.47, g3.pos.z + 0.45).sub(head).normalize());
hits = rc.intersectObjects(E.meshes, false);
ok(hits.length && hits[0].object.userData.part === 'weak', 'raycast в грудь стража — руна первой: ' + (hits[0] && hits[0].object.name));
// босс raycast
const b = E.spawn('boss'); for (let i = 0; i < 200; i++) E.update(1 / 60, opts);
rc.set(head, new THREE.Vector3(0.07, 0.05, 0).add(b.center).sub(head).normalize());
hits = rc.intersectObjects(E.meshes, false);
ok(hits.length && hits[0].object.name === 'enemy-boss-core', 'raycast в ядро босса: ' + hits.slice(0,3).map(h=>h.object.name+':'+h.distance.toFixed(2)).join(' '));

// threat → уворот
E.clear(); E.update(0.016, opts);
const w = E.spawn('wisp', new THREE.Vector3(0, 2, -6)); E.update(0.016, opts);
const p0 = w.pos.clone();
E.threat(head, new THREE.Vector3().subVectors(w.pos, head).normalize());
for (let i = 0; i < 30; i++) E.update(1 / 60, opts);
const off = p0.distanceTo(w.pos);
ok(off > 1.0, 'огонёк увернулся на ' + off.toFixed(2) + ' м');
const cd = w.dodgeCd; E.threat(head, new THREE.Vector3().subVectors(w.pos, head).normalize());
ok(w.dodgeCd === cd, 'откат уворота');

// глаз: выстрел, hitTest, deflect → во врага
E.clear(); E.update(0.016, opts);
const eye = E.spawn('eye', new THREE.Vector3(0, 2.5, -9));
const target = E.spawn('guardian', new THREE.Vector3(3, 0, -9)); // отражаем в стража (снаряд убивает)
let fb = null;
for (let i = 0; i < 600 && !fb; i++) for (const ev of E.update(1 / 60, opts)) if (ev.type === 'fireball') fb = ev;
ok(fb && fb.projectile && fb.speed === 7, 'fireball событие');
const proj = fb.projectile;
ok(proj.position && proj.position.isVector3 && E.projectiles.list.includes(proj), 'у снаряда есть position и он в list');
let ph = null;
for (let i = 0; i < 60; i++) E.update(1 / 60, opts);
const from = new THREE.Vector3(-1, 1.6, -1), to = new THREE.Vector3().copy(proj.position).multiplyScalar(2).sub(from);
const ht = E.projectiles.hitTest(from, to, 0.05);
ok(ht && ht.projectile === proj, 'hitTest нашёл снаряд, d=' + (ht && ht.distance.toFixed(2)));
E.projectiles.deflect(proj, new THREE.Vector3().subVectors(target.center, proj.position).normalize());
ok(proj.deflected && Math.abs(proj.speed - 9.1) < 1e-6, 'deflect ×1.3');
let phit = null;
for (let i = 0; i < 300 && !phit; i++) for (const ev of E.update(1 / 60, opts)) if (ev.type === 'projectile-hit') phit = ev;
ok(phit && phit.enemy === target && phit.killed && phit.points === 8, 'отражённый шар попал в стража');
ok(!E.projectiles.list.includes(proj) && E.projectiles.deflect(proj, dir) === false, 'мёртвый снаряд не в list, deflect безопасен');
// неотражённый шар — в голову
let pl = null;
for (let i = 0; i < 900 && !pl; i++) for (const ev of E.update(1 / 60, opts)) if (ev.type === 'player-hit') pl = ev;
ok(pl && pl.point.distanceTo(head) < 0.5, 'player-hit');
// повторный deflect того же живого снаряда
const fb2 = E.projectiles.list[0];
if (fb2) { E.projectiles.deflect(fb2, new THREE.Vector3(0, 0, -1)); const sp = fb2.speed; E.projectiles.deflect(fb2, new THREE.Vector3(0, 0, -1)); ok(fb2.speed > sp - 1e-6, 'повторный deflect работает'); }

// босс
E.clear(); E.update(0.016, opts);
const boss = E.spawn('boss');
let roar = 0, phase = 0, charge = 0, fbs = 0;
let ev0 = E.update(1 / 60, opts); for (const e of ev0) if (e.type === 'boss-roar') roar++;
ok(roar === 1, 'boss-roar при спавне');
ok(Math.abs(Math.hypot(boss.pos.x, boss.pos.z) - 16) < 0.01, 'босс в 16 м');
for (let i = 0; i < 600; i++) for (const e of E.update(1 / 60, opts)) { if (e.type === 'charge') charge++; if (e.type === 'fireball') fbs++; }
ok(charge >= 1 && fbs % 3 === 0 && fbs >= 3, `залпы: charge ${charge}, шаров ${fbs}`);
const core = E.meshes.find((m) => m.name === 'enemy-boss-core'), bbody = E.meshes.find((m) => m.name === 'enemy-boss');
r = E.hit(bbody, boss.center, { damage: 4 }); ok(r && boss.hp === 59 && !r.weakPoint, 'тело ×0.25');
r = E.hit(core, boss.center, { damage: 3 }); ok(r && boss.hp === 50 && r.weakPoint, 'ядро ×3');
 E.update(1/60, opts); r = E.hit(core, boss.center, { damage: 7 });
roar = 0;
for (const e of E.update(1 / 60, opts)) { if (e.type === 'boss-phase') phase = e.phase; if (e.type === 'boss-roar') roar++; }
ok(phase === 2 && roar === 1 && boss.phase === 2, 'фаза 2 на 50%');
fbs = 0; let sinceCharge = 0;
E.projectiles.list.slice().forEach((p) => E.projectiles.destroy(p));
for (let i = 0; i < 400; i++) for (const e of E.update(1 / 60, opts)) if (e.type === 'fireball') fbs++;
ok(fbs >= 5 && fbs % 5 === 0, 'фаза 2 залп по 5: ' + fbs);
for (let i = 0; i < 20 && E.boss; i++) r = E.hit(core, boss.center, { damage: 3 });
ok(!E.boss && r.killed && r.points === 150, 'босс убит +150');

// стихии
E.clear(); E.update(0.016, opts);
const ey = E.spawn('eye', new THREE.Vector3(0, 3, -9));
const eyeMesh = E.meshes.find((m) => m.userData.enemyType === 'eye');
E.hit(eyeMesh, ey.center, { damage: 1, element: 'fire' });
let killed = null;
for (let i = 0; i < 300 && !killed; i++) for (const e of E.update(1 / 60, opts)) if (e.type === 'killed') killed = e;
ok(killed && killed.enemy === ey && killed.points === 5, 'смерть от поджога → killed +5');
const ey2 = E.spawn('eye', new THREE.Vector3(0, 3, -9));
E.hit(eyeMesh, ey2.center, { damage: 1, element: 'ice' });
ok(ey2.slow > 0, 'лёд — замедление');
const sp = [];
for (let i = 0; i < 3; i++) sp.push(E.spawn('wisp', new THREE.Vector3(i * 1.5 + 1.5, 3, -9)));
for (let k = 0; k < 40; k++) E.update(1 / 60, opts);
const wm = E.meshes.find((m) => m.userData.enemyType === 'wisp');
r = E.hit(eyeMesh, ey2.center, { damage: 2, element: 'lightning' });
const evs = E.update(0.016, opts);
const chains = evs.filter((e) => e.type === 'chain').length, kills = evs.filter((e) => e.type === 'killed').length;
ok(chains === 3 && kills === 3 && r.killed, `молния: chain ${chains}, killed ${kills}`);

// explode
E.clear(); E.update(0.016, opts);
E.spawn('wisp', new THREE.Vector3(0, 2, -6)); E.spawn('fairy', new THREE.Vector3(0.8, 2, -6)); E.spawn('wisp', new THREE.Vector3(9, 2, -6));
const gg = E.spawn('guardian', new THREE.Vector3(-2.1, 0, -6));
for (let k = 0; k < 2; k++) E.update(1 / 60, opts);
console.log('  до explode', E.active.map(e=>e.type+':'+e.center.toArray().map(x=>x.toFixed(2))));
const ex = E.explode(new THREE.Vector3(0, 2, -6), 1.5, { damage: 2 });
console.log('  explode', ex.map(x=>x.type+(x.killed?' killed':'')+(x.blocked?' blocked':'')), E.count);
ok(ex.length === 3 && ex.filter((x) => x.killed).length === 2 && ex.find((x) => x.type === 'guardian').blocked && E.count === 2, 'explode: 3 задеты, 2 убиты, страж blocked');
ok(ex[0].position.isVector3, 'explode результат с position');
const ex2 = E.explode(new THREE.Vector3(0, 1.45, 0.5).applyQuaternion(gg.quat).add(gg.pos), 0.5, { damage: 1 });
ok(ex2.length === 1 && ex2[0].weakPoint && !ex2[0].blocked, 'explode у руны → weakPoint');

// аллокации
E.clear(); E.update(0.016, opts);
for (const t of Object.keys(ENEMY_TYPES)) E.spawn(t);
for (let i = 0; i < 8; i++) E.spawn('wisp');
const hd = new THREE.Vector3(0, 1.6, 0), dd = new THREE.Vector3(0, 0, -1);
const O = { headPos: hd, headDir: dd, timeScale: 1 };
const frame = () => { const ev = E.update(1 / 72, O); if (E.projectiles.list.length > 10) E.projectiles.destroy(E.projectiles.list[0]); for (let i = 0; i < E.active.length; i++) { if (E.active[i].type === 'wisp') E.threat(hd, dd); } };
for (let i = 0; i < 2000; i++) frame();
// держим врагов живыми: огоньки/феи сбегают — пересоздаём вне замера
global.gc(); const h0 = process.memoryUsage().heapUsed;
for (let i = 0; i < 10000; i++) frame();
global.gc(); const h1 = process.memoryUsage().heapUsed;
ok(h1 - h0 < 200 * 1024, `heap до/после 10000 кадров: ${(h0 / 1024).toFixed(0)} → ${(h1 / 1024).toFixed(0)} КБ (Δ ${((h1 - h0) / 1024).toFixed(1)} КБ), живых ${E.count}`);
// аллокации с живыми врагами и hit
E.clear(); E.update(0.016, O);
global.gc(); const h2 = process.memoryUsage().heapUsed;
const gm = E.meshes.find((m) => m.userData.enemyType === 'guardian');
const pt = new THREE.Vector3(0, 1.4, -6);
for (let i = 0; i < 10000; i++) {
  if (E.countOf('guardian') < 2) E.spawn('guardian');
  if (E.countOf('wisp') < 6) E.spawn('wisp');
  if (!E.boss) E.spawn('boss');
  E.update(1 / 72, O);
  E.hit(gm, pt, { damage: 1, instanceId: 0 });
  if (i % 7 === 0) E.hit(E.meshes[0], pt, { damage: 1, element: i % 2 ? 'fire' : 'lightning' });
  if (i % 50 === 0) E.explode(pt, 2, { damage: 1 });
}
global.gc(); const h3 = process.memoryUsage().heapUsed;
ok(h3 - h2 < 200 * 1024, `heap со спавном/hit/explode: Δ ${((h3 - h2) / 1024).toFixed(1)} КБ`);
E.dispose();
console.log(fails ? `\n${fails} FAIL` : '\nВСЕ ТЕСТЫ ПРОШЛИ');
