// cr_qoi — Қой / Овца курдючная. Биом: Луг-степь (Дала). Роль: мирный: пасётся.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_qoi","kk":"Қой","ru":"Овца курдючная","type":"fauna","biome":"step","level":1,"role":"мирный: пасётся"};
export const spec = {"arch":"quad","behavior":"graze","p":{"len":0.8,"r":0.3,"h":0.35,"neck":0.12,"head":0.14,"snout":0.8,"ears":"round","horns":"ram","legMat":"skin:#2a2018"},"mats":{"body":"fur:#e8e0d0","belly":"fur:#e0d8c8"},"parts":[["body","sph",[0.18],"fur:#e8e0d0",[0,-0.05,-0.42]],["head","sph",[0.12],"skin:#3a2a20",[0,0.02,0.12],null,[0.9,0.9,1.2]]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
