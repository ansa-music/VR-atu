// js/world/index.js — режим «Открытый мир» (?mode=world), фаза 1: рельеф, чанки, море, небо и туман.
// createWorld(...) → { heightAt, biomeAt, borderPush, update(dt, headPos), spawn, ... }
import * as THREE from 'three';
import { WORLD_CONFIG } from './config.js';
import { generateTerrain, createTerrainSampler, BIOME_IDS } from './heightmap.js';
const { createTerrainChunks } = await import('./chunks.js' + new URL(import.meta.url).search);
import { makeGradientMap, SHARED } from '../render/toon.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';
import { createGrass } from './grass.js';
import { createProps } from './props.js';
import { createAmbientAudio } from './ambient-audio.js';
import { createKzWorld } from './kz-world.js';
import { createBestiary } from './bestiary/populate.js';
import { createBurstParticles, createAmbientParticles } from '../render/gpu-particles.js';
import { DAMAGE_TYPE_VFX } from '../../shared/defs/damage-vfx.js';

/** Пресет мира по уровню качества игры: Quest → quest, телефон → phone, ПК → pc_low / pc_high. */
export function worldPresetId(quality, { coarse = false, override = null } = {}) {
  if (override && WORLD_CONFIG.quality[override]) return override;
  if (quality?.id === 'high') return 'pc_high';
  if (quality?.id === 'medium') return coarse ? 'phone' : 'pc_low';
  return 'quest';
}

// карта высот считается в воркере; без модульных воркеров — здесь же (страница подождёт)
async function loadTerrain(seed) {
  try {
    const worker = new Worker(new URL('./terrain-worker.js', import.meta.url), { type: 'module' });
    const data = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('воркер не ответил за 30 с')), 30000);
      worker.onmessage = (e) => { clearTimeout(timer); resolve(e.data); };
      worker.onerror = (e) => { clearTimeout(timer); reject(e.error || new Error(e.message || 'ошибка воркера')); };
      worker.postMessage({ seed });
    });
    worker.terminate();
    if (!data?.ok) throw new Error(data?.error || 'воркер вернул пустой результат');
    return data.terrain;
  } catch (e) {
    console.warn('[world] рельеф считается в основном потоке:', e);
    const t0 = performance.now();
    const t = generateTerrain(seed);
    t.ms = Math.round(performance.now() - t0);
    return t;
  }
}

export async function createWorld({ scene, camera, quality, presetId = worldPresetId(quality), timeOverride = null }) {
  const preset = WORLD_CONFIG.quality[presetId] || WORLD_CONFIG.quality.quest;
  const terrain = await loadTerrain(WORLD_CONFIG.seed);
  const sampler = createTerrainSampler(terrain);
  const { size, seaLevel, borderSoft } = WORLD_CONFIG;

  const group = new THREE.Group();
  group.name = 'open-world';
  const gradient = makeGradientMap([120, 200, 255]);
  const groundMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
  const chunks = createTerrainChunks({ terrain, rings: preset.lodRings, material: groundMat, strides: presetId === "quest" ? [2, 4, 8] : undefined });
  group.add(chunks.group);

  // небо и сутки, свет (раздел 1.2.5)
  const sky = createSky({ radius: preset.fogFar * 0.9, quality: presetId });
  group.add(sky.group, ...sky.lights);
  if (Number.isFinite(timeOverride)) sky.setTime(timeOverride);

  // вода: море, болото, лава
  const water = createWater({ terrain, preset: presetId, sunDir: sky.sunDir });
  group.add(water.group);

  // трава вокруг игрока
  SHARED.uRimPower.value = 0; // без каёмки: на тонких лезвиях она даёт белые кончики
  const grass = createGrass({ terrain, sampler, preset: presetId, max: preset.grassMaxInstances, biomeIds: BIOME_IDS });
  group.add(grass.mesh);

  // частицы: вспышки (2 вызова) и атмосфера по биому и времени суток (1 вызов)
  const particles = createBurstParticles({ capacity: presetId === 'pc_high' ? 2048 : 768 });
  const ambient = createAmbientParticles({ count: preset.weatherParticles, box: presetId.startsWith('pc') ? 34 : 26 });
  group.add(particles.group, ambient.points);
  scene.add(group);

  const spawn = { x: terrain.spawn.x, z: terrain.spawn.z, y: sampler.heightAt(terrain.spawn.x, terrain.spawn.z) };
  // деревья, камни и цветы (Kenney Nature Kit, CC0) — грузятся в фоне, мир не ждёт
  let props = null;
  createProps({ sampler, center: spawn, seaLevel, presetId }).then((r) => { props = r; group.add(r.group); }).catch((e) => console.warn('[world] декор не загрузился', e));
  const wTmp = new Float64Array(BIOME_IDS.length);
  const headTmp = new THREE.Vector3(spawn.x, spawn.y + 1.6, spawn.z);
  sampler.biomeWeightsAt(spawn.x, spawn.z, wTmp);
  const fog0 = sky.update(0, headTmp, wTmp, BIOME_IDS);
  scene.fog = new THREE.Fog(fog0.clone(), preset.fogFar * 0.35, preset.fogFar);
  scene.background = fog0.clone();
  camera.far = preset.fogFar + 20;
  camera.updateProjectionMatrix();

  // стиль атмосферы: биом под игроком + ночь
  const ambientStyle = (b, night) => {
    if (b === 'b_mountains') return 'snow';
    if (b === 'b_volcano') return 'ash';
    if (b === 'b_desert_ruins') return 'dust';
    if (b === 'b_swamp') return 'spores';
    return night > 0.6 ? 'fireflies' : 'pollen';
  };
  let viewH = 900;

  let biome = sampler.biomeAt(spawn.x, spawn.z);
  const nature = createAmbientAudio(); // птицы и пар (CC0-файлы)
  // казахское оформление: аулы, шаңырақ-порталы, балбалы, мавзолеи, названия, кюй
  const kz = createKzWorld({ heightAt: sampler.heightAt, biomeAt: sampler.biomeAt, seaLevel, quality: presetId });
  group.add(kz.group);
  // бестиарии (74 + 74): витрина по биомам, два ряда; сбой не должен ронять мир
  let bestiary = null;
  try { bestiary = createBestiary({ group, heightAt: sampler.heightAt }); } catch (e) { console.warn('[bestiary] не запустился', e); }
  let onTitle = null, combat01 = 0;
  const push = [0, 0];

  return {
    group,
    size,
    seaLevel,
    spawn,
    preset,
    presetId,
    terrainMs: terrain.ms ?? null,
    heightAt: sampler.heightAt,
    normalAt: sampler.normalAt,
    biomeAt: sampler.biomeAt,
    get biome() { return biome; },
    /** Подпись места на казахском: onTitle({ kk, ru }). */
    set onTitle(fn) { onTitle = fn; },
    set combat(v) { combat01 = v; },
    /** Не пройти сквозь юрты и постройки. */
    collide(pos, r) { kz.collide(pos, r); },
    /** У края мира «буря» мягко отталкивает к центру: ускорение, м/с². */
    borderPush(x, z) {
      const k = 12;
      push[0] = x < borderSoft ? k * (1 - x / borderSoft) : x > size - borderSoft ? -k * (1 - (size - x) / borderSoft) : 0;
      push[1] = z < borderSoft ? k * (1 - z / borderSoft) : z > size - borderSoft ? -k * (1 - (size - z) / borderSoft) : 0;
      return push;
    },
    update(dt, head, renderer) {
      chunks.update(head.x, head.z);
      grass.update(head);
      SHARED.uTime.value += dt;
      sampler.biomeWeightsAt(head.x, head.z, wTmp);
      const fog = sky.update(dt, head, wTmp, BIOME_IDS);
      scene.fog.color.copy(fog);
      scene.background.copy(fog);
      const light = 0.35 + 0.65 * (1 - sky.night);
      water.update(dt, head, fog, light);
      biome = sampler.biomeAt(head.x, head.z);
      ambient.setStyle(ambientStyle(biome, sky.night));
      nature.update(dt, biome, sky.night);
      const title = kz.update(dt, head, biome, null, { combat: combat01 }); // LOD построек обновляет сам рендер
      bestiary?.update(dt, head);
      if (title && onTitle) onTitle(title);
      if (renderer) viewH = renderer.xr.isPresenting ? 1700 : renderer.domElement.height;
      ambient.update(dt, head, viewH);
      particles.update(dt, viewH);
    },
    particles,
    vfx: DAMAGE_TYPE_VFX,
    get hour() { return sky.hour; },
    /** Перевести время суток (часы 0–24), mul — скорость (1 = сутки за 40 мин). */
    setTime(h, mul) { sky.setTime(h, mul); },
    stats() {
      return { bestiary: bestiary?.stats, kz: kz.stats, preset: presetId, terrainMs: terrain.ms ?? null, biome, hour: +sky.hour.toFixed(2), night: +sky.night.toFixed(2), ambient: ambient.style, grass: grass.stats.count, grassMs: grass.stats.ms, props: props?.stats ?? null, ...chunks.stats, triangles: chunks.triangles() };
    },
  };
}
