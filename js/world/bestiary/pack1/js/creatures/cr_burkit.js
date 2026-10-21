// cr_burkit — Бүркіт / Беркут. Биом: Горы (Тау). Роль: мирный: летает.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_burkit","kk":"Бүркіт","ru":"Беркут","type":"fauna","biome":"mountain","level":1,"role":"мирный: летает"};
export const spec = {"arch":"flyer","behavior":"fly","p":{"span":2,"body":0.2},"mats":{"body":"feather:#5a3a1a","belly":"feather:#7a5a30","headMat":"feather:#c89040","horn":"bone:#3a3020"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
