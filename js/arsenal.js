// Арсенал «VR Тир»: характеристики оружия и механика стрельбы.
// Чистая логика без three.js: время приходит через update(dt), модуль работает и в Node.
// Углы в характеристиках — в градусах, скорости — м/с, время — секунды.

const DEG = Math.PI / 180;
const G = 9.81;

export const MODE_LABEL = { auto: 'АВТ', single: 'ОД', pump: 'ПОМПА', bolt: 'ЗАТВОР' };

export const WEAPONS = [
  {
    id: 'pm', slot: 1, name: 'ПМ', title: 'Пистолет Макарова', caliber: '9×18 мм',
    action: 'semi', modes: ['single'], mag: 8, reserve: 32,
    interval: 0.12,                        // сброс спуска, практический темп
    velocity: 315, drag: 0.0016, gravity: G, pellets: 1, penetration: 0, zero: 25,
    reload: 1.7, reloadEmpty: 2.1,
    adsTime: 0.15, adsFov: 60, drawTime: 0.32, speedMul: 1,
    spread: { hip: 1.5, ads: 0.22, move: 1.4, air: 4, crouch: 0.75, bloom: 0.45, bloomMax: 2, bloomRecover: 5 },
    recoil: { pitch: 2.4, yaw: 0.7, recover: 16, delay: 0.07, punch: 0.9 },
    casing: 'pistol', tracerEvery: 0, color: 0xffe0a0,
  },
  {
    id: 'ak', slot: 2, name: 'АК-74М', title: 'Автомат Калашникова', caliber: '5,45×39 мм',
    action: 'auto', modes: ['auto', 'single'], mag: 30, reserve: 120,
    interval: 60 / 650,                    // 650 выстр./мин
    velocity: 900, drag: 0.0011, gravity: G, pellets: 1, penetration: 1, zero: 100,
    reload: 2.4, reloadEmpty: 3.1,
    adsTime: 0.26, adsFov: 54, drawTime: 0.55, speedMul: 0.94,
    spread: { hip: 2.4, ads: 0.1, move: 2.2, air: 5, crouch: 0.7, bloom: 0.12, bloomMax: 1.4, bloomRecover: 3.5 },
    recoil: { pitch: 1.05, first: 1.3, yaw: 0.35, drift: 0.22, recover: 7, delay: 0.12, punch: 0.35 },
    casing: 'rifle', tracerEvery: 3, color: 0xff6a3d,
  },
  {
    id: 'shotgun', slot: 3, name: 'МР-133', title: 'Помповое ружьё', caliber: '12 калибр, картечь',
    action: 'pump', modes: ['pump'], mag: 6, reserve: 30,
    interval: 0.1, cycleTime: 0.55,
    velocity: 400, drag: 0.0095, gravity: G, pellets: 9, pelletSpread: 1.3, penetration: 0, zero: 25,
    shellStart: 0.3, shellTime: 0.45, shellEnd: 0.25,
    adsTime: 0.25, adsFov: 60, drawTime: 0.5, speedMul: 0.94,
    spread: { hip: 1.8, ads: 0.3, move: 1.5, air: 4, crouch: 0.8, bloom: 0.6, bloomMax: 1.2, bloomRecover: 3 },
    recoil: { pitch: 6.5, yaw: 1.5, recover: 10, delay: 0.15, punch: 2.6 },
    casing: 'shell', tracerEvery: 0, color: 0xffe0a0,
  },
  {
    id: 'sniper', slot: 4, name: 'СВ-98', title: 'Снайперская винтовка', caliber: '7,62×54R',
    action: 'bolt', modes: ['bolt'], mag: 10, reserve: 30,
    interval: 0.1, cycleTime: 1.05,
    velocity: 820, drag: 0.00085, gravity: G, pellets: 1, penetration: 2, zero: 100,
    reload: 3.0, reloadEmpty: 3.8,
    adsTime: 0.4, adsFov: 30, zoom: 7, scopeFov: 6, sway: 0.28, drawTime: 0.7, speedMul: 0.86, // поле зрения прицела ~5,5°
    spread: { hip: 5, ads: 0.012, move: 3, air: 8, crouch: 0.8, bloom: 0, bloomMax: 0, bloomRecover: 1 },
    recoil: { pitch: 5.5, yaw: 1, recover: 6, delay: 0.2, punch: 2 },
    casing: 'sniper', tracerEvery: 1, color: 0xffd27a,
  },
  {
    id: 'blaster', slot: 5, name: 'Бластер «Неон»', short: 'БЛАСТЕР', title: 'Энергетическое оружие', caliber: 'плазма, перегрев',
    action: 'energy', modes: ['auto', 'single'], mag: 0, reserve: 0,
    interval: 60 / 420,
    velocity: 140, drag: 0, gravity: 0, pellets: 1, penetration: 0, zero: 0,
    heatPerShot: 0.085, coolRate: 0.45, coolDelay: 0.35, overheatTime: 2, ventTime: 0.9,
    adsTime: 0.18, adsFov: 58, drawTime: 0.3, speedMul: 1,
    spread: { hip: 0.9, ads: 0.15, move: 0.8, air: 2, crouch: 0.85, bloom: 0.15, bloomMax: 0.8, bloomRecover: 4 },
    recoil: { pitch: 0.6, yaw: 0.2, recover: 12, delay: 0.05, punch: 0.2 },
    casing: null, tracerEvery: 0, bolt: true, color: 0x3ec5ff,
  },
];

// доли длительности перезарядки, на которых происходят события (звук и патроны)
const MAG_OUT = 0.15, MAG_IN = 0.62, MAG_IN_EMPTY = 0.5, RACK = 0.82;
const CYCLE_EJECT = 0.35, CYCLE_CHAMBER = 0.6;
const EMPTY = Object.freeze([]);

export class Weapon {
  constructor(def, rng = Math.random) {
    this.def = def;
    this.rng = rng;
    this.events = [];
    this.reset();
  }

  reset() {
    const d = this.def;
    const energy = d.action === 'energy';
    this.chamber = energy ? 0 : 1;
    this.mag = energy ? 0 : d.action === 'pump' ? d.mag : d.mag - 1; // в начале: магазин + патрон в патроннике
    this.reserve = d.reserve;
    this.mode = d.modes[0];
    this.cooldown = 0; this.lastDt = 0;
    this.cycle = 0; this.cycleDur = 0; this.spent = false; this.cycleMarks = 0;
    this.reloading = null;
    this.bloom = 0; this.burst = 0; this.sinceShot = 99; this.shots = 0;
    this.heat = 0; this.overheat = 0;
    this.events.length = 0;
  }

  get energy() { return this.def.action === 'energy'; }
  get capacity() { return this.def.mag; }
  get empty() { return !this.energy && !this.chamber && !this.mag; }
  get busy() { return !!this.reloading || this.cycle > 0 || this.overheat > 0; }
  // прогресс ручного цикла (помпа/затвор) 0..1, иначе null
  get cycleProgress() { return this.cycle > 0 ? 1 - this.cycle / this.cycleDur : null; }
  get reloadState() {
    const r = this.reloading;
    return r ? { kind: r.kind, t: Math.min(1, r.t / r.dur) } : null;
  }

  emit(type, extra) { this.events.push(extra ? { type, ...extra } : { type }); }
  drain() {
    if (!this.events.length) return EMPTY;
    const e = this.events;
    this.events = [];
    return e;
  }

  toggleMode() {
    const m = this.def.modes;
    if (m.length < 2) return false;
    this.mode = m[(m.indexOf(this.mode) + 1) % m.length];
    this.emit('mode', { mode: this.mode });
    return true;
  }

  // Нажатие/удержание спуска. first — нажатие в этом кадре.
  // Возвращает { shot, burst, tracer } | { dry: true } | null
  pull(first) {
    const d = this.def;
    if (this.mode !== 'auto' && !first) return null;
    if (this.reloading) {
      // ружьё: выстрел прерывает поштучное снаряжение
      if (d.action !== 'pump' || !first || !this.reloading.kind.startsWith('shell')) return null;
      this.cancelReload();
      if (!this.chamber) {
        if (this.mag > 0) this.startCycle(false);
        return null;
      }
    }
    if (this.cycle > 0 || this.cooldown > 0) return null;

    if (this.energy) {
      if (this.overheat > 0) {
        if (first) this.emit('dry');
        return null;
      }
      this.heat = Math.min(1, this.heat + d.heatPerShot);
      if (this.heat >= 1) {
        this.overheat = d.overheatTime;
        this.emit('overheat');
      }
    } else {
      if (!this.chamber) {
        if (!first) return null;
        this.emit('dry');
        return { dry: true };
      }
      this.chamber = 0;
      if (d.action === 'semi' || d.action === 'auto') {
        // самозарядное: гильза выбрасывается, следующий патрон досылается сразу
        this.emit('eject');
        if (this.mag > 0) { this.mag--; this.chamber = 1; }
        else if (d.action === 'semi') this.emit('slide-lock');
      } else {
        this.startCycle(true);
      }
    }

    this.cooldown = Math.max(this.cooldown, -this.lastDt) + d.interval;
    this.burst = this.sinceShot > d.interval * 2.5 ? 1 : this.burst + 1;
    this.sinceShot = 0;
    this.shots++;
    this.bloom = Math.min(d.spread.bloomMax, this.bloom + d.spread.bloom);
    this.emit('shot');
    const tracer = d.tracerEvery > 0 && this.shots % d.tracerEvery === 0;
    return { shot: true, burst: this.burst, tracer };
  }

  // ручной цикл: помпа или затвор
  startCycle(spent) {
    this.cycle = this.cycleDur = this.def.cycleTime;
    this.spent = spent;
    this.cycleMarks = 0;
    this.emit('cycle-start');
  }

  startReload() {
    const d = this.def;
    if (this.reloading || this.cycle > 0) return false;
    if (this.energy) {
      if (this.heat < 0.15 || this.overheat > 0) return false;
      this.reloading = { kind: 'vent', t: 0, dur: d.ventTime, marks: 0 };
      this.emit('vent-start');
      return true;
    }
    if (this.reserve <= 0) return false;
    if (d.action === 'pump') {
      if (this.mag >= d.mag) return false;
      this.reloading = { kind: 'shell-start', t: 0, dur: d.shellStart, marks: 0 };
      this.emit('reload-start', { kind: 'shell' });
      return true;
    }
    if (this.mag >= d.mag && this.chamber) return false;
    const kind = this.chamber ? 'mag' : 'mag-empty';
    this.reloading = { kind, t: 0, dur: kind === 'mag' ? d.reload : d.reloadEmpty, marks: 0 };
    this.emit('reload-start', { kind });
    return true;
  }

  cancelReload() {
    if (!this.reloading) return;
    if (this.reloading.kind === 'vent') return; // сброс тепла не прерывается
    this.reloading = null;
    this.emit('reload-cancel');
  }

  // доснарядить магазин из запаса
  topUp() {
    const take = Math.min(this.def.mag - this.mag, this.reserve);
    this.mag += take;
    this.reserve -= take;
  }

  update(dt) {
    const d = this.def;
    this.lastDt = dt;
    this.cooldown = Math.max(-0.1, this.cooldown - dt);
    this.sinceShot += dt;
    if (this.sinceShot > 0.05) this.bloom = Math.max(0, this.bloom - d.spread.bloomRecover * dt);

    if (this.cycle > 0) {
      this.cycle -= dt;
      const p = 1 - Math.max(0, this.cycle) / this.cycleDur;
      if (this.cycleMarks === 0 && p >= CYCLE_EJECT) {
        this.cycleMarks = 1;
        if (this.spent) this.emit('eject');
        this.spent = false;
      }
      if (this.cycleMarks === 1 && p >= CYCLE_CHAMBER) {
        this.cycleMarks = 2;
        if (!this.chamber && this.mag > 0) { this.mag--; this.chamber = 1; }
      }
      if (this.cycle <= 0) { this.cycle = 0; this.emit('cycle-end'); }
    }

    if (this.energy) {
      if (this.overheat > 0) {
        this.overheat -= dt;
        this.heat = Math.max(0, this.heat - dt / d.overheatTime);
        if (this.overheat <= 0) { this.overheat = 0; this.heat = 0; this.emit('vented'); }
      } else if (this.sinceShot > d.coolDelay && !this.reloading) {
        this.heat = Math.max(0, this.heat - d.coolRate * dt);
      }
    }

    const r = this.reloading;
    if (!r) return;
    r.t += dt;
    const p = r.t / r.dur;
    switch (r.kind) {
      case 'vent':
        this.heat = Math.max(0, this.heat - dt * 2.5);
        if (p >= 1) { this.heat = 0; this.reloading = null; this.emit('vented'); }
        break;
      case 'mag':
      case 'mag-empty': {
        const empty = r.kind === 'mag-empty';
        if (r.marks === 0 && p >= MAG_OUT) { r.marks = 1; this.emit('mag-out'); }
        if (r.marks === 1 && p >= (empty ? MAG_IN_EMPTY : MAG_IN)) { r.marks = 2; this.topUp(); this.emit('mag-in'); }
        if (r.marks === 2 && empty && p >= RACK) {
          r.marks = 3;
          if (!this.chamber && this.mag > 0) { this.mag--; this.chamber = 1; }
          this.emit('rack');
        }
        if (p >= 1) { this.reloading = null; this.emit('reloaded'); }
        break;
      }
      case 'shell-start':
        if (p >= 1) this.nextShell();
        break;
      case 'shell':
        if (r.marks === 0 && p >= 0.6) {
          r.marks = 1;
          if (this.reserve > 0 && this.mag < d.mag) { this.mag++; this.reserve--; this.emit('shell-in'); }
        }
        if (p >= 1) this.nextShell();
        break;
      case 'shell-end':
        if (p >= 1) {
          this.reloading = null;
          this.emit('reloaded');
          if (!this.chamber && this.mag > 0) this.startCycle(false);
        }
        break;
    }
  }

  nextShell() {
    const d = this.def;
    this.reloading = this.mag < d.mag && this.reserve > 0
      ? { kind: 'shell', t: 0, dur: d.shellTime, marks: 0 }
      : { kind: 'shell-end', t: 0, dur: d.shellEnd, marks: 0 };
  }

  // ---------- ручные действия в VR (руками, без таймера) ----------
  // магазинное оружие: ПМ, АК, СВ-98
  get magFed() { const a = this.def.action; return a === 'semi' || a === 'auto' || a === 'bolt'; }
  // магазин вставлен, но патрон не дослан — надо передёрнуть затвор
  get needsRack() { return this.magFed && !this.chamber && this.mag > 0 && !this.cycle && !this.reloading; }

  // смена магазина рукой: патрон в патроннике не трогаем
  manualMagSwap() {
    if (!this.magFed || this.reserve <= 0 || this.cycle > 0) return false;
    this.cancelReload();
    this.emit('mag-out');
    this.topUp();
    this.emit('mag-in');
    return true;
  }

  // передёрнуть затвор/рукоятку: живой патрон вылетает, из магазина досылается следующий
  manualRack() {
    if (!this.magFed || this.cycle > 0) return false;
    this.cancelReload();
    let moved = false;
    if (this.mag > 0) {
      if (this.chamber) this.emit('eject');
      this.mag--;
      this.chamber = 1;
      moved = true;
    }
    this.emit('rack'); // звук затвора есть и вхолостую
    return moved;
  }

  // ружьё: один патрон рукой в подствольный магазин
  manualInsertShell() {
    const d = this.def;
    if (d.action !== 'pump' || this.mag >= d.mag || this.reserve <= 0) return false;
    this.cancelReload();
    this.mag++;
    this.reserve--;
    this.emit('shell-in');
    if (!this.chamber && this.cycle <= 0) this.startCycle(false); // помпа сама дошлёт патрон
    return true;
  }

  // Полуугол рассеивания, градусы. aim 0..1, speed — доля скорости шага.
  spread({ aim = 0, speed = 0, air = false, crouch = false } = {}) {
    const s = this.def.spread;
    let a = s.hip + (s.ads - s.hip) * aim;
    a += s.move * Math.min(1.5, speed) * (1 - 0.6 * aim);
    if (air) a += s.air;
    else if (crouch) a *= s.crouch;
    return a + this.bloom * (1 - 0.5 * aim);
  }

  // Отдача одного выстрела, градусы: подброс, увод, «толчок» камеры
  kick({ aim = 0, crouch = false } = {}) {
    const r = this.def.recoil;
    const pitch = r.pitch * (this.burst <= 1 && r.first ? r.first : 1);
    let yaw = (this.rng() * 2 - 1) * r.yaw;
    if (r.drift && this.burst > 3) yaw += r.drift; // АК уводит вправо после третьего патрона
    const m = (crouch ? 0.8 : 1) * (1 - 0.15 * aim);
    return { pitch: pitch * m, yaw: yaw * m, punch: (r.punch || 0) * m };
  }
}

// Инвентарь: слоты 1–5, смена оружия (убрать → достать)
export class Arsenal {
  constructor(defs = WEAPONS, rng = Math.random) {
    this.list = defs.map((d) => new Weapon(d, rng));
    this.index = 1; // АК-74М
    this.target = 1;
    this.phase = 'ready'; // ready | holster | draw
    this.t = 0; this.dur = 0;
    this.events = [];
  }

  get current() { return this.list[this.index]; }
  get ready() { return this.phase === 'ready'; }
  // насколько оружие опущено при смене: 0 — в руках, 1 — убрано
  get lowered() {
    if (this.phase === 'holster') return Math.min(1, this.t / this.dur);
    if (this.phase === 'draw') return 1 - Math.min(1, this.t / this.dur);
    return 0;
  }

  select(i) {
    if (i < 0 || i >= this.list.length) return false;
    if (this.phase === 'holster') { this.target = i; return true; }
    if (i === this.index && this.phase === 'ready') return false;
    this.current.cancelReload();
    this.target = i;
    this.phase = 'holster';
    this.t = 0;
    this.dur = this.current.def.drawTime * 0.5;
    return true;
  }

  step(dir) {
    const n = this.list.length;
    const base = this.phase === 'holster' ? this.target : this.index;
    return this.select((base + dir + n) % n);
  }

  update(dt) {
    for (const w of this.list) w.update(dt);
    if (this.phase === 'ready') return;
    this.t += dt;
    if (this.t < this.dur) return;
    if (this.phase === 'holster') {
      this.index = this.target;
      this.phase = 'draw';
      this.t = 0;
      this.dur = this.current.def.drawTime;
      this.events.push({ type: 'draw' });
    } else {
      this.phase = 'ready';
    }
  }

  drain() {
    if (!this.events.length) return EMPTY;
    const e = this.events;
    this.events = [];
    return e;
  }

  resetAll() { for (const w of this.list) w.reset(); }
}

// Дыхание снайпера: задержка до 5 с, потом одышка
export class Breath {
  constructor(max = 5) {
    this.max = max;
    this.value = 1;
    this.holding = false;
    this.exhausted = 0;
  }

  // want — игрок держит Shift в прицеле. Возвращает 'hold' | 'release' | 'out' | null
  update(dt, want) {
    if (this.exhausted > 0) {
      this.exhausted -= dt;
      this.value = Math.min(1, this.value + dt / 3);
      return null;
    }
    if (want && this.value > 0) {
      const started = !this.holding;
      this.holding = true;
      this.value -= dt / this.max;
      if (this.value <= 0) {
        this.value = 0;
        this.holding = false;
        this.exhausted = 2.5;
        return 'out';
      }
      return started ? 'hold' : null;
    }
    this.value = Math.min(1, this.value + dt / 3);
    if (this.holding) { this.holding = false; return 'release'; }
    return null;
  }

  // множитель раскачки прицела
  get factor() { return this.holding ? 0.12 : this.exhausted > 0 ? 2.2 : 1; }
}

// Раскачка оптики (фигура Лиссажу), градусы
export function scopeSway(t, def, { crouch = false, moving = 0, breath = 1 } = {}) {
  const a = (def.sway || 0) * (crouch ? 0.45 : 1) * (1 + 2.5 * Math.min(1, moving)) * breath;
  return {
    pitch: a * (0.75 * Math.sin(t * 0.83) + 0.25 * Math.sin(t * 2.1 + 1.3)),
    yaw: a * (0.8 * Math.sin(t * 0.61 + 0.4) + 0.2 * Math.sin(t * 1.7)),
  };
}

// Нормальное рассеивание внутри конуса (2σ = полуугол), радианы [dx, dy]
export function sampleSpread(halfDeg, rng = Math.random) {
  const sigma = (halfDeg * DEG) / 2;
  const u = rng() || 1e-9;
  const r = Math.min(sigma * Math.sqrt(-2 * Math.log(u)), halfDeg * DEG * 1.5);
  const a = 2 * Math.PI * rng();
  return [Math.cos(a) * r, Math.sin(a) * r];
}

// Равномерно по кругу (дробь), радианы [dx, dy]
export function samplePellet(halfDeg, rng = Math.random) {
  const r = halfDeg * DEG * Math.sqrt(rng());
  const a = 2 * Math.PI * rng();
  return [Math.cos(a) * r, Math.sin(a) * r];
}

// Снижение пули на дистанции (м) с учётом сопротивления воздуха: { drop, time, speed }
export function dropAt(def, distance) {
  const k = def.drag, g = def.gravity, h = 0.0005;
  let x = 0, y = 0, vx = def.velocity, vy = 0, t = 0;
  while (x < distance && t < 5) {
    const v = Math.hypot(vx, vy);
    vx -= k * v * vx * h;
    vy -= (g + k * v * vy) * h;
    x += vx * h;
    y += vy * h;
    t += h;
  }
  return { drop: -y, time: t, speed: Math.hypot(vx, vy) };
}

// Угол пристрелки: линия прицеливания пересекает траекторию на дистанции zero
const zeroCache = new Map();
export function zeroAngle(def) {
  if (!def.gravity || !def.zero) return 0;
  if (!zeroCache.has(def.id)) zeroCache.set(def.id, Math.atan2(dropAt(def, def.zero).drop, def.zero));
  return zeroCache.get(def.id);
}

export const toRad = (deg) => deg * DEG;
