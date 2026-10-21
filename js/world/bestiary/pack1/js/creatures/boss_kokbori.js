// boss_kokbori — Көкбөрі / Небесный волк-вожак. Биом: Луг-степь (Дала). Роль: босс.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"boss_kokbori","kk":"Көкбөрі","ru":"Небесный волк-вожак","type":"boss","biome":"step","level":10,"role":"босс"};
export const spec = {"arch":"quad","scale":2.2,"p":{"len":1.4,"r":0.32,"h":0.7,"neck":0.35,"neckUp":0.55,"head":0.22,"snout":1.2,"ears":"pointy","mane":"fur:#5a6a7a","tail":{"n":3,"len":0.6,"bushy":1,"lift":-0.4}},"mats":{"body":"fur:#6a7a8a","belly":"fur:#c0c8d0","eye":"eye:#60d0ff"},"parts":[["neck","tor",[0.17,0.03],"rune:#40d0ff:orn",[0,0.12,0],[1.57,0,0]],["body","cone",[0.05,0.35],"rune:#80e0ff",[0,0.35,0.3],[-0.3,0,0],null,{"phase":2}],["body","cone",[0.05,0.35],"rune:#80e0ff",[0,0.35,0],[-0.3,0,0],null,{"phase":2}],["body","cone",[0.05,0.35],"rune:#80e0ff",[0,0.35,-0.3],[-0.3,0,0],null,{"phase":2}],["head","cone",[0.03,0.3],"rune:#ffffff",[0.1,0.3,-0.05],[-0.4,0,-0.3],null,{"phase":3,"mirror":1}]],"phases":[{"name":"Вожак стаи","glow":1},{"name":"Небесный вой","glow":2,"speed":1.2,"rune":"#a0f0ff","tint":"#9ab0c8"},{"name":"Тәңір қасқыры","glow":3.2,"speed":1.4,"scale":1.08,"rune":"#ffffff","tint":"#c0d8ff","edge":"#80e0ff"}]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
