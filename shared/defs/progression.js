// shared/defs/progression.js — уровни, очки, характеристики, созвездия, аффиксы экипировки (раздел 5).
// Кривая опыта и опыт за мобов — LEVEL_CURVE в core.js.
export const POINTS = Object.freeze({
  skillPoints: { perLevel: 1, total: 40,
    bossQuests: ['q_main_04', 'q_main_05', 'q_main_07', 'q_main_09', 'q_main_12'],                      // 5 сюжетных боссов
    shrines: ['poi_wisp_shrine', 'poi_toxic_pump', 'poi_aurora_shrine', 'poi_seal_puzzle', 'poi_ember_shrine'] }, // 5 скрытых святилищ
  talentPoints: { everyLevels: 3, fromLevels: 10, trials: 6, total: 16,
    trialPois: ['poi_windmill_camp', 'poi_hunter_camp', 'poi_leech_cave', 'poi_yeti_camp', 'poi_raider_camp', 'poi_magma_cave'] },
  attributePoints: { perLevelFrom2: 2, total: 58, maxPerAttribute: 30 },
  ngPlusMastery: { xpPerPoint: 20000, maxPoints: 6 },
  respec: { item: 'it_lethe_water', poi: 'poi_hub_rootvale', archetypeChange: { firstFree: true, goldPerLevel: 20 } }, // 200 × L/10
});

export const ATTRIBUTES = Object.freeze({
  vit: { name: 'Стойкость', perPoint: { hp: 4 }, affinity: 'guardian' },
  agi: { name: 'Ловкость', perPoint: { stamina: 2, moveSpeed: 0.003 }, affinity: 'rogue' },
  wil: { name: 'Воля', perPoint: { energyRegen: 0.1, statusDuration: 0.005 }, affinity: 'mystic' },
  pre: { name: 'Меткость', perPoint: { headZone: 0.005, falloffRange: 0.01 }, affinity: 'gunslinger' },
  affinityPerPoint: 0.005, affinityMax: 0.15, // бонус attacker к навыкам своего архетипа
});

// Созвездия: 2 ветки × 4 узла на архетип (стоимость 1, 1, 2, 2 ОТ) + общая ветка «Странник» (6 узлов по 1 ОТ). Чужой узел +1 ОТ.
export const CONSTELLATIONS = Object.freeze({
  guardian: { A: { name: 'Бастион', nodes: ['восст. щита +3/с', 'Барьер +10 % поглощения', 'броня +4 % (снижение)', 'окно идеального блока +0,1 с'] },
              B: { name: 'Земля', nodes: ['откат Крюка −0,5 с', 'радиус Колодца +0,5 м', 'стаггер +0,1 с (≤ 1 с)', 'Территория +1 с'] } },
  rogue:    { A: { name: 'Яд', nodes: ['урон яда +10 % (база)', 'Клинки +2 с', 'радиус Тумана +0,5 м', 'Казнь ×1,75 вместо ×1,5'] },
              B: { name: 'Тень', nodes: ['стамина Рывка −5', 'скрытность после Тумана +1 с', 'щит Второго дыхания +5 (≤ 75)', 'неуязвимость после Танца +0,5 с'] } },
  mystic:   { A: { name: 'Стихии', nodes: ['огненная лужа +1 с', 'прыжок Молнии +2 м', 'радиус Перегрузки +1 м', 'горение +1 с'] },
              B: { name: 'Аркана', nodes: ['Шаг +1 м', 'заряд Волны −0,3 с', 'arcane игнорирует ещё 10 % брони', 'стоимость навыков −5 % (≤ −25 %)'] } },
  gunslinger: { A: { name: 'Глаз', nodes: ['откат Скана −2 с', 'Метка +2 с', 'голова +0,03 (≤ 2,4)', 'Ускорение +0,5 с'] },
                B: { name: 'Небо', nodes: ['стамина Парения −1/с', 'Ледяной выстрел +1 пробитие', 'Небесный шторм +5 % (attacker)', 'перезарядка в воздухе ×1,25'] } },
  wanderer: { name: 'Странник', nodes: ['стамина +15', 'урон от падения −25 %', 'плавание +20 %', 'радиус подбора +2 м', 'еда у костра +50 % дольше', 'радиус Скана вне боя +25 %'] },
  nodeCost: [1, 1, 2, 2], offArchetypeExtra: 1,
});

// Аффиксы экипировки — префикс af_ (НЕ путать с aff_ — элитные аффиксы мобов, enemies.js).
// tiers: значения T1..T5 (T1 il 1–6, T2 5–12, T3 10–18, T4 16–24, T5 22–30). group — группа формулы/ресурса.
export const AFFIX_COUNT_BY_RARITY = Object.freeze({ common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 4 });
export const GEAR_SLOTS = Object.freeze(['weapon', 'bracer', 'head', 'body', 'hands', 'legs', 'amulet', 'ring1', 'ring2']);
const A = (group, t1, t5, slots, cap, extra = {}) => Object.freeze({ group, tiers: [t1, +(t1 + (t5 - t1) * 0.25).toFixed(3), +(t1 + (t5 - t1) * 0.5).toFixed(3), +(t1 + (t5 - t1) * 0.75).toFixed(3), t5], slots, cap, ...extra });
export const GEAR_AFFIXES = Object.freeze({
  af_dmg_type:      A('attacker', 0.03, 0.10, ['weapon', 'bracer', 'ring'], 'attacker 50 %', { perType: true }),
  af_skill_dmg:     A('attacker', 0.03, 0.08, ['bracer', 'amulet'], 'attacker 50 %'),
  af_weapon_dmg:    A('attacker', 0.03, 0.08, ['hands', 'ring'], 'attacker 50 %'),
  af_vs_status:     A('attacker', 0.02, 0.06, ['amulet'], 'attacker 50 %'),
  af_airborne:      A('attacker', 0.03, 0.08, ['legs'], 'attacker 50 %'),
  af_weaken:        A('vuln', 0.02, 0.05, ['weapon'], 'vuln 30 %', { note: '«Ослабление» на 3 с, раз в 6 с' }),
  af_head_mult:     A('zone', 0.03, 0.08, ['head', 'weapon'], 'голова ≤ 2,4'),
  af_armor:         A('mitigation', 0.03, 0.10, ['body', 'head', 'legs'], 'снижение 75 %'),
  af_resist:        A('mitigation', 0.04, 0.15, ['armor', 'ring'], 'снижение 75 %', { perType: true }),
  af_hp:            A('base', 8, 30, ['body', 'amulet'], '+60 в сумме'),
  af_shield_regen:  A('resource', 1, 4, ['body', 'amulet'], 'щит ≤ 75'),
  af_shield_delay:  A('resource', 0.2, 0.6, ['head'], 'задержка ≥ 1,5 с'),
  af_energy_regen:  A('resource', 0.3, 1.2, ['bracer', 'amulet'], '+4/с'),
  af_energy_cost:   A('resource', 0.02, 0.06, ['bracer'], '−25 %'),
  af_cdr:           A('resource', 0.02, 0.06, ['head', 'bracer', 'ring'], '−30 %'),
  af_status_dur:    A('status', 0.03, 0.10, ['weapon', 'amulet'], '+30 %, контроль ≤ 1 с'),
  af_status_every:  A('status', 0, 1, ['weapon'], 'интервал ≥ 2', { note: 'статус оружия на 1 удар раньше (T5)' }),
  af_cc_reduction:  A('defense', 0.05, 0.15, ['legs', 'amulet'], '−50 %'),
  af_stamina:       A('resource', 5, 20, ['legs', 'body'], '+60 в сумме'),
  af_move_speed:    A('movement', 0.01, 0.04, ['legs'], '+15 %'),
  af_glide:         A('movement', 0.05, 0.15, ['body'], '−40 %'),
  af_ult_gain:      A('resource', 0.03, 0.10, ['amulet'], '+25 %'),
  af_heal_received: A('defense', 0.04, 0.12, ['body'], 'яд режет после бонуса'),
  af_hazard:        A('world', 0.2, 0.6, ['armor'], '100 % = иммунитет (легендарки, it_purity_amulet)', { perHazard: ['heatproof', 'insulated', 'swamp'] }),
  af_loot_find:     A('world', 0.02, 0.08, ['ring'], '+25 %'),
  af_xp:            A('world', 0.02, 0.05, ['amulet'], '+15 %'),
  af_skill_rank:    Object.freeze({ group: 'skill', tiers: [1, 1, 1, 1, 1], slots: ['bracer'], cap: 'ранг ≤ 5; только epic/legendary', perSkill: true }),
});
