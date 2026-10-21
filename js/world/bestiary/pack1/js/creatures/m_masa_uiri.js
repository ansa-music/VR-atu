// m_masa_uiri — Маса үйірі / Комариный рой. Биом: Болото (Батпақ). Роль: рой.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_masa_uiri","kk":"Маса үйірі","ru":"Комариный рой","type":"mob","biome":"swamp","level":22,"role":"рой"};
export const spec = {"arch":"bug","scale":1.4,"p":{"size":0.14,"legs":3,"legF":2,"wings":0.9,"antenna":1,"y":1.1},"mats":{"body":"chitin:#3a2a20","abdMat":"rune:#c02020","legs":"chitin:#2a1a10"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
