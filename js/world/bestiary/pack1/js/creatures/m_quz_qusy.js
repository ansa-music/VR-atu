// m_quz_qusy — Құз құсы / Скальная гарпия. Биом: Горы (Тау). Роль: летун.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_quz_qusy","kk":"Құз құсы","ru":"Скальная гарпия","type":"mob","biome":"mountain","level":33,"role":"летун"};
export const spec = {"arch":"flyer","p":{"span":1.6,"body":0.18,"crest":"feather:#c04020","headF":1.1,"beak":0.4},"mats":{"body":"feather:#6a5a4a","belly":"feather:#9a8a7a","headMat":"skin:#c8a080","eye":"eye:#ffd020"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
