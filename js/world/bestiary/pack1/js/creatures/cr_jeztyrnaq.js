// cr_jeztyrnaq — Жезтырнақ / Жезтырнақ. Биом: Пустыня-руины (Шөл). Роль: ближний бой.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_jeztyrnaq","kk":"Жезтырнақ","ru":"Жезтырнақ","type":"cr","biome":"desert","level":48,"role":"ближний бой"};
export const spec = {"arch":"biped","p":{"h":1.8,"bulk":0.8,"hair":"long","weapon":"claws","claws":1,"robe":1},"mats":{"skin":"skin:#e8d0c0","cloth":"cloth:#6a1010","cloth2":"cloth:#6a1010","hair":"fur:#101010","eye":"eye:#ff5020","claw":"bronze:#c07030","metal":"bronze:#c07030","handMat":"bronze:#c07030"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
