import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatController, shotSpread } from '../js/combat.js';

test('ammo, reload and cooldown', () => {
  let now = 1000;
  const gun = new CombatController({capacity:2, reserve:3, fireInterval:100, reloadMs:500, now:()=>now});
  assert.equal(gun.fire().ok,true);
  assert.equal(gun.fire().reason,'cooldown');
  now+=120; assert.equal(gun.fire().ok,true);
  now+=120; assert.equal(gun.fire().reason,'empty');
  assert.equal(gun.reload(),true);
  assert.equal(gun.fire().reason,'reloading');
  now+=500; gun.update(0.016);
  assert.equal(gun.status.ammo,2);
  assert.equal(gun.status.reserve,1);
});

test('reload cannot create ammunition',()=>{
  const gun=new CombatController({capacity:24,reserve:0});
  gun.ammo=3;
  assert.equal(gun.reload(),false);
});

test('movement and jump broaden spread',()=>{
  const magnitude = ([x,y]) => Math.hypot(x,y);
  const standing = magnitude(shotSpread({shotIndex:2}));
  const moving = magnitude(shotSpread({moving:true,shotIndex:2}));
  const jumping = magnitude(shotSpread({jumping:true,shotIndex:2}));
  const aiming = magnitude(shotSpread({aiming:true,shotIndex:2}));
  assert.ok(jumping>moving && moving>standing && standing>aiming);
});
