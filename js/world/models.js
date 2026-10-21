// js/world/models.js — фабрика моделей getModel(id). Сначала пробует js/world/procedural-models.js (часть C),
// при его отсутствии/ошибке — простые toon-примитивы. Кэширует геометрии, отдаёт клоны.
import * as THREE from 'three';
import { MOBS, BIOMES } from '../../shared/defs/index.js';
import { makeToon } from '../render/toon.js';

let proc = null; const Q_PRIM = typeof location !== 'undefined' && /[?&]owprim\b/.test(location.search); // ?owprim — принудительно примитивы // модуль части C (createModel(THREE,id) | getModel(id) | buildModel(id))
export async function initModels() {
  try { proc = await import('./procedural-models.js'); console.info('[openworld] procedural-models.js подключён'); }
  catch (e) { proc = null; console.info('[openworld] procedural-models.js нет — примитивы', e?.message || ''); }
  return !!proc;
}
const matCache = new Map();
export function toonColor(hex, emissive = 0) {
  const k = hex + ':' + emissive; if (matCache.has(k)) return matCache.get(k);
  const m = makeToon({ color: new THREE.Color(hex), vertexColors: false, statusFx: false });
  if (emissive) { m.emissive = new THREE.Color(hex); m.emissiveIntensity = emissive; }
  matCache.set(k, m); return m;
}
const G = {
  sph: (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h), box: (x, y, z) => new THREE.BoxGeometry(x, y, z),
  cyl: (rt, rb, h, n = 8) => new THREE.CylinderGeometry(rt, rb, h, n), cone: (r, h, n = 8) => new THREE.ConeGeometry(r, h, n),
};
const add = (g, geo, col, x = 0, y = 0, z = 0, em = 0) => { const m = new THREE.Mesh(geo, toonColor(col, em)); m.position.set(x, y, z); g.add(m); return m; };

// Примитивные модели мобов: { group, hit:{body:[y,r], head:[y,r]} } — хитбоксы сферы в локальных координатах.
const MOB_PRIM = {
  m_meadow_slime: (g) => { add(g, G.sph(0.55, 12, 8), '#7cff6a', 0, 0.45, 0).scale.y = 0.8; add(g, G.sph(0.18), '#2fd04a', 0, 0.45, 0, 0.6); add(g, G.sph(0.07), '#111', -0.18, 0.62, -0.42); add(g, G.sph(0.07), '#111', 0.18, 0.62, -0.42); return { body: [0.45, 0.55], head: [0.45, 0.2], headIsWeak: true }; },
  m_tusk_boar: (g) => { add(g, G.box(0.9, 0.8, 1.6), '#7a4a2a', 0, 0.75, 0); add(g, G.box(0.6, 0.55, 0.55), '#5a3420', 0, 0.85, -0.95); add(g, G.cone(0.08, 0.45), '#fff8e0', -0.22, 0.75, -1.25).rotation.x = -1.6; add(g, G.cone(0.08, 0.45), '#fff8e0', 0.22, 0.75, -1.25).rotation.x = -1.6; for (const [x, z] of [[-.3, -.5], [.3, -.5], [-.3, .5], [.3, .5]]) add(g, G.cyl(0.1, 0.1, 0.4), '#4a2a18', x, 0.2, z); return { body: [0.75, 0.75], head: [0.85, 0.35], headZ: -0.95 }; },
  m_wisp: (g) => { add(g, G.sph(0.3), '#ffb347', 0, 0, 0, 1.4); add(g, G.cone(0.2, 0.6), '#ff7a1a', 0, 0, 0.35, 1).rotation.x = Math.PI / 2; return { body: [0, 0.35], head: [0, 0.15] }; },
  m_goblin_slinger: (g) => { add(g, G.cyl(0.25, 0.3, 0.7), '#6a4a32', 0, 0.55, 0); add(g, G.sph(0.25), '#7cc45a', 0, 1.1, 0); add(g, G.cone(0.08, 0.4), '#7cc45a', -0.3, 1.15, 0).rotation.z = 1.4; add(g, G.cone(0.08, 0.4), '#7cc45a', 0.3, 1.15, 0).rotation.z = -1.4; add(g, G.cyl(0.03, 0.03, 0.6), '#8a5a32', 0.3, 1.3, 0); return { body: [0.6, 0.38], head: [1.1, 0.25] }; },
  m_mushroom_shaman: (g) => { add(g, G.cyl(0.22, 0.3, 0.9), '#f0e0c0', 0, 0.45, 0); add(g, G.sph(0.55, 12, 6), '#c04a8a', 0, 1.05, 0, 0.3).scale.y = 0.55; return { body: [0.5, 0.4], head: [1.05, 0.45], headIsWeak: true }; },
  m_gold_fairy: (g) => { add(g, G.sph(0.18), '#ffd84a', 0, 0, 0, 1.5); add(g, G.box(0.5, 0.02, 0.25), '#fff07a', -0.25, 0.05, 0, 1); add(g, G.box(0.5, 0.02, 0.25), '#fff07a', 0.25, 0.05, 0, 1); return { body: [0, 0.3], head: [0, 0.12] }; },
  m_forest_wolf: (g) => { add(g, G.box(0.55, 0.6, 1.3), '#5e5e6a', 0, 0.7, 0); add(g, G.box(0.4, 0.4, 0.55), '#4a4a55', 0, 0.95, -0.8); add(g, G.cone(0.08, 0.2), '#4a4a55', -0.12, 1.2, -0.75); add(g, G.cone(0.08, 0.2), '#4a4a55', 0.12, 1.2, -0.75); for (const [x, z] of [[-.2, -.45], [.2, -.45], [-.2, .45], [.2, .45]]) add(g, G.cyl(0.07, 0.07, 0.45), '#3a3a44', x, 0.22, z); return { body: [0.7, 0.6], head: [0.95, 0.28], headZ: -0.8 }; },
  m_thorn_treant: (g) => { add(g, G.cyl(0.5, 0.7, 2.2), '#5a3820', 0, 1.1, 0); add(g, G.sph(1.0, 8, 6), '#2f5a2a', 0, 2.6, 0); add(g, G.sph(0.12), '#ffb347', -0.2, 1.8, -0.55, 1.2); add(g, G.sph(0.12), '#ffb347', 0.2, 1.8, -0.55, 1.2); return { body: [1.2, 0.9], head: [1.8, 0.35], headZ: -0.4 }; },
  m_weaver_spider: (g) => { add(g, G.sph(0.5), '#2a2030', 0, 0.6, 0.2); add(g, G.sph(0.3), '#3a2a40', 0, 0.6, -0.4); for (let i = 0; i < 4; i++) for (const s of [-1, 1]) add(g, G.cyl(0.04, 0.04, 1.1), '#1a1420', s * 0.55, 0.45, -0.3 + i * 0.25).rotation.z = s * 1.0; return { body: [0.6, 0.55], head: [0.6, 0.25], headZ: -0.4 }; },
  m_forest_bandit: (g) => { add(g, G.cyl(0.28, 0.3, 1.1), '#3e7a3e', 0, 0.75, 0); add(g, G.sph(0.22), '#f0c8a0', 0, 1.5, 0); add(g, G.cone(0.26, 0.35), '#2f5a2a', 0, 1.72, 0); return { body: [0.8, 0.42], head: [1.5, 0.22] }; },
  m_ghost_owl: (g) => { add(g, G.sph(0.4), '#d8e8ff', 0, 0, 0, 0.5); add(g, G.box(1.4, 0.05, 0.4), '#b8c8ff', 0, 0.05, 0, 0.3); return { body: [0, 0.45], head: [0.2, 0.2] }; },
};
export const MOB_COLORS = { physical: '#d9d2c3', fire: '#ff7a1a', frost: '#9fe8ff', lightning: '#fff07a', arcane: '#b06aff', poison: '#7aff4a' };

/** Модель по id. Возвращает { object3d, hit } (hit — сферы попадания для мобов). */
export function getModel(id) {
  if (proc && (!proc.MODEL_IDS || proc.MODEL_IDS.includes(id)) && !Q_PRIM) {
    try {
      const o = proc.createModel?.(THREE, id) ?? proc.getModel?.(id);
      if (o?.isObject3D) {
        let hit = null;
        if (MOB_PRIM[id]) hit = MOB_PRIM[id](new THREE.Group()); // откалиброванные зоны попадания
        else { const box = new THREE.Box3().setFromObject(o), h = Math.max(0.4, box.max.y - box.min.y), r = Math.max(0.3, (box.max.x - box.min.x) * 0.45);
          hit = { body: [box.min.y + h * 0.45, Math.min(r, h * 0.5)], head: [box.min.y + h * 0.85, Math.max(0.15, h * 0.15)] }; }
        return { object3d: o, hit, source: 'procedural', animate: proc.animate };
      }
    } catch (e) { console.warn('[openworld] procedural model failed', id, e?.message); }
  }
  const g = new THREE.Group(); let hit;
  if (MOB_PRIM[id]) hit = MOB_PRIM[id](g);
  else if (MOBS[id]) { add(g, G.sph(0.5), '#c0c0c0', 0, 0.6, 0); add(g, G.sph(0.25), '#ffffff', 0, 1.2, 0); hit = { body: [0.6, 0.5], head: [1.2, 0.25] }; }
  else if (id.startsWith('w_')) { add(g, G.box(0.06, 0.12, 0.45), id === 'w_spark_wand' ? '#b06aff' : '#4a5260', 0, 0, -0.2, id === 'w_spark_wand' ? 0.6 : 0); add(g, G.box(0.05, 0.14, 0.08), '#2a2a2a', 0, -0.1, -0.02); if (id === 'w_spark_wand') add(g, G.sph(0.05), '#4ae8ff', 0, 0, -0.45, 1.5); }
  else if (id.startsWith('it_')) { add(g, G.box(0.25, 0.25, 0.25), id === 'it_gold' ? '#ffd84a' : '#4ae8ff', 0, 0, 0, 0.9).rotation.set(0.6, 0.6, 0); }
  else add(g, G.box(1, 1, 1), '#ff00ff');
  return { object3d: g, hit: hit || { body: [0.5, 0.5], head: [1, 0.2] }, source: 'primitive' };
}

// Инстансы растительности (дерево = ствол+крона, камень). Ставится одной-двумя InstancedMesh на чанк.
const vegGeo = {};
const PROC_VEG = { veg_tree_pine: 'p_tree_forest_pine', veg_tree_round: 'p_tree_meadow_oak', veg_rock: 'p_rock_small' };
function vegParts(id, biome) {
  const pid = PROC_VEG[id]; if (proc?.createMergedGeometry && !Q_PRIM && (!proc.MODEL_IDS || proc.MODEL_IDS.includes(pid))) { try { return [[vegGeo[pid] ||= proc.createMergedGeometry(THREE, pid), null]]; } catch (e) { console.warn('[openworld] veg', pid, e?.message); } }
  const p = BIOMES[biome]?.palette || {};
  if (id === 'veg_rock') return [[vegGeo.rock ||= new THREE.DodecahedronGeometry(0.8, 0), '#9a968a', 0.4]];
  if (id === 'veg_tree_pine') return [[vegGeo.trunkP ||= new THREE.CylinderGeometry(0.18, 0.28, 3.2, 6).translate(0, 1.6, 0), '#5a3820'], [vegGeo.pine ||= new THREE.ConeGeometry(1.5, 4.4, 7).translate(0, 4.9, 0), p.shade || '#2f5a2a']];
  return [[vegGeo.trunk ||= new THREE.CylinderGeometry(0.18, 0.28, 2.2, 6).translate(0, 1.1, 0), '#6a4220'], [vegGeo.crown ||= new THREE.IcosahedronGeometry(1.6, 0).translate(0, 3.2, 0), p.ground || '#5fae3c']];
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
export const models = {
  instanced(id, pts, biome) {
    const grp = new THREE.Group();
    for (const [geo, col, yOff = 0] of vegParts(id, biome)) {
      const im = new THREE.InstancedMesh(geo, col ? toonColor(col) : proc.getToonMaterial(THREE), pts.length);
      pts.forEach(([x, y, z, s, r], i) => { _q.setFromAxisAngle(_up, r); _s.setScalar(s); _p.set(x, y + yOff * s, z); im.setMatrixAt(i, _m.compose(_p, _q, _s)); });
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); grp.add(im);
    }
    return grp;
  },
};
