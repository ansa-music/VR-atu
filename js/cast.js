// js/cast.js — «экран зрителя» по Wi-Fi без аккаунтов и кабелей.
// Игра (шлем) передаёт позу головы и рук, оружие, время суток и существ ~30 раз в секунду
// по прямому WebRTC-каналу; страница на ПК рисует тот же мир глазами игрока.
// Соединение ищется по коду через публичный сервер PeerJS (0.peerjs.com) — через него идут только
// служебные сообщения знакомства; данные игры идут напрямую между устройствами.

const PREFIX = 'vr-atu-cast-';
const CODE_KEY = 'vr-atu-cast-code';
let peerLib = null;

function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (peerLib) return peerLib;
  peerLib = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/peerjs.min.js', import.meta.url).href;
    s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS не загрузился')));
    s.onerror = () => reject(new Error('PeerJS не загрузился'));
    document.head.appendChild(s);
  });
  return peerLib;
}

/** Постоянный 6-значный код этого устройства. */
export function castCode() {
  let c = null;
  try { c = localStorage.getItem(CODE_KEY); } catch {}
  if (!/^\d{6}$/.test(c || '')) {
    c = String(100000 + Math.floor(Math.random() * 900000));
    try { localStorage.setItem(CODE_KEY, c); } catch {}
  }
  return c;
}

/** Передатчик: принимает зрителей, send(state) рассылает всем открытым каналам. */
export function createCastSender({ onStatus = () => {}, onViewer = () => {} } = {}) {
  let peer = null, code = castCode(), started = false, tries = 0;
  const conns = new Set();
  function start() {
    if (started) return;
    started = true;
    loadPeer().then((Peer) => {
      peer = new Peer(PREFIX + code, { debug: 0 });
      peer.on('open', () => onStatus('ready', code));
      peer.on('connection', (conn) => {
        conn.on('open', () => { conns.add(conn); onViewer(conns.size); });
        conn.on('close', () => { conns.delete(conn); onViewer(conns.size); });
        conn.on('error', () => { conns.delete(conn); onViewer(conns.size); });
      });
      peer.on('error', (e) => {
        if (e?.type === 'unavailable-id' && tries++ < 3) {
          // код занят (например, вторая вкладка) — берём новый
          try { localStorage.removeItem(CODE_KEY); } catch {}
          code = castCode();
          peer.destroy();
          started = false;
          start();
          return;
        }
        onStatus('error', e?.type || String(e));
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch {} });
    }).catch((e) => onStatus('error', e.message));
  }
  return {
    start,
    get code() { return code; },
    get viewers() { return conns.size; },
    send(state) {
      if (!conns.size) return;
      for (const c of conns) if (c.open) { try { c.send(state); } catch {} }
    },
  };
}

/** Зритель: подключается по коду, onState(state) на каждое сообщение. */
export function createCastViewer(code, { onState = () => {}, onStatus = () => {} } = {}) {
  let peer = null, conn = null, retry = null;
  function connect() {
    clearTimeout(retry);
    if (!peer || peer.destroyed) return;
    conn = peer.connect(PREFIX + code, { reliable: false, serialization: 'json' });
    conn.on('open', () => onStatus('connected'));
    conn.on('data', (d) => onState(d));
    conn.on('close', () => { onStatus('waiting'); retry = setTimeout(connect, 2000); });
    conn.on('error', () => { onStatus('waiting'); retry = setTimeout(connect, 2000); });
  }
  loadPeer().then((Peer) => {
    peer = new Peer({ debug: 0 });
    peer.on('open', () => { onStatus('waiting'); connect(); });
    peer.on('error', (e) => {
      if (e?.type === 'peer-unavailable') { onStatus('waiting'); retry = setTimeout(connect, 2500); return; }
      onStatus('error', e?.type || String(e));
    });
  }).catch((e) => onStatus('error', e.message));
  return { get code() { return code; } };
}
