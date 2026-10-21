// m_kone_kuzetshi — Көне күзетші / Древний страж-мумия. Биом: Пустыня-руины (Шөл). Роль: танк.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_kone_kuzetshi","kk":"Көне күзетші","ru":"Древний страж-мумия","type":"mob","biome":"desert","level":46,"role":"танк"};
export const spec = {"arch":"biped","p":{"h":1.9,"bulk":0.9,"weapon":"spear","shield":1},"mats":{"cloth":"cloth:#c8b890","cloth2":"cloth:#b8a880","skin":"cloth:#d0c098","boot":"cloth:#a89870","eye":"rune:#40ffd0"},"parts":[["head","box",[0.2,0.22,0.05],"gold:#d4a72c:orn",[0,0.15,0.12]]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
