// m_magma_silekei — Магма сілекейі / Магмовый слизень. Биом: Вулкан (Жанартау). Роль: камикадзе.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_magma_silekei","kk":"Магма сілекейі","ru":"Магмовый слизень","type":"mob","biome":"volcano","level":51,"role":"камикадзе"};
export const spec = {"arch":"slime","p":{"r":0.4},"mats":{"body":"fire:#ff4a10","eye":"eye:#ffff80"},"parts":[["body","dod",[0.15],"stone:#2a2220",[0.25,0.25,0.1]],["body","dod",[0.12],"stone:#2a2220",[-0.2,0.2,-0.15]],["body","dod",[0.1],"stone:#2a2220",[0,0.32,-0.05],null,null,{"fine":1}]],"edge":"#ffdd40"};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
