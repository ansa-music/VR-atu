// cr_aidahar — Айдаһар (змей) / Айдаһар — бронзовый змей. Биом: Болото (Батпақ). Роль: кастер.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"cr_aidahar","kk":"Айдаһар (змей)","ru":"Айдаһар — бронзовый змей","type":"cr","biome":"swamp","level":29,"role":"кастер"};
export const spec = {"arch":"serpent","p":{"n":16,"r":0.3,"seg":0.4,"legs":1,"rise":0.6,"horns":"dragon","whiskers":"bronze:#c07030","mane":"fur:#2a6a4a","spikes":1,"spikeMat":"bronze:#c07030"},"mats":{"body":"scales:#2a6a5a:orn","belly":"scales:#d8c890","eye":"eye:#ffe040"}};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
