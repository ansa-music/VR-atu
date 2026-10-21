// m_batpaq_shayany — Батпақ шаяны / Болотный краб. Биом: Болото (Батпақ). Роль: ближний бой.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_batpaq_shayany","kk":"Батпақ шаяны","ru":"Болотный краб","type":"mob","biome":"swamp","level":25,"role":"ближний бой"};
export const spec = {"arch":"bug","p":{"size":0.4,"legs":3,"legF":1,"pincers":1.6,"abd":0.6,"y":0.3},"mats":{"body":"chitin:#6a3a2a","legs":"chitin:#5a2a1a","eye":"eye:#202020"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
