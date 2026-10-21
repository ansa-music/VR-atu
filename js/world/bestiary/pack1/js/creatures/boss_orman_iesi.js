// boss_orman_iesi — Орман иесі / Хозяин леса. Биом: Лес (Орман). Роль: босс.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"boss_orman_iesi","kk":"Орман иесі","ru":"Хозяин леса","type":"boss","biome":"forest","level":20,"role":"босс"};
export const spec = {"arch":"biped","scale":1,"p":{"h":4.2,"bulk":1.5,"hunch":0.25,"armF":1.4,"horns":"antler","hair":"wild","weapon":"staff","claws":0.5},"mats":{"cloth":"wood:#5a4028","cloth2":"wood:#4a3020","skin":"wood:#6a5038","boot":"wood:#3a2818","hair":"fur:#3a6a24","horn":"wood:#4a3420","eye":"rune:#b0ff60","rune":"rune:#b0ff60","claw":"wood:#2a1a10"},"parts":[["chest","sph",[0.08],"rune:#ff80e0",[0.3,1.1,0.1],null,null,{"phase":2,"mirror":1}],["head","sph",[0.07],"rune:#ff80e0",[0.2,0.5,0.1],null,null,{"phase":2,"mirror":1}],["chest","box",[0.06,0.8,0.03],"rune:#b040ff",[0,0.6,0.5],null,null,{"phase":3}]],"phases":[{"name":"Древний страж","glow":1},{"name":"Цветение","glow":2,"speed":1.2,"rune":"#d0ff80"},{"name":"Гнилой гнев","glow":3.2,"speed":1.4,"scale":1.08,"rune":"#b040ff","tint":"#3a2040","edge":"#b040ff"}]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
