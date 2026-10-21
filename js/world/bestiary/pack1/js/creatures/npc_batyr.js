// npc_batyr — Батыр / Батыр. Биом: Все этажи. Роль: NPC: страж/квесты.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"npc_batyr","kk":"Батыр","ru":"Батыр","type":"npc","biome":"any","level":1,"role":"NPC: страж/квесты"};
export const spec = {"arch":"biped","p":{"h":1.85,"bulk":1.15,"hat":"helmet","robe":0.5,"robeMat":"metal:#7a7f86","torsoMat":"metal:#9aa0a6","armMat":"leather:#5b3a22","weapon":"sword","shield":1,"mustache":1,"beard":0.4},"mats":{"skin":"skin:#c99a74","hair":"fur:#1a1410","cloth2":"cloth:#3a2a1a"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
