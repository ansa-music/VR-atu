import { MULTIPLAYER_SERVER_URL } from './server-config.js';

// Совместимо со старой разметкой, оставшейся в кеше браузера.
const $ = id => document.getElementById(id);
const serverUrl = MULTIPLAYER_SERVER_URL.trim();
let room = null, myId = null, mode = 'create', connecting = false;

const status = $('mp-status');
const panel = $('mp-panel');
const lobby = $('mp-lobby');
const code = $('mp-code');
const players = $('mp-players');
const start = $('mp-start');
const serverField = $('mp-server');
const nameField = $('mp-name');
const joinCodeField = $('mp-join-code');
const createButton = $('mp-create');
const joinButton = $('mp-join');
const createFields = $('mp-create-fields');
const joinFields = $('mp-join-fields');
const createTab = $('mp-mode-create');
const joinTab = $('mp-mode-join');
const errorLabels = {
  CODE_TAKEN: 'Код уже занят. Укажите другой или оставьте поле пустым.',
  ROOM_NOT_FOUND: 'Комната не найдена. Проверьте код.',
  ROOM_FULL: 'Комната заполнена.',
  ROUND_IN_PROGRESS: 'Раунд уже идёт. Подождите следующего.',
  HOST_ONLY: 'Начать раунд может только создатель комнаты.',
  INVALID_CODE: 'Введите ровно три цифры: например, 123.',
  ALREADY_IN_ROOM: 'Вы уже находитесь в комнате.',
  NOT_IN_ROOM: 'Сначала подключитесь к комнате.',
  CONNECTION_FAILED: 'Не удалось подключиться к серверу. Повторите попытку.',
  NETWORK_ERROR: 'Ошибка сети. Проверьте интернет.',
};

function showStatus(message) {
  if (status) status.textContent = message;
}
function showMode(next) {
  mode = next;
  // Новая разметка: две вкладки. Старая: две кнопки без вкладок.
  if (createFields && joinFields) {
    createFields.hidden = next !== 'create';
    joinFields.hidden = next !== 'join';
  }
  createTab?.setAttribute('aria-pressed', String(next === 'create'));
  joinTab?.setAttribute('aria-pressed', String(next === 'join'));
}
function render() {
  if (!room) {
    if (panel) panel.hidden = false;
    if (lobby) lobby.hidden = true;
    if (players) players.replaceChildren();
    if (code) code.textContent = '—';
    if (start) start.hidden = true;
    $('mp-ranking')?.replaceChildren();
    return;
  }
  if (panel) panel.hidden = true;
  if (lobby) lobby.hidden = false;
  if (code) code.textContent = room.code;
  const title = $('mp-room-title');
  if (title) title.textContent = room.title || 'Комната ATU';
  const info = $('mp-room-info');
  if (info) info.textContent = (room.players?.length || 0) + '/' + (room.maxPlayers || 8) +
    ' игроков · ' + (room.durationSec || 60) + ' секунд';
  if (players) {
    players.replaceChildren(...(room.players || []).map(p => {
      const row = document.createElement('div');
      row.textContent = (p.id === room.hostId ? '★ ' : '') + p.name + (p.id === myId ? ' (вы)' : '');
      return row;
    }));
  }
  if (start) {
    start.hidden = myId !== room.hostId;
    start.disabled = room.phase === 'playing';
  }
  showStatus(room.phase === 'playing' ? 'Раунд идёт.' :
    room.phase === 'finished' ? 'Раунд завершён. Можно начать снова.' :
      'Комната готова. Пригласите друзей по коду.');
}
function setBusy(busy) {
  connecting = busy;
  if (createButton) createButton.disabled = busy;
  if (joinButton) joinButton.disabled = busy;
}
function submit(action) {
  if (connecting) return;
  const url = serverUrl || serverField?.value.trim() || '';
  if (!/^wss?:\/\//i.test(url)) {
    showStatus('Адрес сервера не настроен.');
    return;
  }
  if (location.protocol === 'https:' && !url.startsWith('wss://')) {
    showStatus('Для защищённой страницы требуется сервер wss://');
    return;
  }
  const joinCode = joinCodeField?.value.trim() || '';
  const ownCode = $('mp-custom-code')?.value.trim() || '';
  if (action === 'join' && !/^\d{3}$/.test(joinCode)) {
    showStatus('Укажите код из трёх цифр, например 123.');
    joinCodeField?.focus();
    return;
  }
  if (action === 'create' && ownCode && !/^\d{3}$/.test(ownCode)) {
    showStatus('Свой код должен состоять из трёх цифр.');
    $('mp-custom-code')?.focus();
    return;
  }
  setBusy(true);
  showStatus('Подключаемся к серверу…');
  window.dispatchEvent(new CustomEvent('mp:configure', {detail: {
    action, url, code: joinCode, name: nameField?.value.trim() || '',
    options: action === 'create' ? {
      code: ownCode,
      title: $('mp-title')?.value.trim() || 'Комната ATU',
      maxPlayers: Number($('mp-max-players')?.value || 8),
      durationSec: Number($('mp-duration')?.value || 60),
    } : {},
  }}));
  // Не оставлять кнопки навсегда заблокированными при ошибках сети.
  window.setTimeout(() => {
    if (connecting && !room) {
      setBusy(false);
      showStatus('Ответ сервера задерживается. Попробуйте ещё раз.');
    }
  }, 18000);
}

createTab?.addEventListener('click', () => showMode('create'));
joinTab?.addEventListener('click', () => showMode('join'));
createButton?.addEventListener('click', () => submit('create'));
joinButton?.addEventListener('click', () => submit('join'));
start?.addEventListener('click', () => window.dispatchEvent(new Event('mp:start-round')));
$('mp-leave')?.addEventListener('click', () => window.dispatchEvent(new Event('mp:leave')));
$('mp-copy-code')?.addEventListener('click', async () => {
  if (!room) return;
  try {
    await navigator.clipboard.writeText(room.code);
    showStatus('Код скопирован: ' + room.code);
  } catch {
    showStatus('Ваш код: ' + room.code);
  }
});

window.addEventListener('mp:room:joined', e => {
  setBusy(false);
  myId = e.detail.playerId;
  room = e.detail.room;
  render();
});
window.addEventListener('mp:room:update', e => {
  room = e.detail.room;
  render();
});
window.addEventListener('mp:room:left', () => {
  setBusy(false); room = null; myId = null; render(); showStatus('Вы вышли из комнаты.');
});
window.addEventListener('mp:status', e => {
  if (e.detail.state === 'disconnected') {
    setBusy(false);
    room = null; myId = null; render();
    showStatus('Связь с сервером прервана.');
  }
});
window.addEventListener('mp:scoreboard', e => {
  const box = $('mp-ranking');
  if (!box) return;
  const {players: standings = [], phase, remaining} = e.detail;
  const headline = document.createElement('strong');
  headline.textContent = phase === 'playing' ? 'До конца раунда: ' + remaining + ' с' : 'Таблица результатов';
  const rows = standings.map((p, i) => {
    const row = document.createElement('div');
    row.textContent = (i + 1) + '. ' + p.name + ' — ' + p.score + ' очков';
    return row;
  });
  box.replaceChildren(headline, ...rows);
});
window.addEventListener('mp:error', e => {
  setBusy(false);
  showStatus(errorLabels[e.detail?.code] || 'Ошибка подключения: ' + (e.detail?.code || 'неизвестная'));
});

showMode('create');
render();
if (serverUrl && serverField) {
  serverField.value = serverUrl;
  serverField.disabled = true;
  showStatus('Готово. Можно создавать комнату или подключаться по коду.');
}
