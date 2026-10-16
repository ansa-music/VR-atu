// Синтезированные звуки для VR Тира (Web Audio API, без аудиофайлов)
let ctx = null;      // AudioContext (создаётся лениво)
let master = null;   // общий мастер-гейн
let noiseBuf = null; // кэш буфера белого шума

// Контекст создаётся при первом вызове (внутри жеста пользователя)
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Тон: freq Гц, dur сек, type осциллятора, vol громкость,
// slide — конечная частота (0 = без глиссандо), delay — задержка старта
function tone(freq, dur, type = 'sine', vol = 0.1, slide = 0, delay = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(20, freq), t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005); // короткая атака без щелчка
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Кэшированный буфер белого шума (общий для sfx и музыки)
function getNoiseBuf(c) {
  if (!noiseBuf) {
    const len = Math.floor(c.sampleRate * 0.5);
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// Всплеск белого шума через lowpass (для взрыва)
function noise(dur, vol, cutoff) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  src.buffer = getNoiseBuf(c);
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

// Любая ошибка звука не должна ломать игру
const safe = (fn) => (...args) => {
  try { fn(...args); } catch (e) { /* игнорируем */ }
};

export const sfx = {
  shot: safe(() => tone(900, 0.08, 'square', 0.05, 250)),
  hit: safe((mult) => {
    const m = Math.min(4, Math.max(1, Number(mult) || 1));
    const f = 500 + m * 150;
    tone(f, 0.15, 'triangle', 0.18, f * 1.6);
  }),
  gold: safe(() => {
    tone(880, 0.25, 'triangle', 0.15);
    tone(1320, 0.3, 'triangle', 0.15, 0, 0.08);
  }),
  bomb: safe(() => {
    tone(160, 0.5, 'sawtooth', 0.3, 35);
    noise(0.35, 0.45, 900);
  }),
  miss: safe(() => tone(180, 0.04, 'triangle', 0.04, 90)),
  start: safe(() => [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.14, 0, i * 0.1))),
  end: safe(() => [784, 659, 523, 392].forEach((f, i) => tone(f, 0.25, 'triangle', 0.14, 0, i * 0.12))),

  // Деревянный тик часов (отсчёт 3-2-1 и последние 10 секунд)
  tick: safe(() => {
    tone(1500, 0.03, 'triangle', 0.18);
    noise(0.02, 0.05, 6000);
  }),

  // Яркий мажорный аккорд-удар «ПОЕХАЛИ!»: C5 E5 G5 C6 одновременно
  go: safe(() => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(f, 0.35, 'triangle', 0.12);
      tone(f, 0.3, 'square', 0.03, 0, i * 0.004); // лёгкий «блеск» поверх
    });
  }),

  // Восходящий перезвон из 3 нот; чем выше комбо (2..4), тем выше тон
  combo: safe((level) => {
    const l = Math.min(4, Math.max(2, Number(level) || 2));
    const base = 600 * Math.pow(2, (l - 2) * 3 / 12); // шаг +3 полутона на уровень
    [1, 1.25, 1.5].forEach((r, i) => tone(base * r, 0.16, 'triangle', 0.13, 0, i * 0.07));
  }),
};

// ---------- Процедурная synthwave-музыка ----------
const BPM = 112;
const STEP = 60 / BPM / 4;     // длительность 16-й ноты, сек
const LOOKAHEAD = 0.12;        // насколько вперёд планируем, сек
const TICK_MS = 25;            // период планировщика
const MUSIC_VOL = 0.3;

// Am – F – C – G: бас (MIDI, октава 2) и аккордовые тоны для арпеджио (октава 5)
const PROG = [
  { root: 45, arp: [72, 76, 81] }, // Am: C5 E5 A5
  { root: 41, arp: [72, 77, 81] }, // F:  C5 F5 A5
  { root: 36, arp: [72, 76, 79] }, // C:  C5 E5 G5
  { root: 43, arp: [74, 79, 83] }, // G:  D5 G5 B5
];
const ARP_PATTERN = [0, 1, 2, 1]; // порядок тонов в арпеджио по 16-м
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

let intensity = 0;     // 0..1, читается планировщиком
let timer = null;      // id setInterval
let musicGain = null;  // громкость музыки
let bassFilter = null; // lowpass баса
let nextTime = 0;      // время следующего шага (AudioContext)
let stepIdx = 0;       // номер 16-й ноты с начала цикла (0..63)

const cutoffFor = (v) => 300 + v * 1700;

// Бочка: синус 150 -> 40 Гц, 0.15 сек
function kick(t) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  o.connect(g);
  g.connect(musicGain);
  o.start(t);
  o.stop(t + 0.17);
}

// Бас: пила через lowpass, нота на каждую 8-ю
function bass(t, midi) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.value = mtof(midi);
  const d = STEP * 2 * 0.9;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g);
  g.connect(bassFilter);
  o.start(t);
  o.stop(t + d + 0.02);
}

// Хэт: белый шум через highpass ~7 кГц, 40 мс
function hat(t) {
  const s = ctx.createBufferSource();
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  s.buffer = getNoiseBuf(ctx);
  f.type = 'highpass';
  f.frequency.value = 7000;
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  s.connect(f);
  f.connect(g);
  g.connect(musicGain);
  s.start(t);
  s.stop(t + 0.05);
}

// Арпеджио: тихий square по 16-м
function arp(t, midi) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square';
  o.frequency.value = mtof(midi);
  const d = STEP * 0.85;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g);
  g.connect(musicGain);
  o.start(t);
  o.stop(t + d + 0.02);
}

// Планирование одной 16-й ноты в момент t
function scheduleStep(idx, t) {
  const bar = Math.floor(idx / 16) % PROG.length;
  const s = idx % 16;
  const chord = PROG[bar];
  if (s % 4 === 0) kick(t);                 // бочка на каждую долю
  if (s % 2 === 0) bass(t, chord.root);     // бас на каждую 8-ю
  if (s % 4 === 2) hat(t);                  // хэт на оффбит
  if (intensity > 0.5) arp(t, chord.arp[ARP_PATTERN[s % 4]]); // арпеджио при высокой интенсивности
}

// Lookahead-планировщик: вызывается каждые 25 мс
function pump() {
  try {
    if (!ctx || !musicGain) return;
    const now = ctx.currentTime;
    if (nextTime < now - 0.1) nextTime = now + 0.02; // вкладка «спала» — не сыпем пачку нот
    while (nextTime < now + LOOKAHEAD) {
      scheduleStep(stepIdx, nextTime);
      nextTime += STEP;
      stepIdx = (stepIdx + 1) % (16 * PROG.length);
    }
  } catch (e) { /* звук не должен ломать игру */ }
}

export const music = {
  // Запуск (идемпотентно)
  start() {
    try {
      if (timer !== null) return;
      const c = ac();
      if (!c) return;
      musicGain = c.createGain();
      musicGain.gain.setValueAtTime(0.0001, c.currentTime);
      musicGain.gain.linearRampToValueAtTime(MUSIC_VOL, c.currentTime + 0.1);
      musicGain.connect(master);
      bassFilter = c.createBiquadFilter();
      bassFilter.type = 'lowpass';
      bassFilter.Q.value = 4;
      bassFilter.frequency.value = cutoffFor(intensity);
      bassFilter.connect(musicGain);
      stepIdx = 0;
      nextTime = c.currentTime + 0.05;
      timer = setInterval(pump, TICK_MS);
      pump();
    } catch (e) { /* игнорируем */ }
  },

  // Остановка: плавное затухание 0.5 сек, планирование прекращается
  stop() {
    try {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
      const g = musicGain, f = bassFilter;
      musicGain = null;
      bassFilter = null;
      if (!ctx || !g) return;
      const t = ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 0.5);
      // после затухания отключаем узлы от графа
      setTimeout(() => {
        try { g.disconnect(); if (f) f.disconnect(); } catch (e) { /* игнорируем */ }
      }, 700);
    } catch (e) { /* игнорируем */ }
  },

  // Интенсивность 0..1: открывает фильтр баса, >0.5 включает арпеджио
  setIntensity(v) {
    try {
      intensity = Math.min(1, Math.max(0, Number(v) || 0));
      if (bassFilter && ctx) {
        bassFilter.frequency.setTargetAtTime(cutoffFor(intensity), ctx.currentTime, 0.15);
      }
    } catch (e) { /* игнорируем */ }
  },
};
