// shared/defs/fantasy_extras.js — «фантастические штучки» открытого мира VR-atu (одиночная игра, режим world).
// Чистые замороженные данные без Three.js. Все бонусы — группы формулы shared/damage.js и потолки CAPS (core.js).
// Новые префиксы: art_ артефакт · mnt_ маунт · pet_ компаньон · gad_ гаджет · wnd_ чудо/аномалия · lgv_ легендарная трансформация
//   · cos_ косметика/зрелище · sec_ секрет. Служебные (не сущности): pai_* — профили ИИ питомцев, vfx_* — ключи эффектов.
// Группы эффектов (effect.group): attacker, vuln, mitigation, dmgReduction, cooldownReduction, energyCostReduction,
//   statusDuration, moveSpeedBonus, energyRegenBonus, lootLuck, slow, control — сверяются с CAPS в tools/validate-fantasy-extras.mjs.
// Случайных шансов у игрока нет: всё «каждый N-й удар», «раз в N с», «при условии».
const F = (o) => Object.freeze(o);

export const EXTRA_ID_PREFIXES = F({
  art_: 'артефакт/реликвия', mnt_: 'маунт/летающее существо', pet_: 'компаньон/питомец', gad_: 'магический гаджет',
  wnd_: 'чудо мира/аномалия', lgv_: 'легендарная трансформация оружия', cos_: 'косметика/зрелище', sec_: 'секрет/пасхалка',
});

// Новые клавиши/жесты (не пересекаются с RESERVED_PC_KEYS и жестами INPUT_MAP — проверяет валидатор).
export const EXTRA_INPUT = F({
  gadget:   F({ pc: 'H', phone: 'кнопка «шестерня» (над поясом)', vr: 'сжать grip у левого бедра (гаджет-кобура)', arduino: 'стик влево 1 с' }),
  gadgetCycle: F({ pc: 'Y', phone: 'свайп по кнопке «шестерня»', vr: 'повернуть запястье у кобуры', arduino: 'стик влево 1 с повторно ≤ 0,35 с' }),
  mount:    F({ pc: 'N', phone: 'кнопка «седло» (появляется вне боя)', vr: 'свист: обе руки ко рту 0,5 с или кнопка меню колеса', arduino: 'b + стик вверх 1 с' }),
  petCmd:   F({ pc: 'P', phone: 'кнопка «лапа»', vr: 'указать на цель и щёлкнуть триггером второй руки', arduino: 'стик вправо 1 с' }),
  artifact: F({ pc: 'J', phone: 'кнопка артефакта на скрижали', vr: 'сжать амулет на груди (grip у грудины)', arduino: 'b + стик влево 1 с' }),
});

export const ARTIFACT_RULES = F({ slots: 3, maxLegendary: 1, unlockSlotsAtLevel: [1, 10, 20], shareCapBudget: 0.5,
  note: 'сумма артефактов в группе ≤ 50 % потолка группы, остальное — экипировка/навыки; resolveHit всё равно режет по CAPS' });

const A = (o) => F({ kind: 'artifact', ...o });
export const ARTIFACTS = F({
  art_dawn_compass: A({ name: 'Компас Рассвета', rarity: 'rare', passive: [F({ group: 'moveSpeedBonus', value: 0.04 })],
    active: F({ name: 'Путеводная нить', cdS: 90, effect: 'световая нить к ближайшему неоткрытому POI на 20 с' }),
    source: F({ kind: 'poi', poi: 'poi_tower_meadow' }), vfx: 'vfx_gold_thread', model: 'латунный компас 300 тр., стрелка — эмиссив', perf: 'low' }),
  art_ember_heart: A({ name: 'Тлеющее сердце', rarity: 'epic', passive: [F({ group: 'attacker', value: 0.06, cond: 'fire-урон' })],
    proc: F({ every: 5, trigger: 'fire-удар', status: 'st_burn', stacks: 1 }), source: F({ kind: 'boss', boss: 'boss_ignarok' }),
    vfx: 'vfx_ember_pulse', model: 'кристалл-сердце, вершинная пульсация', perf: 'low' }),
  art_frost_tear: A({ name: 'Слеза Имира', rarity: 'epic', passive: [F({ group: 'statusDuration', value: 0.10, cond: 'st_chill' })],
    proc: F({ every: 6, trigger: 'frost-удар', status: 'st_chill', stacks: 1 }), source: F({ kind: 'boss', boss: 'boss_ymir' }),
    vfx: 'vfx_snow_motes', model: 'капля льда, френель-шейдер', perf: 'low' }),
  art_storm_seed: A({ name: 'Семя бури', rarity: 'rare', passive: [F({ group: 'energyRegenBonus', value: 1 })],
    proc: F({ every: 8, trigger: 'lightning-удар', status: 'st_shock', stacks: 1 }), source: F({ kind: 'event', event: 'ev_starfall' }),
    vfx: 'vfx_arc_spark', model: 'семя с молниями, 2 спрайта', perf: 'low' }),
  art_bog_lantern: A({ name: 'Болотный светоч', rarity: 'uncommon', passive: [F({ group: 'mitigation', value: 0.05, cond: 'poison' })],
    active: F({ name: 'Очищение', cdS: 60, effect: 'снимает 2 стака st_poison' }), source: F({ kind: 'poi', poi: 'poi_witch_hut', npc: 'npc_witch' }),
    vfx: 'vfx_green_glow', model: 'фонарь из тыквы, точечный свет только на pc_high', perf: 'low' }),
  art_sun_mirror: A({ name: 'Зеркало Ахмарет', rarity: 'legendary', passive: [F({ group: 'vuln', value: 0.08, cond: 'цели в st_burn' })],
    active: F({ name: 'Солнечный блик', cdS: 45, effect: 'ослепление-телеграф: цель промахивается 1 атакой (не контроль)' }),
    source: F({ kind: 'boss', boss: 'boss_akhmaret' }), vfx: 'vfx_sun_flare', model: 'бронзовое зеркало, матрикап', perf: 'medium' }),
  art_rotroot_seed: A({ name: 'Семя Гнилокорня', rarity: 'epic', passive: [F({ group: 'dmgReduction', value: 0.06, cond: 'стоя на земле леса/болота' })],
    active: F({ name: 'Корни-щит', cdS: 40, effect: 'щит +20 (не выше PLAYER_BASE.shield)' }), source: F({ kind: 'boss', boss: 'boss_rotroot' }),
    vfx: 'vfx_root_spiral', model: 'жёлудь с корнями', perf: 'low' }),
  art_hydra_scale: A({ name: 'Чешуя Тинары', rarity: 'epic', passive: [F({ group: 'cooldownReduction', value: 0.06 })],
    source: F({ kind: 'boss', boss: 'boss_hydra_tinara' }), vfx: 'vfx_water_ripple', model: 'плоская чешуя, переливы vertex color', perf: 'low' }),
  art_slime_bell: A({ name: 'Колокольчик слизней', rarity: 'uncommon', passive: [F({ group: 'lootLuck', value: 0.10 })],
    secret: 'при звоне в poi_slime_pond мини-слизни танцуют', source: F({ kind: 'boss', boss: 'boss_slime_king' }),
    vfx: 'vfx_bubble', model: 'зелёный колокол, wobble-шейдер', perf: 'low' }),
  art_owl_feather: A({ name: 'Перо ночной совы', rarity: 'rare', passive: [F({ group: 'moveSpeedBonus', value: 0.03, cond: 'ночью' })],
    active: F({ name: 'Ночное зрение', cdS: 120, effect: 'подсветка мобов контуром 25 м на 15 с' }), source: F({ kind: 'poi', poi: 'poi_owl_cliff' }),
    vfx: 'vfx_owl_eye', model: 'перо-билборд', perf: 'low' }),
  art_star_shard_crown: A({ name: 'Венец звездопада', rarity: 'legendary', passive: [F({ group: 'attacker', value: 0.08 }), F({ group: 'energyCostReduction', value: 0.05 })],
    source: F({ kind: 'craft', station: 'stn_rune_altar', cost: [['it_star_fragment', 12], ['it_crystal_shard', 20], ['it_arcane_dust', 30]] }),
    vfx: 'vfx_orbit_stars', model: 'венец из 5 звёзд-инстансов на орбите', perf: 'medium' }),
  art_echo_shell: A({ name: 'Раковина эха', rarity: 'rare', passive: [F({ group: 'energyRegenBonus', value: 1, cond: 'вне боя ×2' })],
    active: F({ name: 'Эхо-скан', cdS: 30, effect: 'бесплатный s_scan радиусом 15 м (Метка mark_scan)' }), source: F({ kind: 'quest', quest: 'q_main_05' }),
    vfx: 'vfx_sonar_ring', model: 'спиральная раковина', perf: 'low' }),
  art_titan_knuckle: A({ name: 'Костяшка титана', rarity: 'epic', passive: [F({ group: 'attacker', value: 0.05, cond: 'ближний бой' })],
    proc: F({ every: 4, trigger: 'сильный взмах', status: 'st_stagger', stacks: 1 }), source: F({ kind: 'poi', poi: 'poi_fallen_titan_forest' }),
    vfx: 'vfx_dust_burst', model: 'каменный кастет', perf: 'low' }),
  art_moon_hourglass: A({ name: 'Лунные часы', rarity: 'legendary', passive: [F({ group: 'cooldownReduction', value: 0.08 })],
    active: F({ name: 'Отмотать', cdS: 180, effect: 'вернуться в позицию и HP 3 с назад (не во время ba_-телеграфа босса)' }),
    source: F({ kind: 'event', event: 'ev_blood_moon' }), vfx: 'vfx_rewind_ghost', model: 'песочные часы, частицы-песок 40 шт.', perf: 'medium' }),
});

const M = (o) => F({ kind: 'mount', ...o });
// VR-комфорт: ускорение ≤ 6 м/с², без принудительного поворота камеры, виньетка по скорости, snap-поворот, без тряски головы.
export const MOUNT_COMFORT = F({ maxAccel: 6, maxGroundSpeed: 14, maxFlySpeed: 12, maxClimbDeg: 25, vignetteFrom: 4, snapTurnDeg: 30, noHeadBob: true, fadeOnMountS: 0.25 });
export const MOUNTS = F({
  mnt_dawn_stag:   M({ name: 'Рассветный олень', mode: 'ground', speed: 11, accel: 5, stamina: 100, jumpM: 2.5, combat: 'нельзя стрелять; спешивание 0,3 с',
    source: F({ kind: 'quest', quest: 'q_main_02' }), biomes: ['b_meadow', 'b_forest'], model: 'олень 2,5 тыс. тр., 6 костей ног, рога-эмиссив', perf: 'medium' }),
  mnt_bog_strider: M({ name: 'Болотный водомер', mode: 'ground', speed: 9, accel: 4, stamina: 120, walksOnWater: true, combat: 'одноручное оружие разрешено',
    source: F({ kind: 'poi', poi: 'poi_hub_stilt_market', npc: 'npc_toad' }), biomes: ['b_swamp'], model: 'насекомое 1,8 тыс. тр., процедурные ноги', perf: 'medium' }),
  mnt_frost_ram:   M({ name: 'Ледяной баран', mode: 'ground', speed: 10, accel: 5, stamina: 100, climbDeg: 25, immune: ['холод среды'],
    source: F({ kind: 'poi', poi: 'poi_yeti_camp' }), biomes: ['b_mountains'], model: 'баран 2 тыс. тр., шерсть — оболочка', perf: 'medium' }),
  mnt_sand_skiff:  M({ name: 'Песчаный скиф', mode: 'hover', speed: 13, accel: 6, stamina: 0, fuel: 'it_storm_cell', combat: 'пассажир-турель запрещён (только игрок)',
    source: F({ kind: 'craft', station: 'stn_workbench', cost: [['it_alloy', 10], ['it_storm_cell', 4], ['it_mat_sun_shard', 6]] }), biomes: ['b_desert_ruins'],
    model: 'парусная доска 900 тр.', perf: 'low' }),
  mnt_ember_drake: M({ name: 'Пепельный дракончик', mode: 'fly', speed: 12, accel: 5, stamina: 160, maxAltitude: 60, landingAssist: true,
    source: F({ kind: 'quest', quest: 'q_main_12' }), biomes: ['b_volcano', 'b_desert_ruins', 'b_mountains'], model: 'дракон 3,5 тыс. тр., крылья — 2 кости', perf: 'high' }),
  mnt_sky_ray:     M({ name: 'Небесный скат', mode: 'fly', speed: 10, accel: 4, stamina: 200, maxAltitude: 80, landingAssist: true, glideOnly: false,
    source: F({ kind: 'wonder', wonder: 'wnd_sky_whale' }), biomes: ['b_meadow', 'b_forest', 'b_swamp', 'b_mountains', 'b_desert_ruins', 'b_volcano'],
    model: 'скат 1,5 тыс. тр., волна по вершинам', perf: 'medium' }),
});

const P = (o) => F({ kind: 'pet', ...o });
export const PET_AI = F({
  pai_follow_fight: 'следует ≤ 4 м; атакует цель игрока; уходит из AoE-телеграфов',
  pai_support: 'держится за спиной; лечит/щит по таймеру, без атак',
  pai_scout: 'летает в 10 м впереди; метит лут и мобов, не дерётся',
  pai_tank: 'стоит между игроком и ближайшим мобом; таунт раз в 12 с',
});
export const PET_RULES = F({ maxActive: 1, dpsShareMax: 0.2, downedS: 20, ignoredBy: ['боссы игнорируют таунт питомца'], aiTickHz: 5 });
export const PETS = F({
  pet_ember_fox:  P({ name: 'Угольная лиса', ai: 'pai_follow_fight', hp: 120, dps: 24, type: 'fire', status: F({ id: 'st_burn', every: 6 }),
    source: F({ kind: 'poi', poi: 'poi_ember_shrine' }), model: 'лиса 1,2 тыс. тр., хвост-частицы 20', perf: 'low' }),
  pet_moss_golem: P({ name: 'Моховый голем', ai: 'pai_tank', hp: 400, dps: 12, type: 'physical', taunt: F({ cdS: 12, durS: 3 }),
    source: F({ kind: 'boss', boss: 'boss_rotroot' }), model: 'голем 1,5 тыс. тр.', perf: 'medium' }),
  pet_wisp:       P({ name: 'Огонёк-спутник', ai: 'pai_support', hp: 60, dps: 0, heal: F({ hpPerS: 2, outOfCombatMul: 3 }),
    source: F({ kind: 'poi', poi: 'poi_wisp_shrine' }), model: 'светящийся шар, 1 спрайт', perf: 'low' }),
  pet_frost_owl:  P({ name: 'Иней-сова', ai: 'pai_scout', hp: 80, dps: 10, type: 'frost', status: F({ id: 'st_chill', every: 5 }),
    source: F({ kind: 'poi', poi: 'poi_aurora_shrine' }), model: 'сова 900 тр.', perf: 'low' }),
  pet_scarab:     P({ name: 'Солнечный скарабей', ai: 'pai_scout', hp: 90, dps: 8, type: 'arcane', loot: 'подсвечивает тайники и it_atlas_page ≤ 30 м',
    source: F({ kind: 'poi', poi: 'poi_buried_vault' }), model: 'жук 600 тр.', perf: 'low' }),
  pet_slimeling:  P({ name: 'Слизнёныш', ai: 'pai_follow_fight', hp: 150, dps: 16, type: 'poison', status: F({ id: 'st_poison', every: 4 }),
    source: F({ kind: 'quest', quest: 'q_side_slime_king' }), model: 'слизень, wobble-шейдер', perf: 'low' }),
});

const G = (o) => F({ kind: 'gadget', ...o });
export const GADGET_RULES = F({ slots: 2, sharedCdS: 1, energyFrom: 'PLAYER_BASE.energy', noKillRef: true });
export const GADGETS = F({
  gad_portal_gun:   G({ name: 'Портальная пушка', energy: 30, cdS: 20, range: 40, portalS: 12, pairs: 1, rules: 'не на боссовых аренах; мобы не проходят',
    vfx: 'vfx_portal_ring', model: 'пистолет 800 тр.; портал — 1 плоскость + rt только pc_high, иначе вихрь-шейдер', perf: 'medium', source: F({ kind: 'poi', poi: 'poi_old_bunker' }) }),
  gad_time_bubble:  G({ name: 'Пузырь времени', energy: 40, cdS: 35, radius: 5, durS: 4, slow: 0.4, control: 0, projectileSlow: 0.5,
    vfx: 'vfx_time_sphere', model: 'сфера с искажением UV', perf: 'medium', source: F({ kind: 'event', event: 'ev_rift' }) }),
  gad_gravity_well: G({ name: 'Гравитационный колодец', energy: 35, cdS: 25, radius: 6, durS: 3, pullS: 0.8, damage: 30, type: 'arcane',
    rules: 'притяжение — контроль ≤ 1 с, элиты ×0,5, иммунитет CONTROL_IMMUNITY_S.pull', vfx: 'vfx_gravity_swirl', perf: 'medium', source: F({ kind: 'poi', poi: 'poi_seal_puzzle' }) }),
  gad_storm_kite:   G({ name: 'Грозовой змей', energy: 25, cdS: 18, durS: 8, damage: 14, tickS: 1, type: 'lightning', status: F({ id: 'st_shock', every: 3 }),
    vfx: 'vfx_kite_bolt', perf: 'low', source: F({ kind: 'poi', poi: 'poi_tower_mountains' }) }),
  gad_frost_mine:   G({ name: 'Ледяная мина', energy: 20, cdS: 12, charges: 2, damage: 40, type: 'frost', status: F({ id: 'st_chill', every: 1, stacks: 2 }),
    vfx: 'vfx_ice_burst', perf: 'low', source: F({ kind: 'craft', station: 'stn_enchant', cost: [['it_mat_frost_core', 4], ['it_scrap', 10]] }) }),
  gad_bloom_seed:   G({ name: 'Семя-трамплин', energy: 15, cdS: 10, launchM: 9, rules: 'урон от падения после отключён 3 с',
    vfx: 'vfx_flower_pop', perf: 'low', source: F({ kind: 'poi', poi: 'poi_mushroom_cave' }) }),
  gad_echo_decoy:   G({ name: 'Эхо-приманка', energy: 25, cdS: 30, durS: 6, hp: 120, rules: 'мобы (не боссы) переключаются на приманку',
    vfx: 'vfx_hologram', perf: 'low', source: F({ kind: 'poi', poi: 'poi_hub_mirage_oasis', npc: 'npc_soyka' }) }),
  gad_sky_anchor:   G({ name: 'Небесный якорь', energy: 30, cdS: 40, range: 30, rules: 'точка крюка в воздухе на 10 с для s_grapple/s_glide',
    vfx: 'vfx_anchor_rune', perf: 'low', source: F({ kind: 'wonder', wonder: 'wnd_floating_isles' }) }),
});

const W = (o) => F({ kind: 'wonder', ...o });
export const WONDERS = F({
  wnd_floating_isles: W({ name: 'Парящие острова', biome: 'b_meadow', anchorPoi: 'poi_lake_view', pos: [980, 1150], altitude: [40, 90], islands: 7,
    mech: 'острова дрейфуют по кругу 6 мин; переход — s_grapple, s_glide, gad_sky_anchor; на центральном — сундук и art_dawn_compass-копия-ключ',
    rewards: ['it_atlas_page', 'it_star_fragment'], model: '7 инстансов «камень+трава», 1 материал', perf: 'medium', drawCalls: 3 }),
  wnd_crystal_storm: W({ name: 'Кристальная буря', biome: 'b_desert_ruins', anchorPoi: 'poi_colossus_ruin', durS: 150, everyMin: 40,
    hazard: F({ type: 'arcane', dmg: 18, tickS: 2, shelter: 'под арками руин урона нет' }), mech: 'осколки падают по телеграфу 1 с; сбор it_crystal_shard ×3',
    spawns: [['m_cursed_skull', 3]], model: 'GPU-частицы 250 (quest) / 800 (pc_high)', perf: 'high', drawCalls: 2 }),
  wnd_time_rift: W({ name: 'Зона разлома времени', biome: 'b_forest', anchorPoi: 'poi_thorn_maze', radius: 45,
    mech: 'внутри время ×0,8 для всех, кроме игрока (не slow-эффект, а скорость симуляции); эхо прошлого показывает путь лабиринта',
    linkedEvent: 'ev_rift', rewards: ['it_echo_crystal'], model: 'пост-эффект запрещён; только тонировка тумана и «двойники»-силуэты', perf: 'medium', drawCalls: 4 }),
  wnd_sky_whale: W({ name: 'Небесный кит', biome: 'b_mountains', anchorPoi: 'poi_peak_stuzha', altitude: 120, pathKm: 4.2, loopMin: 20,
    mech: 'кит проплывает над всеми биомами; с вершины можно запрыгнуть (s_grapple) — на спине святилище, награда mnt_sky_ray',
    model: 'кит 4 тыс. тр., 1 скелет 8 костей, LOD 3 уровня', perf: 'medium', drawCalls: 3 }),
  wnd_aurora_gate: W({ name: 'Врата сияния', biome: 'b_mountains', anchorPoi: 'poi_aurora_shrine', night: true,
    mech: 'ночью сияние спускается в арку: 60 с полёт без затрат выносливости s_glide; летающие светлячки — коллекционки', perf: 'low', drawCalls: 2 }),
  wnd_glass_sea: W({ name: 'Стеклянное море лавы', biome: 'b_volcano', anchorPoi: 'poi_caldera_view', radius: 80,
    hazard: F({ type: 'fire', dmg: 12, tickS: 1, status: 'st_burn' }), mech: 'лава застывает в стекло на 20 с после ev_eruption; проход к тайнику',
    linkedEvent: 'ev_eruption', model: 'шейдер лавы раздела 1.3.5 + маска застывания', perf: 'medium', drawCalls: 2 }),
});

// Легендарные трансформации: меняют поля базового оружия; валидатор прогоняет их через ту же логику, что check-weapons.
const L = (o) => F({ kind: 'legendary_variant', ...o });
export const LEGENDARY_VARIANTS = F({
  lgv_ak_starfall: L({ base: 'w_ak74', name: 'АК «Звездопад»', type: 'arcane', patch: F({ damage: 20 }),
    unique: 'каждая 15-я пуля — звёздный осколок (AoE 2 м, 30 arcane)', unlock: F({ kind: 'event', event: 'ev_starfall', cost: [['it_star_fragment', 8]] }), station: 'stn_rune_altar' }),
  lgv_hammer_ymir: L({ base: 'w_thunder_hammer', name: 'Молот Последней зимы', type: 'frost', patch: F({ damage: 88 }),
    unique: 'удар оземь оставляет ледяное кольцо (st_chill ×1)', unlock: F({ kind: 'boss', boss: 'boss_ymir', item: 'it_uniq_ymir_core' }), station: 'stn_forge' }),
  lgv_bow_tinara: L({ base: 'w_rune_bow', name: 'Лук Тинары', type: 'poison', patch: F({ damage: 78 }),
    unique: 'полный заряд — 3 стрелы веером по 40 %', unlock: F({ kind: 'boss', boss: 'boss_hydra_tinara', item: 'it_uniq_hydra_fang' }), station: 'stn_enchant' }),
  lgv_blade_sunmask: L({ base: 'w_soul_blade', name: 'Клинок Полуденной маски', type: 'fire', patch: F({ damage: 57 }),
    unique: 'волна-полумесяц оставляет огненный след 3 с (st_burn)', unlock: F({ kind: 'boss', boss: 'boss_akhmaret', item: 'it_uniq_sun_mask' }), station: 'stn_forge' }),
  lgv_breath_ignarok: L({ base: 'w_dragon_breath', name: 'Истинное дыхание Игнарока', type: 'fire', patch: F({ damage: 6.5, range: 10 }),
    unique: 'через 3 с непрерывного огня струя синеет: статус каждые 8 тиков вместо 10', unlock: F({ kind: 'boss', boss: 'boss_ignarok', item: 'it_uniq_ignarok_heart' }), station: 'stn_forge' }),
});

const C = (o) => F({ kind: 'cosmetic', ...o });
export const COSMETIC_RULES = F({ particleShareMax: 0.1, disableInCombatOn: ['quest', 'phone'], note: 'косметика не даёт статов' });
export const COSMETICS = F({
  cos_aura_dawn:     C({ slot: 'aura', name: 'Аура рассвета', particles: 24, source: F({ kind: 'quest', quest: 'q_main_01' }) }),
  cos_aura_void:     C({ slot: 'aura', name: 'Аура пустоты', particles: 30, source: F({ kind: 'event', event: 'ev_rift' }) }),
  cos_trail_ember:   C({ slot: 'trail', name: 'Шлейф углей (рывок/маунт)', particles: 20, source: F({ kind: 'poi', poi: 'poi_magma_cave' }) }),
  cos_trail_frost:   C({ slot: 'trail', name: 'Иней-след', particles: 20, source: F({ kind: 'poi', poi: 'poi_ice_cave' }) }),
  cos_trail_rainbow: C({ slot: 'trail', name: 'Радужный след', particles: 25, source: F({ kind: 'secret', secret: 'sec_rainbow_slime' }) }),
  cos_weather_petals:C({ slot: 'weather', name: 'Дождь лепестков (личная погода 60 с)', particles: 28, source: F({ kind: 'poi', poi: 'poi_stone_circle' }) }),
  cos_weather_snow:  C({ slot: 'weather', name: 'Снежок над головой', particles: 20, source: F({ kind: 'boss', boss: 'boss_ymir' }) }),
  cos_hit_stars:     C({ slot: 'hitfx', name: 'Звёздочки попаданий', particles: 12, source: F({ kind: 'event', event: 'ev_starfall' }) }),
  cos_crown_slime:   C({ slot: 'hat', name: 'Корона Короля слизней', particles: 0, source: F({ kind: 'boss', boss: 'boss_slime_king' }) }),
});

const S = (o) => F({ kind: 'secret', ...o });
export const SECRETS = F({
  sec_rainbow_slime: S({ name: 'Радужный слизень', where: 'poi_slime_pond', trigger: 'ночью в дождь позвонить art_slime_bell 3 раза', reward: 'cos_trail_rainbow' }),
  sec_dev_bunker: S({ name: 'Комната разработчиков', where: 'poi_old_bunker', trigger: 'выстрелить в 5 мишеней старого тира в порядке Arduino-пинов 2-3-4-5-6', reward: 'it_atlas_page', note: 'отсылка к режиму «Тир»' }),
  sec_konami_stag: S({ name: 'Олень Конами', where: 'poi_lake_view', trigger: 'стик Arduino: вверх вверх вниз вниз влево вправо + кнопка', reward: 'mnt_dawn_stag (золотой окрас)' }),
  sec_whale_song: S({ name: 'Песня кита', where: 'wnd_sky_whale', trigger: 'простоять на спине кита полный круг', reward: 'cos_aura_dawn (вариант «кит»)' }),
  sec_titan_heart: S({ name: 'Сердце титана', where: 'poi_fallen_titan_forest', trigger: 'gad_portal_gun: портал внутрь грудной клетки', reward: 'art_titan_knuckle (без боя)' }),
  sec_mirage_npc: S({ name: 'Мираж-торговец', where: 'poi_hub_mirage_oasis', trigger: 'в полдень с art_sun_mirror в слоте', reward: 'it_star_fragment', linkedEvent: 'ev_lost_merchant' }),
});

export const FANTASY_EXTRAS = F({ ARTIFACTS, MOUNTS, PETS, GADGETS, WONDERS, LEGENDARY_VARIANTS, COSMETICS, SECRETS });
