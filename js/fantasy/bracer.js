// Магический наруч на левом контроллере: браслет на предплечье + голографическая рунная панель над ним
// (мана, оружие, руны навыков с откатом, ульта, очки, время, FPS). Холст перерисовывается ≤10 раз/с и только при изменениях.
import * as THREE from 'three';
import { loadFantasyFonts, FONT_HEAD, FONT_BODY, paintRuneTablet, platePath } from './ui.js';

const CYAN = '#3ec5ff', VIOLET = '#7c5cff', GOLD = '#ffd23f', DANGER = '#ff5a6e', LABEL = '#8fd3ff';
const TAU = Math.PI * 2;
const MAX_SKILLS = 6;

// шрифты — готовые строки (без сборки строк при отрисовке)
const F_LABEL = `bold 22px ${FONT_BODY}`;
const F_VALUE = `bold 48px ${FONT_BODY}`;
const F_NUM = `bold 28px ${FONT_BODY}`;
const F_WEAPON = `bold 28px ${FONT_BODY}`;
const F_ULT_S = `bold 14px ${FONT_BODY}`;
const F_ULT = `bold 21px ${FONT_BODY}`;
const F_ULT_FULL = `22px ${FONT_HEAD}`;
const F_FPS = `bold 18px ${FONT_BODY}`;

// готовые строки чисел 0..999 и процентов ульты (шаг 5 %)
const NUM = [];
for (let i = 0; i < 1000; i++) NUM.push(String(i));
const num = (n) => (n >= 0 && n < 1000 ? NUM[n] : String(n));
const ULT_TXT = [];
for (let i = 0; i <= 20; i++) ULT_TXT.push(i * 5 + '%');

// цвет руны навыка
const SKILL_COLORS = {
  'flash-step': '#7fe3ff', orb: '#b38cff', 'ki-wave': CYAN, slowmo: GOLD,
  barrier: '#5cf2d6', 'sky-step': '#cfe8ff', runes: '#c77dff', ult: '#ffb23f',
};
const colorOf = (id) => SKILL_COLORS[id] || '#9fb4e8';

// ---------- глифы навыков (s — половина размера) ----------
function hexagon(g, x, y, r) {
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    if (i) g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}
function glyph(g, id, x, y, s) {
  g.beginPath();
  switch (id) {
    case 'flash-step': // двойной шеврон и линии скорости
      g.moveTo(x - 0.35 * s, y - 0.6 * s); g.lineTo(x + 0.15 * s, y); g.lineTo(x - 0.35 * s, y + 0.6 * s);
      g.moveTo(x + 0.15 * s, y - 0.6 * s); g.lineTo(x + 0.65 * s, y); g.lineTo(x + 0.15 * s, y + 0.6 * s);
      g.moveTo(x - 1.0 * s, y - 0.3 * s); g.lineTo(x - 0.6 * s, y - 0.3 * s);
      g.moveTo(x - 0.9 * s, y); g.lineTo(x - 0.55 * s, y);
      g.moveTo(x - 1.0 * s, y + 0.3 * s); g.lineTo(x - 0.6 * s, y + 0.3 * s);
      g.stroke();
      break;
    case 'orb': { // сфера с ядром и орбитой
      g.arc(x, y, 0.55 * s, 0, TAU);
      g.stroke();
      g.beginPath(); g.arc(x, y, 0.25 * s, 0, TAU); g.fill();
      g.beginPath(); g.arc(x, y, 0.88 * s, -2.4, -0.4); g.stroke();
      g.beginPath(); g.arc(x + 0.88 * s * Math.cos(-0.4), y + 0.88 * s * Math.sin(-0.4), 0.15 * s, 0, TAU); g.fill();
      break;
    }
    case 'ki-wave': // источник и расходящиеся волны
      g.arc(x - 0.75 * s, y, 0.2 * s, 0, TAU);
      g.fill();
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.arc(x - 0.75 * s, y, (0.55 + k * 0.45) * s, -0.7, 0.7);
        g.stroke();
      }
      break;
    case 'slowmo': // песочные часы
      g.moveTo(x - 0.55 * s, y - 0.85 * s); g.lineTo(x + 0.55 * s, y - 0.85 * s);
      g.moveTo(x - 0.55 * s, y + 0.85 * s); g.lineTo(x + 0.55 * s, y + 0.85 * s);
      g.moveTo(x - 0.42 * s, y - 0.85 * s); g.lineTo(x + 0.42 * s, y + 0.85 * s);
      g.moveTo(x + 0.42 * s, y - 0.85 * s); g.lineTo(x - 0.42 * s, y + 0.85 * s);
      g.stroke();
      g.beginPath();
      g.moveTo(x, y + 0.3 * s); g.lineTo(x + 0.3 * s, y + 0.75 * s); g.lineTo(x - 0.3 * s, y + 0.75 * s);
      g.closePath();
      g.fill();
      break;
    case 'barrier': // шестиугольный щит
      hexagon(g, x, y, 0.88 * s);
      hexagon(g, x, y, 0.45 * s);
      g.stroke();
      break;
    case 'sky-step': // шаги вверх по воздуху
      g.moveTo(x - 0.6 * s, y - 0.05 * s); g.lineTo(x, y - 0.65 * s); g.lineTo(x + 0.6 * s, y - 0.05 * s);
      g.moveTo(x - 0.6 * s, y + 0.45 * s); g.lineTo(x, y - 0.15 * s); g.lineTo(x + 0.6 * s, y + 0.45 * s);
      g.moveTo(x - 0.75 * s, y + 0.85 * s); g.lineTo(x + 0.75 * s, y + 0.85 * s);
      g.stroke();
      break;
    case 'runes': // печать: круг с треугольником
      g.arc(x, y, 0.88 * s, 0, TAU);
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * TAU) / 3;
        if (i) g.lineTo(x + Math.cos(a) * 0.88 * s, y + Math.sin(a) * 0.88 * s);
        else g.moveTo(x + Math.cos(a) * 0.88 * s, y + Math.sin(a) * 0.88 * s);
      }
      g.closePath();
      g.stroke();
      g.beginPath(); g.arc(x, y, 0.13 * s, 0, TAU); g.fill();
      break;
    case 'ult': // солнце пробуждения
      g.arc(x, y, 0.32 * s, 0, TAU);
      g.fill();
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4, r2 = (i % 2 ? 0.75 : 0.98) * s;
        g.moveTo(x + Math.cos(a) * 0.5 * s, y + Math.sin(a) * 0.5 * s);
        g.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
      }
      g.stroke();
      break;
    default: // неизвестный навык — общая руна
      g.moveTo(x, y - 0.9 * s); g.lineTo(x + 0.5 * s, y - 0.3 * s); g.lineTo(x, y + 0.25 * s); g.lineTo(x - 0.5 * s, y - 0.3 * s);
      g.closePath();
      g.moveTo(x - 0.6 * s, y + 0.9 * s); g.lineTo(x, y + 0.25 * s); g.lineTo(x + 0.6 * s, y + 0.9 * s);
      g.stroke();
  }
}

// спрайты значков (готов / не готов) рисуются один раз на id
const IC = 80, IR = 31;
const iconCache = new Map();
function renderIcon(id, ready) {
  const c = document.createElement('canvas');
  c.width = c.height = IC;
  const g = c.getContext('2d');
  const x = IC / 2, y = IC / 2, col = colorOf(id);
  g.beginPath();
  g.arc(x, y, IR, 0, TAU);
  g.fillStyle = 'rgba(6,10,24,0.92)';
  g.fill();
  if (ready) {
    // яркая рамка готового навыка
    g.shadowColor = col;
    g.shadowBlur = 10;
    g.lineWidth = 4;
    g.strokeStyle = col;
    g.stroke();
    g.shadowBlur = 0;
    g.beginPath();
    g.arc(x, y, IR + 4, 0, TAU);
    g.lineWidth = 1.5;
    g.strokeStyle = GOLD;
    g.stroke();
  } else {
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(120,140,190,0.5)';
    g.stroke();
  }
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 3.6;
  g.strokeStyle = col;
  g.fillStyle = col;
  if (ready) { g.shadowColor = col; g.shadowBlur = 8; } else g.globalAlpha = 0.38;
  glyph(g, id, x, y, 19);
  return c;
}
function iconFor(id) {
  let e = iconCache.get(id);
  if (!e) {
    e = { ready: renderIcon(id, true), idle: renderIcon(id, false) };
    iconCache.set(id, e);
  }
  return e;
}

// ---------- геометрия браслета ----------
// профиль (радиус, ось) кольца: внутренняя стенка, золотые бортики, корпус, паз под рунную линию
const PROFILE = [
  [0.034, -0.036], [0.041, -0.036], [0.042, -0.032], [0.042, -0.026], [0.039, -0.023],
  [0.039, -0.005], [0.0372, -0.0025], [0.0372, 0.0025], [0.039, 0.005],
  [0.039, 0.023], [0.042, 0.026], [0.042, 0.032], [0.041, 0.036], [0.034, 0.036], [0.034, -0.036],
];
function bandGeometry() {
  const SEG = 10; // мало граней — «кованый» вид
  const geo = new THREE.LatheGeometry(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), SEG);
  const gold = new THREE.Color(0xb8902f), body = new THREE.Color(0x2e2440);
  const groove = new THREE.Color(0x0e1424), inner = new THREE.Color(0x15121c);
  const cols = PROFILE.map(([r]) => (r >= 0.0415 ? gold : r < 0.035 ? inner : r < 0.038 ? groove : body));
  const n = geo.attributes.position.count, np = PROFILE.length;
  const arr = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const c = cols[v % np]; // вершины идут кольцами по профилю
    arr[v * 3] = c.r; arr[v * 3 + 1] = c.g; arr[v * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  geo.rotateX(Math.PI / 2); // ось кольца вдоль Z — вдоль предплечья
  return geo;
}

// слияние кусков в один меш с цветом вершин (для свечения)
function mergeColored(parts) {
  let n = 0;
  const list = parts.map(({ geo, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    n += g.attributes.position.count;
    return { g, color: new THREE.Color(color) };
  });
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const { g, color } of list) {
    const cnt = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    for (let i = 0; i < cnt; i++) {
      col[(o + i) * 3] = color.r; col[(o + i) * 3 + 1] = color.g; col[(o + i) * 3 + 2] = color.b;
    }
    o += cnt;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
function glowGeometry() {
  const parts = [];
  // рунная линия в пазу
  parts.push({ geo: new THREE.TorusGeometry(0.0374, 0.0015, 4, 20), color: CYAN });
  // руны-риски на корпусе (толщина — по радиусу)
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 + Math.PI / 8;
    const g = new THREE.BoxGeometry(0.006, 0.0012, 0.0035);
    g.rotateZ(-a);
    g.translate(Math.sin(a) * 0.0392, Math.cos(a) * 0.0392, k % 2 ? 0.014 : -0.014);
    parts.push({ geo: g, color: k % 2 ? CYAN : VIOLET });
  }
  // кристалл-излучатель сверху: из него «растёт» голограмма
  const gem = new THREE.OctahedronGeometry(0.0065);
  gem.scale(1, 1.35, 0.8);
  gem.translate(0, 0.0445, 0);
  parts.push({ geo: gem, color: '#d9ccff' });
  return mergeColored(parts);
}

// =====================================================================
export function createBracer() {
  const group = new THREE.Group();
  group.name = 'fantasy-bracer';
  group.position.set(0, 0.035, 0.13); // как наручный HUD

  // браслет на предплечье: за манжетой перчатки, ось наклонена как предплечье (назад и вниз)
  const band = new THREE.Group();
  band.name = 'bracer-band';
  band.position.set(-0.02, -0.103, 0.069);
  band.rotation.x = 0.35;
  band.add(new THREE.Mesh(bandGeometry(), new THREE.MeshStandardMaterial({
    vertexColors: true, metalness: 0.55, roughness: 0.45, flatShading: true,
    side: THREE.DoubleSide, emissive: 0x0d0a14,
  })));
  band.add(new THREE.Mesh(glowGeometry(), new THREE.MeshBasicMaterial({
    vertexColors: true, fog: false, toneMapped: false,
  })));
  group.add(band);

  // голографическая панель
  const W = 512, H = 368;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.11, (0.11 * H) / W),
    new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    }),
  );
  panel.name = 'bracer-panel';
  panel.rotation.x = -1.0; // смотрит вверх и назад, к глазам
  panel.renderOrder = 10;
  group.add(panel);

  // точка касания (центр панели) — для «Ускорения восприятия»
  const touch = new THREE.Object3D();
  touch.name = 'bracer-touch';
  group.add(touch);
  group.userData.touchPoint = touch;

  // фон (стекло с рунной рамкой) — один раз
  const bg = document.createElement('canvas');
  bg.width = W;
  bg.height = H;
  paintRuneTablet(bg.getContext('2d'), W, H, {
    glass: true, margin: 6, chamfer: 26, bevel: 6, runeGap: 6, runeSize: 5, runeStep: 64, gemSize: 6, runeWidth: 2, seed: 3,
  });
  const manaGrad = ctx.createLinearGradient(100, 0, 400, 0);
  manaGrad.addColorStop(0, '#1d4fff');
  manaGrad.addColorStop(1, CYAN);
  const wGrad = ctx.createLinearGradient(338, 0, 484, 0);
  wGrad.addColorStop(0, VIOLET);
  wGrad.addColorStop(1, '#d08cff');

  // показанные значения (без аллокаций в update)
  const dId = new Array(MAX_SKILLS).fill('');
  const dReady = new Uint8Array(MAX_SKILLS);
  const dCd = new Int8Array(MAX_SKILLS);
  let dCount = 0, dManaBar = 0, dManaNum = 0, dUlt = 0, dScore = 0, dTime = 0, dDanger = false;
  let dHasW = false, dWName = '', dWMana = -1, dFps = -1;
  let lastDraw = -1e9, lastFpsDraw = -1e9;

  // текст с тёмной подложкой для читаемости на стекле
  function txt(str, x, y, font, color, align, maxW) {
    ctx.font = font;
    ctx.textAlign = align;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    if (maxW) ctx.fillText(str, x, y + 2, maxW); else ctx.fillText(str, x, y + 2);
    ctx.fillStyle = color;
    if (maxW) ctx.fillText(str, x, y, maxW); else ctx.fillText(str, x, y);
  }

  function bar(x, y, w, h, frac, fill, glow) {
    platePath(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(62,197,255,0.35)';
    ctx.stroke();
    if (frac <= 0) return;
    platePath(ctx, x, y, Math.max(h, w * frac), h, h / 2);
    ctx.fillStyle = fill;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0);
    ctx.textBaseline = 'middle';

    // очки и время
    txt('ОЧКИ', 30, 44, F_LABEL, LABEL, 'left');
    txt(num(dScore), 28, 88, F_VALUE, '#ffffff', 'left', 172);
    txt('ВРЕМЯ', 482, 44, F_LABEL, LABEL, 'right');
    txt(num(dTime), 484, 88, F_VALUE, dDanger ? DANGER : '#9fe7ff', 'right', 172);

    // кольцо ульты
    const UX = 256, UY = 66, UR = 36, full = dUlt >= 20;
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(UX, UY, UR, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(124,92,255,0.6)';
    ctx.beginPath();
    ctx.arc(UX, UY, UR - 8, 0, TAU);
    ctx.stroke();
    if (dUlt > 0) {
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.strokeStyle = full ? GOLD : '#b48cff';
      ctx.shadowColor = full ? GOLD : VIOLET;
      ctx.shadowBlur = full ? 16 : 8;
      ctx.beginPath();
      ctx.arc(UX, UY, UR, -Math.PI / 2, -Math.PI / 2 + (TAU * dUlt) / 20);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }
    if (full) {
      ctx.shadowColor = GOLD;
      ctx.shadowBlur = 10;
      txt('УЛЬТ', UX, UY + 1, F_ULT_FULL, GOLD, 'center', 58);
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    } else {
      txt('УЛЬТ', UX, UY - 11, F_ULT_S, '#b9a6ff', 'center');
      txt(ULT_TXT[dUlt], UX, UY + 10, F_ULT, '#ffffff', 'center', 56);
    }

    // мана: шкала с рунными делениями и число
    txt('МАНА', 30, 139, F_LABEL, '#7fc8ff', 'left');
    bar(100, 127, 300, 24, dManaBar / 100, manaGrad, CYAN);
    ctx.fillStyle = 'rgba(0,8,30,0.45)';
    for (let i = 1; i < 10; i++) ctx.fillRect(100 + i * 30 - 1, 130, 2, 18);
    txt(num(dManaNum), 484, 140, F_NUM, '#ffffff', 'right', 76);

    // оружие и его мана
    if (dHasW) {
      txt(dWName, 30, 187, F_WEAPON, GOLD, 'left', dWMana >= 0 ? 296 : 450);
      if (dWMana >= 0) bar(338, 180, 146, 14, dWMana / 20, wGrad, VIOLET);
    }

    // разделитель
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(30, 214, 452, 2);
    ctx.fillStyle = 'rgba(62,197,255,0.35)';
    ctx.fillRect(30, 216, 452, 1);

    // руны навыков: спрайт + радиальный откат
    const SY = 272, STEP = 76, x0 = 256 - ((dCount - 1) * STEP) / 2;
    for (let i = 0; i < dCount; i++) {
      const x = x0 + i * STEP, ic = iconFor(dId[i]);
      ctx.drawImage(dReady[i] ? ic.ready : ic.idle, x - IC / 2, SY - IC / 2);
      if (!dReady[i] && dCd[i] > 0) {
        const a0 = -Math.PI / 2, a1 = a0 + (TAU * dCd[i]) / 20;
        // тёмный сектор — оставшийся откат (по часовой от верха)
        ctx.beginPath();
        ctx.moveTo(x, SY);
        ctx.arc(x, SY, IR - 1, a0, a1);
        ctx.closePath();
        ctx.fillStyle = 'rgba(2,4,12,0.62)';
        ctx.fill();
        // светлая дуга — уже накоплено
        ctx.beginPath();
        ctx.arc(x, SY, IR, a1, a0 + TAU);
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.strokeStyle = colorOf(dId[i]);
        ctx.stroke();
      }
    }

    // FPS в правом нижнем углу
    if (dFps >= 0) {
      const fc = dFps >= 65 ? '#7dffb0' : dFps >= 45 ? GOLD : DANGER;
      txt(num(dFps), 440, 328, F_FPS, fc, 'right');
      txt('FPS', 446, 328, F_FPS, 'rgba(200,215,255,0.7)', 'left');
    }
    tex.needsUpdate = true;
  }

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const cdq = (v) => (Number.isFinite(v) ? Math.round(clamp01(v) * 20) : 0);

  // info = { mana, maxMana, skills: [{ id, name, ready, cooldown01 }], ult01, score, timeLeft, weapon: { name, mana01 }, fps }
  // cooldown01 — оставшаяся доля отката: 1 — только что применён, 0 — откат прошёл
  function update(info) {
    if (!info) return;
    const now = performance.now();
    if (now - lastDraw < 100) return; // не чаще ~10 раз в секунду

    const maxMana = info.maxMana > 0 ? info.maxMana : 100;
    const mana = Number.isFinite(info.mana) ? Math.max(0, info.mana) : 0;
    const manaBar = Math.round(clamp01(mana / maxMana) * 100);
    const manaNum = Math.round(mana);
    const ult = Number.isFinite(info.ult01) ? Math.min(20, Math.max(0, Math.floor(info.ult01 * 20 + 1e-4))) : 0;
    const score = Number.isFinite(info.score) ? Math.round(info.score) : 0;
    const tl = Number.isFinite(info.timeLeft) ? info.timeLeft : 0;
    const time = Math.max(0, Math.ceil(tl));
    const danger = tl <= 10 && tl > 0;
    const w = info.weapon;
    const hasW = !!w;
    const wName = hasW && w.name != null ? (typeof w.name === 'string' ? w.name : String(w.name)) : '';
    const wMana = hasW && Number.isFinite(w.mana01) ? Math.round(clamp01(w.mana01) * 20) : -1;
    const fps = Number.isFinite(info.fps) ? Math.round(info.fps) : -1;
    const sk = Array.isArray(info.skills) ? info.skills : null;
    const count = sk ? Math.min(MAX_SKILLS, sk.length) : 0;

    let changed = manaBar !== dManaBar || manaNum !== dManaNum || ult !== dUlt || score !== dScore ||
      time !== dTime || danger !== dDanger || hasW !== dHasW || wName !== dWName || wMana !== dWMana ||
      count !== dCount;
    for (let i = 0; !changed && i < count; i++) {
      const s = sk[i];
      const id = (s && s.id) || '';
      const rd = s && s.ready ? 1 : 0;
      const cd = rd || !s ? 0 : cdq(s.cooldown01);
      if (id !== dId[i] || rd !== dReady[i] || cd !== dCd[i]) changed = true;
    }
    const fpsChanged = fps !== dFps;
    // одно лишь FPS меняется постоянно — его обновляем не чаще 2 раз в секунду
    if (!changed && !(fpsChanged && now - lastFpsDraw >= 500)) return;

    dManaBar = manaBar; dManaNum = manaNum; dUlt = ult; dScore = score; dTime = time; dDanger = danger;
    dHasW = hasW; dWName = wName; dWMana = wMana; dFps = fps; dCount = count;
    for (let i = 0; i < count; i++) {
      const s = sk[i];
      dId[i] = (s && s.id) || '';
      dReady[i] = s && s.ready ? 1 : 0;
      dCd[i] = dReady[i] || !s ? 0 : cdq(s.cooldown01);
    }
    draw();
    lastDraw = now;
    if (fpsChanged) lastFpsDraw = now;
  }

  draw(); // сразу с запасным шрифтом
  loadFantasyFonts().then(draw); // и ещё раз, когда шрифты загрузятся
  return { group, update };
}
