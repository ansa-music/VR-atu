// Синтезированные звуки для VR Тира (Web Audio API, без аудиофайлов)
let ctx = null;      // AudioContext (создаётся лениво)
let master = null;   // общий мастер-гейн
let sfxBus = null;   // шина эффектов (всё, кроме музыки) → master
let noiseBuf = null; // кэш буфера белого шума
let volMusic = 1;    // громкость музыки 0..1 (множитель MUSIC_VOL)
let volSfx = 1;      // громкость эффектов 0..1

// Контекст создаётся при первом вызове (внутри жеста пользователя)
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    // Компрессор между мастером и выходом: стопка выстрелов не клиппует
    let out = ctx.destination;
    try {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -8;
      comp.knee.value = 6;
      comp.ratio.value = 8;
      comp.attack.value = 0.002;
      comp.release.value = 0.15;
      const trim = ctx.createGain();
      trim.gain.value = 0.68; // компенсация авто-усиления (makeup) компрессора
      comp.connect(trim);
      trim.connect(ctx.destination);
      out = comp;
    } catch (e) { /* без компрессора */ }
    master.connect(out);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = volSfx;
    sfxBus.connect(master);
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
  g.connect(sfxBus);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Кэшированный буфер белого шума (общий для sfx и музыки), 1.5 сек — хватает на хвосты
function getNoiseBuf(c) {
  if (!noiseBuf) {
    const len = Math.floor(c.sampleRate * 1.5);
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
  g.connect(sfxBus);
  src.start(t);
  src.stop(t + dur + 0.02);
}

// Любая ошибка звука не должна ломать игру
const safe = (fn) => (...args) => {
  try { fn(...args); } catch (e) { /* игнорируем */ }
};

// ---------- Помощники для реалистичных звуков ----------

// Случайное число в диапазоне [a, b]
const rnd = (a, b) => a + Math.random() * (b - a);

// Шумовой всплеск с огибающей атака/спад.
// o: type фильтра, f → f2 (скольжение частоты), q, vol, a — атака, d — спад, delay — задержка
function burst(o) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + (o.delay || 0);
  const a = o.a || 0.001;
  const d = o.d || 0.05;
  const end = t + a + d;
  const buf = getNoiseBuf(c);
  const src = c.createBufferSource();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  src.buffer = buf;
  src.loop = true; // длинный хвост не упрётся в конец буфера
  f.type = o.type || 'bandpass';
  f.frequency.setValueAtTime(o.f || 1000, t);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, end);
  if (o.q != null) f.Q.value = o.q;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol || 0.1, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  src.connect(f);
  f.connect(g);
  g.connect(sfxBus);
  // случайный кусок шума — повторы не звучат одинаково
  src.start(t, Math.random() * (buf.duration - 0.05));
  src.stop(end + 0.02);
}

// Осциллятор со скольжением высоты: f → f2 за fd сек, огибающая a/d
function sweep(o) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + (o.delay || 0);
  const a = o.a || 0.002;
  const d = o.d || 0.1;
  const end = t + a + d;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(Math.max(20, o.f), t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.fd || a + d));
  if (o.detune) osc.detune.value = o.detune;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol || 0.1, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(g);
  g.connect(sfxBus);
  osc.start(t);
  osc.stop(end + 0.02);
}

// Низкий «тамп»: синус с падающей высотой
function thump(f, f2, d, vol, delay = 0) {
  sweep({ type: 'sine', f, f2, fd: d * 0.7, a: 0.002, d, vol, delay });
}

// Металлический звон: негармонические синус-партиалы, верхние тише и гаснут быстрее.
// base — основная частота, ratios — отношения, d — длина звона, maxF — срез верхов
function metal(base, ratios, vol, d, delay = 0, maxF = 15000) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const top = Math.min(maxF, c.sampleRate * 0.45);
  const fs = ratios.map((r) => base * r * rnd(0.996, 1.004)).filter((f) => f < top);
  let sum = 0;
  const amps = fs.map((f, i) => { const v = 1 / (1 + i * 0.6); sum += v; return v; });
  fs.forEach((f, i) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    const dd = d / (1 + i * 0.4);
    osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol * amps[i] / sum, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dd);
    osc.connect(g);
    g.connect(sfxBus);
    osc.start(t);
    osc.stop(t + dd + 0.02);
  });
}

// Металлический щелчок/лязг: резкий шум + короткий звон + глухой удар корпуса
function clack(f, vol, delay = 0, ring = 0.05) {
  burst({ type: 'bandpass', f, q: 1.5, a: 0.0005, d: 0.018, vol, delay });
  burst({ type: 'lowpass', f: 700, a: 0.001, d: 0.035, vol: vol * 0.9, delay });
  metal(f * rnd(0.55, 0.65), [1, 1.47, 2.09, 2.56, 3.13], vol * 0.35, ring, delay);
}

// Трение металла о металл (затвор, магазин, цевьё)
function scrape(f, f2, d, vol, delay = 0) {
  burst({ type: 'bandpass', f, f2, q: 2.5, a: d * 0.3, d: d * 0.7, vol, delay });
  burst({ type: 'highpass', f: 5000, a: d * 0.3, d: d * 0.5, vol: vol * 0.15, delay });
}

// «Уличное эхо»: полосовой шум, мягкая атака, медленный спад, слегка задержан
function echo(f, d, vol, delay = 0.04) {
  burst({ type: 'bandpass', f, f2: f * 0.55, q: 0.7, a: 0.035, d, vol, delay });
}

// Пресеты выстрелов: lvl — общий уровень; cf/cd/cv — треск; bf/bd/bv — тело;
// tf/tf2/td/tv — низкий удар; echo — [частота, спад, громкость, задержка]
const GUNS = {
  // Макаров 9×18: резкий, средний, короткий хвост ~0.25 с
  pm: {
    lvl: 0.55, cf: 2600, cd: 0.008, cv: 0.55, bf: 2000, bd: 0.07, bv: 1.0,
    tf: 150, tf2: 50, td: 0.09, tv: 0.4, echo: [[1000, 0.3, 0.5, 0.03]],
    extra: (L) => burst({ type: 'bandpass', f: 3200, q: 3, a: 0.0005, d: 0.012, vol: 0.4 * L, delay: 0.035 }), // кожух-затвор
  },
  // АК-74М 5.45: яркий громкий треск, плотный; огибающие короткие — для 650 выстр/мин
  ak: {
    lvl: 0.6, cf: 3400, cd: 0.012, cv: 0.65, bf: 2600, bd: 0.06, bv: 1.1,
    tf: 125, tf2: 42, td: 0.09, tv: 0.45, echo: [[800, 0.55, 0.5, 0.04]],
    extra: (L) => burst({ type: 'bandpass', f: 2300, q: 3, a: 0.0005, d: 0.015, vol: 0.45 * L, delay: 0.03 }), // затворная рама
  },
  // МР-133 12 калибр: глубокий «бум», мощный низ, хвост ~0.9 с
  shotgun: {
    lvl: 0.6, cf: 1900, cd: 0.014, cv: 0.45, bf: 1100, bd: 0.17, bv: 1.4,
    tf: 105, tf2: 32, td: 0.3, tv: 0.6, echo: [[500, 0.85, 0.6, 0.05], [260, 0.9, 0.5, 0.12]],
    extra: (L) => thump(60, 28, 0.4, 0.25 * L, 0.005), // дополнительный суббас
  },
  // СВ-98 7.62×54R: очень громкий треск + долгое раскатистое эхо ~1.4 с
  sniper: {
    lvl: 0.65, cf: 3000, cd: 0.015, cv: 0.75, bf: 1800, bd: 0.13, bv: 1.3,
    tf: 115, tf2: 35, td: 0.24, tv: 0.55,
    echo: [[1000, 0.55, 0.55, 0.06], [650, 0.75, 0.45, 0.3], [420, 0.8, 0.4, 0.6]],
    extra: (L) => burst({ type: 'bandpass', f: 5500, q: 0.8, a: 0.0003, d: 0.005, vol: 0.4 * L }), // сверхзвуковой хлопок
  },
};

// Выстрел = треск + тело + низкий удар + уличное эхо
function gun(p) {
  const k = rnd(0.95, 1.05);     // разброс тембра — очередь не звучит «копией»
  const L = p.lvl * rnd(0.9, 1); // общий уровень выстрела
  burst({ type: 'highpass', f: p.cf * k, a: 0.0005, d: p.cd, vol: p.cv * L });              // треск
  burst({ type: 'lowpass', f: p.bf * k, f2: p.bf * 0.25, a: 0.001, d: p.bd, vol: p.bv * L }); // тело
  thump(p.tf * k, p.tf2, p.td, p.tv * L);                                                    // удар
  p.echo.forEach((e) => echo(e[0] * k, e[1], e[2] * L, e[3]));                               // эхо
  if (p.extra) p.extra(L);
}

// Бластер: зап со скольжением высоты + шипение шума
function blaster() {
  const k = rnd(0.96, 1.04);
  sweep({ type: 'square', f: 1500 * k, f2: 200, a: 0.002, d: 0.11, vol: 0.06 });
  sweep({ type: 'sawtooth', f: 2300 * k, f2: 320, a: 0.002, d: 0.08, vol: 0.035, detune: 12 });
  sweep({ type: 'sine', f: 800 * k, f2: 70, a: 0.003, d: 0.16, vol: 0.22 });                      // «тело» заряда
  burst({ type: 'bandpass', f: 7000, f2: 1800, q: 1.2, a: 0.001, d: 0.12, vol: 0.2 });             // шипение
  burst({ type: 'bandpass', f: 1400, f2: 900, q: 1, a: 0.02, d: 0.25, vol: 0.12, delay: 0.03 });  // хвост
}

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

  // ---------- Оружие ----------

  // Выстрел: 'pm' | 'ak' | 'shotgun' | 'sniper' | 'blaster'; неизвестный id → ak
  gunshot: safe((id) => {
    if (id === 'blaster') { blaster(); return; }
    gun(Object.prototype.hasOwnProperty.call(GUNS, id) ? GUNS[id] : GUNS.ak);
  }),

  // Щелчок курка по пустому патроннику
  dryFire: safe(() => {
    clack(3400, 0.08, 0, 0.03);    // спуск
    clack(2600, 0.3, 0.03, 0.05);  // удар курка
  }),

  // Магазин: защёлка + выскальзывание
  magOut: safe(() => {
    clack(3000, 0.15, 0, 0.04);
    scrape(1600, 900, 0.16, 0.5, 0.03);
    burst({ type: 'lowpass', f: 500, a: 0.001, d: 0.05, vol: 0.2, delay: 0.18 }); // лёг в ладонь
  }),

  // Магазин: вход в шахту + «клак» защёлки
  magIn: safe(() => {
    scrape(900, 1500, 0.07, 0.4);
    clack(2000, 0.4, 0.07, 0.08);
    thump(180, 70, 0.06, 0.15, 0.07);
  }),

  // Затвор/рукоять назад и отпущена: два лязга ~120 мс
  slideRack: safe(() => {
    clack(2600, 0.22, 0, 0.05);            // назад до упора
    scrape(2200, 1600, 0.09, 0.35, 0.01);  // трение
    clack(2200, 0.4, 0.12, 0.08);          // вперёд — досылание
    thump(160, 60, 0.05, 0.12, 0.12);
  }),

  // Продольно-скользящий затвор: рукоять вверх + назад
  boltOpen: safe(() => {
    clack(3000, 0.18, 0, 0.04);            // поворот рукояти
    scrape(1900, 1200, 0.15, 0.45, 0.05);  // затвор назад
    clack(2300, 0.25, 0.2, 0.06);          // упор
  }),

  // Затвор вперёд + рукоять вниз
  boltClose: safe(() => {
    scrape(1200, 2000, 0.12, 0.45);        // затвор вперёд
    clack(2100, 0.32, 0.13, 0.07);         // досылание патрона
    clack(3200, 0.22, 0.24, 0.04);         // запирание
  }),

  // Помпа назад: «чк»
  pumpBack: safe(() => {
    scrape(900, 600, 0.08, 0.6);
    clack(1700, 0.35, 0.07, 0.06);
    thump(150, 60, 0.06, 0.15, 0.07);
  }),

  // Помпа вперёд: «чк»
  pumpForward: safe(() => {
    scrape(700, 1100, 0.07, 0.55);
    clack(2000, 0.38, 0.06, 0.06);
    thump(170, 70, 0.05, 0.14, 0.06);
  }),

  // Патрон дробовика в подствольный магазин
  shellIn: safe(() => {
    scrape(1300, 1800, 0.06, 0.35);
    burst({ type: 'bandpass', f: 1400, q: 1, a: 0.0005, d: 0.025, vol: 0.35, delay: 0.06 }); // глухой «тык» пластика
    metal(3100, [1, 1.6, 2.3], 0.05, 0.06, 0.065);                                            // пружина
  }),

  // Смена оружия: шорох + щелчок
  draw: safe(() => {
    burst({ type: 'bandpass', f: 1800, f2: 3200, q: 0.6, a: 0.06, d: 0.12, vol: 0.18 });
    burst({ type: 'bandpass', f: 900, q: 0.8, a: 0.03, d: 0.08, vol: 0.12, delay: 0.05 });
    clack(2800, 0.18, 0.2, 0.04);
  }),

  // Переводчик огня
  fireMode: safe(() => {
    clack(3400, 0.12, 0, 0.03);
    clack(2900, 0.16, 0.035, 0.035);
  }),

  // Гильза упала: 'brass' — звонкие отскоки, 'shell' — глухой пластик
  casing: safe((kind) => {
    if (kind === 'shell') {
      const k = rnd(0.9, 1.1);
      burst({ type: 'lowpass', f: 900 * k, a: 0.0008, d: 0.04, vol: 0.4 });
      sweep({ type: 'sine', f: 320 * k, f2: 140, a: 0.001, d: 0.05, vol: 0.1 });
      metal(1200 * k, [1, 2.3], 0.03, 0.04);                                         // латунное донце
      burst({ type: 'lowpass', f: 800 * k, a: 0.0008, d: 0.03, vol: 0.2, delay: 0.1 }); // отскок
      return;
    }
    // латунь: 2–3 быстрых отскока, каждый тише, короче и чаще
    const base = rnd(3600, 4600);
    const n = Math.random() < 0.5 ? 2 : 3;
    let t = 0;
    for (let i = 0; i < n; i++) {
      const v = 0.12 / (1 + i * 0.9);
      metal(base * rnd(0.97, 1.03), [1, 1.73, 2.61, 3.4], v, 0.12 / (1 + i * 0.5), t);
      burst({ type: 'highpass', f: 5000, a: 0.0003, d: 0.004, vol: v * 1.2, delay: t });
      t += 0.12 / (1 + i * 0.7);
    }
  }),

  // Попадание в стальную пластину: звон ~1 с, громкость падает с расстоянием,
  // звук приходит через distance / 343 сек
  plateHit: safe((distance) => {
    const dist = Math.max(0, Number(distance) || 0);
    const delay = dist / 343;
    const v = 0.5 / (1 + dist / 25);
    const maxF = 3500 + 10000 / (1 + dist / 30); // воздух глушит верхи
    burst({ type: 'highpass', f: 2500, a: 0.0005, d: 0.006, vol: v * 0.8, delay });     // удар пули
    burst({ type: 'bandpass', f: 700, q: 1, a: 0.001, d: 0.03, vol: v * 0.6, delay });  // «шлёп» по стали
    metal(rnd(1000, 1150), [1, 1.59, 2.14, 2.3, 2.65, 2.92, 3.5, 4.06, 5.4, 6.2], v, 1.4, delay, maxF);
  }),

  // Попадание пули: 'ground' | 'pillar' | 'target'
  impact: safe((kind) => {
    if (kind === 'pillar') {
      // рикошет: щелчок, металлический «пинг», короткий нисходящий визг
      burst({ type: 'highpass', f: 3000, a: 0.0005, d: 0.006, vol: 0.3 });
      metal(rnd(1900, 2400), [1, 1.41, 2.03, 2.8], 0.14, 0.3);
      const f = rnd(3200, 4200);
      sweep({ type: 'sine', f, f2: f * 0.4, a: 0.01, d: 0.32, vol: 0.06, delay: 0.015 });
      sweep({ type: 'triangle', f: f * 1.01, f2: f * 0.41, a: 0.01, d: 0.28, vol: 0.02, delay: 0.015 });
      return;
    }
    if (kind === 'target') {
      // стеклянный кристальный треск + осколки
      burst({ type: 'highpass', f: 4000, a: 0.0005, d: 0.03, vol: 0.3 });
      metal(rnd(2400, 2800), [1, 2.32, 3.87, 5.1], 0.12, 0.22);
      for (let i = 1; i <= 3; i++) {
        burst({ type: 'bandpass', f: rnd(5000, 8000), q: 4, a: 0.0005, d: 0.012, vol: 0.25, delay: i * rnd(0.02, 0.035) });
      }
      return;
    }
    // земля: глухой удар + шорох земли
    thump(170, 55, 0.08, 0.22);
    burst({ type: 'lowpass', f: 500, a: 0.001, d: 0.06, vol: 0.6 });
    burst({ type: 'bandpass', f: 3000, f2: 1800, q: 0.6, a: 0.005, d: 0.18, vol: 0.15, delay: 0.01 });
  }),

  // ---------- Игрок ----------

  // Шаг по твёрдому полу (бег — громче и ярче)
  footstep: safe((sprint) => {
    const k = rnd(0.88, 1.12);
    const v = rnd(0.8, 1.15) * (sprint ? 1.6 : 1);
    thump(95 * k, 50, 0.06, 0.1 * v);                                         // пятка
    burst({ type: 'lowpass', f: 380 * k, a: 0.002, d: 0.05, vol: 0.35 * v });  // подошва
    burst({
      type: 'bandpass', f: (sprint ? 2600 : 1700) * k, q: 0.9, a: 0.004,
      d: sprint ? 0.05 : 0.035, vol: (sprint ? 0.1 : 0.05) * v, delay: 0.012,
    }); // шарканье
  }),

  // Прыжок: свист ткани + короткий выдох усилия
  jump: safe(() => {
    burst({ type: 'bandpass', f: 700, f2: 2200, q: 0.7, a: 0.05, d: 0.12, vol: 0.18 });
    burst({ type: 'bandpass', f: 550, q: 2.5, a: 0.015, d: 0.08, vol: 0.12 });
  }),

  // Приземление: strength 0..1 — громкость удара
  land: safe((strength) => {
    const s = strength == null ? 0.5 : Math.min(1, Math.max(0, Number(strength) || 0));
    const v = 0.3 + 0.7 * s;
    thump(110, 38, 0.12 + 0.06 * s, 0.35 * v);
    burst({ type: 'lowpass', f: 450, a: 0.002, d: 0.08 + 0.04 * s, vol: 0.7 * v });
    burst({ type: 'bandpass', f: 1600, q: 0.8, a: 0.005, d: 0.07, vol: 0.12 * v, delay: 0.01 });             // подошвы
    burst({ type: 'bandpass', f: 2400, f2: 1200, q: 0.6, a: 0.02, d: 0.1, vol: 0.06 * v, delay: 0.02 });    // одежда
  }),

  // Перегрев бластера: тревожные бипы + шипение пара
  overheat: safe(() => {
    for (let i = 0; i < 4; i++) tone(i % 2 ? 660 : 990, 0.09, 'square', 0.045, 0, i * 0.13);
    burst({ type: 'highpass', f: 3500, a: 0.08, d: 0.9, vol: 0.09, delay: 0.05 });
    burst({ type: 'bandpass', f: 6000, f2: 3000, q: 1, a: 0.05, d: 0.8, vol: 0.1, delay: 0.05 });
  }),

  // Бластер остыл: короткое шипение
  vent: safe(() => {
    burst({ type: 'bandpass', f: 7000, f2: 2500, q: 0.8, a: 0.015, d: 0.35, vol: 0.18 });
    burst({ type: 'highpass', f: 5000, a: 0.01, d: 0.2, vol: 0.05 });
  }),

  // Прицел/зум: тихий щелчок
  scopeIn: safe(() => {
    clack(4200, 0.06, 0, 0.025);
    burst({ type: 'bandpass', f: 3000, f2: 5000, q: 4, a: 0.02, d: 0.05, vol: 0.12, delay: 0.01 }); // механизм зума
    clack(3600, 0.045, 0.06, 0.02);
  }),

  // Задержка дыхания: тихий вдох (шум растёт и светлеет)
  breathHold: safe(() => {
    burst({ type: 'bandpass', f: 700, f2: 1600, q: 1.2, a: 0.5, d: 0.2, vol: 0.12 });
    burst({ type: 'highpass', f: 3000, a: 0.45, d: 0.15, vol: 0.02 });
  }),

  // Выдох: шум гаснет и темнеет
  breathOut: safe(() => {
    burst({ type: 'bandpass', f: 1300, f2: 450, q: 1, a: 0.06, d: 0.75, vol: 0.12 });
    burst({ type: 'highpass', f: 2500, a: 0.05, d: 0.4, vol: 0.015 });
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
      musicGain.gain.linearRampToValueAtTime(MUSIC_VOL * volMusic, c.currentTime + 0.1);
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

// ---------- Громкость ----------
const clamp01 = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d;
};

// плавно (50 мс) к новому значению — без щелчков
function rampTo(param, v, t) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(param.value, t);
  param.linearRampToValueAtTime(v, t + 0.05);
}

// Громкость музыки и эффектов, 0..1. Без AudioContext значения запоминаются
// и применяются, когда он создастся.
export function setVolumes({ music: m, sfx: s } = {}) {
  try {
    if (m !== undefined) volMusic = clamp01(m, volMusic);
    if (s !== undefined) volSfx = clamp01(s, volSfx);
    if (!ctx) return;
    const t = ctx.currentTime;
    if (sfxBus) rampTo(sfxBus.gain, volSfx, t);
    if (musicGain) rampTo(musicGain.gain, MUSIC_VOL * volMusic, t); // во время stop() musicGain уже null
  } catch (e) { /* звук не должен ломать игру */ }
}

// ---------- Общий доступ для js/fantasy/audio.js ----------

// Текущая громкость музыки: MUSIC_VOL × «музыка» из setVolumes
export function musicVolume() {
  return MUSIC_VOL * volMusic;
}

// Общий кэшированный буфер белого шума (null — нет Web Audio)
export function noiseBuffer() {
  try {
    const c = ac();
    return c ? getNoiseBuf(c) : null;
  } catch (e) { return null; }
}

// Общий контекст и шины (контекст создаётся лениво через ac()):
// эффекты → sfxBus, музыка → master с громкостью musicVolume()
export function audioCore() {
  try {
    const c = ac();
    if (!c) return null;
    return { ctx: c, master, sfxBus, musicVolume, noise: getNoiseBuf(c) };
  } catch (e) { return null; }
}
