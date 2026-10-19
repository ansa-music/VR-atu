// Фэнтези-интерфейс: табло и меню — парящие каменные скрижали (canvas-текстура на плоскости + каменная плита)
// API как у js/ui.js (createScoreboard / createMenu) + выбор режима в меню.
import * as THREE from 'three';

// ---------- шрифты (Google Fonts с кириллицей; до загрузки — запасной serif) ----------
export const FONT_HEAD = "'Ruslan Display', 'Philosopher', Georgia, serif";
export const FONT_BODY = "'Philosopher', Georgia, 'Times New Roman', serif";
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Ruslan+Display&family=Philosopher:wght@400;700&display=swap';
let fontsPromise = null;

// Подключает шрифты один раз; промис выполняется, когда они готовы (или не загрузились — тогда false)
export function loadFantasyFonts() {
  if (fontsPromise) return fontsPromise;
  if (typeof document === 'undefined' || !document.fonts) return (fontsPromise = Promise.resolve(false));
  const sheetReady = new Promise((resolve) => {
    let link = document.querySelector('link[href*="Ruslan+Display"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FONT_CSS;
      document.head.appendChild(link);
    } else if (link.sheet) {
      resolve();
      return;
    }
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', resolve, { once: true });
    setTimeout(resolve, 6000); // нет сети — не ждём вечно
  });
  const sample = 'АРЕНА МАГОВ Очки ВПЕРЁД 0123456789';
  fontsPromise = sheetReady
    .then(() => Promise.all([
      document.fonts.load(`64px 'Ruslan Display'`, sample),
      document.fonts.load(`64px 'Philosopher'`, sample),
      document.fonts.load(`bold 64px 'Philosopher'`, sample),
    ]))
    .then(() => true, () => false);
  return fontsPromise;
}

// ---------- палитра ----------
const CYAN = '#3ec5ff', VIOLET = '#7c5cff', GOLD = '#ffd23f';
const TEXT = '#f4f6ff', MUTED = '#a9b8dc', LABEL = '#8fd3ff', DANGER = '#ff5a6e';

// ---------- генератор случайных чисел с зерном (рисунок камня одинаковый при каждой отрисовке) ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// мелкая зернистость камня — общий тайл 128×128
let noiseTile = null;
function getNoise() {
  if (noiseTile) return noiseTile;
  noiseTile = makeCanvas(128, 128);
  const g = noiseTile.getContext('2d');
  const img = g.createImageData(128, 128);
  const r = rng(91);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r();
    let c, a;
    if (v > 0.965) { c = 230; a = 55; }      // светлые крупинки
    else if (v < 0.09) { c = 0; a = 80; }    // тёмные поры
    else { c = 70 + r() * 110; a = r() * 26; }
    img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
    img.data[i + 3] = a;
  }
  g.putImageData(img, 0, 0);
  return noiseTile;
}

// ---------- контуры ----------
// прямоугольник со срезанными углами (резная скрижаль)
function chamferPath(ctx, x, y, w, h, c) {
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

// плашка с заострёнными концами (кнопки, шкалы)
export function platePath(ctx, x, y, w, h, c) {
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h / 2);
  ctx.closePath();
}

// точка внутри плашки platePath (для pick)
function inPlate(px, py, b) {
  if (py < b.y || py > b.y + b.h) return false;
  const k = (b.c * Math.abs(py - (b.y + b.h / 2))) / (b.h / 2);
  return px >= b.x + k && px <= b.x + b.w - k;
}

// золотой ромб-самоцвет
function gem(ctx, x, y, rx, ry, core) {
  ctx.beginPath();
  ctx.moveTo(x, y - ry);
  ctx.lineTo(x + rx, y);
  ctx.lineTo(x, y + ry);
  ctx.lineTo(x - rx, y);
  ctx.closePath();
  const g = ctx.createLinearGradient(x, y - ry, x, y + ry);
  g.addColorStop(0, '#fff2b0');
  g.addColorStop(0.45, GOLD);
  g.addColorStop(1, '#9a6a12');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, rx * 0.14);
  ctx.strokeStyle = '#4a3206';
  ctx.stroke();
  if (core) {
    ctx.beginPath();
    ctx.arc(x, y, Math.min(rx, ry) * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = core;
    ctx.shadowColor = core;
    ctx.shadowBlur = rx * 0.8;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }
}

// руны-глифы: ломаные в единичном квадрате (−1..1, y вниз)
const RUNES = [
  [[0, -1, 0, 1], [0, -0.55, 0.7, -1], [0, -0.05, 0.7, -0.5]],
  [[0, -1, 0, 1], [0, -0.1, -0.7, -0.85], [0, -0.1, 0.7, -0.85]],
  [[0, -1, 0.65, -0.3, 0, 0.35, -0.65, -0.3, 0, -1], [-0.65, 1, 0, 0.35, 0.65, 1]],
  [[0, -1, 0, 1], [-0.7, -0.35, 0, -1, 0.7, -0.35]],
  [[-0.6, -1, -0.6, 1], [0.6, -1, 0.6, 1], [-0.6, -1, 0.6, 0.15], [0.6, -1, -0.6, 0.15]],
  [[-0.35, -1, -0.35, 1], [-0.35, -0.6, 0.45, -0.1, -0.35, 0.4]],
  [[-0.5, -1, -0.5, 1], [-0.5, -1, 0.5, -0.5, -0.5, 0], [-0.5, 0, 0.5, 1]],
  [[0, -1, 0.7, 0, 0, 1, -0.7, 0, 0, -1]],
];
function addRune(ctx, idx, cx, cy, s) {
  const lines = RUNES[idx % RUNES.length];
  for (const p of lines) {
    ctx.moveTo(cx + p[0] * s, cy + p[1] * s);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(cx + p[i] * s, cy + p[i + 1] * s);
  }
}

// ---------- каменная скрижаль: фон рисуется один раз в отдельный canvas ----------
// o: margin, chamfer, bevel, runeGap, runeSize, runeStep, medallion, glass, seed
export function paintRuneTablet(ctx, W, H, o = {}) {
  const m = o.margin ?? 10, c = o.chamfer ?? 36, bev = o.bevel ?? 12;
  const glass = !!o.glass, rs = o.runeSize ?? 9, step = o.runeStep ?? 120;
  const r = rng(o.seed ?? 7);
  const ri = m + bev + (o.runeGap ?? 10);      // отступ рунной линии
  const rc = Math.max(4, c - 0.586 * (ri - m)); // срез угла на рунной линии
  ctx.clearRect(0, 0, W, H);
  ctx.save();

  // основа + внешнее свечение
  chamferPath(ctx, m, m, W - 2 * m, H - 2 * m, c);
  ctx.shadowColor = glass ? 'rgba(62,197,255,0.85)' : 'rgba(124,92,255,0.8)';
  ctx.shadowBlur = m * 1.5;
  ctx.fillStyle = glass ? 'rgba(6,12,30,0.8)' : '#1c2130';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // поверхность внутри контура
  ctx.save();
  ctx.clip();
  const sg = ctx.createLinearGradient(0, m, 0, H - m);
  if (glass) {
    sg.addColorStop(0, 'rgba(40,80,150,0.5)');
    sg.addColorStop(0.5, 'rgba(10,18,44,0.3)');
    sg.addColorStop(1, 'rgba(40,20,90,0.45)');
  } else {
    sg.addColorStop(0, '#3c4356');
    sg.addColorStop(0.5, '#272c3b');
    sg.addColorStop(1, '#161a25');
  }
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, W, H);
  if (glass) {
    // строки голограммы
    ctx.fillStyle = 'rgba(120,200,255,0.06)';
    for (let y = m; y < H - m; y += 4) ctx.fillRect(0, y, W, 1);
  } else {
    // зерно, пятна и трещины камня
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = ctx.createPattern(getNoise(), 'repeat');
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    for (let i = 0; i < 9; i++) {
      const x = r() * W, y = r() * H, rad = (0.15 + r() * 0.35) * H;
      const bg = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const dark = r() < 0.6;
      bg.addColorStop(0, dark ? 'rgba(0,0,0,0.22)' : 'rgba(170,185,220,0.08)');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 5; i++) {
      // трещина от края внутрь: тёмная линия + светлый скол рядом
      let x = r() < 0.5 ? m + r() * W * 0.25 : W - m - r() * W * 0.25;
      let y = r() < 0.5 ? m + 2 : H - m - 2;
      const dirY = y < H / 2 ? 1 : -1;
      const pts = [x, y];
      const n = 4 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        x += (r() - 0.5) * H * 0.12;
        y += dirY * r() * H * 0.07;
        pts.push(x, y);
      }
      for (let pass = 0; pass < 2; pass++) {
        const d = pass ? 1.2 : 0; // путь фиксируется при построении, поэтому сдвиг — в координатах
        ctx.beginPath();
        ctx.moveTo(pts[0] + d, pts[1] + d);
        for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k] + d, pts[k + 1] + d);
        ctx.lineWidth = pass ? 1 : 1.6;
        ctx.strokeStyle = pass ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.45)';
        ctx.stroke();
      }
    }
  }
  // скос кромки: верх светлее, низ темнее (видна только внутренняя половина толстой обводки)
  chamferPath(ctx, m, m, W - 2 * m, H - 2 * m, c);
  const bg = ctx.createLinearGradient(0, m, 0, H - m);
  bg.addColorStop(0, glass ? 'rgba(140,220,255,0.35)' : 'rgba(255,255,255,0.3)');
  bg.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  bg.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.lineWidth = bev * 2;
  ctx.strokeStyle = bg;
  ctx.stroke();
  ctx.restore();

  // резной паз по внутреннему краю скоса
  const ib = m + bev;
  chamferPath(ctx, ib, ib, W - 2 * ib, H - 2 * ib, c - 0.586 * bev);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.stroke();
  chamferPath(ctx, ib, ib + 1.5, W - 2 * ib, H - 2 * ib, c - 0.586 * bev);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.stroke();
  // тонкий кант по внешнему краю
  chamferPath(ctx, m + 1, m + 1, W - 2 * m - 2, H - 2 * m - 2, c - 0.6);
  ctx.lineWidth = 2;
  ctx.strokeStyle = glass ? 'rgba(62,197,255,0.85)' : 'rgba(255,210,63,0.45)';
  ctx.stroke();

  // рунная линия: стороны и скосы целиком, верх и низ — с разрывами под руны
  const x0 = ri + rc, x1 = W - ri - rc, yT = ri, yB = H - ri;
  const medR = o.medallion ?? 0;
  const len = x1 - x0, slots = Math.max(1, Math.floor(len / step));
  ctx.beginPath();
  ctx.moveTo(x1, yT);
  ctx.lineTo(W - ri, yT + rc);
  ctx.lineTo(W - ri, yB - rc);
  ctx.lineTo(x1, yB);
  ctx.moveTo(x0, yB);
  ctx.lineTo(ri, yB - rc);
  ctx.lineTo(ri, yT + rc);
  ctx.lineTo(x0, yT);
  let runeIdx = Math.floor(r() * RUNES.length);
  for (let edge = 0; edge < 2; edge++) {
    const y = edge === 0 ? yT : yB;
    let from = x0;
    for (let i = 0; i < slots; i++) {
      const px = x0 + ((i + 0.5) * len) / slots;
      if (edge === 0 && medR > 0 && Math.abs(px - W / 2) < medR + rs * 1.6) continue;
      ctx.moveTo(from, y);
      ctx.lineTo(px - rs - 5, y);
      addRune(ctx, runeIdx++, px, y, rs);
      from = px + rs + 5;
    }
    if (edge === 0 && medR > 0) {
      // разрыв под медальон в центре верхней кромки
      const a = W / 2 - medR - 6, b = W / 2 + medR + 6;
      if (from < a) { ctx.moveTo(from, y); ctx.lineTo(a, y); }
      from = Math.max(from, b);
    }
    ctx.moveTo(from, y);
    ctx.lineTo(x1, y);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const lw = o.runeWidth ?? 2.6;
  ctx.lineWidth = lw + 5;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.stroke();
  const ng = ctx.createLinearGradient(0, 0, W, 0);
  ng.addColorStop(0, CYAN);
  ng.addColorStop(0.5, VIOLET);
  ng.addColorStop(1, CYAN);
  ctx.lineWidth = lw;
  ctx.strokeStyle = ng;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = lw * 4;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = lw * 0.4;
  ctx.strokeStyle = 'rgba(225,245,255,0.75)';
  ctx.stroke();

  // золотые самоцветы на скосах рунной линии и медальон сверху
  const gs = o.gemSize ?? 9;
  const h = rc / 2;
  gem(ctx, ri + h, yT + h, gs, gs * 1.25);
  gem(ctx, W - ri - h, yT + h, gs, gs * 1.25);
  gem(ctx, ri + h, yB - h, gs, gs * 1.25);
  gem(ctx, W - ri - h, yB - h, gs, gs * 1.25);
  if (medR > 0) gem(ctx, W / 2, yT, medR, medR * 1.15, CYAN);
  ctx.restore();
  return { inset: ri };
}

// ---------- текст ----------
// выбитый в камне текст: тёмная тень снизу, затем цвет (и свечение, если задано)
function carve(ctx, str, x, y, size, font, color, { align = 'center', maxW, glow } = {}) {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  const dy = Math.max(2, size * 0.05);
  if (maxW) ctx.fillText(str, x, y + dy, maxW);
  else ctx.fillText(str, x, y + dy);
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = size * 0.35;
  }
  ctx.fillStyle = color;
  if (maxW) ctx.fillText(str, x, y, maxW);
  else ctx.fillText(str, x, y);
  if (glow) {
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }
}
const head = (s) => `${s}px ${FONT_HEAD}`;
const body = (s, bold = true) => `${bold ? 'bold ' : ''}${s}px ${FONT_BODY}`;

// ---------- панель: canvas + текстура + плоскость + каменная плита сзади ----------
let slabMat = null;
function makePanel(w, h, W, H, margin, chamfer, depth) {
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, fog: false, toneMapped: false }),
  );
  // объёмная плита по тому же контуру (пиксели → метры), лучи её не замечают
  if (!slabMat) {
    slabMat = new THREE.MeshStandardMaterial({ color: 0x2a3042, roughness: 0.92, metalness: 0.05, emissive: 0x0b0e18 });
  }
  const k = w / W;
  const hw = w / 2 - margin * k, hh = h / 2 - margin * k, cc = chamfer * k;
  const shape = new THREE.Shape();
  shape.moveTo(-hw + cc, hh);
  shape.lineTo(hw - cc, hh);
  shape.lineTo(hw, hh - cc);
  shape.lineTo(hw, -hh + cc);
  shape.lineTo(hw - cc, -hh);
  shape.lineTo(-hw + cc, -hh);
  shape.lineTo(-hw, -hh + cc);
  shape.lineTo(-hw, hh - cc);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1, steps: 1 });
  geo.translate(0, 0, -depth - 0.004);
  const slab = new THREE.Mesh(geo, slabMat);
  slab.name = 'tablet-slab';
  slab.raycast = () => {}; // попадания и pick(uv) — только по лицевой плоскости
  mesh.add(slab);
  const bg = makeCanvas(W, H);
  return { canvas, ctx, texture, mesh, bg, bgCtx: bg.getContext('2d') };
}

// шкала-паз с заполнением (концы заострены)
function grooveBar(ctx, x, y, w, h, frac, fill, glow) {
  platePath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.stroke();
  if (frac <= 0) return;
  const fw = Math.max(h, w * frac);
  platePath(ctx, x, y, fw, h, h / 2);
  ctx.fillStyle = fill;
  ctx.shadowColor = glow;
  ctx.shadowBlur = h * 0.8;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  // блик сверху
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(x + h / 2, y + 2, Math.max(0, fw - h), Math.max(1, h * 0.18));
}

// =====================================================================
// Табло 4 × 1 м: ОЧКИ / ВРЕМЯ / КОМБО (+ ВОЛНА), шкала времени
// =====================================================================
export function createFantasyBoard() {
  const W = 1024, H = 256;
  const P = makePanel(4, 1, W, H, 8, 34, 0.09);
  const { ctx, texture, mesh } = P;
  mesh.name = 'fantasy-board';
  paintRuneTablet(P.bgCtx, W, H, { margin: 8, chamfer: 34, bevel: 11, runeGap: 9, runeSize: 8, runeStep: 112, medallion: 15, seed: 11 });
  const BX = 64, BY = 198, BW = W - 128, BH = 16;
  const barFill = ctx.createLinearGradient(BX, 0, BX + BW, 0);
  barFill.addColorStop(0, CYAN);
  barFill.addColorStop(1, VIOLET);

  // последние показанные значения
  let sScore = 0, sTime = 0, sMult = 1, sFrac = 100, sWave = null, sDanger = false;
  let drawn = false;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(P.bg, 0, 0);
    const hasWave = sWave !== null;
    const n = hasWave ? 4 : 3;
    const L = 44, R = W - 44, cw = (R - L) / n;
    // разделители колонок: резной паз + золотой ромб
    for (let i = 1; i < n; i++) {
      const x = L + cw * i;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - 1.5, 52, 3, 124);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(x + 1.5, 52, 1, 124);
      gem(ctx, x, 114, 7, 10);
    }
    const timeColor = sDanger ? DANGER : '#9fe7ff';
    for (let i = 0; i < n; i++) {
      const x = L + cw * (i + 0.5);
      let label, value, color, glow = null;
      if (i === 0) { label = 'ОЧКИ'; value = String(sScore); color = TEXT; }
      else if (i === 1) { label = 'ВРЕМЯ'; value = String(sTime); color = timeColor; glow = sDanger ? DANGER : null; }
      else if (i === 2) { label = 'КОМБО'; value = '×' + sMult; color = GOLD; glow = sMult >= 2 ? GOLD : null; }
      else { label = 'ВОЛНА'; value = String(sWave); color = '#d2c4ff'; glow = VIOLET; }
      carve(ctx, label, x, 66, 36, head(36), LABEL, { maxW: cw - 30 });
      carve(ctx, value, x, 140, 100, body(100), color, { maxW: cw - 28, glow });
    }
    grooveBar(ctx, BX, BY, BW, BH, sFrac / 100, sDanger ? DANGER : barFill, sDanger ? DANGER : CYAN);
    texture.needsUpdate = true;
    drawn = true;
  }

  function update({ score = 0, timeLeft = 0, multiplier = 1, timeFrac, wave } = {}) {
    const time = Math.max(0, Math.ceil(timeLeft));
    // timeFrac — оставшаяся доля раунда 0..1; нет значения → 1
    const frac = Number.isFinite(timeFrac) ? Math.round(Math.min(1, Math.max(0, timeFrac)) * 100) : 100;
    const w = typeof wave === 'number' && Number.isFinite(wave) ? wave : null;
    const danger = timeLeft <= 10 && timeLeft > 0;
    if (drawn && score === sScore && time === sTime && multiplier === sMult && frac === sFrac &&
        w === sWave && danger === sDanger) return; // перерисовка только при изменении
    sScore = score; sTime = time; sMult = multiplier; sFrac = frac; sWave = w; sDanger = danger;
    draw();
  }

  update({ score: 0, timeLeft: 0, multiplier: 1 });
  loadFantasyFonts().then(draw);
  return { mesh, update };
}

// =====================================================================
// Меню 2.4 × 1.2 м: старт с выбором режима, отсчёт, итоги
// =====================================================================
// кнопки в пикселях холста 1024×512 (y вниз); pick() проверяет ровно эти плашки
const BTN_FANTASY = { id: 'mode-fantasy', x: 92, y: 230, w: 400, h: 78, c: 24 };
const BTN_REALISM = { id: 'mode-realism', x: 532, y: 230, w: 400, h: 78, c: 24 };
const BTN_START = { id: 'start', x: 132, y: 364, w: 760, h: 98, c: 36 };
const START_BTNS = [BTN_FANTASY, BTN_REALISM, BTN_START];
const RESULT_BTNS = [BTN_START];
const NO_BTNS = [];

export function createFantasyMenu() {
  const W = 1024, H = 512, cx = W / 2;
  const P = makePanel(2.4, 1.2, W, H, 10, 46, 0.07);
  const { ctx, texture, mesh } = P;
  mesh.name = 'fantasy-menu';
  paintRuneTablet(P.bgCtx, W, H, { margin: 10, chamfer: 46, bevel: 13, runeGap: 10, runeSize: 9, runeStep: 118, medallion: 17, seed: 5 });

  let buttons = NO_BTNS;
  let screen = 'start', lastRound = 60, lastMode = 'fantasy', lastCount = 3, lastResults = null;

  function begin() {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(P.bg, 0, 0);
  }

  // золотая кнопка действия: icon — 'play' | 'again'
  function actionButton(b, label, icon) {
    const { x, y, w, h, c } = b;
    platePath(ctx, x, y, w, h, c);
    ctx.shadowColor = GOLD;
    ctx.shadowBlur = 26;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#fff3b8');
    g.addColorStop(0.45, GOLD);
    g.addColorStop(1, '#c48a1c');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#5c3d07';
    ctx.stroke();
    platePath(ctx, x + 8, y + 7, w - 16, h - 14, c - 5);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.stroke();
    // значок + надпись, центрируем вместе
    const size = 46, iconW = 40, gap = 20;
    ctx.font = head(size);
    const tw = Math.min(ctx.measureText(label).width, w - 2 * c - iconW - gap - 20);
    const total = iconW + gap + tw;
    const ix = x + (w - total) / 2, iy = y + h / 2;
    ctx.fillStyle = '#2a1600';
    ctx.strokeStyle = '#2a1600';
    if (icon === 'play') {
      ctx.beginPath();
      ctx.moveTo(ix + 4, iy - 19);
      ctx.lineTo(ix + iconW, iy);
      ctx.lineTo(ix + 4, iy + 19);
      ctx.closePath();
      ctx.fill();
    } else {
      // ↻ круговая стрелка: дуга по часовой, наконечник на её конце по касательной
      const ax = ix + iconW / 2, r = 16, a0 = -Math.PI * 0.2, a1 = Math.PI * 1.35;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(ax, iy, r, a0, a1);
      ctx.stroke();
      const ex = ax + r * Math.cos(a1), ey = iy + r * Math.sin(a1);
      const tx = -Math.sin(a1), ty = Math.cos(a1), nx = Math.cos(a1), ny = Math.sin(a1);
      ctx.beginPath();
      ctx.moveTo(ex + tx * 12, ey + ty * 12);
      ctx.lineTo(ex - tx * 4 + nx * 10, ey - ty * 4 + ny * 10);
      ctx.lineTo(ex - tx * 4 - nx * 10, ey - ty * 4 - ny * 10);
      ctx.closePath();
      ctx.fill();
    }
    ctx.font = head(size);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(label, ix + iconW + gap, iy + 3, tw);
    ctx.fillStyle = '#2a1600';
    ctx.fillText(label, ix + iconW + gap, iy + 1, tw);
  }

  // кнопка режима: активная светится и обведена золотом
  function modeButton(b, label, active) {
    const { x, y, w, h, c } = b;
    platePath(ctx, x, y, w, h, c);
    if (active) {
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, '#1f78d8');
      g.addColorStop(1, '#6a4cff');
      ctx.shadowColor = CYAN;
      ctx.shadowBlur = 24;
      ctx.fillStyle = g;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 4;
      ctx.strokeStyle = GOLD;
      ctx.stroke();
      gem(ctx, x + c + 22, y + h / 2, 9, 12, '#ffffff');
      gem(ctx, x + w - c - 22, y + h / 2, 9, 12, '#ffffff');
      carve(ctx, label, x + w / 2, y + h / 2 + 2, 40, head(40), '#ffffff', { maxW: w - 2 * c - 80 });
    } else {
      ctx.fillStyle = 'rgba(10,14,28,0.88)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#56658a';
      ctx.stroke();
      carve(ctx, label, x + w / 2, y + h / 2 + 2, 38, head(38), '#a3b0cf', { maxW: w - 2 * c - 40 });
    }
  }

  // значки легенды
  function wispIcon(x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r * 1.5);
    ctx.quadraticCurveTo(x + r * 1.05, y - r * 0.2, x + r * 0.85, y + r * 0.35);
    ctx.arc(x, y + r * 0.2, r * 0.86, 0.17, Math.PI - 0.17);
    ctx.quadraticCurveTo(x - r * 1.05, y - r * 0.2, x, y - r * 1.5);
    const g = ctx.createRadialGradient(x, y + r * 0.2, 0, x, y + r * 0.2, r * 1.4);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, '#9fe7ff');
    g.addColorStop(1, CYAN);
    ctx.fillStyle = g;
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }
  function fairyIcon(x, y, r) {
    ctx.fillStyle = 'rgba(255,240,180,0.45)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.75, y - r * 0.3, r * 0.75, r * 0.45, -0.5, 0, Math.PI * 2);
    ctx.ellipse(x + r * 0.75, y - r * 0.3, r * 0.75, r * 0.45, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2, rr = i % 2 ? r * 0.32 : r * 1.05;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = GOLD;
    ctx.shadowColor = GOLD;
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }
  function skullIcon(x, y, r) {
    ctx.shadowColor = '#ff2244';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#efe4d0';
    ctx.beginPath();
    ctx.arc(x, y - r * 0.15, r * 0.9, Math.PI * 0.85, Math.PI * 0.15);
    ctx.lineTo(x + r * 0.5, y + r * 0.95);
    ctx.lineTo(x - r * 0.5, y + r * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#c0102c';
    ctx.beginPath();
    ctx.arc(x - r * 0.36, y - r * 0.1, r * 0.24, 0, Math.PI * 2);
    ctx.arc(x + r * 0.36, y - r * 0.1, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a1018';
    ctx.fillRect(x - r * 0.3, y + r * 0.55, r * 0.12, r * 0.38);
    ctx.fillRect(x - r * 0.06, y + r * 0.55, r * 0.12, r * 0.38);
    ctx.fillRect(x + r * 0.18, y + r * 0.55, r * 0.12, r * 0.38);
  }

  // легенда: значок, имя, очки; ряд центрируется по измеренной ширине и ужимается под панель
  const LEGEND = [
    [wispIcon, 'огонёк-дух', '+1', CYAN],
    [fairyIcon, 'золотая фея', '+3', GOLD],
    [skullIcon, 'проклятый череп', '−5', DANGER],
  ];
  function legend(y) {
    const R = 17, IG = 12, NG = 10, SEP = 44, maxTotal = 900;
    let size = 32;
    let total = 0;
    for (let pass = 0; pass < 2; pass++) {
      total = 0;
      for (const [, name, pts] of LEGEND) {
        ctx.font = body(size, false);
        total += R * 2 + IG + ctx.measureText(name).width + NG;
        ctx.font = body(size);
        total += ctx.measureText(pts).width;
      }
      total += SEP * (LEGEND.length - 1);
      if (total <= maxTotal) break;
      size = Math.floor((size * maxTotal) / total);
    }
    let x = (W - total) / 2;
    for (const [icon, name, pts, color] of LEGEND) {
      icon(x + R, y, R);
      x += R * 2 + IG;
      carve(ctx, name, x, y, size, body(size, false), TEXT, { align: 'left' });
      x += ctx.measureText(name).width + NG;
      carve(ctx, pts, x, y, size, body(size), color, { align: 'left' });
      x += ctx.measureText(pts).width + SEP;
    }
  }

  function showStart(roundTime, mode) {
    if (Number.isFinite(roundTime)) lastRound = roundTime;
    if (mode === 'fantasy' || mode === 'realism') lastMode = mode;
    screen = 'start';
    buttons = START_BTNS;
    begin();
    try { ctx.letterSpacing = '4px'; } catch {}
    carve(ctx, 'АРЕНА МАГОВ', cx, 92, 76, head(76), GOLD, { maxW: 860, glow: VIOLET });
    try { ctx.letterSpacing = '0px'; } catch {}
    carve(ctx, `Порази как можно больше духов за ${lastRound} секунд`, cx, 152, 32, body(32), TEXT, { maxW: 900 });
    legend(198);
    modeButton(BTN_FANTASY, 'ФЭНТЕЗИ', lastMode === 'fantasy');
    modeButton(BTN_REALISM, 'РЕАЛИЗМ', lastMode === 'realism');
    carve(ctx, 'Выбери режим и выстрели по кнопке', cx, 336, 26, body(26, false), MUTED, { maxW: 880 });
    actionButton(BTN_START, 'НАЧАТЬ ИСПЫТАНИЕ', 'play');
    texture.needsUpdate = true;
  }

  // магический круг для отсчёта
  function magicCircle(x, y, r) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.86, 0, Math.PI * 2);
    ctx.stroke();
    // руны между кольцами
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      addRune(ctx, i, x + Math.cos(a) * r * 0.93, y + Math.sin(a) * r * 0.93, r * 0.045);
    }
    ctx.stroke();
    // гексаграмма
    ctx.strokeStyle = VIOLET;
    ctx.shadowColor = VIOLET;
    ctx.lineWidth = 3;
    for (let t = 0; t < 2; t++) {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + t * Math.PI + (i * Math.PI * 2) / 3;
        const px = x + Math.cos(a) * r * 0.82, py = y + Math.sin(a) * r * 0.82;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  // обратный отсчёт: n = 3, 2, 1 или 0 («ВПЕРЁД!»)
  function showCountdown(n) {
    lastCount = n;
    screen = 'countdown';
    buttons = NO_BTNS;
    begin();
    if (n > 0) {
      carve(ctx, 'Приготовься…', cx, 74, 40, body(40), MUTED, { maxW: 880 });
      magicCircle(cx, 300, 160);
      carve(ctx, String(n), cx, 306, 230, head(230), '#ffffff', { maxW: 600, glow: CYAN });
    } else {
      magicCircle(cx, 270, 200);
      carve(ctx, 'ВПЕРЁД!', cx, 272, 130, head(130), GOLD, { maxW: 900, glow: '#ff9d2e' });
    }
    texture.needsUpdate = true;
  }

  function showResults(r) {
    lastResults = r || {};
    const { score = 0, best = 0, accuracy, newRecord, top, maxCombo, wave } = lastResults;
    screen = 'results';
    buttons = RESULT_BTNS;
    begin();
    const hasTop = Array.isArray(top) && top.length > 0;
    const lx = hasTop ? 362 : cx;
    const colW = hasTop ? 600 : 880;

    carve(ctx, 'ИСПЫТАНИЕ ОКОНЧЕНО', lx, 76, 46, head(46), TEXT, { maxW: colW, glow: VIOLET });
    carve(ctx, `Очки: ${score}`, lx, 146, 84, body(84), GOLD, { maxW: colW, glow: GOLD });

    // строки итогов равномерно между счётом и кнопкой
    const lines = [];
    if (Number.isFinite(accuracy)) lines.push([`Точность: ${Math.round(accuracy)}%`, MUTED, false]);
    if (maxCombo != null) lines.push([`Лучшая серия: ${maxCombo}`, MUTED, false]);
    if (typeof wave === 'number' && Number.isFinite(wave)) lines.push([`Волна ${wave}`, '#d2c4ff', true]);
    if (!hasTop) lines.push([`Рекорд: ${best}`, MUTED, false]);
    if (newRecord) lines.push(['НОВЫЙ РЕКОРД!', '#5dffb0', true]);
    if (lines.length) {
      const y0 = 198, y1 = 350, stepY = Math.min(44, (y1 - y0) / lines.length);
      const size = Math.round(Math.min(36, stepY * 0.82));
      lines.forEach(([str, color, strong], i) => {
        const y = y0 + stepY * (i + 0.5);
        if (strong) carve(ctx, str, lx, y, size, head(size), color, { maxW: colW, glow: color });
        else carve(ctx, str, lx, y, size, body(size), color, { maxW: colW });
      });
    }

    // правая колонка: ТОП-5
    if (hasTop) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(688, 50, 3, 296);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(691, 50, 1, 296);
      gem(ctx, 689.5, 198, 7, 10);
      carve(ctx, 'ТОП-5', 850, 76, 40, head(40), LABEL, { maxW: 240 });
      const hi = top.indexOf(score); // первое совпадение с текущим результатом
      top.slice(0, 5).forEach((v, i) => {
        const ry = 132 + i * 46;
        const isMe = i === hi;
        if (isMe) {
          platePath(ctx, 728, ry - 21, 250, 42, 14);
          ctx.fillStyle = 'rgba(255,210,63,0.18)';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgba(255,210,63,0.6)';
          ctx.stroke();
        }
        carve(ctx, `${i + 1}. ${v}`, 752, ry, 34, body(34, isMe), isMe ? GOLD : TEXT, { align: 'left', maxW: 210 });
      });
    }

    actionButton(BTN_START, 'ЕЩЁ РАЗ', 'again');
    texture.needsUpdate = true;
  }

  // uv попадания луча (0..1, начало внизу слева, как в three.js) → кнопка текущего экрана
  function pick(uv) {
    if (!uv) return null;
    const px = uv.x * W, py = (1 - uv.y) * H;
    for (let i = 0; i < buttons.length; i++) if (inPlate(px, py, buttons[i])) return buttons[i].id;
    return null;
  }

  // после загрузки шрифтов перерисовываем текущий экран
  function redraw() {
    if (screen === 'start') showStart();
    else if (screen === 'countdown') showCountdown(lastCount);
    else showResults(lastResults);
  }

  showStart(60, 'fantasy'); // панель никогда не бывает пустой
  loadFantasyFonts().then(redraw);
  return {
    mesh, showStart, showCountdown, showResults, pick,
    get screen() { return screen; },
    get mode() { return lastMode; },
  };
}
