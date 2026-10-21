// m_qar_qasqyry — Қар қасқыры / Снежный волк. Биом: Горы (Тау). Роль: стая.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_qar_qasqyry","kk":"Қар қасқыры","ru":"Снежный волк","type":"mob","biome":"mountain","level":31,"role":"стая"};
export const spec = {"arch":"quad","p":{"len":1.2,"r":0.27,"h":0.6,"neck":0.28,"neckUp":0.55,"head":0.19,"snout":1.2,"ears":"pointy","tail":{"n":3,"len":0.5,"bushy":1,"lift":-0.4},"spikes":4,"spikeMat":"ice:#bfe8ff"},"mats":{"body":"fur:#e8ecf0","belly":"fur:#ffffff","eye":"eye:#60d0ff"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
