// cr_albasty — Албасты / Албасты. Биом: Болото (Батпақ). Роль: засада.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_albasty","kk":"Албасты","ru":"Албасты","type":"cr","biome":"swamp","level":27,"role":"засада"};
export const spec = {"arch":"biped","p":{"h":1.8,"bulk":0.8,"hair":"long","backFeet":1,"claws":0.4,"robe":0.9},"mats":{"skin":"skin:#d8c8b0","cloth":"cloth:#e8e0d0","cloth2":"skin:#d8c8b0","boot":"skin:#c8b8a0","hair":"fur:#d8c890","eye":"eye:#ff2020"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
