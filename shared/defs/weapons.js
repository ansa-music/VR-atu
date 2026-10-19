// shared/defs/weapons.js — 20 видов оружия открытого мира (раздел 4). Значения = common, item level 1, ступень I.
// Урон: shared/damage.js по канону (core.js). base = damage × ilvlMul(il) × RARITY.dmg × TIER_DMG — шаг 1 (base), НЕ attacker-бонус.
// ilvlMul = LEVEL_CURVE.playerDmgMult = 1 + 0,06·(il−1) (il30 = ×2,74) — тот же множитель, что у HP мобов.
// status.every = каждый N-й удар (0 = нет), числа статусов — statuses.js. source — откуда берётся (POI/босс/крафт/старт).
import { DAMAGE_TYPES, ZONE, levelMul } from './core.js';
export { DAMAGE_TYPES, ZONE };
export const RARITY = Object.freeze({
  common:    { dmg: 1.00, modSlots: 1, color: '#c8c8c8' },
  uncommon:  { dmg: 1.05, modSlots: 1, color: '#5fd35f' },
  rare:      { dmg: 1.10, modSlots: 2, color: '#4aa8ff' },
  epic:      { dmg: 1.16, modSlots: 3, color: '#b36bff' },
  legendary: { dmg: 1.22, modSlots: 3, color: '#ffb02e', unique: true },
});
export const TIER_DMG = Object.freeze([1.00, 1.04, 1.08, 1.12, 1.16]); // ступени I..V
export const ilvlMul = levelMul; // il30 = ×2.74
// итоговый base = def.damage × ilvlMul × RARITY.dmg × TIER_DMG — всё это шаг 1 (base), НЕ attacker-бонус

const W = (o) => Object.freeze(o);
export const WEAPONS = Object.freeze({
  // ── огнестрел (5 из кода, перебаланс) ──
  w_pm: W({ id: 'w_pm', vendor: 'npc_mot', legacyId: 'pm', name: 'ПМ «Макаров»', cls: 'pistol', zone: 'bullet', arch: ['gunslinger', 'rogue'], type: 'physical',
    damage: 26, pellets: 1, intervalMs: 160, mag: 8, reloadS: 1.7, ammo: 'it_ammo_pistol', range: 44, falloff: [13, 40, 0.66],
    status: { id: 'st_stagger', every: 0 }, hands: 1, holster: 'hip_r', minRarity: 'common', source: { kind: 'start' } }),
  w_ak74: W({ id: 'w_ak74', legacyId: 'ak', name: 'АК-74М', cls: 'rifle', zone: 'bullet', arch: ['gunslinger'], type: 'physical',
    damage: 19, pellets: 1, intervalMs: 100, mag: 30, reloadS: 2.4, ammo: 'it_ammo_rifle', range: 68, falloff: [19, 58, 0.72],
    hands: 2, holster: 'shoulder_r', minRarity: 'common', source: { kind: 'poi', poi: 'poi_windmill_camp', note: 'сундук после зачистки лагеря (common)' } }),
  w_mr133: W({ id: 'w_mr133', legacyId: 'shotgun', name: 'МР-133 «Помпа»', cls: 'shotgun', zone: 'bullet', arch: ['guardian', 'gunslinger'], type: 'physical',
    damage: 7, pellets: 10, intervalMs: 550, mag: 6, reloadS: 0.45, reloadPer: 'shell', ammo: 'it_ammo_shell', range: 28, falloff: [6, 22, 0.35],
    status: { id: 'st_stagger', every: 1, minPellets: 6 }, hands: 2, holster: 'back', minRarity: 'common', source: { kind: 'poi', poi: 'poi_fallen_titan_forest' } }),
  w_sv98: W({ id: 'w_sv98', legacyId: 'sniper', name: 'СВ-98', cls: 'sniper', zone: 'bullet', arch: ['gunslinger'], type: 'physical',
    damage: 105, pellets: 1, intervalMs: 1300, mag: 5, reloadS: 3.0, ammo: 'it_ammo_sniper', range: 120, falloff: [48, 85, 0.78], pierce: 2,
    hands: 2, holster: 'shoulder_l', minRarity: 'rare', source: { kind: 'poi', poi: 'poi_peak_stuzha' } }),
  w_neon_blaster: W({ id: 'w_neon_blaster', legacyId: 'blaster', name: 'Бластер «Неон»', cls: 'energy_gun', zone: 'bullet', arch: ['gunslinger', 'mystic'], type: 'lightning',
    damage: 18, pellets: 1, intervalMs: 140, heat: { perShot: 0.085, cool: 0.45, delay: 0.35, overheatS: 2.0 }, range: 55, falloff: [18, 52, 0.72],
    status: { id: 'st_shock', every: 6, stacks: 1 }, hands: 1, holster: 'hip_l', minRarity: 'uncommon', source: { kind: 'poi', poi: 'poi_buried_vault' } }),
  // ── фэнтези-набор из FANTASY-PLAN ──
  w_spark_wand: W({ id: 'w_spark_wand', legacyId: 'wand', name: 'Жезл «Искра»', cls: 'catalyst', zone: 'other', arch: ['mystic'], type: 'arcane',
    damage: 22, pellets: 1, intervalMs: 180, heat: { perShot: 0.06, cool: 0.5, delay: 0.3, overheatS: 1.6 }, range: 50, falloff: [15, 45, 0.7],
    charge: { maxS: 1.2, min: 1.0, max: 1.5, energy: 10 }, hands: 1, holster: 'hip_r', minRarity: 'common', source: { kind: 'start' } }),
  w_elemental_staff: W({ id: 'w_elemental_staff', legacyId: 'staff', name: 'Посох стихий', cls: 'catalyst', zone: 'other', arch: ['mystic'], type: 'fire', elements: ['fire', 'frost', 'lightning'],
    damage: 16, pellets: 1, intervalMs: 110, heat: { perShot: 0.05, cool: 0.4, delay: 0.4, overheatS: 2.0 }, range: 45, falloff: [15, 40, 0.7],
    status: { id: 'by_element', every: 4, stacks: 1 }, hands: 2, holster: 'shoulder_r', minRarity: 'rare', source: { kind: 'poi', poi: 'poi_colossus_ruin' } }),
  w_soul_blade: W({ id: 'w_soul_blade', legacyId: 'blade', name: 'Клинок души', cls: 'melee', zone: 'other', arch: ['guardian', 'rogue'], type: 'physical',
    damage: 55, pellets: 1, intervalMs: 550, range: 1.6, falloff: [1.6, 1.6, 1],
    swing: { minTipSpeed: 2.0, strongTipSpeed: 4.0, min: 0.7, max: 1.3 }, alt: { name: 'Волна-полумесяц', damage: 40, type: 'arcane', energy: 15, range: 12 },
    status: { id: 'st_stagger', every: 3 }, hands: 1, holster: 'back', minRarity: 'common', source: { kind: 'start' } }),
  w_rune_bow: W({ id: 'w_rune_bow', legacyId: 'bow', name: 'Лук рун', cls: 'bow', zone: 'other', arch: ['rogue', 'gunslinger'], type: 'physical',
    damage: 80, pellets: 1, intervalMs: 1350, mag: 1, ammo: 'it_arrow', range: 110, falloff: [40, 90, 0.75],
    charge: { maxS: 1.0, minS: 0.3, min: 0.5, max: 1.5 }, hands: 2, holster: 'shoulder_l', minRarity: 'uncommon', source: { kind: 'poi', poi: 'poi_hunter_camp' } }),
  w_ki_gauntlet: W({ id: 'w_ki_gauntlet', legacyId: 'gauntlet', name: 'Перчатка ки', cls: 'catalyst_melee', zone: 'other', arch: ['mystic', 'guardian'], type: 'arcane',
    damage: 30, pellets: 1, intervalMs: 250, heat: { perShot: 0.09, cool: 0.6, delay: 0.25, overheatS: 1.5 }, range: 18, falloff: [6, 15, 0.5],
    status: { id: 'st_stagger', every: 3 }, hands: 1, holster: 'hip_l', minRarity: 'rare', source: { kind: 'poi', poi: 'poi_aurora_shrine' } }),
  w_arcane_bracer: W({ id: 'w_arcane_bracer', name: 'Наруч «Аркан»', cls: 'offhand_focus', zone: 'other', arch: ['mystic', 'guardian', 'rogue', 'gunslinger'], type: 'arcane',
    damage: 40, pellets: 1, intervalMs: 600, energy: 4, range: 30, falloff: [12, 30, 0.7], ricochet: { targets: 1, mul: 0.6 },
    passive: { skillDmg: 0.10, skillCost: -0.10 }, hands: 0, holster: 'wrist_l', minRarity: 'common', source: { kind: 'start', note: 'у всех; ступени — stn_rune_altar' } }),
  // ── новые ──
  w_harpoon_crossbow: W({ id: 'w_harpoon_crossbow', name: 'Арбалет-гарпун «Багор»', cls: 'crossbow', zone: 'other', arch: ['gunslinger', 'guardian'], type: 'physical',
    damage: 55, pellets: 1, intervalMs: 900, mag: 1, ammo: 'it_bolt', range: 30, falloff: [20, 30, 0.8], pull: { m: 3, eliteMul: 0.5, boss: false },
    status: { id: 'st_stagger', every: 1 }, hands: 2, holster: 'back', minRarity: 'uncommon', source: { kind: 'craft', recipe: 'rc_w_harpoon_crossbow', station: 'stn_workbench' } }),
  w_frost_repeater: W({ id: 'w_frost_repeater', name: 'Самострел «Иней»', cls: 'crossbow', zone: 'other', arch: ['rogue', 'mystic'], type: 'frost',
    damage: 14, pellets: 1, intervalMs: 120, mag: 12, reloadS: 2.2, ammo: 'it_bolt', range: 40, falloff: [15, 35, 0.7],
    status: { id: 'st_chill', every: 5, stacks: 1 }, hands: 2, holster: 'shoulder_r', minRarity: 'rare', source: { kind: 'poi', poi: 'poi_yeti_camp' } }),
  w_venom_fangs: W({ id: 'w_venom_fangs', vendor: 'npc_toad', name: 'Клыки змеи (парные)', cls: 'melee_dual', zone: 'other', arch: ['rogue'], type: 'poison',
    damage: 26, pellets: 1, intervalMs: 260, range: 1.1, falloff: [1.1, 1.1, 1], swing: { minTipSpeed: 1.5, strongTipSpeed: 3.0, min: 0.8, max: 1.2 },
    alt: { name: 'Бросок клыка', damage: 30, type: 'poison', charges: 3, rechargeS: 4, range: 20, stacks: 2 },
    status: { id: 'st_poison', every: 2, stacks: 1 }, hands: 1, holster: 'hip_l', minRarity: 'common', source: { kind: 'start' } }),
  w_thunder_hammer: W({ id: 'w_thunder_hammer', name: 'Молот грома', cls: 'melee_heavy', zone: 'other', arch: ['guardian'], type: 'lightning',
    damage: 85, pellets: 1, intervalMs: 1100, range: 2.0, falloff: [2, 2, 1], swing: { minTipSpeed: 2.5, strongTipSpeed: 4.5, min: 0.8, max: 1.2 },
    alt: { name: 'Удар оземь', damage: 70, type: 'lightning', energy: 20, aoeR: 2.5, chargeS: 0.6 },
    status: { id: 'st_stagger', every: 1 }, status2: { id: 'st_shock', every: 2, stacks: 1 }, hands: 2, holster: 'back', minRarity: 'epic', source: { kind: 'boss', boss: 'boss_ymir' } }),
  w_aegis_shield: W({ id: 'w_aegis_shield', name: 'Щит «Эгида»', cls: 'shield', zone: 'other', arch: ['guardian'], type: 'physical',
    damage: 40, pellets: 1, intervalMs: 700, range: 1.4, falloff: [1.4, 1.4, 1], block: { frontal: 0.6, parryS: 0.25, reflectMul: 0.5, staminaPerHit: 0.4 },
    status: { id: 'st_stagger', every: 2 }, hands: 0, holster: 'wrist_l', minRarity: 'common', source: { kind: 'start' } }),
  w_dragon_breath: W({ id: 'w_dragon_breath', name: 'Огнемёт «Дыхание дракона»', cls: 'heavy', zone: 'aoe', arch: ['guardian', 'mystic'], type: 'fire',
    damage: 6, pellets: 1, intervalMs: 50, mag: 100, reloadS: 2.5, ammo: 'it_fuel', range: 9, falloff: [4, 9, 0.5], cone: 20,
    status: { id: 'st_burn', every: 10, stacks: 1 }, hands: 2, holster: 'back', minRarity: 'epic', source: { kind: 'poi', poi: 'poi_hub_ash_forge', note: 'покупка у npc_gorn' } }),
  w_thunder_rail: W({ id: 'w_thunder_rail', name: 'Рельса «Копьё грома»', cls: 'heavy', zone: 'bullet', arch: ['gunslinger'], type: 'lightning',
    damage: 125, pellets: 1, intervalMs: 1600, mag: 4, reloadS: 3.2, ammo: 'it_ammo_cell', range: 150, falloff: [100, 150, 0.85], pierce: 99, shieldMul: 1.5,
    charge: { maxS: 1.0, min: 1.0, max: 1.0, required: true }, status: { id: 'st_shock', every: 1, stacks: 1 }, hands: 2, holster: 'back', minRarity: 'legendary', source: { kind: 'boss', boss: 'boss_ignarok' } }),
  w_rune_grenades: W({ id: 'w_rune_grenades', name: 'Рунные гранаты', cls: 'throwable', zone: 'aoe', arch: ['mystic', 'guardian', 'rogue', 'gunslinger'], type: 'fire', elements: ['fire', 'frost', 'poison'],
    damage: 80, pellets: 1, intervalMs: 1000, mag: 4, ammo: 'it_rune_grenade', range: 25, falloff: [0, 3.5, 0.375], fuseS: 1.5,
    status: { id: 'by_element', every: 1, stacks: 2 }, hands: 1, holster: 'belt', minRarity: 'common', source: { kind: 'craft', recipe: 'rc_rune_grenade', station: 'stn_workbench' } }),
  w_swamp_censer: W({ id: 'w_swamp_censer', name: 'Кадило топей', cls: 'catalyst', zone: 'other', arch: ['mystic', 'rogue'], type: 'poison',
    damage: 34, pellets: 1, intervalMs: 400, heat: { perShot: 0.1, cool: 0.5, delay: 0.3, overheatS: 1.8 }, range: 30, falloff: [10, 25, 0.6],
    puddle: { dps: 16, s: 2, r: 1.5 }, status: { id: 'st_poison', every: 1, stacks: 1 }, hands: 1, holster: 'hip_r', minRarity: 'epic', source: { kind: 'boss', boss: 'boss_hydra_tinara' } }),
});

// Стартовые наборы (q_main_01 → rewards.startKit). Наруч-HUD есть у всех; боевой модуль w_arcane_bracer — у всех со старта.
export const STARTER_KITS = Object.freeze({
  guardian:   ['w_soul_blade', 'w_aegis_shield', 'w_arcane_bracer'],
  rogue:      ['w_venom_fangs', 'w_pm', 'w_arcane_bracer'],
  mystic:     ['w_spark_wand', 'w_arcane_bracer'],
  gunslinger: ['w_pm', 'w_arcane_bracer'],   // АК-74М (common) лежит в первом лагере poi_windmill_camp
});

// Ступени улучшения I–V. Огнестрел, арбалеты, щит, молот, огнемёт — stn_workbench; катализаторы, лук, наруч, кинжалы — stn_rune_altar.
export const UPGRADE_TIERS = Object.freeze([
  { tier: 1, dmg: 1.00, extra: null, cost: [] },
  { tier: 2, dmg: 1.04, extra: 'reload_or_heat_-5%', cost: [['it_scrap', 4], ['biome_material', 2]] },
  { tier: 3, dmg: 1.08, extra: 'mod_slot_+1', cost: [['it_scrap', 8], ['it_crystal_shard', 2], ['biome_material', 4]] },
  { tier: 4, dmg: 1.12, extra: 'falloff_+10%', cost: [['it_alloy', 3], ['it_crystal_shard', 4]] },
  { tier: 5, dmg: 1.16, extra: 'awakening', cost: [['it_alloy', 5], ['essence_of_weapon_type', 3], ['it_core_shard', 1]] },
]);
// biome_material = материал биома, где оружие получено (BIOMES[b].resources[0]); essence_of_weapon_type = it_essence_<type>.
export const UPGRADE_STATIONS = Object.freeze({
  stn_workbench: ['pistol', 'rifle', 'shotgun', 'sniper', 'energy_gun', 'crossbow', 'shield', 'melee_heavy', 'heavy', 'melee'],
  stn_rune_altar: ['catalyst', 'catalyst_melee', 'bow', 'offhand_focus', 'melee_dual'],
});

// Моды (14). Слоты: barrel, optic, mag, grip, core (одно ядро-руна на оружие). Бонусы % урона — группа attacker (≤ +50 %).
export const MODS = Object.freeze({
  it_mod_extended_mag:   { slot: 'mag',    fits: ['pistol', 'rifle', 'shotgun', 'sniper', 'crossbow', 'heavy'], effect: { magMul: 1.4, shotgunPlus: 2, railPlus: 1 }, source: { craft: 'rc_mod_extended_mag', biome: 'b_forest' } },
  it_mod_heat_sink:      { slot: 'mag',    fits: ['energy_gun', 'catalyst', 'catalyst_melee'], effect: { overheatTimeMul: 0.75, heatPerShotMul: 0.85 }, source: { biome: 'b_desert_ruins' } },
  it_mod_scope_x4:       { slot: 'optic',  fits: ['rifle', 'sniper', 'bow', 'crossbow', 'catalyst'], effect: { ads: 4, swayMul: 0.7 }, source: { biome: 'b_forest' } },
  it_mod_compensator:    { slot: 'barrel', fits: ['pistol', 'rifle', 'energy_gun', 'crossbow'], effect: { recoilMul: 0.75, spreadMul: 0.75 }, source: { craft: 'rc_mod_compensator', biome: 'b_meadow' } },
  it_mod_long_barrel:    { slot: 'barrel', fits: ['ranged'], effect: { falloffMul: 1.2 }, source: { biome: 'b_forest' } },
  it_mod_silencer:       { slot: 'barrel', fits: ['pistol', 'rifle', 'sniper', 'bow', 'crossbow'], effect: { wakeRadiusM: 10, dmgMul: 0.95 }, source: { biome: 'b_swamp' } },
  it_mod_quick_grip:     { slot: 'grip',   fits: ['all'], effect: { swapReloadMul: 0.8 }, source: { craft: 'rc_mod_quick_grip', biome: 'b_meadow' } },
  it_mod_balance_weight: { slot: 'grip',   fits: ['melee', 'melee_dual', 'melee_heavy', 'shield'], effect: { swingThresholdMul: 0.75, blockStaminaMul: 0.8 }, source: { biome: 'b_mountains' } },
  it_mod_rune_fire:      { slot: 'core',   fits: ['all_except_element_catalyst'], effect: { convert: { type: 'fire', share: 0.25 }, status: { id: 'st_burn', every: 8, stacks: 1 } }, source: { craft: 'rc_mod_rune_fire', biome: 'b_volcano' } },
  it_mod_rune_frost:     { slot: 'core',   fits: ['all_except_element_catalyst'], effect: { convert: { type: 'frost', share: 0.25 }, status: { id: 'st_chill', every: 8, stacks: 1 } }, source: { biome: 'b_mountains' } },
  it_mod_rune_storm:     { slot: 'core',   fits: ['all_except_element_catalyst'], effect: { convert: { type: 'lightning', share: 0.25 }, status: { id: 'st_shock', every: 8, stacks: 1 } }, source: { biome: 'b_desert_ruins' } },
  it_mod_rune_venom:     { slot: 'core',   fits: ['all_except_element_catalyst'], effect: { convert: { type: 'poison', share: 0.25 }, status: { id: 'st_poison', every: 6, stacks: 1 } }, source: { biome: 'b_swamp' } },
  it_mod_hunter_sigil:   { slot: 'core',   fits: ['all'], effect: { attackerVsEliteBoss: 0.15 }, source: { drop: 'elite' } },
  it_mod_leech_crystal:  { slot: 'optic',  fits: ['all'], effect: { dmgToEnergy: 0.06, maxPerS: 10 }, source: { biome: 'b_swamp' } },
});

// Боеприпасы и энергия. carry — носимый максимум.
export const AMMO = Object.freeze({
  it_ammo_pistol:  { carry: 96,  drop: [6, 12],  recipe: 'rc_ammo_pistol' },
  it_ammo_rifle:   { carry: 180, drop: [10, 20], recipe: 'rc_ammo_rifle' },
  it_ammo_shell:   { carry: 36,  drop: [3, 6],   recipe: 'rc_ammo_shell' },
  it_ammo_sniper:  { carry: 25,  drop: [2, 4],   recipe: 'rc_ammo_sniper' },
  it_arrow:        { carry: 30,  drop: [3, 6],   recipe: 'rc_arrow', pickupChance: 0.6 },
  it_bolt:         { carry: 48,  drop: [4, 8],   recipe: 'rc_bolt' },
  it_fuel:         { carry: 300, drop: [20, 40], recipe: 'rc_fuel' },
  it_ammo_cell:    { carry: 12,  drop: [1, 2],   recipe: 'rc_ammo_cell' },
  it_rune_grenade: { carry: 4,   drop: [1, 1],   recipe: 'rc_rune_grenade' },
});
// it_ammo_pouch (лут мобов) превращается в патроны экипированного оружия (умный лут, 70 % — для экипированных слотов).
