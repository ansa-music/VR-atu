// m_su_jylany — Су жыланы / Болотный змей. Биом: Болото (Батпақ). Роль: засада.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_su_jylany","kk":"Су жыланы","ru":"Болотный змей","type":"mob","biome":"swamp","level":24,"role":"засада"};
export const spec = {"arch":"serpent","p":{"n":12,"r":0.14,"seg":0.2,"rise":0.5},"mats":{"body":"scales:#2a4a3a","belly":"scales:#a0a060","eye":"eye:#ffe020"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
