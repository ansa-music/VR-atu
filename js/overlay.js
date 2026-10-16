// Стартовый экран / справка для десктопной страницы «VR Тир».
// Слушает события main.js: game:ready, game:state {state}, game:xr {active}.
// Отправляет game:start синхронно в обработчике клика (нужен user gesture для pointer lock).

const overlay = document.getElementById('overlay');
const play = document.getElementById('play');
const help = document.getElementById('help-btn');
const mkStatus = document.getElementById('mk-status');
const mkConnect = document.getElementById('mk-connect');

let ready = false;
let state = 'menu'; // 'menu' | 'countdown' | 'play' | 'over'
let xrActive = false;

const isRunning = () => state === 'countdown' || state === 'play';

function renderPlay() {
  if (!play) return;
  if (!ready) {
    play.disabled = true;
    play.textContent = 'Загрузка…';
    return;
  }
  play.disabled = false;
  play.textContent = isRunning() ? '▶ ПРОДОЛЖИТЬ' : '▶ ИГРАТЬ';
}

function setOpen(open) {
  if (!overlay) return;
  overlay.classList.toggle('is-hidden', !open);
  overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
  overlay.inert = !open;
  document.body.classList.toggle('ov-open', open);
  if (open) {
    renderPlay();
    if (ready && play) {
      try { play.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
    }
  }
}

// Клики по оверлею и «?» не должны долетать до canvas / обработчиков выстрела.
['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'click'].forEach((type) => {
  if (overlay) overlay.addEventListener(type, (e) => e.stopPropagation());
  if (help) help.addEventListener(type, (e) => e.stopPropagation());
});

if (play) {
  play.addEventListener('click', (e) => {
    e.stopPropagation();
    if (play.disabled) return;
    setOpen(false);
    window.dispatchEvent(new Event('game:start')); // синхронно, внутри жеста пользователя
    play.blur(); // чтобы Пробел (выстрел) не «нажимал» кнопку повторно
  });
}

if (help) {
  help.addEventListener('click', (e) => {
    e.stopPropagation();
    help.blur();
    if (xrActive) return;
    setOpen(true);
  });
}

if (mkConnect) {
  mkConnect.addEventListener('click', () => { setTimeout(() => mkConnect.blur(), 0); });
}

window.addEventListener('game:ready', () => {
  ready = true;
  renderPlay();
  if (overlay && !overlay.classList.contains('is-hidden') && play) {
    try { play.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
  }
});

window.addEventListener('game:state', (e) => {
  const s = e && e.detail && e.detail.state;
  if (s) state = s;
  if (isRunning()) setOpen(false);
  else renderPlay();
});

window.addEventListener('game:xr', (e) => {
  xrActive = !!(e && e.detail && e.detail.active);
  if (xrActive) setOpen(false);
});

// Длинный статус МК обрезается многоточием — показываем полный текст во всплывающей подсказке.
if (mkStatus && 'MutationObserver' in window) {
  const syncTitle = () => { mkStatus.title = mkStatus.textContent.trim(); };
  new MutationObserver(syncTitle).observe(mkStatus, { childList: true, characterData: true, subtree: true });
  syncTitle();
}

renderPlay();
