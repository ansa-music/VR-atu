// Фэнтези-арсенал «Арена магов»: 5 стволов на месте старых слотов (те же кобуры).
// Описания совместимы с Weapon/Arsenal из js/arsenal.js; вместо патронов — мана.
// Чистая логика без three.js — работает и в Node.
import { Arsenal, sampleSpread, toRad } from '../arsenal.js';

const SPREAD_TIGHT = { hip: 0.5, ads: 0.12, move: 0.4, air: 1.2, crouch: 0.9, bloom: 0.08, bloomMax: 0.6, bloomRecover: 5 };

// Стихии посоха
export const ELEMENTS = {
  fire: { id: 'fire', name: 'Огонь', color: 0xff6a2a, css: '#ff8a4a', damageMul: 1, burn: { dps: 1, time: 3 } },
  ice: { id: 'ice', name: 'Лёд', color: 0x7fe3ff, css: '#9fe9ff', damageMul: 0.8, slow: { mul: 0.4, time: 3 } },
  lightning: { id: 'lightning', name: 'Молния', color: 0xd8a0ff, css: '#e2b8ff', damageMul: 0.9, chain: { count: 3, radius: 4, mul: 0.6 } },
};
export const ELEMENT_ORDER = ['fire', 'ice', 'lightning'];

export const FANTASY_WEAPONS = [
  {
    id: 'wand', slot: 1, name: 'Жезл «Искра»', short: 'ИСКРА', title: 'Жезл «Искра»', caliber: 'мана, заряд удержанием',
    action: 'mana', modes: ['charge'], mag: 0, reserve: 0,
    manaMax: 100, manaCost: 4, manaRegen: 14, manaDelay: 0.6, restoreTime: 1.2,
    interval: 0.14,
    // удержание курка: заряд за time с; min — доля, с которой выстрел считается заряженным
    charge: { time: 1.1, min: 0.3, cost: 22, damageMul: 5, speedMul: 1.6, radius: 1.2 },
    velocity: 60, drag: 0, gravity: 0, pellets: 1, penetration: 0, zero: 0,
    damage: 1, maxRange: 120,
    adsTime: 0.15, adsFov: 60, drawTime: 0.28, speedMul: 1,
    spread: SPREAD_TIGHT,
    recoil: { pitch: 0.5, yaw: 0.15, recover: 14, delay: 0.05, punch: 0.15 },
    casing: null, tracerEvery: 0, bolt: true, color: 0xffe27a, element: null,
  },
  {
    id: 'staff', slot: 2, name: 'Посох стихий', short: 'ПОСОХ', title: 'Посох стихий', caliber: 'мана, огонь / лёд / молния',
    action: 'mana', modes: ELEMENT_ORDER, elements: true, auto: true, mag: 0, reserve: 0,
    manaMax: 120, manaCost: 5, manaRegen: 12, manaDelay: 0.8, restoreTime: 1.5,
    interval: 60 / 360,                     // очередь сферами
    velocity: 34, drag: 0, gravity: 0, pellets: 1, penetration: 0, zero: 0,
    damage: 1, maxRange: 90, twoHanded: true,
    adsTime: 0.25, adsFov: 56, drawTime: 0.5, speedMul: 0.95,
    spread: { hip: 1.2, ads: 0.35, move: 1, air: 2.5, crouch: 0.85, bloom: 0.18, bloomMax: 1.4, bloomRecover: 3.5 },
    recoil: { pitch: 0.7, yaw: 0.3, recover: 9, delay: 0.08, punch: 0.25 },
    casing: null, tracerEvery: 0, bolt: true, color: 0xff6a2a,
  },
  {
    id: 'blade', slot: 3, name: 'Клинок души', short: 'КЛИНОК', title: 'Клинок души', caliber: 'взмах, волна-полумесяц',
    action: 'melee', modes: ['swing'], mag: 0, reserve: 0,
    manaMax: 100, manaCost: 0, manaRegen: 10, manaDelay: 0.5, restoreTime: 1.2,
    waveCost: 25,                           // волна-полумесяц от сильного взмаха
    swing: { minSpeed: 2, fullSpeed: 7, waveSpeed: 6, damage: 2, cooldown: 0.25 },
    wave: { speed: 16, damage: 3, range: 30, width: 1.6 },
    interval: 0.25,
    velocity: 16, drag: 0, gravity: 0, pellets: 1, penetration: 3, zero: 0,
    adsTime: 0.2, adsFov: 70, drawTime: 0.45, speedMul: 1.05,
    spread: SPREAD_TIGHT,
    recoil: { pitch: 0, yaw: 0, recover: 10, delay: 0.05, punch: 0 },
    casing: null, tracerEvery: 0, bolt: true, color: 0x7fd8ff,
  },
  {
    id: 'bow', slot: 4, name: 'Лук рун', short: 'ЛУК', title: 'Лук рун', caliber: 'стрела, натяжение тетивы',
    action: 'bow', modes: ['draw'], mag: 0, reserve: 0,
    manaMax: 100, manaCost: 8, manaRegen: 10, manaDelay: 0.8, restoreTime: 1.3,
    // сила натяжения 0..1 → скорость стрелы minSpeed..maxSpeed, урон 1..maxDamage
    draw: { length: 0.55, min: 0.12, minSpeed: 18, maxSpeed: 95, maxDamage: 4, grab: 0.14 },
    interval: 0.3,
    velocity: 95, drag: 0.004, gravity: 9.81, pellets: 1, penetration: 1, zero: 40,
    damage: 1, maxRange: 300,
    adsTime: 0.4, adsFov: 30, zoom: 4, scopeFov: 10, sway: 0.15, drawTime: 0.55, speedMul: 0.95,
    spread: { hip: 0.6, ads: 0.03, move: 1.5, air: 3, crouch: 0.8, bloom: 0, bloomMax: 0, bloomRecover: 1 },
    recoil: { pitch: 0.8, yaw: 0.2, recover: 8, delay: 0.1, punch: 0.3 },
    casing: null, tracerEvery: 1, bolt: false, color: 0x9dffcf,
  },
  {
    id: 'gauntlet', slot: 5, name: 'Перчатка ки', short: 'КИ', title: 'Перчатка ки', caliber: 'энергия ки из ладони',
    action: 'mana', modes: ['auto'], auto: true, mag: 0, reserve: 0,
    manaMax: 90, manaCost: 3, manaRegen: 16, manaDelay: 0.5, restoreTime: 1,
    interval: 60 / 480,
    velocity: 70, drag: 0, gravity: 0, pellets: 1, penetration: 0, zero: 0,
    damage: 1, maxRange: 100,
    adsTime: 0.18, adsFov: 58, drawTime: 0.3, speedMul: 1,
    spread: { hip: 0.9, ads: 0.15, move: 0.8, air: 2, crouch: 0.85, bloom: 0.15, bloomMax: 0.8, bloomRecover: 4 },
    recoil: { pitch: 0.4, yaw: 0.15, recover: 12, delay: 0.05, punch: 0.15 },
    casing: null, tracerEvery: 0, bolt: true, color: 0x5ffbff,
  },
];

export const FANTASY_IDS = FANTASY_WEAPONS.map((d) => d.id);

// Арсенал с фэнтези-оружием (по умолчанию в руках посох, слот 2 — как АК)
export function createFantasyArsenal(rng = Math.random) {
  return new Arsenal(FANTASY_WEAPONS, rng);
}

// Посох: следующая стихия (кнопка B). Возвращает id стихии или null.
export function nextElement(weapon) {
  if (!weapon?.def.elements) return null;
  weapon.toggleMode();
  weapon.emit('element-switch', { element: weapon.mode });
  return weapon.mode;
}

// Лук: тетиву отпустили с силой power 0..1. Списывает ману, возвращает shot или null (слабо/нет маны).
export function bowRelease(weapon, power) {
  const d = weapon.def;
  if (d.action !== 'bow' || power < d.draw.min || weapon.cooldown > 0) return null;
  if (!weapon.spend(d.manaCost)) return null;
  const r = weapon.markShot(power);
  r.power = power;
  return r;
}

// Клинок: сильный взмах пускает волну-полумесяц, если хватает маны
export function bladeWave(weapon, strength = 1) {
  const d = weapon.def;
  if (d.action !== 'melee' || weapon.cooldown > 0) return null;
  if (!weapon.spend(d.waveCost)) return null;
  const r = weapon.markShot(strength);
  weapon.emit('wave', { power: strength });
  return r;
}

const _shot = { speed: 0, damage: 1, color: 0xffffff, gravity: 0, drag: 0, element: null, radius: 0, charge: 0, maxRange: 100, bolt: true, penetration: 0, size: 1 };

// Параметры снаряда для js/ballistics.js fire() и для попаданий.
// shot — результат weapon.pull()/release(); power — сила лука 0..1.
// Объект переиспользуется: скопируйте нужное до следующего вызова.
export function shotParams(weapon, shot, power = 1) {
  const d = weapon.def;
  const o = _shot;
  o.gravity = d.gravity; o.drag = d.drag; o.maxRange = d.maxRange || 200;
  o.bolt = !!d.bolt; o.penetration = d.penetration || 0;
  o.element = null; o.radius = 0; o.charge = 0; o.size = 1;
  o.color = d.color; o.speed = d.velocity; o.damage = d.damage || 1;
  if (d.id === 'wand') {
    const c = shot?.charge || 0;
    o.charge = c;
    o.speed = d.velocity * (1 + (d.charge.speedMul - 1) * c);
    o.damage = (d.damage || 1) * (1 + (d.charge.damageMul - 1) * c);
    o.radius = c > 0 ? d.charge.radius * c : 0;   // заряженный — взрыв по области
    o.size = 1 + 2 * c;
    o.color = c > 0.99 ? 0xfff6d0 : d.color;
  } else if (d.elements) {
    const el = ELEMENTS[weapon.mode] || ELEMENTS.fire;
    o.element = el.id;
    o.color = el.color;
    o.damage = (d.damage || 1) * el.damageMul;
    o.size = 1.4;
  } else if (d.action === 'bow') {
    const dr = d.draw;
    const p = Math.max(0, Math.min(1, power));
    o.speed = dr.minSpeed + (dr.maxSpeed - dr.minSpeed) * p;
    o.damage = 1 + (dr.maxDamage - 1) * p * p;
    o.penetration = p > 0.8 ? d.penetration : 0;
    o.bolt = false;
  } else if (d.action === 'melee') {
    o.speed = d.wave.speed; o.damage = d.wave.damage; o.maxRange = d.wave.range;
  }
  if (shot?.power && d.id !== 'wand') o.damage *= shot.power;
  return o;
}

// Направление выстрела с рассеиванием: dir (единичный [x,y,z]) поворачивается на случайный угол.
// out — массив из 3 чисел (без аллокаций). Для three.js проще: sampleSpread + поворот в main.js.
export function spreadDir(out, dx, dy, dz, halfDeg, rng = Math.random) {
  const [a, b] = sampleSpread(halfDeg, rng);
  // базис, перпендикулярный направлению
  let ux = -dz, uy = 0, uz = dx;
  let ul = Math.hypot(ux, uz);
  if (ul < 1e-6) { ux = 1; uz = 0; ul = 1; }
  ux /= ul; uz /= ul;
  const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
  out[0] = dx + ux * a + vx * b;
  out[1] = dy + uy * a + vy * b;
  out[2] = dz + uz * a + vz * b;
  const l = Math.hypot(out[0], out[1], out[2]);
  out[0] /= l; out[1] /= l; out[2] /= l;
  return out;
}

export { toRad };
