// Настройки игрока: одно хранилище 'vr-tir-settings' (JSON) + зеркала старых ключей:
// 'vr-tir-quality' читает quality.js, 'vr-tir-comfort' — vr-comfort.js.
// Блок «НАСТРОЙКИ» на стартовом экране строит buildSettingsUi().
import { QUALITY, isStandaloneHeadset } from './quality.js';
import { setVolumes } from './sfx.js';

const STORAGE_KEY = 'vr-tir-settings';
const QUALITY_KEY = 'vr-tir-quality';
const COMFORT_KEY = 'vr-tir-comfort';

export const DEFAULT_SETTINGS = Object.freeze({
  sensitivity: 1,      // множитель обзора мышью и касанием, 0.2..3
  fov: 70,             // поле зрения на ПК, 60..100°
  invertY: false,
  musicVolume: 0.7,    // 0..1
  sfxVolume: 1,        // 0..1
  quality: 'auto',     // 'auto' | 'high' | 'medium' | 'low'
  turn: 'snap',        // поворот в VR: 'snap' | 'smooth'
  vignette: true,      // затемнение краёв при движении в VR
  mode: 'fantasy',     // режим в VR: 'fantasy' — «Арена магов» | 'realism' — реалистичное оружие
  vrReload: 'hands',   // 'hands' — магазин с пояса (хват тоже работает) | 'button' — кнопкой хвата
  holsters: true,      // кобуры на теле в VR
  leftHanded: false,   // оружие в левой руке
});

const QUALITY_IDS = ['high', 'medium', 'low'].filter((id) => QUALITY[id]);

// ---------- проверка значений ----------
const round = (v, k) => Math.round(v * k) / k;
const num = (v, min, max, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const bool = (v, d) => (typeof v === 'boolean' ? v : d);

function sanitize(s) {
  const D = DEFAULT_SETTINGS;
  s.sensitivity = round(num(s.sensitivity, 0.2, 3, D.sensitivity), 100);
  s.fov = Math.round(num(s.fov, 60, 100, D.fov));
  s.invertY = bool(s.invertY, D.invertY);
  s.musicVolume = round(num(s.musicVolume, 0, 1, D.musicVolume), 100);
  s.sfxVolume = round(num(s.sfxVolume, 0, 1, D.sfxVolume), 100);
  s.quality = QUALITY_IDS.includes(s.quality) ? s.quality : 'auto';
  s.turn = s.turn === 'smooth' ? 'smooth' : 'snap';
  s.vignette = bool(s.vignette, D.vignette);
  s.mode = s.mode === 'realism' ? 'realism' : 'fantasy';
  s.vrReload = s.vrReload === 'button' ? 'button' : 'hands';
  s.holsters = bool(s.holsters, D.holsters);
  s.leftHanded = bool(s.leftHanded, D.leftHanded);
  return s;
}

// ---------- хранилище ----------
function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    const o = raw ? JSON.parse(raw) : null;
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

function load() {
  const s = { ...DEFAULT_SETTINGS };
  const stored = readJson(STORAGE_KEY);
  // чужие ключи тоже сохраняем: другие модули могут дописывать свои настройки
  if (stored) for (const k of Object.keys(stored)) if (k !== '__proto__') s[k] = stored[k];
  // старые ключи главнее: их читают quality.js и vr-comfort.js
  let q = null;
  try { q = localStorage.getItem(QUALITY_KEY); } catch {}
  s.quality = QUALITY_IDS.includes(q) ? q : 'auto';
  const c = readJson(COMFORT_KEY);
  if (c) {
    if (c.turn !== undefined) s.turn = c.turn;
    if (c.vignette !== undefined) s.vignette = c.vignette;
  }
  return sanitize(s);
}

export const settings = load();

const listeners = new Set();
const controls = {}; // key → функция, ставящая значение в элемент блока «НАСТРОЙКИ»
let dirty = false;   // ползунок двигали, но 'change' ещё не пришёл

const applyVolumes = () => setVolumes({ music: settings.musicVolume, sfx: settings.sfxVolume });
applyVolumes();

// сохранить настройки и зеркала старых ключей
export function saveSettings() {
  sanitize(settings);
  dirty = false;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* приватный режим */ }
  try {
    if (settings.quality === 'auto') localStorage.removeItem(QUALITY_KEY);
    else localStorage.setItem(QUALITY_KEY, settings.quality);
  } catch {}
  try {
    const prev = readJson(COMFORT_KEY) || {};
    localStorage.setItem(COMFORT_KEY, JSON.stringify({ ...prev, turn: settings.turn, vignette: settings.vignette }));
  } catch {}
  applyVolumes();
}

// fn(key, value, settings) после каждого изменения; возвращает функцию отписки
export function onSettingsChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(key) {
  for (const fn of listeners) {
    try { fn(key, settings[key], settings); } catch (e) { console.warn('[settings]', key, e); }
  }
}

// программная смена (например, из меню в VR): сохраняет, обновляет блок на экране, оповещает
export function setSetting(key, value) {
  settings[key] = value;
  saveSettings();
  if (controls[key]) controls[key](settings[key]);
  emit(key);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { if (dirty) saveSettings(); });
}

// ---------- интерфейс ----------
const CSS = `
#settings-section{max-width:680px;margin:18px auto 0;padding:16px 20px;border:1px solid rgba(62,197,255,.3);border-radius:18px;background:rgba(8,12,35,.78);text-align:left;color:#e8edff;font-size:14px;line-height:1.3}
#settings-section .set-title{margin:0 0 12px;font:700 15px/1.2 var(--body,system-ui,sans-serif);color:#9fe7ff;letter-spacing:.08em}
#settings-section .set-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:12px}
#settings-section fieldset{margin:0;padding:8px 12px 12px;min-width:0;border:1px solid rgba(124,92,255,.38);border-radius:14px;display:grid;gap:10px;align-content:start}
#settings-section legend{padding:0 6px;color:#9fe7ff;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
#settings-section .set-row{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px 12px}
#settings-section .set-row>label{flex:1 1 140px;min-width:0;cursor:pointer}
#settings-section .set-ctl{display:flex;align-items:center;gap:8px;flex:1 1 160px;min-width:0}
#settings-section input[type=range]{flex:1 1 auto;width:100%;min-width:0;height:26px;margin:0;accent-color:#3ec5ff;cursor:pointer;background:transparent}
#settings-section output{flex:none;min-width:3.6em;text-align:right;color:#9fe7ff;font-variant-numeric:tabular-nums}
#settings-section select{flex:0 1 auto;max-width:100%;padding:8px 10px;background:#111a31;color:#fff;border:1px solid #7385ba;border-radius:10px;font:inherit;cursor:pointer}
#settings-section .set-switch{-webkit-appearance:none;appearance:none;flex:none;width:46px;height:26px;margin:0;border-radius:999px;border:1px solid #7385ba;cursor:pointer;background:radial-gradient(circle at 12px 50%,#c9d3f5 0 7px,transparent 8px),#111a31}
#settings-section .set-switch:checked{border-color:#3ec5ff;background:radial-gradient(circle at calc(100% - 12px) 50%,#fff 0 7px,transparent 8px),#1d6f9a;box-shadow:0 0 10px rgba(62,197,255,.45)}
#settings-section input:focus-visible,#settings-section select:focus-visible{outline:2px solid #3ec5ff;outline-offset:2px}
#settings-section .set-hint{margin:-4px 0 0;color:#a9b6e6;font-size:12px}
@media (max-width:500px){#settings-section{padding:14px 12px}#settings-section fieldset{padding:8px 10px 10px}}`;

function injectStyle() {
  if (document.getElementById('settings-style')) return;
  const st = document.createElement('style');
  st.id = 'settings-style';
  st.textContent = CSS;
  document.head.appendChild(st);
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids) if (kid != null) e.append(kid);
  return e;
}

// подсказка под строкой, связанная с элементом через aria-describedby
function hintFor(input, id, text) {
  if (!text) return null;
  input.setAttribute('aria-describedby', id);
  return el('p', { class: 'set-hint', id, text });
}

// ползунок: на 'input' — значение и оповещение сразу, сохранение — на 'change'
function rangeRow(key, { label, min, max, step, scale = 1, fmt }) {
  const id = `set-${key}`;
  const input = el('input', { type: 'range', id, min, max, step });
  const out = el('output', { for: id, 'aria-hidden': 'true' });
  const show = (v) => {
    input.value = String(round(v * scale, 100));
    out.textContent = fmt(v);
    input.setAttribute('aria-valuetext', fmt(v));
  };
  show(settings[key]);
  controls[key] = show;
  input.addEventListener('input', () => {
    settings[key] = Number(input.value) / scale;
    sanitize(settings);
    out.textContent = fmt(settings[key]);
    input.setAttribute('aria-valuetext', fmt(settings[key]));
    dirty = true;
    if (key === 'musicVolume' || key === 'sfxVolume') applyVolumes();
    emit(key);
  });
  input.addEventListener('change', saveSettings);
  return el('div', { class: 'set-row' }, el('label', { for: id, text: label }), el('span', { class: 'set-ctl' }, input, out));
}

function selectRow(key, { label, options, hint, onChange }) {
  const id = `set-${key}`;
  const sel = el('select', { id });
  for (const [value, text] of options) sel.append(el('option', { value, text }));
  const show = (v) => { sel.value = String(v); };
  show(settings[key]);
  controls[key] = show;
  sel.addEventListener('change', () => {
    settings[key] = sel.value;
    saveSettings();
    show(settings[key]);
    if (onChange) onChange(settings[key]);
    emit(key);
  });
  const row = el('div', { class: 'set-row' }, el('label', { for: id, text: label }), sel);
  const h = hintFor(sel, `${id}-hint`, hint);
  return h ? [row, h] : [row];
}

function toggleRow(key, { label, hint }) {
  const id = `set-${key}`;
  const cb = el('input', { type: 'checkbox', id, class: 'set-switch', role: 'switch' });
  const show = (v) => { cb.checked = !!v; };
  show(settings[key]);
  controls[key] = show;
  cb.addEventListener('change', () => {
    settings[key] = cb.checked;
    saveSettings();
    emit(key);
  });
  const row = el('div', { class: 'set-row' }, el('label', { for: id, text: label }), cb);
  const h = hintFor(cb, `${id}-hint`, hint);
  return h ? [row, h] : [row];
}

function group(title, ...rows) {
  return el('fieldset', {}, el('legend', { text: title }), ...rows.flat());
}

// что выберет «Авто» на этом устройстве (как detectQuality без ручных переопределений)
function autoQualityLabel() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const id = isStandaloneHeadset(ua) ? 'low' : /Android|iPhone|iPad|Mobile/i.test(ua) ? 'medium' : 'high';
  return (QUALITY[id] || QUALITY.high).label;
}

const pct = (v) => `${Math.round(v * 100)} %`;
const NOTE_QUALITY = 'Качество «Низкое» включается само в автономных шлемах (Quest, Pico).';
const NOTE_RELOAD = 'Новое качество применится после перезагрузки страницы.';

// блок «НАСТРОЙКИ» в '.ov-inner' перед '#mp-section' (иначе перед '.ov-foot'); заменяет старый
export function buildSettingsUi({ qualityLabel } = {}) {
  if (typeof document === 'undefined') return null;
  const host = document.getElementById('menu-settings-content') || document.querySelector('.ov-inner');
  if (!host) return null;
  injectStyle();
  document.getElementById('settings-section')?.remove();
  for (const k of Object.keys(controls)) delete controls[k];

  const autoLabel = String(qualityLabel || autoQualityLabel()).toLowerCase();
  const note = el('p', { class: 'set-hint', id: 'set-note', 'aria-live': 'polite', text: NOTE_QUALITY });
  const qualityRows = selectRow('quality', {
    label: 'Качество графики',
    options: [['auto', `Авто (сейчас: ${autoLabel})`], ...QUALITY_IDS.map((id) => [id, QUALITY[id].label])],
    onChange: () => { note.textContent = NOTE_RELOAD; },
  });
  qualityRows[0].querySelector('select').setAttribute('aria-describedby', 'set-note');

  const sec = el('section', { id: 'settings-section', 'aria-labelledby': 'set-title' },
    el('h2', { class: 'set-title', id: 'set-title', text: 'НАСТРОЙКИ' }),
    el('div', { class: 'set-groups' },
      group('Управление',
        rangeRow('sensitivity', { label: 'Чувствительность мыши', min: 0.2, max: 3, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` }),
        rangeRow('fov', { label: 'Поле зрения', min: 60, max: 100, step: 1, fmt: (v) => `${Math.round(v)}°` }),
        toggleRow('invertY', { label: 'Инвертировать ось Y' }),
      ),
      group('Звук',
        rangeRow('musicVolume', { label: 'Музыка', min: 0, max: 100, step: 1, scale: 100, fmt: pct }),
        rangeRow('sfxVolume', { label: 'Эффекты', min: 0, max: 100, step: 1, scale: 100, fmt: pct }),
      ),
      group('Графика', qualityRows, note),
      group('VR',
        selectRow('mode', { label: 'Режим в VR', options: [['fantasy', 'Фэнтези — «Арена магов»'], ['realism', 'Реализм — ПМ, АК, СВ-98']] }),
        selectRow('turn', { label: 'Поворот в VR', options: [['snap', 'Рывком на 45°'], ['smooth', 'Плавно']] }),
        toggleRow('vignette', { label: 'Затемнение краёв при движении' }),
        selectRow('vrReload', {
          label: 'Перезарядка в VR',
          options: [['hands', 'Руками — магазин с пояса'], ['button', 'Кнопкой хвата']],
          hint: 'Кнопка хвата перезаряжает в любом режиме.',
        }),
        toggleRow('holsters', { label: 'Кобуры на теле' }),
        toggleRow('leftHanded', { label: 'Левша (оружие в левой руке)' }),
      ),
    ),
  );

  // только внутри '.ov-inner': оверлей гасит клики, и они не долетают до canvas
  const mp = document.getElementById('mp-section');
  const anchor = (mp && host.contains(mp) ? mp : null) || host.querySelector('.ov-foot');
  if (anchor) anchor.parentNode.insertBefore(sec, anchor);
  else host.appendChild(sec);
  return sec;
}
