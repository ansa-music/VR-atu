// m_orman_orymshek — Орман өрмекшісі / Лесной паук. Биом: Лес (Орман). Роль: засада.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_orman_orymshek","kk":"Орман өрмекшісі","ru":"Лесной паук","type":"mob","biome":"forest","level":12,"role":"засада"};
export const spec = {"arch":"bug","p":{"size":0.45,"legs":4,"legF":1.4,"eyes4":1,"abd":1.4},"mats":{"body":"chitin:#2a3a1a","abdMat":"chitin:#5a3a1a:orn","legs":"chitin:#1a2010","eye":"eye:#9aff40"},"spec2":0};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
