// Алтын Айдаһар / Айдаһар — золотой дракон — unique registry entry, shared procedural rig.
import { buildCreature } from '../../shared/geometry/buildCreature.js';
import { BY_ID } from '../../shared/defs/creatures.js';
export const def = BY_ID['boss_volcano_aidahar'];
export function build(THREE, opts = {}) { return buildCreature(THREE, def, opts); }
export default build;
