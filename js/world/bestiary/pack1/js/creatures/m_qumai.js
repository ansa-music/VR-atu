// m_qumai — Құмай / Гриф-падальщик. Биом: Пустыня-руины (Шөл). Роль: летун.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_qumai","kk":"Құмай","ru":"Гриф-падальщик","type":"mob","biome":"desert","level":45,"role":"летун"};
export const spec = {"arch":"flyer","p":{"span":2,"body":0.22},"mats":{"body":"feather:#3a2a20","belly":"feather:#8a6a4a","headMat":"skin:#c09080"},"parts":[["head","tor",[0.1,0.05],"feather:#e8e0d0",[0,-0.08,-0.08],[1.57,0,0]]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
