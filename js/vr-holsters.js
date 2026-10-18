// Кобуры на теле в шлеме: игрок тянет руку к бедру, плечу или за спину и жмёт хват —
// main.js спрашивает zoneOf(контроллер) и даёт оружие этого слота в эту руку.
// Трекинга тела нет: торс оцениваем по голове (позиция под головой, поворот лениво
// догоняет взгляд). Метки — голограммы только для глаз XR и только когда рука рядом.
// Всё одним мешем (один вызов отрисовки), в кадре без аллокаций.
import * as THREE from 'three';

// слои 1 и 2 рисуют только левый/правый глаз XR (как в vr-comfort.js)
const XR_ONLY = 0b110;
const FONT = 'system-ui, sans-serif';
const PANEL_BG = 'rgba(8,12,35,0.88)';
const NEON = '#4f7bff';

// места в осях торса: x вправо, y вверх от высоты головы, z назад; последнее — радиус зоны, м
// (плечи и спина за головой и не видны — зоны чуть больше)
const PLACES = {
  'hip-right': [0.22, -0.72, -0.02, 0.15],
  'hip-left': [-0.22, -0.72, -0.02, 0.15],
  'shoulder-right': [0.17, -0.12, 0.13, 0.18],
  'shoulder-left': [-0.17, -0.12, 0.13, 0.18],
  back: [0, -0.55, 0.17, 0.18],
};
const DEFAULT_SLOTS = [
  { index: 0, name: 'ПМ', place: 'hip-right' },
  { index: 4, name: 'Бластер', place: 'hip-left' },
  { index: 1, name: 'АК-74М', place: 'shoulder-right' },
  { index: 3, name: 'СВ-98', place: 'shoulder-left' },
  { index: 2, name: 'МР-133', place: 'back' },
];
const MAX_SLOTS = 10;

// торс
const DEG = Math.PI / 180;
const TURN_START = 35 * DEG; // голова ушла от торса дальше — торс доворачивается
const TURN_STOP = 5 * DEG;
const TURN_MAX = 80 * DEG;   // дальше торс не отстаёт никогда
const TURN_RATE = 5;         // 1/с, доворот на месте
const MOVE_RATE = 4;         // 1/с, доворот на ходу
const MOVE_SPEED = 0.6;      // м/с: идём — торс следует за взглядом
const TELEPORT = 1.5;        // м за кадр: возрождение/телепорт — торс сразу по взгляду
const NECK = new THREE.Vector3(0, -0.1, 0.08);    // от глаз к основанию шеи, в осях головы
const PALM = new THREE.Vector3(0, -0.055, 0.075); // центр ладони в осях луча (GRIP из guns.js)

// зоны
const NEAR = 0.4;      // м: ближе — метка начинает проявляться
const EXIT = 1.2;      // гистерезис: из зоны выходим на r × EXIT
const STALE_MS = 300;  // update не вызывали дольше — метки прячутся сами

// вид
const RING = 0.06, RING_HOT = 0.08; // диаметр кольца, м: рядом / рука в зоне
const LABEL_PPM = 1700;             // px подписи на метр
const LABEL_GAP = 0.008;            // м между кольцом и подписью
const TEX_W = 512, RING_PX = 128, LROW = 48, LCOL = TEX_W - RING_PX, LPAD = 18;
const IN_HAND = ' · в руке';
const C_NEAR = new THREE.Color(0x3ec5ff);
const C_HOT = new THREE.Color(0xc8f6ff);
const C_DIM = new THREE.Color(0x5a6688);
const C_DIM_HOT = new THREE.Color(0x8e9cc4);

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const wrap = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const EMPTY = [];

function pill(ctx, x, y, w, h, border) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, h / 2);
  else ctx.rect(x, y, w, h);
  ctx.fillStyle = PANEL_BG;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = border;
  ctx.stroke();
}

// атлас: справа сверху кольцо (белое — цвет даёт вершина), слева по две строки на слот:
// обычная подпись и «… · в руке». Возвращает ширины табличек в px.
function drawAtlas(ctx, W, H, slots) {
  ctx.clearRect(0, 0, W, H);
  const cx = W - RING_PX / 2, cy = RING_PX / 2;
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(255,255,255,0.9)';
  ctx.shadowBlur = 12;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx, cy, 40, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 27, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const a = (i + 0.5) * (Math.PI / 2), c = Math.cos(a), s = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(cx + c * 49, cy + s * 49);
    ctx.lineTo(cx + c * 58, cy + s * 58);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const widths = [];
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let k = 0; k < slots.length; k++) {
    for (let v = 0; v < 2; v++) {
      const y = (k * 2 + v) * LROW, name = slots[k].name, tail = v ? IN_HAND : '';
      ctx.font = `bold 30px ${FONT}`;
      let nw = ctx.measureText(name).width;
      ctx.font = `24px ${FONT}`;
      let tw = tail ? ctx.measureText(tail).width : 0;
      // длинное имя — уменьшаем шрифт, а не обрезаем
      const f = Math.min(1, (LCOL - LPAD * 2) / Math.max(1, nw + tw));
      const s1 = Math.floor(30 * f), s2 = Math.floor(24 * f);
      nw *= s1 / 30;
      tw *= s2 / 24;
      const w = Math.min(LCOL, Math.ceil(nw + tw + LPAD * 2));
      widths.push(w);
      pill(ctx, 3, y + 4, w - 6, LROW - 8, v ? '#4a5272' : NEON);
      const ty = y + LROW / 2 + 1;
      ctx.font = `bold ${s1}px ${FONT}`;
      if (!v) {
        ctx.shadowColor = '#3ec5ff';
        ctx.shadowBlur = 10;
      }
      ctx.fillStyle = v ? '#b8c2e0' : '#ffffff';
      ctx.fillText(name, LPAD, ty, LCOL - LPAD * 2);
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      if (tail) {
        ctx.font = `${s2}px ${FONT}`;
        ctx.fillStyle = '#8fa3d9';
        ctx.fillText(tail, LPAD + nw, ty, Math.max(1, LCOL - LPAD * 2 - nw));
      }
    }
  }
  return widths;
}

// rig — риг игрока (родитель камеры и контроллеров); метки живут в нём
export function createVrHolsters({ camera, rig, slots } = {}) {
  if (!camera) throw new Error('createVrHolsters: нужна camera');

  // ---------- слоты ----------
  const src = Array.isArray(slots) && slots.length ? slots : DEFAULT_SLOTS;
  const S = [];
  for (let i = 0; i < src.length && S.length < MAX_SLOTS; i++) {
    const sl = src[i];
    if (!sl || !Number.isInteger(sl.index)) continue;
    const pl = PLACES[sl.place];
    const off = Array.isArray(sl.offset) && sl.offset.length >= 3 ? sl.offset : pl;
    if (!off) continue;
    const r = Number(sl.radius) > 0 ? Number(sl.radius) : pl ? pl[3] : 0.15;
    S.push({
      index: sl.index, name: String(sl.name ?? sl.index), place: sl.place || null,
      ox: +off[0] || 0, oy: +off[1] || 0, oz: +off[2] || 0,
      r, near: Math.max(NEAR, r + 0.1),
      p: new THREE.Vector3(), prox: 0, inside: false, vis: 0, hot: 0, variant: 0, lw: [0, 0],
    });
  }
  const n = S.length;

  // ---------- атлас и меш: на слот кольцо (четвёрка 2j) и подпись (2j + 1) ----------
  const texH = THREE.MathUtils.ceilPowerOfTwo(Math.max(RING_PX, n * 2 * LROW));
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = texH;
  const widths = drawAtlas(canvas.getContext('2d'), TEX_W, texH, S);
  for (let j = 0; j < n; j++) { S[j].lw[0] = widths[j * 2]; S[j].lw[1] = widths[j * 2 + 1]; }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4; // three сам ограничит возможностями GPU
  texture.needsUpdate = true;

  const pos = new Float32Array(n * 8 * 3);
  const col = new Float32Array(n * 8 * 4);
  const uv = new Float32Array(n * 8 * 2);
  const idx = new Uint16Array(n * 12);
  for (let q = 0; q < n * 2; q++) {
    const b = q * 4, o = q * 6;
    idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2;
    idx[o + 3] = b; idx[o + 4] = b + 2; idx[o + 5] = b + 3;
  }
  // вершины четвёрки: низ-лево, низ-право, верх-право, верх-лево
  function setUv(q, u0, v0, u1, v1) {
    const o = q * 8;
    uv[o] = u0; uv[o + 1] = v0; uv[o + 2] = u1; uv[o + 3] = v0;
    uv[o + 4] = u1; uv[o + 5] = v1; uv[o + 6] = u0; uv[o + 7] = v1;
  }
  function setLabelUv(j, v) {
    const row = j * 2 + v;
    setUv(j * 2 + 1, 0, 1 - ((row + 1) * LROW) / texH, S[j].lw[v] / TEX_W, 1 - (row * LROW) / texH);
  }
  for (let j = 0; j < n; j++) {
    setUv(j * 2, (TEX_W - RING_PX) / TEX_W, 1 - RING_PX / texH, 1, 1);
    setLabelUv(j, 0);
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage); // RGBA: альфа по вершинам
  const uvAttr = new THREE.BufferAttribute(uv, 2);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('color', colAttr);
  geo.setAttribute('uv', uvAttr);
  geo.setIndex(new THREE.BufferAttribute(idx, 1));

  const material = new THREE.MeshBasicMaterial({
    map: texture, vertexColors: true, transparent: true,
    depthTest: false, depthWrite: false, fog: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'vr-holsters';
  mesh.frustumCulled = false; // вершины двигаем сами, границы не пересчитываем
  mesh.renderOrder = 8800;
  mesh.layers.mask = XR_ONLY;
  mesh.visible = false;
  let lastUpdate = -Infinity;
  // страховка: update перестали вызывать (вышли из шлема, кобуры выключены) — прячемся
  mesh.onBeforeRender = () => {
    if (now() - lastUpdate > STALE_MS) {
      material.opacity = 0;
      mesh.visible = false;
    }
  };

  const hostOf = () => rig || camera.parent || null;
  {
    const h = hostOf();
    if (h) h.add(mesh);
  }

  // ---------- состояние ----------
  const states = new Map(); // контроллер → { zone } (zone — номер в S или −1)
  let disposed = false, active = false, mirror = 1, clock = 0;
  let torsoReady = false, torsoYaw = 0, turning = false, speed = 0, reaching = false;

  const _head = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _hq = new THREE.Quaternion();
  const _s = new THREE.Vector3();
  const _f = new THREE.Vector3();
  const _u = new THREE.Vector3();
  const _w = new THREE.Vector3();
  const _prevW = new THREE.Vector3();
  const _neck = new THREE.Vector3();
  const _hand = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _inv = new THREE.Matrix4();

  // голова в осях рига: позиция и поворот
  function readHead(host) {
    if (host && camera.parent === host) {
      _head.copy(camera.position);
      _q.copy(camera.quaternion);
      return;
    }
    camera.updateWorldMatrix(true, false);
    camera.matrixWorld.decompose(_head, _q, _s);
    if (host) {
      _head.applyMatrix4(_inv);
      host.getWorldQuaternion(_hq);
      _q.premultiply(_hq.invert());
    }
  }

  // центр ладони в осях рига (_inv должна быть свежей, если контроллер не прямой ребёнок рига)
  function handPos(c, host, out) {
    if (host && c.parent === host) return out.copy(PALM).applyQuaternion(c.quaternion).add(c.position);
    c.updateWorldMatrix(true, false);
    out.copy(PALM).applyMatrix4(c.matrixWorld);
    if (host) out.applyMatrix4(_inv);
    return out;
  }

  // поворот торса: лениво догоняет взгляд, на ходу — следует за ним
  function updateTorso(dt, host) {
    // взгляд по горизонтали; при взгляде вниз/вверх выручает вектор «вверх» головы
    _f.set(0, 0, -1).applyQuaternion(_q);
    _u.set(0, 1, 0).applyQuaternion(_q);
    const fx = _f.x - _f.y * _u.x, fz = _f.z - _f.y * _u.z;
    const headYaw = Math.atan2(-fx, -fz);

    _w.copy(_head);
    if (host) _w.applyMatrix4(host.matrixWorld);
    if (!torsoReady) {
      torsoReady = true;
      torsoYaw = headYaw;
      turning = false;
      speed = 0;
    } else {
      const d = Math.hypot(_w.x - _prevW.x, _w.z - _prevW.z);
      if (d > TELEPORT) {
        torsoYaw = headYaw;
        turning = false;
        speed = 0;
      } else if (dt > 0) {
        speed += (d / dt - speed) * (1 - Math.exp(-dt * 8));
      }
    }
    _prevW.copy(_w);

    let diff = wrap(headYaw - torsoYaw);
    const moving = speed > MOVE_SPEED;
    // пока рука в кобуре, торс не разворачиваем (только жёсткий предел)
    if (!reaching && Math.abs(diff) > TURN_START) turning = true;
    if ((turning && !reaching) || moving) {
      torsoYaw = wrap(torsoYaw + diff * (1 - Math.exp(-dt * (moving ? MOVE_RATE : TURN_RATE))));
      diff = wrap(headYaw - torsoYaw);
      if (Math.abs(diff) < TURN_STOP) turning = false;
    }
    if (diff > TURN_MAX) torsoYaw = wrap(headYaw - TURN_MAX);
    else if (diff < -TURN_MAX) torsoYaw = wrap(headYaw + TURN_MAX);
  }

  // точки кобур в осях рига: от основания шеи по x/z, от высоты головы по y
  function placeAnchors() {
    _neck.copy(NECK).applyQuaternion(_q).add(_head);
    const c = Math.cos(torsoYaw), s = Math.sin(torsoYaw);
    for (let j = 0; j < n; j++) {
      const sl = S[j], ox = sl.ox * mirror;
      sl.p.set(_neck.x + ox * c + sl.oz * s, _head.y + sl.oy, _neck.z - ox * s + sl.oz * c);
    }
  }

  // ближайшая зона (по доле радиуса) с гистерезисом для прежней; accumulate — копить близость для меток
  function pickZone(p, prev, accumulate) {
    let best = -1, bestN = 1;
    for (let j = 0; j < n; j++) {
      const sl = S[j];
      const d = p.distanceTo(sl.p);
      if (accumulate) {
        const pr = (sl.near - d) / (sl.near - sl.r);
        if (pr > sl.prox) sl.prox = pr > 1 ? 1 : pr;
      }
      const k = j === prev ? d / (sl.r * EXIT) : d / sl.r;
      if (k < bestN) { best = j; bestN = k; }
    }
    return best;
  }

  function tick(c) {
    try { c.userData.src?.gamepad?.hapticActuators?.[0]?.pulse(0.25, 25); } catch { /* вибро нет */ }
  }

  function deactivate() {
    active = false;
    torsoReady = false;
    reaching = false;
    mesh.visible = false;
    for (let j = 0; j < n; j++) {
      const sl = S[j];
      sl.prox = 0; sl.inside = false; sl.vis = 0; sl.hot = 0;
    }
    states.forEach((st) => { st.zone = -1; });
  }

  // ---------- рисование ----------
  function quad(q, cx, cy, cz, hw, hh, r, g, b, a) {
    const p = q * 12, o = q * 16;
    const rx = _right.x * hw, ry = _right.y * hw, rz = _right.z * hw;
    const ux = _up.x * hh, uy = _up.y * hh, uz = _up.z * hh;
    pos[p] = cx - rx - ux; pos[p + 1] = cy - ry - uy; pos[p + 2] = cz - rz - uz;
    pos[p + 3] = cx + rx - ux; pos[p + 4] = cy + ry - uy; pos[p + 5] = cz + rz - uz;
    pos[p + 6] = cx + rx + ux; pos[p + 7] = cy + ry + uy; pos[p + 8] = cz + rz + uz;
    pos[p + 9] = cx - rx + ux; pos[p + 10] = cy - ry + uy; pos[p + 11] = cz - rz + uz;
    for (let i = 0; i < 16; i += 4) {
      col[o + i] = r; col[o + i + 1] = g; col[o + i + 2] = b; col[o + i + 3] = a;
    }
  }
  // схлопнуть четвёрку в точку: ни одного пикселя
  function hideQuad(q) {
    const p = q * 12, o = q * 16;
    for (let i = 0; i < 12; i++) pos[p + i] = 0;
    for (let i = 3; i < 16; i += 4) col[o + i] = 0;
  }

  function draw(dt, current, weaponHand) {
    const kv = 1 - Math.exp(-dt * 10), kh = 1 - Math.exp(-dt * 16);
    let any = false;
    for (let j = 0; j < n; j++) {
      const sl = S[j];
      const tv = sl.inside ? 1 : sl.prox, th = sl.inside ? 1 : 0;
      sl.vis += (tv - sl.vis) * kv;
      sl.hot += (th - sl.hot) * kh;
      if (tv === 0 && sl.vis < 0.003) sl.vis = 0;
      if (th === 0 && sl.hot < 0.003) sl.hot = 0;
      if (sl.vis > 0) any = true;
      // оружие этого слота уже в руке — метка тусклая, подпись «в руке»
      const v = weaponHand && sl.index === current ? 1 : 0;
      if (v !== sl.variant) {
        sl.variant = v;
        setLabelUv(j, v);
        uvAttr.needsUpdate = true;
      }
    }
    if (!any) {
      mesh.visible = false;
      return;
    }
    // таблички параллельны экрану: оси «вправо» и «вверх» головы
    _right.set(1, 0, 0).applyQuaternion(_q);
    _up.set(0, 1, 0).applyQuaternion(_q);
    const lh = LROW / LABEL_PPM / 2;
    for (let j = 0; j < n; j++) {
      const sl = S[j], dim = sl.variant === 1;
      const h = sl.hot, e = h * h * (3 - 2 * h);
      const a = sl.vis * (0.5 + 0.5 * e) * (dim ? 0.45 : 1);
      const half = (RING + (RING_HOT - RING) * e) * (1 + 0.05 * e * Math.sin(clock * 9)) / 2;
      if (a > 0.003) {
        const lo = dim ? C_DIM : C_NEAR, hi = dim ? C_DIM_HOT : C_HOT;
        quad(j * 2, sl.p.x, sl.p.y, sl.p.z, half, half,
          lo.r + (hi.r - lo.r) * e, lo.g + (hi.g - lo.g) * e, lo.b + (hi.b - lo.b) * e, a);
      } else hideQuad(j * 2);
      const la = e * (dim ? 0.85 : 1) * sl.vis;
      if (la > 0.003) {
        const off = half + LABEL_GAP + lh;
        quad(j * 2 + 1, sl.p.x + _up.x * off, sl.p.y + _up.y * off, sl.p.z + _up.z * off,
          sl.lw[sl.variant] / LABEL_PPM / 2, lh, 1, 1, 1, la);
      } else hideQuad(j * 2 + 1);
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    material.opacity = 1;
    mesh.visible = true;
  }

  // ---------- кадр ----------
  // controllers — контроллеры XR; current — индекс оружия в руке; weaponHand — контроллер с ним
  function update(dt, { controllers, current = -1, weaponHand = null, enabled = true } = {}) {
    if (disposed) return;
    lastUpdate = now();
    dt = dt > 0 ? Math.min(dt, 0.1) : 0;
    clock += dt;
    const list = Array.isArray(controllers) ? controllers : EMPTY;
    // в шлеме: хотя бы один контроллер отслеживается (до сессии и после неё они скрыты)
    let tracked = false;
    for (let i = 0; i < list.length && !tracked; i++) tracked = !!(list[i] && list[i].visible);
    if (!enabled || !tracked || n === 0) {
      if (active || mesh.visible) deactivate();
      return;
    }

    const host = hostOf();
    if (host && mesh.parent !== host) host.add(mesh);
    if (host) {
      host.updateWorldMatrix(true, false);
      _inv.copy(host.matrixWorld).invert();
    }
    readHead(host);
    updateTorso(dt, host);
    placeAnchors();

    for (let j = 0; j < n; j++) { S[j].prox = 0; S[j].inside = false; }
    reaching = false;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c) continue;
      let st = states.get(c);
      if (!st) { st = { zone: -1 }; states.set(c, st); }
      if (!c.visible) { st.zone = -1; continue; }
      const z = pickZone(handPos(c, host, _hand), st.zone, true);
      if (z !== st.zone) {
        if (z >= 0) tick(c);
        st.zone = z;
      }
      if (z >= 0) { S[z].inside = true; reaching = true; }
    }
    active = true;
    draw(dt, current, weaponHand);
  }

  // индекс оружия кобуры, в зоне которой сейчас ладонь контроллера, или −1
  function zoneOf(controller) {
    if (disposed || !active || !controller || !controller.visible) return -1;
    if (now() - lastUpdate > STALE_MS) return -1;
    const host = hostOf();
    if (host && controller.parent !== host) {
      host.updateWorldMatrix(true, false);
      _inv.copy(host.matrixWorld).invert();
    }
    const st = states.get(controller);
    const j = pickZone(handPos(controller, host, _hand), st ? st.zone : -1, false);
    return j >= 0 ? S[j].index : -1;
  }

  // левша: правые и левые места меняются местами
  function setLeftHanded(v) {
    mirror = v ? -1 : 1;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    active = false;
    mesh.removeFromParent();
    geo.dispose();
    material.dispose();
    texture.dispose();
    states.clear();
  }

  return { update, zoneOf, setLeftHanded, dispose };
}
