// cr_diyu — Дию / Дию — одноглазый великан. Биом: Горы (Тау). Роль: танк.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_diyu","kk":"Дию","ru":"Дию — одноглазый великан","type":"cr","biome":"mountain","level":39,"role":"танк"};
export const spec = {"arch":"biped","p":{"h":3.4,"bulk":2,"oneEye":1,"horns":"demon","belly":1,"hunch":0.2,"claws":0.4,"weapon":"club"},"mats":{"skin":"skin:#7a5a8a","cloth":"hide:#4a3a2a","cloth2":"hide:#4a3a2a","boot":"skin:#6a4a7a","eye":"eye:#ffe020"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
