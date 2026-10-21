// m_balbal_saqshy — Балбал-сақшы / Страж-балбал. Биом: Луг-степь (Дала). Роль: стрелок.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_balbal_saqshy","kk":"Балбал-сақшы","ru":"Страж-балбал","type":"mob","biome":"step","level":8,"role":"стрелок"};
export const spec = {"arch":"biped","p":{"h":1.9,"bulk":1.3,"legF":0.8,"mustache":1},"mats":{"cloth":"stone:#8c8472","cloth2":"stone:#7c7462","skin":"stone:#9c9482","boot":"stone:#6c6452","eye":"rune:#40e0ff","hair":"stone:#6c6452"},"parts":[["chest","box",[0.16,0.36,0.02],"rune:#40e0ff:orn",[0,0.32,0.19]],["handR","dod",[0.12],"stone:#6d675a",[0,-0.12,0]]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
