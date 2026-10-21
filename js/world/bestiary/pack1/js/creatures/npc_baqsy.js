// npc_baqsy — Бақсы / Шаман-баксы. Биом: Все этажи. Роль: NPC: шаман/баффы.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"npc_baqsy","kk":"Бақсы","ru":"Шаман-баксы","type":"npc","biome":"any","level":1,"role":"NPC: шаман/баффы"};
export const spec = {"arch":"biped","p":{"h":1.8,"bulk":0.95,"hat":"shaman","robe":1,"robeMat":"hide:#6a5a3a","torsoMat":"hide:#6a5a3a:orn","armMat":"hide:#6a5a3a","weapon":"drum","hair":"long"},"mats":{"skin":"skin:#b98a64","hair":"fur:#1a1410"},"parts":[["chest","oct",[0.03],"rune:#38e0ff",[0.08,0.2,0.19],null,null,{"mirror":1}],["chest","oct",[0.03],"rune:#38e0ff",[0,0.15,0.2]]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
