// m_sagym_jyny — Сағым жыны / Дух-мираж. Биом: Пустыня-руины (Шөл). Роль: кастер.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_sagym_jyny","kk":"Сағым жыны","ru":"Дух-мираж","type":"mob","biome":"desert","level":47,"role":"кастер"};
export const spec = {"arch":"wisp","p":{"r":0.35,"coreMat":"rune:#ffd080","shellMat":"ice:#ffe8b0","shards":5,"shardType":"dod","shardMat":"gold","tailCone":1,"eye":1},"edge":"#ffd080"};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
