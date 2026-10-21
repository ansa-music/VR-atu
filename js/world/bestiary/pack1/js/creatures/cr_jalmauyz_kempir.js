// cr_jalmauyz_kempir — Жалмауыз кемпір / Жалмауыз-старуха. Биом: Лес (Орман). Роль: кастер.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_jalmauyz_kempir","kk":"Жалмауыз кемпір","ru":"Жалмауыз-старуха","type":"cr","biome":"forest","level":19,"role":"кастер"};
export const spec = {"arch":"biped","p":{"h":1.7,"hunch":0.7,"bulk":0.9,"headF":1.2,"hair":"wild","oneEye":1,"claws":0.6,"weapon":"staff","robe":0.85},"mats":{"skin":"skin:#8a9a7a","cloth":"felt:#2a2a24","cloth2":"felt:#2a2a24","hair":"fur:#d8d8d0","eye":"eye:#ff6010","rune":"rune:#ff6010"},"parts":[["chest","sph",[0.09],"skin:#8a9a7a",[0.2,0.52,-0.05],null,null,{"mirror":1}],["chest","sph",[0.08],"skin:#8a9a7a",[0.13,0.6,-0.12],null,null,{"mirror":1}],["chest","sph",[0.08],"skin:#8a9a7a",[0,0.62,-0.16]]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
