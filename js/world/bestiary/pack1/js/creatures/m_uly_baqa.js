// m_uly_baqa — Улы бақа / Ядовитая жаба. Биом: Болото (Батпақ). Роль: стрелок.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_uly_baqa","kk":"Улы бақа","ru":"Ядовитая жаба","type":"mob","biome":"swamp","level":23,"role":"стрелок"};
export const spec = {"arch":"quad","p":{"len":0.55,"r":0.26,"h":0.18,"legR":0.07,"neck":0.01,"neckUp":1.4,"head":0.2,"snout":0.5},"mats":{"body":"skin:#4a6a2a","belly":"skin:#d8c070","eye":"eye:#ffa020"},"parts":[["body","sph",[0.06],"rune:#c0ff20",[0.15,0.2,-0.05],null,null,{"mirror":1}],["body","sph",[0.05],"rune:#c0ff20",[0.08,0.22,0.12],null,null,{"mirror":1,"fine":1}]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
