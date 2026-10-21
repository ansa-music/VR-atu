// cr_kobelek — Көбелек / Бабочка. Биом: Луг-степь (Дала). Роль: мирный: порхает.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_kobelek","kk":"Көбелек","ru":"Бабочка","type":"fauna","biome":"step","level":1,"role":"мирный: порхает"};
export const spec = {"arch":"bug","behavior":"flutter","scale":1.5,"p":{"size":0.07,"legs":3,"legF":0.7,"wings":1.1,"antenna":1,"y":1},"mats":{"body":"chitin:#202020","wingi":"cloth:#2a6aff:orn","legs":"chitin:#202020"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
