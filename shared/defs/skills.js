// shared/defs/skills.js — 20 навыков, комбо, правила набора (раздел 5). Открытый мир, одиночная игра.
// Чистые данные без Three.js. base навыка = damage.base × SKILL_RANK_MULT[rank-1] × levelMul(уровень игрока) — шаг 1, НЕ attacker.
// levelMul = 1 + 0,06·(L−1) (core.js) — общий множитель урона игрока и HP мобов. Статусы — statuses.js. Потолки — core.js CAPS.
import { DAMAGE_TYPES, ARCHETYPES, CAPS, PLAYER_BASE, levelMul } from './core.js';
import { STATUSES } from './statuses.js';
export { DAMAGE_TYPES, ARCHETYPES, CAPS, PLAYER_BASE, levelMul };
export const STATUS_DEFAULTS = STATUSES; // совместимость со старым именем; канон — STATUSES
export const SKILL_TYPES = Object.freeze(['movement', 'utility', 'active', 'passive', 'ultimate']);
export const SKILL_RANK_MULT = Object.freeze([1.0, 1.12, 1.24, 1.36, 1.5]);
export const RANK_LEVEL_REQ = Object.freeze([1, 3, 8, 15, 22]);     // r1..r5
export const RANK_COST_SP = Object.freeze([1, 1, 1, 2, 2]);        // открыть (r1) = 1 ОН; стартовые и сюжетные навыки бесплатны

const S = (o) => Object.freeze(o);
// Поля: energy/stamina/cooldownS/charges — массивы по рангам 1..5 или число; damage.base — ранг 1, уровень 1.
// mods.* — вклад в группы формулы (attacker/vuln/mitigation/slow/...), проверяется скриптом.
export const SKILLS = Object.freeze({
  // ───────────── СТРАЖ (guardian) ─────────────
  s_grapple: S({ id: 's_grapple', name: 'Крюк-якорь', archetype: 'guardian', type: 'movement', belt: true,
    energy: 10, stamina: 0, cooldownS: [6, 5.5, 5, 4.5, 4], charges: 1, rangeM: [24, 26, 28, 30, 32], pullSpeed: 16,
    damage: { type: 'physical', base: 18 }, status: { id: 'st_stagger', sec: 0.4 }, control: { kind: 'pull', sec: 0.4 },
    affinity: 'Страж: тянет и тяжёлых (heavy, не элиту/босса) к себе; ранг 5 — 2 заряда.',
    utility: 'Якорные точки (лианы, вышки, уступы), перелёт оврагов, снятие лута/рычагов с 24–32 м.',
    counters: [{ tags: ['ethereal'], mobs: ['m_wisp', 'm_ice_wraith', 'm_ghost_owl'], effect: 'крюк проходит насквозь' }, { tags: ['heavy', 'elite', 'boss'], mobs: ['m_yeti', 'm_lava_golem', 'm_stone_guardian'], effect: 'вместо притяжения тянет игрока к цели' }],
    unlock: { level: 2, quest: 'q_main_02', poi: 'poi_stone_circle', free: true, how: 'q_main_02, poi_stone_circle (всем)' },
    input: { vr: 'бросок левой рукой сверху (скорость >2,5 м/с) в цель, хват держит трос, отпустить — отцепиться', pc: 'V (пояс 1) / Alt (пояс 2)', phone: 'кнопка пояса 1 + прицел взглядом', arduino: 'рывок стика вперёд-назад <150 мс' },
    talents: [{ id: 't_grapple_harpoon', name: 'Гарпун', effect: 'притянутый моб получает 1 стак st_chill' }, { id: 't_grapple_swing', name: 'Маятник', effect: 'можно раскачиваться: +30 % скорости после отцепления на 1,5 с' }] }),

  s_barrier: S({ id: 's_barrier', name: 'Барьер', archetype: 'guardian', type: 'active',
    energy: 30, cooldownS: [14, 13, 12, 11, 10], durationS: 2.5, absorb: [120, 135, 150, 170, 200], absorbScalesWithLevel: true,
    reflect: 0.5, perfectBlockS: 0.25, damage: { type: 'physical', base: 0, note: 'отражённый снаряд: 50 % сырого урона (100 % при идеальном блоке), шаги 4–9' },
    status: null, control: { kind: 'stagger_melee_on_perfect', sec: 0.5 },
    utility: 'Блокирует снаряды ловушек и плевки, гасит st_burn/st_poison от новых попаданий во время действия.',
    counters: [{ tags: ['storm'], mobs: ['boss_hydra_tinara'], effect: 'lightning по барьеру ×1.5 (и разряды элит aff_storm)' }, { tags: ['lobber'], mobs: ['m_goblin_slinger', 'm_spitter_toad', 'm_lava_golem'], effect: 'навесные снаряды обходят фронт барьера' }],
    unlock: { level: 1, start: 'guardian', tome: { poi: 'poi_hub_dawnford', npc: 'npc_bor', level: 6 }, how: 'стартовый навык Стража; остальным — it_tome_s_barrier (кузнец Бор, poi_hub_dawnford, L6)' },
    input: { vr: 'ладонь левой руки вперёд + хват (держать)', pc: 'Q / E / X (слот актива 1/2/3)', phone: 'кнопка актива, удержание', arduino: 'по слоту: двойное нажатие / тройное нажатие / круг стиком; авто-каст (настройка) при входящем снаряде' },
    talents: [{ id: 't_barrier_nova', name: 'Сброс', effect: 'по окончании — физ. волна R 3 м = 25 % поглощённого' }, { id: 't_barrier_bubble', name: 'Купол', effect: 'сфера вокруг (360°), absorb −30 %' }] }),

  s_gravity_well: S({ id: 's_gravity_well', name: 'Гравиколодец', archetype: 'guardian', type: 'active',
    energy: 30, cooldownS: [12, 11.5, 11, 10.5, 10], rangeM: 18, radiusM: [5, 5.25, 5.5, 5.75, 6], durationS: 2.0,
    damage: { type: 'arcane', base: 28, when: 'схлопывание в конце' }, status: { id: 'st_stagger', sec: 0.4 },
    control: { kind: 'pull', sec: 0.5 }, mods: { slow: 0.30 },
    utility: 'Стягивает лут и ресурсы в радиусе к центру; сбивает летающих на землю на 2 с.',
    counters: [{ tags: ['heavy', 'boss'], mobs: ['m_yeti', 'm_lava_golem', 'boss_akhmaret'], effect: 'не притягиваются, только slow 15 %' }, { tags: ['burrower'], mobs: ['m_sand_scorpion'], effect: 'зарывается и выходит из зоны' }],
    unlock: { level: 4, tome: { poi: 'poi_hub_mirage_oasis', npc: 'npc_set', level: 18 }, how: 'архетип Стража; остальным it_tome_s_gravity_well (poi_hub_mirage_oasis, L18)' },
    input: { vr: 'указать лучом точку, сжать кулак и потянуть на себя', pc: 'Q / E / X (слот актива 1/2/3)', phone: 'кнопка актива: тап по месту', arduino: 'по слоту: двойное нажатие / тройное нажатие / круг стиком; авто-каст по настройке «Помощь» при энергии > 60' },
    talents: [{ id: 't_well_crush', name: 'Давление', effect: 'урон схлопывания +25 % (база)' }, { id: 't_well_anchor', name: 'Якорь', effect: 'длительность +1 с, slow 40 %' }] }),

  s_bulwark: S({ id: 's_bulwark', name: 'Стойкость', archetype: 'guardian', type: 'passive',
    mods: { mitigation: [0.08, 0.10, 0.12, 0.14, 0.16] }, regenOutOfCombatHp: [2, 3, 4, 5, 6], selfStaggerMul: 0.7, knockbackImmune: true,
    utility: 'Падение с высоты: урон −30 %, порог падения +3 м.',
    counters: [{ tags: ['armor_pierce'], mobs: ['m_sand_scorpion'], effect: 'удар жалом игнорирует половину бонуса брони' }, { tags: ['poison'], mobs: ['m_spitter_toad', 'm_mosquito_cloud'], effect: 'яд режет регенерацию (до −50 %)' }],
    unlock: { level: 7, tome: { poi: 'poi_hub_pass_camp', npc: 'npc_soyka', level: 15 }, how: 'архетип Стража; остальным it_tome_s_bulwark (poi_hub_pass_camp, L15)' },
    input: { vr: '—', pc: '—', phone: '—', arduino: '—' },
    talents: [{ id: 't_bulwark_thorns', name: 'Шипы', effect: 'ближний удар по игроку: 10 физ. атакующему' }, { id: 't_bulwark_last', name: 'Последний рубеж', effect: 'при HP<25 % — +25 щита, откат 60 с' }] }),

  s_territory: S({ id: 's_territory', name: 'Территория', archetype: 'guardian', type: 'ultimate',
    ultCost: 100, radiusM: [6, 6.5, 7, 7.5, 8], durationS: [8, 8.5, 9, 9.5, 10],
    damage: { type: 'frost', base: 15, when: 'импульс каждые 2 с' }, status: { id: 'st_chill', stacks: 1, everyS: 2 },
    control: { kind: 'freeze_via_chill', sec: 1.0 }, mods: { mitigation: [0.20, 0.22, 0.24, 0.26, 0.28], slow: 0.25 }, shieldRegenNoDelay: true, enemyProjectileSlow: 0.5,
    utility: 'Внутри купола гаснет хазард биома (жар/яд/холод) — можно переждать.',
    counters: [{ tags: ['frost'], mobs: ['m_ice_wraith', 'm_yeti', 'm_frost_wolf'], effect: 'frost resist 50–60 %: импульсы почти не ранят' }, { tags: ['ranged'], mobs: ['m_flying_eye', 'm_forest_bandit'], effect: 'стреляют снаружи купола' }],
    unlock: { level: 12, quest: 'q_arch_guardian', offArchetypeQuest: 'q_fusion', how: 'квест архетипа «Клятва бастиона» (q_arch_guardian), poi_hub_rootvale; чужим — L20 «Слияние» (q_fusion)' },
    input: { vr: 'обе руки над головой + оба хвата 0,5 с', pc: 'Z (удерж. 0,4 с) или Q+E вместе', phone: 'кнопка ульты', arduino: 'кнопка + стик вниз 1 с' },
    talents: [{ id: 't_territory_storm', name: 'Грозовая крепость', effect: 'импульсы lightning вместо frost (st_shock)' }, { id: 't_territory_haven', name: 'Убежище', effect: 'внутри +4 HP/с, урон импульса −50 %' }] }),

  // ───────────── ЛОВКАЧ (rogue) ─────────────
  s_dash: S({ id: 's_dash', name: 'Рывок', archetype: 'rogue', type: 'movement', belt: true,
    energy: 0, stamina: 25, cooldownS: [3, 2.75, 2.5, 2.25, 2], charges: [2, 2, 2, 3, 3], distanceM: [6, 6.5, 7, 7.5, 8], timeS: 0.2,
    iframesS: [0.2, 0.2, 0.25, 0.25, 0.3], damage: { type: 'physical', base: 20, when: 'плечом сквозь врага' }, status: { id: 'st_stagger', sec: 0.3 },
    control: { kind: 'stagger', sec: 0.3 },
    affinity: 'Ловкач: проход сквозь мелких мобов и колючую лозу без урона; −5 стамины.',
    utility: 'Колючие лозы, кочки болота, выход из зыбучих песков (часть мира).',
    counters: [{ tags: ['heavy'], mobs: ['m_yeti', 'm_lava_golem'], effect: 'нельзя пройти насквозь — упор' }, { tags: ['grabber'], mobs: ['m_bog_drowner'], effect: '«Хватка» прерывает рывок' }],
    unlock: { level: 11, quest: 'q_main_04', free: true, how: 'q_main_04 (boss_rotroot), всем' },
    input: { vr: 'двойной толчок левого стика в сторону (виньетка)', pc: 'V (пояс 1) / Alt (пояс 2) + направление', phone: 'двойной тап по джойстику движения', arduino: 'рывок стика вбок <150 мс' },
    talents: [{ id: 't_dash_venom', name: 'Ядовитый след', effect: 'след 2 с: 1 стак st_poison' }, { id: 't_dash_air', name: 'Воздушный рывок', effect: 'можно в воздухе 1 раз' }] }),

  s_venom_blades: S({ id: 's_venom_blades', name: 'Ядовитые клинки', archetype: 'rogue', type: 'active',
    energy: 25, cooldownS: [15, 14, 13, 12.5, 12], durationS: [8, 9, 10, 11, 12],
    damage: { type: 'poison', base: 0, note: 'урон наносит st_poison: 3/с за стак × rank × levelMul' }, status: { id: 'st_poison', stacks: 1, perHit: true, perShotMax: 1 },
    utility: 'Отравленный сигнальщик лагеря не поднимает тревогу 4 с (m_goblin_slinger не зовёт сородичей).',
    counters: [{ tags: ['poison_resist'], mobs: ['m_stone_guardian', 'm_lava_golem', 'm_cursed_skull', 'm_wisp', 'm_flame_djinn'], effect: 'poison resist 60 %' }, { tags: ['swamp'], mobs: ['m_bog_drowner', 'm_spitter_toad', 'm_mosquito_cloud'], effect: 'poison resist 50–60 %' }],
    unlock: { level: 1, start: 'rogue', tome: { poi: 'poi_hub_stilt_market', npc: 'npc_toad', level: 10 }, how: 'стартовый навык Ловкача; остальным it_tome_s_venom_blades (контрабандист Жаба, L10)' },
    input: { vr: 'провести ладонью вдоль ствола/клинка', pc: 'Q / E / X (слот актива 1/2/3)', phone: 'кнопка актива', arduino: 'по слоту: двойное нажатие / тройное нажатие / круг стиком; авто: при перезарядке, если энергия >60' },
    talents: [{ id: 't_blades_double', name: 'Двойная доза', effect: 'хедшот/удар в спину: 2 стака' }, { id: 't_blades_leech', name: 'Кровопийца', effect: '15 % урона ядом → щит (до 25 за применение)' }] }),

  s_toxic_smoke: S({ id: 's_toxic_smoke', name: 'Ядовитый туман', archetype: 'rogue', type: 'active',
    energy: 30, cooldownS: [16, 15, 14, 13, 12], radiusM: [4, 4.25, 4.5, 4.75, 5], durationS: [5, 5.5, 6, 6.5, 7],
    damage: { type: 'poison', base: 0, note: '1 стак st_poison/с врагам внутри' }, status: { id: 'st_poison', stacks: 1, everyS: 1 },
    stealth: { inside: true, afterS: 2, ambushAttackerBonus: 0.20, ambushStagger: 0.5 }, mods: { attacker: 0.20 }, control: { kind: 'stagger', sec: 0.5 },
    utility: 'Скрытность: мобы снаружи теряют игрока; можно пройти лагерь и вскрыть сундук без боя.',
    counters: [{ tags: ['tremorsense'], mobs: ['m_sand_scorpion', 'm_mire_croc'], effect: 'чуют вибрацию в 6 м — видят в тумане' }, { tags: ['wind'], mobs: [], effect: 'в b_mountains ветер: длительность ×0.5' }, { tags: ['construct'], mobs: ['m_stone_guardian'], effect: 'видит в тумане, яд почти не действует (poison +60 %)' }],
    unlock: { level: 4, tome: { poi: 'poi_witch_hut', npc: 'npc_witch', level: 12 }, how: 'архетип Ловкача; остальным it_tome_s_toxic_smoke (Ведьма, poi_witch_hut, L12)' },
    input: { vr: 'бросить вниз к ногам (рука от пояса вниз)', pc: 'Q / E / X (слот актива 1/2/3)', phone: 'кнопка актива', arduino: 'по слоту: двойное нажатие / тройное нажатие / круг стиком; авто-каст по настройке «Помощь» при энергии > 60' },
    talents: [{ id: 't_smoke_blind', name: 'Слепота', effect: 'мобы внутри −40 % точности, яд −50 %' }, { id: 't_smoke_mobile', name: 'Шлейф', effect: 'облако движется с игроком 3 с, R −1 м' }] }),

  s_second_wind: S({ id: 's_second_wind', name: 'Второе дыхание', archetype: 'rogue', type: 'passive',
    onKill: { shield: [15, 20, 25, 30, 35], stamina: 20, beltCooldownRefund: 0.5, icdS: 1 }, onEliteKill: { energy: 20 }, sprintStaminaMul: 0.7,
    utility: 'Бег/плавание −30 % стамины — дальние переходы без остановок.',
    counters: [{ tags: ['summoner'], mobs: ['m_bog_hag', 'm_meadow_slime'], effect: 'призванные утопленники и отделившиеся слизни не считаются убийством' }],
    unlock: { level: 7, tome: { poi: 'poi_hub_dawnford', npc: 'npc_mot', level: 8 }, how: 'архетип Ловкача; остальным it_tome_s_second_wind (торговец Мот, L8)' },
    input: { vr: '—', pc: '—', phone: '—', arduino: '—' },
    talents: [{ id: 't_wind_chain', name: 'Серия', effect: 'убийство за 3 с после прошлого: +5 % attacker на 4 с (до 3 раз)' }, { id: 't_wind_breath', name: 'Глубокий вдох', effect: 'макс. стамина +25' }] }),

  s_blade_dance: S({ id: 's_blade_dance', name: 'Танец клинков', archetype: 'rogue', type: 'ultimate',
    ultCost: 100, targets: [5, 5, 6, 6, 7], rangeM: 12, strikeIntervalS: 0.2, invulnerable: true,
    damage: { type: 'physical', base: 70, when: 'каждый удар' }, status: { id: 'st_poison', stacks: 2 },
    utility: 'Можно перепрыгивать по целям через пропасть (каждый удар — телепорт к цели).',
    counters: [{ tags: ['ethereal'], mobs: ['m_wisp', 'm_ice_wraith', 'm_ghost_owl'], effect: 'физ. урон −50 %' }, { tags: ['boss'], mobs: ['boss_hydra_tinara', 'boss_ignarok'], effect: 'босс принимает максимум 2 удара' }],
    unlock: { level: 12, quest: 'q_arch_rogue', offArchetypeQuest: 'q_fusion', how: 'квест архетипа «Тени топей» (q_arch_rogue), poi_hub_stilt_market; чужим — L20 «Слияние»' },
    input: { vr: 'скрестить руки на груди + оба курка', pc: 'Z (удерж. 0,4 с) или Q+E вместе', phone: 'кнопка ульты', arduino: 'кнопка + стик вниз 1 с' },
    talents: [{ id: 't_dance_frost', name: 'Иней', effect: 'удары frost вместо physical, 1 стак st_chill вместо яда' }, { id: 't_dance_finale', name: 'Финал', effect: 'последний удар ×2 базы, целей −2' }] }),

  // ───────────── МИСТИК (mystic) ─────────────
  s_teleport: S({ id: 's_teleport', name: 'Мгновенный шаг', archetype: 'mystic', type: 'movement', belt: true,
    energy: 15, cooldownS: [3, 3, 2.75, 2.5, 2.5], charges: [2, 2, 2, 3, 3], distanceM: [10, 10.5, 11, 11.5, 12], projectileIframesS: 0.25,
    damage: null, status: null, afterimageTauntS: 1,
    affinity: 'Мистик: в точке выхода — вспышка arcane 15 R 2 м; −5 энергии.',
    utility: 'Пролёты над лавой до 12 м, парящий обелиск (часть мира); телепорт только в видимую точку, не сквозь стены.',
    counters: [{ tags: ['anti_magic'], mobs: ['m_stone_guardian'], effect: 'в поле печати 8 м (во время «Удара печатью») телепорт недоступен' }],
    unlock: { level: 24, quest: 'q_main_10', poi: 'poi_tower_desert', free: true, mysticEarly: { level: 6, poi: 'poi_wisp_shrine', distanceM: 6 }, how: 'q_main_10, poi_tower_desert (всем); Мистику — с L6 короткая версия 6 м через poi_wisp_shrine' },
    input: { vr: 'левый стик вперёд → дуга → отпустить (как в FANTASY-PLAN)', pc: 'V (пояс 1) / Alt (пояс 2)', phone: 'свайп вверх по джойстику', arduino: 'рывок стика вперёд <150 мс' },
    talents: [{ id: 't_tp_echo', name: 'Эхо', effect: 'послеобраз взрывается через 1 с: arcane 20 R 2 м' }, { id: 't_tp_return', name: 'Возврат', effect: 'повторное нажатие за 2 с — назад' }] }),

  s_fireball: S({ id: 's_fireball', name: 'Огненный шар', archetype: 'mystic', type: 'active',
    energy: 25, cooldownS: [6, 5.6, 5.2, 4.8, 4.5], radiusM: [2.5, 2.75, 3, 3.25, 3.5], projectileSpeed: 30,
    damage: { type: 'fire', base: 45, splash: 30 }, status: { id: 'st_burn', stacks: 2, splashStacks: 1 },
    firePatch: { radiusM: 2, durationS: 3, burnEveryS: 1, updraft: 6 },
    utility: 'Сжигает лозы и паутину, зажигает жаровни-головоломки, топит ледяные стены; огненная лужа — восходящий поток для s_glide.',
    counters: [{ tags: ['fire'], mobs: ['m_magma_imp', 'm_salamander', 'm_lava_golem', 'm_flame_djinn', 'boss_ignarok'], effect: 'fire resist 60 %' }, { tags: ['wet'], mobs: ['m_spitter_toad', 'm_bog_drowner'], effect: 'st_burn длится вдвое меньше' }],
    unlock: { level: 1, start: 'mystic', tome: { poi: 'poi_hub_rootvale', npc: 'npc_mia', level: 8 }, how: 'стартовый навык Мистика; остальным it_tome_s_fireball (травница Мия, poi_hub_rootvale, L8)' },
    input: { vr: 'руна «треугольник» свободной рукой при зажатом курке, или ладонь вверх + хват → бросок', pc: 'Q / E / X (слот актива 1/2/3)', phone: 'кнопка актива', arduino: 'по слоту: двойное нажатие / тройное нажатие / круг стиком; авто-каст по настройке «Помощь» при энергии > 60' },
    talents: [{ id: 't_fireball_sphere', name: 'Энергосфера', effect: 'тип arcane, без горения, радиус +30 %, удержание заряда ×1.0–1.5 (из FANTASY-PLAN)' }, { id: 't_fireball_meteor', name: 'Метеор', effect: 'заряд 1 с обязателен, база +40 %, откат +3 с' }] }),

  s_chain_lightning: S({ id: 's_chain_lightning', name: 'Цепная молния', archetype: 'mystic', type: 'active',
    energy: 30, cooldownS: [9, 8.5, 8, 7.5, 7], jumps: [2, 2, 2, 3, 3], jumpRangeM: 6, jumpFalloff: 0.6,
    damage: { type: 'lightning', base: 40 }, status: { id: 'st_shock', stacks: 1 }, vsShieldMul: 1.5,
    utility: 'Запитывает древние генераторы и двери (POI-головоломки); вода проводит: цели в воде +1 прыжок.',
    counters: [{ tags: ['storm'], mobs: [], effect: 'элиты с aff_storm: lightning resist +30 %' }, { tags: ['shield_breaker'], mobs: ['m_kobold_icecaller'], effect: 'плюс: щиты кобольда и aff_shielded получают ×1.5' }],
    unlock: { level: 4, tome: { poi: 'poi_aurora_shrine', level: 16, found: 'алтарь святилища (ночью)' }, how: 'архетип Мистика; остальным it_tome_s_chain_lightning (poi_aurora_shrine, L16)' },
    input: { vr: 'руна «зигзаг» при зажатом курке', pc: 'Q / E / X (слот актива 1/2/3)', phone: 'кнопка актива', arduino: 'по слоту: двойное нажатие / тройное нажатие / круг стиком; авто по ближайшей цели, если энергия >60' },
    talents: [{ id: 't_chain_fork', name: 'Развилка', effect: 'первый прыжок раздваивается (в пределах cap 4)' }, { id: 't_chain_overcharge', name: 'Перезаряд', effect: 'прыжки 75 %, прыжков −1' }] }),

  s_resonance: S({ id: 's_resonance', name: 'Резонанс', archetype: 'mystic', type: 'passive',
    perStatusAttacker: [0.04, 0.05, 0.06, 0.07, 0.08], maxStatuses: 3, mods: { attacker: [0.12, 0.15, 0.18, 0.21, 0.24] }, energyRegenBonus: 1, energyRegenCondition: 'цель ≤20 м с ≥2 статусами',
    utility: 'Скан (s_scan) дополнительно показывает, какие статусы уже висят на цели и какой комбо ближе всего.',
    counters: [{ tags: ['warder'], mobs: ['m_obsidian_priest'], effect: '«Обсидиановый покров» −25 % урона гасит выгоду от статусов' }],
    unlock: { level: 7, tome: { poi: 'poi_hub_mirage_oasis', npc: 'npc_set', level: 18 }, how: 'архетип Мистика; остальным it_tome_s_resonance (архивариус Сэт, L18)' },
    input: { vr: '—', pc: '—', phone: '—', arduino: '—' },
    talents: [{ id: 't_res_leech', name: 'Пиявка маны', effect: '8 % урона по целям со статусом → энергия' }, { id: 't_res_focus', name: 'Фокус', effect: 'считает только 2 статуса, но +10 % за каждый' }] }),

  s_ki_wave: S({ id: 's_ki_wave', name: 'Волна ки', archetype: 'mystic', type: 'ultimate',
    ultCost: 100, chargeS: 1.5, interruptible: true, lengthM: 40, widthM: 1.5, pierce: true,
    damage: { type: 'arcane', base: 140 }, status: { id: 'st_stagger', sec: 0.5 }, control: { kind: 'stagger', sec: 0.5 },
    utility: 'Ломает «проклятые печати» и завалы — открывает короткие пути.',
    counters: [{ tags: ['arcane_resist'], mobs: ['m_ghost_owl', 'm_cursed_skull', 'm_obsidian_priest'], effect: 'arcane resist 40–50 %' }, { tags: ['fast'], mobs: ['m_forest_wolf', 'm_frost_wolf'], effect: 'уходят с линии за время заряда' }],
    unlock: { level: 12, quest: 'q_arch_mystic', offArchetypeQuest: 'q_fusion', how: 'квест архетипа «Лунная академия» (q_arch_mystic), poi_hub_rootvale; чужим — L20 «Слияние»' },
    input: { vr: 'обе руки у пояса, оба хвата 1,5 с, толчок вперёд', pc: 'Z (удерж. 0,4 с; удерж. — заряд, отпустить — выстрел) или Q+E вместе', phone: 'кнопка ульты (удерж.)', arduino: 'кнопка + стик вниз 1,5 с' },
    talents: [{ id: 't_ki_sweep', name: 'Взмах', effect: 'луч можно вести 1 с (длина 25 м)' }, { id: 't_ki_quick', name: 'Мгновенная', effect: 'заряд 0,5 с, база −25 %' }] }),

  // ───────────── СТРЕЛОК (gunslinger) ─────────────
  s_glide: S({ id: 's_glide', name: 'Парение', archetype: 'gunslinger', type: 'movement', belt: true,
    energy: 0, staminaPerS: [8, 7, 6, 5, 4], fallSpeed: [2.0, 1.8, 1.6, 1.4, 1.2], airSpeed: [8, 8.5, 9, 9.5, 10], cooldownS: 1, updraft: true,
    damage: null, status: null,
    affinity: 'Стрелок: стрельба в парении без штрафа разброса и раскачки; прицел с увеличением замедляет падение ещё на 30 %.',
    utility: 'Утёс Сов → болото, перевал → пустыня, кальдера (часть мира); восходящие потоки от огня/гейзеров +6 м/с.',
    counters: [{ tags: ['flying'], mobs: ['m_harpy', 'm_ash_wyvern', 'm_flying_eye'], effect: 'атакуют парящего: +25 % по нему (их attacker-бонус)' }],
    unlock: { level: 15, quest: 'q_main_06', poi: 'poi_hub_pass_camp', free: true, how: 'q_main_06, poi_hub_pass_camp (всем)' },
    input: { vr: 'в воздухе развести руки в стороны (контроллеры >1,2 м, на уровне плеч); виньетка; «комфортный режим» — фиксированный горизонт', pc: 'V (пояс 1) / Alt (пояс 2) или удерж. Пробел в воздухе', phone: 'удерж. кнопку прыжка в воздухе', arduino: 'удерж. стик вверх в воздухе' },
    talents: [{ id: 't_glide_dive', name: 'Пике', effect: 'стик вниз: пике 20 м/с, приземление — физ. 30 R 3 м' }, { id: 't_glide_thermals', name: 'Термики', effect: 'восходящий поток ×1.5, стамина в потоке не тратится' }] }),

  s_scan: S({ id: 's_scan', name: 'Взор охотника', archetype: 'gunslinger', type: 'utility', innate: true,
    energy: 10, cooldownS: [20, 18, 16, 15, 14], outOfCombatCooldownMul: 0.5, radiusM: [30, 40, 45, 50, 60], durationS: 8, revealDelayS: 2,
    mark: { vuln: 0.15, durationS: 6, targets: [1, 1, 1, 2, 3], affinityOnly: true }, mods: { vuln: 0.15 },
    damage: null, status: null,
    affinity: 'Стрелок: цель в прицеле при скане получает «Метку» (+15 % получаемого урона, группа vuln), на ранге 4–5 — до 2–3 элит.',
    utility: 'Скрытые и арканные сундуки, ресурсы, арканные ловушки, порядок печатей, иконки слабостей/резистов и слабых мест (часть мира).',
    counters: [{ tags: ['stealthy'], mobs: ['m_weaver_spider', 'm_mire_croc'], effect: 'скрытые видны только в 15 м' }, { tags: ['blinker'], mobs: ['m_flame_djinn', 'm_bog_hag'], effect: 'метка спадает при телепорте' }],
    unlock: { level: 1, innate: true, rank2Quest: 'q_main_08', how: 'врождённый у всех (ранг 1); ранг 2 бесплатно за q_main_08 (обсерватория)' },
    input: { vr: 'коснуться контроллером виска/шлема на 0,3 с', pc: 'T', phone: 'кнопка «глаз» над миникартой', arduino: 'удерж. стик назад 1 с' },
    talents: [{ id: 't_scan_weakpoint', name: 'Анатомия', effect: 'слабые места подсвечены 8 с: попадание в них = зона «голова» (×1.5 для не-пуль)' }, { id: 't_scan_prospector', name: 'Старатель', effect: 'радиус +50 % вне боя, ресурсы видны на миникарте 60 с' }] }),

  s_frost_shot: S({ id: 's_frost_shot', name: 'Ледяной выстрел', archetype: 'gunslinger', type: 'active',
    energy: 25, cooldownS: [8, 7.5, 7, 6.5, 6], armWindowS: 5, pierce: [1, 1, 1, 2, 2], zone: 'bullet',
    damage: { type: 'frost', base: 50 }, status: { id: 'st_chill', stacks: 2, headshotStacks: 3 },
    utility: 'Выстрел в воду — ледяная платформа R 2 м на 12 с; гасит огненные ловушки и лаву-лужи на 6 с.',
    counters: [{ tags: ['frost'], mobs: ['m_ice_wraith', 'm_yeti', 'm_frost_wolf', 'boss_ymir'], effect: 'frost resist 50–60 %' }, { tags: ['fire'], mobs: ['m_magma_imp', 'm_flame_djinn', 'm_lava_golem'], effect: 'слабость к frost (res −0,3…−0,4); лавовый голем «остывает»' }],
    unlock: { level: 1, start: 'gunslinger', tome: { poi: 'poi_hub_rootvale', npc: 'npc_olh', level: 8 }, how: 'стартовый навык Стрелка; остальным it_tome_s_frost_shot (друид Ольх, L8)' },
    input: { vr: 'коснуться ствола левой ладонью (зарядить), затем курок', pc: 'Q / E / X (слот актива 1/2/3)', phone: 'кнопка актива → огонь', arduino: 'по слоту: двойное нажатие / тройное нажатие / круг стиком; авто-каст по настройке «Помощь» при энергии > 60' },
    talents: [{ id: 't_frost_shatter', name: 'Осколки', effect: 'по замороженной цели — осколки 3 × 12 frost R 3 м' }, { id: 't_frost_twin', name: 'Дуплет', effect: '2 заряженных выстрела, база каждого −35 %' }] }),

  s_steady_hand: S({ id: 's_steady_hand', name: 'Твёрдая рука', archetype: 'gunslinger', type: 'passive',
    headZoneBonus: [0.10, 0.12, 0.14, 0.17, 0.20], swayMul: 0.7, holdBreathBonusS: 1, falloffRangeMul: 1.1,
    utility: 'Прицел показывает дистанцию до точки и упреждение для стрел/болтов.',
    counters: [{ tags: ['no_head'], mobs: ['m_cursed_skull', 'm_wisp', 'm_mosquito_cloud', 'm_scarab_swarm'], effect: 'нет зоны головы — бонус не работает' }, { tags: ['helmet'], mobs: ['m_stone_guardian'], effect: 'голова только ×1.2' }],
    unlock: { level: 7, tome: { poi: 'poi_hub_dawnford', npc: 'npc_bor', level: 10 }, how: 'архетип Стрелка; остальным it_tome_s_steady_hand (кузнец Бор, L10)' },
    input: { vr: '—', pc: '—', phone: '—', arduino: '—' },
    talents: [{ id: 't_steady_still', name: 'Неподвижность', effect: 'стоя на месте 1 с: +10 % attacker к оружию' }, { id: 't_steady_quickdraw', name: 'Быстрая рука', effect: 'смена оружия ×2, первый выстрел после смены без разброса' }] }),

  s_bullet_time: S({ id: 's_bullet_time', name: 'Ускорение восприятия', archetype: 'gunslinger', type: 'ultimate',
    ultCost: 100, worldTimeScale: 0.3, bossTimeScale: 0.6, durationS: [4, 4.5, 5, 5.5, 6], reloadMul: 0.5,
    headshotExtendS: 0.3, extendMaxS: 1.5, damage: null, status: null,
    utility: 'Пролёт сквозь вращающиеся ловушки, ловля падающих платформ.',
    counters: [{ tags: ['boss', 'elite'], mobs: ['boss_akhmaret', 'boss_ignarok'], effect: 'замедление ×0.6 вместо ×0.3 (контроль ×0.5)' }],
    unlock: { level: 12, quest: 'q_arch_gunslinger', offArchetypeQuest: 'q_fusion', how: 'квест архетипа «Часы охотника» (q_arch_gunslinger), poi_hub_dawnford; чужим — L20 «Слияние»' },
    input: { vr: 'коснуться наруча другой рукой (FANTASY-PLAN); мир десатурируется, без движения камеры', pc: 'Z (удерж. 0,4 с) или Q+E вместе', phone: 'кнопка ульты', arduino: 'кнопка + стик вниз 1 с' },
    talents: [{ id: 't_bt_marksman', name: 'Стрелок-призрак', effect: 'каждый хедшот в ульте накладывает Метку' }, { id: 't_bt_flow', name: 'Поток', effect: 'длительность −1 с, энергия не тратится' }] }),
});

// ───────────── КОМБО ─────────────
// Комбо = либо отдельный «комбо-удар» (своя база × levelMul × rankMul навыка-триггера, далее шаги 4–9 со всеми потолками),
// либо модификатор в существующей группе формулы (attacker/vuln) — тогда он входит в общий потолок.
const C = (o) => Object.freeze(o);
export const COMBOS = Object.freeze({
  c_shatter: C({ id: 'c_shatter', name: 'Раскол', requires: { status: 'st_chill', minStacks: 2 }, trigger: { dmgType: ['lightning'] },
    hit: { type: 'frost', basePerStack: 25, radiusM: 2.5 }, consumes: ['st_chill'], icdS: 3, note: 'заморозка = 3 стака → 75 базы; после — иммунитет к chill 3 с' }),
  c_overload: C({ id: 'c_overload', name: 'Перегрузка', requires: { status: 'st_shock' }, trigger: { dmgType: ['fire'] },
    hit: { type: 'fire', base: 40, radiusM: 3 }, applies: { id: 'st_burn', stacks: 1 }, consumes: ['st_shock'], icdS: 2 }),
  c_toxic_flame: C({ id: 'c_toxic_flame', name: 'Ядовитое пламя', requires: { status: 'st_poison', minStacks: 2 }, trigger: { dmgType: ['fire'] },
    hit: { type: 'fire', basePerStack: 12, radiusM: 2 }, consumes: ['st_poison'], icdS: 3, cloudVariant: { skill: 's_toxic_smoke', type: 'fire', base: 50, radiusM: 4, once: true } }),
  c_steam: C({ id: 'c_steam', name: 'Пар', requires: { statusAny: ['st_burn', 'st_chill'] }, trigger: { dmgTypeOpposite: { st_burn: 'frost', st_chill: 'fire' } },
    hit: null, cloud: { radiusM: 3, durationS: 3, mobSightMul: 0.4, playerStealth: true }, consumes: ['st_burn', 'st_chill'], icdS: 4, note: 'огонь и лёд гасят друг друга: урон статусов пропадает, взамен — скрытность' }),
  c_conduction: C({ id: 'c_conduction', name: 'Проводимость', requires: { status: 'st_poison' }, trigger: { skill: ['s_chain_lightning'] },
    mod: { extraJumps: 1, jumpFalloff: 0.7 }, icdS: 0, note: 'прыжки только по отравленным, общий потолок 4 прыжка' }),
  c_singularity: C({ id: 'c_singularity', name: 'Сингулярность', requires: { zone: 's_gravity_well' }, trigger: { skill: ['s_fireball'] },
    mod: { radiusMul: 1.5, attacker: 0.20, burnToAll: 1 }, icdS: 0, note: '+20 % — в группе attacker (потолок 50 %)' }),
  c_anchor_slam: C({ id: 'c_anchor_slam', name: 'Таран якорем', requires: { skill: 's_grapple', pulledInto: ['wall', 'mob', 's_gravity_well'] }, trigger: { collision: true },
    hit: { type: 'physical', base: 35, radiusM: 1.5 }, applies: { id: 'st_stagger', sec: 0.5 }, icdS: 4 }),
  c_mirror: C({ id: 'c_mirror', name: 'Зеркальный щит', requires: { skill: 's_barrier', perfectBlock: true }, trigger: { incoming: 'projectile' },
    mod: { reflect: 1.0, ultGain: 10, staggerMeleeS: 0.5 }, icdS: 2 }),
  c_verdict: C({ id: 'c_verdict', name: 'Приговор', requires: { mark: 's_scan', status: 'st_shock' }, trigger: { any: true },
    mod: { vuln: 0.25 }, icdS: 0, note: 'метка 15 % + шок 10 % = 25 % из потолка 30 %' }),
  c_shadow_strike: C({ id: 'c_shadow_strike', name: 'Удар из тени', requires: { stealth: 's_toxic_smoke', buff: 's_venom_blades' }, trigger: { firstHit: true },
    mod: { attacker: 0.20 }, applies: [{ id: 'st_poison', stacks: 2 }, { id: 'st_stagger', sec: 0.5 }], icdS: 6 }),
  c_execution: C({ id: 'c_execution', name: 'Казнь', requires: { status: 'st_poison', minStacks: 3 }, trigger: { skill: ['s_blade_dance'] },
    hit: { type: 'poison', fromRemainingDot: 1.5 }, consumes: ['st_poison'], icdS: 2, note: 'остаток DoT яда ×1.5 мгновенно; max 5 стаков × 3/с × 6 с × 1.5 = 135 базы' }),
  c_storm_fortress: C({ id: 'c_storm_fortress', name: 'Грозовая крепость', requires: { zone: 's_territory' }, trigger: { skill: ['s_chain_lightning'] },
    mod: { extraJumps: 2, appliesChill: 1 }, icdS: 0, note: 'прыжки внутри купола + 1 chill → открывает Раскол; потолок 4 прыжка' }),
  c_meteor_dive: C({ id: 'c_meteor_dive', name: 'Падение метеора', requires: { airborneAboveM: 4, skillAny: ['s_glide', 's_teleport'] }, trigger: { skill: ['s_fireball'] },
    mod: { radiusMul: 1.25, stagger: 0.4, updraftLoop: true }, icdS: 0 }),
  c_frozen_bridge: C({ id: 'c_frozen_bridge', name: 'Ледяной мост', requires: { surface: 'water' }, trigger: { dmgType: ['frost'], skill: ['s_frost_shot', 's_territory'] },
    hit: null, platform: { radiusM: 2, durationS: 12 }, icdS: 0, note: 'исследование: тропа через болото и озёра' }),
  c_time_snipe: C({ id: 'c_time_snipe', name: 'Мгновение', requires: { skill: 's_bullet_time', passive: 's_steady_hand' }, trigger: { headshot: true },
    mod: { extendS: 0.3, extendMaxS: 1.5 }, icdS: 0 }),
  c_storm_glide: C({ id: 'c_storm_glide', name: 'Небесный шторм', requires: { airborne: 's_glide' }, trigger: { skill: ['s_chain_lightning', 's_frost_shot'] },
    mod: { attacker: 0.10 }, icdS: 0, note: 'атака сверху (≥4 м над целью) +10 % attacker' }),
  c_unshaken: C({ id: 'c_unshaken', name: 'Непоколебимость', requires: { passive: 's_bulwark' }, trigger: { skill: ['s_ki_wave', 's_barrier'] },
    mod: { interruptOnlyIfStaggerS: 0.4, barrierAbsorbMul: 1.15 }, icdS: 0, note: 'заряд Волны ки не сбивается коротким стаггером; Барьер +15 % поглощения' }),
  c_kill_flow: C({ id: 'c_kill_flow', name: 'Поток убийств', requires: { passive: 's_second_wind' }, trigger: { skill: ['s_dash', 's_teleport', 's_blade_dance', 's_grapple'] },
    mod: { beltCooldownRefund: 0.5, bladeDanceExtraTargetOnKill: 1 }, icdS: 1, note: 'убийство в Танце клинков: +1 цель (потолок 7)' }),
});

// Правила набора (loadout) — см. раздел «Правила набора».
export const LOADOUT = Object.freeze({
  belt: 2, active: 3, passive: 2, ultimate: 1, innate: ['s_scan'],
  offArchetype: { energyMul: 1.2, cooldownMul: 1.2, passiveEffectMul: 0.7, maxNonUlt: 3, ultFromLevel: 20, beltExempt: true },
  swapAt: ['stn_campfire'], swapOutOfCombatS: 5, beltSwapAt: ['stn_campfire'],
});

export const ULT_GAIN = Object.freeze({ perPctTargetHp: 1, perHitMax: 8, killCommon: 4, killElite: 15, bossPhase: 25, perfectBlock: 10, whileActive: 0 });
