// m_tas_kesirtke — Тас кесіртке / Каменная ящерица. Биом: Луг-степь (Дала). Роль: засада.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_tas_kesirtke","kk":"Тас кесіртке","ru":"Каменная ящерица","type":"mob","biome":"step","level":4,"role":"засада"};
export const spec = {"arch":"quad","p":{"len":1,"r":0.16,"h":0.18,"legR":0.05,"neck":0.06,"neckUp":1.45,"head":0.14,"snout":1.4,"tail":{"n":5,"len":0.9,"r":0.1,"lift":-0.1},"spikes":6,"spikeMat":"stone:#6a6a62"},"mats":{"body":"scales:#8a7f6a","belly":"scales:#c2b28f","eye":"eye:#ffe040"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
