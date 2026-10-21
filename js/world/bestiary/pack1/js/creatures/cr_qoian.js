// cr_qoian — Қоян / Заяц. Биом: Луг-степь (Дала). Роль: мирный: убегает.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_qoian","kk":"Қоян","ru":"Заяц","type":"fauna","biome":"step","level":1,"role":"мирный: убегает"};
export const spec = {"arch":"quad","behavior":"flee","p":{"len":0.4,"r":0.14,"h":0.16,"neck":0.05,"neckUp":1,"head":0.1,"snout":0.4,"ears":"long","tail":{"n":1,"len":0.06,"bushy":1}},"mats":{"body":"fur:#a8988a","belly":"fur:#e0d8d0"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
