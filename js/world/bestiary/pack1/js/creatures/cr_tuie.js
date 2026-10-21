// cr_tuie — Түйе / Двугорбый верблюд. Биом: Пустыня-руины (Шөл). Роль: мирный: пасётся.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_tuie","kk":"Түйе","ru":"Двугорбый верблюд","type":"fauna","biome":"desert","level":1,"role":"мирный: пасётся"};
export const spec = {"arch":"quad","behavior":"graze","p":{"len":1.5,"r":0.38,"h":1,"neck":0.75,"neckUp":0.35,"head":0.17,"snout":1.4,"ears":"round","hump":2,"tail":{"n":2,"len":0.3,"r":0.04,"lift":-1.2}},"mats":{"body":"fur:#b8946a","belly":"fur:#a8845a"},"parts":[["body","box",[0.7,0.03,0.5],"cloth:#a01a20:orn",[0,0.37,0]]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
