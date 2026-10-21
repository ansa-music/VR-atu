// cr_samuryk — Самұрық / Самұрық. Биом: Все этажи. Роль: летун.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_samuryk","kk":"Самұрық","ru":"Самұрық","type":"cr","biome":"any","level":50,"role":"летун"};
export const spec = {"arch":"flyer","p":{"span":6,"body":0.7,"crest":"fire:#ffd040","wingMat":"feather:#c89030:orn","tipMat":"fire:#ff8030","tailMat":"feather:#c04020"},"mats":{"body":"feather:#d8a040","belly":"feather:#f0d080","eye":"fire:#ff4010","horn":"gold"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
