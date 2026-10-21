// m_ot_jyny — От жыны / Огненный джинн. Биом: Вулкан (Жанартау). Роль: кастер.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_ot_jyny","kk":"От жыны","ru":"Огненный джинн","type":"mob","biome":"volcano","level":58,"role":"кастер"};
export const spec = {"arch":"biped","p":{"h":2,"bulk":1.1,"float":1,"floatMat":"fire:#ff6a20","hat":"crown","horns":"demon","weapon":"staff"},"mats":{"cloth":"skin:#c04020","skin":"skin:#c04020","eye":"fire:#ffe060","rune":"fire:#ffa030"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
