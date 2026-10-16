// Внутриигровые UI-панели: canvas-текстуры на плоскостях (DOM в VR не виден)
import * as THREE from 'three';

const FONT = 'system-ui, sans-serif';

// Общий помощник: canvas + текстура + плоскость размером w x h метров
function makePanel(w, h, pw, ph) {
  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, fog: false })
  );
  return { ctx, texture, mesh };
}

// Тёмная панель с неоновой рамкой
function drawFrame(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.roundRect(4, 4, w - 8, h - 8, 40);
  ctx.fillStyle = 'rgba(8,12,35,0.88)';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#4f7bff';
  ctx.stroke();
}

// Текст с выравниванием по вертикальному центру
function text(ctx, str, x, y, size, color, { bold = false, align = 'center', maxW } = {}) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (maxW) ctx.fillText(str, x, y, maxW);
  else ctx.fillText(str, x, y);
}

export function createScoreboard() {
  const W = 1024, H = 256;
  const { ctx, texture, mesh } = makePanel(4, 1, W, H);
  let lastKey = null;

  function update({ score, timeLeft, multiplier }) {
    const time = Math.max(0, Math.ceil(timeLeft));
    const key = `${score}|${time}|${multiplier}`;
    if (key === lastKey) return; // перерисовываем только при изменении
    lastKey = key;

    drawFrame(ctx, W, H);
    const cols = [W / 6, W / 2, (W * 5) / 6];
    const labels = ['ОЧКИ', 'ВРЕМЯ', 'КОМБО'];
    const timeColor = timeLeft <= 10 && timeLeft > 0 ? '#ff5a6e' : '#9fe7ff';
    const values = [
      [String(score), '#ffffff'],
      [String(time), timeColor],
      ['x' + multiplier, '#ffd23f'],
    ];
    cols.forEach((x, i) => {
      text(ctx, labels[i], x, 62, 40, '#8fa3d9', { maxW: 280 });
      text(ctx, values[i][0], x, 160, 110, values[i][1], { bold: true, maxW: 290 });
    });
    texture.needsUpdate = true;
  }

  update({ score: 0, timeLeft: 0, multiplier: 1 });
  return { mesh, update };
}

export function createMenu() {
  const W = 1024, H = 512, cx = W / 2;
  const { ctx, texture, mesh } = makePanel(2.4, 1.2, W, H);

  // Большая зелёная кнопка-пилюля внизу панели
  function button(label) {
    ctx.beginPath();
    ctx.roundRect(cx - 360, 384, 720, 92, 46);
    ctx.fillStyle = '#34e89e';
    ctx.fill();
    text(ctx, label, cx, 432, 46, '#06261a', { bold: true, maxW: 640 });
  }

  // Легенда: цветные кружки + подписи, ряд центрируется по измеренной ширине
  function legend(y) {
    const items = [['#3ec5ff', '+1'], ['#ffd23f', '+3'], ['#ff2244', '−5 бомба']];
    const R = 20, GAP = 14, SEP = 56;
    ctx.font = `bold 40px ${FONT}`;
    const widths = items.map(([, t]) => R * 2 + GAP + ctx.measureText(t).width);
    const total = widths.reduce((a, b) => a + b, 0) + SEP * (items.length - 1);
    let x = (W - total) / 2;
    items.forEach(([color, t], i) => {
      ctx.beginPath();
      ctx.arc(x + R, y, R, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      text(ctx, t, x + R * 2 + GAP, y, 40, '#ffffff', { bold: true, align: 'left' });
      x += widths[i] + SEP;
    });
  }

  function showStart(roundTime) {
    drawFrame(ctx, W, H);
    text(ctx, 'VR ТИР', cx, 90, 96, '#ffffff', { bold: true });
    text(ctx, `Сбей как можно больше кристаллов за ${roundTime} секунд`, cx, 185, 38, '#c9d6ff', { maxW: 920 });
    legend(268);
    text(ctx, '5 попаданий подряд — множитель до x4', cx, 335, 34, '#c9d6ff', { maxW: 920 });
    button('▶  ВЫСТРЕЛИ — СТАРТ');
    texture.needsUpdate = true;
  }

  function showResults({ score, best, accuracy, newRecord }) {
    drawFrame(ctx, W, H);
    text(ctx, 'ВРЕМЯ ВЫШЛО!', cx, 85, 84, '#ffffff', { bold: true });
    text(ctx, `Очки: ${score}`, cx, 190, 120, '#ffd23f', { bold: true, maxW: 900 });
    text(ctx, `Рекорд: ${best}   ·   Точность: ${Math.round(accuracy)}%`, cx, 282, 40, '#c9d6ff', { maxW: 920 });
    if (newRecord) text(ctx, 'НОВЫЙ РЕКОРД!', cx, 338, 54, '#34e89e', { bold: true });
    button('↻  ВЫСТРЕЛИ — ЕЩЁ РАЗ');
    texture.needsUpdate = true;
  }

  showStart(60); // чтобы панель никогда не была пустой
  return { mesh, showStart, showResults };
}
