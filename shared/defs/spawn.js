// shared/defs/spawn.js — данные спавна открытого мира (часть B). Только данные, без three.js.
// Опирается на WORLD_CONFIG, BIOMES, POIS, SPAWN_TABLES, PERF_CAPS, WORLD_EVENTS (канон). Чисел канона не меняет.
// Время — секунды реального времени, расстояния — метры, углы — градусы.

// ---------- 1. Игрок ----------
export const PLAYER_SPAWN = Object.freeze({
  firstLaunch: {
    poi: 'poi_hub_dawnford', pos: [1180, 0, 1300], facing: 'poi_tower_meadow', // взгляд на первую башню (ориентир)
    timeOfDay: 8.5, weather: { b_meadow: 'clear' }, noMobsRadius: 80, noMobsS: 120,
    // Шаги вступления (сумма ≈ 75 с, любой шаг можно пропустить после первого прохождения).
    sequence: [
      { id: 'black_fade_in', durS: 2.0, note: 'чёрный → тёплый рассвет, музыка meadow_day слой 1' },
      { id: 'altar_wake', durS: 6.0, note: 'игрок на алтаре-маяке хаба, частицы искр поднимаются вверх' },
      { id: 'calibrate_height', durS: 0, note: 'VR: «встаньте прямо» → высота пола; ПК/телефон пропуск' },
      { id: 'elder_greet', durS: 12.0, npc: 'npc_ira', note: 'Ира подходит на 2,5 м, не ближе' },
      { id: 'grab_weapon', durS: 0, note: 'стартовый набор (STARTER_KITS) лежит на верстаке — взять рукой/клавишей' },
      { id: 'target_dummies', durS: 0, note: '3 манекена, урок стрельбы, без урона игроку' },
      { id: 'first_slimes', durS: 0, mobs: [['m_meadow_slime', 3, 3]], at: 'hub_south_gate', note: 'первый бой у ворот хаба, элиты и засады запрещены' },
      { id: 'open_world', durS: 3.0, note: 'ворота открываются, столб света над poi_tower_meadow' },
    ],
    directorGraceS: 300, // первые 5 мин: tension cap 30, только паки w≥20 из SPAWN_TABLES.b_meadow, без элит
  },
  safe: {
    noHostileRadius: 30,      // = WORLD_CONFIG.fastTravel.noEnemiesRadius
    groundProbeUp: 6, groundProbeDown: 40, maxSlopeDeg: 35, // как teleportComfort
    clearanceRadius: 0.6, clearanceHeight: 2.0,
    forbidHazards: ['poison', 'cold', 'heat', 'heat_sun', 'thorns'],
    forbidWater: true, minAboveLava: 4,
    ringSearch: { stepM: 2, rings: 8, perRing: 12 }, // поиск свободной точки по спирали вокруг якоря
    fallback: 'anchor_pad', // если ничего не нашлось — центр площадки POI (r выровнен генератором)
  },
  comfort: {
    fadeOutS: 0.25, holdBlackMinS: 0.2, fadeInS: 0.4, preloadChunks: 9, maxWaitS: 3, // fastTravel канон: 0.4/9/3
    orient: 'face_poi_or_last_heading', snapYawOnly: true, // никогда не крутить pitch/roll
    spawnInvulnS: 3, spawnAggroImmuneS: 5, spawnSlowMoS: 0,
    vignette: { strength: 0.6, durS: 1.0 }, soundCue: 'sfx_spawn_chime',
  },
});

export const RESPAWN = Object.freeze({
  anchorTypes: ['shrine', 'hub', 'tower'],         // + костры-маяки (beacon) и checkpoint подземелья
  beaconsPerBiome: 3,                              // костры-маяки = точки ст. stn_campfire вне POI
  choose: 'nearest_discovered_reachable',          // ближайший открытый якорь того же биома, иначе ближайший вообще
  dungeonCheckpoint: { onEnter: true, keepsBossHp: false },
  deathSequence: { slowMoS: 0.6, desaturateS: 0.8, fadeS: 0.6, respawnScreenMinS: 1.5 },
  penalty: {
    goldDropFrac: 0.10, graveLifeS: 900, graveRecoverAll: true, // «могила-эхо» на месте смерти, вернуть = забрать золото
    xpLoss: 0, itemLoss: false,
    weakenedS: 60, weakenedEnergyRegenMul: 0.75,  // мягкий штраф, без потери урона/HP
    repeatDeathWindowS: 180, repeatDeathAssist: { tensionReset: true, eliteChanceMul: 0.5 },
  },
  worldOnRespawn: { resetChunkPacksWithinM: 0, mobsLeashHome: true, bossHeal: 'full', eventFails: ['ev_caravan_ambush', 'ev_goblin_caravan'] },
  lavaContact: { respawnBackM: 2, hpLoss: 0.3 }, // = BIOMES.b_volcano.hazard.lavaContact (не смерть)
  fallOutOfWorld: { belowY: -30, action: 'last_safe_ground', hpLoss: 0.1 },
});

// ---------- 2. Мобы ----------
export const SPAWN_RULES = Object.freeze({
  points: {
    poissonMinDist: 14, attempts: 24, maxPerChunk: 10, edgeMargin: 3,
    minDistSafePoi: 25, maxSlopeDeg: 28, waterAllowedRoles: ['ai_ambush'], minClearance: 1.5,
    flyerAltitude: [6, 18], coverPointsPerChunk: 4,
  },
  activation: {
    minDistToPlayer: 30, minDistFlyer: 40, // канон 6.9
    viewConeDeg: 70, // половина горизонтального FOV + запас; внутри конуса и в прямой видимости — запрет
    losCheck: true, behindAngleDeg: 110, pickAttempts: 6, queueLookAhead: true,
  },
  tension: {
    perDamage: 0.1, perKill: 0.5, perElite: 3, decayPerS: 1,
    relaxAbove: 60, relaxAboveEasy: 45, relaxS: [30, 45], ambushBelow: 20, cap: 100,
    // множитель частоты новых паков от tension (кусочно-линейно)
    paceCurve: [[0, 1.3], [20, 1.0], [40, 0.8], [60, 0.0], [100, 0.0]],
    tickS: 2, basePackIntervalS: 8,
  },
  ambush: {
    chance: 0.18, cooldownS: 90, minPlayerLevelOver: 2,
    patterns: {
      pincer: { groups: 2, angleSplitDeg: 140, dist: [22, 30], delayS: [0, 1.5] },
      rear: { groups: 1, angleDeg: 180, dist: [18, 25] },
      burrow_ring: { groups: 1, ring: 6, dist: [8, 12], telegraphS: 1.2, roles: ['melee', 'swarm'] },
      sky_drop: { groups: 1, dist: [10, 16], telegraphS: 1.0, roles: ['flyer'] },
      treeline: { groups: 1, dist: [25, 35], needCover: true, roles: ['ranged', 'caster'] },
    },
    biomePattern: {
      b_meadow: ['rear'], b_forest: ['treeline', 'pincer'], b_swamp: ['burrow_ring', 'rear'],
      b_mountains: ['sky_drop', 'pincer'], b_desert_ruins: ['burrow_ring', 'sky_drop'], b_volcano: ['burrow_ring', 'pincer'],
    },
  },
  waves: { // для событий (ev_starfall, ev_rift, ev_eruption) и гарнизонов
    defaultGapS: 8, nextWhenAliveFrac: 0.25, maxWaves: 3, lastWaveEliteChance: 1.0,
    vfxTelegraphS: 1.5, spawnStaggerS: 0.25,
  },
  dayNight: {
    nightDensityMul: 1.25, dawnDuskDensityMul: 1.0, // +25 % (раздел 2.7) — добавки night.add
    nightEliteChanceAdd: 0.02, nightAmbushMul: 1.3,
  },
  weather: {
    rain: { densityMul: 0.9 }, storm: { densityMul: 0.9, ambushMul: 1.2 }, fog: { densityMul: 1.0, ambushMul: 1.5, sightMul: 0.6 },
    toxicFog: { densityMul: 0.8 }, blizzard: { densityMul: 0.7, flyerMul: 0 }, sandstorm: { densityMul: 0.8, ambushMul: 1.4 },
    ashfall: { densityMul: 1.0 }, meteorRain: { densityMul: 0.9 }, eruption: { densityMul: 0.6 },
  },
  respawn: { useTable: true, minPlayerDistM: 120, garrisonPerGameDay: true, jitterS: 30 },
  leash: { returnSpeedMul: 1.6, regenToFullS: 4, invulnWhileReturning: false, resetAggroS: 6 },
  despawn: {
    beyondSpawnRadiusMul: 1.5, outOfViewS: 20, keepIfDamaged: true, keepElites: true,
    corpseS: 1.5, // растворение (раздел 1.5.2: death 0,8–1,5 с)
  },
  elite: { minLevelForAffixes: [1, 10, 20], affixCount: [1, 2, 3], maxAlive: 2, notInFirstPackOfChunk: true, minGapS: 60, auraVfx: 'vfx_elite_aura' },
  levelDensity: [ // плотность по уровню зоны относительно уровня игрока
    { delta: -99, mul: 0.6 }, { delta: -5, mul: 0.8 }, { delta: -2, mul: 1.0 }, { delta: 3, mul: 0.9 }, { delta: 6, mul: 0.7 },
  ],
  zoneLevel: { fromEdgeToLair: true, roundTo: 1 },
  vfx: {
    portal: { durS: 1.2, roles: ['caster', 'support', 'flyer'], biomes: ['b_desert_ruins', 'b_forest'], color: 'arcane' },
    burrow: { durS: 1.0, roles: ['melee', 'swarm', 'tank'], biomes: ['b_swamp', 'b_desert_ruins', 'b_volcano', 'b_meadow'], decal: 'dirt_crack' },
    sky_drop: { durS: 0.9, roles: ['flyer'], biomes: ['b_mountains', 'b_volcano'], shadowGrowS: 0.9 },
    walk_in: { durS: 0, roles: ['*'], biomes: ['*'], note: 'по умолчанию: выход из-за укрытия вне взгляда, без VFX' },
    mist_form: { durS: 1.1, roles: ['caster', 'flyer'], biomes: ['b_swamp', 'b_mountains'], night: true },
  },
  bossRules: {
    disableWorldSpawnPadM: 30, // = PERF_CAPS.bossCost-комментарий: арена + 30 м
    roaming: {
      boss_roam_headless: { when: 'night', chancePerNight: 0.15, path: 'roads', despawnAt: 'dawn', fleeAt: null },
      boss_roam_sandworm: { when: 'noise', shots: 20, windowS: 30, warnS: 8, terrain: 'dunes_only', despawnS: 120 },
    },
  },
  events: {
    intervalS: 90, chance: 0.35, rangeM: [150, 400], maxConcurrent: 1, // = WORLD_CONFIG
    nightChancePerNight: 0.2, bloodMoonEveryNights: 5, beamVisibleM: 500, notWithinPoiM: 60,
    pool: {
      b_meadow: ['ev_goblin_caravan', 'ev_caravan_ambush', 'ev_starfall', 'ev_elite_hunt', 'ev_lost_merchant'],
      b_forest: ['ev_goblin_caravan', 'ev_rift', 'ev_starfall', 'ev_elite_hunt', 'ev_lost_merchant'],
      b_swamp: ['ev_bog_bloom', 'ev_starfall', 'ev_elite_hunt', 'ev_lost_merchant'],
      b_mountains: ['ev_avalanche', 'ev_starfall', 'ev_elite_hunt', 'ev_lost_merchant'],
      b_desert_ruins: ['ev_caravan_ambush', 'ev_rift', 'ev_starfall', 'ev_elite_hunt', 'ev_lost_merchant'],
      b_volcano: ['ev_eruption', 'ev_starfall', 'ev_elite_hunt', 'ev_lost_merchant'],
    },
  },
  perf: {
    poolPerMob: { quest: 6, phone: 6, pc_low: 8, pc_high: 12 }, prewarmBiomes: 2,
    maxSpawnsPerFrame: 2, maxPointGenPerFrame: 1, workerPointGen: true, directorTickS: 2,
  },
});

// Лагеря, гнёзда, логова: слоты в локальных координатах [x, z] (м) от центра; роль слота.
export const CAMP_LAYOUTS = Object.freeze({
  camp_goblin: { poi: 'poi_windmill_camp', r: 18, slots: [
    { at: [0, 0], kind: 'loot', chest: 'iron' }, { at: [-6, 4], role: 'ranged', mob: 'm_goblin_slinger' },
    { at: [6, 4], role: 'ranged', mob: 'm_goblin_slinger' }, { at: [0, -8], role: 'ranged', mob: 'm_goblin_slinger', perch: 2.5 },
    { at: [-10, -6], role: 'melee', mob: 'm_tusk_boar' }, { at: [10, -2], role: 'ranged', mob: 'm_goblin_slinger', perch: 2.5 },
    { at: [3, 10], role: 'alarm', kind: 'gong' }], waves: 1 },
  camp_hunters: { poi: 'poi_hunter_camp', r: 20, slots: [
    { at: [0, 0], kind: 'loot', chest: 'iron' }, { at: [-5, 5], role: 'ranged', mob: 'm_forest_bandit' }, { at: [5, 5], role: 'ranged', mob: 'm_forest_bandit' },
    { at: [-8, -4], role: 'ranged', mob: 'm_forest_bandit', perch: 4 }, { at: [8, -4], role: 'ranged', mob: 'm_forest_bandit' },
    { at: [0, -10], role: 'melee', mob: 'm_forest_wolf' }, { at: [-3, -12], role: 'melee', mob: 'm_forest_wolf' }, { at: [0, 12], role: 'alarm', kind: 'horn' }], waves: 2 },
  nest_spider: { biome: 'b_forest', r: 10, slots: [
    { at: [0, 0], kind: 'egg_sac', hp: 120, spawns: 'm_weaver_spider', everyS: 12, max: 3 }, { at: [-4, 3], role: 'ranged', mob: 'm_weaver_spider', ceiling: true },
    { at: [4, 3], role: 'ranged', mob: 'm_weaver_spider', ceiling: true }, { at: [0, -5], kind: 'loot', chest: 'wood' }], waves: 0 },
  nest_harpy: { biome: 'b_mountains', r: 14, slots: [
    { at: [0, 0], kind: 'nest', hp: 300, spawns: 'm_harpy', everyS: 15, max: 4 }, { at: [-6, 0], role: 'flyer', mob: 'm_harpy', alt: 10 },
    { at: [6, 0], role: 'flyer', mob: 'm_harpy', alt: 12 }, { at: [0, 6], kind: 'loot', chest: 'iron' }], waves: 0 },
  lair_leech: { poi: 'poi_leech_cave', r: 16, slots: [
    { at: [0, 8], role: 'caster', mob: 'm_bog_hag' }, { at: [-5, 0], role: 'melee', mob: 'm_bog_drowner', submerged: true },
    { at: [5, 0], role: 'melee', mob: 'm_bog_drowner', submerged: true }, { at: [-3, -5], role: 'melee', mob: 'm_bog_drowner', submerged: true },
    { at: [3, -5], role: 'melee', mob: 'm_bog_drowner', submerged: true }, { at: [0, 12], kind: 'loot', chest: 'gold' }], waves: 2 },
  camp_yeti: { poi: 'poi_yeti_camp', r: 18, slots: [
    { at: [0, 0], kind: 'brazier' }, { at: [-4, 4], role: 'support', mob: 'm_kobold_icecaller' }, { at: [4, 4], role: 'support', mob: 'm_kobold_icecaller' },
    { at: [-8, -3], role: 'melee', mob: 'm_frost_wolf' }, { at: [8, -3], role: 'melee', mob: 'm_frost_wolf' }, { at: [0, -9], role: 'melee', mob: 'm_frost_wolf' },
    { at: [0, 9], kind: 'loot', chest: 'iron' }], waves: 1 },
  vault_buried: { poi: 'poi_buried_vault', r: 16, slots: [
    { at: [-6, 0], role: 'tank', mob: 'm_stone_guardian', dormant: true }, { at: [6, 0], role: 'tank', mob: 'm_stone_guardian', dormant: true },
    { at: [0, -6], kind: 'swarm_hole', spawns: 'm_scarab_swarm', count: 8 }, { at: [0, 6], kind: 'loot', chest: 'gold' }], waves: 1 },
  camp_raiders: { poi: 'poi_raider_camp', r: 20, slots: [
    { at: [0, 6], role: 'caster', mob: 'm_flame_djinn' }, { at: [-6, 0], role: 'melee', mob: 'm_sand_scorpion' }, { at: [6, 0], role: 'melee', mob: 'm_sand_scorpion' },
    { at: [-3, -6], role: 'swarm', mob: 'm_cursed_skull' }, { at: [3, -6], role: 'swarm', mob: 'm_cursed_skull' }, { at: [0, 0], kind: 'loot', chest: 'iron' }], waves: 2 },
  lair_magma: { poi: 'poi_magma_cave', r: 18, slots: [
    { at: [0, 10], role: 'support', mob: 'm_obsidian_priest' }, { at: [0, 4], role: 'tank', mob: 'm_lava_golem' },
    { at: [-6, -2], role: 'swarm', mob: 'm_magma_imp' }, { at: [6, -2], role: 'swarm', mob: 'm_magma_imp' }, { at: [-3, -7], role: 'swarm', mob: 'm_magma_imp' },
    { at: [3, -7], role: 'swarm', mob: 'm_magma_imp' }, { at: [0, 14], kind: 'loot', chest: 'gold' }], waves: 2 },
});

// ---------- 3. Ресурсы и сундуки ----------
export const NODE_SPAWNS = Object.freeze({
  chests: {
    total: 220, perChunkMax: 1, seedSalt: 0xC4E57,
    types: {
      wood:   { w: 60, guarded: false, rw: 'trash', respawn: null },
      iron:   { w: 28, guarded: true, rw: 'normal', respawn: null },
      gold:   { w: 8, guarded: true, rw: 'elite', puzzle: true, respawn: null },
      arcane: { w: 4, reveal: 's_scan', rw: 'elite', respawn: null },
      meteor: { w: 0, event: 'ev_starfall', rw: 'elite', respawn: null },
    },
    lootLevel: 'max(zoneLevel, playerLevel-2)', openedBits: 'world.chests',
  },
  resources: {
    // id → где растёт, сколько на чанк, респаун (реальные с), выход
    it_mat_herb:      { biomes: ['b_meadow', 'b_forest'], perChunk: [2, 5], respawnS: 600, yield: [1, 2], mask: 'flat_grass', minDist: 6 },
    it_wood:          { biomes: ['b_meadow', 'b_forest'], perChunk: [2, 4], respawnS: 600, yield: [2, 3], mask: 'tree', minDist: 8 },
    it_scrap:         { biomes: ['b_meadow'], perChunk: [1, 3], respawnS: 900, yield: [1, 3], mask: 'road_ruin', minDist: 10 },
    it_storm_cell:    { biomes: ['b_meadow'], perChunk: [0, 1], respawnS: 1800, yield: [1, 1], mask: 'hilltop', minDist: 20, weather: 'storm' },
    it_firefly_jar:   { biomes: ['b_forest'], perChunk: [0, 2], respawnS: 1200, yield: [1, 1], mask: 'clearing', minDist: 12, night: true },
    it_mat_heartwood: { biomes: ['b_forest'], perChunk: [0, 1], respawnS: 2400, yield: [1, 1], mask: 'old_tree', minDist: 30 },
    it_bog_resin:     { biomes: ['b_swamp'], perChunk: [1, 3], respawnS: 900, yield: [1, 2], mask: 'mangrove', minDist: 8 },
    it_purity_herb:   { biomes: ['b_swamp'], perChunk: [0, 2], respawnS: 1200, yield: [1, 1], mask: 'shore', minDist: 12 },
    it_mat_bog_moss:  { biomes: ['b_swamp'], perChunk: [1, 3], respawnS: 900, yield: [1, 2], mask: 'stump', minDist: 8 },
    it_ore_iron:      { biomes: ['b_mountains'], perChunk: [1, 3], respawnS: 1200, yield: [2, 3], mask: 'rock_face', minDist: 10, hits: 3 },
    it_mat_frost_core:{ biomes: ['b_mountains'], perChunk: [0, 1], respawnS: 2400, yield: [1, 1], mask: 'ice', minDist: 25, hits: 4 },
    it_mat_sun_shard: { biomes: ['b_desert_ruins'], perChunk: [0, 2], respawnS: 1800, yield: [1, 1], mask: 'ruin', minDist: 18 },
    it_arcane_dust:   { biomes: ['b_desert_ruins'], perChunk: [0, 2], respawnS: 1200, yield: [1, 2], mask: 'obelisk', minDist: 14 },
    it_gunpowder:     { biomes: ['b_desert_ruins'], perChunk: [0, 1], respawnS: 1200, yield: [1, 2], mask: 'crate', minDist: 18 },
    it_mat_magma_core:{ biomes: ['b_volcano'], perChunk: [0, 1], respawnS: 2400, yield: [1, 1], mask: 'lava_edge', minDist: 25, hits: 4 },
    it_mat_obsidian:  { biomes: ['b_volcano'], perChunk: [1, 2], respawnS: 1200, yield: [1, 2], mask: 'basalt', minDist: 12, hits: 3 },
    it_ember_core:    { biomes: ['b_volcano'], perChunk: [0, 1], respawnS: 1800, yield: [1, 1], mask: 'vent', minDist: 20 },
    it_alloy:         { biomes: ['b_volcano'], perChunk: [0, 1], respawnS: 2400, yield: [1, 1], mask: 'forge_ruin', minDist: 30 },
  },
  collectibles: { it_echo_crystal: { perBiome: 10, respawn: null }, it_atlas_page: { total: 24, respawn: null } },
  respawnRule: { minPlayerDistM: 60, notInView: true, pausedWhileAway: false, campfireRestRespawns: false },
  storage: 'localStorage per chunk: bitset harvested + harvestedAt (сек игры)',
});
