// m_sileusin — Сілеусін / Рысь-тень. Биом: Лес (Орман). Роль: ближний бой.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_sileusin","kk":"Сілеусін","ru":"Рысь-тень","type":"mob","biome":"forest","level":13,"role":"ближний бой"};
export const spec = {"arch":"quad","p":{"len":0.95,"r":0.2,"h":0.45,"neck":0.18,"head":0.15,"snout":0.6,"ears":"pointy","tail":{"n":1,"len":0.12,"r":0.05}},"mats":{"body":"fur:#a89070","belly":"fur:#e0d0b8","eye":"eye:#c8ff40"},"parts":[["head","cone",[0.015,0.12],"hair",[0.07,0.28,-0.03],null,null,{"mirror":1,"fine":1}]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
