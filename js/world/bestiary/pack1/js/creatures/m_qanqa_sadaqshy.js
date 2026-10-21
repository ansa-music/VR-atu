// m_qanqa_sadaqshy — Қаңқа садақшы / Скелет-лучник. Биом: Пустыня-руины (Шөл). Роль: стрелок.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_qanqa_sadaqshy","kk":"Қаңқа садақшы","ru":"Скелет-лучник","type":"mob","biome":"desert","level":43,"role":"стрелок"};
export const spec = {"arch":"biped","p":{"h":1.75,"bulk":0.6,"weapon":"bow","hat":"hood"},"mats":{"cloth":"bone:#d8ceb0","cloth2":"bone:#c8bea0","skin":"bone:#e0d6b8","boot":"bone:#c8bea0","eye":"rune:#ff6020"},"hatMat":0,"parts":[["chest","tor",[0.12,0.015],"bone:#d8ceb0",[0,0.3,0],[1.57,0,0]],["chest","tor",[0.11,0.015],"bone:#d8ceb0",[0,0.4,0],[1.57,0,0],null,{"fine":1}]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
