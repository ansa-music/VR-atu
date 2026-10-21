// m_qum_shayan — Құм шаянкесі / Песчаный скорпион. Биом: Пустыня-руины (Шөл). Роль: ближний бой.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_qum_shayan","kk":"Құм шаянкесі","ru":"Песчаный скорпион","type":"mob","biome":"desert","level":42,"role":"ближний бой"};
export const spec = {"arch":"bug","p":{"size":0.4,"legs":4,"pincers":1.2,"stinger":1,"abd":1},"mats":{"body":"chitin:#b08a50","legs":"chitin:#8a6a3a","stingMat":"rune:#80ff40"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
