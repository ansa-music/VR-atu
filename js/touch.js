// Сенсорное управление для телефонов и планшетов: плавающий джойстик слева,
// обзор перетаскиванием, неоновые кнопки справа. Чистый DOM + CSS, без three.js.
// Включается на устройствах с «грубым» указателем или после первого касания.
// На гибридных ноутбуках движение мыши временно прячет интерфейс до следующего касания.

const STYLE_ID = 'tc-touch-style';
const DEAD = 0.1;        // мёртвая зона джойстика
const SPRINT_AT = 0.92;  // бег: стик у самого края и вперёд
const DRAG_SLOP = 6;     // px: с кнопок огня и прицела обзор включается после сдвига

const CSS = `
.tc-root {
  --tc-sl: env(safe-area-inset-left, 0px); --tc-sr: env(safe-area-inset-right, 0px);
  --tc-sb: env(safe-area-inset-bottom, 0px);
  --tc-g: clamp(6px, 2vmin, 12px);       /* зазор */
  --tc-f: clamp(64px, 21vmin, 92px);     /* ОГОНЬ */
  --tc-b: clamp(46px, 14.5vmin, 62px);   /* обычные кнопки */
  --tc-s: clamp(40px, 11.5vmin, 50px);   /* малые кнопки */
  --tc-r: 56px;                          /* радиус джойстика, задаёт JS */
  --tc-hud: 94px;                        /* место под панелью оружия (hud.js) */
  --tc-home-b: 22px;
  --tc-head: var(--head, "Russo One", "Arial Black", Impact, system-ui, sans-serif);
  position: fixed; inset: 0; z-index: 15; overflow: hidden;
  touch-action: none; user-select: none; -webkit-user-select: none;
  -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
  color: #eafaff; font-family: var(--tc-head);
}
.tc-root *, .tc-root *::before, .tc-root *::after {
  box-sizing: border-box; touch-action: none; user-select: none; -webkit-user-select: none;
  -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
}
.tc-root.tc-off, body.ov-open .tc-root { display: none !important; }
body.touch-ui #mouse-release, body.touch-ui #mp-controls-tip { display: none !important; }
@media (orientation: portrait) { .tc-root { --tc-hud: 198px; --tc-home-b: 122px; } }

/* ---- джойстик ---- */
.tc-home, .tc-stick {
  position: absolute; width: calc(var(--tc-r) * 2); height: calc(var(--tc-r) * 2); pointer-events: none;
}
.tc-home {
  left: calc(var(--tc-sl) + 22px); bottom: calc(var(--tc-sb) + var(--tc-home-b));
  opacity: .4; transition: opacity .2s;
}
.tc-stick { left: 0; top: 0; visibility: hidden; will-change: transform; }
.tc-root.tc-stick-on .tc-stick { visibility: visible; }
.tc-root.tc-stick-on .tc-home { opacity: 0; }
.tc-ring {
  position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(62, 197, 255, .62);
  background: radial-gradient(circle, rgba(62, 197, 255, .04) 40%, rgba(62, 197, 255, .14) 72%, rgba(10, 15, 38, .32) 100%);
  box-shadow: 0 0 18px rgba(62, 197, 255, .28), inset 0 0 18px rgba(62, 197, 255, .18);
  transition: border-color .15s, box-shadow .15s;
}
.tc-knob {
  position: absolute; left: 50%; top: 50%;
  width: calc(var(--tc-r) * .9); height: calc(var(--tc-r) * .9);
  margin: calc(var(--tc-r) * -.45) 0 0 calc(var(--tc-r) * -.45); border-radius: 50%;
  background: radial-gradient(circle at 50% 36%, rgba(234, 250, 255, .95) 0, rgba(62, 197, 255, .8) 42%, rgba(62, 197, 255, .22) 100%);
  box-shadow: 0 0 16px rgba(62, 197, 255, .7), inset 0 0 0 1.5px rgba(234, 250, 255, .55);
  will-change: transform;
}
.tc-home-lbl {
  position: absolute; left: 0; right: 0; top: 100%; margin-top: 5px; text-align: center;
  font: 400 9px/1 var(--tc-head); letter-spacing: .14em; color: #a9b6e6;
}
.tc-stick.tc-sprint .tc-ring {
  border-color: rgba(255, 210, 63, .9);
  box-shadow: 0 0 22px rgba(255, 210, 63, .45), inset 0 0 18px rgba(255, 210, 63, .25);
}
.tc-stick.tc-sprint .tc-knob {
  background: radial-gradient(circle at 50% 36%, #fff8dc 0, rgba(255, 210, 63, .85) 42%, rgba(255, 210, 63, .25) 100%);
  box-shadow: 0 0 18px rgba(255, 210, 63, .75);
}

/* ---- кнопки: якорь — правый нижний угол ОГНЯ над панелью оружия ---- */
.tc-pad {
  position: absolute; width: 0; height: 0;
  right: calc(var(--tc-sr) + 8px); bottom: calc(var(--tc-sb) + var(--tc-hud) + var(--tc-g));
}
.tc-btn {
  --c: 62, 197, 255;
  position: relative; -webkit-appearance: none; appearance: none;
  margin: 0; padding: 0; border: 0; outline: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  width: var(--tc-b); height: var(--tc-b); border-radius: 50%;
  color: rgb(var(--c));
  background: radial-gradient(circle at 50% 38%, rgba(var(--c), .16) 0, rgba(10, 15, 38, .58) 70%);
  box-shadow: inset 0 0 0 1.5px rgba(var(--c), .62), inset 0 0 14px rgba(var(--c), .16), 0 0 14px rgba(var(--c), .22);
  font: 400 10px/1 var(--tc-head); letter-spacing: .06em; white-space: nowrap;
  text-shadow: 0 0 6px rgba(var(--c), .85);
  cursor: pointer; pointer-events: auto;
  transition: transform .08s ease-out, box-shadow .12s, color .12s;
}
.tc-btn svg {
  width: 46%; height: 46%; flex: none; fill: none; stroke: currentColor; stroke-width: 2;
  stroke-linecap: round; stroke-linejoin: round; pointer-events: none;
  filter: drop-shadow(0 0 3px rgba(var(--c), .9));
}
.tc-btn > span { pointer-events: none; }
.tc-btn.tc-on {
  color: #fff;
  background: radial-gradient(circle at 50% 38%, rgba(var(--c), .5) 0, rgba(var(--c), .2) 55%, rgba(10, 15, 38, .6) 100%);
  box-shadow: inset 0 0 0 2px rgb(var(--c)), inset 0 0 16px rgba(var(--c), .4), 0 0 22px rgba(var(--c), .55);
}
.tc-btn.tc-down {
  transform: scale(.9); color: #fff;
  background: radial-gradient(circle at 50% 38%, rgba(var(--c), .62) 0, rgba(var(--c), .25) 55%, rgba(10, 15, 38, .6) 100%);
  box-shadow: inset 0 0 0 2px rgb(var(--c)), inset 0 0 18px rgba(var(--c), .45), 0 0 28px rgba(var(--c), .7);
}
.tc-pad > .tc-btn { position: absolute; }
.tc-fire {
  --c: 255, 58, 168;
  width: var(--tc-f); height: var(--tc-f); right: 0; bottom: 0;
  font-size: calc(var(--tc-f) * .14); letter-spacing: .08em;
}
.tc-fire svg { width: 36%; height: 36%; }
.tc-fire.tc-down { transform: scale(.93); }
.tc-aim { right: calc(var(--tc-f) + var(--tc-g)); bottom: calc((var(--tc-f) - var(--tc-b)) / 2); }
.tc-crouch {
  --c: 52, 232, 158;
  right: calc(var(--tc-f) + var(--tc-g) * 2 + var(--tc-b)); bottom: calc((var(--tc-f) - var(--tc-b)) / 2);
}
.tc-jump { --c: 164, 140, 255; right: calc((var(--tc-f) - var(--tc-b)) / 2); bottom: calc(var(--tc-f) + var(--tc-g)); }
.tc-reload { --c: 255, 210, 63; right: calc(var(--tc-f) + var(--tc-g)); bottom: calc(var(--tc-f) + var(--tc-g)); }

/* ---- малые: оружие и режим огня (над кластером; на низком экране — слева от него) ---- */
.tc-small {
  position: absolute; right: 0; bottom: calc(var(--tc-f) + var(--tc-g) * 2 + var(--tc-b));
  display: flex; align-items: center; gap: var(--tc-g);
}
@media (orientation: landscape) and (max-height: 400px) {
  .tc-small {
    right: calc(var(--tc-f) + var(--tc-g) * 2 + var(--tc-b));
    bottom: calc(var(--tc-f) + var(--tc-g) + (var(--tc-b) - var(--tc-s)) / 2);
  }
}
.tc-wpn {
  position: relative; display: flex; height: var(--tc-s); border-radius: 999px;
  background: rgba(10, 15, 38, .58);
  box-shadow: inset 0 0 0 1.5px rgba(62, 197, 255, .55), 0 0 12px rgba(62, 197, 255, .2);
}
.tc-wpn > .tc-btn {
  width: calc(var(--tc-s) * 1.25); height: 100%; padding: 0 calc(var(--tc-s) * .28);
  background: none; box-shadow: none; font-size: calc(var(--tc-s) * .44);
}
.tc-wpn > .tc-prev { border-radius: 999px 0 0 999px; align-items: flex-start; }
.tc-wpn > .tc-next { border-radius: 0 999px 999px 0; align-items: flex-end; }
.tc-wpn > .tc-btn.tc-down { transform: none; background: rgba(62, 197, 255, .3); box-shadow: none; }
.tc-wpn-lbl {
  position: absolute; left: 0; right: 0; top: 50%; margin-top: -.5em; text-align: center; pointer-events: none;
  font: 400 9px/1 var(--tc-head); letter-spacing: .12em; color: #a9b6e6;
}
.tc-mode {
  width: auto; height: var(--tc-s); padding: 0 calc(var(--tc-s) * .32); border-radius: 999px;
  font-size: 9.5px; letter-spacing: .1em;
}
@media (prefers-reduced-motion: reduce) {
  .tc-btn, .tc-home, .tc-ring { transition: none; }
}
`;

// иконки 24×24 (присед — фигурка из hud.js)
const ICON = {
  fire: '<path d="M12 2.8c2.1 1.9 3.1 4.3 3.1 7.2V17H8.9v-7c0-2.9 1-5.3 3.1-7.2z"/><path d="M8 20.5h8"/>',
  aim: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5.5M12 16.5V22M2 12h5.5M16.5 12H22"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>',
  reload: '<path d="M18.5 15.75A7.5 7.5 0 1 1 17.3 6.7L18.6 8"/><path d="M18.6 4v4h-4"/>',
  jump: '<path d="M12 17.5V5"/><path d="M6.5 10.5L12 5l5.5 5.5"/><path d="M5 21h14"/>',
  crouch: '<circle cx="11" cy="11" r="2.6"/><path d="M11.5 14l1.5 8M12 16.5l5.5 1.5M12 16.5l3 4.5M13 22l4.5 2-.5 6M13 22l-2.5 5.5-4.5 2.5"/>',
};
const svg = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;

const HTML = `
  <div class="tc-home" aria-hidden="true"><div class="tc-ring"></div><div class="tc-knob"></div><span class="tc-home-lbl">ХОДЬБА</span></div>
  <div class="tc-stick" aria-hidden="true"><div class="tc-ring"></div><div class="tc-knob"></div></div>
  <div class="tc-pad">
    <button type="button" class="tc-btn tc-fire" data-id="fire" aria-label="Огонь" title="Огонь (удерживать — очередь)">${svg(ICON.fire)}<span>ОГОНЬ</span></button>
    <button type="button" class="tc-btn tc-aim" data-id="aim" aria-label="Прицел" aria-pressed="false" title="Прицел">${svg(ICON.aim)}</button>
    <button type="button" class="tc-btn tc-crouch" data-id="crouch" aria-label="Присесть" aria-pressed="false" title="Присесть">${svg(ICON.crouch, '0 6 24 26')}</button>
    <button type="button" class="tc-btn tc-reload" data-id="reload" aria-label="Перезарядка" title="Перезарядка">${svg(ICON.reload)}</button>
    <button type="button" class="tc-btn tc-jump" data-id="jump" aria-label="Прыжок" title="Прыжок">${svg(ICON.jump)}</button>
    <div class="tc-small">
      <div class="tc-wpn" role="group" aria-label="Оружие">
        <button type="button" class="tc-btn tc-prev" data-id="prev" aria-label="Предыдущее оружие" title="Предыдущее оружие">◂</button>
        <button type="button" class="tc-btn tc-next" data-id="next" aria-label="Следующее оружие" title="Следующее оружие">▸</button>
        <span class="tc-wpn-lbl" aria-hidden="true">ОРУЖИЕ</span>
      </div>
      <button type="button" class="tc-btn tc-mode" data-id="mode" aria-label="Режим огня" title="Режим огня">РЕЖИМ</button>
    </div>
  </div>`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createTouchControls() {
  const move = { x: 0, y: 0 };
  const lookOut = [0, 0];
  const listeners = new Set();
  const ptrs = new Map(); // pointerId → { role, el, look, armed, x, y, x0, y0 }
  const btn = Object.create(null);

  let enabled = false, mouseMode = false, visible = true, ovOpen = false;
  let root = null, stick = null, knob = null;
  let lookX = 0, lookY = 0;
  let fireCount = 0, firePress = false, aim = false, crouch = false, sprint = false;
  let stickId = null, stickCX = 0, stickCY = 0;
  let vw = 1, vh = 1, rad = 56;
  let lastPtrAt = -1e9;

  const isActive = () => enabled && !mouseMode;
  const body = () => document.body || document.documentElement;

  function emit(name) {
    for (const fn of listeners) {
      try { fn(name); } catch (err) { console.error(err); }
    }
  }

  function syncShown() {
    body().classList.toggle('touch-ui', isActive());
    if (root) root.classList.toggle('tc-off', !isActive() || !visible);
  }

  function setAim(v) {
    if (v === aim) return;
    aim = v;
    if (btn.aim) { btn.aim.classList.toggle('tc-on', v); btn.aim.setAttribute('aria-pressed', v ? 'true' : 'false'); }
  }
  function setCrouch(v) {
    if (v === crouch) return;
    crouch = v;
    if (btn.crouch) { btn.crouch.classList.toggle('tc-on', v); btn.crouch.setAttribute('aria-pressed', v ? 'true' : 'false'); }
  }
  function setSprint(v) {
    if (v === sprint) return;
    sprint = v;
    if (stick) stick.classList.toggle('tc-sprint', v);
  }

  // ---- джойстик ----
  function startStick(id, x, y) {
    stickId = id; stickCX = x; stickCY = y;
    stick.style.transform = `translate3d(${(x - rad).toFixed(1)}px, ${(y - rad).toFixed(1)}px, 0)`;
    knob.style.transform = 'translate3d(0px, 0px, 0)';
    root.classList.add('tc-stick-on');
  }
  function updateStick(x, y) {
    let dx = x - stickCX, dy = y - stickCY;
    const d = Math.hypot(dx, dy);
    if (d > rad) { const k = rad / d; dx *= k; dy *= k; }
    knob.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
    const m = Math.min(1, d / rad);
    if (m <= DEAD) { move.x = 0; move.y = 0; } else {
      const k = (m - DEAD) / ((1 - DEAD) * m * rad); // мёртвая зона с перешкалированием
      move.x = dx * k;
      move.y = -dy * k; // вверх по экрану = вперёд
    }
    setSprint(m > SPRINT_AT && move.y > 0.5);
  }
  function endStick() {
    stickId = null;
    move.x = 0; move.y = 0;
    setSprint(false);
    if (root) root.classList.remove('tc-stick-on');
  }

  function heldBy(el) {
    for (const p of ptrs.values()) if (p.el === el) return true;
    return false;
  }
  function lookBusy() {
    for (const p of ptrs.values()) if (p.role === 'look') return true;
    return false;
  }

  function resetAll() {
    for (const p of ptrs.values()) if (p.el) p.el.classList.remove('tc-down');
    ptrs.clear();
    endStick();
    fireCount = 0; firePress = false;
    lookX = 0; lookY = 0;
    setAim(false);
    setCrouch(false);
  }

  function setMouseMode(on) {
    if (on === mouseMode) return;
    mouseMode = on;
    if (on && root) resetAll();
    syncShown();
  }

  // ---- указатели ----
  function onDown(e) {
    if (e.cancelable) e.preventDefault();
    lastPtrAt = performance.now();
    if (e.pointerType === 'mouse') { setMouseMode(true); return; } // мышь — обычное управление ПК
    if (ptrs.has(e.pointerId)) return;
    const x = e.clientX, y = e.clientY;
    const t = e.target;
    const b = t && t.closest ? t.closest('.tc-btn') : null;
    let role = 'none', el = null, look = false;
    if (b) {
      el = b; role = 'btn';
      b.classList.add('tc-down');
      const id = b.dataset.id;
      if (id === 'fire') { role = 'fire'; look = true; fireCount++; firePress = true; }
      else if (id === 'aim') { look = true; setAim(!aim); }
      else if (id === 'crouch') setCrouch(!crouch);
      else emit(id);
    } else if (stickId === null && x < vw * 0.5 && y > vh * 0.3) {
      role = 'stick';
      startStick(e.pointerId, x, y);
    } else if (!lookBusy()) {
      role = 'look'; look = true;
    }
    ptrs.set(e.pointerId, { role, el, look, armed: role === 'look', x, y, x0: x, y0: y });
    // касание и так захвачено целью; явный захват на неё же — для пера и старых браузеров
    try { if (t && t.setPointerCapture) t.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  }

  function onMove(e) {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const x = e.clientX, y = e.clientY;
    if (p.role === 'stick') { updateStick(x, y); return; }
    if (!p.look) return;
    if (p.armed) {
      lookX += x - p.x;
      lookY += y - p.y;
    } else {
      const dx = x - p.x0, dy = y - p.y0;
      if (dx * dx + dy * dy < DRAG_SLOP * DRAG_SLOP) return;
      p.armed = true;
    }
    p.x = x; p.y = y;
  }

  function onUp(e) {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    ptrs.delete(e.pointerId);
    if (p.role === 'stick') endStick();
    else if (p.role === 'fire') fireCount = Math.max(0, fireCount - 1);
    if (p.el && !heldBy(p.el)) p.el.classList.remove('tc-down');
  }

  // клик без касания (экранный диктор и т. п.)
  function onClick(e) {
    const t = e.target;
    const b = t && t.closest ? t.closest('.tc-btn') : null;
    if (!b) return;
    e.preventDefault();
    if (performance.now() - lastPtrAt < 800) return; // уже обработано в pointerdown
    const id = b.dataset.id;
    if (id === 'fire') firePress = true;
    else if (id === 'aim') setAim(!aim);
    else if (id === 'crouch') setCrouch(!crouch);
    else emit(id);
  }

  function measure() {
    vw = window.innerWidth || 1;
    vh = window.innerHeight || 1;
    rad = clamp(Math.min(vw, vh) * 0.15, 46, 64); // как clamp(46px, 15vmin, 64px)
    if (root) root.style.setProperty('--tc-r', rad.toFixed(1) + 'px');
  }

  function build() {
    injectStyle();
    root = document.createElement('div');
    root.className = 'tc-root';
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Сенсорное управление');
    root.innerHTML = HTML;
    stick = root.querySelector('.tc-stick');
    knob = stick.querySelector('.tc-knob');
    for (const b of root.querySelectorAll('.tc-btn')) {
      b.tabIndex = -1; // не отбираем фокус и Пробел у игры
      btn[b.dataset.id] = b;
    }

    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    root.addEventListener('lostpointercapture', onUp);
    root.addEventListener('click', onClick);
    // без прокрутки, масштаба, лупы и меню долгого нажатия
    const block = (e) => { if (e.cancelable) e.preventDefault(); };
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      root.addEventListener(type, block, { passive: false });
    }
    for (const type of ['contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'dblclick']) {
      root.addEventListener(type, block);
    }

    body().appendChild(root);
    measure();
    window.addEventListener('resize', measure);

    // открылось меню — отпускаем всё
    ovOpen = body().classList.contains('ov-open');
    if (typeof MutationObserver === 'function') {
      new MutationObserver(() => {
        const open = body().classList.contains('ov-open');
        if (open === ovOpen) return;
        ovOpen = open;
        if (open) resetAll();
      }).observe(body(), { attributes: true, attributeFilter: ['class'] });
    }
    window.addEventListener('blur', resetAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) resetAll(); });
  }

  function onAnyTouch() {
    if (!enabled) enable();
    else if (mouseMode) setMouseMode(false);
  }
  function onAnyPointerMove(e) {
    if (e.pointerType === 'mouse' && !mouseMode) setMouseMode(true);
  }

  function enable() {
    if (enabled) return;
    enabled = true;
    build();
    window.addEventListener('pointermove', onAnyPointerMove, { capture: true, passive: true });
    syncShown();
  }

  window.addEventListener('touchstart', onAnyTouch, { capture: true, passive: true });
  const mq = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;
  if (mq) {
    if (mq.matches) enable();
    else {
      const onMq = () => { if (mq.matches) enable(); };
      if (mq.addEventListener) mq.addEventListener('change', onMq);
      else if (mq.addListener) mq.addListener(onMq);
    }
  }

  return {
    get active() { return isActive(); },
    move,
    get sprint() { return sprint; },
    consumeLook() {
      lookOut[0] = lookX; lookOut[1] = lookY;
      lookX = 0; lookY = 0;
      return lookOut;
    },
    get fire() { return fireCount > 0; },
    takeFirePress() {
      const p = firePress;
      firePress = false;
      return p;
    },
    get aim() { return aim; },
    get crouch() { return crouch; },
    onAction(fn) {
      if (typeof fn === 'function') listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setVisible(v) {
      v = !!v;
      if (v === visible) return;
      visible = v;
      if (!v && root) resetAll();
      syncShown();
    },
  };
}
