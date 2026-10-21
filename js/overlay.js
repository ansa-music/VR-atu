// Стартовый экран / справка для десктопной страницы «VR Тир».
// Слушает события main.js: game:ready, game:state {state}, game:xr {active}.
// Отправляет game:start синхронно в обработчике клика (нужен user gesture для pointer lock).

const overlay = document.getElementById('overlay');
const play = document.getElementById('play');
const help = document.getElementById('help-btn');
const mouseRelease = document.getElementById('mouse-release');
const resume = document.getElementById('menu-resume');
const mkStatus = document.getElementById('mk-status');
const mkConnect = document.getElementById('mk-connect');

let ready = false;
let state = 'menu'; // 'menu' | 'countdown' | 'play' | 'over'
let xrActive = false;
let inMultiplayerRoom = false;
let multiplayerPhase = 'lobby';

const isRunning = () => state === 'countdown' || state === 'play';
const canResume = () => inMultiplayerRoom ? multiplayerPhase === 'playing' : isRunning();

function renderPlay() {
  if (resume) {
    resume.hidden = !canResume();
    resume.textContent = inMultiplayerRoom ? '← Вернуться в матч' : '← Вернуться в игру';
  }
  if (!play) return;
  // Одиночный запуск никогда не показывается участникам сетевой комнаты.
  document.body.classList.toggle('mp-in-room', inMultiplayerRoom);
  play.hidden = inMultiplayerRoom;
  if (!ready) {
    play.disabled = true;
    play.textContent = worldMode ? 'Загрузка мира…' : 'Загрузка…';
    return;
  }
  play.disabled = false;
  play.textContent = worldMode ? '▶ ОТКРЫТЫЙ МИР' : isRunning() ? '▶ ПРОДОЛЖИТЬ ОДИНОЧНУЮ' : '▶ ОДИНОЧНАЯ ИГРА';
}

// открытый мир (?mode=world): ссылка на стартовом экране ведёт обратно в тир
const worldMode = typeof location !== 'undefined' && new URLSearchParams(location.search).get('mode') === 'world';
const worldLink = document.getElementById('world-link');
if (worldLink && worldMode) {
  worldLink.textContent = '← Обратно в тир';
  worldLink.href = './';
}

function setOpen(open) {
  if (!overlay) return;
  // Возвращаем курсор, когда открываем лобби после матча.
  if (open && document.pointerLockElement && document.exitPointerLock) {
    try { document.exitPointerLock(); } catch {}
  }
  overlay.classList.toggle('is-hidden', !open);
  overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
  overlay.inert = !open;
  document.body.classList.toggle('ov-open', open);
  if (open) {
    renderPlay();
    if (inMultiplayerRoom) {
      const target = canResume() ? resume : document.getElementById('mp-start');
      if (target && !target.hidden) target.focus({ preventScroll: true });
    }
    if (ready && play && !inMultiplayerRoom) {
      try { play.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
    }
  }
}

// Клики по оверлею и «?» не должны долетать до canvas / обработчиков выстрела.
['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'click'].forEach((type) => {
  if (overlay) overlay.addEventListener(type, (e) => e.stopPropagation());
  if (help) help.addEventListener(type, (e) => e.stopPropagation());
  mouseRelease?.addEventListener(type, e => e.stopPropagation());
});

if (play) {
  play.addEventListener('click', (e) => {
    e.stopPropagation();
    if (play.disabled || inMultiplayerRoom) return;
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

mouseRelease?.addEventListener('click', () => { if (!xrActive) setOpen(true); });

function resumeGame() {
  if (!canResume() || xrActive) return;
  setOpen(false);
  window.dispatchEvent(new Event(inMultiplayerRoom ? 'mp:focus-controls' : 'game:start'));
}
resume?.addEventListener('click', resumeGame);

// Escape releases captured mouse input; a second Escape resumes from the menu.
window.addEventListener('keydown', e => {
  if (xrActive) return;
  if (e.code === 'Tab' && !e.repeat && overlay?.classList.contains('is-hidden')) {
    e.preventDefault();
    e.stopImmediatePropagation();
    setOpen(true);
    return;
  }
  if (e.code === 'Escape' && !e.repeat) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (overlay?.classList.contains('is-hidden')) setOpen(true);
    else resumeGame();
    return;
  }
  // Typing names/codes or navigating the menu must not trigger game controls.
  if (overlay && !overlay.classList.contains('is-hidden')) e.stopPropagation();
}, true);
let mouseWasLocked = !!document.pointerLockElement;
document.addEventListener('pointerlockchange', () => {
  const locked = !!document.pointerLockElement;
  if (mouseWasLocked && !locked && !xrActive) setOpen(true);
  mouseWasLocked = locked;
});

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
  if (inMultiplayerRoom) {
    if (multiplayerPhase === 'playing') setOpen(false);
    else setOpen(true);
  } else if (isRunning()) setOpen(false);
  else renderPlay();
});

function updateMultiplayerOverlay(room) {
  const previousPhase = multiplayerPhase;
  const wasInRoom = inMultiplayerRoom;
  inMultiplayerRoom = !!room;
  multiplayerPhase = room?.phase || 'lobby';
  renderPlay();
  // Score/skin/presence updates must not close a menu opened by the player.
  if (xrActive) return;
  if (multiplayerPhase === 'playing') {
    if (!wasInRoom || previousPhase !== 'playing') setOpen(false);
  } else setOpen(true);
}

window.addEventListener('mp:room:joined', e => updateMultiplayerOverlay(e.detail?.room));
window.addEventListener('mp:room:update', e => updateMultiplayerOverlay(e.detail?.room));
window.addEventListener('mp:room:left', () => updateMultiplayerOverlay(null));
window.addEventListener('mp:status', e => {
  if (e.detail?.state === 'disconnected' && inMultiplayerRoom) updateMultiplayerOverlay(null);
});
window.addEventListener('mp:resume', () => {
  if (inMultiplayerRoom && multiplayerPhase === 'playing') {
    setOpen(false);
    // Это событие вызывается непосредственно в обработчике клика для Pointer Lock.
    window.dispatchEvent(new Event('mp:focus-controls'));
  }
});

window.addEventListener('game:xr', (e) => {
  xrActive = !!(e && e.detail && e.detail.active);
  if (help) help.hidden = xrActive;
  if (mouseRelease) mouseRelease.hidden = xrActive;
  if (xrActive) setOpen(false);
  else setOpen(true);
});

// Длинный статус МК обрезается многоточием — показываем полный текст во всплывающей подсказке.
if (mkStatus && 'MutationObserver' in window) {
  const syncTitle = () => { mkStatus.title = mkStatus.textContent.trim(); };
  new MutationObserver(syncTitle).observe(mkStatus, { childList: true, characterData: true, subtree: true });
  syncTitle();
}

renderPlay();
