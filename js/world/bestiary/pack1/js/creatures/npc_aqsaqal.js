// npc_aqsaqal — Ақсақал / Аксакал. Биом: Все этажи. Роль: NPC: мудрец/квесты.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"npc_aqsaqal","kk":"Ақсақал","ru":"Аксакал","type":"npc","biome":"any","level":1,"role":"NPC: мудрец/квесты"};
export const spec = {"arch":"biped","p":{"h":1.7,"bulk":0.95,"hunch":0.2,"hat":"borik","hatMat":"cloth:#5a1a1a","robe":1,"robeMat":"cloth:#3a3a5a:orn","torsoMat":"cloth:#3a3a5a","armMat":"cloth:#3a3a5a","beard":1.6,"beardMat":"fur:#f0f0f0","mustache":1,"weapon":"staff"},"mats":{"skin":"skin:#b98a64"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
