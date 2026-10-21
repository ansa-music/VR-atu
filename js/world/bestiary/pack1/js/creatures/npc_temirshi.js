// npc_temirshi — Темірші / Кузнец. Биом: Все этажи. Роль: NPC: кузнец/крафт.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"npc_temirshi","kk":"Темірші","ru":"Кузнец","type":"npc","biome":"any","level":1,"role":"NPC: кузнец/крафт"};
export const spec = {"arch":"biped","p":{"h":1.8,"bulk":1.35,"hat":"takiya","hatMat":"felt:#2a2a2a","torsoMat":"skin:#b08060","armMat":"skin:#b08060","weapon":"hammer","beard":0.5,"mustache":1,"legMat":"cloth:#3a3020"},"mats":{"skin":"skin:#b08060"},"parts":[["chest","box",[0.32,0.5,0.03],"leather",[0,0.1,0.18]]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
