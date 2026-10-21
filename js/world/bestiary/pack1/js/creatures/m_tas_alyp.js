// m_tas_alyp — Тас алып / Каменный голем. Биом: Горы (Тау). Роль: танк.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_tas_alyp","kk":"Тас алып","ru":"Каменный голем","type":"mob","biome":"mountain","level":37,"role":"танк"};
export const spec = {"arch":"biped","p":{"h":2.5,"bulk":1.8,"armF":1.3,"legF":0.7},"mats":{"cloth":"stone:#7a7a80","cloth2":"stone:#6a6a70","skin":"stone:#8a8a90","boot":"stone:#5a5a60","eye":"rune:#40c0ff"},"parts":[["chest","oct",[0.15],"ice:#a0e0ff",[0.4,0.75,-0.05],null,[1,2,1],{"mirror":1}],["chest","box",[0.3,0.04,0.02],"rune:#40c0ff",[0,0.4,0.22]]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
