import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomStore } from './rooms.js';
import { startPvp, pvpShoot, tickPvp, poseValidForPvp } from './pvp.js';
import { RESPAWN_MS } from './pvp-layout.js';

const now = 10_000;
function fixture() {
  const store = new RoomStore({now: () => now});
  const owner = {id:'alpha-player'};
  const guest = {id:'bravo-player'};
  const room = store.create(owner,'Альфа',{code:'539',mode:'pvp'});
  store.join(room.code,guest,'Браво');
  store.start(room,owner.id);
  startPvp(room,now);
  const a = room.players.get(owner.id), b=room.players.get(guest.id);
  // A clear, obstacle-free western lane in ATU BASTION.
  a.position = [-8,1.6,1];
  b.position = [-8,1.6,-1];
  a.invulnerableUntil=0; b.invulnerableUntil=0;
  return {room,a,b};
}
const ray = (weapon='ak', y=1.6) => ({weapon,origin:[-8,y,1],direction:[0,0,-1]});

test('AK automatic cadence allowed; weapon switch cannot bypass server cooldown',()=>{
  const {room,a,b}=fixture();
  const first=pvpShoot(room,a,ray('ak'),now+2200);
  assert.equal(first.hit,true);
  assert.equal(first.weapon,'ak');
  assert.equal(first.damage,53);
  assert.equal(pvpShoot(room,a,ray('sniper'),now+2270).error,'WEAPON_COOLDOWN');
  assert.equal(b.health,47);
  assert.equal(pvpShoot(room,a,ray('ak'),now+2300).eliminated,true);
  assert.equal(a.kills,1);
  assert.equal(pvpShoot(room,a,ray('ak'),now+2400).hit,false);
  assert.equal(a.kills,1,'already defeated player must not score twice');
});

test('single sniper head hit is lethal, normal body shot is not',()=>{
  const {room,a,b}=fixture();
  const body=pvpShoot(room,a,ray('sniper',1.15),now+2200);
  assert.equal(body.headshot,false);
  assert.equal(body.eliminated,false);
  assert.equal(body.damage,89);
  b.health=100; a.nextShotAt=0;
  const head=pvpShoot(room,a,ray('sniper'),now+3500);
  assert.equal(head.headshot,true);
  assert.equal(head.eliminated,true);
  assert.equal(a.kills,1);
});

test('MR-133 pellets are server-controlled single network shot',()=>{
  const {room,a,b}=fixture();
  const result=pvpShoot(room,a,ray('shotgun'),now+2200);
  assert.equal(result.hit,true);
  assert.equal(result.weapon,'shotgun');
  assert.equal(result.playerId,a.id);
  assert.ok(result.damage>=20 && result.damage<=100);
  assert.equal(a.shots,1);
  assert.equal(a.hits,1);
  assert.ok(b.health<100);
  assert.equal(pvpShoot(room,a,ray('shotgun'),now+2600).error,'WEAPON_COOLDOWN');
});

test('prevent unknown weapons, forged positions and wall penetration',()=>{
  const {room,a,b}=fixture();
  assert.equal(pvpShoot(room,a,ray('supergun'),now+2200).error,'INVALID_WEAPON');
  const forged={...ray('ak'),origin:[-8,1.6,4.4]};
  assert.equal(pvpShoot(room,a,forged,now+2200).error,'UNVERIFIED_SHOT_ORIGIN');
  a.position=[0,1.6,5];b.position=[0,1.6,-5];
  assert.equal(pvpShoot(room,a,{weapon:'ak',origin:[0,1.6,5],direction:[0,0,-1]},now+2200).hit,false);
});

test('death and respawn reset HP, random spawn and protection',()=>{
  const {room,a,b}=fixture();
  pvpShoot(room,a,ray('ak'),now+2200);
  const kill=pvpShoot(room,a,ray('ak'),now+2300);
  assert.equal(kill.eliminated,true);
  assert.equal(b.alive,false);
  assert.equal(b.respawnAt,now+2300+RESPAWN_MS);
  assert.equal(tickPvp(room,b.respawnAt-1),false);
  assert.equal(tickPvp(room,b.respawnAt+1),true);
  assert.equal(b.health,100);
  assert.equal(b.alive,true);
  assert.ok(b.spawn[2]<0);
  assert.ok(b.invulnerableUntil>b.respawnAt || b.invulnerableUntil>now);
});

test('server rejects pose travel through cover even with otherwise valid destination',()=>{
  const {room,a}=fixture();
  a.position=[0,1.6,5.0];a.lastAcceptedPoseAt=now+1000;
  assert.equal(poseValidForPvp(room,a,[0,1.6,-5],now+3000),false);
});
