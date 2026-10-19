// shared/defs/items.js — ЕДИНЫЙ реестр предметов it_* (решение конфликта №5). Любой it_, упомянутый в данных, обязан быть здесь
// (проверяет tools/validate-defs.mjs). Моды и патроны описаны подробно в weapons.js (MODS, AMMO), здесь — их карточки реестра.
import { DAMAGE_TYPES } from './core.js';
import { MODS, AMMO } from './weapons.js';
import { SKILLS } from './skills.js';

const I = (name, cat, extra = {}) => Object.freeze({ name, cat, stack: 99, ...extra });
const base = {
  // валюта и «виртуальные» предметы лута
  it_gold:        I('Золото', 'currency', { stack: Infinity, note: 'при подборе зачисляется в player.gold' }),
  it_gear_roll:   I('Случайная экипировка', 'virtual', { note: 'создаёт оружие/снаряжение уровня моба, редкость по профилю rw' }),
  it_skill_tome:  I('Свиток навыка (случайный)', 'virtual', { note: 'превращается в том (it_tome_ + id навыка) ещё не открытого навыка' }),
  it_ammo_pouch:  I('Подсумок', 'virtual', { note: 'патроны для экипированного оружия (умный лут 70 %)' }),
  // материалы с мобов (it_mat_*)
  it_mat_slime_gel: I('Слизь', 'material'), it_mat_tusk: I('Клык кабана', 'material'), it_mat_wisp_ember: I('Уголёк огонька', 'material'),
  it_mat_herb: I('Трава', 'material'), it_mat_wolf_pelt: I('Волчья шкура', 'material'), it_mat_heartwood: I('Сердцевина', 'material'),
  it_mat_silk: I('Паучий шёлк', 'material'), it_mat_venom_gland: I('Ядовитая железа', 'material'), it_mat_feather: I('Перо', 'material'),
  it_mat_bog_moss: I('Болотный мох', 'material'), it_mat_croc_hide: I('Крокодилья кожа', 'material'), it_mat_frost_core: I('Ледяное ядро', 'material'),
  it_mat_yeti_fur: I('Мех йети', 'material'), it_mat_chitin: I('Хитин', 'material'), it_mat_rune_stone: I('Рунный камень', 'material'),
  it_mat_sun_shard: I('Солнечный осколок', 'material'), it_mat_magma_core: I('Магмовое ядро', 'material'), it_mat_obsidian: I('Обсидиан', 'material'),
  it_mat_wyvern_scale: I('Чешуя виверны', 'material'),
  // ресурсы мира и крафта
  it_scrap: I('Лом', 'resource'), it_wood: I('Древесина', 'resource'), it_ore_iron: I('Железная руда', 'resource'), it_alloy: I('Сплав', 'resource'),
  it_gunpowder: I('Порох', 'resource'), it_rope: I('Верёвка', 'resource'), it_bog_resin: I('Болотная смола', 'resource'),
  it_storm_cell: I('Грозовая ячейка', 'resource'), it_firefly_jar: I('Банка светлячков', 'resource'), it_purity_herb: I('Трава очищения', 'resource'),
  it_crystal_shard: I('Осколок кристалла', 'resource', { note: '×2 → it_mana_crystal' }), it_arcane_dust: I('Арканная пыль', 'resource'),
  it_star_fragment: I('Звёздный осколок', 'resource', { note: 'повышение редкости (stn_forge, до epic)' }),
  it_ember_core: I('Ядро углей', 'resource', { note: 'ковка легендарки (stn_forge T3), квест q_main_11' }),
  it_core_shard: I('Осколок ядра', 'resource', { note: 'элиты и боссы; ступень V оружия' }),
  // расходники
  it_potion_hp_s: I('Малое зелье здоровья', 'consumable', { heal: 60 }), it_food_meat: I('Мясо', 'consumable', { cookBuffMin: 10 }),
  it_antidote: I('Противоядие', 'consumable', { cures: ['st_poison', 'spores', 'swamp_poison'] }),
  it_warm_tonic: I('Согревающий тоник', 'consumable', { hazardImmunity: 'cold', durMin: 5 }),
  it_frost_salve: I('Морозная мазь', 'consumable', { hazardImmunity: 'heat', durMin: 5 }),
  it_water_flask: I('Фляга воды', 'consumable', { hazardImmunity: 'heat_sun', durMin: 5 }),
  it_mana_crystal: I('Кристалл маны', 'consumable', { energy: 40, stack: 3 }),
  it_lethe_water: I('Вода Леты', 'consumable', { respec: ['attributes', 'constellations'] }),
  // ключевые и квестовые
  it_purity_amulet: I('Амулет очищения', 'key', { stack: 1, slot: 'amulet', hazardImmunity: 'swamp' }),
  it_fire_seal: I('Печать огня', 'key', { stack: 1, opens: 'gate_volcano' }),
  it_parcel: I('Посылка', 'key', { stack: 1 }),
  it_beacon_heart: I('Сердце маяка', 'collectible', { total: 6 }),
  it_echo_crystal: I('Эхо-кристалл', 'collectible', { total: 60, perTen: { energyMaxPct: 5 } }),
  it_atlas_page: I('Страница Атласа', 'collectible', { total: 24 }),
};
// эссенции по типам урона (ступень V оружия, топливо, ячейки, руны)
for (const t of DAMAGE_TYPES) base[`it_essence_${t}`] = I(`Эссенция: ${t}`, 'essence');
// руны навыков для наруча (stn_enchant): +5 % урона типа (attacker) или +1 к радиусу/длительности навыка этого типа
for (const t of DAMAGE_TYPES) base[`it_skill_rune_${t}`] = I(`Руна навыков: ${t}`, 'skill_rune', { stack: 1, bracerSlot: true });
// патроны и моды (подробности — weapons.js)
for (const id of Object.keys(AMMO)) base[id] = I(id.replace('it_', ''), 'ammo', { stack: AMMO[id].carry });
for (const id of Object.keys(MODS)) base[id] = I(id.replace('it_mod_', 'мод: '), 'mod', { stack: 1, slot: MODS[id].slot });
// тома навыков чужих архетипов
for (const s of Object.values(SKILLS)) if (s.unlock?.tome) base[`it_tome_${s.id}`] = I(`Том: ${s.name}`, 'tome', { stack: 1, skill: s.id });

// Уникальные предметы боссов (it_uniq_*) — бывшие «легендарки» раздела навыков, привязаны к реальным боссам.
const U = (name, slot, boss, effect) => I(name, 'unique', { stack: 1, rarity: 'legendary', slot, boss, effect });
Object.assign(base, {
  it_uniq_slime_crown:   U('Корона Булька', 'head', 'boss_slime_king', 'подбор лута +3 м; зелья лечат на 15 % больше (группа лечения)'),
  it_uniq_rotroot_heart: U('Сердце Гнилокорня', 'amulet', 'boss_rotroot', 'Гравиколодец оставляет корни: ещё 1 с slow 20 % (в потолке 50 %)'),
  it_uniq_hydra_fang:    U('Клык Тинары', 'head', 'boss_hydra_tinara', 'яд от любого источника +1 стак при хедшоте'),
  it_uniq_ymir_core:     U('Ядро Ймира', 'body', 'boss_ymir', 'при заморозке врага рядом +15 щита (щит ≤ 75)'),
  it_uniq_sun_mask:      U('Маска Ахмарета', 'bracer', 'boss_akhmaret', '+1 прыжок Цепной молнии (потолок 4), радиус Перегрузки +1 м'),
  it_uniq_ignarok_heart: U('Сердце Игнарока', 'body', 'boss_ignarok', 'иммунитет к жару вулкана; Огненный шар ×1,15 (база)'),
  it_uniq_lantern:       U('Фонарь всадника', 'ring', 'boss_roam_headless', 'Ускорение восприятия +1 с; при включении Метка на всех в 15 м'),
  it_uniq_worm_tooth:    U('Зуб червя', 'ring', 'boss_roam_sandworm', 'выход из зыбучих песков мгновенный; +10 % урона по зарытым/подземным целям (attacker)'),
});
export const ITEMS = Object.freeze(base);
export const ITEM_CATEGORIES = Object.freeze(['currency', 'virtual', 'material', 'resource', 'essence', 'consumable', 'key', 'collectible', 'skill_rune', 'ammo', 'mod', 'tome', 'unique']);
