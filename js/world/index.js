// js/world/index.js — режим «Открытый мир» (?mode=world), фаза 1: рельеф, чанки, море, небо и туман.
// createWorld(...) → { heightAt, biomeAt, borderPush, update(dt, headPos), spawn, ... }
import * as THREE from 'three';
import { WORLD_CONFIG, BIOMES } from './config.js';
import { generateTerrain, createTerrainSampler, BIOME_IDS } from './heightmap.js';
import { createTerrainChunks } from './chunks.js';
import { makeGradientMap } from '../render/toon.js';

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

// небо: градиент от горизонта (цвет тумана) к зениту, проходит тон-маппинг как и всё остальное
function makeSky(radius) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; varying vec3 vDir;
      void main() {
        gl_FragColor = vec4(mix(uHorizon, uTop, smoothstep(0.0, 0.45, vDir.y)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 12), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'sky';
  return mesh;
}

export async function createWorld({ scene, camera, quality, presetId = worldPresetId(quality) }) {
  const preset = WORLD_CONFIG.quality[presetId] || WORLD_CONFIG.quality.quest;
  const terrain = await loadTerrain(WORLD_CONFIG.seed);
  const sampler = createTerrainSampler(terrain);
  const { size, seaLevel, borderSoft } = WORLD_CONFIG;

  const group = new THREE.Group();
  group.name = 'open-world';
  const gradient = makeGradientMap([120, 200, 255]);
  const groundMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
  const chunks = createTerrainChunks({ terrain, rings: preset.lodRings, material: groundMat });
  group.add(chunks.group);

  // море: одна плоскость вокруг игрока до границы тумана
  const seaSize = preset.fogFar * 2 + 256;
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(seaSize, seaSize).rotateX(-Math.PI / 2),
    new THREE.MeshToonMaterial({ color: BIOMES.b_meadow.palette.water, gradientMap: gradient }),
  );
  sea.position.y = seaLevel;
  sea.name = 'sea';
  group.add(sea);

  // свет: небо + солнце (день; смена суток — фаза 2)
  const hemi = new THREE.HemisphereLight(0xd8f0ff, 0x56603e, 1.15);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.1);
  sun.position.set(45, 80, 35);
  group.add(hemi, sun);

  const sky = makeSky(preset.fogFar * 0.9);
  group.add(sky);
  scene.add(group);

  // туман и цвет неба зависят от биома под игроком, меняются плавно
  const palFog = BIOME_IDS.map((id) => new THREE.Color(BIOMES[id].palette.fog));
  const palTop = BIOME_IDS.map((id) => new THREE.Color(BIOMES[id].palette.skyTop));
  const fogColor = new THREE.Color();
  const topColor = new THREE.Color();
  const wTmp = new Float64Array(BIOME_IDS.length);
  const tFog = new THREE.Color(), tTop = new THREE.Color();
  function targetColors(x, z) {
    sampler.biomeWeightsAt(x, z, wTmp);
    tFog.setRGB(0, 0, 0); tTop.setRGB(0, 0, 0);
    for (let b = 0; b < wTmp.length; b++) {
      if (wTmp[b] <= 0) continue;
      tFog.r += palFog[b].r * wTmp[b]; tFog.g += palFog[b].g * wTmp[b]; tFog.b += palFog[b].b * wTmp[b];
      tTop.r += palTop[b].r * wTmp[b]; tTop.g += palTop[b].g * wTmp[b]; tTop.b += palTop[b].b * wTmp[b];
    }
  }
  const spawn = { x: terrain.spawn.x, z: terrain.spawn.z, y: sampler.heightAt(terrain.spawn.x, terrain.spawn.z) };
  targetColors(spawn.x, spawn.z);
  fogColor.copy(tFog);
  topColor.copy(tTop);
  scene.fog = new THREE.Fog(fogColor, preset.fogFar * 0.35, preset.fogFar);
  scene.background = fogColor.clone();
  sky.material.uniforms.uHorizon.value.copy(fogColor);
  sky.material.uniforms.uTop.value.copy(topColor);
  camera.far = preset.fogFar + 20;
  camera.updateProjectionMatrix();

  let biome = sampler.biomeAt(spawn.x, spawn.z);
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
    /** У края мира «буря» мягко отталкивает к центру: ускорение, м/с². */
    borderPush(x, z) {
      const k = 12;
      push[0] = x < borderSoft ? k * (1 - x / borderSoft) : x > size - borderSoft ? -k * (1 - (size - x) / borderSoft) : 0;
      push[1] = z < borderSoft ? k * (1 - z / borderSoft) : z > size - borderSoft ? -k * (1 - (size - z) / borderSoft) : 0;
      return push;
    },
    update(dt, head) {
      chunks.update(head.x, head.z);
      sea.position.x = Math.round(head.x / 32) * 32;
      sea.position.z = Math.round(head.z / 32) * 32;
      sky.position.copy(head);
      targetColors(head.x, head.z);
      const k = 1 - Math.exp(-dt * 0.8);
      fogColor.lerp(tFog, k);
      topColor.lerp(tTop, k);
      scene.fog.color.copy(fogColor);
      scene.background.copy(fogColor);
      sky.material.uniforms.uHorizon.value.copy(fogColor);
      sky.material.uniforms.uTop.value.copy(topColor);
      biome = sampler.biomeAt(head.x, head.z);
    },
    stats() {
      return { preset: presetId, terrainMs: terrain.ms ?? null, biome, ...chunks.stats, triangles: chunks.triangles() };
    },
  };
}
