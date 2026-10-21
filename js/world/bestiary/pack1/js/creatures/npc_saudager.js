// npc_saudager — Саудагер / Торговец. Биом: Все этажи. Роль: NPC: торговец.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"npc_saudager","kk":"Саудагер","ru":"Торговец","type":"npc","biome":"any","level":1,"role":"NPC: торговец"};
export const spec = {"arch":"biped","p":{"h":1.75,"bulk":1.25,"belly":1,"hat":"takiya","hatMat":"cloth:#2a5a2a:orn","robe":0.9,"robeMat":"cloth:#2a4a8a:orn","torsoMat":"cloth:#2a4a8a","armMat":"cloth:#2a4a8a","weapon":"scales","beard":0.5,"mustache":1},"mats":{"skin":"skin:#c99a74"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
