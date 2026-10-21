// m_muz_ruhy — Мұз рухы / Ледяной дух. Биом: Горы (Тау). Роль: кастер.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_muz_ruhy","kk":"Мұз рухы","ru":"Ледяной дух","type":"mob","biome":"mountain","level":35,"role":"кастер"};
export const spec = {"arch":"wisp","p":{"r":0.3,"coreMat":"rune:#a0e8ff","shellMat":"ice:#d0f4ff","shards":6,"shardMat":"ice:#c0ecff","shardS":1.2,"eye":1},"edge":"#a0e8ff"};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
