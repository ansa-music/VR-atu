// shared/defs/spells.js — МАГИЯ СТИХИЙ (часть F). Префиксы: sp_ заклинание, fu_ слияние двух стихий, rn_ руна, gl_ глиф.
// Урон заклинаний считается ТОЛЬКО через resolveHit (shared/damage.js): base = base × SKILL_RANK_MULT[ранг] × levelMul(L игрока).
// Имена: name — RU, nameKk — казахское имя (плейсхолдер, заполняет тематический писатель), vfx — ключ SPELL_VFX (темы меняют облик без правки логики).
const F = Object.freeze;

// Стихии → канонические типы урона (6 типов не расширяем: земля и ветер — «вкусы» physical).
export const SPELL_ELEMENTS = F({
  fire:      F({ dmgType: 'fire',      glyph: 'gl_triangle', pcKey: '1', status: 'st_burn',    nameKk: '' }),
  frost:     F({ dmgType: 'frost',     glyph: 'gl_vee',      pcKey: '2', status: 'st_chill',   nameKk: '' }),
  lightning: F({ dmgType: 'lightning', glyph: 'gl_zigzag',   pcKey: '3', status: 'st_shock',   nameKk: '' }),
  arcane:    F({ dmgType: 'arcane',    glyph: 'gl_circle',   pcKey: '4', status: null,         nameKk: '' }),
  poison:    F({ dmgType: 'poison',    glyph: 'gl_spiral',   pcKey: '5', status: 'st_poison',  nameKk: '' }),
  earth:     F({ dmgType: 'physical',  glyph: 'gl_square',   pcKey: '6', status: 'st_stagger', nameKk: '', flavor: true }),
  wind:      F({ dmgType: 'physical',  glyph: 'gl_wave',     pcKey: '7', status: null,         nameKk: '', flavor: true }),
});

// Однострочные глифы (нормализованные точки 0..1, y вниз). Распознаватель — js/world/glyph-recognizer.js.
export const GLYPHS = F({
  gl_triangle: F({ name: 'Треугольник (огонь)', pts: [[0.5, 0], [1, 1], [0, 1], [0.5, 0]] }),
  gl_vee:      F({ name: 'Галочка-сосулька (мороз)', pts: [[0, 0], [0.5, 1], [1, 0]] }),
  gl_zigzag:   F({ name: 'Зигзаг (молния)', pts: [[0, 0], [1, 0.33], [0, 0.66], [1, 1]] }),
  gl_circle:   F({ name: 'Круг (аркана)', circle: true }),
  gl_spiral:   F({ name: 'Спираль (яд)', spiral: true }),
  gl_square:   F({ name: 'Квадрат (земля)', pts: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]] }),
  gl_wave:     F({ name: 'Волна (ветер)', wave: true }),
});

// Формы заклинания: глиф выбирает стихию, форма — способ выпуска (одинаково на всех платформах).
export const SPELL_FORMS = F({
  bolt:  F({ name: 'Снаряд', pc: 'ЛКМ (тап; удерж. — заряд)', phone: 'тап по экрану после глифа (удерж. — заряд)', vr: 'бросок рукой / курок', arduino: 'b' }),
  nova:  F({ name: 'Вспышка вокруг', pc: 'ПКМ', phone: 'свайп вниз', vr: 'удар кулаком вниз (рука ниже пояса, v > 1,5 м/с)', arduino: 'двойное b' }),
  beam:  F({ name: 'Луч (канал)', pc: 'удерж. ЛКМ > 0,35 с', phone: 'удерж. пальцем', vr: 'удерж. курок, ладонь к цели', arduino: 'удерж. b' }),
  ward:  F({ name: 'Оберег на себя', pc: 'колесо вверх', phone: 'тап двумя пальцами', vr: 'ладонь к груди + grip', arduino: 'тройное b' }),
  storm: F({ name: 'Призыв стихии', pc: 'колесо вниз', phone: 'свайп вверх', vr: 'обе руки вверх 0,4 с', arduino: 'круг стиком' }),
});

// Ввод магии: модальная «стойка»; в стойке 1–7 = стихии (оружейные слоты временно не работают).
export const SPELL_INPUT = F({
  stance:   F({ pc: 'U', phone: 'кнопка «✦» (удерж., рисовать правой половиной)', vr: 'удерж. grip левой руки — рисовать руну левым контроллером/пальцем', arduino: 'b + стик вправо 1 с' }),
  grimoire: F({ pc: 'L', phone: 'кнопка книги на наруче', vr: 'гримуар на левом бедре (grip)', arduino: '—' }),
  pcElementKeys: '1–7 в стойке (огонь, мороз, молния, аркана, яд, земля, ветер); 2 разные клавиши = слияние',
  glyphWindowS: 1.2, // вторая руна для слияния должна быть начерчена за это время
});

export const CAST_RULES = F({
  gcdS: 0.6,                 // общий откат заклинаний; навыки (Q/E/X) блокируются на 0,3 с после каста
  skillLockAfterSpellS: 0.3,
  chargeS: 0.8, chargeRange: F([1.0, 1.5]), // заряд — шаг 5 формулы (канон 0.5…1.5); тап = 1.0
  interrupt: F({ by: F(['st_stagger', 'st_freeze', 'knockback']), refundCasting: 0.5, refundChannel: 0, lockoutS: 1.0 }),
  overcast: F({ maxDeficit: 30, backlashHpPerEnergy: 1.5, regenLockS: 3, maxChargeMul: 1.0, selfStatus: true, note: 'каст в долг энергии: HP-откат типом стихии через resolveHit по себе; щит не спасает от отката' }),
  minGlyphScore: 0.78,
  moveWhileCasting: 0.5,     // скорость ходьбы при касте/канале (не влияет на CAPS.moveSpeedBonus)
  energyCostReductionCap: 'CAPS.energyCostReduction', cooldownReductionCap: 'CAPS.cooldownReduction',
});

// Шаблоны форм (L1, ранг 1). Числа подобраны под BALANCE_REF.refDps 160 и энергию 100 (+8/с).
const FORM = {
  bolt:  { tier: 1, castS: 0.25, channelS: 0, energy: 15, cooldownS: 1.5, base: 38, zoneKind: 'other', chargeable: true, projectileSpeed: 34 },
  nova:  { tier: 1, castS: 0.6,  channelS: 0, energy: 30, cooldownS: 8,   base: 45, zoneKind: 'aoe', radiusM: 4 },
  beam:  { tier: 2, castS: 0.3,  channelS: 3, energy: 8, energyPerS: 10, cooldownS: 6, base: 8, tickS: 0.25, zoneKind: 'other', rangeM: 22 },
  ward:  { tier: 2, castS: 0.4,  channelS: 0, energy: 25, cooldownS: 14, base: 0, zoneKind: 'aoe', durationS: 6 },
  storm: { tier: 3, castS: 1.2,  channelS: 0, energy: 60, cooldownS: 30, base: 26, pulses: 6, pulseS: 0.5, zoneKind: 'aoe', radiusM: 6 },
};
const UNLOCK_LVL = { bolt: 1, nova: 4, beam: 8, ward: 12, storm: 18 };
const S = (id, element, form, name, extra = {}) => F({
  id, name, nameKk: '', element, form, dmgType: SPELL_ELEMENTS[element].dmgType, glyph: SPELL_ELEMENTS[element].glyph,
  pcSeq: F([SPELL_ELEMENTS[element].pcKey]), ...FORM[form], vfx: `vfx_${id}`,
  unlock: F({ level: UNLOCK_LVL[form], rune: `rn_${element}`, page: `${element}_${form}` }), ...extra,
});

export const SPELLS = F({
  // ОГОНЬ
  sp_fire_bolt:   S('sp_fire_bolt', 'fire', 'bolt', 'Искра-стрела', { status: F({ id: 'st_burn', stacks: 1, everyN: 2 }), overlaps: F(['s_fireball']), note: 'без брызг; с s_fireball не дублирует горение: общий счётчик everyN' }),
  sp_fire_nova:   S('sp_fire_nova', 'fire', 'nova', 'Огненное кольцо', { status: F({ id: 'st_burn', stacks: 2 }) }),
  sp_fire_beam:   S('sp_fire_beam', 'fire', 'beam', 'Струя пламени', { status: F({ id: 'st_burn', stacks: 1, everyN: 4 }), overlaps: F(['w_dragon_breath']) }),
  sp_fire_ward:   S('sp_fire_ward', 'fire', 'ward', 'Пламенный покров', { ward: F({ thornsType: 'fire', thornsBase: 10, defBuff: 0.1 }), utility: 'сжигает лозы вокруг; восходящий поток для s_glide' }),
  sp_fire_storm:  S('sp_fire_storm', 'fire', 'storm', 'Дождь углей', { status: F({ id: 'st_burn', stacks: 1 }) }),
  // МОРОЗ
  sp_frost_bolt:  S('sp_frost_bolt', 'frost', 'bolt', 'Ледяной шип', { status: F({ id: 'st_chill', stacks: 1 }), overlaps: F(['s_frost_shot']) }),
  sp_frost_nova:  S('sp_frost_nova', 'frost', 'nova', 'Морозное кольцо', { status: F({ id: 'st_chill', stacks: 2 }) }),
  sp_frost_beam:  S('sp_frost_beam', 'frost', 'beam', 'Луч стужи', { status: F({ id: 'st_chill', stacks: 1, everyN: 3 }) }),
  sp_frost_ward:  S('sp_frost_ward', 'frost', 'ward', 'Ледяной панцирь', { ward: F({ absorb: 60, defBuff: 0.15, chillAttackers: 1 }), overlaps: F(['s_barrier']), note: 'не стакается с s_barrier: действует больший щит' }),
  sp_frost_storm: S('sp_frost_storm', 'frost', 'storm', 'Метель', { status: F({ id: 'st_chill', stacks: 1 }), utility: 'замораживает воду: мост (как c_frozen_bridge)', overlaps: F(['c_frozen_bridge']) }),
  // МОЛНИЯ
  sp_lightning_bolt:  S('sp_lightning_bolt', 'lightning', 'bolt', 'Разряд', { status: F({ id: 'st_shock', stacks: 1, everyN: 3 }), chain: F({ jumps: 1, rangeM: 5, falloff: 0.6 }), overlaps: F(['s_chain_lightning']) }),
  sp_lightning_nova:  S('sp_lightning_nova', 'lightning', 'nova', 'Грозовой всплеск', { status: F({ id: 'st_shock', stacks: 1 }) }),
  sp_lightning_beam:  S('sp_lightning_beam', 'lightning', 'beam', 'Дуга', { chain: F({ jumps: 2, rangeM: 6, falloff: 0.5 }), status: F({ id: 'st_shock', stacks: 1, everyN: 6 }) }),
  sp_lightning_ward:  S('sp_lightning_ward', 'lightning', 'ward', 'Громовой шаг', { ward: F({ moveSpeed: 0.1, staggerOnHitS: 0.3 }), utility: 'запитывает генераторы POI' }),
  sp_lightning_storm: S('sp_lightning_storm', 'lightning', 'storm', 'Гроза', { status: F({ id: 'st_shock', stacks: 1 }), utility: 'вода: +1 прыжок цепи (≤ CAPS.chainJumpsMax)' }),
  // АРКАНА
  sp_arcane_bolt:  S('sp_arcane_bolt', 'arcane', 'bolt', 'Звёздная игла', { homing: 0.3, overlaps: F(['w_spark_wand']) }),
  sp_arcane_nova:  S('sp_arcane_nova', 'arcane', 'nova', 'Притяжение звёзд', { control: F({ kind: 'pull', s: 0.5 }), overlaps: F(['s_gravity_well']), note: 'pull-иммунитет 3 с общий с s_gravity_well' }),
  sp_arcane_beam:  S('sp_arcane_beam', 'arcane', 'beam', 'Луч пустоты', { overlaps: F(['s_ki_wave']) }),
  sp_arcane_ward:  S('sp_arcane_ward', 'arcane', 'ward', 'Зеркало рун', { ward: F({ reflectProjectiles: 1, durationS: 2 }), overlaps: F(['c_mirror']) }),
  sp_arcane_storm: S('sp_arcane_storm', 'arcane', 'storm', 'Звездопад', { utility: 'открывает рунные печати (poi_seal_puzzle)' }),
  // ЯД
  sp_poison_bolt:  S('sp_poison_bolt', 'poison', 'bolt', 'Ядовитый плевок', { status: F({ id: 'st_poison', stacks: 1 }), overlaps: F(['s_venom_blades']) }),
  sp_poison_nova:  S('sp_poison_nova', 'poison', 'nova', 'Гнилое облако', { status: F({ id: 'st_poison', stacks: 2 }), overlaps: F(['s_toxic_smoke']), note: 'без невидимости' }),
  sp_poison_beam:  S('sp_poison_beam', 'poison', 'beam', 'Струя желчи', { status: F({ id: 'st_poison', stacks: 1, everyN: 4 }) }),
  sp_poison_ward:  S('sp_poison_ward', 'poison', 'ward', 'Шипы болиголова', { ward: F({ thornsType: 'poison', poisonStacksOnHit: 1, defBuff: 0.05 }) }),
  sp_poison_storm: S('sp_poison_storm', 'poison', 'storm', 'Чумной ливень', { status: F({ id: 'st_poison', stacks: 1 }), overlaps: F(['w_swamp_censer']) }),
  // ЗЕМЛЯ (physical)
  sp_earth_bolt:  S('sp_earth_bolt', 'earth', 'bolt', 'Каменный кулак', { base: 44, energy: 18, cooldownS: 2.2, status: F({ id: 'st_stagger', sec: 0.3, everyN: 3 }) }),
  sp_earth_nova:  S('sp_earth_nova', 'earth', 'nova', 'Сотрясение', { status: F({ id: 'st_stagger', sec: 0.4 }), utility: 'ломает треснувшие стены', overlaps: F(['c_anchor_slam']) }),
  // ВЕТЕР (physical)
  sp_wind_bolt:   S('sp_wind_bolt', 'wind', 'bolt', 'Режущий вихрь', { base: 32, energy: 12, cooldownS: 1.2, pierce: 2 }),
  sp_wind_ward:   S('sp_wind_ward', 'wind', 'ward', 'Попутный ветер', { ward: F({ moveSpeed: 0.15, glideStaminaMul: 0.5 }), overlaps: F(['s_glide', 'c_storm_glide']), note: 'moveSpeed — в общий потолок CAPS.moveSpeedBonus' }),
});

// Слияния: две разные руны за glyphWindowS → одно заклинание (своя форма). Энергия = 0,8 × (сумма tier-1 цен), урон ≤ 1,5× лучшего родителя.
const FU = (id, a, b, form, name, extra) => F({ id, name, nameKk: '', elements: F([a, b]), form, pcSeq: F([SPELL_ELEMENTS[a].pcKey, SPELL_ELEMENTS[b].pcKey]),
  glyphs: F([SPELL_ELEMENTS[a].glyph, SPELL_ELEMENTS[b].glyph]), vfx: `vfx_${id}`, tier: 3, ...extra });
export const FUSIONS = F({
  fu_steam:       FU('fu_steam', 'fire', 'frost', 'nova', 'Паровой взрыв', { dmgType: 'fire', castS: 0.7, energy: 40, cooldownS: 14, base: 64, zoneKind: 'aoe', radiusM: 5, cleanse: F(['st_burn', 'st_chill']), blindS: 1, unlock: F({ level: 10 }), overlaps: F(['c_steam']), note: 'общий ICD с c_steam (CAPS.comboIcdS)' }),
  fu_plasma:      FU('fu_plasma', 'fire', 'lightning', 'bolt', 'Плазменный шар', { dmgType: 'lightning', castS: 0.5, energy: 32, cooldownS: 7, base: 56, zoneKind: 'other', chargeable: true, status: F({ id: 'st_burn', stacks: 1 }), status2: F({ id: 'st_shock', stacks: 1 }), unlock: F({ level: 12 }), overlaps: F(['c_overload']) }),
  fu_wildfire:    FU('fu_wildfire', 'fire', 'wind', 'storm', 'Огненный смерч', { dmgType: 'fire', castS: 1.0, energy: 55, cooldownS: 26, base: 30, pulses: 6, pulseS: 0.5, zoneKind: 'aoe', radiusM: 5, status: F({ id: 'st_burn', stacks: 1 }), moving: 3, unlock: F({ level: 16 }) }),
  fu_magma:       FU('fu_magma', 'fire', 'earth', 'nova', 'Магмовый разлом', { dmgType: 'fire', castS: 0.8, energy: 42, cooldownS: 16, base: 60, zoneKind: 'aoe', radiusM: 4.5, status: F({ id: 'st_burn', stacks: 2 }), status2: F({ id: 'st_stagger', sec: 0.4 }), unlock: F({ level: 14 }) }),
  fu_blizzard:    FU('fu_blizzard', 'frost', 'wind', 'storm', 'Буран', { dmgType: 'frost', castS: 1.0, energy: 55, cooldownS: 26, base: 28, pulses: 6, pulseS: 0.5, zoneKind: 'aoe', radiusM: 7, status: F({ id: 'st_chill', stacks: 1 }), unlock: F({ level: 16 }) }),
  fu_glacier:     FU('fu_glacier', 'frost', 'earth', 'ward', 'Ледниковая стена', { dmgType: 'frost', castS: 0.6, energy: 38, cooldownS: 20, base: 20, zoneKind: 'aoe', wall: F({ lengthM: 6, hp: 300, durationS: 8 }), status: F({ id: 'st_chill', stacks: 1 }), unlock: F({ level: 14 }), overlaps: F(['c_frozen_bridge']) }),
  fu_conduction:  FU('fu_conduction', 'frost', 'lightning', 'nova', 'Проводящий ливень', { dmgType: 'lightning', castS: 0.7, energy: 40, cooldownS: 15, base: 58, zoneKind: 'aoe', radiusM: 5, wet: 6, chain: F({ jumps: 2, rangeM: 6, falloff: 0.6 }), status: F({ id: 'st_shock', stacks: 1 }), unlock: F({ level: 12 }), overlaps: F(['c_conduction']), note: '«молния + вода»: мокрые цели +1 прыжок (≤ 4)' }),
  fu_tempest:     FU('fu_tempest', 'lightning', 'wind', 'beam', 'Буря-хлыст', { dmgType: 'lightning', castS: 0.3, channelS: 3, energy: 12, energyPerS: 14, cooldownS: 10, base: 11, tickS: 0.25, zoneKind: 'other', rangeM: 24, chain: F({ jumps: 1, rangeM: 5, falloff: 0.5 }), unlock: F({ level: 18 }), overlaps: F(['c_storm_glide']) }),
  fu_toxic_flame: FU('fu_toxic_flame', 'fire', 'poison', 'nova', 'Ядовитое пламя', { dmgType: 'poison', castS: 0.6, energy: 38, cooldownS: 14, base: 56, zoneKind: 'aoe', radiusM: 4, status: F({ id: 'st_poison', stacks: 2 }), status2: F({ id: 'st_burn', stacks: 1 }), unlock: F({ level: 10 }), overlaps: F(['c_toxic_flame']) }),
  fu_arc_nova:    FU('fu_arc_nova', 'arcane', 'lightning', 'bolt', 'Звёздная гроза', { dmgType: 'arcane', castS: 0.45, energy: 30, cooldownS: 6, base: 54, zoneKind: 'other', chain: F({ jumps: 2, rangeM: 6, falloff: 0.6 }), unlock: F({ level: 20 }) }),
  fu_void_bloom:  FU('fu_void_bloom', 'arcane', 'poison', 'storm', 'Цветок пустоты', { dmgType: 'poison', castS: 1.1, energy: 58, cooldownS: 28, base: 27, pulses: 6, pulseS: 0.5, zoneKind: 'aoe', radiusM: 6, status: F({ id: 'st_poison', stacks: 1 }), control: F({ kind: 'pull', s: 0.5 }), unlock: F({ level: 22 }) }),
});

// Руны: стихийные (открывают глиф) + модификаторы (3 гнезда гримуара; суммы ≤ 50 % потолков CAPS, как у артефактов).
const R = (id, o) => F({ id, nameKk: '', ...o });
export const RUNES = F({
  rn_fire:      R('rn_fire', { name: 'Руна огня', kind: 'element', element: 'fire', found: 'poi_hub_dawnford', how: 'стартовая (квест мага в стартовом городе)' }),
  rn_frost:     R('rn_frost', { name: 'Руна мороза', kind: 'element', element: 'frost', found: 'poi_stone_circle', how: 'каменный круг ночью' }),
  rn_lightning: R('rn_lightning', { name: 'Руна молнии', kind: 'element', element: 'lightning', found: 'poi_tower_forest', how: 'вершина башни в грозу' }),
  rn_arcane:    R('rn_arcane', { name: 'Руна арканы', kind: 'element', element: 'arcane', found: 'poi_wisp_shrine', how: 'святилище огоньков' }),
  rn_poison:    R('rn_poison', { name: 'Руна яда', kind: 'element', element: 'poison', found: 'poi_witch_hut', how: 'хижина ведьмы' }),
  rn_earth:     R('rn_earth', { name: 'Руна земли', kind: 'element', element: 'earth', found: 'poi_colossus_ruin', how: 'руины колосса' }),
  rn_wind:      R('rn_wind', { name: 'Руна ветра', kind: 'element', element: 'wind', found: 'poi_peak_stuzha', how: 'пик Стужи' }),
  rn_amplify:   R('rn_amplify', { name: 'Руна усиления', kind: 'mod', mod: F({ attacker: 0.10 }), found: 'poi_sun_temple' }),
  rn_thrift:    R('rn_thrift', { name: 'Руна бережливости', kind: 'mod', mod: F({ energyCostReduction: 0.10 }), found: 'poi_mushroom_cave' }),
  rn_quicken:   R('rn_quicken', { name: 'Руна скорости', kind: 'mod', mod: F({ castTimeMul: 0.85 }), found: 'poi_ice_cave' }),
  rn_echo:      R('rn_echo', { name: 'Руна эха', kind: 'mod', mod: F({ echoEveryN: 4, echoMul: 0.5 }), found: 'poi_buried_vault', note: 'детерминированно: каждый 4-й снаряд повторяется с ×0,5' }),
  rn_overflow:  R('rn_overflow', { name: 'Руна переполнения', kind: 'mod', mod: F({ overcastDeficit: 15, backlashMul: 0.8 }), found: 'poi_magma_cave' }),
  rn_binding:   R('rn_binding', { name: 'Руна оков', kind: 'mod', mod: F({ statusDuration: 0.15 }), found: 'poi_leech_cave' }),
  rn_conduit:   R('rn_conduit', { name: 'Руна проводника', kind: 'mod', mod: F({ channelEnergyMul: 0.85 }), found: 'poi_aurora_shrine' }),
  rn_patience:  R('rn_patience', { name: 'Руна терпения', kind: 'mod', mod: F({ cooldownReduction: 0.10 }), found: 'poi_owl_cliff' }),
});

// Гримуар: страницы = заклинания (открываются руной стихии + уровнем), ранги 1–3 за «мастерство» стихии.
export const GRIMOIRE = F({
  quickSlotsByLevel: F([[1, 4], [10, 6], [20, 8]]),   // сколько заклинаний на быстрых слотах (колесо/скрижаль)
  runeSocketsByLevel: F([[6, 1], [14, 2], [24, 3]]),  // гнёзда модификаторов
  maxRank: 3, rankMul: 'SKILL_RANK_MULT[0..2]', masteryPerCast: 1, masteryToRank: F([0, 40, 120]),
  fusionUnlock: 'обе руны + уровень слияния + страница слияния у NPC-мага (poi_hub_mirage_oasis)',
  modSumCaps: F({ attacker: 0.25, energyCostReduction: 0.125, cooldownReduction: 0.15, statusDuration: 0.15 }), // = 0,5 × CAPS
});

// VFX — ключи, база = DAMAGE_TYPE_VFX[dmgType]; тема может переопределить color/core/shape (казахский орнамент и т. п.).
const vfx = (dmgType, shape, color, core) => F({ base: dmgType, shape, color, core, ornament: null });
const COL = { fire: ['#ff6a1f', '#ffd36b'], frost: ['#7fd8ff', '#e8fbff'], lightning: ['#b48cff', '#ffffff'], arcane: ['#c04bff', '#ffd6ff'], poison: ['#7cff4f', '#e4ffb0'], earth: ['#b08a5a', '#f0d8a8'], wind: ['#bff5e6', '#ffffff'] };
const SHAPE = { bolt: 'orb', nova: 'ring', beam: 'ray', ward: 'shell', storm: 'rain' };
export const SPELL_VFX = F(Object.fromEntries([
  ...Object.values(SPELLS).map((s) => [s.vfx, vfx(s.dmgType, SHAPE[s.form], ...COL[s.element])]),
  ...Object.values(FUSIONS).map((f) => [f.vfx, vfx(f.dmgType, SHAPE[f.form], COL[f.elements[0]][0], COL[f.elements[1]][0])]),
]));

export const SPELL_ID_PREFIXES = F({ sp_: 'заклинание', fu_: 'слияние стихий', rn_: 'руна', gl_: 'глиф (шаблон штриха)', vfx_: 'ключ визуала заклинания' });
export const ALL_CASTABLES = F({ ...SPELLS, ...FUSIONS });

// nameKk/nameLat for HUD: by element+form; pass theme_kz.applyKzSpellNames when available.
export function fillSpellNamesKk(applyFn) {
  const roleOf = (s) => s.form || s.role || 'bolt';
  const src = Object.fromEntries([...Object.entries(SPELLS), ...Object.entries(FUSIONS)].map(([id, s]) => [id, { ...s, role: roleOf(s) }]));
  return (typeof applyFn === 'function' ? applyFn(src) : _fallbackApply(src));
}
function _fallbackApply(spells) {
  const ROLE = { bolt: 'bolt', nova: 'aoe', beam: 'bolt', ward: 'shield', storm: 'ultimate' };
  const EL = {
    fire: { bolt: ['От жебе', 'Ot jebe'], aoe: ['Шоқ жаңбыры', 'Şoq jañbyry'], ultimate: ['Айдаһар демі', 'Aidahar demi'], shield: ['Ошақ жылуы', 'Oşaq jyluy'], default: ['От', 'Ot'] },
    frost: { bolt: ['Мұз ине', 'Muz ine'], aoe: ['Боран', 'Boran'], ultimate: ['Хан Тәңірі суығы', 'Han Täñiri suyğy'], shield: ['Мұз қалқан', 'Muz qalqan'], default: ['Мұз', 'Muz'] },
    lightning: { bolt: ['Тәңір жебесі', 'Täñir jebesi'], aoe: ['Күн күркіреуі', 'Kün kürkireui'], ultimate: ['Көк Тәңір қаһары', 'Kök Täñir qahary'], shield: ['Жасын', 'Jasyn'], default: ['Найзағай', 'Naizağai'] },
    arcane: { bolt: ['Аруақ үні', 'Aruaq üni'], aoe: ['Аруақ', 'Aruaq'], ultimate: ['Бақсы сарыны', 'Baqsy sarny'], shield: ['Тұмар', 'Tumar'], default: ['Аруақ', 'Aruaq'] },
    poison: { bolt: ['Жылан тісі', 'Jylan tisi'], aoe: ['Сор батпағы', 'Sor batpağy'], ultimate: ['У', 'U'], shield: ['У', 'U'], default: ['У', 'U'] },
    earth: { bolt: ['Тас лақтыру', 'Tas laqtyru'], aoe: ['Жер сілкінісі', 'Jer silkinisi'], shield: ['Тас қорған', 'Tas qorğan'], default: ['Жер', 'Jer'] },
    wind: { bolt: ['Жел жебе', 'Jel jebe'], aoe: ['Құйын', 'Quiyn'], shield: ['Тұлпар екпіні', 'Tulpar ekpini'], ultimate: ['Жел', 'Jel'], default: ['Жел', 'Jel'] },
  };
  const out = {}, seen = new Map(), roman = ['', ' II', ' III', ' IV'];
  for (const [id, sp] of Object.entries(spells || {})) {
    const el = EL[sp.element] || (sp.elements && EL[sp.elements[0]]) || EL.arcane;
    const role = ROLE[sp.form] || ROLE[sp.role] || 'default';
    let [kk, lat] = el[role] || el.default; const k = seen.get(kk) || 0; seen.set(kk, k + 1);
    out[id] = { ...sp, nameKk: sp.nameKk || kk + (roman[k] || ` ${k + 1}`), nameLat: sp.nameLat || lat + (roman[k] || ` ${k + 1}`) };
  }
  return out;
}
export const SPELLS_NAMED = fillSpellNamesKk();
export const RUNES_NAMED = Object.freeze(Object.fromEntries(Object.entries(RUNES).map(([id, r]) => {
  const map = { fire: ['От рунасы', 'Ot runasy'], frost: ['Мұз рунасы', 'Muz runasy'], lightning: ['Найзағай рунасы', 'Naizağai runasy'], arcane: ['Аруақ рунасы', 'Aruaq runasy'], poison: ['У рунасы', 'U runasy'], earth: ['Жер рунасы', 'Jer runasy'], wind: ['Жел рунасы', 'Jel runasy'] };
  if (r.element && map[r.element]) return [id, { ...r, nameKk: map[r.element][0], nameLat: map[r.element][1] }];
  return [id, { ...r, nameKk: r.nameKk || r.name || id, nameLat: r.nameLat || r.name || id }];
})));

