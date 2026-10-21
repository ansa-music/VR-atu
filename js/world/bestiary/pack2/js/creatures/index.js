// No bundler: dynamic import per ID. Safe allowlist blocks path injection.
import { BY_ID } from '../../shared/defs/creatures.js';
export async function loadCreature(id) {
  if (!Object.prototype.hasOwnProperty.call(BY_ID,id)) throw new Error(`Unknown creature ${id}`);
  return import(`./${id}.js`);
}
