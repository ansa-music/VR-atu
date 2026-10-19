// shared/defs/pois.js — точки интереса, станции, NPC и гейты (раздел 2).
// pos — [x, z] в метрах, y по рельефу; r — радиус выравнивания площадки. fastTravel — точка перемещения после открытия.
// Станции — префикс stn_ (решение конфликта №4: st_ зарезервирован за статусами).
export const STATIONS = Object.freeze({
  stn_campfire:   { name: 'Костёр', does: ['rest', 'cook', 'swap_belt', 'swap_ult', 'swap_talents', 'fast_travel', 'craft_ammo_basic', 'refill_arrows_50'] },
  stn_workbench:  { name: 'Верстак', does: ['craft_ammo', 'craft_grenades', 'repair', 'upgrade_t1', 'upgrade_firearms', 'craft_weapon'] },
  stn_forge:      { name: 'Кузня', tiers: 3, does: ['item_level', 'weapon_tiers', 'mod_slots', 'rarity_up', 'legendary_forge_t3'] },
  stn_alchemy:    { name: 'Алхимический стол', does: ['potions', 'antidote', 'it_warm_tonic', 'it_frost_salve', 'it_lethe_water', 'it_water_flask'] },
  stn_enchant:    { name: 'Арканный стол', does: ['reroll_affix', 'skill_runes', 'bracer_slots'] },
  stn_rune_altar: { name: 'Рунный алтарь', does: ['upgrade_catalysts', 'upgrade_bows', 'upgrade_bracer', 'upgrade_daggers'] },
});

export const NPCS = Object.freeze({
  npc_ira:   { name: 'Старейшина Ира', hub: 'poi_hub_dawnford', role: 'story' },
  npc_mot:   { name: 'Торговец Мот', hub: 'poi_hub_dawnford', role: 'vendor' },
  npc_bor:   { name: 'Кузнец Бор', hub: 'poi_hub_dawnford', role: 'smith' },
  npc_olh:   { name: 'Друид Ольх', hub: 'poi_hub_rootvale', role: 'story_trainer' },
  npc_mia:   { name: 'Травница Мия', hub: 'poi_hub_rootvale', role: 'alchemist' },
  npc_toad:  { name: 'Контрабандист Жаба', hub: 'poi_hub_stilt_market', role: 'vendor_rare' },
  npc_witch: { name: 'Ведьма', hub: 'poi_witch_hut', role: 'alchemist' },
  npc_soyka: { name: 'Проводник Сойка', hub: 'poi_hub_pass_camp', role: 'guide_smith' },
  npc_set:   { name: 'Архивариус Сэт', hub: 'poi_hub_mirage_oasis', role: 'enchanter' },
  npc_gorn:  { name: 'Титан-кузнец Горн', hub: 'poi_hub_ash_forge', role: 'smith_legendary' },
});

const P = (id, biome, type, pos, extra = {}) => Object.freeze({ id, biome, type, pos, r: 12, ...extra });
export const POI_TYPES = Object.freeze(['hub', 'camp', 'dungeon', 'arena', 'shrine', 'ruin', 'tower', 'cave', 'puzzle', 'treasure', 'viewpoint']);
export const POIS = Object.freeze([
  // --- b_meadow ---
  P('poi_hub_dawnford', 'b_meadow', 'hub', [1180, 1300], { r: 40, fastTravel: true, stations: ['stn_campfire', 'stn_workbench', 'stn_forge'], forgeTier: 1, npcs: ['npc_ira', 'npc_mot', 'npc_bor'] }),
  P('poi_tower_meadow', 'b_meadow', 'tower', [980, 1240], { fastTravel: true, revealRadius: 300, grants: 'it_beacon_heart' }),
  P('poi_stone_circle', 'b_meadow', 'shrine', [880, 1360], { grants: 's_grapple', quest: 'q_main_02', stations: ['stn_rune_altar'] }),
  P('poi_windmill_camp', 'b_meadow', 'camp', [1060, 1120], { level: 4, garrison: true, trial: true, respawnMin: 20, loot: ['w_ak74'] }),
  P('poi_old_bunker', 'b_meadow', 'dungeon', [1300, 1420], { level: 1, quest: 'q_main_01', interior: 'bunker' }),
  P('poi_ravine_bridge', 'b_meadow', 'puzzle', [720, 1180], { requires: ['s_grapple'] }),
  P('poi_lake_view', 'b_meadow', 'viewpoint', [1240, 1150], { collectible: 'photo' }),
  P('poi_sunken_chest_meadow', 'b_meadow', 'treasure', [1120, 1200], { chest: 'iron' }),
  P('poi_slime_pond', 'b_meadow', 'arena', [820, 1460], { r: 22, level: 6, boss: 'boss_slime_king', quest: 'q_side_slime_king' }),
  // --- b_forest ---
  P('poi_hub_rootvale', 'b_forest', 'hub', [360, 760], { r: 30, fastTravel: true, stations: ['stn_campfire', 'stn_alchemy'], npcs: ['npc_olh', 'npc_mia'], trainer: true }),
  P('poi_tower_forest', 'b_forest', 'tower', [520, 640], { fastTravel: true, requires: ['s_grapple'], revealRadius: 300, grants: 'it_beacon_heart' }),
  P('poi_guardian_tree', 'b_forest', 'dungeon', [300, 600], { r: 26, level: 12, boss: 'boss_rotroot', requires: ['q_main_03'] }),
  P('poi_owl_cliff', 'b_forest', 'viewpoint', [140, 880], { collectible: 'photo', glideStart: true }),
  P('poi_mushroom_cave', 'b_forest', 'cave', [560, 860], { level: 8 }),
  P('poi_hunter_camp', 'b_forest', 'camp', [640, 760], { level: 9, garrison: true, trial: true, loot: ['w_rune_bow'] }),
  P('poi_wisp_shrine', 'b_forest', 'shrine', [440, 560], { puzzle: 'order', grants: 'skill_point', stations: ['stn_rune_altar'] }),
  P('poi_thorn_maze', 'b_forest', 'puzzle', [200, 700], { requires: ['s_dash'] }),
  P('poi_fallen_titan_forest', 'b_forest', 'ruin', [660, 600], { loot: ['it_scrap', 'it_core_shard', 'w_mr133'] }),
  // --- b_swamp ---
  P('poi_hub_stilt_market', 'b_swamp', 'hub', [220, 1180], { r: 30, fastTravel: true, stations: ['stn_campfire', 'stn_workbench'], npcs: ['npc_toad'] }),
  P('poi_tower_swamp', 'b_swamp', 'tower', [120, 1300], { fastTravel: true, revealRadius: 300, grants: 'it_beacon_heart' }),
  P('poi_sunken_train', 'b_swamp', 'dungeon', [300, 1380], { r: 24, level: 16, boss: 'boss_hydra_tinara', requires: ['q_main_05'], interior: 'flooded_depot' }),
  P('poi_witch_hut', 'b_swamp', 'shrine', [80, 1100], { npcs: ['npc_witch'], stations: ['stn_alchemy', 'stn_rune_altar'], grants: 'it_purity_amulet' }),
  P('poi_toxic_pump', 'b_swamp', 'puzzle', [380, 1260], { effect: 'reduce_poison_area', grants: 'skill_point' }),
  P('poi_leech_cave', 'b_swamp', 'cave', [160, 1440], { level: 14, garrison: true, trial: true }),
  P('poi_bog_chest', 'b_swamp', 'treasure', [420, 1460], { chest: 'gold', requires: ['s_grapple'] }),
  // --- b_mountains ---
  P('poi_hub_pass_camp', 'b_mountains', 'hub', [620, 360], { r: 25, fastTravel: true, stations: ['stn_campfire', 'stn_forge'], forgeTier: 2, npcs: ['npc_soyka'], warmZone: 12 }),
  P('poi_tower_mountains', 'b_mountains', 'tower', [400, 200], { fastTravel: true, revealRadius: 350, grants: 'it_beacon_heart' }),
  P('poi_frost_fortress', 'b_mountains', 'dungeon', [260, 300], { r: 30, level: 22, boss: 'boss_ymir', requires: ['q_main_07'] }),
  P('poi_peak_stuzha', 'b_mountains', 'viewpoint', [520, 140], { requires: ['s_grapple'], collectible: 'photo', revealRadius: 600, loot: ['w_sv98'] }),
  P('poi_ice_cave', 'b_mountains', 'cave', [760, 220], { level: 17, puzzle: 'light_beam' }),
  P('poi_aurora_shrine', 'b_mountains', 'shrine', [180, 140], { onlyNight: true, grants: 'skill_point', stations: ['stn_rune_altar'], loot: ['w_ki_gauntlet'] }),
  P('poi_yeti_camp', 'b_mountains', 'camp', [700, 460], { level: 19, garrison: true, trial: true, loot: ['w_frost_repeater'] }),
  P('poi_avalanche_gorge', 'b_mountains', 'puzzle', [840, 380], { effect: 'open_path_to_desert' }),
  // --- b_desert_ruins ---
  P('poi_hub_mirage_oasis', 'b_desert_ruins', 'hub', [1100, 700], { r: 30, fastTravel: true, stations: ['stn_campfire', 'stn_enchant', 'stn_rune_altar'], npcs: ['npc_set'] }),
  P('poi_tower_desert', 'b_desert_ruins', 'tower', [900, 600], { fastTravel: true, requires: ['s_teleport'], revealRadius: 350, grants: 'it_beacon_heart' }),
  P('poi_sun_temple', 'b_desert_ruins', 'dungeon', [1200, 820], { r: 30, level: 26, boss: 'boss_akhmaret', requires: ['q_main_09'] }),
  P('poi_colossus_ruin', 'b_desert_ruins', 'ruin', [960, 860], { collectible: 'photo', loot: ['w_elemental_staff'] }),
  P('poi_seal_puzzle', 'b_desert_ruins', 'puzzle', [1300, 640], { requires: ['s_scan'], seals: 4, grants: 'skill_point' }),
  P('poi_sand_cave', 'b_desert_ruins', 'cave', [1360, 900], { level: 21 }),
  P('poi_raider_camp', 'b_desert_ruins', 'camp', [1000, 940], { level: 22, garrison: true, trial: true }),
  P('poi_buried_vault', 'b_desert_ruins', 'treasure', [1420, 760], { chest: 'arcane', requires: ['s_scan'], garrison: true, loot: ['w_neon_blaster'] }),
  // --- b_volcano ---
  P('poi_hub_ash_forge', 'b_volcano', 'hub', [1240, 420], { r: 30, fastTravel: true, stations: ['stn_campfire', 'stn_forge', 'stn_workbench'], npcs: ['npc_gorn'], forgeTier: 3, loot: ['w_dragon_breath'] }),
  P('poi_tower_volcano', 'b_volcano', 'tower', [1100, 300], { fastTravel: true, revealRadius: 350, grants: 'it_beacon_heart' }),
  P('poi_ash_citadel', 'b_volcano', 'dungeon', [1300, 180], { r: 40, level: 30, boss: 'boss_ignarok', requires: ['q_main_11'] }),
  P('poi_obsidian_bridge', 'b_volcano', 'puzzle', [1280, 300], { quest: 'q_main_11' }),
  P('poi_magma_cave', 'b_volcano', 'cave', [1440, 360], { level: 27, garrison: true, trial: true }),
  P('poi_caldera_view', 'b_volcano', 'viewpoint', [1380, 240], { requires: ['s_glide'], collectible: 'photo' }),
  P('poi_ember_shrine', 'b_volcano', 'shrine', [1000, 200], { grants: 'skill_point', stations: ['stn_rune_altar'] }),
  P('poi_meteor_crater', 'b_volcano', 'treasure', [1460, 480], { chest: 'meteor' }),
]);

// Гейты биомов (проверка при входе в «жёсткие» зоны). requires: предмет, босс (повержен) или квест (выполнен).
export const GATES = Object.freeze([
  { id: 'gate_volcano', from: 'b_desert_ruins', to: 'b_volcano', requires: ['it_fire_seal'] },
  { id: 'gate_ice_bridge', from: 'b_mountains', to: 'b_volcano', requires: ['boss_ymir'] },
]);
