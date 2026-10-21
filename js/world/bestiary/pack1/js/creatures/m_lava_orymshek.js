// m_lava_orymshek — Лава өрмекшісі / Лавовый паук-плевун. Биом: Вулкан (Жанартау). Роль: стрелок.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_lava_orymshek","kk":"Лава өрмекшісі","ru":"Лавовый паук-плевун","type":"mob","biome":"volcano","level":55,"role":"стрелок"};
export const spec = {"arch":"bug","p":{"size":0.5,"legs":4,"legF":1.2,"eyes4":1,"abd":1.4},"mats":{"body":"stone:#2a2020","abdMat":"fire:#ff4a10","legs":"stone:#1a1414","eye":"fire:#ffe040"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
