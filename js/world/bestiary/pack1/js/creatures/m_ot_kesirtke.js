// m_ot_kesirtke — От кесірткесі / Огненная саламандра. Биом: Вулкан (Жанартау). Роль: ближний бой.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_ot_kesirtke","kk":"От кесірткесі","ru":"Огненная саламандра","type":"mob","biome":"volcano","level":52,"role":"ближний бой"};
export const spec = {"arch":"quad","p":{"len":1.2,"r":0.2,"h":0.22,"neck":0.1,"neckUp":1.3,"head":0.16,"snout":1.2,"tail":{"n":5,"len":1,"r":0.12,"lift":-0.1},"spikes":7,"spikeMat":"fire:#ff8020"},"mats":{"body":"scales:#3a1a10","belly":"fire:#ff5010","eye":"eye:#ffe060"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
