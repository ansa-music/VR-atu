// shared/defs/crafting.js — все рецепты rc_* (новый префикс, внесён в реестр ID). out: [itemId|weaponId, кол-во].
// Патроны совпадают с таблицей «Экономика патронов» (раздел 4); базовые патроны и стрелы можно делать и у stn_campfire.
// Улучшение оружия по ступеням — weapons.js UPGRADE_TIERS; повышение редкости/уровня предмета — FORGE ниже.
const R = (station, inp, out, extra = {}) => Object.freeze({ station, in: inp, out, ...extra });
export const RECIPES = Object.freeze({
  // патроны
  rc_ammo_pistol:  R('stn_workbench', [['it_scrap', 1], ['it_gunpowder', 1]], ['it_ammo_pistol', 16]),
  rc_ammo_rifle:   R('stn_workbench', [['it_scrap', 1], ['it_gunpowder', 1]], ['it_ammo_rifle', 20]),
  rc_ammo_shell:   R('stn_workbench', [['it_scrap', 1], ['it_gunpowder', 2]], ['it_ammo_shell', 8]),
  rc_ammo_sniper:  R('stn_workbench', [['it_alloy', 1], ['it_gunpowder', 2]], ['it_ammo_sniper', 5]),
  rc_arrow:        R('stn_campfire',  [['it_wood', 1], ['it_mat_feather', 1]], ['it_arrow', 6]),
  rc_bolt:         R('stn_workbench', [['it_wood', 1], ['it_scrap', 1]], ['it_bolt', 8]),
  rc_fuel:         R('stn_workbench', [['it_bog_resin', 2], ['it_essence_fire', 1]], ['it_fuel', 100]),
  rc_ammo_cell:    R('stn_workbench', [['it_alloy', 2], ['it_essence_lightning', 1]], ['it_ammo_cell', 2]),
  rc_rune_grenade: R('stn_workbench', [['it_gunpowder', 2], ['it_crystal_shard', 1], ['it_mat_herb', 1]], ['it_rune_grenade', 1], { variants: 'стихия (fire/frost/poison) выбирается при крафте' }),
  // оружие и моды
  rc_w_harpoon_crossbow: R('stn_workbench', [['it_wood', 4], ['it_rope', 2], ['it_mat_croc_hide', 3], ['it_alloy', 2]], ['w_harpoon_crossbow', 1], { unlock: 'чертёж у npc_toad (poi_hub_stilt_market)' }),
  rc_mod_extended_mag:   R('stn_workbench', [['it_scrap', 6], ['it_alloy', 1]], ['it_mod_extended_mag', 1]),
  rc_mod_compensator:    R('stn_workbench', [['it_scrap', 5], ['it_ore_iron', 2]], ['it_mod_compensator', 1]),
  rc_mod_quick_grip:     R('stn_workbench', [['it_wood', 2], ['it_mat_wolf_pelt', 2]], ['it_mod_quick_grip', 1]),
  rc_mod_rune_fire:      R('stn_rune_altar', [['it_mat_rune_stone', 2], ['it_essence_fire', 3]], ['it_mod_rune_fire', 1]),
  // переработка
  rc_alloy:        R('stn_forge', [['it_ore_iron', 3], ['it_scrap', 2]], ['it_alloy', 1]),
  rc_gunpowder:    R('stn_alchemy', [['it_wood', 1], ['it_mat_wisp_ember', 1]], ['it_gunpowder', 3]),
  rc_rope:         R('stn_campfire', [['it_mat_silk', 2]], ['it_rope', 1]),
  rc_mana_crystal: R('stn_alchemy', [['it_crystal_shard', 2]], ['it_mana_crystal', 1]),
  // алхимия
  rc_potion_hp_s:  R('stn_alchemy', [['it_mat_herb', 2], ['it_mat_slime_gel', 1]], ['it_potion_hp_s', 1]),
  rc_antidote:     R('stn_alchemy', [['it_purity_herb', 1], ['it_mat_venom_gland', 1]], ['it_antidote', 1]),
  rc_warm_tonic:   R('stn_alchemy', [['it_mat_herb', 1], ['it_mat_wisp_ember', 2]], ['it_warm_tonic', 1]),
  rc_frost_salve:  R('stn_alchemy', [['it_mat_herb', 1], ['it_mat_frost_core', 1]], ['it_frost_salve', 1]),
  rc_water_flask:  R('stn_alchemy', [['it_mat_herb', 1]], ['it_water_flask', 2]),
  rc_lethe_water:  R('stn_alchemy', [['it_arcane_dust', 3], ['it_purity_herb', 2], ['it_gold', 300]], ['it_lethe_water', 1]),
  rc_purity_amulet: R('stn_enchant', [['it_purity_herb', 5], ['it_bog_resin', 3], ['it_arcane_dust', 2]], ['it_purity_amulet', 1], { unlock: 'квест q_main_05' }),
  // костёр
  rc_food_meat:    R('stn_campfire', [['it_mat_tusk', 1]], ['it_food_meat', 2], { buff: '+10 % стамины на 10 мин' }),
  // зачарование
  rc_skill_rune:   R('stn_enchant', [['it_mat_rune_stone', 1], ['it_arcane_dust', 2]], ['it_skill_rune_physical', 1], { variants: 'тип = эссенция (+2 it_essence_<type>) → it_skill_rune_<type>' }),
});
export const FORGE = Object.freeze({
  salvage: { note: 'разбор: common/uncommon → it_scrap, rare+ → it_arcane_dust' },
  itemLevelUp: { station: 'stn_forge', cost: (il) => [['it_scrap', il]], max: 'уровень игрока' },
  rarityUp: { station: 'stn_forge', cost: (rarityIndex) => [['it_star_fragment', 3 + 2 * rarityIndex]], maxRarity: 'epic', addsAffix: 1 },
  legendary: { station: 'stn_forge', tier: 3, cost: [['it_ember_core', 1], ['it_star_fragment', 3], ['it_core_shard', 2]] },
  reroll: { station: 'stn_enchant', firstCost: [['it_arcane_dust', 1]], nextMul: 2, lockPerAffix: [['it_arcane_dust', 2]], note: 'один аффикс af_*; каждая следующая смена на том же предмете ×2' },
  bracerRuneSlots: { base: 2, legendary: 3 },
});
