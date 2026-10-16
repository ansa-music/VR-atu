import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RoomStore } from './rooms.js';
import { startPvp, respawn, tickPvp, pvpShoot, poseValidForPvp } from './pvp.js';
import { SPAWNS, OBSTACLES, chooseSpawn, walkable, slideMovement, segmentHitsObstacle, RESPAWN_MS } from './pvp-layout.js';

const player = id => ({id,roomCode:null});
function duel() {
  let now=1_000;
  const store=new RoomStore({now:()=>now});
  const a=player('a'),b=player('b');
  const room=store.create(a,'Альфа',{mode:'pvp'});
  store.join(room.code,b,'Браво');
  store.start(room,a.id);
  startPvp(room,now);
  return {room,a:room.players.get(a.id),b:room.players.get(b.id), now};
}

test('ATU Bastion offers two safe symmetrical randomized spawn zones',()=>{
  assert.equal(SPAWNS.alpha.length,6);
  assert.equal(SPAWNS.bravo.length,6);
  for(const [team,slots] of Object.entries(SPAWNS))for(const [x,z] of slots) {
    assert.ok(walkable(x,z),team+' spawn must be walkable');
    assert.equal(Math.sign(z),team==='alpha'?1:-1);
  }
  const first=chooseSpawn('alpha',()=>0);
  const last=chooseSpawn('alpha',()=>.999);
  assert.notDeepEqual(first,last);
  assert.ok(OBSTACLES.length>=12);
});

test('corridors slide around solid cover; server ray cannot pierce centre',()=>{
  assert.equal(walkable(0,0),false);
  const [x,z]=slideMovement(-3.5,3,0,0);
  assert.ok(walkable(x,z),'collision adjustment stays outside the wall');
  assert.ok(segmentHitsObstacle([0,1.6,5],[0,0,-1],10));
  assert.equal(segmentHitsObstacle([-8,1.6,1],[0,0,-1],2),false);
});

test('teams alternate and players start inside own randomized territory',()=>{
  const {room,a,b}=duel();
  assert.equal(a.team,'alpha');
  assert.equal(b.team,'bravo');
  assert.equal(a.health,100);
  assert.equal(b.health,100);
  assert.ok(a.spawn[2]>0 && b.spawn[2]<0);
  assert.ok(walkable(a.spawn[0],a.spawn[2]));
  assert.ok(walkable(b.spawn[0],b.spawn[2]));
});

test('shot behind solid cover is blocked even when aimed at a player',()=>{
  const {room,a,b,now}=duel();
  a.position=[0,1.6,5];
  b.position=[0,1.6,-5];
  b.invulnerableUntil=0;
  const result=pvpShoot(room,a,{weapon:'ak',origin:[0,1.6,5],direction:[0,0,-1]},now+2000);
  assert.equal(result.hit,false);
  assert.equal(b.health,100);
});

test('head damage, elimination, score and delayed respawn are server-controlled',()=>{
  const {room,a,b,now}=duel();
  a.position=[-8,1.6,1];
  b.position=[-8,1.6,-1];
  b.invulnerableUntil=0;
  const ray={weapon:'ak',origin:[-8,1.6,1],direction:[0,0,-1]};
  assert.equal(pvpShoot(room,a,ray,now+2000).damage,53);
  const kill=pvpShoot(room,a,ray,now+2100);
  assert.equal(kill.eliminated,true);
  assert.equal(b.health,0);
  assert.equal(a.kills,1);
  assert.equal(b.deaths,1);
  assert.equal(a.score,1);
  assert.equal(pvpShoot(room,b,ray,now+2200).error,'PLAYER_DEAD');
  assert.equal(tickPvp(room,now+2100+RESPAWN_MS-1),false);
  assert.equal(tickPvp(room,now+2100+RESPAWN_MS+1),true);
  assert.equal(b.health,100);
  assert.equal(b.alive,true);
  assert.ok(b.spawn[2]<0 && walkable(b.spawn[0],b.spawn[2]));
});

test('spawn protection and friendly-fire protection are active',()=>{
  const {room,a,b,now}=duel();
  a.position=[-8,1.6,1];b.position=[-8,1.6,-1];
  const ray={weapon:'ak',origin:[-8,1.6,1],direction:[0,0,-1]};
  assert.equal(pvpShoot(room,a,ray,now+100).hit,false);
  b.invulnerableUntil=0;
  b.team='alpha';
  assert.equal(pvpShoot(room,a,ray,now+2000).hit,false);
});

test('server denies teleporting and walking inside obstacles',()=>{
  const {room,a,now}=duel();
  assert.equal(poseValidForPvp(room,a,[0,1.6,0],now+60),false);
  assert.equal(poseValidForPvp(room,a,[30,1.6,0],now+60),false);
  const initial=a.spawn;
  assert.equal(poseValidForPvp(room,a,[initial[0],1.6,initial[2]],now+60),true);
});

test('browser and Render container use byte-identical cover layouts',async()=>{
  const [server,browser]=await Promise.all([
    readFile(new URL('./pvp-layout.js',import.meta.url),'utf8'),
    readFile(new URL('../js/pvp-layout.js',import.meta.url),'utf8'),
  ]);
  assert.equal(server,browser);
});


test('four teammates never overlap at round start',()=>{
  const store=new RoomStore({now:()=>1000});
  const host=player('host');
  const room=store.create(host,'Host',{mode:'pvp',maxPlayers:8});
  for(let n=1;n<8;n++)store.join(room.code,player('p'+n),'Игрок'+n);
  store.start(room,host.id);
  startPvp(room,1000);
  for(const team of ['alpha','bravo']){
    const positions=[...room.players.values()].filter(p=>p.team===team)
      .map(p=>p.spawn[0]+','+p.spawn[2]);
    assert.equal(new Set(positions).size,positions.length);
  }
});
