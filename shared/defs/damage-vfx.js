// shared/defs/damage-vfx.js — визуальный язык 6 типов урона.
export const DAMAGE_TYPE_VFX = {
  physical: {
    color: '#e8e2d0', core: '#ffffff', glyph: 'blade',
    projectile: { trail: 'ribbon', width: 0.02, life: 0.12, halo: null },
    hit: [
      { blend: 'additive', frames: [0], count: 8, speed: [2, 5], spread: 55, life: [0.12, 0.25], size: [0.05, 0.0], gravity: 6, color: '#fff4dc' },
      { blend: 'alpha', frames: [12, 13], count: 3, speed: [0.3, 0.8], spread: 80, life: [0.4, 0.7], size: [0.12, 0.35], gravity: -0.5, color: '#b8ad98', byMaterial: true },
    ],
    flash: { color: '#ffffff', ms: 40 },
    decal: { kind: 'chip', lifeS: 6 },
    status: { id: 'stagger', onTarget: { orbitStars: 3, frame: 1, color: '#ffe9a0', radius: 0.25, hz: 1.5 }, tint: null },
    sfx: { cast: 'swing', hit: 'impact_phys', loop: null },
    haptic: [0.3, 25],
  },
  fire: {
    color: '#ff6a1f', core: '#ffd36b', glyph: 'flame',
    projectile: { trail: 'particles', emitPerS: 40, frames: [4, 5, 6, 7], halo: { size: 0.5, color: '#ff8a2a' } },
    hit: [
      { blend: 'additive', frames: [4, 5, 6, 7], count: 10, speed: [1, 3], spread: 70, life: [0.3, 0.6], size: [0.25, 0.05], gravity: -2, color: '#ff8a2a' },
      { blend: 'additive', frames: [0], count: 8, speed: [2, 4], spread: 90, life: [0.5, 1.0], size: [0.04, 0.0], gravity: -1, color: '#ffd36b' },
      { blend: 'additive', frames: [14], count: 1, speed: [0, 0], spread: 0, life: [0.25, 0.25], size: [0.2, 1.2], gravity: 0, color: '#ff6a1f', faceNormal: true },
    ],
    flash: { color: '#ffb060', ms: 60 },
    decal: { kind: 'scorch', lifeS: 8 },
    status: { id: 'burn', onTarget: { emitPerS: 3, frames: [4, 5, 6, 7], color: '#ff8a2a' }, tint: { uniform: 'uBurn', value: 1 }, deathTint: '#1a0e0a' },
    sfx: { cast: 'fire_cast', hit: 'fire_hit', loop: 'burn_loop' },
    haptic: [0.35, 35],
  },
  frost: {
    color: '#7fd8ff', core: '#e9fbff', glyph: 'snowflake',
    projectile: { trail: 'particles', emitPerS: 25, frames: [11, 8], halo: { size: 0.35, color: '#bfefff' } },
    hit: [
      { blend: 'additive', frames: [8], count: 6, speed: [2, 4], spread: 60, life: [0.3, 0.5], size: [0.08, 0.02], gravity: 5, color: '#e9fbff', mesh: 'shard' },
      { blend: 'alpha', frames: [12], count: 3, speed: [0.2, 0.5], spread: 90, life: [0.6, 1.0], size: [0.2, 0.5], gravity: 0.5, color: '#cfefff' },
      { blend: 'additive', frames: [11], count: 6, speed: [0.3, 1], spread: 120, life: [0.8, 1.4], size: [0.05, 0.03], gravity: 0.6, color: '#ffffff' },
    ],
    flash: { color: '#cfefff', ms: 60 },
    decal: { kind: 'frost', lifeS: 6 },
    status: { id: 'chill', onTarget: { emitPerS: 2, frames: [11], color: '#e9fbff' }, tint: { uniform: 'uFrost', perStack: 0.33 }, animSpeedMulPerStack: -0.15, iceShellAtMaxStacks: true },
    sfx: { cast: 'frost_cast', hit: 'ice_crack', loop: 'chill_loop' },
    haptic: [0.4, 30],
  },
  lightning: {
    color: '#f5f04a', core: '#ffffff', glyph: 'zigzag',
    projectile: { trail: 'arc', segments: 8, rebuildMs: 50, width: 0.04, halo: { size: 0.4, color: '#9fc4ff' } },
    hit: [
      { blend: 'additive', frames: [15], count: 1, speed: [0, 0], spread: 0, life: [0.06, 0.06], size: [0.8, 0.8], gravity: 0, color: '#ffffff', softModeScale: 0.4 },
      { blend: 'additive', frames: [0], count: 12, speed: [3, 7], spread: 100, life: [0.1, 0.25], size: [0.03, 0.0], gravity: 2, color: '#9fc4ff' },
      { blend: 'arc', toNearestSurface: true, count: 2, life: [0.12, 0.12], width: 0.025, color: '#f5f04a' },
    ],
    flash: { color: '#ffffff', ms: 30, softModeMax: 0.4 },
    decal: { kind: 'scorch_small', lifeS: 4 },
    status: { id: 'shock', onTarget: { arcEveryS: 0.4, arcs: [1, 2], color: '#f5f04a' }, tint: null, jitterPoseM: 0.01 },
    chain: { arcWidth: 0.05, segments: 10, lifeS: 0.18 },
    sfx: { cast: 'zap_cast', hit: 'zap_hit', loop: 'shock_buzz' },
    haptic: [0.5, 20],
  },
  arcane: {
    color: '#b07cff', core: '#f1e6ff', glyph: 'rune',
    projectile: { trail: 'particles', emitPerS: 30, frames: [2, 3], spiral: true, halo: { size: 0.45, color: '#b07cff' } },
    hit: [
      { blend: 'additive', frames: [2], count: 1, speed: [0, 0], spread: 0, life: [0.15, 0.15], size: [0.3, 0.6], gravity: 0, color: '#f1e6ff', faceNormal: true },
      { blend: 'additive', frames: [3, 1], count: 10, speed: [1, 3], spread: 360, life: [0.3, 0.6], size: [0.06, 0.0], gravity: 0, color: '#b07cff', spiral: 2 },
    ],
    flash: { color: '#e0ccff', ms: 50 },
    decal: { kind: 'rune_circle', lifeS: 3 },
    status: { id: null, onTarget: { runeCracksS: 0.5, color: '#f1e6ff' }, tint: null },
    sfx: { cast: 'arcane_cast', hit: 'arcane_hit', loop: null },
    haptic: [0.3, 40],
  },
  poison: {
    color: '#8bdc2a', core: '#e2ff9a', glyph: 'drop',
    projectile: { trail: 'particles', emitPerS: 20, frames: [9, 10], halo: { size: 0.3, color: '#b6ff3a' } },
    hit: [
      { blend: 'alpha', frames: [9], count: 6, speed: [1.5, 3], spread: 70, life: [0.3, 0.6], size: [0.08, 0.03], gravity: 7, color: '#8bdc2a' },
      { blend: 'alpha', frames: [12, 13], count: 2, speed: [0.2, 0.4], spread: 90, life: [1.0, 1.8], size: [0.3, 0.8], gravity: -0.2, color: '#6e9a1a' },
      { blend: 'additive', frames: [10], count: 4, speed: [0.2, 0.6], spread: 60, life: [0.6, 1.0], size: [0.05, 0.08], gravity: -1, color: '#e2ff9a' },
    ],
    flash: { color: '#d8ff9a', ms: 50 },
    decal: { kind: 'puddle', lifeS: 6 },
    status: { id: 'poison', onTarget: { emitPerS: 1, frames: [10], color: '#e2ff9a' }, tint: { uniform: 'uPoison', value: 1 } },
    sfx: { cast: 'poison_cast', hit: 'splat', loop: 'poison_bubble' },
    haptic: [0.25, 45],
  },
};
// Правила: count × particleBudgetScale пресета; опция «Меньше частиц» — ещё ×0.5;
// крит/слабое место — count ×1.5, size ×1.2; убийство — + вспышка 'kill' (частицы-«души» цвета типа, 12 шт., gravity −1.5).
// Режим дальтонизма меняет только color/core (из THEME.colorblind), формы и глифы не меняются.
