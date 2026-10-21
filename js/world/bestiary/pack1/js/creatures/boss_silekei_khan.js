// boss_silekei_khan — Сілекей хан / Слизень-король. Биом: Болото (Батпақ). Роль: босс.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"boss_silekei_khan","kk":"Сілекей хан","ru":"Слизень-король","type":"boss","biome":"swamp","level":30,"role":"босс"};
export const spec = {"arch":"slime","scale":1.6,"p":{"r":1.1,"crown":1,"blobs":6},"mats":{"body":"slime:#4aa04a","eye":"eye:#ffff60"},"parts":[["body","box",[0.06,0.9,0.02],"metal",[0.3,0,0],[0,0,0.6]],["body","box",[0.06,0.8,0.02],"metal",[-0.35,-0.1,0.2],[0.3,0,-0.8]],["body","cone",[0.12,0.5],"slime:#4aa04a",[0.7,0.4,0.3],[0,0,-0.9],null,{"phase":2,"mirror":1}],["body","cone",[0.12,0.5],"slime:#4aa04a",[0,0.6,-0.7],[-0.9,0,0],null,{"phase":2}],["body","sph",[0.25],"slime:#a040c0",[1.5,0,0],null,null,{"phase":3,"mirror":1}],["body","sph",[0.25],"slime:#a040c0",[0,0,-1.5],null,null,{"phase":3}]],"weak":["body",[0,0,0],0.18],"phases":[{"name":"Хан болота","glow":1},{"name":"Шипастый гнев","glow":2,"speed":1.2,"tint":"#80c040"},{"name":"Раскол","glow":3.2,"speed":1.4,"scale":1.08,"tint":"#9040b0","tintK":0.6,"rune":"#ff40ff","edge":"#ff40ff"}]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
