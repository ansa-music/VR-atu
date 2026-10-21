// m_dala_shary — Дала шары / Огненное перекати-поле. Биом: Луг-степь (Дала). Роль: камикадзе.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_dala_shary","kk":"Дала шары","ru":"Огненное перекати-поле","type":"mob","biome":"step","level":7,"role":"камикадзе"};
export const spec = {"arch":"wisp","p":{"r":0.35,"y":0.4,"coreMat":"fire:#ff7a1a","shell":0,"shards":8,"shardMat":"wood:#9a7a4a","shardS":0.8,"flame":"fire:#ffb030"},"edge":"#ffb040"};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
