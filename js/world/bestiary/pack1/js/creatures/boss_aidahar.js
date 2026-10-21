// boss_aidahar — Айдаһар / Айдаһар — золотой дракон. Биом: Вулкан (Жанартау). Роль: босс.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"boss_aidahar","kk":"Айдаһар","ru":"Айдаһар — золотой дракон","type":"boss","biome":"volcano","level":60,"role":"босс"};
export const spec = {"arch":"serpent","scale":1.6,"p":{"n":14,"r":0.5,"seg":0.6,"legs":1,"wings":3.2,"rise":0.9,"horns":"dragon","whiskers":"gold","mane":"fire:#ff6020","spikes":1,"spikeMat":"gold","tailTip":"gold"},"mats":{"body":"gold:#d4a72c:orn","belly":"scales:#e8d8a0","eye":"fire:#ff3010","wing":"hide:#9a3a1a"},"parts":[["body","box",[0.5,0.06,0.3],"rune:#ff3010:orn",[0,-0.25,-0.3],null,null,{"phase":2}],["head","sph",[0.2],"fire:#ff6020",[0,-0.1,0.4],null,null,{"phase":2}]],"weak":["body",[0,-0.4,-0.3],0.12],"phases":[{"name":"Алтын Айдаһар","glow":1},{"name":"Ашу (Гнев)","glow":2,"speed":1.2,"rune":"#ff2010"},{"name":"Тәңір оты","glow":3.2,"speed":1.4,"scale":1.08,"rune":"#ffe040","tint":"#ff8030","tintK":0.3,"edge":"#ffcc40"}]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
