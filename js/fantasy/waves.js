// Режимы боя «Арены магов»: «Испытание духов», «Волны», «Дуэль с боссом».
// Режиссёр только расставляет противников (enemies.spawn) и следит за счётом волн;
// очки, звук и интерфейс — в main.js по событиям.

export const MODES = [
  { id: 'trial', name: 'Испытание духов', hint: 'Сбей как можно больше духов за минуту. Не трогай черепа!' },
  { id: 'waves', name: 'Волны', hint: 'Отбивай волны нечисти. Каждая пятая — босс.' },
  { id: 'boss', name: 'Дуэль с боссом', hint: 'Каменный колосс. Бей в лавовое ядро, отражай огненные шары.' },
];
export const MODE_NAME = Object.fromEntries(MODES.map((m) => [m.id, m.name]));

const HOSTILE = ['wisp', 'guardian', 'eye', 'boss'];   // их надо победить, чтобы закрыть волну
const MAX_QUEUE = 64;
const TRIAL_TIME = 60;
const WAVES_TOTAL = 10;
const MAX_HP = 10;

// Состав волны n (1..): сколько каждого типа
export function waveRecipe(n, out = {}) {
  const boss = n % 5 === 0;
  out.boss = boss ? 1 : 0;
  out.wisp = boss ? 2 : 3 + n;
  out.eye = boss ? 2 : Math.floor(n / 2);
  out.guardian = boss ? 0 : n >= 3 ? 1 + Math.floor((n - 3) / 3) : 0;
  out.skull = 1 + Math.floor(n / 3);
  out.fairy = 1 + (n >= 4 ? 1 : 0);
  return out;
}

export function createWaveDirector(enemies, { rng = Math.random, roundTime = TRIAL_TIME, wavesTotal = WAVES_TOTAL, maxHp = MAX_HP } = {}) {
  const queue = new Array(MAX_QUEUE).fill(null);   // типы в очереди спавна
  let qHead = 0, qLen = 0;
  const events = [];
  const evPool = [];
  let evUsed = 0;
  const recipe = {};
  let spawnT = 0, pause = 0, t = 0, timers = { a: 0, b: 0, c: 0 };
  let bossSeen = false;

  const d = {
    mode: null, running: false,
    wave: 0, wavesTotal,
    timeLeft: 0, elapsed: 0,
    hp: maxHp, maxHp,
    get label() { return MODE_NAME[d.mode] || ''; },
    get queued() { return qLen; },

    start(mode = 'trial') {
      if (!MODE_NAME[mode]) mode = 'trial';
      d.stop();
      d.mode = mode; d.running = true;
      d.wave = 0; d.hp = maxHp; d.elapsed = 0; t = 0;
      d.timeLeft = mode === 'trial' ? roundTime : Infinity;
      pause = 0; spawnT = 0; timers.a = 0.3; timers.b = 4; timers.c = 3; bossSeen = false;
      pending.start = true;
      return true;
    },

    stop() {
      d.running = false;
      qHead = qLen = 0;
      enemies.clear();
    },

    // урон игроку (огненный шар). Возвращает оставшееся здоровье.
    damagePlayer(n = 1) {
      if (!d.running) return d.hp;
      d.hp = Math.max(0, d.hp - n);
      return d.hp;
    },
    heal(n = 1) { d.hp = Math.min(maxHp, d.hp + n); return d.hp; },

    // dt — реальное время; timeScale — замедление мира (спавн и таймер режима тоже замедляются)
    update(dt, { timeScale = 1 } = {}) {
      evUsed = 0;
      events.length = 0;
      if (!d.running) return events;
      const w = dt * timeScale;
      d.elapsed += w;
      t += w;
      if (pending.start) {
        pending.start = false;
        if (d.mode === 'waves') nextWave();
        else push('wave-start', d.mode === 'boss' ? 1 : 0);
        if (d.mode === 'boss') { timers.a = 2; }
      }
      if (d.hp <= 0) return finish('defeat');

      if (d.mode === 'trial') trial(w);
      else if (d.mode === 'waves') waves(w);
      else boss(w);
      return events;
    },
  };
  const pending = { start: false };

  function push(type, wave = d.wave) {
    let e = evPool[evUsed];
    if (!e) { e = { type: '', wave: 0, mode: '', label: '' }; evPool.push(e); }
    evUsed++;
    e.type = type; e.wave = wave; e.mode = d.mode;
    e.label = type === 'wave-start' ? (d.mode === 'waves' ? `Волна ${wave}` : d.label)
      : type === 'wave-clear' ? `Волна ${wave} пройдена`
      : type === 'boss' ? 'Каменный колосс'
      : type === 'victory' ? 'Победа!' : type === 'defeat' ? 'Поражение' : '';
    events.push(e);
    return e;
  }

  function finish(type) {
    push(type);
    d.running = false;
    qHead = qLen = 0;
    return events;
  }

  function enqueue(type, n) {
    for (let i = 0; i < n && qLen < MAX_QUEUE; i++) {
      queue[(qHead + qLen) % MAX_QUEUE] = type;
      qLen++;
    }
  }

  // перемешать очередь, чтобы типы шли вперемешку (босс — первым)
  function shuffleQueue() {
    for (let i = qLen - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const a = (qHead + i) % MAX_QUEUE, b = (qHead + j) % MAX_QUEUE;
      const x = queue[a]; queue[a] = queue[b]; queue[b] = x;
    }
    for (let i = 0; i < qLen; i++) {
      const a = (qHead + i) % MAX_QUEUE;
      if (queue[a] === 'boss') { const x = queue[qHead]; queue[qHead] = 'boss'; queue[a] = x; break; }
    }
  }

  function spawnFromQueue(w, interval) {
    if (!qLen) return;
    spawnT -= w;
    if (spawnT > 0) return;
    spawnT = interval;
    const type = queue[qHead];
    queue[qHead] = null;
    qHead = (qHead + 1) % MAX_QUEUE;
    qLen--;
    enemies.spawn(type);
  }

  function hostileLeft() {
    let n = 0;
    for (let i = 0; i < HOSTILE.length; i++) n += enemies.countOf(HOSTILE[i]);
    for (let i = 0; i < qLen; i++) if (HOSTILE.indexOf(queue[(qHead + i) % MAX_QUEUE]) >= 0) n++;
    return n;
  }

  // --- «Испытание духов»: минута, духи появляются постоянно ---
  function trial(w) {
    d.timeLeft = Math.max(0, d.timeLeft - w);
    if (d.timeLeft <= 0) { finish('victory'); return; }
    const k = 1 - d.timeLeft / roundTime;          // к концу темп растёт
    timers.a -= w;
    if (timers.a <= 0) { timers.a = 1.3 - 0.6 * k; if (enemies.countOf('wisp') < 4 + Math.round(3 * k)) enemies.spawn('wisp'); }
    timers.b -= w;
    if (timers.b <= 0) { timers.b = 5 + rng() * 3; enemies.spawn('fairy'); }
    timers.c -= w;
    if (timers.c <= 0) { timers.c = 4 + rng() * 2; if (enemies.countOf('skull') < 3) enemies.spawn('skull'); }
  }

  // --- «Волны» ---
  function nextWave() {
    d.wave++;
    waveRecipe(d.wave, recipe);
    qHead = qLen = 0;
    if (recipe.boss) { enqueue('boss', 1); push('boss'); }
    enqueue('wisp', recipe.wisp); enqueue('eye', recipe.eye); enqueue('guardian', recipe.guardian);
    enqueue('skull', recipe.skull); enqueue('fairy', recipe.fairy);
    shuffleQueue();
    spawnT = 1;
    push('wave-start');
  }

  function waves(w) {
    if (pause > 0) {
      pause -= w;
      if (pause <= 0) nextWave();
      return;
    }
    spawnFromQueue(w, Math.max(0.35, 0.9 - d.wave * 0.05));
    if (hostileLeft() === 0) {
      push('wave-clear');
      if (d.wave >= wavesTotal) { finish('victory'); return; }
      d.heal(1);
      pause = 3;
    }
  }

  // --- «Дуэль с боссом» ---
  function boss(w) {
    if (!bossSeen) {
      timers.a -= w;
      if (timers.a <= 0) {
        if (enemies.spawn('boss')) { bossSeen = true; push('boss'); timers.b = 8; timers.c = 15; }
        else timers.a = 0.5;
      }
      return;
    }
    if (!enemies.boss) { finish('victory'); return; }
    timers.b -= w;
    if (timers.b <= 0) { timers.b = 8; if (enemies.countOf('eye') < 2) enemies.spawn('eye'); }
    timers.c -= w;
    if (timers.c <= 0) { timers.c = 15; if (enemies.countOf('guardian') < 1) enemies.spawn('guardian'); }
  }

  return d;
}
