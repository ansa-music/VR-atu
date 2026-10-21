// m_jarylgysh_sanyrauqulaq — Жарылғыш саңырауқұлақ / Гриб-взрывун. Биом: Лес (Орман). Роль: камикадзе.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"m_jarylgysh_sanyrauqulaq","kk":"Жарылғыш саңырауқұлақ","ru":"Гриб-взрывун","type":"mob","biome":"forest","level":15,"role":"камикадзе"};
export const spec = {"arch":"slime","p":{"r":0.35,"shroom":1},"mats":{"body":"skin:#b02a20","belly":"skin:#f0e8d8","skin":"skin:#e8dcc0","eye":"eye:#202020"},"parts":[["body","sph",[0.05],"rune:#ffe040",[0.2,0.05,0.25],null,null,{"mirror":1,"fine":1}]]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
