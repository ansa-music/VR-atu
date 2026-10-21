// m_qonyr_ayu — Қоңыр аю / Бурый медведь-шатун. Биом: Лес (Орман). Роль: танк.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_qonyr_ayu","kk":"Қоңыр аю","ru":"Бурый медведь-шатун","type":"mob","biome":"forest","level":14,"role":"танк"};
export const spec = {"arch":"quad","scale":1.1,"p":{"len":1.5,"r":0.5,"h":0.55,"neck":0.2,"neckUp":1.1,"head":0.3,"snout":0.7,"ears":"round","tail":{"n":1,"len":0.1,"r":0.06}},"mats":{"body":"fur:#4a3020","belly":"fur:#6a4a32"},"parts":[["body","sph",[0.3],"fur:#4a6a2a",[0,0.42,-0.1],null,[1.4,0.4,1.6]]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
