// cr_kiik — Ақбөкен / Сайгак. Биом: Луг-степь (Дала). Роль: мирный: убегает.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_kiik","kk":"Ақбөкен","ru":"Сайгак","type":"fauna","biome":"step","level":1,"role":"мирный: убегает"};
export const spec = {"arch":"quad","behavior":"flee","p":{"len":0.9,"r":0.22,"h":0.55,"neck":0.2,"head":0.14,"snout":1,"ears":"pointy","horns":"saiga","tail":{"n":1,"len":0.08,"r":0.03}},"mats":{"body":"fur:#d0b080","belly":"fur:#f0e4cc","horn":"bone:#e0c890"},"parts":[["head","sph",[0.09],"fur:#c8a878",[0,0.05,0.22],null,[1,1,1.3]]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
