// m_jabayi_qaban — Жабайы қабан / Дикий кабан. Биом: Луг-степь (Дала). Роль: танк.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_jabayi_qaban","kk":"Жабайы қабан","ru":"Дикий кабан","type":"mob","biome":"step","level":6,"role":"танк"};
export const spec = {"arch":"quad","p":{"len":1.2,"r":0.36,"h":0.38,"neck":0.1,"neckUp":1.3,"head":0.26,"snout":0.9,"tusks":1,"ears":"pointy","mane":"fur:#2a1e14","tail":{"n":2,"len":0.2,"r":0.03}},"mats":{"body":"fur:#4a3a2a","belly":"fur:#5a4a3a"},"parts":[["head","box",[0.22,0.14,0.03],"trim",[0,0.17,0.2],[-0.5,0,0]]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
