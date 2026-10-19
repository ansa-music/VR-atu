// Лук и клинок: node --import ./tests/node/register.mjs tests/node/bow-melee.test.mjs
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBowController } from '../../js/fantasy/bow.js';
import { createMelee, createSlashWaves } from '../../js/fantasy/melee.js';

// --- лук: модель-заглушка (группа, тетива в z=0.18, вылет у рукояти) ---
const bow = { group: new THREE.Group(), string: new THREE.Object3D(), muzzle: new THREE.Object3D(), draw: 0 };
bow.string.position.set(0, 0, 0.18); bow.muzzle.position.set(0, 0, -0.02);
bow.group.add(bow.string, bow.muzzle);
bow.setDraw = (k) => { bow.draw = k; bow.string.position.z = 0.18 + 0.55 * k; };
bow.group.position.set(0, 1.4, -0.5);
const hand = new THREE.Vector3(0.5, 1.4, -0.3);
const ctl = createBowController();
const dt = 1 / 72;
// рука далеко — захвата нет
assert.equal(ctl.update(dt, { bow, drawHand: hand, drawing: true }), null); assert.equal(ctl.nocked, false);
ctl.update(dt, { bow, drawHand: hand, drawing: false });
// у тетивы → захват, тянем назад
hand.set(0, 1.4, -0.5 + 0.18);
ctl.update(dt, { bow, drawHand: hand, drawing: true }); assert.equal(ctl.nocked, true);
for (let i = 0; i <= 20; i++) { hand.z = -0.32 + 0.6 * i / 20; ctl.update(dt, { bow, drawHand: hand, drawing: true }); }
assert.equal(ctl.draw01, 1); assert.equal(bow.draw, 1);
const r = ctl.update(dt, { bow, drawHand: hand, drawing: false });
assert.ok(r && r.power === 1); assert.ok(r.dir.z < -0.99, 'стрела вперёд');
assert.equal(bow.draw, 0);
// слабое натяжение — выстрела нет
ctl.update(dt, { bow, drawHand: hand.set(0, 1.4, -0.32), drawing: false });
ctl.update(dt, { bow, drawHand: hand, drawing: true });
hand.z += 0.03; ctl.update(dt, { bow, drawHand: hand, drawing: true });
assert.equal(ctl.update(dt, { bow, drawHand: hand, drawing: false }), null);
// поворот лука на 90° влево — стрела летит влево
bow.group.rotation.y = Math.PI / 2; bow.group.updateMatrixWorld(true);
const rest = new THREE.Vector3(0, 0, 0.18).applyMatrix4(bow.group.matrixWorld);
ctl.update(dt, { bow, drawHand: hand.copy(rest), drawing: false });
ctl.update(dt, { bow, drawHand: hand, drawing: true });
hand.x += 0.4; ctl.update(dt, { bow, drawHand: hand, drawing: true });
const r2 = ctl.update(dt, { bow, drawHand: hand, drawing: false });
assert.ok(r2.dir.x < -0.99 && Math.abs(r2.power - 0.4 / 0.55) < 0.02, 'влево ' + r2.dir.x);

// --- клинок ---
const scene = new THREE.Scene();
const blade = { group: new THREE.Group(), tip: new THREE.Object3D(), base: new THREE.Object3D() };
blade.tip.position.set(0, 0, -0.85); blade.base.position.set(0, 0, -0.05);
blade.group.add(blade.tip, blade.base); scene.add(blade.group);
blade.group.position.set(0, 1.3, 0);
// цель — шар перед игроком на дистанции лезвия
const target = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshBasicMaterial());
target.position.set(0, 1.3, -0.7); scene.add(target); scene.updateMatrixWorld(true);
const melee = createMelee();
// медленно — нет удара
blade.group.rotation.y = 0.6; scene.updateMatrixWorld(true);
melee.update(dt, { blade, hittables: [target] });
let hits;
for (let i = 0; i < 10; i++) { blade.group.rotation.y = 0.6 - 0.12 * i / 10; scene.updateMatrixWorld(true); hits = melee.update(dt, { blade, hittables: [target] }); assert.equal(hits.length, 0); }
// быстрый взмах слева направо: 1.2 рад за 6 кадров → кончик ~12 м/с
let total = 0, wave = null;
blade.group.rotation.y = 0.6; scene.updateMatrixWorld(true); melee.update(dt, { blade, hittables: [target] });
for (let i = 1; i <= 6; i++) { blade.group.rotation.y = 0.6 - 1.2 * i / 6; scene.updateMatrixWorld(true); hits = melee.update(dt, { blade, hittables: [target] }); total += hits.length; if (hits.length) assert.ok(hits[0].strength > 0.9); wave ||= melee.wave && { ...melee.wave }; }
assert.equal(total, 1, 'один удар за взмах');
assert.ok(melee.tipSpeed > 6);
for (let i = 0; i < 4; i++) { blade.group.rotation.y = -0.6 - 0.02 * i; scene.updateMatrixWorld(true); melee.update(dt, { blade, hittables: [target] }); wave ||= melee.wave && { origin: melee.wave.origin.clone(), dir: melee.wave.dir.clone(), up: melee.wave.up.clone(), power: melee.wave.power }; }
assert.ok(wave, 'волна после сильного взмаха');
// волна летит и попадает
const waves = createSlashWaves(scene, {});
const far = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshBasicMaterial());
far.position.copy(wave.origin).addScaledVector(wave.dir, 8); scene.add(far); scene.updateMatrixWorld(true);
waves.spawn(wave, { speed: 16, damage: 3, range: 30 });
let got = 0;
for (let i = 0; i < 160; i++) waves.update(dt, { hittables: [far], onHit: () => got++ });
assert.equal(got, 1); assert.equal(waves.mesh.visible, false);
console.log('bow+melee: OK');
