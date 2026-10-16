# ATU BASTION: geometry handoff for PvP integration

The map/integration session owns `js/pvp-map.js`, team selection, spawn events,
player movement integration and server player hits. This support change is
limited to shared geometry and regression tests; it keeps every
obstacle and spawn coordinate unchanged.

## Shared functions

- `walkable(x, z, radius = PLAYER_RADIUS)`: validates a player's X/Z footprint
  against all cover and the perimeter. Default radius: 0.29 m. Low cover is
  solid for movement, including while crouched. Invalid values return false.
- `slideMovement(x, z, nx, nz)`: advances a valid current position towards a
  desired position, sliding along cover. Bounded substeps prevent tunnelling
  through thin spawn screens on a long frame/network interval. Returned X/Z
  remains walkable. Invalid inputs or a blocked starting position leave the
  current position unchanged. Use an explicit spawn placement for teleporting;
  this function is not a spawn resolver or speed/teleport validator.
- `segmentHitsObstacle(origin, direction, maxDistance)`: returns true if the
  segment is blocked. Arrays have three finite components; distance is metres.
  Direction is normalized internally. Low cover blocks only up to its physical
  height; the arena perimeter blocks outward/inward shots. Invalid rays fail
  closed. Check with distance to the candidate player's actual hit point,
  rather than the weapon's whole range (cover behind the victim must not veto
  an otherwise valid hit).
- `chooseSpawn(team, random = Math.random)`: returns a fresh `[x, 1.6, z]` array
  from six slots for alpha or bravo. It does not reserve an occupied slot;
  occupancy/team authority belongs in the server integration.

Use the same layout functions on browser and server. Clients alone cannot
validate hits, movement speed, team ownership, respawn timing or spawn immunity.
The server's `server/pvp.js` now enforces the existing `SPAWN_SHIELD_MS` and
`RESPAWN_MS` constants; focused combat regression tests exercise those timings.

## Spawn protection finding

At eye height 1.6 m, six alpha/bravo slot pairs have direct lines of sight with
no intervening obstacle (one-based slot numbers from `SPAWNS`):

| Alpha slot | Bravo slot |
| --- | --- |
| 1 | 5 |
| 1 | 6 |
| 2 | 6 |
| 5 | 1 |
| 6 | 1 |
| 6 | 2 |

The central spawn screens do not protect these flank sightlines. The map is
still rotationally symmetric, but its spawn areas are not completely screened.
The server currently enforces temporary spawn immunity; if permanent geometric protection
is intended, the map author should adjust the flank screens and rerun ray tests.
No obstacle dimensions were changed in this support patch.

## Validation

From `server/`, run `node --test pvp-layout.test.js`, or `npm test` for all tests.
Eight layout tests cover rotational symmetry, all randomized spawn slots,
player-width connectivity to all three routes, wall tunnelling, sliding,
height-sensitive cover, metric ray lengths, perimeter and malformed rays.

These tests validate geometry contracts, not a completed two-player PvP match.
The integration session still needs to exercise team selection, death, respawn,
shield expiry and shooting players behind cover with two connected clients.

## Integration follow-up after syncing the parallel session

The support branch includes the PvP integration through `9d2c972`. All 41 tests
pass, including four added PvP tests: spawn shield expiry, cover occlusion,
kill/death/respawn accounting and friendly-fire/dead-shooter rejection. Existing
classic target-network tests now request `mode: 'targets'` explicitly because
PvP became the default room mode.

Remaining integration points for the map/session owner:

- `poseValidForPvp` currently checks only the destination with `walkable(...,.20)`
  and a speed allowance. The client now prevents tunnelling, but the server
  should also reject pose segments crossing cover, using the same collision
  radius as the client. Do not treat this client fix as server anti-cheat.
- Random spawn selection does not reserve slots and can place teammates at the
  same slot; use room occupancy when choosing a spawn if overlaps matter.
- In the synced UI, `mp-game-mode` is present but the create-room payload still
  needs its selected mode wired into `options.mode`. Keep the classic browser
  smoke scenario explicit about its mode as well.
- The browser smoke currently checks the older ammo/ADS HUD; adapt its assertions
  to the PvP HUD before claiming a complete browser PvP test.

These are handoff findings rather than unverified fixes to the parallel
session's implementation. No map visuals, teams, hit damage, timing or player
controller code were changed by this support patch.
