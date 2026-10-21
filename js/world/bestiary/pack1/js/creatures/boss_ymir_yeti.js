// boss_ymir_yeti — Ймир-йети / Ймир-йети. Биом: Горы (Тау). Роль: босс.
// Процедурная модель VR-atu (Three.js 0.160, ES-модуль). Общий код — ./_lib.js.
import { makeCreature } from './_lib.js';

export const meta = {"id":"boss_ymir_yeti","kk":"Ймир-йети","ru":"Ймир-йети","type":"boss","biome":"mountain","level":40,"role":"босс"};
export const spec = {"arch":"biped","p":{"h":3.8,"bulk":1.9,"armF":1.4,"legF":0.85,"hunch":0.3,"belly":1,"horns":"goat","claws":0.5,"weapon":"club","hair":"wild"},"mats":{"cloth":"fur:#e8eef2","cloth2":"fur:#e0e8ee","skin":"skin:#8aa0b0","boot":"fur:#d8e0e8","hair":"fur:#f4f8fa","horn":"bone:#a8a090","wood":"ice:#bfe8ff","bone":"ice:#dff4ff","eye":"rune:#60d8ff"},"parts":[["chest","oct",[0.25],"ice:#a8e0ff",[0.7,1.15,0],null,[1,1.8,1],{"phase":2,"mirror":1}],["head","cone",[0.07,0.45],"ice:#c8f0ff",[0.15,0.75,0],null,null,{"phase":3,"mirror":1}],["head","cone",[0.07,0.55],"ice:#c8f0ff",[0,0.8,0],null,null,{"phase":3}],["chest","box",[0.5,0.05,0.02],"rune:#60d8ff:orn",[0,0.8,0.45],null,null,{"phase":3}]],"phases":[{"name":"Спящий великан","glow":1},{"name":"Ледяная броня","glow":2,"speed":1.2,"rune":"#90e8ff"},{"name":"Вечная зима","glow":3.2,"speed":1.4,"scale":1.08,"rune":"#ffffff","edge":"#90e8ff","tint":"#c8e4ff"}]};

/** @param {typeof import('three')} THREE @param {{lod?:0|1|2, phase?:number, state?:string}} opts @returns {THREE.Group} */
export function build(THREE, opts = {}) { return makeCreature(THREE, spec, meta, opts); }
export default build;
