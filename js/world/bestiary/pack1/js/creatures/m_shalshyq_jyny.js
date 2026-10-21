// m_shalshyq_jyny — Шалшық жыны / Болотный огонёк. Биом: Болото (Батпақ). Роль: кастер.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_shalshyq_jyny","kk":"Шалшық жыны","ru":"Болотный огонёк","type":"mob","biome":"swamp","level":26,"role":"кастер"};
export const spec = {"arch":"wisp","p":{"r":0.25,"y":1.1,"coreMat":"rune:#80ff90","shellMat":"ice:#90ffb0","eye":1,"shards":3,"shardMat":"rune:#60ff80","tailCone":1},"edge":"#80ff90"};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
