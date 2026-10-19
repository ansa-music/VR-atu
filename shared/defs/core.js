// shared/defs/core.js — общий канон боя открытого мира VR-atu (одиночная игра).
// Чистые данные и маленькие функции, без Three.js. Импортируется клиентом, тестами и инструментами.
// Порядок формулы урона (shared/damage.js):
// base → falloff → zone → attacker (≤ +50 %) → charge → vuln (≤ +30 %) → mitigation (≤ 75 %) → shield → HP → statuses.

export const DAMAGE_TYPES = Object.freeze(['physical', 'fire', 'frost', 'lightning', 'arcane', 'poison']);
export const ARCHETYPES = Object.freeze(['guardian', 'rogue', 'mystic', 'gunslinger']);
export const RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'epic', 'legendary']);

// Зоны попадания (шаг 3). Пули (огнестрел, бластер, рельса) — голова ×2,0; остальное ×1,5; AoE/конус/лужи — ×1,0.
export const ZONE = Object.freeze({
  bullet: Object.freeze({ head: 2.0, body: 1, limb: 0.75 }),
  other: Object.freeze({ head: 1.5, body: 1, limb: 0.75 }),
  aoe: Object.freeze({ head: 1.0, body: 1, limb: 1.0 }),
});

export const PLAYER_BASE = Object.freeze({
  hp: 150, hpMax: 330,            // 150 на L1; растёт только от «Стойкости» (+4/очко, ≤ +120) и аффиксов (≤ +60)
  shieldMax: 75, shieldRegen: 15, shieldDelayS: 3,
  energy: 100, energyMax: 130, energyRegen: 8, energyRegenDelayS: 1.0, // +5 % максимума за каждые 10 эхо-кристаллов
  stamina: 100, staminaRegen: 25, staminaRegenDelayS: 0.8,
  ult: 100,
  move: Object.freeze({ walk: 3.2, sprint: 5.8, swim: 1.6, jump: 0.5, gravity: 9.81 }), // = MOVE из js/main.js
});

// Потолки формулы и систем. damage.js, статусы и UI обязаны их применять.
export const CAPS = Object.freeze({
  attackerBonus: 0.50, vulnerability: 0.30, mitigation: 0.75,
  controlS: 1.0, controlEliteMul: 0.5,
  slow: 0.50, cooldownReduction: 0.30, energyCostReduction: 0.25, statusDuration: 0.30,
  headZoneMax: 2.4, chainJumpsMax: 4, dmgReductionBuffMax: 0.30, moveSpeedBonus: 0.15,
  energyRegenBonus: 4, comboIcdS: 2, resistMin: -0.5, resistMax: 0.6,
  mobSingleHitOfPlayerHp: 0.6,   // один удар моба ≤ 60 % ожидаемого HP игрока своего уровня
  mobChannelOfPlayerHp: 0.8,     // полный канал (лучи, дыхание) ≤ 80 %
  lootLuckMax: 1.5,
});

// ЕДИНАЯ кривая уровней (решение конфликта №1).
// Урон игрока (оружие: ilvlMul предмета, навыки: levelMul игрока) и HP мобов растут ОДИНАКОВО: 1 + 0,06·(L−1), L30 = ×2,74.
// Урон мобов растёт мягче: 1 + 0,03·(L−1), L30 = ×1,87. Ожидаемое HP игрока растёт так же (150 → 280 на L30, потолок 330),
// поэтому «сколько ударов держит игрок» и «сколько секунд живёт моб» почти не зависят от уровня.
const clampL = (L) => Math.min(30, Math.max(1, L));
export const levelMul = (L) => 1 + 0.06 * (clampL(L) - 1);
export const LEVEL_CURVE = Object.freeze({
  maxLevel: 30,
  playerDmgMult: levelMul,                              // = ilvlMul оружия и levelMul навыков
  hpMult: levelMul,                                     // HP мобов и боссов
  dmgMult: (L) => 1 + 0.03 * (clampL(L) - 1),           // урон мобов (≤ 1 + 0,03·(L−1) по требованию прогрессии)
  playerHpRef: (L) => 150 * (1 + 0.03 * (clampL(L) - 1)), // ожидаемое HP игрока (для проверок баланса)
  playerPoolRef: (L) => 150 * (1 + 0.03 * (clampL(L) - 1)) + 75,
  xpToNext: (L) => Math.round((100 * Math.pow(L, 1.5) + 50) / 10) * 10,
  mobXp: (xp1, L) => Math.round((xp1 / 10) * (10 + 4 * clampL(L))), // xp1 = 10 у «обычного» моба
  xpLevelDelta: { lowerBy5: 0.25, higherBy3: 1.25 },    // моб на 5+ ниже — ×0,25 и без it_gear_roll; на 3+ выше — ×1,25
  levelDelta: { playerToMobPerLvl: -0.05, mobToPlayerPerLvl: 0.06, clampLow: -0.25, clampHigh: 0.25 }, // входит в группу attacker
  elite: { hp: 3.0, dmg: 1.25, xp: 4, affixesByLevel: [[1, 1], [10, 2], [20, 3]] },
  difficulty: { easy: { hp: 0.8, dmg: 0.75 }, normal: { hp: 1, dmg: 1 }, hard: { hp: 1.25, dmg: 1.3 } }, // телеграфы не меняются никогда
  ngPlusWorldLevel: 5,
});

// Эталоны для проверок (решение конфликта №2).
export const BALANCE_REF = Object.freeze({
  targetHp: 150,                       // игрок/гуманоид без щита
  mobRef: Object.freeze({ id: 'm_ref', hp: 240, armor: 0.15 }), // абстрактный «типичный моб» для оружия и навыков, × hpMult
  eliteHpMul: 3,                       // = LEVEL_CURVE.elite.hp (аффикс aff_juggernaut даёт ещё ×1,6)
  bossRef: 'boss_ignarok',             // реальный босс L30 для худших сценариев навыков
  refDps: 160,                         // опорный DPS игрока на L1 (канон 115–214 = 150 HP / 0,7–1,3 с)
  ttkWeapon150: [0.7, 1.35], ttkWeaponMob: [1.3, 2.8], peakDpsRatioMax: 2.5,
});
