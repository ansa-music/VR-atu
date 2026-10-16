// mk.js — геймпад на микроконтроллере (Arduino) через Web Serial API
const BAUD = 115200;
const TIMEOUT_MS = 500;   // нет строк J дольше этого — обнуляем ввод
const PING_DELAY = 1500;  // Uno перезагружается при открытии порта
const supported = typeof navigator !== 'undefined' && 'serial' in navigator;
const enc = new TextEncoder();
const clamp = (v) => Math.max(-100, Math.min(100, v));

let port = null, reader = null, writer = null, pipeDone = null;
let watchdog = 0, pingTimer = 0, lastJ = 0;
let busy = false;                  // идёт выбор/открытие порта
let closing = Promise.resolve();   // закрытие предыдущего порта

function status(text) {
  if (typeof mk.onStatus === 'function') {
    try { mk.onStatus(text, mk.connected); } catch (e) { console.error(e); }
  }
}

// Разбор одной строки от Arduino
function parse(line) {
  if (line === 'OK,VR_TIR_MK') { status('МК подключён ✓'); return; }
  const a = line.split(',');
  if (a.length < 4 || a[0] !== 'J') return;
  const x = parseInt(a[1], 10), y = parseInt(a[2], 10), b = parseInt(a[3], 10);
  if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(b)) return;
  lastJ = performance.now();
  mk.x = clamp(x) / 100;
  mk.y = clamp(y) / 100;
  const was = mk.btn;
  mk.btn = b > 0;
  if (mk.btn && !was && typeof mk.onButtonDown === 'function') {
    try { mk.onButtonDown(); } catch (e) { console.error(e); }
  }
}

async function readLoop(p, r) {
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await r.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        parse(buf.slice(0, i).trim());
        buf = buf.slice(i + 1);
      }
      if (buf.length > 256) buf = '';  // мусор без перевода строки
    }
  } catch (e) { /* ошибка чтения — например, выдернут кабель */ }
  cleanup(p);
}

// Освобождаем всё и закрываем порт (безопасно вызывать повторно)
function cleanup(p) {
  if (!port || p !== port) return closing;
  const r = reader, w = writer, pd = pipeDone;
  port = reader = writer = pipeDone = null;
  clearInterval(watchdog);
  clearTimeout(pingTimer);
  mk.connected = false;
  mk.x = 0; mk.y = 0; mk.btn = false;
  closing = (async () => {
    try { if (r) await r.cancel(); } catch (e) {}
    try { if (pd) await pd; } catch (e) {}
    try { if (r) r.releaseLock(); } catch (e) {}
    try { if (w) w.releaseLock(); } catch (e) {}
    try { await p.close(); } catch (e) {}
    status('МК отключён');
  })();
  return closing;
}

async function openPort(p, quiet) {
  try {
    await closing;
    await p.open({ baudRate: BAUD });
  } catch (e) {
    if (!quiet) status('МК: не удалось открыть порт (занят?)');
    return;
  }
  port = p;
  try {
    writer = p.writable.getWriter();
    const dec = new TextDecoderStream();
    pipeDone = p.readable.pipeTo(dec.writable).catch(() => {});
    reader = dec.readable.getReader();
  } catch (e) {
    await cleanup(p);
    return;
  }
  mk.connected = true;
  lastJ = performance.now();
  watchdog = setInterval(() => {
    if (performance.now() - lastJ > TIMEOUT_MS) { mk.x = 0; mk.y = 0; mk.btn = false; }
  }, 100);
  pingTimer = setTimeout(() => mk.send('P'), PING_DELAY);
  status('МК: порт открыт, жду данные…');
  readLoop(p, reader);
}

if (supported) {
  navigator.serial.addEventListener('disconnect', (e) => {
    if (e.target === port) cleanup(port);
  });
}

export const mk = {
  supported,
  connected: false,
  x: 0, y: 0,
  btn: false,
  onButtonDown: null,
  onStatus: null,

  // Вызывать только из пользовательского жеста
  async connect() {
    if (!supported) { status('Web Serial не поддерживается — открой игру в Chrome или Edge на ПК'); return; }
    if (mk.connected || busy) return;
    busy = true;
    try {
      let p;
      try {
        p = await navigator.serial.requestPort();
      } catch (e) {
        status(e && e.name === 'NotFoundError' ? 'Порт не выбран' : 'МК: ошибка выбора порта');
        return;
      }
      await openPort(p, false);
    } finally { busy = false; }
  },

  // Тихое подключение к ранее разрешённому порту
  async autoConnect() {
    if (!supported || mk.connected || busy) return;
    busy = true;
    try {
      const ports = await navigator.serial.getPorts();
      if (ports.length) await openPort(ports[0], true);
    } catch (e) {
    } finally { busy = false; }
  },

  async disconnect() { await cleanup(port); },

  // Команда в МК: H, G, B, S, E, P
  send(cmd) {
    if (!mk.connected || !writer || !cmd) return;
    try {
      writer.write(enc.encode(String(cmd).charAt(0))).catch(() => {});
    } catch (e) {}
  },
};
