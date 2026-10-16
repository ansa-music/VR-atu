import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomStore } from './rooms.js';
import { startPvp, tickPvp, pvpShoot } from './pvp.js';
import { SPAWN_SHIELD_MS, RESPAWN_MS, walkable } from '../js/pvp-layout.js';

function setup() {
  const now = 1000, store = new RoomStore({ now: () => now });
  const a = { id:'a' }, b = { id:'b' };
  const room = store.create(a,'Alpha', {mode:'pvp'});
  store.join(room.code,b,'Bravo');
  store.start(room,a.id);
  startPvp(room,now);
  const shooter = room.players.get(a.id), victim = room.players.get(b.id);
  shooter.position = [9.6,1.6,3];
  victim.position = [9.6,1.6,-3];
  return {room, shooter, victim, now, ray:{origin:shooter.position,direction:[0,0,-1]}};
}

test('PvP spawn shield blocks hits until its expiry', () => {
  const {room,shooter,victim,now,ray}=setup();
  assert.equal(pvpShoot(room,shooter,ray,now+SPAWN_SHIELD_MS-1).hit,false);
  assert.equal(victim.health,100);
  assert.equal(pvpShoot(room,shooter,ray,now+SPAWN_SHIELD_MS).hit,true);
  assert.equal(victim.health,33);
});

test('PvP cover blocks damage, but an unobstructed lane allows hits', () => {
  const {room,shooter,victim,now,ray}=setup();
  shooter.position=[0,1.6,8]; victim.position=[0,1.6,6];
  assert.equal(pvpShoot(room,shooter,{...ray,origin:shooter.position},now+2000).hit,false);
  assert.equal(victim.health,100);
  shooter.position=[9.6,1.6,3]; victim.position=[9.6,1.6,-3];
  assert.equal(pvpShoot(room,shooter,{...ray,origin:shooter.position},now+2000).hit,true);
});

test('PvP death awards one kill and respawns in a walkable team slot with protection', () => {
  const {room,shooter,victim,now,ray}=setup();
  pvpShoot(room,shooter,ray,now+2000);
  const killed=pvpShoot(room,shooter,ray,now+2200);
  assert.equal(killed.eliminated,true);
  assert.equal(victim.alive,false);
  assert.equal(shooter.kills,1);
  assert.equal(victim.deaths,1);
  assert.equal(pvpShoot(room,shooter,ray,now+2400).hit,false);
  assert.equal(shooter.kills,1);
  const respawnAt=now+2200+RESPAWN_MS;
  assert.equal(tickPvp(room,respawnAt-1),false);
  const sequence=victim.spawnSeq;
  assert.equal(tickPvp(room,respawnAt),true);
  assert.equal(victim.spawnSeq,sequence+1);
  assert.equal(victim.health,100);
  assert.equal(victim.alive,true);
  assert.equal(walkable(victim.position[0],victim.position[2]),true);
  assert.ok(victim.position[2]<0, 'bravo respawns on its own side');
  assert.equal(victim.invulnerableUntil,respawnAt+SPAWN_SHIELD_MS);
});

test('PvP does not damage teammates or permit dead shooters', () => {
  const {room,shooter,victim,now,ray}=setup();
  victim.team=shooter.team;
  assert.equal(pvpShoot(room,shooter,ray,now+2000).hit,false);
  assert.equal(victim.health,100);
  shooter.alive=false;
  assert.equal(pvpShoot(room,shooter,ray,now+2000).error,'PLAYER_DEAD');
});
