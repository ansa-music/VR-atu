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

// Всплеск белого шума через lowpass (для взрыва)
function noise(dur, vol, cutoff) {
  const c = ac();
  if (!c) return;
  if (!noiseBuf) {
    const len = Math.floor(c.sampleRate * 0.5);
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime;
  const src = c.createBufferSource();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  src.buffer = noiseBuf;
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
};
