// m_tau_teke — Тау текесі / Горный козёл-таран. Биом: Горы (Тау). Роль: камикадзе.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_tau_teke","kk":"Тау текесі","ru":"Горный козёл-таран","type":"mob","biome":"mountain","level":32,"role":"камикадзе"};
export const spec = {"arch":"quad","p":{"len":1,"r":0.26,"h":0.55,"neck":0.3,"head":0.17,"snout":0.9,"ears":"horse","horns":"ram","tail":{"n":1,"len":0.1,"r":0.04}},"mats":{"body":"fur:#8a8070","belly":"fur:#c8c0b0","horn":"bone:#6a5a48"},"parts":[["head","cone",[0.04,0.15],"fur:#5a5040",[0,-0.12,0.2],[3.14,0,0]]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
