// m_batpaq_dauy — Батпақ дәуі / Тинный великан. Биом: Болото (Батпақ). Роль: танк.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_batpaq_dauy","kk":"Батпақ дәуі","ru":"Тинный великан","type":"mob","biome":"swamp","level":28,"role":"танк"};
export const spec = {"arch":"biped","p":{"h":2.6,"bulk":1.6,"hunch":0.5,"armF":1.4,"legF":0.8,"belly":1,"hair":"long","weapon":"club","claws":0.3},"mats":{"cloth":"skin:#4a5a3a","cloth2":"skin:#4a5a3a","skin":"skin:#4a5a3a","boot":"skin:#3a4a2a","hair":"fur:#3a5a2a","eye":"eye:#ffa020"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
