// Навигация главного экрана. Запуск игры и сетевой комнаты остаётся в существующих обработчиках.
const overlay = document.getElementById('overlay');
const panels = [...document.querySelectorAll('[data-menu-panel]')];
const nav = [...document.querySelectorAll('[data-menu-page]')];
const worldMode = new URLSearchParams(location.search).get('mode') === 'world';
const gameRoot = new URL('../', document.querySelector('script[src*="js/main.js"]').src);

function selectPage(id, focus = false) {
  if (!panels.some(p => p.dataset.menuPanel === id)) return;
  for (const panel of panels) panel.hidden = panel.dataset.menuPanel !== id;
  for (const button of nav) {
    if (button.dataset.menuPage === id) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  const heading = document.querySelector(`#menu-page-${id} h1`);
  if (heading) overlay?.setAttribute('aria-labelledby', heading.id);
  if (heading && focus) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  if (overlay) overlay.scrollTop = 0;
}
for (const button of nav) button.addEventListener('click', () => selectPage(button.dataset.menuPage, true));

// В режиме мира основная кнопка входит в загруженный мир, ссылка возвращает в тир.
if (worldMode) {
  const play = document.getElementById('play'), worldLink = document.getElementById('world-link');
  if (play) document.getElementById('menu-world-actions')?.appendChild(play);
  if (worldLink) {
    worldLink.href = gameRoot.href; worldLink.className = 'menu-secondary'; worldLink.textContent = 'Перейти в тир ↗';
    document.getElementById('menu-range-actions')?.appendChild(worldLink);
  }
}

const vr = document.getElementById('menu-vr'), vrNote = document.getElementById('menu-vr-note');
let nativeVr = null, vrPending = false, vrError = false, nativeObserver = null;
function syncVr() {
  nativeVr = document.getElementById('VRButton');
  if (!vr) return;
  const supported = !!nativeVr && /ВОЙТИ В VR|ВЫЙТИ ИЗ VR/.test(nativeVr.textContent) && !nativeVr.disabled;
  const busy = vrPending || !!nativeVr?.disabled;
  vr.disabled = busy || (!worldMode && !supported);
  const text = worldMode ? 'Перейти к арене ↗' : busy ? 'Входим в VR…' : supported ? 'Войти в VR ↗' : 'VR недоступен';
  if (vr.textContent !== text) vr.textContent = text;
  if (vrNote) vrNote.textContent = vrError ? 'Не удалось войти. Проверь разрешение и попробуй снова.' : worldMode ? 'Арена магов — в основном VR-режиме' : supported ? 'VR доступен. Надевай шлем.' : 'На компьютере доступны тир и открытый мир';
}
function bindVr() {
  const button = document.getElementById('VRButton');
  if (button && button !== nativeVr) {
    nativeObserver?.disconnect();
    nativeObserver = new MutationObserver(syncVr);
    nativeObserver.observe(button, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  }
  syncVr();
}
vr?.addEventListener('click', () => {
  if (worldMode) { location.href = gameRoot.href; return; }
  if (!nativeVr || vrPending || vr.disabled) return;
  const mode = document.getElementById('set-mode');
  if (mode && mode.value !== 'fantasy') { mode.value = 'fantasy'; mode.dispatchEvent(new Event('change', { bubbles: true })); }
  // Синхронно внутри жеста пользователя: requestSession требует пользовательский клик.
  vrError = false; vrPending = true; syncVr(); nativeVr.click();
  setTimeout(() => { vrPending = false; syncVr(); }, 2500);
});

const mk = document.getElementById('mk'), deviceSlot = document.getElementById('menu-device-slot');
function syncDevice() {
  if (!mk || !deviceSlot) return;
  const open = document.body.classList.contains('ov-open');
  if (open && mk.parentNode !== deviceSlot) { deviceSlot.appendChild(mk); mk.classList.add('menu-device'); }
  else if (!open && mk.parentNode !== document.body) { document.body.appendChild(mk); mk.classList.remove('menu-device'); }
}
new MutationObserver(syncDevice).observe(document.body, { attributes: true, attributeFilter: ['class'] });
syncDevice();

window.addEventListener('game:ready', () => {
  const status = document.getElementById('menu-load-status');
  if (status) status.textContent = 'Можно начинать';
  bindVr();
});
window.addEventListener('game:vr-error', () => { vrError = true; vrPending = false; syncVr(); });
window.addEventListener('game:xr', () => { vrError = false; vrPending = false; syncVr(); });
let joinedRoom = false;
window.addEventListener('mp:room:joined', () => { joinedRoom = true; selectPage('network'); });
window.addEventListener('mp:room:left', () => { if (joinedRoom) selectPage('play'); joinedRoom = false; });
selectPage('play');
