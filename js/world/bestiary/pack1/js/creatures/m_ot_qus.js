// m_ot_qus — От құсы / Огненная птица. Биом: Вулкан (Жанартау). Роль: летун.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_ot_qus","kk":"От құсы","ru":"Огненная птица","type":"mob","biome":"volcano","level":53,"role":"летун"};
export const spec = {"arch":"flyer","p":{"span":1.3,"body":0.15,"crest":"fire:#ffd040","wingMat":"fire:#ff8a20","tipMat":"fire:#ffd040","tailMat":"fire:#ffd040"},"mats":{"body":"fire:#ff5a10","belly":"fire:#ff7a20","headMat":"fire:#ff5a10"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
