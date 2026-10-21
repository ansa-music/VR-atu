// boss_qum_patshasy — Құм патшасы / Песчаный царь-скорпион. Биом: Пустыня-руины (Шөл). Роль: босс.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"boss_qum_patshasy","kk":"Құм патшасы","ru":"Песчаный царь-скорпион","type":"boss","biome":"desert","level":50,"role":"босс"};
export const spec = {"arch":"bug","scale":1.5,"p":{"size":1.2,"legs":4,"pincers":1.4,"stinger":1,"abd":1.2},"mats":{"body":"gold:#b08a3a:orn","legs":"chitin:#3a2a1a","stingMat":"rune:#a040ff","eye":"rune:#a040ff"},"parts":[["head","box",[0.35,0.3,0.05],"gold:#e8c050",[0,0.2,0.45],[-0.4,0,0],null,{"phase":2}],["body","box",[0.08,0.5,0.05],"rune:#a040ff",[0,0.35,-0.9],[1.2,0,0.4],null,{"phase":3}]],"phases":[{"name":"Страж гробницы","glow":1},{"name":"Пробуждённый фараон","glow":2,"speed":1.2,"rune":"#c060ff"},{"name":"Проклятие песков","glow":3.2,"speed":1.4,"scale":1.08,"rune":"#ff40ff","tint":"#504070","tintK":0.25,"edge":"#c060ff"}]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
