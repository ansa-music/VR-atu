// m_agash_adam — Ағаш адам / Древень-коряга. Биом: Лес (Орман). Роль: кастер.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_agash_adam","kk":"Ағаш адам","ru":"Древень-коряга","type":"mob","biome":"forest","level":17,"role":"кастер"};
export const spec = {"arch":"biped","p":{"h":2.2,"bulk":1.2,"armF":1.3,"hunch":0.25,"hair":"wild","weapon":"staff"},"mats":{"cloth":"wood:#5a4028","cloth2":"wood:#4a3020","skin":"wood:#6a5038","boot":"wood:#3a2818","hair":"fur:#3a6a24","eye":"rune:#a0ff60","rune":"rune:#a0ff60"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
