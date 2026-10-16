import * as THREE from 'three';

// Неоновая вывеска «ATU» над входом на дальний рубеж:
// балка между верхушками колонн 12 и 13 и светящееся табло над ней, лицом к центру арены.

const CYAN = 0x3ec5ff, VIOLET = 0x7c5cff, PINK = 0xff3aa8;
const FONT_STACK = '"Russo One", "Arial Black", Impact, sans-serif';
const FONT_PROBE = '400 200px "Russo One"';
const TITLE = 'ATU';
const SUBTITLE = 'СТРЕЛКОВЫЙ ПОЛИГОН';

const A12 = (12 / 16) * Math.PI * 2, A13 = (13 / 16) * Math.PI * 2;
const P12 = new THREE.Vector3(Math.cos(A12) * 14, 0, Math.sin(A12) * 14); // (0, 0, -14)
const P13 = new THREE.Vector3(Math.cos(A13) * 14, 0, Math.sin(A13) * 14); // (5.36, 0, -12.93)
const BEAM_Y = 6.2;
const BOARD_Y = 7.9;
const BOARD_W = 4.6, BOARD_H = 2.3;

// холст табло 2048×1024 (2:1, как и само табло)
const W = 2048, H = 1024;
const EX = 420, EY = 512, ER = 318;     // эмблема-шестиугольник
const TX = 1330, TBASE = 585;           // центр и базовая линия «ATU»
const PX = 560, PY = 236, PW = 1400, PH = 560; // тёмная подложка за буквами

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

function hexPath(g, cx, cy, r) {
  g.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 3; // остриём вверх
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

// горизонтальный градиент голубой → фиолетовый → розовый
function neonGrad(g, x0, x1) {
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  gr.addColorStop(0, '#3ec5ff');
  gr.addColorStop(0.5, '#7c5cff');
  gr.addColorStop(1, '#ff3aa8');
  return gr;
}

function fitFont(g, text, size, maxW) {
  g.font = `400 ${size}px ${FONT_STACK}`;
  const w = g.measureText(text).width;
  if (w > maxW) {
    size = Math.floor((size * maxW) / w);
    g.font = `400 ${size}px ${FONT_STACK}`;
  }
  return size;
}

// эмблема: шестиугольник, прицел и наклонная орбита
function drawEmblem(a) {
  const grad = a.createLinearGradient(EX - ER, EY - ER, EX + ER, EY + ER);
  grad.addColorStop(0, '#3ec5ff');
  grad.addColorStop(1, '#7c5cff');
  const tilt = -0.42, orx = 245, ory = 78;
  a.save();
  a.lineJoin = 'round';
  a.lineCap = 'round';
  // задняя половина орбиты (бледнее, «за» прицелом)
  a.globalAlpha = 0.45;
  a.strokeStyle = '#ff3aa8';
  a.lineWidth = 8;
  a.beginPath();
  a.ellipse(EX, EY, orx, ory, tilt, Math.PI, Math.PI * 2);
  a.stroke();
  a.globalAlpha = 1;
  // внешний и внутренний шестиугольник
  a.strokeStyle = grad;
  a.lineWidth = 18;
  hexPath(a, EX, EY, ER);
  a.stroke();
  a.globalAlpha = 0.55;
  a.lineWidth = 5;
  hexPath(a, EX, EY, ER * 0.86);
  a.stroke();
  a.globalAlpha = 1;
  // прицел: кольцо, перекрестие с разрывом, засечки
  a.lineWidth = 14;
  a.beginPath();
  a.arc(EX, EY, 150, 0, Math.PI * 2);
  a.stroke();
  a.lineWidth = 11;
  a.beginPath();
  for (let k = 0; k < 4; k++) {
    const c = Math.cos((k * Math.PI) / 2), s = Math.sin((k * Math.PI) / 2);
    a.moveTo(EX + c * 62, EY + s * 62);
    a.lineTo(EX + c * 228, EY + s * 228);
  }
  a.stroke();
  a.lineWidth = 6;
  a.beginPath();
  for (let k = 0; k < 4; k++) {
    const ang = Math.PI / 4 + (k * Math.PI) / 2, c = Math.cos(ang), s = Math.sin(ang);
    a.moveTo(EX + c * 130, EY + s * 130);
    a.lineTo(EX + c * 170, EY + s * 170);
  }
  a.stroke();
  // передняя половина орбиты
  a.strokeStyle = '#ff3aa8';
  a.lineWidth = 8;
  a.beginPath();
  a.ellipse(EX, EY, orx, ory, tilt, 0, Math.PI);
  a.stroke();
  // центр и «спутник» на орбите
  a.fillStyle = '#ff3aa8';
  a.beginPath();
  a.arc(EX, EY, 18, 0, Math.PI * 2);
  a.fill();
  const sa = 2.3, ct = Math.cos(tilt), st = Math.sin(tilt);
  const ox = orx * Math.cos(sa), oy = ory * Math.sin(sa);
  a.fillStyle = '#ffd23f';
  a.beginPath();
  a.arc(EX + ox * ct - oy * st, EY + ox * st + oy * ct, 20, 0, Math.PI * 2);
  a.fill();
  // горячие сердцевины трубок
  a.strokeStyle = 'rgba(255,255,255,0.85)';
  a.lineWidth = 5;
  hexPath(a, EX, EY, ER);
  a.stroke();
  a.lineWidth = 4;
  a.beginPath();
  a.arc(EX, EY, 150, 0, Math.PI * 2);
  a.stroke();
  a.restore();
}

// крупные буквы «ATU» и разделитель
function drawTitle(a) {
  a.save();
  const spacing = 28;
  if ('letterSpacing' in a) a.letterSpacing = `${spacing}px`;
  fitFont(a, TITLE, 430, 1100);
  const w = a.measureText(TITLE).width;
  const x = TX - spacing / 2; // компенсация хвостового межбуквенного интервала
  a.textAlign = 'center';
  a.textBaseline = 'alphabetic';
  a.lineJoin = 'round';
  const grad = neonGrad(a, x - w / 2, x + w / 2);
  a.globalAlpha = 0.5;
  a.fillStyle = grad;
  a.fillText(TITLE, x, TBASE);
  a.globalAlpha = 1;
  a.strokeStyle = grad;
  a.lineWidth = 16;
  a.strokeText(TITLE, x, TBASE);
  a.strokeStyle = 'rgba(255,255,255,0.9)';
  a.lineWidth = 4.5;
  a.strokeText(TITLE, x, TBASE);
  a.restore();

  // разделитель с ромбиками на концах
  a.save();
  const x0 = TX - 540, x1 = TX + 540, y = 640;
  a.strokeStyle = neonGrad(a, x0, x1);
  a.lineWidth = 5;
  a.lineCap = 'round';
  a.beginPath();
  a.moveTo(x0 + 30, y);
  a.lineTo(x1 - 30, y);
  a.stroke();
  a.fillStyle = '#3ec5ff';
  a.beginPath();
  a.moveTo(x0, y); a.lineTo(x0 + 14, y - 14); a.lineTo(x0 + 28, y); a.lineTo(x0 + 14, y + 14);
  a.closePath();
  a.fill();
  a.fillStyle = '#ff3aa8';
  a.beginPath();
  a.moveTo(x1, y); a.lineTo(x1 - 14, y - 14); a.lineTo(x1 - 28, y); a.lineTo(x1 - 14, y + 14);
  a.closePath();
  a.fill();
  a.restore();
}

// подзаголовок с золотым свечением (прямо на основном холсте)
function drawSubtitle(g) {
  g.save();
  const spacing = 12;
  if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
  fitFont(g, SUBTITLE, 96, 1060);
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const x = TX - spacing / 2;
  g.shadowColor = '#ffd23f';
  g.shadowBlur = 32;
  g.fillStyle = '#ffd23f';
  g.fillText(SUBTITLE, x, 752);
  g.shadowBlur = 10;
  g.fillStyle = '#fff4cc';
  g.fillText(SUBTITLE, x, 752);
  g.restore();
}

// полная отрисовка табло: подложка → свечение (shadowBlur, окрашенное градиентом) → трубки → подзаголовок
function drawLogo(cv, art, glow) {
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);

  // тёмная полупрозрачная подложка со скан-линиями
  g.save();
  roundRectPath(g, PX, PY, PW, PH, 56);
  g.fillStyle = 'rgba(7,11,26,0.5)';
  g.fill();
  g.clip();
  g.fillStyle = 'rgba(124,92,255,0.05)';
  for (let y = PY + 8; y < PY + PH; y += 14) g.fillRect(PX, y, PW, 3);
  g.restore();
  g.save();
  roundRectPath(g, PX, PY, PW, PH, 56);
  g.strokeStyle = 'rgba(124,92,255,0.55)';
  g.lineWidth = 3;
  g.stroke();
  g.restore();
  // тёмная заливка шестиугольника (перекрывает край подложки)
  g.save();
  hexPath(g, EX, EY, ER);
  g.fillStyle = 'rgba(7,11,26,0.72)';
  g.fill();
  g.restore();

  // неоновые линии — на отдельном холсте
  const a = art.getContext('2d');
  a.clearRect(0, 0, W, H);
  drawEmblem(a);
  drawTitle(a);

  // свечение: рисунок с белой тенью, затем перекраска градиентом (source-in)
  const gl = glow.getContext('2d');
  const passes = [[70, 0.9], [24, 1]];
  for (const [blur, alpha] of passes) {
    gl.save();
    gl.clearRect(0, 0, W, H);
    gl.shadowColor = '#ffffff';
    gl.shadowBlur = blur;
    gl.drawImage(art, 0, 0);
    gl.drawImage(art, 0, 0); // второй раз — гуще ореол
    gl.restore();
    gl.save();
    gl.globalCompositeOperation = 'source-in';
    gl.fillStyle = neonGrad(gl, 100, 1950);
    gl.fillRect(0, 0, W, H);
    gl.restore();
    g.save();
    g.globalAlpha = alpha;
    g.drawImage(glow, 0, 0);
    g.restore();
  }
  // чёткие трубки поверх свечения
  g.drawImage(art, 0, 0);
  drawSubtitle(g);
}

// перерисовка, когда подгрузится Russo One (в т.ч. кириллица)
function watchFont(redraw) {
  const fs = typeof document !== 'undefined' ? document.fonts : null;
  if (!fs) return;
  let seen = 0, requested = false;
  const request = () => {
    try { fs.load(FONT_PROBE, TITLE + ' ' + SUBTITLE).then(check, () => {}); } catch (e) { /* останется запасной шрифт */ }
  };
  function check() {
    let n = 0, any = false;
    try {
      fs.forEach((f) => {
        if (f.family.replace(/["']/g, '') === 'Russo One') {
          any = true;
          if (f.status === 'loaded') n++;
        }
      });
    } catch (e) { return; }
    if (any && !requested) { requested = true; request(); }
    if (n > seen) { seen = n; redraw(); }
  }
  request();
  if (fs.ready) fs.ready.then(check, () => {});
  if (fs.addEventListener) fs.addEventListener('loadingdone', check);
}

// мягкое овальное свечение для аддитивной подложки
function softGlowTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const g = cv.getContext('2d');
  g.translate(128, 64);
  g.scale(2, 1);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(-64, -64, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createAtuLogo(scene) {
  // группа в середине пролёта, +Z смотрит в центр арены, локальная X — вдоль балки
  const group = new THREE.Group();
  group.name = 'atu-logo';
  group.position.set((P12.x + P13.x) / 2, 0, (P12.z + P13.z) / 2); // (2.679, 0, -13.467)
  group.lookAt(0, 0, 0); // цель на той же высоте — вывеска стоит вертикально
  scene.add(group);

  const colliders = [];
  const metal = new THREE.MeshStandardMaterial({ color: 0x1a1f3a, metalness: 0.9, roughness: 0.3 });

  // ---- Балка между капителями ----
  const span = P12.distanceTo(P13); // 5.46 м между осями колонн
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 0.36, 0.32), metal);
  beam.position.y = BEAM_Y;
  group.add(beam);
  colliders.push(beam);

  // светящиеся кромки: спереди сверху/снизу и снизу по центру
  const stripLen = span - 0.72; // между капителями (0.7 м)
  const stripMats = [];
  const strips = [
    [CYAN, [stripLen, 0.045, 0.02], [0, BEAM_Y - 0.15, 0.17]],
    [PINK, [stripLen, 0.045, 0.02], [0, BEAM_Y + 0.15, 0.17]],
    [VIOLET, [stripLen, 0.02, 0.08], [0, BEAM_Y - 0.19, 0]],
  ];
  for (const [c, size, p] of strips) {
    const m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false, fog: false });
    const s = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), m);
    s.position.set(p[0], p[1], p[2]);
    group.add(s);
    stripMats.push({ mat: m, base: new THREE.Color(c) });
  }

  // ---- Крепление табло: две стойки и нижняя планка ----
  const boardBottom = BOARD_Y - BOARD_H / 2; // 6.75
  const beamTop = BEAM_Y + 0.18;
  const strutH = boardBottom + 0.08 - beamTop;
  const strutGeo = new THREE.BoxGeometry(0.08, strutH, 0.08);
  for (const sx of [-1, 1]) {
    const strut = new THREE.Mesh(strutGeo, metal);
    strut.position.set(sx * 1.6, beamTop + strutH / 2, -0.06);
    group.add(strut);
    colliders.push(strut);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.07, 0.07), metal);
  rail.position.set(0, boardBottom + 0.04, -0.06);
  group.add(rail);
  colliders.push(rail);

  // ---- Табло с логотипом ----
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const art = document.createElement('canvas');
  art.width = W;
  art.height = H;
  const glowCv = document.createElement('canvas');
  glowCv.width = W;
  glowCv.height = H;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const redraw = () => { drawLogo(cv, art, glowCv); tex.needsUpdate = true; };
  redraw();
  watchFont(redraw);

  // мягкое аддитивное свечение позади табло
  const glowMat = new THREE.MeshBasicMaterial({
    map: softGlowTexture(), color: VIOLET, transparent: true, opacity: 0.32,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W * 1.4, BOARD_H * 1.5), glowMat);
  glow.position.set(0, BOARD_Y, -0.08);
  group.add(glow);

  const boardMat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false,
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_H), boardMat);
  board.position.set(0, BOARD_Y, 0); // мир ≈ (2.68, 7.9, -13.47)
  group.add(board);
  colliders.push(board);

  group.updateMatrixWorld(true); // для рейкаста сразу

  // ---- Пульс и редкое неоновое мерцание ----
  let clock = 0;
  let nextFlicker = 3 + Math.random() * 5;
  let flickerT = -1;
  function update(dt, time) {
    if (!(dt > 0)) dt = 0;
    clock += dt;
    const t = typeof time === 'number' ? time : clock;
    let k = 0.92 + 0.08 * Math.sin(t * 2.2);
    nextFlicker -= dt;
    if (nextFlicker <= 0) {
      flickerT = 0;
      nextFlicker = 4 + Math.random() * 7;
    }
    if (flickerT >= 0) {
      flickerT += dt;
      if (flickerT < 0.36) {
        if (flickerT % 0.12 < 0.05) k *= 0.45; // 2–3 быстрых провала
      } else {
        flickerT = -1;
      }
    }
    boardMat.opacity = k;
    glowMat.opacity = 0.32 * k * (0.9 + 0.1 * Math.sin(t * 3.1));
    for (let i = 0; i < stripMats.length; i++) {
      const s = stripMats[i];
      s.mat.color.copy(s.base).multiplyScalar(0.8 + 0.2 * Math.sin(t * 2 + i * 2.1));
    }
  }

  return { group, colliders, update };
}
