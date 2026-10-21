// m_aq_barys — Ақ барыс / Снежный барс. Биом: Горы (Тау). Роль: засада.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_aq_barys","kk":"Ақ барыс","ru":"Снежный барс","type":"mob","biome":"mountain","level":34,"role":"засада"};
export const spec = {"arch":"quad","p":{"len":1.1,"r":0.22,"h":0.45,"neck":0.2,"head":0.15,"snout":0.6,"ears":"round","tail":{"n":4,"len":0.9,"r":0.07,"lift":-0.2,"curl":0.2}},"mats":{"body":"fur:#cfc8b8:orn","belly":"fur:#eeeae0","eye":"eye:#60d0ff"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
