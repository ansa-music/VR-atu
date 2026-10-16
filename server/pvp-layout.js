// ATU BASTION • shared deterministic PvP map layout for browser and Node.
// 22 × 24 metres, level floor, 3 clear lanes, low / full cover, two protected spawn zones.
// All lengths are metres. The boxes are the SAME on clients and server.
export const ARENA_HALF_X = 10.6;
export const ARENA_HALF_Z = 11.7;
export const PLAYER_RADIUS = 0.29;
export const SPAWN_SHIELD_MS = 1800;
export const RESPAWN_MS = 2400;
export const SPAWNS = Object.freeze({
  alpha: Object.freeze([
    [-6.8, 9.4], [-4.5, 9.1], [-1.7, 9.7], [1.7, 9.7], [4.5, 9.1], [6.8, 9.4],
  ]),
  bravo: Object.freeze([
    [6.8, -9.4], [4.5, -9.1], [1.7, -9.7], [-1.7, -9.7], [-4.5, -9.1], [-6.8, -9.4],
  ]),
});
// Each box: {x,z,w,d,h,kind}. Y is measured from the floor. Outer walls are separately clamped.
// Symmetric 180-degree rotation avoids a stronger team / lane.
const north = [
  // Mid sightline breaker: entry through both wide flank corridors.
  { x: 0, z: 0, w: 2.6, d: 2.4, h: 2.75, kind: 'core' },
  { x: -4.2, z: 0, w: 1.1, d: 3.6, h: 2.3, kind: 'pillar' },
  { x: 4.2, z: 0, w: 1.1, d: 3.6, h: 2.3, kind: 'pillar' },
  // Antechambers: standing-height cover near each approach.
  { x: -5.5, z: 3.8, w: 2.0, d: 1.5, h: 1.34, kind: 'container' },
  { x: 5.5, z: 3.8, w: 2.0, d: 1.5, h: 1.34, kind: 'container' },
  { x: 0, z: 4.0, w: 2.0, d: 1.35, h: 1.15, kind: 'cover' },
  // Spawn screen: protects each team's entry from a straight centre spawn shot.
  { x: 0, z: 7.2, w: 6.0, d: 0.65, h: 2.8, kind: 'screen' },
  { x: -8.3, z: 5.8, w: 1.2, d: 2.4, h: 1.48, kind: 'cover' },
  { x: 8.3, z: 5.8, w: 1.2, d: 2.4, h: 1.48, kind: 'cover' },
];
export const OBSTACLES = Object.freeze([
  ...north,
  ...north.slice(3).map(o => Object.freeze({ ...o, x: -o.x, z: -o.z })),
].map(o => Object.freeze(o)));

// Low obstacles are solid horizontally, regardless of player standing/crouching mode.
// Geometry controls both walking and line of sight.
export function walkable(x, z, radius = PLAYER_RADIUS) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(x) + radius > ARENA_HALF_X || Math.abs(z) + radius > ARENA_HALF_Z) return false;
  return !OBSTACLES.some(b =>
    Math.abs(x - b.x) < b.w / 2 + radius && Math.abs(z - b.z) < b.d / 2 + radius
  );
}

// Wall sliding on the X and Z axes is comfortable and deterministic in VR.
export function slideMovement(x, z, nx, nz) {
  if (walkable(nx, nz)) return [nx, nz];
  if (walkable(nx, z)) return [nx, z];
  if (walkable(x, nz)) return [x, nz];
  return [x, z];
}

export function segmentHitsObstacle(origin, dir, maxDistance) {
  for (const b of OBSTACLES) {
    let entry = 0, exit = maxDistance;
    const lo = [b.x - b.w / 2, 0, b.z - b.d / 2];
    const hi = [b.x + b.w / 2, b.h, b.z + b.d / 2];
    for (let i = 0; i < 3; i++) {
      const o = origin[i], v = dir[i];
      if (Math.abs(v) < 1e-7) {
        if (o < lo[i] || o > hi[i]) { exit = -1; break; }
      } else {
        const a = (lo[i] - o) / v, c = (hi[i] - o) / v;
        entry = Math.max(entry, Math.min(a, c));
        exit = Math.min(exit, Math.max(a, c));
        if (exit < entry) break;
      }
    }
    if (exit >= entry) return true;
  }
  // Outer perimeter: stop any hits that would leave the arena.
  return false;
}

export function chooseSpawn(team, random = Math.random) {
  const slots = SPAWNS[team] || SPAWNS.alpha;
  const n = Math.max(0, Math.min(slots.length - 1, Math.floor(random() * slots.length)));
  return [slots[n][0], 1.6, slots[n][1]];
}
