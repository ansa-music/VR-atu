// js/world/kz-world.js — казахское оформление открытого мира (разделы G и I дизайн-документа v5):
// постройки у всех 49 точек интереса (аулы со стенами и базаром, башни, мавзолеи, пещеры, лагеря, руины,
// святилища-шаңырақ, балбалы), врата между биомами и мосты; столкновения с постройками; названия мест
// на казахском при входе в биом и к точке интереса; кюй биома на синтезаторе (kz-music.js).
// Каждое место запечено в 1–3 меша и сидит в THREE.LOD: вблизи — подробно, дальше — проще, ещё дальше — скрыто.
import * as THREE from 'three';
import { POIS } from '../../shared/defs/pois.js';
import { KZ_BIOMES, KZ_POIS } from '../../shared/defs/theme_kz.js';
import { buildWorldLayout, ColliderGrid } from './settlements.js';
import { bakeMeshes } from './buildings.js';
import { makeToon } from '../render/toon.js';
import { createKzMusic } from './kz-music.js';
import { audioCore } from '../sfx.js';

// Лазейка для красивых моделей: assets/upgrade/manifest.json (см. assets/upgrade/README.md).
// Ключ — id места (poi_hub_dawnford) или тип места (type:hub, type:tower …); значение —
// { file, scale = 1, rotate = 0 (градусы), y = 0 (сдвиг вверх, м), keepProcedural = false }.
// Нет файла — ничего не меняется. Коллайдеры остаются от процедурной раскладки.
const UPGRADE_DIR = new URL('../../assets/upgrade/', import.meta.url).href;
async function applyUpgrades(sites, lods, group) {
  let manifest = null;
  try {
    const res = await fetch(UPGRADE_DIR + 'manifest.json', { cache: 'no-cache' });
    if (!res.ok) return 0;
    manifest = await res.json();
  } catch { return 0; }
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const cache = new Map();
  let placed = 0;
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    const rule = manifest[s.poi] || manifest['type:' + s.type];
    if (!rule?.file) continue;
    try {
      if (!cache.has(rule.file)) cache.set(rule.file, loader.loadAsync(UPGRADE_DIR + rule.file));
      const gltf = await cache.get(rule.file);
      const obj = gltf.scene.clone(true);
      obj.position.set(s.ox, s.y0 + (rule.y || 0), s.oz);
      obj.rotation.y = THREE.MathUtils.degToRad(rule.rotate || 0);
      obj.scale.setScalar(rule.scale || 1);
      obj.name = 'upgrade:' + s.poi;
      group.add(obj);
      if (!rule.keepProcedural) lods[i].visible = false;
      placed++;
    } catch (e) { console.warn('[upgrade] не загрузилась модель', rule.file, e); }
  }
  if (placed) console.info(`[upgrade] заменено мест: ${placed}`);
  return placed;
}

const FAR = { quest: 70, phone: 70, pc_low: 110, pc_high: 160 };
const ALL_OPEN = () => true; // врата этажей — украшение, мир открыт целиком

export function createKzWorld({ heightAt, biomeAt, seaLevel = 0, quality = 'quest' }) {
  const t0 = performance.now();
  const group = new THREE.Group();
  group.name = 'kz-world';
  const waterAt = (x, z) => heightAt(x, z) < seaLevel + 0.3;
  const { sites, gates } = buildWorldLayout({ heightAt, biomeAt, waterAt });
  const mat = makeToon({ vertexColors: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const sealMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
  glowMat.userData.transparent = sealMat;
  const farDist = FAR[quality] || 110, cullDist = farDist * 3.2;
  const grid = new ColliderGrid(16);
  let tris = 0;
  const lods = [];
  for (const s of sites) {
    for (const c of s.colliders) grid.add(c);
    const m = bakeMeshes(THREE, s.parts, { material: mat, glowMaterial: glowMat });
    const lod = new THREE.LOD();
    lod.position.set(s.ox, s.y0, s.oz);
    lod.name = s.poi;
    const near = new THREE.Group(), far = new THREE.Group();
    if (m.near) near.add(m.near);
    if (m.glow) { near.add(m.glow); far.add(m.glow.clone()); }
    if (m.far) far.add(m.far);
    for (const tag in m.tagged) if (tag !== 'seal') for (const mm of m.tagged[tag]) near.add(mm); // печати врат не ставим — врата открыты
    lod.addLevel(near, 0);
    lod.addLevel(far, farDist);
    lod.addLevel(new THREE.Object3D(), cullDist);
    for (const g of [near, far]) g.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    lod.updateMatrix();
    lod.matrixAutoUpdate = false;
    group.add(lod);
    lods.push(lod);
    tris += s.tris[0];
  }

  // места с казахскими названиями: все точки интереса
  const places = POIS.map((p) => ({ id: p.id, x: p.pos[0], z: p.pos[1], r: p.type === 'hub' ? Math.max(30, p.r + 8) : Math.max(18, p.r + 6) }));

  // музыка: кюй биома, громкость как у музыки в настройках
  let music = null, musicBiome = null;
  function ensureMusic(biome) {
    if (music) return music;
    const core = audioCore();
    if (!core || core.ctx.state !== 'running') return null;
    music = createKzMusic(core.ctx, { biome, volume: 0.22 * (core.musicVolume?.() ?? 1), destination: core.master });
    music.start();
    musicBiome = biome;
    return music;
  }

  let lastBiome = null, lastPlace = null;
  const titleOf = (map, id) => (map[id] ? { kk: map[id].nameKk, ru: map[id].nameRu } : null);
  const stats = { sites: sites.length, gates: gates.length, colliders: grid.count, trisNear: tris, ms: Math.round(performance.now() - t0), upgraded: 0 };
  applyUpgrades(sites, lods, group).then((n) => { stats.upgraded = n; });

  return {
    group,
    stats,
    /** Вытолкнуть точку из построек (стены, юрты, башни): pos = { x, z }, r — радиус игрока. */
    collide(pos, r = 0.3) {
      const list = grid.near(pos.x, pos.z, ALL_OPEN);
      for (const c of list) {
        if (c[4] && c[4].startsWith('seal:')) continue;
        const R = c[3] * 0.3, dx = pos.x - c[0], dz = pos.z - c[2], d = Math.hypot(dx, dz), m = R + r;
        if (d < m && d > 1e-4) { pos.x = c[0] + (dx / d) * m; pos.z = c[2] + (dz / d) * m; }
      }
    },
    /** Кадр: LOD по камере, музыка. Возвращает подпись { kk, ru }, если игрок вошёл в новый биом или к новому месту. */
    update(dt, head, biome, camera, { combat = 0 } = {}) {
      if (camera) for (const l of group.children) l.update(camera);
      const m = ensureMusic(biome);
      if (m) {
        if (biome !== musicBiome) { m.setBiome(biome); musicBiome = biome; }
        m.setIntensity(combat);
      }
      let title = null;
      if (biome !== lastBiome) { lastBiome = biome; title = titleOf(KZ_BIOMES, biome); }
      let near = null;
      for (const pl of places) if (Math.abs(head.x - pl.x) < pl.r && Math.abs(head.z - pl.z) < pl.r && Math.hypot(head.x - pl.x, head.z - pl.z) < pl.r) { near = pl.id; break; }
      if (near !== lastPlace) { lastPlace = near; if (near && !title) title = titleOf(KZ_POIS, near); }
      return title;
    },
    stopMusic() { music?.stop(); music = null; },
  };
}
