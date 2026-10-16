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

  // Тонкий скруглённый прогресс-бар оставшегося времени внутри рамки, у нижнего края
  function timeBar(frac, danger) {
    const x = 60, y = 226, w = W - 120, h = 14;
    // подложка
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    // заполнение
    const fw = w * frac;
    if (fw <= 0) return;
    let fill;
    if (danger) {
      fill = '#ff5a6e';
    } else {
      fill = ctx.createLinearGradient(x, 0, x + w, 0);
      fill.addColorStop(0, '#3ec5ff');
      fill.addColorStop(1, '#7c5cff');
    }
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(fw, h), h, h / 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function update({ score, timeLeft, multiplier, timeFrac }) {
    const time = Math.max(0, Math.ceil(timeLeft));
    // timeFrac: оставшаяся доля раунда 0..1; не задан/некорректен → 1
    const frac = Number.isFinite(timeFrac) ? Math.min(1, Math.max(0, timeFrac)) : 1;
    const fracKey = Math.round(frac * 100) / 100;
    const key = `${score}|${time}|${multiplier}|${fracKey.toFixed(2)}`;
    if (key === lastKey) return; // перерисовываем только при изменении
    lastKey = key;

    drawFrame(ctx, W, H);
    const cols = [W / 6, W / 2, (W * 5) / 6];
    const labels = ['ОЧКИ', 'ВРЕМЯ', 'КОМБО'];
    const danger = timeLeft <= 10 && timeLeft > 0;
    const timeColor = danger ? '#ff5a6e' : '#9fe7ff';
    const values = [
      [String(score), '#ffffff'],
      [String(time), timeColor],
      ['x' + multiplier, '#ffd23f'],
    ];
    cols.forEach((x, i) => {
      text(ctx, labels[i], x, 62, 40, '#8fa3d9', { maxW: 280 });
      // мягкое золотое свечение у множителя от x2
      const glow = i === 2 && multiplier >= 2;
      if (glow) {
        ctx.shadowColor = '#ffd23f';
        ctx.shadowBlur = 25;
      }
      text(ctx, values[i][0], x, 150, 110, values[i][1], { bold: true, maxW: 290 });
      if (glow) {
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      }
    });
    timeBar(fracKey, danger);
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
    text(ctx, '5 попаданий подряд — множитель до x4', cx, 322, 34, '#c9d6ff', { maxW: 920 });
    // подсказка по управлению прямо над кнопкой
    text(ctx, 'ПК: Enter или клик по кнопке  ·  VR/МК: выстрел в панель', cx, 364, 28, '#8fa3d9', { maxW: 920 });
    button('▶  ВЫСТРЕЛИ — СТАРТ');
    texture.needsUpdate = true;
  }

  // Обратный отсчёт перед раундом: n = 3, 2, 1 или 0 («ВПЕРЁД!»)
  function showCountdown(n) {
    drawFrame(ctx, W, H);
    if (n > 0) {
      text(ctx, 'Приготовься…', cx, 80, 44, '#8fa3d9', { maxW: 900 });
      ctx.shadowColor = '#3ec5ff';
      ctx.shadowBlur = 40;
      text(ctx, String(n), cx, 285, 300, '#ffffff', { bold: true, maxW: 900 });
    } else {
      ctx.shadowColor = '#34e89e';
      ctx.shadowBlur = 40;
      text(ctx, 'ВПЕРЁД!', cx, 270, 150, '#ffffff', { bold: true, maxW: 940 });
    }
    // сброс свечения, чтобы оно не просочилось в следующие отрисовки
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    texture.needsUpdate = true;
  }

  function showResults({ score, best, accuracy, newRecord, top, maxCombo }) {
    drawFrame(ctx, W, H);
    const hasTop = Array.isArray(top) && top.length > 0;
    const lx = hasTop ? 360 : cx; // центр левой колонки (без топа — по центру панели)

    // Левая колонка
    text(ctx, 'ВРЕМЯ ВЫШЛО!', lx, 70, 64, '#ffffff', { bold: true, maxW: 600 });
    text(ctx, `Очки: ${score}`, lx, 158, 96, '#ffd23f', { bold: true, maxW: 600 });
    let y = 228;
    text(ctx, `Точность: ${Math.round(accuracy)}%`, lx, y, 36, '#c9d6ff', { maxW: 600 });
    if (maxCombo != null) {
      y += 42;
      text(ctx, `Лучшая серия: ${maxCombo}`, lx, y, 36, '#c9d6ff', { maxW: 600 });
    }
    if (!hasTop) {
      y += 42;
      text(ctx, `Рекорд: ${best}`, lx, y, 36, '#c9d6ff', { maxW: 600 });
    }
    if (newRecord) text(ctx, 'НОВЫЙ РЕКОРД!', lx, y + 40, 44, '#34e89e', { bold: true, maxW: 600 });

    // Правая колонка: ТОП-5
    if (hasTop) {
      // вертикальный разделитель
      ctx.beginPath();
      ctx.moveTo(690, 45);
      ctx.lineTo(690, 350);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(79,123,255,0.45)';
      ctx.stroke();

      text(ctx, 'ТОП-5', 850, 70, 44, '#8fa3d9', { bold: true, maxW: 240 });
      const hi = top.indexOf(score); // первое совпадение с текущим результатом
      top.slice(0, 5).forEach((v, i) => {
        const ry = 135 + i * 49;
        const isMe = i === hi;
        if (isMe) {
          ctx.beginPath();
          ctx.roundRect(740, ry - 22, 240, 44, 14);
          ctx.fillStyle = 'rgba(255,210,63,0.16)';
          ctx.fill();
        }
        text(ctx, `${i + 1}. ${v}`, 760, ry, 36, isMe ? '#ffd23f' : '#ffffff', {
          bold: isMe, align: 'left', maxW: 200,
        });
      });
    }

    button('↻  ВЫСТРЕЛИ — ЕЩЁ РАЗ');
    texture.needsUpdate = true;
  }

  showStart(60); // чтобы панель никогда не была пустой
  return { mesh, showStart, showCountdown, showResults };
}
