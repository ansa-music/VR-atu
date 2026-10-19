// Фэнтези-звук для VR: синтез «оркестра» (хор, арфа, виолончели, тайко, колокольчики)
// и звуки заклинаний. Только Web Audio, без аудиофайлов.
// Контекст и шины общие с js/sfx.js: эффекты → sfxBus, музыка → master
// с громкостью музыки из setVolumes().
import { audioCore } from '../sfx.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// плавная ступенька 0..1 между a и b
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

let core = null; // { ctx, master, sfxBus, musicVolume(), noise }
function getCore() {
  if (!core) core = audioCore();
  else if (core.ctx.state === 'suspended') core.ctx.resume().catch(() => {});
  return core;
}

// Банк формант («а-а», «у-у»): вход → параллельные фильтры с усилением → dest.
// spec: [[тип, частота, Q, усиление], ...]; nodes — список для отключения
function formantBank(c, spec, dest, nodes) {
  const inp = c.createGain();
  spec.forEach(([type, f, q, gv]) => {
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = c.createGain();
    g.gain.value = gv;
    inp.connect(fl);
    fl.connect(g);
    g.connect(dest);
    if (nodes) nodes.push(fl, g);
  });
  if (nodes) nodes.push(inp);
  return inp;
}
const AAH = [['bandpass', 800, 5, 2.5], ['bandpass', 1150, 6, 1.6], ['lowpass', 700, 0.7, 0.45]];
const OOH = [['bandpass', 350, 4, 2.2], ['bandpass', 800, 6, 0.8], ['lowpass', 380, 0.7, 0.3]];

// =====================================================================
// Звуки заклинаний
// =====================================================================

// Состояние текущего вызова playSpell (рецепты синхронные)
let C = null;    // AudioContext
let OUT = null;  // выход вызова: громкость и расстояние
let T0 = 0;      // время старта (с задержкой звука по расстоянию)
let P = 1;       // множитель высоты
let END = 0;     // конец самого длинного звука, сек от T0
let NB = null;   // буфер шума
let NYQ = 20000; // верхний предел частот

const hz = (f) => clamp(f * P, 20, NYQ);
const mark = (end) => { if (end - T0 > END) END = end - T0; };

// НЧ-генератор на параметр: rate Гц (→ rate2 к концу), depth — глубина
function lfo(param, rate, depth, t, end, rate2) {
  const l = C.createOscillator();
  const g = C.createGain();
  l.frequency.setValueAtTime(rate, t);
  if (rate2) l.frequency.linearRampToValueAtTime(rate2, end);
  g.gain.value = depth;
  l.connect(g);
  g.connect(param);
  l.start(t);
  l.stop(end + 0.02);
}

// Осциллятор: f → f2 за fd, атака a, спад d, at — задержка;
// vib [Гц, глубина Гц] — вибрато, am [Гц, 0..0.5] — тремоло, dest — куда
function osc(o) {
  const t = T0 + (o.at || 0);
  const a = o.a || 0.003;
  const d = o.d || 0.1;
  const end = t + a + d;
  const s = C.createOscillator();
  const g = C.createGain();
  s.type = o.type || 'sine';
  s.frequency.setValueAtTime(hz(o.f), t);
  if (o.f2) s.frequency.exponentialRampToValueAtTime(hz(o.f2), t + (o.fd || a + d));
  if (o.det) s.detune.value = o.det;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, o.vol || 0.1), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  s.connect(g);
  let tail = g;
  if (o.am) {
    const m = C.createGain();
    m.gain.value = 1 - o.am[1];
    g.connect(m);
    lfo(m.gain, o.am[0], o.am[1], t, end);
    tail = m;
  }
  if (o.vib) lfo(s.frequency, o.vib[0], o.vib[1] * P, t, end);
  tail.connect(o.dest || OUT);
  s.start(t);
  s.stop(end + 0.02);
  mark(end);
}

// Шум через фильтр: type, f → f2, q, атака a, спад d, at — задержка
function nz(o) {
  const t = T0 + (o.at || 0);
  const a = o.a || 0.002;
  const d = o.d || 0.05;
  const end = t + a + d;
  const src = C.createBufferSource();
  const f = C.createBiquadFilter();
  const g = C.createGain();
  src.buffer = NB;
  src.loop = true;
  f.type = o.type || 'bandpass';
  f.frequency.setValueAtTime(hz(o.f || 1000), t);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(hz(o.f2), end);
  if (o.q != null) f.Q.value = o.q;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, o.vol || 0.1), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  src.connect(f);
  f.connect(g);
  g.connect(o.dest || OUT);
  src.start(t, Math.random() * (NB.duration - 0.05));
  src.stop(end + 0.02);
  mark(end);
}

// Колокольчик: синус-партиалы ratios, верхние тише и короче; vol — суммарный пик
function bell(f, ratios, vol, d, at = 0) {
  let sum = 0;
  const amps = ratios.map((r, i) => { const v = 1 / (1 + i * 0.7); sum += v; return v; });
  ratios.forEach((r, i) => {
    const ff = f * r * rnd(0.997, 1.003);
    if (ff * P >= NYQ) return;
    osc({ f: ff, a: 0.002, d: d / (1 + i * 0.5), vol: vol * amps[i] / sum, at });
  });
}

// Фильтр-приёмник для группы звуков: f → f2 за dur сек
function filt(type, f, q, f2, dur) {
  const fl = C.createBiquadFilter();
  fl.type = type;
  fl.Q.value = q == null ? 0.7 : q;
  fl.frequency.setValueAtTime(hz(f), T0);
  if (f2) fl.frequency.exponentialRampToValueAtTime(hz(f2), T0 + (dur || 0.5));
  fl.connect(OUT);
  return fl;
}

// Мини-хор «а-а» или «у-у»: пилы через банк формант
function choir(midis, a, d, vol, spec = AAH, at = 0) {
  const inp = formantBank(C, spec, OUT);
  midis.forEach((m) => {
    const f = mtof(m);
    osc({ type: 'sawtooth', f, a, d, vol, at, det: rnd(-9, 9), dest: inp, vib: [5.5, f * 0.004] });
  });
}

// Глушение музыки при замедлении времени
let muffled = false;
function muffleMusic(on) {
  muffled = on;
  if (!M) return;
  const t = M.ctx.currentTime;
  const p = M.muffle.frequency;
  p.cancelScheduledValues(t);
  p.setValueAtTime(Math.max(100, p.value), t);
  p.exponentialRampToValueAtTime(on ? 900 : 18000, t + (on ? 0.35 : 0.6));
}

const PENT = [1174.7, 1396.9, 1568, 1760, 2093]; // ре-минорная пентатоника, 6-я октава

// Рецепты: o — opts вызова. Пики в сумме ≤ ~0.6
const RECIPES = {
  // Быстрый магический разряд с мерцанием
  'cast-bolt'() {
    osc({ f: 2400, f2: 600, a: 0.002, d: 0.12, vol: 0.16 });
    osc({ type: 'triangle', f: 1800, f2: 3600, a: 0.004, d: 0.1, vol: 0.05, det: 9 });
    nz({ f: 6000, f2: 2500, q: 2, a: 0.001, d: 0.1, vol: 0.28 });
    bell(2200, [1, 1.5, 2.01, 2.99], 0.09, 0.35, 0.02);
    [3000, 3550, 4200].forEach((f, i) => bell(f, [1, 2.01], 0.035, 0.12, 0.03 + i * 0.03));
  },

  // Круглое «ф-вум» сферы
  'cast-orb'() {
    osc({ f: 190, f2: 85, a: 0.03, d: 0.38, vol: 0.3 });
    osc({ type: 'triangle', f: 380, f2: 140, a: 0.03, d: 0.3, vol: 0.08 });
    nz({ type: 'lowpass', f: 1400, f2: 300, a: 0.04, d: 0.36, vol: 0.45 });
    nz({ f: 900, f2: 380, q: 1.5, a: 0.05, d: 0.3, vol: 0.22 });
    bell(880, [1, 2, 3.01], 0.05, 0.4, 0.05);
  },

  // Нарастающий гул энергии ~1.5 с (повторный вызов перезапускает)
  charge() {
    const lp = filt('lowpass', 500, 1, 3500, 1.5);
    const trem = C.createGain();
    trem.gain.value = 0.65;
    trem.connect(lp);
    lfo(trem.gain, 5, 0.35, T0, T0 + 1.75, 24); // пульсация всё чаще
    osc({ type: 'sawtooth', f: 110, f2: 330, fd: 1.5, a: 1.4, d: 0.3, vol: 0.1, dest: trem });
    osc({ type: 'sawtooth', f: 110, f2: 330, fd: 1.5, a: 1.4, d: 0.3, vol: 0.08, det: 14, dest: trem });
    osc({ f: 220, f2: 660, fd: 1.5, a: 1.4, d: 0.3, vol: 0.14, dest: trem });
    osc({ f: 55, f2: 110, fd: 1.5, a: 1.0, d: 0.6, vol: 0.18 });
    nz({ f: 1800, f2: 6500, q: 3, a: 1.3, d: 0.3, vol: 0.14 });
    bell(1760, [1, 2.4, 3.9], 0.08, 0.5, 1.45); // «заряжено»
  },

  // Выпуск огромного луча: рёв + свип + суббас ~1.5 с
  'ki-wave'() {
    osc({ f: 95, f2: 28, fd: 1.1, a: 0.005, d: 1.2, vol: 0.34 });
    nz({ type: 'lowpass', f: 2600, f2: 350, a: 0.02, d: 1.4, vol: 0.38 });
    nz({ f: 500, f2: 1900, q: 1.2, a: 0.08, d: 1.3, vol: 0.25 });
    osc({ type: 'sawtooth', f: 72, a: 0.06, d: 1.3, vol: 0.06, am: [23, 0.4] });
    osc({ type: 'sawtooth', f: 76, a: 0.06, d: 1.3, vol: 0.05 });
    osc({ type: 'sawtooth', f: 300, f2: 1800, fd: 0.9, a: 0.03, d: 1.1, vol: 0.035 });
    osc({ f: 600, f2: 2400, fd: 0.9, a: 0.03, d: 1.1, vol: 0.07 });
    nz({ type: 'highpass', f: 6000, a: 0.12, d: 1.2, vol: 0.07 });
  },

  // Мгновенный шаг: быстрый свист + мерцание, «аниме-телепорт»
  'flash-step'() {
    nz({ f: 400, f2: 5000, q: 1.5, a: 0.06, d: 0.12, vol: 0.45 });
    nz({ type: 'highpass', f: 7000, a: 0.02, d: 0.1, vol: 0.1 });
    osc({ f: 800, f2: 3200, a: 0.01, d: 0.12, vol: 0.09 });
    [2637, 3136, 3520, 4186].forEach((f, i) => bell(f, [1, 2.01], 0.045, 0.18, 0.04 + i * 0.022));
    osc({ f: 140, f2: 55, a: 0.003, d: 0.12, vol: 0.2, at: 0.13 }); // приземление
  },

  // Хрустальное раскрытие щита
  'barrier-up'() {
    osc({ f: 260, f2: 520, a: 0.2, d: 0.6, vol: 0.12 });
    nz({ f: 2000, f2: 8000, q: 0.8, a: 0.25, d: 0.5, vol: 0.14 });
    bell(1046.5, [1, 2, 3, 4.2, 5.4], 0.16, 1.2);
    bell(1318.5, [1, 2, 3, 4.2], 0.11, 1.1, 0.06);
    bell(1568, [1, 2, 3], 0.09, 1.0, 0.12);
    bell(2093, [1, 2], 0.06, 0.9, 0.18);
  },

  // Отражение удара щитом: звонкий «пинг» + рябь
  'barrier-hit'() {
    nz({ type: 'highpass', f: 4000, a: 0.0005, d: 0.02, vol: 0.3 });
    bell(2400, [1, 1.52, 2.7, 3.8], 0.2, 0.45);
    osc({ f: 1200, f2: 600, a: 0.005, d: 0.35, vol: 0.1, vib: [28, 90] });
    nz({ f: 3000, f2: 1200, q: 3, a: 0.01, d: 0.25, vol: 0.14 });
  },

  // Вход в замедление: свист вниз, глухо; музыка глохнет
  'slowmo-in'() {
    nz({ type: 'lowpass', f: 3000, f2: 250, a: 0.05, d: 0.8, vol: 0.5 });
    osc({ f: 420, f2: 60, fd: 0.8, a: 0.02, d: 0.9, vol: 0.18 });
    osc({ type: 'triangle', f: 840, f2: 100, fd: 0.7, a: 0.02, d: 0.7, vol: 0.05 });
    osc({ f: 70, f2: 40, a: 0.003, d: 0.25, vol: 0.25, at: 0.12 }); // глухое «сердце»
    osc({ f: 66, f2: 38, a: 0.003, d: 0.25, vol: 0.2, at: 0.62 });
    muffleMusic(true);
  },

  // Выход из замедления: обратный свист вверх
  'slowmo-out'() {
    nz({ type: 'lowpass', f: 250, f2: 4000, a: 0.6, d: 0.15, vol: 0.42 });
    osc({ f: 80, f2: 520, fd: 0.7, a: 0.55, d: 0.15, vol: 0.16 });
    osc({ type: 'triangle', f: 120, f2: 900, fd: 0.65, a: 0.5, d: 0.15, vol: 0.05 });
    nz({ type: 'highpass', f: 5000, a: 0.001, d: 0.03, vol: 0.15, at: 0.68 });
    muffleMusic(false);
  },

  // Взмах клинка: opts.volume — сила (сильный взмах ярче и короче)
  'sword-swing'(o) {
    const s = clamp(o.volume == null ? 1 : Number(o.volume) || 0, 0, 1.5);
    const k = 0.8 + 0.3 * s;
    const d = 0.2 - 0.05 * Math.min(1, s);
    nz({ f: 500 * k, f2: 2200 * k, q: 2, a: d * 0.45, d: d * 0.25, vol: 0.4 });
    nz({ f: 2200 * k, f2: 700, q: 2, a: 0.002, d: d * 0.6, vol: 0.3, at: d * 0.45 });
    nz({ type: 'highpass', f: 5000, a: d * 0.4, d: d * 0.4, vol: 0.07 });
    osc({ f: 900 * k, f2: 1400 * k, a: d * 0.4, d: d * 0.5, vol: 0.03 });
  },

  // Удар клинком: рассечение + звон
  'sword-hit'() {
    nz({ type: 'highpass', f: 2500, a: 0.0005, d: 0.03, vol: 0.38 });
    nz({ f: 900, q: 1, a: 0.001, d: 0.08, vol: 0.35 });
    osc({ f: 170, f2: 60, a: 0.002, d: 0.12, vol: 0.28 });
    bell(1700, [1, 2.76, 5.4, 8.9], 0.13, 0.7, 0.004);
    bell(3500, [1, 1.5], 0.045, 0.3, 0.02);
  },

  // Натяжение лука: скрип всё чаще ~0.6 с
  'bow-draw'() {
    const n = 11;
    for (let i = 0; i < n; i++) {
      const x = i / n;
      nz({ f: rnd(1700, 2700), q: 8, a: 0.0008, d: 0.006, vol: 0.18 + 0.15 * x, at: 0.58 * Math.sqrt(x) + rnd(0, 0.01) });
    }
    osc({ type: 'triangle', f: 105, f2: 165, fd: 0.6, a: 0.5, d: 0.12, vol: 0.06 });
    nz({ f: 1100, f2: 2300, q: 6, a: 0.5, d: 0.12, vol: 0.1 });
  },

  // Выстрел из лука: «твэнг» тетивы + свист
  'bow-release'() {
    const lp = filt('lowpass', 3500, 2, 300, 0.25);
    osc({ type: 'sawtooth', f: 175, f2: 160, fd: 0.3, a: 0.002, d: 0.35, vol: 0.18, vib: [16, 4], dest: lp });
    osc({ type: 'triangle', f: 175, a: 0.002, d: 0.4, vol: 0.12 });
    nz({ type: 'lowpass', f: 700, a: 0.0005, d: 0.03, vol: 0.3 });
    nz({ f: 2600, f2: 900, q: 1.5, a: 0.01, d: 0.2, vol: 0.3, at: 0.02 });
  },

  // Попадание стрелы: глухой удар + магические искры
  'arrow-hit'() {
    osc({ f: 230, f2: 70, a: 0.002, d: 0.1, vol: 0.32 });
    nz({ type: 'lowpass', f: 900, a: 0.0005, d: 0.05, vol: 0.45 });
    nz({ f: 1500, q: 3, a: 0.0005, d: 0.03, vol: 0.2 });
    for (let i = 0; i < 4; i++) {
      bell(PENT[(Math.random() * PENT.length) | 0] * 2, [1, 2.01], 0.045, 0.3, 0.03 + i * rnd(0.03, 0.05));
    }
    nz({ type: 'highpass', f: 8000, a: 0.02, d: 0.25, vol: 0.05, at: 0.03 });
  },

  // Руна начерчена: открытый аккорд колокольчиков (Dsus2)
  'rune-drawn'() {
    [587.3, 880, 1318.5, 1760].forEach((f, i) => bell(f, [1, 2, 3, 4.1], 0.1, 1.3, i * 0.025));
    nz({ type: 'highpass', f: 6000, a: 0.05, d: 0.6, vol: 0.05 });
  },

  // Руна не удалась: глухое шипение
  'rune-fail'() {
    const lp = filt('lowpass', 900, 1, 300, 0.35);
    osc({ type: 'sawtooth', f: 233, f2: 180, a: 0.005, d: 0.3, vol: 0.08, dest: lp });
    osc({ type: 'sawtooth', f: 330, f2: 250, a: 0.005, d: 0.28, vol: 0.06, dest: lp });
    osc({ f: 160, f2: 80, a: 0.003, d: 0.3, vol: 0.15 });
    nz({ f: 1300, f2: 400, q: 1, a: 0.02, d: 0.4, vol: 0.25 });
    for (let i = 0; i < 5; i++) {
      nz({ type: 'highpass', f: rnd(2500, 5000), a: 0.0005, d: rnd(0.004, 0.01), vol: 0.07, at: rnd(0.03, 0.35) });
    }
  },

  // Ульта: удар хора + восходящее мерцание + удар
  ult() {
    osc({ f: 85, f2: 25, fd: 1.4, a: 0.005, d: 1.6, vol: 0.3 });
    nz({ type: 'lowpass', f: 450, f2: 80, a: 0.005, d: 1.2, vol: 0.35 });
    choir([62, 65, 69, 74, 62, 65, 69, 74], 0.03, 1.6, 0.055); // Dm: D4 F4 A4 D5
    osc({ f: 600, f2: 4800, fd: 1.4, a: 1.2, d: 0.3, vol: 0.05 });
    nz({ type: 'highpass', f: 5000, a: 1.0, d: 0.5, vol: 0.07 });
    [1174.7, 1396.9, 1760, 2349.3, 2793.8, 3520].forEach((f, i) => bell(f, [1, 2.01], 0.05, 0.4, 0.15 + i * 0.16));
    bell(2349.3, [1, 2, 3], 0.1, 1.2, 1.15);
    osc({ f: 75, f2: 30, a: 0.004, d: 0.9, vol: 0.28, at: 1.15 });
  },

  // Магическое попадание по врагу
  'enemy-hit'() {
    nz({ f: 2500, f2: 800, q: 1.5, a: 0.0005, d: 0.08, vol: 0.35 });
    osc({ type: 'square', f: 900, f2: 300, a: 0.002, d: 0.08, vol: 0.045 });
    osc({ f: 620, f2: 200, a: 0.002, d: 0.12, vol: 0.2 });
    bell(1900, [1, 1.6, 2.4], 0.08, 0.25, 0.005);
  },

  // Дух рассеивается: воздушный выдох и падающие искры
  'enemy-die'() {
    nz({ f: 3000, f2: 600, q: 1, a: 0.03, d: 0.9, vol: 0.26 });
    nz({ type: 'highpass', f: 7000, a: 0.01, d: 0.5, vol: 0.06 });
    osc({ f: 1200, f2: 300, a: 0.01, d: 0.8, vol: 0.09, vib: [7, 30] });
    [1760, 1568, 1396.9, 1174.7, 1046.5, 880].forEach((f, i) => {
      bell(f * 2, [1, 2.01], 0.055 * (1 - i * 0.1), 0.35, 0.04 + i * 0.07);
    });
  },

  // Запуск вражеского огненного шара: гул пламени + треск
  fireball() {
    osc({ f: 130, f2: 55, a: 0.003, d: 0.16, vol: 0.2 });
    nz({ f: 300, f2: 1500, q: 0.8, a: 0.08, d: 0.4, vol: 0.45 });
    nz({ type: 'lowpass', f: 700, a: 0.02, d: 0.5, vol: 0.35 });
    for (let i = 0; i < 8; i++) {
      nz({ type: 'highpass', f: rnd(3000, 6000), a: 0.0005, d: rnd(0.004, 0.01), vol: rnd(0.08, 0.16), at: rnd(0, 0.5) });
    }
  },

  // Рык каменного босса: низкий рокот, хруст камня
  'boss-roar'() {
    const lp = filt('lowpass', 320, 2);
    osc({ type: 'sawtooth', f: 48, f2: 42, fd: 1.6, a: 0.15, d: 1.6, vol: 0.2, am: [24, 0.45], dest: lp });
    osc({ type: 'sawtooth', f: 51, f2: 44, fd: 1.6, a: 0.15, d: 1.5, vol: 0.18, dest: lp });
    nz({ type: 'lowpass', f: 500, f2: 150, a: 0.2, d: 1.5, vol: 0.42 });
    nz({ f: 260, q: 2, a: 0.1, d: 1.4, vol: 0.3 });
    osc({ f: 60, f2: 30, a: 0.01, d: 1.0, vol: 0.28, at: 0.05 });
    for (let i = 0; i < 6; i++) {
      nz({ type: 'lowpass', f: rnd(900, 1500), a: 0.001, d: rnd(0.02, 0.05), vol: rnd(0.1, 0.18), at: rnd(0.1, 1.3) });
    }
  },

  // Фея: крошечный «смех» колокольчиков
  fairy() {
    const notes = [2349.3, 2793.8, 2637, 3520, 3136, 3951];
    [0, 0.06, 0.11, 0.17, 0.22, 0.3].forEach((at, i) => bell(notes[i] * rnd(0.98, 1.02), [1, 2, 3.01], 0.055, 0.22, at));
    nz({ type: 'highpass', f: 9000, a: 0.02, d: 0.3, vol: 0.03 });
  },

  // Череп: короткий призрачный стон «у-у»
  skull() {
    const v = formantBank(C, OOH, OUT);
    osc({ type: 'sawtooth', f: 165, f2: 120, fd: 0.8, a: 0.15, d: 0.65, vol: 0.2, vib: [5, 6], dest: v });
    osc({ type: 'sawtooth', f: 165, f2: 120, fd: 0.8, a: 0.15, d: 0.6, vol: 0.15, det: 12, dest: v });
    nz({ f: 900, f2: 500, q: 2, a: 0.1, d: 0.6, vol: 0.12 });
  },

  // Восполнение маны: «бульки» вверх + перезвон
  'mana-restore'() {
    [600, 750, 900, 1100, 1350].forEach((f, i) => osc({ f, f2: f * 1.8, fd: 0.05, a: 0.004, d: 0.07, vol: 0.1, at: i * 0.06 }));
    bell(1760, [1, 2, 3.01], 0.1, 0.7, 0.3);
    bell(2637, [1, 2], 0.07, 0.6, 0.36);
    nz({ f: 2000, f2: 5000, q: 2, a: 0.2, d: 0.2, vol: 0.06 });
  },

  // Смена стихии: щелчок; o.element = 'fire' | 'ice' | 'lightning'
  'element-switch'(o) {
    nz({ type: 'highpass', f: 3000, a: 0.0005, d: 0.01, vol: 0.2 });
    const el = o.element;
    if (el === 'fire') {
      nz({ f: 800, f2: 1600, q: 0.8, a: 0.01, d: 0.18, vol: 0.3 });
      osc({ f: 200, f2: 420, a: 0.005, d: 0.12, vol: 0.12 });
      for (let i = 0; i < 4; i++) {
        nz({ type: 'highpass', f: rnd(2000, 4000), a: 0.0005, d: 0.005, vol: 0.1, at: rnd(0.02, 0.16) });
      }
    } else if (el === 'ice') {
      bell(3136, [1, 2.76, 5.4], 0.1, 0.4);
      bell(4186, [1, 2.76], 0.06, 0.3, 0.03);
      nz({ type: 'highpass', f: 8000, a: 0.005, d: 0.15, vol: 0.08 });
    } else if (el === 'lightning') {
      osc({ type: 'square', f: 1800, f2: 300, a: 0.001, d: 0.06, vol: 0.05 });
      [0, 0.03, 0.06].forEach((at) => nz({ type: 'highpass', f: 4000, a: 0.0005, d: 0.008, vol: 0.22, at }));
      osc({ type: 'sawtooth', f: 120, a: 0.003, d: 0.15, vol: 0.06, am: [60, 0.5] });
    } else {
      bell(2000, [1, 1.5], 0.06, 0.12);
    }
  },

  // Новый уровень: торжественное арпеджио ре мажор
  'level-up'() {
    const lp = filt('lowpass', 1200, 1, 3000, 0.3);
    [74, 78, 81, 86].forEach((m, i) => {
      const d = i === 3 ? 0.7 : 0.14;
      const f = mtof(m);
      osc({ type: 'sawtooth', f, a: 0.01, d, vol: 0.07, at: i * 0.09, dest: lp });
      osc({ type: 'sawtooth', f, a: 0.01, d, vol: 0.05, det: 10, at: i * 0.09, dest: lp });
      osc({ type: 'triangle', f, a: 0.005, d, vol: 0.09, at: i * 0.09 });
    });
    osc({ f: 110, f2: 70, a: 0.003, d: 0.3, vol: 0.25, at: 0.27 }); // литавра
    [1174.7, 1480, 1760].forEach((f, i) => bell(f, [1, 2, 3], 0.06, 0.9, 0.3 + i * 0.03));
    nz({ type: 'highpass', f: 6000, a: 0.1, d: 0.6, vol: 0.05, at: 0.27 });
  },
};

const MAX_LIVE = 40;                              // предел одновременных вызовов
const EXCL = { charge: 1, 'bow-draw': 1 };        // звучит только последний
const CUTS = { 'ki-wave': 'charge', 'bow-release': 'bow-draw' }; // что обрывает
const active = {};  // текущие charge / bow-draw
const lastAt = {};  // время последнего вызова по имени (антидребезг)
let live = 0;

// Учёт вызова: отключение после конца звука, ручная остановка с затуханием
function track(c, out, lp, endT) {
  live++;
  let done = false;
  let tid = 0;
  const kill = () => {
    if (done) return;
    done = true;
    live--;
    clearTimeout(tid);
    try { out.disconnect(); if (lp) lp.disconnect(); } catch (e) { /* игнорируем */ }
  };
  tid = setTimeout(kill, Math.max(0, endT - c.currentTime + 0.3) * 1000);
  return {
    stop(fade = 0.06) {
      try {
        if (done) return;
        const t = c.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.linearRampToValueAtTime(0, t + fade);
        clearTimeout(tid);
        tid = setTimeout(kill, (fade + 0.05) * 1000);
      } catch (e) { /* игнорируем */ }
    },
  };
}

// Звук заклинания. opts: volume (0..1.5, по умолчанию 1), pitch (множитель высоты),
// distance (м: тише, глуше и позже на distance/343 с), element (для element-switch),
// stop: true — плавно оборвать текущий charge / bow-draw.
// Возвращает { stop(fade?) } или null. Никогда не бросает исключений.
export function playSpell(name, opts = {}) {
  let out = null;
  let lp = null;
  try {
    const o = opts || {};
    if (o.stop) {
      if (active[name]) { active[name].stop(0.12); active[name] = null; }
      return null;
    }
    const recipe = Object.prototype.hasOwnProperty.call(RECIPES, name) ? RECIPES[name] : null;
    if (!recipe) return null;
    const k = getCore();
    if (!k || !k.noise) return null;
    const c = k.ctx;
    const now = c.currentTime;
    if (live >= MAX_LIVE) return null;
    if (lastAt[name] !== undefined && now - lastAt[name] < 0.03) return null;
    const vol = clamp(o.volume == null ? 1 : Number(o.volume) || 0, 0, 1.5);
    if (vol < 0.001) return null;
    lastAt[name] = now;
    const cut = CUTS[name];
    if (cut && active[cut]) { active[cut].stop(0.08); active[cut] = null; }

    const dist = Math.max(0, Number(o.distance) || 0);
    out = c.createGain();
    out.gain.value = vol * rnd(0.88, 1) / (1 + dist / 12);
    if (dist > 2) {
      // воздух глушит верхи
      lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.max(1200, 18000 / (1 + dist / 10));
      out.connect(lp);
      lp.connect(k.sfxBus);
    } else {
      out.connect(k.sfxBus);
    }

    C = c;
    OUT = out;
    NB = k.noise;
    NYQ = c.sampleRate * 0.45;
    T0 = now + 0.004 + dist / 343;
    P = clamp(Number(o.pitch) || 1, 0.25, 4) * rnd(0.97, 1.03);
    END = 0;
    recipe(o);

    const h = track(c, out, lp, T0 + END);
    if (EXCL[name]) {
      if (active[name]) active[name].stop(0.05);
      active[name] = h;
    }
    return h;
  } catch (e) {
    try { if (out) out.disconnect(); if (lp) lp.disconnect(); } catch (e2) { /* игнорируем */ }
    return null;
  } finally {
    C = null;
    OUT = null;
  }
}

// =====================================================================
// Музыка: синтезированный «фэнтези-оркестр», ре минор, 88 BPM, 16 тактов
// =====================================================================
const BPM = 88;
const STEP = 60 / BPM / 4; // 16-я нота, сек
const BAR = STEP * 16;
const LOOK = 0.12;         // планируем вперёд, сек
const TICK = 25;           // период планировщика, мс
const XF = 0.5;            // постоянная времени кроссфейда слоёв, сек

// Бас r (октава 1–2) и аккордовые тоны t (октава 3)
const CH = {
  Dm: { r: 38, t: [50, 53, 57] },
  Bb: { r: 34, t: [50, 53, 58] },
  C: { r: 36, t: [52, 55, 60] },
  F: { r: 41, t: [53, 57, 60] },
  Gm: { r: 43, t: [50, 55, 58] },
  A: { r: 45, t: [52, 57, 61] },
};
// i–VI–VII–i | i–iv–VI–VII | III–VII–i–VI | iv–VI–VII–V
const SONG = ['Dm', 'Bb', 'C', 'Dm', 'Dm', 'Gm', 'Bb', 'C', 'F', 'C', 'Dm', 'Bb', 'Gm', 'Bb', 'C', 'A'].map((n) => CH[n]);

// Арфа: индексы 0..5 → тоны аккорда в 4-й и 5-й октавах
const HARP = [
  [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 5, 4, 3, 2],
  [0, 2, 4, 2, 1, 3, 5, 3, 0, 2, 4, 3, 5, 3, 1, 2],
  [5, 4, 3, 2, 1, 2, 3, 4, 5, 3, 4, 2, 3, 1, 2, 0], // последние 4 такта — вниз
];
const arpNote = (ch, i) => ch.t[i % 3] + 12 * (1 + Math.floor(i / 3));
// Тайко: шаг → сила; каждый 4-й такт — сбивка
const TAIKO = [
  { 0: 1, 6: 0.45, 8: 0.8, 11: 0.4, 14: 0.5 },
  { 0: 1, 3: 0.4, 8: 0.85, 10: 0.45, 12: 0.5 },
];
const FILL = { 0: 1, 8: 0.8, 12: 0.55, 13: 0.6, 14: 0.7, 15: 0.85 };
// Колокольчики: [шаг, тон аккорда]
const GLOCK = [
  [[0, 2], [3, 1], [6, 2], [10, 0], [12, 1]],
  [[2, 0], [4, 2], [8, 1], [11, 2], [14, 0]],
];

// Целевые громкости слоёв по интенсивности
function targets(i) {
  return {
    pad: 0.6 + 0.4 * i,
    harp: 0.75 + 0.25 * i,
    str: 0.55 + 0.45 * i,
    drums: smooth(0.4, 0.6, i),  // тайко — только при интенсивности > 0.4
    glock: smooth(0.7, 0.85, i), // колокольчики — при > 0.7
  };
}

let M = null;       // граф музыки (null — не играет)
let timer = null;
let intensity = 0;
let applied = -1;   // последняя применённая интенсивность
let nextT = 0;      // время следующего шага
let stepN = 0;      // 16-я с начала цикла (0..255)
let loopN = 0;      // номер прохода цикла (для вариаций)
let lastPump = 0;
const lv = { drums: 0, glock: 0 }; // зеркало громкости слоёв: пока слышно — планируем

// Граф: слои → mix → muffle → vol (громкость музыки) → fade → master
function buildMusic(k) {
  const c = k.ctx;
  const t = c.currentTime;
  const all = [];
  const gain = (v, to) => {
    const n = c.createGain();
    n.gain.value = v;
    if (to) n.connect(to);
    all.push(n);
    return n;
  };
  const filter = (type, f, q, to) => {
    const n = c.createBiquadFilter();
    n.type = type;
    n.frequency.value = f;
    n.Q.value = q;
    if (to) n.connect(to);
    all.push(n);
    return n;
  };

  const fade = gain(0, k.master);
  fade.gain.setValueAtTime(0, t);
  fade.gain.linearRampToValueAtTime(1, t + 1.2); // мягкий вход
  const mv = k.musicVolume();
  const vol = gain(mv, fade);
  const muffle = filter('lowpass', muffled ? 900 : 18000, 0.7, vol);
  const mix = gain(1.3, muffle);

  // «пространство»: задержка на 3/16 с затухающими повторами
  const send = gain(1);
  const dl = c.createDelay(1);
  dl.delayTime.value = STEP * 3;
  all.push(dl);
  const fbLP = filter('lowpass', 2200, 0.7);
  const fb = gain(0.35, dl);
  const wet = gain(0.4, mix);
  send.connect(dl);
  dl.connect(fbLP);
  fbLP.connect(fb);
  fbLP.connect(wet);

  const T = targets(intensity);
  const layer = (v, sendAmt) => {
    const n = gain(v, mix);
    if (sendAmt) n.connect(gain(sendAmt, send));
    return n;
  };
  const pad = layer(T.pad, 0.25);
  const harp = layer(T.harp, 0.4);
  const str = layer(T.str, 0.1);
  const drums = layer(T.drums, 0);
  const glock = layer(T.glock, 0.5);
  const padIn = formantBank(c, AAH, pad, all);
  const strIn = filter('lowpass', 650 + 700 * intensity, 1, str);

  // общее вибрато хора (центы)
  const vib = c.createOscillator();
  vib.frequency.value = 4.8;
  const vibG = gain(7);
  vib.connect(vibG);
  vib.start(t);

  applied = intensity;
  lv.drums = T.drums;
  lv.glock = T.glock;
  return {
    ctx: c, nb: k.noise, musicVolume: k.musicVolume, mv,
    fade, vol, muffle, pad, harp, str, drums, glock, padIn, strIn, vib, vibG, all,
  };
}

// Хор «а-а»: пилы (октава 3 и 4), медленная атака, плавная смена аккорда
function padChord(t, ch, odd) {
  const d = BAR + 0.5;
  ch.t.forEach((m, i) => {
    const top = odd && i === 2 ? 12 : 0; // вариация: верхний голос выше
    padVoice(t, mtof(m + top), -7 + rnd(-2, 2), d);
    padVoice(t, mtof(m + 12), 6 + rnd(-2, 2), d);
  });
}
function padVoice(t, f, det, d) {
  const c = M.ctx;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sawtooth';
  o.frequency.value = f;
  o.detune.value = det;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.055, t + 0.9);
  g.gain.setValueAtTime(0.055, t + d - 1.0);
  g.gain.linearRampToValueAtTime(0.0001, t + d + 0.3);
  o.connect(g);
  g.connect(M.padIn);
  const vg = M.vibG;
  vg.connect(o.detune);
  o.onended = () => { try { vg.disconnect(o.detune); } catch (e) { /* уже отключено */ } };
  o.start(t);
  o.stop(t + d + 0.35);
}

// Виолончели: корень + октава, пилы через общий lowpass
function cello(t, ch) {
  const c = M.ctx;
  const d = BAR + 0.25;
  [[ch.r, 0.11, -4], [ch.r + 12, 0.065, 5]].forEach(([m, v, det]) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.value = mtof(m);
    o.detune.value = det;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.35);
    g.gain.setValueAtTime(v, t + d - 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + d + 0.1);
    o.connect(g);
    g.connect(M.strIn);
    o.start(t);
    o.stop(t + d + 0.15);
  });
}

// Арфа: щипок — треугольник с быстрым спадом + короткая октава сверху
function harp(t, m, v) {
  const c = M.ctx;
  const f = mtof(m);
  const d = m < 66 ? 1.1 : 0.8;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'triangle';
  o.frequency.value = f;
  o.detune.value = rnd(-4, 4);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.13 * v, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g);
  g.connect(M.harp);
  o.start(t);
  o.stop(t + d + 0.02);
  const o2 = c.createOscillator();
  const g2 = c.createGain();
  o2.frequency.value = f * 2;
  g2.gain.setValueAtTime(0.0001, t);
  g2.gain.linearRampToValueAtTime(0.04 * v, t + 0.003);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o2.connect(g2);
  g2.connect(M.harp);
  o2.start(t);
  o2.stop(t + 0.14);
}

// Шум для ударных музыки
function mNoise(t, type, f, q, d, vol) {
  const c = M.ctx;
  const s = c.createBufferSource();
  const fl = c.createBiquadFilter();
  const g = c.createGain();
  s.buffer = M.nb;
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = q;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(fl);
  fl.connect(g);
  g.connect(M.drums);
  s.start(t, Math.random() * Math.max(0, M.nb.duration - d - 0.05));
  s.stop(t + d + 0.02);
}

// Тайко: низкий синус с падением высоты + удар палки + кожа
function taiko(t, v) {
  const c = M.ctx;
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.setValueAtTime(120 * rnd(0.98, 1.02), t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.3);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.75 * v, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  o.connect(g);
  g.connect(M.drums);
  o.start(t);
  o.stop(t + 0.52);
  mNoise(t, 'lowpass', 900, 1, 0.07, 0.4 * v);
  mNoise(t, 'bandpass', 190, 1.5, 0.28, 0.5 * v);
}

// Колокольчик/челеста: синус + негармонический обертон
function glock(t, m) {
  const c = M.ctx;
  const f = mtof(m);
  [[1, 0.07, 1.3], [2.76, 0.025, 0.35]].forEach(([r, v, d]) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = f * r;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g);
    g.connect(M.glock);
    o.start(t);
    o.stop(t + d + 0.02);
  });
}

// Планирование одной 16-й
function fStep(n, t) {
  const bar = n >> 4;
  const s = n & 15;
  const ch = SONG[bar];
  const odd = loopN & 1;
  if (s === 0) {
    padChord(t, ch, odd);
    cello(t, ch);
  }
  // арфа: при низкой интенсивности — восьмыми
  if (s % 2 === 0 || intensity >= 0.25) {
    const pat = HARP[bar >= 12 ? 2 : odd];
    harp(t, arpNote(ch, pat[s]), s % 4 === 0 ? 1 : 0.72);
  }
  if (lv.drums > 0.01) {
    const p = bar % 4 === 3 ? FILL : TAIKO[(bar + odd) & 1];
    if (p[s]) taiko(t, p[s]);
  }
  if (lv.glock > 0.01) {
    const g = GLOCK[(bar + odd) & 1];
    for (let i = 0; i < g.length; i++) {
      if (g[i][0] === s) glock(t, ch.t[g[i][1]] + 24 + (odd && g[i][1] === 0 ? 12 : 0));
    }
  }
}

// Плавный кроссфейд слоёв к новой интенсивности
function applyIntensity(now) {
  applied = intensity;
  const T = targets(intensity);
  M.pad.gain.setTargetAtTime(T.pad, now, XF);
  M.harp.gain.setTargetAtTime(T.harp, now, XF);
  M.str.gain.setTargetAtTime(T.str, now, XF);
  M.drums.gain.setTargetAtTime(T.drums, now, XF);
  M.glock.gain.setTargetAtTime(T.glock, now, XF);
  M.strIn.frequency.setTargetAtTime(650 + 700 * intensity, now, XF);
}

// Lookahead-планировщик (как pump() в sfx.js)
function pump() {
  try {
    if (!M) return;
    const now = M.ctx.currentTime;
    if (Math.abs(intensity - applied) > 0.004) applyIntensity(now);
    // зеркало громкости слоёв с той же постоянной времени
    const kk = 1 - Math.exp(-Math.max(0, now - lastPump) / XF);
    lastPump = now;
    const T = targets(intensity);
    lv.drums += (T.drums - lv.drums) * kk;
    lv.glock += (T.glock - lv.glock) * kk;
    if (T.drums > 0) lv.drums = Math.max(lv.drums, 0.02);
    if (T.glock > 0) lv.glock = Math.max(lv.glock, 0.02);
    // громкость музыки из setVolumes()
    const mv = M.musicVolume();
    if (Math.abs(mv - M.mv) > 1e-4) {
      M.mv = mv;
      const p = M.vol.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(mv, now + 0.05);
    }
    if (nextT < now - 0.1) nextT = now + 0.02; // вкладка «спала» — не сыпем пачку нот
    while (nextT < now + LOOK) {
      fStep(stepN, nextT);
      nextT += STEP;
      stepN = (stepN + 1) % (16 * SONG.length);
      if (stepN === 0) loopN++;
    }
  } catch (e) { /* звук не должен ломать игру */ }
}

export const fantasyMusic = {
  // Запуск (идемпотентно), мягкий вход 1.2 с
  start() {
    try {
      if (M) return;
      const k = getCore();
      if (!k || !k.noise) return;
      M = buildMusic(k);
      stepN = 0;
      loopN = 0;
      nextT = k.ctx.currentTime + 0.08;
      lastPump = k.ctx.currentTime;
      timer = setInterval(pump, TICK);
      pump();
    } catch (e) { M = null; }
  },

  // Остановка: затухание 0.5 с, затем узлы отключаются
  stop() {
    try {
      if (timer !== null) { clearInterval(timer); timer = null; }
      if (!M) return;
      const m = M;
      M = null;
      const t = m.ctx.currentTime;
      const p = m.fade.gain;
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(0, t + 0.5);
      setTimeout(() => {
        try { m.vib.stop(); } catch (e) { /* игнорируем */ }
        m.all.forEach((n) => { try { n.disconnect(); } catch (e) { /* игнорируем */ } });
      }, 700);
    } catch (e) { /* игнорируем */ }
  },

  // Интенсивность 0..1: слои плавно меняются (тайко > 0.4, колокольчики > 0.7)
  setIntensity(v) {
    try {
      intensity = clamp(Number(v) || 0, 0, 1);
    } catch (e) { /* игнорируем */ }
  },
};
