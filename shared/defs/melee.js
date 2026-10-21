// shared/defs/melee.js — расширение арсенала: 5 мечей ближнего боя (SAO-стиль) + 17 мечевых навыков (ssk_) + мастерство.
// Чистые данные без Three.js. Не меняет WEAPONS: новые w_ добавляются через ALL_WEAPONS / registerMelee().
// Урон: base = weapon.damage × hit.mul × levelMul(L) → resolveHit (attacker: мастерство/комбо/Switch, всё режется CAPS).
import { WEAPONS } from './weapons.js';
import { CAPS, BALANCE_REF } from './core.js';

const F = Object.freeze;
const W = (o) => F({ pellets: 1, zone: 'other', falloff: [o.range, o.range, 1], minRarity: 'common', melee: true, ...o });

// Классы ближнего боя (SAO): одноручный, двуручный, парные, копьё, изогнутый (сабыл).
export const MELEE_CLASSES = F({
  one_hand: F({ name: 'Одноручный меч', icon: '🗡️' }),
  two_hand: F({ name: 'Двуручный меч', icon: '⚔️' }),
  dual: F({ name: 'Парные клинки', icon: '⚔' }),
  spear: F({ name: 'Копьё (найза)', icon: '🔱' }),
  curved: F({ name: 'Изогнутый меч (сабыл)', icon: '🌙' }),
});

// swing: скорость кончика в VR (м/с) → множитель удара (min..max); lockOn: радиус захвата цели на ПК/телефоне.
export const MELEE_WEAPONS = F({
  w_steel_longsword: W({ id: 'w_steel_longsword', name: 'Стальной длинный меч «Ақ семсер»', cls: 'melee', mclass: 'one_hand', type: 'physical',
    damage: 48, intervalMs: 340, range: 1.7, hands: 1, holster: 'hip_l', arch: ['guardian', 'rogue'], color: '#cfd8e6', bladeLen: 0.95,
    swing: F({ minTipSpeed: 2.0, strongTipSpeed: 4.0, min: 0.7, max: 1.3 }), status: F({ id: 'st_stagger', every: 4 }),
    source: F({ kind: 'poi', poi: 'poi_hub_dawnford', note: 'кузнец, после q_main_01' }) }),
  w_greatsword: W({ id: 'w_greatsword', name: 'Двуручник «Тау-жарқын»', cls: 'melee', mclass: 'two_hand', type: 'physical',
    damage: 120, intervalMs: 850, range: 2.1, hands: 2, holster: 'back', arch: ['guardian'], color: '#b9a37a', bladeLen: 1.35,
    swing: F({ minTipSpeed: 2.5, strongTipSpeed: 4.5, min: 0.7, max: 1.3 }), status: F({ id: 'st_stagger', every: 2 }), minRarity: 'uncommon',
    source: F({ kind: 'boss', boss: 'boss_ignarok', note: 'или крафт stn_forge' }) }),
  w_twin_blades: W({ id: 'w_twin_blades', name: 'Парные клинки «Егіз»', cls: 'melee', mclass: 'dual', type: 'physical',
    damage: 30, intervalMs: 200, range: 1.4, hands: 2, dual: true, holster: 'back', arch: ['rogue'], color: '#7fe0ff', bladeLen: 0.8,
    swing: F({ minTipSpeed: 2.0, strongTipSpeed: 3.6, min: 0.7, max: 1.3 }), status: F({ id: 'st_stagger', every: 8 }), minRarity: 'rare',
    unlock: F({ masteryOf: 'one_hand', level: 5, note: 'как «Двойные клинки» в SAO — открываются мастерством одноручного' }),
    source: F({ kind: 'poi', poi: 'poi_buried_vault' }) }),
  w_naiza: W({ id: 'w_naiza', name: 'Копьё «Найза»', cls: 'melee', mclass: 'spear', type: 'physical',
    damage: 70, intervalMs: 520, range: 2.8, hands: 2, holster: 'back', arch: ['guardian', 'rogue'], color: '#d7c08a', bladeLen: 1.9,
    swing: F({ minTipSpeed: 2.2, strongTipSpeed: 4.2, min: 0.7, max: 1.3 }), thrustBonus: 0.15, status: F({ id: 'st_stagger', every: 3 }),
    source: F({ kind: 'poi', poi: 'poi_hunter_camp' }) }),
  w_sabyl: W({ id: 'w_sabyl', name: 'Сабыл «Ай қылыш»', cls: 'melee', mclass: 'curved', type: 'physical',
    damage: 40, intervalMs: 290, range: 1.8, hands: 1, holster: 'hip_l', arch: ['rogue', 'gunslinger'], color: '#ffd27a', bladeLen: 1.0,
    swing: F({ minTipSpeed: 1.8, strongTipSpeed: 3.6, min: 0.7, max: 1.3 }), status: F({ id: 'st_stagger', every: 5 }), minRarity: 'uncommon',
    source: F({ kind: 'poi', poi: 'poi_colossus_ruin', note: 'батыр-кузнец' }) }),
});
export const ALL_WEAPONS = F({ ...WEAPONS, ...MELEE_WEAPONS });
/** Для мест, где нужен единый реестр: возвращает новый объект, исходный WEAPONS не мутирует. */
export const registerMelee = (base = WEAPONS) => F({ ...base, ...MELEE_WEAPONS });
/** Класс оружия для мечевых навыков (w_soul_blade считается одноручным). */
export const meleeClassOf = (id) => MELEE_WEAPONS[id]?.mclass ?? (id === 'w_soul_blade' ? 'one_hand' : null);

// Свечение клинка по стихии (совпадает с ELEMENT_UI из input_v2.js).
export const ELEMENT_GLOW = F({ physical: '#e8f1ff', fire: '#ff7a3c', frost: '#8fd3ff', lightning: '#ffe14d', arcane: '#c08bff', poison: '#8bff6a' });

// Позы предварительного движения (pre-motion). VR: кончик относительно головы (м, вперёд = -z взгляда).
// ПК: направление рывка мыши при зажатой ПКМ. Телефон: свайп от кнопки «Навык».
export const POSES = F({
  overhead: F({ name: 'Над головой', vr: 'кончик выше головы на ≥0,15 м', pcDir: 'up', swing: 'сверху вниз' }),
  shoulder: F({ name: 'На плече', vr: 'рукоять у плеча, кончик сзади-сбоку', pcDir: 'right', swing: 'косо' }),
  side: F({ name: 'Сбоку', vr: 'клинок горизонтально сбоку на уровне пояса', pcDir: 'left', swing: 'горизонтально' }),
  thrust: F({ name: 'Выпад', vr: 'рукоять у груди, кончик вперёд', pcDir: 'none', swing: 'укол вперёд' }),
  low: F({ name: 'Нижняя', vr: 'кончик ниже пояса', pcDir: 'down', swing: 'снизу вверх' }),
});
export const PRE_MOTION = F({ holdS: 0.35, armedS: 2.0, vrSwingSpeed: 3.0, pcDirPx: 40, pcHoldThrustS: 0.25, phoneSwipePx: 36, parryTapS: 0.18 });

export const MASTERY = F({
  maxLevel: 10, xpPerHit: 2, xpPerSkill: 6, xpPerKill: 10, xpPerPerfect: 8,
  xpToNext: (L) => Math.round(100 * Math.pow(L, 1.5)),
  attackerPerLevel: 0.01, // +1 % за уровень после первого (группа attacker; всего ≤ 0,09)
  postDelayCutPerLevel: 0.03, // −3 % задержки после навыка за уровень (≤ 27 %)
});
export const COMBO = F({ windowS: 2.5, step: 10, attackerPerStep: 0.02, attackerMax: 0.08, decayOnHitTaken: true });
export const SWITCH = F({ windowS: 1.5, attacker: 0.10, cancelsPostDelay: true, energyRefund: 5,
  note: 'соло-Switch: идеальное парирование или финальный удар навыка с оглушением открывает окно; следующий навык ДРУГОЙ позы идёт без задержки и +10 % (attacker)' });
export const PARRY = F({ perfectS: 0.25, blockS: 0.7, blockMul: 0.5, staggerS: 0.5, energyGain: 10, cooldownS: 0.9, maxMobRange: 3.5,
  note: 'perfectS = perfectBlockS навыка s_barrier; блок режет только ближние удары (дальность моба ≤ 3,5 м), снаряды — нет' });
export const LIGHT_ATTACK = F({ lockRange: 7, lockConeDeg: 70, lungeM: 2.2, assistYaw: { pc: 0.25, phone: 0.6, vr: 0 } });

// hits: t — мс от активации, mul — × урон оружия, dir — визуал взмаха, aoe — радиус (м) вокруг игрока, reach — +м к дальности.
const H = (t, mul, dir = 'diag', extra = {}) => F({ t, mul, dir, ...extra });
const SK = (o) => F({ element: 'physical', reach: 0, lungeM: 0, status: null, ...o });
export const SWORD_SKILLS = F({
  ssk_slant: SK({ id: 'ssk_slant', name: 'Косой срез', classes: ['one_hand', 'two_hand', 'curved'], pose: 'shoulder', mastery: 1,
    hits: [H(0, 1.5, 'diag')], energy: 10, cooldownS: 3, postDelayS: 0.55, line: 'Базовый быстрый косой удар' }),
  ssk_vertical_arc: SK({ id: 'ssk_vertical_arc', name: 'Вертикальная дуга', classes: ['one_hand', 'two_hand'], pose: 'overhead', mastery: 2, element: 'frost',
    hits: [H(0, 1.2, 'down'), H(220, 1.3, 'up')], energy: 14, cooldownS: 5, postDelayS: 0.6, status: { id: 'st_chill', stacks: 1 }, line: 'Вниз-вверх, ледяной след' }),
  ssk_sonic_leap: SK({ id: 'ssk_sonic_leap', name: 'Звуковой прыжок', classes: ['one_hand', 'curved'], pose: 'shoulder', mastery: 3, lungeM: 6,
    hits: [H(180, 2.0, 'down')], energy: 15, cooldownS: 6, postDelayS: 0.7, line: 'Прыжок к цели до 6 м' }),
  ssk_horizontal_square: SK({ id: 'ssk_horizontal_square', name: 'Горизонтальный квадрат', classes: ['one_hand'], pose: 'side', mastery: 4, element: 'lightning',
    hits: [H(0, 0.9, 'left'), H(160, 0.9, 'right'), H(320, 0.9, 'left'), H(480, 1.0, 'right')], energy: 20, cooldownS: 8, postDelayS: 0.9, status: { id: 'st_shock', stacks: 1 }, line: '4 горизонтальных удара квадратом' }),
  ssk_vorpal_strike: SK({ id: 'ssk_vorpal_strike', name: 'Ворпальный удар', classes: ['one_hand', 'two_hand'], pose: 'thrust', mastery: 6, element: 'arcane', reach: 3,
    hits: [H(120, 2.9, 'thrust')], energy: 22, cooldownS: 9, postDelayS: 1.2, stagger: 0.5, line: 'Мощный укол, +3 м досягаемости' }),
  ssk_star_splash: SK({ id: 'ssk_star_splash', name: 'Звёздный всплеск', classes: ['one_hand', 'curved', 'spear'], pose: 'thrust', mastery: 8, element: 'arcane',
    hits: [0, 90, 180, 270, 360, 450, 540, 640].map((t, i) => H(t, 0.55, i % 2 ? 'thrust' : 'diag')), energy: 28, cooldownS: 12, postDelayS: 1.3, line: '8 уколов звездой' }),
  ssk_avalanche: SK({ id: 'ssk_avalanche', name: 'Лавина', classes: ['two_hand'], pose: 'overhead', mastery: 3, element: 'fire', aoe: 2.5,
    hits: [H(260, 3.0, 'down', { aoe: 2.5 })], energy: 22, cooldownS: 9, postDelayS: 1.4, stagger: 0.5, status: { id: 'st_burn', stacks: 1 }, line: 'Рубящий удар с огненной волной' }),
  ssk_cyclone: SK({ id: 'ssk_cyclone', name: 'Циклон', classes: ['two_hand', 'spear'], pose: 'side', mastery: 5,
    hits: [H(0, 1.4, 'spin', { aoe: 3 }), H(300, 1.4, 'spin', { aoe: 3 })], energy: 20, cooldownS: 8, postDelayS: 1.0, line: 'Два оборота, бьёт всех вокруг' }),
  ssk_double_circular: SK({ id: 'ssk_double_circular', name: 'Двойной круг', classes: ['dual'], pose: 'side', mastery: 1,
    hits: [H(0, 1.2, 'left'), H(140, 1.2, 'right')], energy: 12, cooldownS: 4, postDelayS: 0.5, line: 'Два встречных круга' }),
  ssk_starburst_stream: SK({ id: 'ssk_starburst_stream', name: 'Звёздный поток', classes: ['dual'], pose: 'overhead', mastery: 10, element: 'lightning',
    hits: Array.from({ length: 16 }, (_, i) => H(i * 90, 0.32, ['diag', 'left', 'right', 'down'][i % 4])), energy: 35, cooldownS: 16, postDelayS: 1.6, status: { id: 'st_shock', stacks: 1 }, line: '16 ударов — финал мастерства парных клинков' }),
  ssk_eclipse_dance: SK({ id: 'ssk_eclipse_dance', name: 'Танец затмения', classes: ['dual'], pose: 'low', mastery: 6, element: 'arcane',
    hits: Array.from({ length: 10 }, (_, i) => H(i * 100, 0.48, i % 2 ? 'up' : 'diag')), energy: 28, cooldownS: 12, postDelayS: 1.3, line: '10 ударов снизу вверх' }),
  ssk_helical_twice: SK({ id: 'ssk_helical_twice', name: 'Двойная спираль', classes: ['spear'], pose: 'thrust', mastery: 2, reach: 1,
    hits: [H(0, 1.5, 'thrust'), H(260, 1.5, 'thrust')], energy: 14, cooldownS: 5, postDelayS: 0.7, line: 'Два вращающихся укола' }),
  ssk_dancing_spear: SK({ id: 'ssk_dancing_spear', name: 'Танец найзы', classes: ['spear'], pose: 'low', mastery: 5, element: 'frost',
    hits: [0, 150, 300, 450, 620].map((t) => H(t, 0.8, 'thrust')), energy: 22, cooldownS: 9, postDelayS: 1.0, status: { id: 'st_chill', stacks: 1 }, line: '5 уколов, морозит' }),
  ssk_kokbori_rush: SK({ id: 'ssk_kokbori_rush', name: 'Көкбөрі — волчий рывок', classes: ['curved'], pose: 'side', mastery: 3, element: 'poison', lungeM: 5,
    hits: [H(150, 0.9, 'right'), H(300, 0.9, 'left'), H(450, 1.0, 'right')], energy: 18, cooldownS: 7, postDelayS: 0.8, status: { id: 'st_poison', stacks: 2 }, line: 'Рывок и 3 ядовитых удара' }),
  ssk_ai_tanba: SK({ id: 'ssk_ai_tanba', name: 'Ай таңба — лунный серп', classes: ['curved'], pose: 'low', mastery: 6, element: 'arcane', reach: 5,
    hits: [H(150, 2.2, 'up', { wave: true })], energy: 20, cooldownS: 8, postDelayS: 0.9, line: 'Волна-полумесяц на 7 м' }),
  ssk_tulpar_charge: SK({ id: 'ssk_tulpar_charge', name: 'Тұлпар шабысы', classes: ['one_hand', 'two_hand', 'dual', 'spear', 'curved'], pose: 'thrust', mastery: 4, element: 'lightning', lungeM: 8,
    hits: [H(220, 1.8, 'thrust')], energy: 18, cooldownS: 10, postDelayS: 0.8, line: 'Рывок крылатого коня на 8 м' }),
  ssk_steel_wall: SK({ id: 'ssk_steel_wall', name: 'Стальная стена (контр)', classes: ['one_hand', 'two_hand', 'dual', 'spear', 'curved'], pose: 'low', mastery: 2, counter: { windowS: 0.6 },
    hits: [H(0, 2.0, 'up')], energy: 12, cooldownS: 7, postDelayS: 0.8, stagger: 0.5, line: 'Стойка 0,6 с: удар по тебе → контратака' }),
});

// Раскладка по умолчанию: слот = направление ПКМ/свайпа = поза. Колесо (радиал) переназначает слоты.
export const DEFAULT_SLOTS = F({
  one_hand: F({ up: 'ssk_vertical_arc', right: 'ssk_slant', left: 'ssk_horizontal_square', down: 'ssk_steel_wall', none: 'ssk_vorpal_strike' }),
  two_hand: F({ up: 'ssk_avalanche', right: 'ssk_slant', left: 'ssk_cyclone', down: 'ssk_steel_wall', none: 'ssk_vorpal_strike' }),
  dual: F({ up: 'ssk_starburst_stream', right: 'ssk_tulpar_charge', left: 'ssk_double_circular', down: 'ssk_eclipse_dance', none: 'ssk_tulpar_charge' }),
  spear: F({ up: 'ssk_tulpar_charge', right: 'ssk_star_splash', left: 'ssk_cyclone', down: 'ssk_dancing_spear', none: 'ssk_helical_twice' }),
  curved: F({ up: 'ssk_sonic_leap', right: 'ssk_slant', left: 'ssk_kokbori_rush', down: 'ssk_ai_tanba', none: 'ssk_star_splash' }),
});
export const SLOT_DIRS = F(['up', 'right', 'down', 'left', 'none']);
export const SLOT_KEYS = F({ pc: F(['Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8']), note: 'Q/E/X/Z заняты разделом H; 4–8 = слоты up/right/down/left/none' });

// Потолки для валидатора (основа — BALANCE_REF / CAPS).
export const MELEE_LIMITS = F({
  ttk150: BALANCE_REF.ttkWeapon150, maxWeaponDps: BALANCE_REF.refDps, maxSkillCycleDps: BALANCE_REF.refDps * BALANCE_REF.peakDpsRatioMax,
  maxSingleHit: BALANCE_REF.mobRef.hp * 1.6, maxSkillMul: 6, postDelayMin: 0.3, postDelayMax: 1.8,
  attackerFromMelee: MASTERY.attackerPerLevel * 9 + COMBO.attackerMax + SWITCH.attacker, attackerCap: CAPS.attackerBonus,
});
