// m_shegirtke — Шегіртке / Саранча степная (рой). Биом: Луг-степь (Дала). Роль: рой.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_shegirtke","kk":"Шегіртке","ru":"Саранча степная (рой)","type":"mob","biome":"step","level":2,"role":"рой"};
export const spec = {"arch":"bug","p":{"size":0.22,"legs":3,"legF":1.25,"wings":0.55,"antenna":1,"abd":1.3,"y":0.25},"mats":{"body":"chitin:#8a8a2a","legs":"chitin:#5a5a1a","eye":"eye:#ff4020"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
