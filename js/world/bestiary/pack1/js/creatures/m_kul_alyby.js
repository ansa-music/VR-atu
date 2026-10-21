// m_kul_alyby — Күл алыбы / Обсидиановый голем. Биом: Вулкан (Жанартау). Роль: танк.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_kul_alyby","kk":"Күл алыбы","ru":"Обсидиановый голем","type":"mob","biome":"volcano","level":57,"role":"танк"};
export const spec = {"arch":"biped","p":{"h":2.4,"bulk":1.6,"armF":1.2,"legF":0.75},"mats":{"cloth":"chitin:#15121a","cloth2":"chitin:#15121a","skin":"chitin:#1a161e","boot":"chitin:#100d12","eye":"fire:#ff6020"},"parts":[["chest","box",[0.04,0.35,0.02],"fire:#ff5010",[0.1,0.35,0.21],[0,0,0.4]],["chest","box",[0.04,0.3,0.02],"fire:#ff5010",[-0.1,0.3,0.21],[0,0,-0.5]]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
