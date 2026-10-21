// cr_jaryq_qongyz — Жарқырауық қоңыз / Светлячок. Биом: Лес (Орман). Роль: мирный: порхает.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_jaryq_qongyz","kk":"Жарқырауық қоңыз","ru":"Светлячок","type":"fauna","biome":"forest","level":1,"role":"мирный: порхает"};
export const spec = {"arch":"bug","behavior":"flutter","scale":1.5,"p":{"size":0.05,"legs":3,"legF":0.7,"wings":0.6,"antenna":1,"y":0.9},"mats":{"body":"chitin:#2a2010","abdMat":"rune:#c8ff40","legs":"chitin:#202010"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
