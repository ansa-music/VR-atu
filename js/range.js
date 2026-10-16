import * as THREE from 'three';

// Дальний рубеж: полоса для болтовой винтовки и стальные гонги на 40 / 75 / 110 м.
// Ось рубежа: угол 281.25° в XZ, D = (cos, 0, sin) ≈ (0.195, 0, -0.981) —
// ровно между колоннами 12 (0, ·, -14) и 13 (5.36, ·, -12.93).
// Всё строится в группе, повёрнутой так, что её локальная -Z смотрит вдоль D,
// а +X — вправо (если смотреть из центра арены). Всё дальше ~40 м — fog: false.

const LANE_YAW = -Math.PI / 16; // поворот группы: (0,0,-1) → D, (1,0,0) → (0.981, 0, 0.195)

const CYAN = 0x3ec5ff, VIOLET = 0x7c5cff, PINK = 0xff3aa8, GOLD = 0xffd23f;
const FONT_STACK = '"Russo One", "Arial Black", Impact, sans-serif';
const FONT_PROBE = '400 200px "Russo One"';
const FONT_SAMPLE = '0123456789 м';

// гонги: дистанция вдоль оси, боковой сдвиг, диаметр, высота центра, очки, цвет, период, размах, ширина табло
const GONGS = [
  { d: 40, off: -1.5, dia: 0.5, h: 1.4, pts: 2, color: CYAN, period: 1.05, amp: 0.62, board: 1.2 },
  { d: 75, off: 1.2, dia: 0.75, h: 1.8, pts: 3, color: PINK, period: 1.25, amp: 0.52, board: 2.0 },
  { d: 110, off: -0.8, dia: 1.0, h: 2.2, pts: 5, color: GOLD, period: 1.45, amp: 0.44, board: 3.0 },
];

const COOLDOWN = 1.2;    // с: повторное попадание по качающейся пластине не засчитывается
const DAMP = 1.6;        // затухание качания, 1/с
const MAX_ANGLE = 1.25;  // рад: дальше назад пластина не уходит
const MIN_ANGLE = -0.6;  // рад: вперёд
const BASE_GLOW = 0.3;   // самосвечение краски, чтобы читалась на тёмном небе
const MAX_SPLASH = 8;    // следов свинца на краске
const TEX = 256;         // размер текстуры краски

const css = (hex) => '#' + hex.toString(16).padStart(6, '0');

// скруглённый прямоугольник (без зависимости от ctx.roundRect)
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

// перерисовка, когда подгрузится Russo One (в т.ч. кириллический поднабор)
function watchFont(redraw) {
  const fs = typeof document !== 'undefined' ? document.fonts : null;
  if (!fs) return;
  let seen = 0, requested = false;
  const request = () => {
    try { fs.load(FONT_PROBE, FONT_SAMPLE).then(check, () => {}); } catch (e) { /* без шрифта — запасной */ }
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

// табло дистанции: тёмный фон, неоновая рамка, крупный текст
function drawBoard(g, w, h, label, color) {
  const c = css(color);
  g.save();
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#070b1a';
  g.fillRect(0, 0, w, h);
  // рамка
  g.shadowColor = c;
  g.shadowBlur = 18;
  g.strokeStyle = c;
  g.lineWidth = 10;
  roundRectPath(g, 16, 16, w - 32, h - 32, 24);
  g.stroke();
  // текст
  let size = Math.floor(h * 0.6);
  g.font = `400 ${size}px ${FONT_STACK}`;
  const maxW = w * 0.8;
  const mw = g.measureText(label).width;
  if (mw > maxW) {
    size = Math.floor(size * maxW / mw);
    g.font = `400 ${size}px ${FONT_STACK}`;
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowBlur = 28;
  g.fillStyle = c;
  g.fillText(label, w / 2, h / 2 + size * 0.04);
  g.shadowBlur = 8;
  g.fillStyle = '#ffffff';
  g.fillText(label, w / 2, h / 2 + size * 0.04);
  g.restore();
}

// след пули: тёмное пятно свинца с лучами брызг и голым металлом в центре
function drawSplash(g, s, alpha) {
  let seed = s.seed;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.save();
  g.globalAlpha = alpha;
  g.translate(s.x, s.y);
  g.fillStyle = 'rgba(64,68,80,0.9)';
  const rays = 9 + ((rnd() * 6) | 0);
  for (let k = 0; k < rays; k++) {
    const a = rnd() * Math.PI * 2;
    const len = s.r * (1.4 + rnd() * 1.8);
    const wd = s.r * (0.12 + rnd() * 0.18);
    g.save();
    g.rotate(a);
    g.beginPath();
    g.moveTo(0, -wd);
    g.lineTo(len, 0);
    g.lineTo(0, wd);
    g.closePath();
    g.fill();
    g.restore();
  }
  g.fillStyle = '#4a4f5a';
  g.beginPath();
  g.arc(0, 0, s.r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#a3aab6';
  g.beginPath();
  g.arc(0, 0, s.r * 0.45, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// краска пластины + следы (старые бледнее)
function paintPlate(gg) {
  const g = gg.ctx, S = TEX;
  g.save();
  g.globalAlpha = 1;
  const grd = g.createRadialGradient(S * 0.42, S * 0.38, S * 0.05, S / 2, S / 2, S * 0.52);
  grd.addColorStop(0, '#f5f7fa');
  grd.addColorStop(1, '#c8cdd6');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(60,66,80,0.35)';
  g.lineWidth = S * 0.02;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.485, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  const n = gg.splashes.length;
  for (let i = 0; i < n; i++) drawSplash(g, gg.splashes[i], 0.35 + 0.65 * (i + 1) / n);
  gg.tex.needsUpdate = true;
}

// мягкое радиальное свечение (ореол вокруг пластины)
function glowTexture() {
  const s = 64, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createRange(scene) {
  const lane = new THREE.Group();
  lane.name = 'range';
  lane.rotation.y = LANE_YAW;
  scene.add(lane);

  const meshes = [];
  const colliders = [];
  const gongs = [];
  const byMesh = new Map();
  const col = new THREE.Color();

  // ---- Полоса: тёмный слегка отражающий пол 15–125 м, ширина 12 м ----
  const L0 = 15, L1 = 125, W = 12, LEN = L1 - L0, MID = -(L0 + L1) / 2;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, LEN),
    new THREE.MeshStandardMaterial({
      color: 0x070b1a, roughness: 0.32, metalness: 0.55, envMapIntensity: 0.6, fog: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.003, MID);
  lane.add(floor);

  // неоновые полосы на полу одним инстансом: [x, z, ширина, длина, цвет, яркость]
  const bars = [
    [-W / 2, MID, 0.1, LEN, CYAN, 1],
    [W / 2, MID, 0.1, LEN, CYAN, 1],
    [0, -L0, W, 0.14, CYAN, 0.9],   // линия огня
    [0, -L1, W, 0.1, PINK, 0.7],    // конец полосы
  ];
  for (const g of GONGS) bars.push([g.off, -g.d + 0.8, g.dia * 2 + 1.2, 0.08, g.color, 0.6]); // метка под гонгом
  const barMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }),
    bars.length
  );
  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  bars.forEach(([x, z, w, l, c, k], i) => {
    barMesh.setMatrixAt(i, m4.compose(pv.set(x, 0.006, z), q0, sv.set(w, 1, l)));
    barMesh.setColorAt(i, col.set(c).multiplyScalar(k));
  });
  barMesh.frustumCulled = false;
  lane.add(barMesh);

  // линии в 1 пиксель — видны и на 100+ м: края и поперечные метки каждые 10 м
  const lp = [], lc = [];
  const addLine = (x0, z0, x1, z1, c, k) => {
    lp.push(x0, 0.009, z0, x1, 0.009, z1);
    col.set(c).multiplyScalar(k);
    lc.push(col.r, col.g, col.b, col.r, col.g, col.b);
  };
  addLine(-W / 2, -L0, -W / 2, -L1, CYAN, 1);
  addLine(W / 2, -L0, W / 2, -L1, CYAN, 1);
  for (let m = 20; m <= 120; m += 10) addLine(-W / 2, -m, W / 2, -m, CYAN, 0.28);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
  const lines = new THREE.LineSegments(lineGeo,
    new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }));
  lines.frustumCulled = false;
  lane.add(lines);

  // ---- Земляной вал за последним гонгом ----
  const bermShape = new THREE.Shape();
  bermShape.moveTo(-3.2, 0);
  bermShape.lineTo(3.2, 0);
  bermShape.lineTo(1.1, 3.4);
  bermShape.lineTo(-1.1, 3.4);
  bermShape.closePath();
  const bermGeo = new THREE.ExtrudeGeometry(bermShape, { depth: 16, bevelEnabled: false, steps: 1 });
  bermGeo.translate(0, 0, -8);
  bermGeo.rotateY(Math.PI / 2); // профиль — вдоль оси, вытяжка — поперёк
  const berm = new THREE.Mesh(bermGeo, new THREE.MeshStandardMaterial({
    color: 0x15101f, roughness: 0.95, metalness: 0.05, flatShading: true, fog: false,
  }));
  berm.position.set(0, 0, -121);
  lane.add(berm);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(16, 0.06, 0.06),
    new THREE.MeshBasicMaterial({ color: VIOLET, toneMapped: false, fog: false }));
  ridge.position.set(0, 3.4, -121 + 1.1);
  lane.add(ridge);

  // ---- Гонги ----
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x1a1f3a, metalness: 0.85, roughness: 0.35, fog: false });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x3a404c, metalness: 0.9, roughness: 0.3, fog: false });
  const backMat = new THREE.MeshStandardMaterial({ color: 0x7d838e, metalness: 0.3, roughness: 0.7, fog: false });
  const haloTex = glowTexture();
  const boardRedraws = [];

  GONGS.forEach((cfg, idx) => {
    const R = cfg.dia / 2;
    const t = 0.05 + 0.001 * cfg.d;        // толщина стоек (дальше — толще, чтобы читались)
    const chain = 0.18 + 0.12 * cfg.dia;   // длина подвеса
    const yb = cfg.h + R + chain;          // ось перекладины (= ось качания)
    const postX = R + 0.28 + t / 2;
    const H = yb + t * 0.5;                // высота стоек
    const label = `${cfg.d} м`;

    const frame = new THREE.Group();
    frame.position.set(cfg.off, 0, -cfg.d);
    frame.rotation.y = Math.atan2(-cfg.off, cfg.d); // лицом точно к центру арены
    lane.add(frame);

    // стойки с неоновыми колпачками
    const capMat = new THREE.MeshBasicMaterial({ color: cfg.color, toneMapped: false, fog: false });
    const postGeo = new THREE.BoxGeometry(t, H, t);
    const capGeo = new THREE.BoxGeometry(t * 1.6, t * 0.7, t * 1.6);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, metalMat);
      post.position.set(sx * postX, H / 2, 0);
      frame.add(post);
      colliders.push(post);
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(sx * postX, H + t * 0.35, 0);
      frame.add(cap);
      colliders.push(cap);
    }
    // перекладина
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2 * postX + t, t * 0.85, t * 0.85), metalMat);
    bar.position.y = yb;
    frame.add(bar);
    colliders.push(bar);

    // подвес: вращается вокруг оси перекладины (локальная X)
    const pivot = new THREE.Group();
    pivot.position.y = yb;
    frame.add(pivot);

    // тяги от перекладины к пластине
    const rodLen = chain + 0.15 * R;
    const rodGeo = new THREE.CylinderGeometry(t * 0.16, t * 0.16, rodLen, 6);
    for (const sx of [-1, 1]) {
      const rod = new THREE.Mesh(rodGeo, metalMat);
      rod.position.set(sx * R * 0.45, -rodLen / 2, 0);
      pivot.add(rod);
    }

    // пластина: тонкий цилиндр, лицевой торец (+Z) — с текстурой краски
    const thick = 0.022 + 0.012 * cfg.dia;
    const plateGeo = new THREE.CylinderGeometry(R, R, thick, 48, 1);
    plateGeo.rotateX(Math.PI / 2); // верхний торец → +Z (к стрелку)
    const pa = plateGeo.attributes.position, ua = plateGeo.attributes.uv;
    for (let i = 0; i < pa.count; i++) { // плоская проекция UV по лицу
      ua.setXY(i, pa.getX(i) / (2 * R) + 0.5, pa.getY(i) / (2 * R) + 0.5);
    }
    ua.needsUpdate = true;

    const cv = document.createElement('canvas');
    cv.width = cv.height = TEX;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const faceMat = new THREE.MeshStandardMaterial({
      map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: BASE_GLOW,
      roughness: 0.62, metalness: 0.12, fog: false,
    });
    const plate = new THREE.Mesh(plateGeo, [edgeMat, faceMat, backMat]); // группы: бок, лицо, тыл
    plate.position.y = -(chain + R);
    plate.name = `gong-${cfg.d}`;
    pivot.add(plate);

    // неоновый обод
    const tube = 0.01 + 0.0004 * cfg.d;
    const rimMat = new THREE.MeshBasicMaterial({ color: cfg.color, toneMapped: false, fog: false });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R + tube * 0.6, tube, 8, 64), rimMat);
    plate.add(rim);
    // ореол за пластиной — заметен издалека
    const haloMat = new THREE.MeshBasicMaterial({
      map: haloTex, color: cfg.color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, fog: false,
    });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(R * 3.8, R * 3.8), haloMat);
    halo.position.z = -thick / 2 - 0.01;
    plate.add(halo);

    // табло дистанции над рамой
    const bw = cfg.board, bh = bw / 2, bd = 0.03 + 0.01 * bw;
    const boardY = H + t * 0.7 + 0.1 * bw + bh / 2;
    const bcv = document.createElement('canvas');
    bcv.width = 512;
    bcv.height = 256;
    const bctx = bcv.getContext('2d');
    const btex = new THREE.CanvasTexture(bcv);
    btex.colorSpace = THREE.SRGBColorSpace;
    btex.anisotropy = 4;
    const redraw = () => { drawBoard(bctx, 512, 256, label, cfg.color); btex.needsUpdate = true; };
    redraw();
    boardRedraws.push(redraw);
    const bFace = new THREE.MeshBasicMaterial({ map: btex, toneMapped: false, fog: false });
    const board = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd),
      [metalMat, metalMat, metalMat, metalMat, bFace, metalMat]); // +Z — лицо
    board.position.set(0, boardY, 0);
    frame.add(board);
    colliders.push(board);
    const strutH = boardY - yb;
    const strut = new THREE.Mesh(new THREE.BoxGeometry(t * 0.6, strutH, t * 0.6), metalMat);
    strut.position.set(0, yb + strutH / 2, -(bd / 2 + t * 0.3));
    frame.add(strut);
    colliders.push(strut);

    const gg = {
      d: cfg.d, pts: cfg.pts, label, R, chain,
      pivot, plate, faceMat, rimMat, haloMat,
      baseColor: new THREE.Color(cfg.color),
      w0: (Math.PI * 2) / cfg.period, amp: cfg.amp,
      angle: 0, vel: 0, moving: false, cooldown: 0, flash: 0,
      ctx: cv.getContext('2d'), tex, splashes: [], phase: idx * 1.7,
    };
    paintPlate(gg);
    gongs.push(gg);
    meshes.push(plate);
    byMesh.set(plate, gg);
  });

  lane.updateMatrixWorld(true); // рейкаст работает сразу, до первого кадра
  watchFont(() => { for (const r of boardRedraws) r(); });

  const tmp = new THREE.Vector3();
  const WHITE = new THREE.Color(0xffffff);

  function addSplash(gg, lx, ly) {
    const S = TEX;
    gg.splashes.push({
      x: (lx / (2 * gg.R) + 0.5) * S,
      y: (0.5 - ly / (2 * gg.R)) * S,
      r: Math.max(3, (0.022 / (2 * gg.R)) * S),
      seed: ((Math.random() * 2147483645) | 0) + 1,
    });
    if (gg.splashes.length > MAX_SPLASH) gg.splashes.shift();
    paintPlate(gg);
  }

  // попадание по пластине: толчок назад, след, вспышка; очки — если не в откате
  function hit(mesh, point) {
    const gg = byMesh.get(mesh);
    if (!gg) return null;
    const scored = gg.cooldown <= 0;
    if (scored) gg.cooldown = COOLDOWN;
    let lever = 1;
    if (point) {
      // плечо относительно оси подвеса: ниже удар — сильнее толчок
      tmp.copy(point);
      gg.pivot.worldToLocal(tmp);
      lever = THREE.MathUtils.clamp(-tmp.y / (gg.chain + gg.R), 0.6, 1.5);
      tmp.copy(point);
      gg.plate.worldToLocal(tmp);
      addSplash(gg, tmp.x, tmp.y);
    }
    gg.vel = Math.min(gg.vel + gg.amp * gg.w0 * lever, gg.w0 * 1.6);
    gg.moving = true;
    gg.flash = 1;
    return { distance: gg.d, points: gg.pts, scored, label: gg.label };
  }

  let clock = 0;
  function update(dt, time) {
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    clock += dt;
    const t = typeof time === 'number' ? time : clock;
    for (let i = 0; i < gongs.length; i++) {
      const gg = gongs[i];
      if (gg.cooldown > 0) gg.cooldown -= dt;
      if (gg.moving) {
        // затухающий маятник, 2 подшага полунеявным Эйлером
        const h = dt / 2, w2 = gg.w0 * gg.w0;
        for (let s = 0; s < 2; s++) {
          gg.vel += (-w2 * Math.sin(gg.angle) - DAMP * gg.vel) * h;
          gg.angle += gg.vel * h;
          if (gg.angle > MAX_ANGLE) { gg.angle = MAX_ANGLE; gg.vel = -Math.abs(gg.vel) * 0.3; }
          if (gg.angle < MIN_ANGLE) { gg.angle = MIN_ANGLE; gg.vel = Math.abs(gg.vel) * 0.3; }
        }
        if (Math.abs(gg.angle) < 0.0005 && Math.abs(gg.vel) < 0.005) {
          gg.angle = 0; gg.vel = 0; gg.moving = false;
        }
        gg.pivot.rotation.x = gg.angle; // +угол — низ пластины уходит от стрелка
        gg.pivot.updateMatrixWorld(true);
      }
      // вспышка при попадании и лёгкий пульс обода
      if (gg.flash > 0) gg.flash = Math.max(0, gg.flash - dt * 2.8);
      const f = gg.flash * gg.flash;
      gg.faceMat.emissiveIntensity = BASE_GLOW + 1.4 * f;
      gg.rimMat.color.copy(gg.baseColor).multiplyScalar(0.85 + 0.15 * Math.sin(t * 2.4 + gg.phase)).lerp(WHITE, 0.7 * f);
      gg.haloMat.opacity = 0.4 + 0.08 * Math.sin(t * 1.8 + gg.phase) + 0.5 * f;
    }
  }

  return { meshes, colliders, hit, update };
}
