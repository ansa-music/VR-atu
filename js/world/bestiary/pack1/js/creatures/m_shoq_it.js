// m_shoq_it — Шоқ ит / Адская гончая. Биом: Вулкан (Жанартау). Роль: стая.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_shoq_it","kk":"Шоқ ит","ru":"Адская гончая","type":"mob","biome":"volcano","level":54,"role":"стая"};
export const spec = {"arch":"quad","p":{"len":1.15,"r":0.27,"h":0.55,"neck":0.25,"neckUp":0.6,"head":0.2,"snout":1,"ears":"pointy","tail":{"n":3,"len":0.5,"tip":"sph","tipMat":"fire:#ff6020"},"spikes":5,"spikeMat":"bone:#2a1a14"},"mats":{"body":"hide:#2a1a16","belly":"fire:#ff4010","eye":"fire:#ffb020"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
