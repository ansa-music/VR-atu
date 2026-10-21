// m_quzgyn — Құзғын / Ворон-лазутчик. Биом: Луг-степь (Дала). Роль: летун.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_quzgyn","kk":"Құзғын","ru":"Ворон-лазутчик","type":"mob","biome":"step","level":5,"role":"летун"};
export const spec = {"arch":"flyer","p":{"span":1.1,"body":0.13,"beak":1.2},"mats":{"body":"feather:#15151c","belly":"feather:#25252e","eye":"eye:#ff3030","horn":"bone:#202020"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
