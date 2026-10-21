// npc_saukele_qyz — Сәукелелі қыз / Девушка в саукеле. Биом: Все этажи. Роль: NPC: квесты.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"npc_saukele_qyz","kk":"Сәукелелі қыз","ru":"Девушка в саукеле","type":"npc","biome":"any","level":1,"role":"NPC: квесты"};
export const spec = {"arch":"biped","p":{"h":1.65,"bulk":0.8,"hat":"saukele","robe":1.1,"longRobe":1,"robeMat":"cloth:#c0182a:orn","torsoMat":"cloth:#f2efe6","armMat":"cloth:#f2efe6","hair":"braids"},"mats":{"skin":"skin:#e0b898"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
