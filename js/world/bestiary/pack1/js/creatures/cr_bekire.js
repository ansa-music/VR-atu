// cr_bekire — Бекіре / Осётр. Биом: Болото (Батпақ). Роль: мирный: плавает.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_bekire","kk":"Бекіре","ru":"Осётр","type":"fauna","biome":"swamp","level":1,"role":"мирный: плавает"};
export const spec = {"arch":"fish","behavior":"swim","p":{"len":0.9,"whiskers":1},"mats":{"body":"scales:#5a6a6a","belly":"scales:#c8c8c0","fin":"hide:#4a5a5a"},"parts":[["body","cone",[0.03,0.06],"bone",[0,0.22,0.15]],["body","cone",[0.03,0.06],"bone",[0,0.22,-0.05]],["body","cone",[0.03,0.06],"bone",[0,0.2,-0.25],null,null,{"fine":1}]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
