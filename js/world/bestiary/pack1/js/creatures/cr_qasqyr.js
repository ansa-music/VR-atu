// cr_qasqyr — Қасқыр / Серый волк. Биом: Лес (Орман). Роль: мирный: бродит/убегает.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_qasqyr","kk":"Қасқыр","ru":"Серый волк","type":"fauna","biome":"forest","level":1,"role":"мирный: бродит/убегает"};
export const spec = {"arch":"quad","behavior":"flee","p":{"len":1.05,"r":0.23,"h":0.55,"neck":0.24,"neckUp":0.6,"head":0.16,"snout":1.15,"ears":"pointy","tail":{"n":3,"len":0.45,"bushy":1,"lift":-0.6}},"mats":{"body":"fur:#8a8a86","belly":"fur:#c8c8c0","eye":"eye:#d8c040"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
