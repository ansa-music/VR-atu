// m_jabayi_ara — Жабайы ара / Дикая оса (рой). Биом: Лес (Орман). Роль: рой.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_jabayi_ara","kk":"Жабайы ара","ru":"Дикая оса (рой)","type":"mob","biome":"forest","level":11,"role":"рой"};
export const spec = {"arch":"bug","scale":1.2,"p":{"size":0.2,"legs":3,"legF":0.8,"wings":0.7,"antenna":1,"abd":1.1,"y":0.9,"stinger":0},"mats":{"body":"chitin:#d8a010","abdMat":"chitin:#2a1a08","eye":"eye:#ff2020"},"parts":[["body","cone",[0.04,0.14],"rune:#a0ff30",[0,0.02,-0.42],[-1.57,0,0]]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
