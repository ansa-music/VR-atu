// m_muz_kirpi — Мұз кірпі / Ледяной дикобраз. Биом: Горы (Тау). Роль: стрелок.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_muz_kirpi","kk":"Мұз кірпі","ru":"Ледяной дикобраз","type":"mob","biome":"mountain","level":36,"role":"стрелок"};
export const spec = {"arch":"quad","p":{"len":0.6,"r":0.25,"h":0.15,"neck":0.01,"neckUp":1.3,"head":0.12,"snout":0.7,"spikes":9,"spikeMat":"ice:#cfefff"},"mats":{"body":"fur:#5a5048","belly":"fur:#7a7068"},"parts":[["body","cone",[0.035,0.3],"ice:#cfefff",[0.18,0.12,0.05],[0,0,-0.8],null,{"mirror":1}],["body","cone",[0.035,0.3],"ice:#cfefff",[0.18,0.12,-0.15],[0,0,-0.8],null,{"mirror":1}],["body","cone",[0.035,0.3],"ice:#cfefff",[0.15,0.14,0.2],[0,0,-0.7],null,{"mirror":1,"fine":1}]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
