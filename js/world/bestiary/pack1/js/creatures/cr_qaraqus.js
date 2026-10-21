// cr_qaraqus — Қарақұс / Қарақұс — чёрный орёл. Биом: Горы (Тау). Роль: летун.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_qaraqus","kk":"Қарақұс","ru":"Қарақұс — чёрный орёл","type":"cr","biome":"mountain","level":38,"role":"летун"};
export const spec = {"arch":"flyer","p":{"span":3,"body":0.4,"beak":1.3,"crest":"feather:#202028"},"mats":{"body":"feather:#101014","belly":"feather:#2a2a30","eye":"eye:#ff3030","horn":"gold"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
