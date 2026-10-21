// js/world/sword-skills.js — чистая логика мечевых навыков (без Three.js, тестируется в node):
// pre-motion → активация → серия ударов по расписанию → задержка после навыка (post-delay) → Switch-окно,
// парирование / идеальный блок, счётчик комбо, мастерство по классам, геометрия взмаха (sweep) для VR.
import { SWORD_SKILLS, MASTERY, COMBO, SWITCH, PARRY, PRE_MOTION, DEFAULT_SLOTS, meleeClassOf, ALL_WEAPONS } from '../../shared/defs/melee.js';
import { levelMul } from '../../shared/defs/core.js';

// ---------- геометрия ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Квадрат расстояния от точки p до отрезка ab. */
export function segPointDist2(a, b, p) {
  const ab = sub(b, a), ap = sub(p, a), L = dot(ab, ab); const t = L > 1e-9 ? Math.max(0, Math.min(1, dot(ap, ab) / L)) : 0;
  const q = lerp3(a, b, t), d = sub(p, q); return dot(d, d);
}
/**
 * Sweep-тест взмаха: клинок прошлого кадра (b0→t0) и текущего (b1→t1), N промежуточных отрезков против сферы.
 * Ловит быстрые взмахи, которые «перепрыгивают» цель за один кадр (на 72 Гц кончик при 8 м/с проходит 11 см).
 */
export function sweepHitsSphere(b0, t0, b1, t1, center, r, steps = 4) {
  for (let i = 0; i <= steps; i++) { const k = i / steps; if (segPointDist2(lerp3(b0, b1, k), lerp3(t0, t1, k), center) <= r * r) return k; }
  // плюс траектория самого кончика (дуга кончика)
  return segPointDist2(t0, t1, center) <= r * r ? 1 : -1;
}
/** Скорость кончика (м/с) → множитель удара по swing оружия. Ниже minTipSpeed — удара нет (null). */
export function swingMul(speed, swing) {
  if (!swing || speed < swing.minTipSpeed) return null;
  const k = Math.min(1, (speed - swing.minTipSpeed) / Math.max(1e-6, swing.strongTipSpeed - swing.minTipSpeed));
  return +(swing.min + (swing.max - swing.min) * k).toFixed(3);
}
/** VR-поза по положению кончика/рукояти относительно головы. local: x вправо, y вверх, z назад (как камера). */
export function classifyPose(tipL, gripL) {
  const dy = tipL[1], fwd = -(tipL[2] - gripL[2]), side = Math.abs(tipL[0] - gripL[0]), vert = tipL[1] - gripL[1];
  if (dy > 0.15 && vert > 0.25) return 'overhead';
  if (tipL[1] < -0.55 && vert < -0.2) return 'low';
  if (fwd > 0.35 && Math.abs(vert) < 0.25 && gripL[1] > -0.5) return 'thrust';
  if (side > 0.45 && Math.abs(vert) < 0.25) return 'side';
  if (tipL[2] - gripL[2] > 0.2 && vert > 0.05) return 'shoulder';
  return null;
}
/** Направление рывка мыши / свайпа → слот. y вверх положителен. */
export function classifyDir(dx, dy, minPx = PRE_MOTION.pcDirPx) {
  if (Math.hypot(dx, dy) < minPx) return 'none';
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'up' : 'down');
}

// ---------- мастерство ----------
export function masteryFromXp(xp) {
  let L = 1, need = MASTERY.xpToNext(1), left = xp;
  while (L < MASTERY.maxLevel && left >= need) { left -= need; L++; need = MASTERY.xpToNext(L); }
  return { level: L, into: left, need: L >= MASTERY.maxLevel ? 0 : need };
}
export const comboAttacker = (n) => Math.min(COMBO.attackerMax, Math.floor(n / COMBO.step) * COMBO.attackerPerStep);
export const skillAvailable = (sk, mclass, masteryLevel) => !!sk && sk.classes.includes(mclass) && masteryLevel >= sk.mastery;

/** Параметры одного удара навыка для resolveHit (без target). */
export function skillHitParams(skill, hitIdx, weapon, { playerLevel = 1, attacker = [] } = {}) {
  const h = skill.hits[hitIdx];
  return { base: weapon.damage * h.mul * levelMul(playerLevel), type: skill.element !== 'physical' ? skill.element : weapon.type,
    zoneKind: h.aoe ? 'aoe' : 'other', zone: 'body', attacker: [...attacker], stagger: hitIdx === skill.hits.length - 1 ? (skill.stagger || 0) : 0,
    status: skill.status || null, aoe: h.aoe || 0, reach: (weapon.range || 1.6) + (skill.reach || 0) };
}

// ---------- движок ----------
/**
 * SwordEngine: одна сущность на игрока. Время — секунды (now передаётся снаружи → детерминированно в тестах).
 * Состояния: idle → (armed) → active → post → idle. emit(ev, data): 'hit' | 'skill' | 'skillEnd' | 'switch' | 'parry' | 'combo' | 'mastery'.
 */
export class SwordEngine {
  constructor({ weaponId = 'w_steel_longsword', save = null, emit = () => {}, playerLevel = 1 } = {}) {
    this.emit = emit; this.playerLevel = playerLevel;
    this.xp = { one_hand: 0, two_hand: 0, dual: 0, spear: 0, curved: 0, ...(save?.xp || {}) };
    this.slots = { ...(save?.slots || {}) };
    this.cd = {}; this.state = 'idle'; this.skill = null; this.t0 = 0; this.hitIdx = 0; this.postUntil = 0;
    this.armed = null; this.armedUntil = 0; this.combo = 0; this.comboUntil = 0; this.maxCombo = 0;
    this.switchUntil = 0; this.lastPose = null; this.parryAt = -99; this.parryCdUntil = 0; this.counterUntil = 0; this.lastLight = -99;
    this.setWeapon(weaponId);
  }
  setWeapon(id) { this.weaponId = id; this.weapon = ALL_WEAPONS[id]; this.mclass = meleeClassOf(id); }
  mastery(mclass = this.mclass) { return masteryFromXp(this.xp[mclass] || 0); }
  slotSkill(dir) { const id = this.slots[this.mclass]?.[dir] ?? DEFAULT_SLOTS[this.mclass]?.[dir]; return id; }
  assignSlot(dir, id) { const sk = SWORD_SKILLS[id]; if (!sk || !sk.classes.includes(this.mclass)) return false; (this.slots[this.mclass] ??= {})[dir] = id; return true; }
  serialize() { return { xp: { ...this.xp }, slots: JSON.parse(JSON.stringify(this.slots)) }; }
  attackerBonuses(now) {
    const a = [MASTERY.attackerPerLevel * (this.mastery().level - 1)];
    const c = comboAttacker(this.combo); if (c) a.push(c);
    if (this._switchActive) a.push(SWITCH.attacker);
    return a;
  }
  addXp(n) { if (!this.mclass) return; const before = this.mastery().level; this.xp[this.mclass] = (this.xp[this.mclass] || 0) + n; const after = this.mastery().level; if (after > before) this.emit('mastery', { mclass: this.mclass, level: after }); }
  /** Готовность (pre-motion удержан): VR — поза держалась holdS, ПК — ПКМ зажата, телефон — кнопка. */
  arm(pose, now) { this.armed = pose; this.armedUntil = now + PRE_MOTION.armedS; }
  canAct(now) { return this.state === 'idle' || (this.state === 'post' && now >= this.postUntil); }
  /** Попытка запуска навыка. Возвращает {ok, reason}. */
  tryActivate(id, now, energy = Infinity) {
    const sk = SWORD_SKILLS[id]; if (!sk) return { ok: false, reason: 'unknown' };
    if (!skillAvailable(sk, this.mclass, this.mastery().level)) return { ok: false, reason: 'locked' };
    if ((this.cd[id] || 0) > now) return { ok: false, reason: 'cooldown' };
    if (energy < sk.energy) return { ok: false, reason: 'energy' };
    const inSwitch = now < this.switchUntil && this.lastPose && this.lastPose !== sk.pose;
    if (this.state === 'active') return { ok: false, reason: 'busy' };
    if (this.state === 'post' && now < this.postUntil && !inSwitch) return { ok: false, reason: 'delay' };
    this._switchActive = !!inSwitch; if (inSwitch) { this.switchUntil = 0; this.emit('switch', { id, chained: true }); }
    this.state = 'active'; this.skill = sk; this.t0 = now; this.hitIdx = 0; this.armed = null; this.lastPose = sk.pose;
    this.countered = false; this.cd[id] = now + sk.cooldownS; if (sk.counter) this.counterUntil = now + sk.counter.windowS;
    this.emit('skill', { id, skill: sk, switch: this._switchActive }); this.addXp(MASTERY.xpPerSkill);
    return { ok: true, energy: sk.energy - (inSwitch ? SWITCH.energyRefund : 0) };
  }
  /** Тик: выпускает удары по расписанию; resolve(params) → {hit, staggered, killed} от рантайма. */
  update(now, resolve = () => null) {
    if (now > this.comboUntil && this.combo) { this.combo = 0; this.emit('combo', { n: 0 }); }
    if (this.armed && now > this.armedUntil) this.armed = null;
    if (this.state !== 'active') { if (this.state === 'post' && now >= this.postUntil) this.state = 'idle'; return; }
    const sk = this.skill;
    if (sk.counter && this.hitIdx === 0 && !this.countered) { // контрстойка: ждёт удара по себе; иначе — промах и задержка
      if (now < this.counterUntil) return;
      return this._end(now, false);
    }
    let lastStaggered = false;
    while (this.hitIdx < sk.hits.length && now - this.t0 >= sk.hits[this.hitIdx].t / 1000) {
      const p = skillHitParams(sk, this.hitIdx, this.weapon, { playerLevel: this.playerLevel, attacker: this.attackerBonuses(now) });
      const r = resolve(p, this.hitIdx, sk); if (r?.hit) { this.registerHit(now, r.count || 1); lastStaggered = !!r.staggered || !!p.stagger; }
      this.emit('hit', { skill: sk.id, idx: this.hitIdx, params: p, result: r }); this.hitIdx++;
    }
    if (this.hitIdx >= sk.hits.length) this._end(now, lastStaggered);
  }
  _end(now, openSwitch) {
    const sk = this.skill, cut = 1 - MASTERY.postDelayCutPerLevel * (this.mastery().level - 1);
    this.state = 'post'; this.postUntil = now + sk.postDelayS * cut; this._switchActive = false; this.skill = null;
    if (openSwitch) { this.switchUntil = now + SWITCH.windowS; this.emit('switch', { open: true }); }
    this.emit('skillEnd', { id: sk.id, postUntil: this.postUntil });
  }
  /** Обычный удар (авто-взмах ПК/телефон или физический взмах VR) — только вне навыка/задержки. */
  lightAttackReady(now) { return this.canAct(now) && now - this.lastLight >= this.weapon.intervalMs / 1000; }
  lightAttackParams(swing = 1) {
    return { base: this.weapon.damage * levelMul(this.playerLevel), type: this.weapon.type, zoneKind: 'other', zone: 'body', attacker: this.attackerBonuses(), charge: swing, reach: this.weapon.range };
  }
  markLight(now) { this.lastLight = now; }
  registerHit(now, n = 1) {
    const before = Math.floor(this.combo / COMBO.step); this.combo += n; this.comboUntil = now + COMBO.windowS; this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (Math.floor(this.combo / COMBO.step) > before) this.emit('combo', { n: this.combo, bonus: comboAttacker(this.combo) });
    this.addXp(MASTERY.xpPerHit * n);
  }
  onKill() { this.addXp(MASTERY.xpPerKill); }
  // ---------- защита ----------
  parry(now) { if (now < this.parryCdUntil || this.state === 'active') return false; this.parryAt = now; this.parryCdUntil = now + PARRY.cooldownS; return true; }
  /** Входящий удар моба. dist — до моба. Возвращает {mul, perfect, counter}. mul — множитель base удара по игроку. */
  incoming(now, dist) {
    if (this.state === 'active' && this.skill?.counter && this.hitIdx === 0 && now < this.counterUntil && dist <= PARRY.maxMobRange) {
      this.counterUntil = 0; this.countered = true; this.t0 = now - 0.001; this.emit('parry', { perfect: true, counter: true }); // удары контратаки выпустятся в update
      return { mul: 0, perfect: true, counter: true };
    }
    if (dist > PARRY.maxMobRange) return { mul: 1 };
    const d = now - this.parryAt;
    if (d >= 0 && d <= PARRY.perfectS) { this.switchUntil = now + SWITCH.windowS; this.lastPose = 'parry'; this.addXp(MASTERY.xpPerPerfect); this.emit('parry', { perfect: true }); this.emit('switch', { open: true }); return { mul: 0, perfect: true, energy: PARRY.energyGain, stagger: PARRY.staggerS }; }
    if (d >= 0 && d <= PARRY.blockS) { this.emit('parry', { perfect: false }); return { mul: PARRY.blockMul, perfect: false }; }
    if (COMBO.decayOnHitTaken && this.combo) { this.combo = 0; this.emit('combo', { n: 0 }); }
    return { mul: 1 };
  }
}
