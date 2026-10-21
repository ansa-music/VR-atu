// m_dala_qasqyr — Дала қасқыры / Степной волк. Биом: Луг-степь (Дала). Роль: стая.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_dala_qasqyr","kk":"Дала қасқыры","ru":"Степной волк","type":"mob","biome":"step","level":3,"role":"стая"};
export const spec = {"arch":"quad","p":{"len":1.1,"r":0.24,"h":0.55,"neck":0.25,"neckUp":0.5,"head":0.17,"snout":1.2,"ears":"pointy","tail":{"n":3,"len":0.45,"bushy":1,"lift":-0.4}},"mats":{"body":"fur:#8a7a62","belly":"fur:#d6c8ad","eye":"eye:#ffb020"},"parts":[["body","box",[0.03,0.02,0.62],"rune",[0,0.225,0]]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
