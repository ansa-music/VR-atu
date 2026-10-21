// m_batpaq_silekei — Батпақ сілекейі / Болотный слизень. Биом: Болото (Батпақ). Роль: ближний бой.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_batpaq_silekei","kk":"Батпақ сілекейі","ru":"Болотный слизень","type":"mob","biome":"swamp","level":21,"role":"ближний бой"};
export const spec = {"arch":"slime","p":{"r":0.4},"mats":{"body":"slime:#5a8a2a","eye":"eye:#ffff60"},"parts":[["body","box",[0.04,0.25,0.04],"bone",[0.1,0,0],[0,0,0.7]],["body","sph",[0.06],"bone",[-0.12,-0.05,0.05]]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
