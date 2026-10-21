// m_qaraqurt — Қарақұрт / Каракурт. Биом: Пустыня-руины (Шөл). Роль: рой.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_qaraqurt","kk":"Қарақұрт","ru":"Каракурт","type":"mob","biome":"desert","level":41,"role":"рой"};
export const spec = {"arch":"bug","p":{"size":0.2,"legs":4,"legF":1.3,"eyes4":1,"abd":1.3},"mats":{"body":"chitin:#101010","abdMat":"chitin:#151010","legs":"chitin:#0a0a0a","eye":"eye:#ff2020"},"parts":[["body","sph",[0.03],"rune:#ff2020",[0.05,0.12,-0.25],null,null,{"mirror":1}]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
