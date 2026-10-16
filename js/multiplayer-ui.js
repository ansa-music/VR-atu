import { MULTIPLAYER_SERVER_URL } from './server-config.js';
// Optional multiplayer lobby UI. The existing single-player button stays unchanged.
const $ = id => document.getElementById(id);
const status = $('mp-status');
const panel = $('mp-panel');
const list = $('mp-players');
const codeView = $('mp-code');
const start = $('mp-start');
const inputName = $('mp-name');
const inputCode = $('mp-join-code');
const inputServer = $('mp-server');
const serverUrl = MULTIPLAYER_SERVER_URL.trim();
let myId = null;
let room = null;

function showStatus(value) { if (status) status.textContent = value; }
function render() {
  if (!room) {
    panel.hidden = false;
    list.textContent = '';
    if ($('mp-ranking')) $('mp-ranking').textContent = '';
    codeView.textContent = '—';
    start.hidden = true;
    return;
  }
  codeView.textContent = room.code;
  panel.hidden = true;
  list.replaceChildren(...room.players.map(p => {
    const line = document.createElement('div');
    line.textContent = (p.id === room.hostId ? '★ ' : '') + p.name + (p.id === myId ? ' (вы)' : '');
    return line;
  }));
  start.hidden = myId !== room.hostId;
  start.disabled = room.phase === 'playing';
  showStatus(room.phase === 'playing' ? 'Раунд запущен (демо сетевого лобби)' : room.phase === 'finished' ? 'Раунд завершён' : 'Комната создана. Пригласите друзей по коду.');
}
function submit(action) {
  const url = serverUrl || inputServer.value.trim();
  if (!/^wss?:\/\//i.test(url)) { showStatus('Сервер ещё не опубликован. Для тестов откройте дополнительные настройки и укажите URL.'); return; }
  if (location.protocol === 'https:' && !url.startsWith('wss://')) {
    showStatus('На HTTPS-сайте нужен защищённый сервер wss://');
    return;
  }
  if (action === 'join' && !/^[A-Z2-9]{6}$/i.test(inputCode.value.trim())) {
    showStatus('Введите шестизначный код комнаты');
    return;
  }
  showStatus('Подключение…');
  window.dispatchEvent(new CustomEvent('mp:configure', { detail: {
    action, url, code: inputCode.value.trim().toUpperCase(), name: inputName.value.trim(),
  } }));
}
$('mp-create')?.addEventListener('click', () => submit('create'));
$('mp-join')?.addEventListener('click', () => submit('join'));
start?.addEventListener('click', () => window.dispatchEvent(new Event('mp:start-round')));
$('mp-leave')?.addEventListener('click', () => window.dispatchEvent(new Event('mp:leave')));
window.addEventListener('mp:room:joined', e => { myId = e.detail.playerId; room = e.detail.room; render(); });
window.addEventListener('mp:room:update', e => { room = e.detail.room; render(); });
window.addEventListener('mp:room:left', () => { room = null; myId = null; render(); showStatus('Вы вышли из комнаты'); });
window.addEventListener('mp:status', e => { if (e.detail.state === 'disconnected') { room = null; render(); showStatus('Соединение прервано'); } });
window.addEventListener('mp:scoreboard', e => {
  const box = $('mp-ranking');
  if (!box) return;
  const { players, phase, remaining } = e.detail;
  const title = document.createElement('strong');
  title.textContent = phase === 'playing' ? 'Сетевой раунд · ' + remaining + ' сек.' : 'Результаты';
  const ranking = players.map((p, i) => {
    const item = document.createElement('div');
    item.textContent = (i + 1) + '. ' + p.name + ' — ' + p.score + ' очков (' + p.hits + '/' + p.shots + ')';
    return item;
  });
  box.replaceChildren(title, ...ranking);
});
window.addEventListener('mp:error', e => { showStatus('Ошибка сети: ' + (e.detail.code || 'UNKNOWN')); });
render();

if (serverUrl && inputServer) { inputServer.value = serverUrl; inputServer.disabled = true; showStatus('Сервер настроен — создайте комнату или войдите по коду.'); }
