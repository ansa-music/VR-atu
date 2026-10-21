// m_qum_qurty — Құм құрты / Песчаный червь. Биом: Пустыня-руины (Шөл). Роль: засада.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_qum_qurty","kk":"Құм құрты","ru":"Песчаный червь","type":"mob","biome":"desert","level":44,"role":"засада"};
export const spec = {"arch":"serpent","p":{"n":10,"r":0.45,"seg":0.55,"rise":1,"headF":1.2,"spikes":1,"spikeMat":"bone"},"mats":{"body":"hide:#a08060","belly":"hide:#c0a080","eye":"eye:#ff6020"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
