// Шырақ көбелек / Фонарь-мотылёк — unique registry entry, shared procedural rig.
import { buildCreature } from '../../shared/geometry/buildCreature.js';
import { BY_ID } from '../../shared/defs/creatures.js';
export const def = BY_ID['m_lantern_moth'];
export function build(THREE, opts = {}) { return buildCreature(THREE, def, opts); }
export default build;
