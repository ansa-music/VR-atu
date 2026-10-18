// HUD от первого лица для ПК: оружие, патроны, нагрев, слоты, стойка, прицел,
// оптика в стиле ПСО-1, маркеры попаданий и всплывающие сообщения.
// Чистый DOM + CSS, без three.js. Стили внедряются сами (index.html не трогаем).

const STYLE_ID = 'vh-hud-style';

const CSS = `
.vh-hud {
  --vh-cyan: var(--cyan, #3ec5ff); --vh-violet: var(--violet, #7c5cff); --vh-pink: var(--pink, #ff3aa8);
  --vh-gold: var(--gold, #ffd23f); --vh-green: var(--green, #34e89e);
  --vh-amber: #ffaa2b; --vh-red: #ff4060;
  --vh-text: var(--text, #e8edff); --vh-muted: var(--muted, #a9b6e6);
  --vh-head: var(--head, "Russo One", "Arial Black", Impact, system-ui, sans-serif);
  --vh-body: var(--body, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  --vh-pad: 16px;
  --vh-slots-bottom: 72px; /* над кнопкой ENTER VR */
  position: fixed; inset: 0; z-index: 8; display: none; overflow: hidden;
  pointer-events: none; user-select: none; -webkit-user-select: none;
  color: var(--vh-text); font-family: var(--vh-body);
}
.vh-hud.vh-on { display: block; }
body.ov-open .vh-hud { display: none !important; }
.vh-hud, .vh-hud * { pointer-events: none !important; box-sizing: border-box; }
.vh-hud [hidden] { display: none !important; }

.vh-panel {
  background: rgba(10, 15, 38, .62);
  border: 1px solid rgba(62, 197, 255, .35); border-radius: 14px;
  box-shadow: 0 0 18px rgba(62, 197, 255, .16), 0 6px 20px rgba(0, 0, 0, .35);
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
}
.vh-bar { position: relative; height: 5px; border-radius: 3px; overflow: hidden; background: rgba(255, 255, 255, .12); }
.vh-bar > i {
  position: absolute; inset: 0; border-radius: inherit; background: currentColor;
  transform-origin: 0 50%; transform: scaleX(0); box-shadow: 0 0 8px currentColor;
}
.vh-lbl { font: 700 11px/1.15 var(--vh-body); letter-spacing: .12em; white-space: nowrap; }

/* ---- оружие (справа снизу) ---- */
.vh-weapon {
  position: absolute; right: var(--vh-pad); bottom: var(--vh-pad);
  min-width: 220px; max-width: min(46vw, 340px); padding: 10px 16px 12px;
  border-top: 2px solid var(--vh-cyan); text-align: right;
}
.vh-weapon.vh-energy {
  border-color: rgba(255, 58, 168, .4); border-top-color: var(--vh-pink);
  box-shadow: 0 0 18px rgba(255, 58, 168, .18), 0 6px 20px rgba(0, 0, 0, .35);
}
.vh-w-head { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; }
.vh-w-mode {
  margin-right: auto; padding: 3px 6px; border-radius: 6px;
  font: 700 11px/1 var(--vh-body); letter-spacing: .08em; color: var(--vh-cyan);
  border: 1px solid rgba(62, 197, 255, .55); background: rgba(62, 197, 255, .1);
}
.vh-w-slot {
  padding: 3px 5px; border-radius: 5px; font: 400 11px/1 var(--vh-head); color: var(--vh-muted);
  border: 1px solid rgba(169, 182, 230, .4);
}
.vh-w-name {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font: 400 20px/1.15 var(--vh-head); letter-spacing: .04em; color: #fff;
  text-shadow: 0 0 10px rgba(62, 197, 255, .65);
}
.vh-energy .vh-w-name { text-shadow: 0 0 10px rgba(255, 58, 168, .7); }
.vh-w-sub {
  margin-top: 3px; font-size: 11.5px; line-height: 1.3; color: var(--vh-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.vh-w-ammo {
  display: flex; align-items: baseline; justify-content: flex-end; gap: 3px; margin-top: 4px;
  color: #fff; transition: color .2s;
}
.vh-a-mag { font: 400 54px/.95 var(--vh-head); font-variant-numeric: tabular-nums; text-shadow: 0 0 14px rgba(62, 197, 255, .55); }
.vh-a-ch { align-self: flex-start; margin-top: 3px; font: 400 18px/1 var(--vh-head); color: var(--vh-cyan); }
.vh-a-res { margin-left: 5px; font: 400 20px/1 var(--vh-head); color: var(--vh-muted); }
.vh-w-ammo[data-lvl="1"] { color: var(--vh-amber); }
.vh-w-ammo[data-lvl="1"] .vh-a-mag { text-shadow: 0 0 14px rgba(255, 170, 43, .65); }
.vh-w-ammo[data-lvl="2"] { color: var(--vh-red); }
.vh-w-ammo[data-lvl="2"] .vh-a-mag { text-shadow: 0 0 14px rgba(255, 64, 96, .75); }
.vh-w-heat { display: flex; align-items: center; gap: 8px; margin-top: 8px; color: var(--vh-cyan); transition: color .15s; }
.vh-w-heat .vh-bar { flex: 1; height: 8px; min-width: 90px; }
.vh-w-heat[data-lvl="1"] { color: var(--vh-gold); }
.vh-w-heat[data-lvl="2"] { color: var(--vh-amber); }
.vh-w-heat[data-lvl="3"] { color: var(--vh-red); animation: vh-blink .5s steps(2, start) infinite; }
.vh-w-status { margin-top: 8px; color: var(--vh-amber); }
.vh-w-status .vh-bar { margin-top: 5px; }
.vh-w-status[data-tone="bad"] { color: var(--vh-red); animation: vh-blink 1s steps(2, start) infinite; }
@keyframes vh-blink { 50% { opacity: .45; } }

/* ---- слоты (по центру снизу) ---- */
.vh-slots {
  position: absolute; left: 50%; bottom: var(--vh-slots-bottom); transform: translateX(-50%);
  display: flex; gap: 6px; padding: 5px; border-radius: 12px; white-space: nowrap;
  max-width: calc(100vw - 16px);
}
.vh-slot {
  display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 8px;
  font: 400 12px/1 var(--vh-head); letter-spacing: .05em; color: var(--vh-muted);
  border: 1px solid transparent; opacity: .72;
  transition: color .15s, background-color .15s, border-color .15s, opacity .15s;
}
.vh-slot b { font: 700 11px/1 var(--vh-body); color: rgba(169, 182, 230, .75); }
.vh-slot.vh-act {
  opacity: 1; color: #fff; background: rgba(62, 197, 255, .16); border-color: rgba(62, 197, 255, .7);
  box-shadow: 0 0 12px rgba(62, 197, 255, .35), inset 0 0 8px rgba(62, 197, 255, .15);
  text-shadow: 0 0 8px rgba(62, 197, 255, .8);
}
.vh-slot.vh-act b { color: var(--vh-cyan); }

/* ---- стойка и подсказка (слева снизу) ---- */
.vh-left {
  position: absolute; left: var(--vh-pad); bottom: var(--vh-pad);
  display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
  max-width: min(40vw, 380px);
}
.vh-stance { display: flex; align-items: center; gap: 8px; padding: 6px 12px 6px 8px; border-radius: 12px; color: var(--vh-cyan); }
.vh-stance svg {
  width: 22px; height: 30px; flex: none; fill: none; stroke: currentColor; stroke-width: 2;
  stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 0 4px currentColor);
}
.vh-stance svg g { display: none; }
.vh-stance[data-k="stand"] g[data-k="stand"], .vh-stance[data-k="crouch"] g[data-k="crouch"],
.vh-stance[data-k="run"] g[data-k="run"], .vh-stance[data-k="jump"] g[data-k="jump"] { display: inline; }
.vh-stance[data-k="crouch"] { color: var(--vh-green); }
.vh-stance[data-k="run"] { color: var(--vh-gold); }
.vh-stance[data-k="jump"] { color: #a48cff; }
.vh-st-txt { font: 400 12px/1 var(--vh-head); letter-spacing: .08em; white-space: nowrap; }
.vh-hint { font-size: 11.5px; line-height: 1.4; color: var(--vh-muted); opacity: .85; text-shadow: 0 1px 3px rgba(0, 0, 0, .95); }

/* ---- динамический прицел ---- */
.vh-cross { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
.vh-cross i {
  position: absolute; background: #eaf8ff; border-radius: 1px; will-change: transform;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, .45), 0 0 6px rgba(62, 197, 255, .85);
  transition: transform 60ms linear;
}
.vh-cross .vh-xt { left: -1px; top: -9px; width: 2px; height: 9px; }
.vh-cross .vh-xb { left: -1px; top: 0; width: 2px; height: 9px; }
.vh-cross .vh-xl { left: -9px; top: -1px; width: 9px; height: 2px; }
.vh-cross .vh-xr { left: 0; top: -1px; width: 9px; height: 2px; }
.vh-cross .vh-xd {
  left: -1.5px; top: -1.5px; width: 3px; height: 3px; border-radius: 50%; transition: none; will-change: auto;
  background: var(--vh-pink); box-shadow: 0 0 0 1px rgba(0, 0, 0, .4), 0 0 5px var(--vh-pink);
}

/* ---- маркер попадания ---- */
.vh-hit { position: absolute; left: 50%; top: 50%; width: 0; height: 0; opacity: 0; --c: #fff; }
.vh-hit i {
  position: absolute; left: -1px; top: -17px; width: 2px; height: 9px; border-radius: 1px;
  background: var(--c); transform-origin: 1px 17px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, .35), 0 0 5px var(--c);
}
.vh-hit i:nth-child(1) { transform: rotate(45deg); }
.vh-hit i:nth-child(2) { transform: rotate(135deg); }
.vh-hit i:nth-child(3) { transform: rotate(225deg); }
.vh-hit i:nth-child(4) { transform: rotate(315deg); }
.vh-ring {
  position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px 0 0 -22px;
  border: 2px solid var(--vh-gold); border-radius: 50%; opacity: 0;
  box-shadow: 0 0 10px var(--vh-gold), inset 0 0 6px var(--vh-gold);
}

/* ---- всплывающие сообщения ---- */
.vh-toasts {
  position: absolute; left: 50%; top: calc(50% + 52px); transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.vh-toast {
  font: 400 18px/1.15 var(--vh-head); letter-spacing: .05em; white-space: nowrap; color: var(--vh-gold);
  text-shadow: 0 0 10px currentColor, 0 1px 3px rgba(0, 0, 0, .95);
}

/* ---- оптика ПСО-1 ---- */
.vh-scope { position: absolute; inset: 0; --r: 46vmin; }
.vh-scope-ret { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
.vh-scope-ret svg { position: absolute; overflow: visible; }
.vh-scope-mask {
  position: absolute; inset: 0;
  background:
    radial-gradient(circle at calc(50% - var(--r) * .3) calc(50% - var(--r) * .34),
      rgba(255, 255, 255, .055), rgba(255, 255, 255, 0) calc(var(--r) * .45)),
    radial-gradient(circle at 50% 50%,
      rgba(150, 205, 255, .045) 0,
      rgba(120, 180, 240, .03) calc(var(--r) * .6),
      rgba(0, 0, 0, .4) calc(var(--r) * .88),
      rgba(0, 0, 0, .86) calc(var(--r) - 3px),
      #000 var(--r));
}
.vh-breath {
  position: absolute; left: 50%; top: calc(50% + var(--r) * .7); transform: translateX(-50%);
  width: 200px; padding: 7px 12px 8px; text-align: center; color: var(--vh-cyan);
  background: rgba(4, 7, 18, .55); border-color: rgba(62, 197, 255, .25);
}
.vh-breath .vh-row { display: flex; align-items: center; gap: 8px; }
.vh-breath .vh-bar { flex: 1; }
.vh-breath small { display: block; margin-top: 5px; font-size: 10.5px; color: var(--vh-muted); white-space: nowrap; }
.vh-breath[data-s="hold"] { color: var(--vh-green); }
.vh-breath[data-s="ex"] { color: var(--vh-red); }

/* ---- адаптив ---- */
@media (max-width: 980px) {
  .vh-slot:not(.vh-act) .vh-sn { display: none; }
}
@media (max-width: 900px), (max-height: 520px) {
  .vh-weapon { min-width: 190px; padding: 8px 12px 10px; }
  .vh-w-name { font-size: 17px; }
  .vh-a-mag { font-size: 42px; }
  .vh-a-res { font-size: 17px; }
}
@media (max-width: 640px) {
  .vh-hud { --vh-pad: 10px; --vh-slots-bottom: 70px; }
  .vh-weapon, .vh-left { bottom: 112px; }
  .vh-weapon { min-width: 0; max-width: 54vw; padding: 7px 10px 8px; border-radius: 12px; }
  .vh-w-name { font-size: 14px; }
  .vh-w-sub { font-size: 10px; }
  .vh-a-mag { font-size: 34px; }
  .vh-a-ch { font-size: 13px; }
  .vh-a-res { font-size: 14px; }
  .vh-w-heat .vh-bar { min-width: 60px; }
  .vh-lbl { font-size: 10px; }
  .vh-slots { gap: 3px; padding: 3px; border-radius: 10px; }
  .vh-slot { gap: 4px; padding: 4px 6px; font-size: 10px; }
  .vh-left { max-width: 42vw; gap: 6px; }
  .vh-stance { padding: 4px 8px 4px 6px; }
  .vh-stance svg { width: 16px; height: 22px; }
  .vh-st-txt { font-size: 10px; }
  .vh-hint { font-size: 10px; }
  .vh-toast { font-size: 15px; }
  .vh-breath { width: 170px; }
}
/* ---- сенсорное управление (touch.js): компактная панель под кнопкой ОГОНЬ, стойка наверху ---- */
body.touch-ui .vh-hint, body.touch-ui .vh-breath small, body.touch-ui .vh-w-sub { display: none !important; }
body.touch-ui .vh-left {
  top: calc(62px + env(safe-area-inset-top, 0px)); bottom: auto; left: calc(12px + env(safe-area-inset-left, 0px));
}
body.touch-ui .vh-weapon {
  right: calc(8px + env(safe-area-inset-right, 0px)); bottom: calc(8px + env(safe-area-inset-bottom, 0px));
  min-width: 0; max-width: min(46vw, 230px); padding: 5px 10px 6px; border-radius: 12px;
}
body.touch-ui .vh-w-head { gap: 6px; }
body.touch-ui .vh-w-name { font-size: 14px; }
body.touch-ui .vh-w-mode, body.touch-ui .vh-w-slot { padding: 2px 5px; font-size: 10px; }
body.touch-ui .vh-w-ammo { margin-top: 1px; }
body.touch-ui .vh-a-mag { font-size: 28px; }
body.touch-ui .vh-a-ch { margin-top: 2px; font-size: 12px; }
body.touch-ui .vh-a-res { font-size: 14px; }
body.touch-ui .vh-w-heat, body.touch-ui .vh-w-status { margin-top: 4px; }
body.touch-ui .vh-w-heat .vh-bar { height: 6px; min-width: 60px; }
body.touch-ui .vh-w-status .vh-bar { margin-top: 3px; height: 4px; }
body.touch-ui .vh-weapon .vh-lbl { font-size: 10px; }
@media (orientation: portrait) {
  body.touch-ui .vh-weapon { bottom: calc(112px + env(safe-area-inset-bottom, 0px)); }
}
@media (prefers-reduced-motion: reduce) {
  .vh-hud *, .vh-hud *::before, .vh-hud *::after { transition: none !important; animation: none !important; }
}
`;

// фигурки стоек (viewBox 0 0 24 32)
const STANCE_KEY = { 'СТОЯ': 'stand', 'ПРИСЕД': 'crouch', 'БЕГ': 'run', 'В ПРЫЖКЕ': 'jump' };
const FIGS =
  '<g data-k="stand"><circle cx="12" cy="4.5" r="2.6"/><path d="M12 7.5V18M12 10l-4.5 5M12 10l4.5 5M12 18l-3.5 11M12 18l3.5 11"/></g>' +
  '<g data-k="crouch"><circle cx="11" cy="11" r="2.6"/><path d="M11.5 14l1.5 8M12 16.5l5.5 1.5M12 16.5l3 4.5M13 22l4.5 2-.5 6M13 22l-2.5 5.5-4.5 2.5"/></g>' +
  '<g data-k="run"><circle cx="14.5" cy="4.5" r="2.6"/><path d="M13.6 7.6L11 17M12.8 10l4.5 3 2-2.5M12.8 10l-4 3.5-2.5-1M11 17l5 4.5-1.5 6.5M11 17l-3.5 5-4.5 1.5"/></g>' +
  '<g data-k="jump"><circle cx="12" cy="4" r="2.6"/><path d="M12 7v9M12 9.5l-5-3.5M12 9.5l5-3.5M12 16l-4 4 2 4.5M12 16l4 4-2 4.5"/><path d="M7 30.5h10" stroke-dasharray="2 2" opacity=".5"/></g>';

// маркеры попаданий
const HIT = {
  hit:   { color: '#ffffff', scale: 1,    dur: 150 },
  kill:  { color: '#ffffff', scale: 1.6,  dur: 280 },
  bomb:  { color: '#ff4060', scale: 1.25, dur: 260 },
  plate: { color: '#ffd23f', scale: 1.1,  dur: 220, ring: true },
};

const r2 = (v) => Math.round(v * 100) / 100;
const clamp01 = (v) => (v > 1 ? 1 : v > 0 ? v : 0);
const cssColor = (c) => (typeof c === 'number' ? '#' + (c >>> 0).toString(16).padStart(6, '0') : c);

let uid = 0;

// Сетка ПСО-1 в пикселях: 1 тысячная = p px. Апекс главного угольника — в (0,0).
function reticleSvg(p, id) {
  const hM = Math.max(0.75 * p, 6), wM = hM * 0.9;                  // главный угольник
  const hS = Math.max(0.5 * p, Math.min(3, 0.9 * p)), wS = hS * 0.9; // малые угольники
  const gap = wM + Math.max(0.6 * p, 6);                            // разрыв шкалы у центра
  const t1 = Math.max(0.35 * p, 3), t5 = Math.max(0.7 * p, 6), t10 = Math.max(1.05 * p, 9);
  const fs = r2(Math.min(14, Math.max(9, 1.3 * p)));
  const label = (x, y, s) => `<text x="${r2(x)}" y="${r2(y)}">${s}</text>`;
  let ink = '', txt = '';

  // шкала боковых поправок: ±10 тыс., штрих каждую тысячную, длинные на 5 и 10
  for (const s of [-1, 1]) {
    ink += `M${r2(s * gap)} 0H${r2(s * 10 * p)}`;
    for (let i = 1; i <= 10; i++) {
      const x = s * i * p;
      if (Math.abs(x) < gap) continue;
      const t = i === 10 ? t10 : i === 5 ? t5 : t1;
      ink += `M${r2(x)} 0V${r2(-t)}`;
      if (i === 10 || (i === 5 && p >= 3.5)) txt += label(x, -t - 3, i);
    }
  }

  // дальномерная шкала (цель 1,7 м): слева снизу, 200…1000 м
  const yb = 12 * p;
  const curveY = (u) => yb - (1700 / (200 + 800 * u)) * p;
  let curve = '';
  for (let k = 0; k <= 32; k++) {
    const u = k / 32;
    curve += (k ? 'L' : 'M') + r2((-10 + 8 * u) * p) + ' ' + r2(curveY(u));
  }
  ink += `M${r2(-10.6 * p)} ${r2(yb)}H${r2(-1.4 * p)}`;
  for (let i = 0; i < 5; i++) {
    const u = i / 4, x = (-10 + 8 * u) * p, y = curveY(u);
    ink += `M${r2(x)} ${r2(y)}V${r2(y - t1)}`;
    if (p >= 5) txt += label(x, y - t1 - 3, 2 + 2 * i);
  }
  const dash = `${r2(Math.max(2.2, 0.45 * p))} ${r2(Math.max(1.6, 0.3 * p))}`;

  // угольники: главный и три малых на 1, 2, 3 тыс. ниже
  const chev = (y, w, h) => `M${r2(-w)} ${r2(y + h)}L0 ${r2(y)}L${r2(w)} ${r2(y + h)}`;
  const main = chev(0, wM, hM);
  let small = '';
  for (let k = 1; k <= 3; k++) small += chev(k * p, wS, hS);

  const S = 2 * Math.ceil(13.5 * p + 60), H = S / 2;
  const halo = 'rgba(255,196,176,.26)', dark = '#1b0504';
  const glow = 'vh-glow-' + id;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="${-H} ${-H} ${S} ${S}" style="left:${-H}px;top:${-H}px" aria-hidden="true">` +
    `<defs><filter id="${glow}" x="-60%" y="-60%" width="220%" height="220%">` +
    `<feGaussianBlur stdDeviation="${r2(Math.max(1.2, 0.18 * p))}" result="b"/>` +
    `<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>` +
    `<g fill="none">` +
    `<path d="${ink}" stroke="${halo}" stroke-width="3.4"/>` +
    `<path d="${curve}" stroke="${halo}" stroke-width="3.4" stroke-dasharray="${dash}"/>` +
    `<path d="${ink}" stroke="${dark}" stroke-width="1.25"/>` +
    `<path d="${curve}" stroke="${dark}" stroke-width="1.25" stroke-dasharray="${dash}"/>` +
    `</g>` +
    `<g font-family="system-ui, sans-serif" font-size="${fs}" font-weight="600" text-anchor="middle" fill="${dark}" ` +
    `stroke="rgba(255,196,176,.38)" stroke-width="2.4" stroke-linejoin="round" paint-order="stroke">${txt}</g>` +
    `<g fill="none" stroke="#ff3b30" stroke-linejoin="miter" stroke-miterlimit="10" filter="url(#${glow})">` +
    `<path d="${small}" stroke-width="1.6"/><path d="${main}" stroke-width="2.2"/></g>` +
    `</svg>`;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);
}

export function createHud() {
  injectStyle();
  const id = ++uid;
  const root = document.createElement('div');
  root.className = 'vh-hud';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="vh-scope" hidden>
      <div class="vh-scope-ret"></div>
      <div class="vh-scope-mask"></div>
      <div class="vh-breath vh-panel" hidden>
        <div class="vh-row"><span class="vh-lbl">ДЫХАНИЕ</span><div class="vh-bar"><i></i></div></div>
        <small>Shift — задержать дыхание</small>
      </div>
    </div>
    <div class="vh-cross" hidden><i class="vh-xt"></i><i class="vh-xb"></i><i class="vh-xl"></i><i class="vh-xr"></i><i class="vh-xd"></i></div>
    <div class="vh-hit"><i></i><i></i><i></i><i></i></div>
    <div class="vh-ring"></div>
    <div class="vh-toasts"></div>
    <div class="vh-left">
      <div class="vh-stance vh-panel" hidden><svg viewBox="0 0 24 32" aria-hidden="true">${FIGS}</svg><span class="vh-st-txt"></span></div>
      <div class="vh-hint" hidden></div>
    </div>
    <div class="vh-slots vh-panel" hidden></div>
    <div class="vh-weapon vh-panel" hidden>
      <div class="vh-w-head"><span class="vh-w-mode" hidden></span><span class="vh-w-slot" hidden></span><span class="vh-w-name"></span></div>
      <div class="vh-w-sub" hidden></div>
      <div class="vh-w-ammo" hidden><span class="vh-a-mag"></span><span class="vh-a-ch" hidden></span><span class="vh-a-res"></span></div>
      <div class="vh-w-heat" hidden><span class="vh-lbl">НАГРЕВ</span><div class="vh-bar"><i></i></div></div>
      <div class="vh-w-status" hidden><span class="vh-lbl"></span><div class="vh-bar"><i></i></div></div>
    </div>`;
  (document.body || document.documentElement).appendChild(root);

  const $ = (sel) => root.querySelector(sel);
  const el = {
    scope: $('.vh-scope'), ret: $('.vh-scope-ret'),
    breath: $('.vh-breath'), breathBar: $('.vh-breath .vh-bar > i'),
    cross: $('.vh-cross'), xt: $('.vh-xt'), xb: $('.vh-xb'), xl: $('.vh-xl'), xr: $('.vh-xr'),
    hit: $('.vh-hit'), ring: $('.vh-ring'), toasts: $('.vh-toasts'),
    stance: $('.vh-stance'), stanceTxt: $('.vh-st-txt'), hint: $('.vh-hint'),
    slots: $('.vh-slots'),
    weapon: $('.vh-weapon'), mode: $('.vh-w-mode'), slot: $('.vh-w-slot'), name: $('.vh-w-name'), sub: $('.vh-w-sub'),
    ammo: $('.vh-w-ammo'), mag: $('.vh-a-mag'), ch: $('.vh-a-ch'), res: $('.vh-a-res'),
    heat: $('.vh-w-heat'), heatLbl: $('.vh-w-heat .vh-lbl'), heatBar: $('.vh-w-heat .vh-bar > i'),
    status: $('.vh-w-status'), statusLbl: $('.vh-w-status .vh-lbl'),
    statusBarBox: $('.vh-w-status .vh-bar'), statusBar: $('.vh-w-status .vh-bar > i'),
  };

  // кэш: трогаем DOM только при изменении значения
  const memo = Object.create(null);
  const changed = (k, v) => (memo[k] === v ? false : ((memo[k] = v), true));

  const rmq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(rmq && rmq.matches);

  let slotsRef = null, slotEls = [], slotVals = [];
  function buildSlots(list) {
    el.slots.textContent = '';
    slotEls = []; slotVals = [];
    for (const s of list) {
      const item = document.createElement('span');
      item.className = 'vh-slot';
      const b = document.createElement('b');
      b.textContent = s.slot;
      const n = document.createElement('span');
      n.className = 'vh-sn';
      n.textContent = s.name;
      item.append(b, n);
      el.slots.appendChild(item);
      slotEls.push(item); slotVals.push(s.slot);
    }
    memo.act = undefined; // переподсветить активный
  }

  function update(info) {
    if (!info) return;
    const vis = info.visible !== false;
    if (changed('vis', vis)) root.classList.toggle('vh-on', vis);
    if (!vis) return;

    // ---- оружие ----
    const w = info.weapon || null;
    if (changed('hasW', !!w)) el.weapon.hidden = !w;
    if (w) {
      if (changed('wSlot', w.slot)) { el.slot.textContent = w.slot == null ? '' : w.slot; el.slot.hidden = w.slot == null; }
      if (changed('wName', w.name)) el.name.textContent = w.name || '';
      const tc = changed('wTitle', w.title), cc = changed('wCal', w.caliber);
      if (tc || cc) {
        const sub = [w.title, w.caliber].filter(Boolean).join(' · ');
        el.sub.textContent = sub;
        el.sub.hidden = !sub;
      }
    }

    const mode = info.mode || '';
    if (changed('mode', mode)) { el.mode.textContent = mode; el.mode.hidden = !mode; }

    // ---- патроны ----
    const a = info.ammo || null;
    if (changed('hasA', !!a)) { el.ammo.hidden = !a; el.weapon.classList.toggle('vh-energy', !a); }
    if (a) {
      if (changed('aL', a.loaded)) el.mag.textContent = a.loaded == null ? '' : a.loaded;
      if (changed('aC', a.chamber)) { el.ch.hidden = !(a.chamber > 0); el.ch.textContent = '+' + (a.chamber || 0); }
      if (changed('aR', a.reserve)) {
        el.res.hidden = a.reserve == null;
        el.res.textContent = '/ ' + (Number.isFinite(a.reserve) ? a.reserve : '∞');
      }
      const lvl = !(a.loaded > 0) ? 2 : a.capacity > 0 && a.loaded <= a.capacity * 0.25 ? 1 : 0;
      if (changed('aLvl', lvl)) el.ammo.dataset.lvl = lvl;
    }

    // ---- нагрев бластера ----
    const hasH = typeof info.heat === 'number';
    if (changed('hasH', hasH)) el.heat.hidden = !hasH;
    if (hasH) {
      const h = clamp01(info.heat);
      const q = Math.round(h * 200);
      if (changed('heat', q)) el.heatBar.style.transform = `scaleX(${q / 200})`;
      const hl = info.overheated ? 3 : h > 0.85 ? 2 : h > 0.6 ? 1 : 0;
      if (changed('heatLvl', hl)) {
        el.heat.dataset.lvl = hl;
        el.heatLbl.textContent = hl === 3 ? 'ПЕРЕГРЕВ' : 'НАГРЕВ';
      }
    }

    // ---- статус (перезарядка и т. п.) ----
    const st = info.status || null;
    const sText = (st && st.text) || '';
    if (changed('sText', sText)) {
      el.status.hidden = !sText;
      el.statusLbl.textContent = sText;
      el.status.dataset.tone = /НЕТ|ПЕРЕГРЕВ/i.test(sText) ? 'bad' : 'warn';
    }
    const sColor = (st && st.color && cssColor(st.color)) || '';
    if (changed('sColor', sColor)) el.status.style.color = sColor;
    const sp = st && typeof st.progress === 'number' ? Math.round(clamp01(st.progress) * 200) : -1;
    if (changed('sProg', sp)) {
      el.statusBarBox.hidden = sp < 0;
      if (sp >= 0) el.statusBar.style.transform = `scaleX(${sp / 200})`;
    }

    // ---- слоты ----
    const slots = Array.isArray(info.slots) ? info.slots : null;
    if (slots !== slotsRef) {
      slotsRef = slots;
      const sig = slots ? slots.map((s) => s.slot + ':' + s.name).join('|') : '';
      if (changed('slotsSig', sig)) {
        el.slots.hidden = !sig;
        buildSlots(slots || []);
      }
    }
    const act = w ? w.slot : null;
    if (changed('act', act)) {
      for (let i = 0; i < slotEls.length; i++) slotEls[i].classList.toggle('vh-act', slotVals[i] === act);
    }

    // ---- стойка и подсказка ----
    const stance = info.stance || '';
    if (changed('stance', stance)) {
      el.stance.hidden = !stance;
      el.stance.dataset.k = STANCE_KEY[stance] || 'stand';
      el.stanceTxt.textContent = stance;
    }
    const hint = info.hint || '';
    if (changed('hint', hint)) { el.hint.textContent = hint; el.hint.hidden = !hint; }

    // ---- оптика ----
    const sc = info.scope;
    const hasScope = !!(sc && sc.pxPerMil > 0);
    if (changed('scope', hasScope)) el.scope.hidden = !hasScope;
    if (hasScope) {
      const p = r2(sc.pxPerMil);
      if (changed('ppm', p)) el.ret.innerHTML = reticleSvg(p, id);
    }
    const br = hasScope && info.breath ? info.breath : null;
    if (changed('hasB', !!br)) el.breath.hidden = !br;
    if (br) {
      const q = Math.round(clamp01(br.value) * 200);
      if (changed('bVal', q)) el.breathBar.style.transform = `scaleX(${q / 200})`;
      const bs = br.exhausted ? 'ex' : br.holding ? 'hold' : '';
      if (changed('bState', bs)) el.breath.dataset.s = bs;
    }

    // ---- прицел от бедра (скрыт в оптике и при прицеливании) ----
    const showX = !!info.crosshair && !hasScope;
    if (changed('cross', showX)) el.cross.hidden = !showX;
    if (showX) {
      const g = Math.round(Math.max(0, +info.spreadPx || 0) * 2) / 2;
      if (changed('gap', g)) {
        el.xt.style.transform = `translateY(${-g}px)`;
        el.xb.style.transform = `translateY(${g}px)`;
        el.xl.style.transform = `translateX(${-g}px)`;
        el.xr.style.transform = `translateX(${g}px)`;
      }
    }
  }

  let hitAnim = null, ringAnim = null;
  function hitMarker(kind = 'hit') {
    const k = HIT[kind] || HIT.hit;
    if (typeof el.hit.animate !== 'function') return;
    el.hit.style.setProperty('--c', k.color);
    if (hitAnim) hitAnim.cancel();
    const s = k.scale;
    hitAnim = el.hit.animate(reduced()
      ? [{ opacity: 1, transform: `scale(${s})` }, { opacity: 1, offset: 0.6 }, { opacity: 0, transform: `scale(${s})` }]
      : [{ opacity: 1, transform: `scale(${s * 1.3})` }, { opacity: 1, transform: `scale(${s})`, offset: 0.4 }, { opacity: 0, transform: `scale(${s * 1.05})` }],
      { duration: k.dur, easing: 'ease-out' });
    if (k.ring) {
      if (ringAnim) ringAnim.cancel();
      ringAnim = el.ring.animate(reduced()
        ? [{ opacity: 0.9, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1)' }]
        : [{ opacity: 0.9, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.5)' }],
        { duration: 320, easing: 'ease-out' });
    }
  }

  function toast(text, color) {
    const t = document.createElement('div');
    t.className = 'vh-toast';
    t.textContent = text == null ? '' : String(text);
    if (color != null) t.style.color = cssColor(color);
    el.toasts.appendChild(t);
    while (el.toasts.childElementCount > 3) el.toasts.firstElementChild.remove();
    if (typeof t.animate === 'function') {
      t.animate(reduced()
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }]
        : [
          { opacity: 0, transform: 'translateY(8px) scale(.92)' },
          { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.12 },
          { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.7 },
          { opacity: 0, transform: 'translateY(-12px) scale(1)' },
        ],
        { duration: 1200, easing: 'ease-out', fill: 'forwards' });
    }
    setTimeout(() => t.remove(), 1250);
  }

  return { update, hitMarker, toast, el: root };
}
