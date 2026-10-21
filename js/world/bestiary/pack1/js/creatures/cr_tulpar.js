// cr_tulpar — Тұлпар / Тұлпар. Биом: Все этажи. Роль: летун.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_tulpar","kk":"Тұлпар","ru":"Тұлпар","type":"cr","biome":"any","level":30,"role":"летун"};
export const spec = {"arch":"quad","p":{"len":1.5,"r":0.33,"h":0.95,"neck":0.6,"neckUp":0.45,"head":0.2,"snout":1.3,"ears":"horse","mane":"fur:#f0f0f0","tail":{"n":3,"len":0.8,"r":0.06,"lift":-0.9},"hoof":"gold","wings":1.4},"mats":{"body":"fur:#f4f0e8","belly":"fur:#f4f0e8"},"parts":[["body","box",[0.5,0.05,0.55],"trim",[0,0.33,0.1]]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
