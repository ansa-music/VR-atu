// cr_tulki — Түлкі / Лиса. Биом: Луг-степь (Дала). Роль: мирный: убегает.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_tulki","kk":"Түлкі","ru":"Лиса","type":"fauna","biome":"step","level":1,"role":"мирный: убегает"};
export const spec = {"arch":"quad","behavior":"flee","p":{"len":0.7,"r":0.15,"h":0.3,"neck":0.12,"head":0.12,"snout":1.3,"ears":"pointy","tail":{"n":4,"len":0.5,"bushy":1,"lift":-0.3}},"mats":{"body":"fur:#c8601a","belly":"fur:#f0e8e0"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
