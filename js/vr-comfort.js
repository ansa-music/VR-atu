// Комфорт в шлеме: «тоннелирование» при движении, затемнение при рывке-повороте,
// подсказки кнопок на контроллерах, надпись оружия и короткие всплывающие сообщения.
// Всё работает только при renderer.xr.isPresenting; на ПК объекты скрыты.
import * as THREE from 'three';

const STORAGE_KEY = 'vr-tir-comfort';
const FONT = 'system-ui, sans-serif';
const PANEL_BG = 'rgba(8,12,35,0.88)';
const NEON = '#4f7bff';
const DEFAULTS = { vignette: true, vignetteStrength: 0.7, turn: 'snap', hints: true, blink: true };
const KEYS = Object.keys(DEFAULTS);
const NO_MOTION = Object.freeze({ speed: 0, angularSpeed: 0, airborne: false, sprinting: false });
// слои 1 и 2 рисуют только левый/правый глаз XR: ни ПК-камера, ни камера оптики их не видят
const XR_ONLY = 0b110;

// тайминги, с
const HINT_TIME = 25;
const BLINK_TIME = 0.12;
const BLINK_MAX = 0.8;
const WEAPON_TIME = 1.2;
const TOAST_TIME = 1.5;
const TOAST_SLOTS = 3;
const TOAST_STEP = 0.11; // м: на сколько старое сообщение уезжает вверх при новом

// виньетка: радиусы в тангенсах угла от оси взгляда
const VIG_SEG = 40;
const VIG_OUTER = 4;      // заведомо шире поля зрения шлема
const VIG_DIST = 0.12;    // м перед глазом (near камеры 0.03)
const VIG_FEATHER = 0.45; // ширина мягкого края
const VIG_RING = VIG_SEG * 6; // индексы кольца
const VIG_FULL = VIG_SEG * 9; // кольцо + центр (для затемнения)

// подсказки: атлас 512 px в ширину, высота по числу строк (строка 100 px), 4200 px на метр
const ATLAS = 512, ROW = 100, PPM = 4200, ROW_GAP = 0.004;

// at — примерная точка кнопки в пространстве луча контроллера Quest, м
const HINTS_RIGHT = [
  { key: 'Курок', act: 'огонь', at: [0, -0.026, 0.012] },
  { key: 'Стик', act: 'поворот', sub: '(нажатие — режим огня)', at: [-0.006, -0.003, 0.04] },
  { key: 'B', act: 'след. оружие', sub: '(или возьмите с пояса/плеча)', at: [0.014, -0.004, 0.036] },
  { key: 'A', act: 'прыжок', at: [0.011, -0.006, 0.054] },
  { key: 'Хват', act: 'прицел', at: [-0.018, -0.05, 0.06] },
  { key: 'Хват', act: 'взять оружие', sub: '(рука у бедра или плеча)', at: [-0.018, -0.05, 0.06] },
];
const HINTS_LEFT = [
  { key: 'Стик', act: 'ходьба', sub: '(нажатие — бег)', at: [0.006, -0.003, 0.04] },
  { key: 'Y', act: 'пред. оружие', at: [-0.014, -0.004, 0.036] },
  { key: 'X', act: 'присесть', at: [-0.011, -0.006, 0.054] },
  { key: 'Хват', act: 'перезарядка', at: [0.018, -0.05, 0.06] },
  { key: 'Хват', act: 'магазин', sub: '(рука у пояса спереди)', at: [0.018, -0.05, 0.06] },
  { key: 'Хват', act: 'двумя руками', sub: '(рука у цевья)', at: [0.018, -0.05, 0.06] },
];

const VIG_VERT = /* glsl */ `
uniform float uInner;
uniform float uDist;
varying vec2 vP;
void main() {
  // z = 0: центр и внутреннее кольцо (радиус задаёт uInner), z = 1: внешнее кольцо
  vec2 p = position.z > 0.5 ? position.xy : position.xy * uInner;
  vP = p;
  // сразу в пространстве глаза: центр на оси взгляда каждого глаза, без стереосдвига
  gl_Position = projectionMatrix * vec4(p * uDist, -uDist, 1.0);
}`;

const VIG_FRAG = /* glsl */ `
uniform float uInner;
uniform float uFeather;
uniform float uAmount;
uniform float uBlink;
varying vec2 vP;
void main() {
  float a = smoothstep(uInner, uInner + uFeather, length(vP)) * uAmount;
  gl_FragColor = vec4(0.0, 0.004, 0.02, max(a, uBlink));
}`;

// ---------- настройки ----------
function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const o = raw ? JSON.parse(raw) : null;
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

function sanitize(s) {
  s.vignette = s.vignette !== false;
  const k = Number(s.vignetteStrength);
  s.vignetteStrength = Number.isFinite(k) ? Math.min(1, Math.max(0, k)) : DEFAULTS.vignetteStrength;
  s.turn = s.turn === 'smooth' ? 'smooth' : 'snap';
  s.hints = s.hints !== false;
  s.blink = s.blink !== false;
}

// цвет: '#rrggbb', число 0xrrggbb или THREE.Color
function cssColor(c) {
  if (typeof c === 'number') return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
  if (c && c.isColor) return '#' + c.getHexString();
  return typeof c === 'string' && c ? c : null;
}

// ---------- рисование на canvas (стиль ui.js) ----------
function panel(ctx, x, y, w, h, r, border, lw) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fillStyle = PANEL_BG;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = border;
  ctx.stroke();
}

function canvasMaterial(pw, ph, aniso) {
  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = aniso;
  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, opacity: 0,
    depthTest: false, depthWrite: false, fog: false, toneMapped: false,
  });
  return { canvas, ctx, texture, material };
}

// табличка-«пилюля» с одной строкой по центру
function drawTag(L, str, textColor, glowColor, border, size) {
  const { ctx, canvas } = L;
  const W = canvas.width, H = canvas.height, maxText = W - 80;
  ctx.clearRect(0, 0, W, H);
  ctx.font = `bold ${size}px ${FONT}`;
  const pw = Math.min(ctx.measureText(str).width, maxText) + 72;
  panel(ctx, (W - pw) / 2, 8, pw, H - 16, (H - 16) / 2, border, 6);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 16;
  ctx.fillStyle = textColor;
  ctx.fillText(str, W / 2, H / 2 + 2, maxText);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  L.texture.needsUpdate = true;
}

// атлас подсказок одной руки: строка на кнопку, возвращает ширины табличек в px
function drawHintAtlas(ctx, list) {
  const PAD = 22, MAXT = ATLAS - PAD * 2;
  const widths = [];
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < list.length; i++) {
    const h = list[i], y = i * ROW, rest = ` — ${h.act}`;
    ctx.font = `bold 34px ${FONT}`;
    let kw = ctx.measureText(h.key).width;
    const mw = kw + ctx.measureText(rest).width;
    let sw = 0;
    if (h.sub) {
      ctx.font = `25px ${FONT}`;
      sw = ctx.measureText(h.sub).width;
    }
    // не влезает в атлас — уменьшаем шрифт строки, а не обрезаем текст
    const s1 = Math.floor(34 * Math.min(1, MAXT / mw));
    const s2 = sw ? Math.floor(25 * Math.min(1, MAXT / sw)) : 25;
    const tw = Math.max(mw * s1 / 34, sw * s2 / 25);
    const w = Math.min(ATLAS, Math.ceil(tw + PAD * 2));
    widths.push(w);
    panel(ctx, 4, y + 5, w - 8, ROW - 10, 20, NEON, 4);
    const y1 = h.sub ? y + 37 : y + ROW / 2;
    ctx.font = `bold ${s1}px ${FONT}`;
    kw = ctx.measureText(h.key).width;
    ctx.fillStyle = '#9fe7ff';
    ctx.fillText(h.key, PAD, y1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(rest, PAD + kw, y1, Math.max(1, MAXT - kw));
    if (h.sub) {
      ctx.font = `${s2}px ${FONT}`;
      ctx.fillStyle = '#8fa3d9';
      ctx.fillText(h.sub, PAD, y + 70, MAXT);
    }
  }
  return widths;
}

// ---------- геометрия ----------
// 0 — центр, 1..N — внутреннее кольцо (единичное, z=0), N+1..2N — внешнее (z=1)
function vignetteGeometry() {
  const N = VIG_SEG;
  const pos = new Float32Array((1 + 2 * N) * 3);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const p = (1 + i) * 3, q = (1 + N + i) * 3;
    pos[p] = c; pos[p + 1] = s; pos[p + 2] = 0;
    pos[q] = c * VIG_OUTER; pos[q + 1] = s * VIG_OUTER; pos[q + 2] = 1;
  }
  const idx = [];
  // сначала кольцо — его рисуем всегда
  for (let i = 0; i < N; i++) {
    const a = 1 + i, b = 1 + ((i + 1) % N);
    idx.push(a, a + N, b, b, a + N, b + N);
  }
  // затем центр — только во время затемнения
  for (let i = 0; i < N; i++) idx.push(0, 1 + i, 1 + ((i + 1) % N));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// подсказки одной руки: все таблички одним мешем + выноски одним LineSegments
function buildHand(side, list, lineMat, aniso) {
  const AH = Math.ceil((list.length * ROW) / 4) * 4; // высота атласа: строка на кнопку
  const L = canvasMaterial(ATLAS, AH, aniso);
  const widths = drawHintAtlas(L.ctx, list);
  L.texture.needsUpdate = true;

  // столбик снаружи от контроллера, наклонён лицом вверх-назад к глазам
  const group = new THREE.Group();
  group.position.set(side * 0.04, 0.045, 0.05);
  group.rotation.set(-0.9, -side * 0.3, 0, 'YXZ');
  group.updateMatrix();
  const inv = group.matrix.clone().invert();

  const n = list.length, qh = ROW / PPM, pitch = qh + ROW_GAP;
  const pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), line = new Float32Array(n * 6);
  const idx = [];
  const a = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const yc = ((n - 1) / 2 - i) * pitch, y0 = yc - qh / 2, y1 = yc + qh / 2;
    const qw = widths[i] / PPM;
    const x0 = side > 0 ? 0 : -qw, x1 = side > 0 ? qw : 0;
    pos.set([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0], i * 12);
    const u1 = widths[i] / ATLAS, v1 = 1 - (i * ROW) / AH, v0 = 1 - ((i + 1) * ROW) / AH;
    uv.set([0, v0, u1, v0, u1, v1, 0, v1], i * 8);
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    // выноска от внутреннего края таблички к кнопке
    a.fromArray(list[i].at).applyMatrix4(inv);
    line.set([0, yc, 0, a.x, a.y, a.z], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const labels = new THREE.Mesh(geo, L.material);
  labels.renderOrder = 9000;
  labels.layers.mask = XR_ONLY;

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(line, 3));
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.renderOrder = 8990;
  lines.layers.mask = XR_ONLY;

  group.add(lines, labels);
  group.visible = false;
  return { group, geo, lineGeo, material: L.material, texture: L.texture };
}

// ---------- основной модуль ----------
export function createVrComfort({ renderer, camera, controllers, settings: initial } = {}) {
  if (!renderer || !camera) throw new Error('createVrComfort: нужны renderer и camera');
  const xr = renderer.xr;
  const ctrls = Array.isArray(controllers) ? controllers : [];
  const caps = renderer.capabilities;
  const aniso = Math.max(1, Math.min(4, caps && caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1));

  // настройки: по умолчанию ← переданные игрой ← сохранённые игроком
  const settings = { ...DEFAULTS };
  const sources = [initial, readStored()];
  for (let s = 0; s < sources.length; s++) {
    const src = sources[s];
    if (!src || typeof src !== 'object') continue;
    for (const k of KEYS) if (src[k] !== undefined) settings[k] = src[k];
  }
  sanitize(settings);
  const saved = { ...settings };

  const _head = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _v = new THREE.Vector3();
  let disposed = false, hiddenAll = false;

  // всплывающие объекты живут в риге (родитель камеры) — едут вместе с игроком
  const hostOf = () => camera.parent || camera;

  // ---------- виньетка и затемнение ----------
  const vigGeo = vignetteGeometry();
  const vigMat = new THREE.ShaderMaterial({
    uniforms: {
      uInner: { value: 1.35 },
      uFeather: { value: VIG_FEATHER },
      uAmount: { value: 0 },
      uBlink: { value: 0 },
      uDist: { value: VIG_DIST },
    },
    vertexShader: VIG_VERT,
    fragmentShader: VIG_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const vig = new THREE.Mesh(vigGeo, vigMat);
  vig.position.set(0, 0, -VIG_DIST); // для наглядности; шейдер ставит вершины сам
  vig.frustumCulled = false;
  vig.renderOrder = 100000;
  vig.layers.mask = XR_ONLY;
  vig.visible = false;
  camera.add(vig);
  let vigCur = 0, blinkT = 0;

  // ---------- подсказки кнопок ----------
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x9fe7ff, transparent: true, opacity: 0,
    depthTest: false, depthWrite: false, fog: false, toneMapped: false,
  });
  const hands = { right: buildHand(1, HINTS_RIGHT, lineMat, aniso), left: buildHand(-1, HINTS_LEFT, lineMat, aniso) };
  const handList = [hands.right, hands.left];
  let hintTimer = 0, hintsForced = false, hintAlpha = 0;

  function detachHints(c) {
    for (let i = 0; i < handList.length; i++) {
      if (handList[i].group.parent === c) c.remove(handList[i].group);
    }
  }
  function attachHints(c, src) {
    detachHints(c);
    if (!src || src.hand || !src.gamepad) return; // отслеживание рук — кнопок нет
    const h = src.handedness === 'left' ? hands.left : src.handedness === 'right' ? hands.right : null;
    if (h) c.add(h.group);
  }

  const unlisten = [];
  for (const c of ctrls) {
    if (!c || typeof c.addEventListener !== 'function') continue;
    const onConnected = (e) => attachHints(c, e.data);
    const onDisconnected = () => detachHints(c);
    c.addEventListener('connected', onConnected);
    c.addEventListener('disconnected', onDisconnected);
    unlisten.push(() => {
      c.removeEventListener('connected', onConnected);
      c.removeEventListener('disconnected', onDisconnected);
    });
    const src = c.userData && c.userData.src; // уже подключён (main.js хранит источник тут)
    if (src) attachHints(c, src);
  }

  // ---------- надпись оружия ----------
  const tagGeo = new THREE.PlaneGeometry(0.2, 0.05);
  const weapon = canvasMaterial(512, 128, aniso);
  const weaponMesh = new THREE.Mesh(tagGeo, weapon.material);
  weaponMesh.renderOrder = 9100;
  weaponMesh.layers.mask = XR_ONLY;
  weaponMesh.visible = false;
  let weaponT = 0, weaponCtrl = null, weaponName = null;

  // ---------- сообщения (3 слота по кругу) ----------
  const toastGeo = new THREE.PlaneGeometry(0.4, 0.1);
  const toasts = [];
  for (let i = 0; i < TOAST_SLOTS; i++) {
    const L = canvasMaterial(512, 128, aniso);
    const mesh = new THREE.Mesh(toastGeo, L.material);
    mesh.renderOrder = 9200 + i;
    mesh.layers.mask = XR_ONLY;
    mesh.visible = false;
    toasts.push({ L, mesh, t: 0, lift: 0, liftCur: 0, base: new THREE.Vector3() });
  }

  // голова и горизонтальное направление взгляда в мире
  function headFrame() {
    camera.getWorldPosition(_head);
    camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    else _fwd.normalize();
  }

  // ставит надпись над контроллером; k = 1 — сразу, иначе плавно
  function placeWeapon(k) {
    if (weaponCtrl && weaponCtrl.visible && weaponCtrl.parent) {
      weaponCtrl.getWorldPosition(_v);
      _v.y += 0.13;
    } else if (k >= 1) {
      headFrame();
      _v.copy(_head).addScaledVector(_fwd, 0.8);
      _v.y -= 0.12;
    } else {
      return; // контроллер потерян — надпись остаётся на месте
    }
    hostOf().worldToLocal(_v);
    if (k >= 1) weaponMesh.position.copy(_v);
    else weaponMesh.position.lerp(_v, k);
  }

  function hideAll() {
    vig.visible = false;
    for (let i = 0; i < handList.length; i++) handList[i].group.visible = false;
    weaponMesh.visible = false;
    for (let i = 0; i < toasts.length; i++) toasts[i].mesh.visible = false;
    hiddenAll = true;
  }

  function resetState() {
    vigCur = 0;
    blinkT = 0;
    hintAlpha = 0;
    weaponT = 0;
    weaponCtrl = null;
    for (let i = 0; i < toasts.length; i++) toasts[i].t = 0;
    hideAll();
  }

  // ---------- сохранение настроек (без аллокаций, пока ничего не менялось) ----------
  function syncSettings() {
    if (settings.vignette === saved.vignette && settings.vignetteStrength === saved.vignetteStrength &&
        settings.turn === saved.turn && settings.hints === saved.hints && settings.blink === saved.blink) return;
    sanitize(settings);
    if (!settings.hints) hintTimer = 0;
    for (const k of KEYS) saved[k] = settings[k];
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* приватный режим */ }
  }

  // ---------- кадр ----------
  function updateVignette(dt, m) {
    let target = 0;
    if (settings.vignette && settings.vignetteStrength > 0) {
      const sp = m.speed > 0 ? m.speed : 0;
      target = Math.min(1, sp / 4); // полная сила к ~4 м/с
      if (m.airborne) target += 0.25;
      const w = Math.abs(m.angularSpeed || 0);
      if (w > 0.01) target += 0.3 + Math.min(0.4, w * 0.25);
      if (m.sprinting && sp > 0.5) target += 0.1;
      if (target > 1) target = 1;
    }
    // нарастание ~0.15 с, спад ~0.4 с
    const tau = target > vigCur ? 0.05 : 0.13;
    vigCur += (target - vigCur) * (1 - Math.exp(-dt / tau));
    if (target === 0 && vigCur < 0.004) vigCur = 0;
    const s = settings.vignette ? vigCur * settings.vignetteStrength : 0;

    let blink = 0;
    if (blinkT > 0) {
      blinkT -= dt;
      if (blinkT > 0) blink = BLINK_MAX * Math.min(1, blinkT / (BLINK_TIME * 0.75));
    }

    const u = vigMat.uniforms;
    u.uInner.value = 1.35 - 0.85 * s; // чистая зона: ~53° → ~27° от центра
    u.uAmount.value = Math.min(1, s * 2.2) * 0.96;
    u.uBlink.value = blink;
    vigGeo.setDrawRange(0, blink > 0 ? VIG_FULL : VIG_RING);
    vig.visible = s > 0.004 || blink > 0;
  }

  function updateHints(dt) {
    if (hintTimer > 0) hintTimer -= dt;
    const show = hintsForced || hintTimer > 0;
    hintAlpha = show ? Math.min(1, hintAlpha + dt / 0.3) : Math.max(0, hintAlpha - dt / 0.6);
    const a = hintAlpha * hintAlpha * (3 - 2 * hintAlpha);
    const on = a > 0.002;
    for (let i = 0; i < handList.length; i++) {
      const h = handList[i];
      h.group.visible = on && h.group.parent !== null;
      h.material.opacity = a;
    }
    lineMat.opacity = a * 0.75;
  }

  function updateWeapon(dt) {
    if (weaponT <= 0) return;
    weaponT -= dt;
    if (weaponT <= 0) {
      weaponMesh.visible = false;
      weaponCtrl = null;
      return;
    }
    const age = WEAPON_TIME - weaponT;
    placeWeapon(1 - Math.exp(-dt * 25));
    weaponMesh.scale.setScalar(age < 0.12 ? 0.8 + age * (0.2 / 0.12) : 1);
    weaponMesh.material.opacity = Math.min(1, age / 0.08, weaponT / 0.3);
    weaponMesh.visible = true;
    weaponMesh.lookAt(_head);
  }

  function updateToasts(dt) {
    const k = 1 - Math.exp(-dt * 14);
    for (let i = 0; i < toasts.length; i++) {
      const s = toasts[i];
      if (s.t <= 0) continue;
      s.t -= dt;
      const mesh = s.mesh;
      if (s.t <= 0) {
        mesh.visible = false;
        continue;
      }
      const age = TOAST_TIME - s.t;
      s.liftCur += (s.lift - s.liftCur) * k;
      mesh.position.copy(s.base);
      mesh.position.y += s.liftCur + 0.05 * (age / TOAST_TIME); // лёгкое всплытие
      mesh.scale.setScalar(age < 0.12 ? 0.85 + age * (0.15 / 0.12) : 1);
      mesh.material.opacity = Math.min(1, age / 0.1, s.t / 0.35);
      mesh.visible = true;
      mesh.lookAt(_head);
    }
  }

  function update(dt, m = NO_MOTION) {
    if (disposed) return;
    syncSettings();
    if (!xr.isPresenting) {
      if (!hiddenAll) hideAll();
      return;
    }
    hiddenAll = false;
    dt = dt > 0 ? Math.min(dt, 0.1) : 0;
    updateVignette(dt, m || NO_MOTION);
    updateHints(dt);

    let floating = weaponT > 0;
    for (let i = 0; i < toasts.length && !floating; i++) floating = toasts[i].t > 0;
    if (!floating) return;
    camera.getWorldPosition(_head);
    hostOf().updateWorldMatrix(true, false);
    updateWeapon(dt);
    updateToasts(dt);
  }

  // ---------- публичные действия ----------
  function onSnapTurn() {
    if (disposed || !xr.isPresenting || !settings.blink) return;
    blinkT = BLINK_TIME;
  }

  function showWeapon(name, controller) {
    if (disposed || !xr.isPresenting || name == null) return;
    const host = hostOf();
    if (weaponMesh.parent !== host) host.add(weaponMesh);
    const str = String(name);
    if (str !== weaponName) {
      drawTag(weapon, str, '#ffffff', '#3ec5ff', NEON, 64);
      weaponName = str;
    }
    weaponCtrl = controller || null;
    weaponT = WEAPON_TIME;
    placeWeapon(1);
    weaponMesh.scale.setScalar(0.8);
    weaponMesh.material.opacity = 0;
  }

  function toast(text, color) {
    if (disposed || !xr.isPresenting || text == null) return;
    // свободный слот или самый старый
    let slot = toasts[0];
    for (let i = 0; i < toasts.length; i++) {
      const s = toasts[i];
      if (s.t <= 0) { slot = s; break; }
      if (s.t < slot.t) slot = s;
    }
    // остальные активные сообщения сдвигаются вверх
    for (let i = 0; i < toasts.length; i++) {
      const s = toasts[i];
      if (s !== slot && s.t > 0) s.lift += TOAST_STEP;
    }
    const c = cssColor(color);
    drawTag(slot.L, String(text), c || '#ffffff', c || '#3ec5ff', c || NEON, 56);

    // ~1.2 м перед головой, ниже уровня глаз
    headFrame();
    _v.copy(_head).addScaledVector(_fwd, 1.2);
    _v.y = _head.y - 0.3;
    const host = hostOf();
    host.worldToLocal(_v);
    slot.base.copy(_v);
    slot.t = TOAST_TIME;
    slot.lift = 0;
    slot.liftCur = 0;
    if (slot.mesh.parent !== host) host.add(slot.mesh);
    slot.mesh.position.copy(_v);
    slot.mesh.scale.setScalar(0.85);
    slot.mesh.material.opacity = 0;
  }

  // true — показать подсказки (до вызова с false), false — скрыть сейчас
  function setHintsVisible(v) {
    hintsForced = !!v;
    if (!hintsForced) hintTimer = 0;
  }

  // ---------- сессия XR ----------
  function onSessionStart() {
    resetState();
    hintTimer = settings.hints ? HINT_TIME : 0;
  }
  function onSessionEnd() {
    resetState();
    hintTimer = 0;
  }
  xr.addEventListener('sessionstart', onSessionStart);
  xr.addEventListener('sessionend', onSessionEnd);
  if (xr.isPresenting) onSessionStart();
  else hideAll();

  function dispose() {
    if (disposed) return;
    disposed = true;
    xr.removeEventListener('sessionstart', onSessionStart);
    xr.removeEventListener('sessionend', onSessionEnd);
    for (let i = 0; i < unlisten.length; i++) unlisten[i]();
    vig.removeFromParent();
    vigGeo.dispose();
    vigMat.dispose();
    for (let i = 0; i < handList.length; i++) {
      const h = handList[i];
      h.group.removeFromParent();
      h.geo.dispose();
      h.lineGeo.dispose();
      h.material.dispose();
      h.texture.dispose();
    }
    lineMat.dispose();
    weaponMesh.removeFromParent();
    weapon.material.dispose();
    weapon.texture.dispose();
    tagGeo.dispose();
    for (let i = 0; i < toasts.length; i++) {
      toasts[i].mesh.removeFromParent();
      toasts[i].L.material.dispose();
      toasts[i].L.texture.dispose();
    }
    toastGeo.dispose();
  }

  return { settings, update, onSnapTurn, showWeapon, toast, setHintsVisible, dispose };
}
