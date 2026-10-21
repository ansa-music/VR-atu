// m_jarqanat — Жарқанат / Летучая мышь. Биом: Лес (Орман). Роль: летун.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_jarqanat","kk":"Жарқанат","ru":"Летучая мышь","type":"mob","biome":"forest","level":12,"role":"летун"};
export const spec = {"arch":"flyer","p":{"span":0.9,"body":0.1,"wing":"membrane","beak":0,"fangs":1,"ears":1,"tailFan":0},"mats":{"body":"fur:#3a2a2a","belly":"fur:#4a3a3a","wing":"hide:#5a3a3a","eye":"eye:#ff4040"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
