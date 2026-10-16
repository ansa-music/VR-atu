import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/pvp-layout.js', import.meta.url), 'utf8');
const { ARENA_HALF_X, ARENA_HALF_Z, PLAYER_RADIUS, OBSTACLES, SPAWNS,
  walkable, slideMovement, segmentHitsObstacle, chooseSpawn,
} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('Bastion cover and spawn positions are rotationally symmetric', () => {
  for (const a of OBSTACLES) {
    assert.ok(OBSTACLES.some(b => b.x === -a.x && b.z === -a.z &&
      b.w === a.w && b.d === a.d && b.h === a.h && b.kind === a.kind));
  }
  for (const [x,z] of SPAWNS.alpha) assert.ok(SPAWNS.bravo.some(p => p[0] === -x && p[1] === -z));
});

test('every randomized spawn is inside the arena with clearance and is returned by value', () => {
  for (const team of ['alpha', 'bravo']) {
    SPAWNS[team].forEach(([x,z], i) => {
      const spawn = chooseSpawn(team, () => (i + 0.5) / SPAWNS[team].length);
      assert.deepEqual(spawn, [x, 1.6, z]);
      assert.equal(walkable(x,z,PLAYER_RADIUS + 0.1), true);
      spawn[0] = 999;
      assert.equal(SPAWNS[team][i][0], x);
    });
  }
});

test('all spawn positions connect to all three passages at player width', () => {
  const step = 0.2;
  const key = (x,z) => `${x},${z}`;
  const start = SPAWNS.alpha[0].map(v => Math.round(v / step));
  const visited = new Set([key(...start)]), queue = [start];
  for (let i=0; i<queue.length; i++) {
    const [x,z] = queue[i];
    for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=x+dx, nz=z+dz, id=key(nx,nz);
      if (!visited.has(id) && walkable(nx*step,nz*step)) {
        visited.add(id); queue.push([nx,nz]);
      }
    }
  }
  for (const [x,z] of Object.values(SPAWNS).flat()) {
    assert.ok(visited.has(key(Math.round(x/step),Math.round(z/step))), `unreachable spawn ${x},${z}`);
  }
  for (const x of [-9.6,2.4,9.6]) {
    for (let z=-6; z<=6; z+=step) assert.ok(visited.has(key(Math.round(x/step),Math.round(z/step))));
  }
});

test('large movement steps cannot tunnel through either spawn screen or central core', () => {
  for (const [x,z,nx,nz] of [[0,8,0,6],[0,-8,0,-6],[0,2,0,-2],[-2,0,2,0]]) {
    const result = slideMovement(x,z,nx,nz);
    assert.equal(walkable(...result), true);
    assert.ok(Math.hypot(result[0]-x,result[1]-z) < Math.hypot(nx-x,nz-z), 'wall was crossed');
    assert.equal(segmentHitsObstacle([x,0.8,z], [nx-x,0,nz-z], Math.hypot(result[0]-x,result[1]-z)), false);
  }
});

test('movement slides along cover and remains within the playable perimeter', () => {
  const [x,z] = slideMovement(0,8,2,7);
  assert.ok(x > 1.5, 'tangential movement should continue');
  assert.ok(z >= 7.2 + 0.65/2 + PLAYER_RADIUS - 1e-8);
  assert.equal(walkable(x,z), true);
  assert.equal(walkable(...slideMovement(10,0,100,0)), true);
  assert.deepEqual(slideMovement(0,8,NaN,0), [0,8]);
});

test('shots stop at full cover but can travel above low cover', () => {
  assert.equal(segmentHitsObstacle([0,1.6,8],[0,0,-1],2), true);
  assert.equal(segmentHitsObstacle([0,1.6,8],[0,0,-1],0.2), false);
  assert.equal(segmentHitsObstacle([0,0.8,5.5],[0,0,-1],2), true);
  assert.equal(segmentHitsObstacle([0,1.6,5.5],[0,0,-1],2), false);
  assert.equal(segmentHitsObstacle([0,1.6,8],[0,0,1],1), false);
  assert.equal(segmentHitsObstacle([0,1.6,0],[1,0,0],1), true);
});

test('shot distances are metres regardless of direction magnitude', () => {
  for (const scale of [0.1,1,10]) {
    assert.equal(segmentHitsObstacle([0,1.6,8],[0,0,-scale],0.2), false);
    assert.equal(segmentHitsObstacle([0,1.6,8],[0,0,-scale],2), true);
  }
});

test('perimeter and malformed rays cannot bypass occlusion', () => {
  assert.equal(segmentHitsObstacle([10,1.6,0],[1,0,0],2), true);
  assert.equal(segmentHitsObstacle([-10,1.6,0],[-1,0,0],2), true);
  assert.equal(segmentHitsObstacle([0,1.6,11],[0,0,1],2), true);
  assert.equal(segmentHitsObstacle([0,1.6,-11],[0,0,-1],2), true);
  assert.equal(segmentHitsObstacle([10,1.6,0],[-1,0,0],0.2), false);
  for (const [origin,dir,distance] of [[null,[1,0,0],2],[[0,1.6,8],[NaN,0,0],2],[[0,1.6,8],[0,0,0],2],[[0,1.6,8],[0,0,-1],-1],[[0,1.6,8],[0,0,-1],Infinity]]) {
    assert.equal(segmentHitsObstacle(origin,dir,distance), true);
  }
  assert.equal(walkable(ARENA_HALF_X,0), false);
  assert.equal(walkable(0,ARENA_HALF_Z), false);
});


test('Docker server geometry matches the browser layout exactly', async () => {
  const serverSource = await readFile(new URL('./pvp-layout.js', import.meta.url), 'utf8');
  assert.equal(serverSource, source, 'Update both layout copies so clients and the packaged server use identical collision geometry');
});
