// js/render/quality-presets.js — МАСТЕР-таблица качества (ключи quest/phone/pc_low/pc_high общие для world.js и enemies.js).
// drawDistance = WORLD_CONFIG.quality[*].fogFar, chunkRadius = max(lodRings); mobs.active = PERF_CAPS.activeMobs (слоты).
export const QUALITY_PRESETS = {
  quest: {
    id: 'quest', label: 'VR (Quest)', legacyId: 'low', targetFps: 72,
    pixelRatio: 1, framebufferScale: 0.9, foveation: 1.0,
    budget: { drawCallsPerEye: 100, triangles: 150000 },
    drawDistance: 150, chunkRadius: 3, fogFarMul: 1.0,
    lod: { lod0: 15, lod1: 40, impostor: 70 },
    outline: { enabled: true, maxDist: 12 }, rim: true,
    shadows: 'blob', shadowMapSize: 0, pointLights: 0,
    grass: { density: 0.6, radius: 18 }, water: 'opaque', waterWaves: 2, waterFoamNoise: false,
    particles: 600, particleBudgetScale: 0.6, ribbonSegments: 64, weatherPoints: 200, decals: 24,
    damageNumbers: { max: 16, alwaysMerge: true },
    maxTextureSize: 512, anisotropy: 1, postFX: null, clouds: 6,
    mobs: { active: 18, visible: 20, animHz: [72, 24, 0] },
    audio: { voices: 24, hrtf: 6 }, cameraShake: false, heatHaze: false,
  },
  phone: {
    id: 'phone', label: 'Телефон', legacyId: 'medium', targetFps: 60,
    pixelRatio: 1.5, framebufferScale: 1, foveation: 0,
    budget: { drawCallsPerEye: 120, triangles: 200000 },
    drawDistance: 150, chunkRadius: 3, fogFarMul: 1.0,
    lod: { lod0: 18, lod1: 45, impostor: 80 },
    outline: { enabled: true, maxDist: 15 }, rim: true,
    shadows: 'blob', shadowMapSize: 0, pointLights: 0,
    grass: { density: 0.8, radius: 20 }, water: 'transparent', waterWaves: 2, waterFoamNoise: false,
    particles: 800, particleBudgetScale: 0.7, ribbonSegments: 96, weatherPoints: 250, decals: 24,
    damageNumbers: { max: 24, alwaysMerge: true },
    maxTextureSize: 512, anisotropy: 1, postFX: null, clouds: 6,
    mobs: { active: 18, visible: 20, animHz: [30, 15, 0] },
    audio: { voices: 20, hrtf: 0 }, cameraShake: false, heatHaze: false,
  },
  pc_low: {
    id: 'pc_low', label: 'ПК — низкое', legacyId: 'medium', targetFps: 60,
    pixelRatio: 1, framebufferScale: 1.0, foveation: 0.8,
    budget: { drawCallsPerEye: 200, triangles: 400000 },
    drawDistance: 220, chunkRadius: 4, fogFarMul: 1.3,
    lod: { lod0: 25, lod1: 60, impostor: 110 },
    outline: { enabled: true, maxDist: 25 }, rim: true,
    shadows: 'blob', shadowMapSize: 0, pointLights: 0,
    grass: { density: 1.5, radius: 30 }, water: 'transparent', waterWaves: 2, waterFoamNoise: false,
    particles: 1500, particleBudgetScale: 1.0, ribbonSegments: 128, weatherPoints: 400, decals: 48,
    damageNumbers: { max: 32, alwaysMerge: false },
    maxTextureSize: 1024, anisotropy: 2, postFX: null, clouds: 10,
    mobs: { active: 25, visible: 35, animHz: [60, 30, 10] },
    audio: { voices: 32, hrtf: 8 }, cameraShake: true, heatHaze: true,
  },
  pc_high: {
    id: 'pc_high', label: 'ПК — высокое', legacyId: 'high', targetFps: 60,
    pixelRatio: 2, framebufferScale: 1.0, foveation: 0.5,
    budget: { drawCallsPerEye: 450, triangles: 1500000 },
    drawDistance: 380, chunkRadius: 6, fogFarMul: 2.0,
    lod: { lod0: 40, lod1: 100, impostor: 200 },
    outline: { enabled: true, maxDist: 50 }, rim: true,
    shadows: 'cascade1', shadowMapSize: 2048, shadowUpdateEvery: 2, pointLights: 4,
    grass: { density: 4, radius: 60 }, water: 'transparent', waterWaves: 3, waterFoamNoise: true,
    particles: 6000, particleBudgetScale: 1.5, ribbonSegments: 256, weatherPoints: 1000, decals: 128,
    damageNumbers: { max: 32, alwaysMerge: false },
    maxTextureSize: 2048, anisotropy: 8,
    postFX: { bloom: { strength: 0.6, radius: 0.4, threshold: 0.85 }, fxaa: true, disableInXR: true },
    clouds: 16,
    mobs: { active: 35, visible: 60, animHz: [0, 30, 15] }, // 0 = каждый кадр
    audio: { voices: 48, hrtf: 16 }, cameraShake: true, heatHaze: true,
  },
};
// В XR-сессии postFX и cameraShake выключаются принудительно для любого пресета.
// Итоговый fogFar = min(biome.fogFar * fogFarMul, drawDistance * 0.95).
export const QUALITY_ORDER = ['quest', 'phone', 'pc_low', 'pc_high'];
export const QUALITY_GOVERNOR = {
  checkEveryS: 2, dropBelowFpsRatio: 0.9, raiseAboveFpsRatio: 1.0, raiseAfterS: 10,
  steps: [ // по очереди, пока fps ниже цели; обратно — в обратном порядке
    { path: 'grass.radius', mul: 0.75 },
    { path: 'particles', mul: 0.7 },
    { path: 'drawDistance', mul: 0.85 },
    { path: 'outline.maxDist', mul: 0.6 },
    { path: 'foveation', set: 1 },
  ],
};
