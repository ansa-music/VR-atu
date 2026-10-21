// cr_jylqy — Жылқы / Конь. Биом: Луг-степь (Дала). Роль: мирный: пасётся.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_jylqy","kk":"Жылқы","ru":"Конь","type":"fauna","biome":"step","level":1,"role":"мирный: пасётся"};
export const spec = {"arch":"quad","behavior":"graze","p":{"len":1.4,"r":0.31,"h":0.9,"neck":0.55,"neckUp":0.45,"head":0.19,"snout":1.3,"ears":"horse","mane":"fur:#1a1410","tail":{"n":3,"len":0.7,"r":0.06,"lift":-0.9,"mat":"fur:#1a1410"},"hoof":"bone:#2a2018"},"mats":{"body":"fur:#7a4a28","belly":"fur:#8a5a38"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
