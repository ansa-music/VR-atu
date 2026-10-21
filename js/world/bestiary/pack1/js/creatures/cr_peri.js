// cr_peri — Пері / Пері. Биом: Луг-степь (Дала). Роль: кастер.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_peri","kk":"Пері","ru":"Пері","type":"cr","biome":"step","level":9,"role":"кастер"};
export const spec = {"arch":"biped","p":{"h":1.7,"bulk":0.75,"wings":"fairy","wingS":0.7,"hair":"braids","hat":"crown","robe":1},"mats":{"skin":"skin:#f0d8c8","cloth":"cloth:#e8f0ff","cloth2":"cloth:#e8f0ff","hair":"fur:#2a1a10","eye":"rune:#a0e0ff"},"parts":[["head","tor",[0.18,0.012],"rune:#ffe8a0",[0,0.32,-0.08]]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
