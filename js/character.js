// Персонаж игрока: бронеперчатки, предплечье (десктоп), голо-HUD на запястье, тень.
// Координаты — пространство контроллера WebXR: вперёд -Z, вверх +Y, метры.
import * as THREE from 'three';

const GRIP = new THREE.Vector3(0, -0.055, 0.075);   // центр рукояти бластера

// ---------- общие материалы и геометрии ----------
let ARMOR, GRAPH, PALM;
function baseMats() {
  if (ARMOR) return;
  ARMOR = new THREE.MeshStandardMaterial({ color: 0x1a2340, metalness: 0.6, roughness: 0.35 });
  GRAPH = new THREE.MeshStandardMaterial({ color: 0x2a2f3c, metalness: 0.6, roughness: 0.4 });
  PALM  = new THREE.MeshStandardMaterial({ color: 0x0e1122, metalness: 0.2, roughness: 0.8 });
}
function glowMat(color) {
  return new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 1.6, metalness: 0.2, roughness: 0.4,
  });
}

const geoCache = new Map();
function capsule(r, len) {
  const k = 'c' + r.toFixed(4) + '|' + len.toFixed(3);
  let g = geoCache.get(k);
  if (!g) { g = new THREE.CapsuleGeometry(r, len, 2, 6); geoCache.set(k, g); }
  return g;
}
function box(x, y, z) {
  const k = 'b' + x + '|' + y + '|' + z;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(x, y, z); geoCache.set(k, g); }
  return g;
}

// ---------- слияние статичных деталей: одна геометрия на материал ----------
// Детали копятся по «роли» материала ('armor' | 'graph' | 'palm' | 'glow'),
// матрица детали запекается в вершины, потом всё сливается в один индексный буфер.
const _up = new THREE.Vector3(0, 1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _pos = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _sc = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _mb = new THREE.Matrix4();

function createBatch() {
  const parts = new Map();            // роль -> [{ geo, flip }]
  const base = new THREE.Matrix4();   // общее смещение текущей группы деталей
  return {
    base,
    add(geo, role, matrix) {
      _mb.multiplyMatrices(base, matrix);
      const g = geo.clone().applyMatrix4(_mb);
      let list = parts.get(role);
      if (!list) { list = []; parts.set(role, list); }
      list.push({ geo: g, flip: _mb.determinant() < 0 });   // зеркальная матрица — разворот граней
    },
    merge() {
      const out = {};
      for (const [role, list] of parts) {
        out[role] = mergeGeometries(list);
        for (const p of list) p.geo.dispose();
      }
      return out;
    },
  };
}

// position/normal/uv + индексы со смещением (неиндексные детали индексируются по порядку)
function mergeGeometries(list) {
  let nv = 0, ni = 0;
  for (const { geo } of list) {
    const n = geo.attributes.position.count;
    nv += n;
    ni += geo.index ? geo.index.count : n;
  }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const { geo, flip } of list) {
    const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv;
    const n = P.count;
    for (let i = 0; i < n; i++) {
      const v = vo + i;
      pos[v * 3] = P.getX(i); pos[v * 3 + 1] = P.getY(i); pos[v * 3 + 2] = P.getZ(i);
      if (N) { nor[v * 3] = N.getX(i); nor[v * 3 + 1] = N.getY(i); nor[v * 3 + 2] = N.getZ(i); }
      if (U) { uv[v * 2] = U.getX(i); uv[v * 2 + 1] = U.getY(i); }
    }
    const I = geo.index;
    const cnt = I ? I.count : n;
    for (let i = 0; i + 2 < cnt; i += 3) {
      const a = vo + (I ? I.getX(i) : i);
      const b = vo + (I ? I.getX(i + 1) : i + 1);
      const c = vo + (I ? I.getX(i + 2) : i + 2);
      idx[io++] = a;
      if (flip) { idx[io++] = c; idx[io++] = b; } else { idx[io++] = b; idx[io++] = c; }
    }
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(io === ni ? idx : idx.slice(0, io), 1));
  out.computeBoundingSphere();
  return out;
}

// сегмент-капсула между точками a и b
function seg(batch, a, b, r, role) {
  _a.fromArray(a); _b.fromArray(b);
  const len = _a.distanceTo(_b);
  _pos.copy(_a).add(_b).multiplyScalar(0.5);
  _q.setFromUnitVectors(_up, _b.sub(_a).normalize());
  batch.add(capsule(r, len), role, _m.compose(_pos, _q, _one));
}
function addBox(batch, size, pos, role, rot) {
  _pos.fromArray(pos);
  if (rot) _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])); else _q.identity();
  batch.add(box(size[0], size[1], size[2]), role, _m.compose(_pos, _q, _one));
}
// кольцо: смещение по Z и равномерный масштаб внутри родительской матрицы
function addRing(batch, parentM, z, s) {
  _m2.compose(_pos.set(0, 0, z), _q.identity(), _sc.setScalar(s));
  batch.add(ringGeo(), 'glow', _m.multiplyMatrices(parentM, _m2));
}

// ---------- перчатка (строится для правой руки, левая — зеркало) ----------
function buildGlove(batch) {
  // пальцы: средний, безымянный, мизинец обхватывают рукоять
  const fingers = [[0.003, 0.0088], [-0.017, 0.0083], [-0.035, 0.0074]];
  for (const [y, r] of fingers) {
    const p0 = [0.031, y, -0.002], p1 = [0.023, y, -0.031];
    const p2 = [-0.004, y, -0.035], p3 = [-0.024, y, -0.017];
    seg(batch, p0, p1, r, 'armor');
    seg(batch, p1, p2, r * 0.95, 'graph');
    seg(batch, p2, p3, r * 0.9, 'armor');
    // накладка-костяшка
    addBox(batch, [0.012, 0.015, 0.016], [0.038, y, -0.004], 'graph');
    // пластина на первой фаланге
    addBox(batch, [0.006, r * 1.6, 0.02], [0.033, y, -0.018], 'armor', [0, -0.3, 0]);
  }
  // указательный — на спуске (0, -0.03, 0.035) в пространстве контроллера
  const iy = 0.024;
  seg(batch, [0.031, iy, -0.003], [0.021, iy + 0.002, -0.031], 0.0085, 'armor');
  seg(batch, [0.021, iy + 0.002, -0.031], [0.006, iy, -0.041], 0.008, 'graph');
  seg(batch, [0.006, iy, -0.041], [0.0, iy - 0.004, -0.04], 0.0075, 'armor');
  addBox(batch, [0.012, 0.015, 0.016], [0.038, iy, -0.005], 'graph');
  // большой палец — с другой стороны рукояти
  seg(batch, [0.022, 0.028, 0.036], [0.0, 0.036, 0.022], 0.0105, 'armor');
  seg(batch, [0.0, 0.036, 0.022], [-0.021, 0.033, 0.003], 0.0095, 'graph');
  seg(batch, [-0.021, 0.033, 0.003], [-0.026, 0.029, -0.014], 0.0085, 'armor');
  addBox(batch, [0.014, 0.01, 0.018], [0.004, 0.044, 0.024], 'graph', [0, 0.6, 0]);

  // ладонь и тыльная бронепластина (тыл смотрит наружу, +X)
  addBox(batch, [0.02, 0.068, 0.058], [0.027, -0.004, 0.026], 'palm');
  addBox(batch, [0.011, 0.07, 0.062], [0.041, -0.003, 0.022], 'armor', [0, 0, 0.06]);
  addBox(batch, [0.006, 0.05, 0.04], [0.048, 0.0, 0.026], 'graph', [0, 0, 0.06]);
  // светящиеся полосы на тыле
  addBox(batch, [0.003, 0.005, 0.05], [0.0515, 0.012, 0.024], 'glow');
  addBox(batch, [0.003, 0.005, 0.034], [0.0515, -0.006, 0.03], 'glow');
  // запястье-манжета с кольцом; предплечье уходит назад и вниз (поворот X 0.35)
  const cuffM = new THREE.Matrix4().compose(
    _pos.set(0.02, 0.006, 0.072), _q.setFromEuler(_e.set(0.35, 0, 0)), _one);
  batch.add(cuffGeo(), 'armor', cuffM);
  addRing(batch, cuffM, -0.012, 1);
  addRing(batch, cuffM, 0.014, 1.06);
}
function cuffGeo() {
  let g = geoCache.get('cuff');
  if (!g) {
    g = new THREE.CylinderGeometry(0.029, 0.031, 0.036, 10, 1);
    g.rotateX(Math.PI / 2);
    geoCache.set('cuff', g);
  }
  return g;
}
function ringGeo() {
  let g = geoCache.get('ring');
  if (!g) { g = new THREE.TorusGeometry(0.031, 0.0028, 4, 16); geoCache.set('ring', g); }
  return g;
}

// ---------- предплечье для десктопного вида (детали в пространстве pivot правой руки) ----------
function buildForearm(batch) {
  const L = 0.36;
  // в группе руки предплечье стоит в GRIP + (0.02, 0.006, 0.085); pivot сдвинут на GRIP
  batch.base.compose(
    _pos.set(0.02, 0.006, 0.085),
    _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0.18, -0.42, 1).normalize()),
    _one);
  const faM = batch.base.clone();

  // рукав: сужающийся цилиндр от запястья к локтю
  const sleeveGeo = new THREE.CylinderGeometry(0.046, 0.03, L, 12, 1, false);
  sleeveGeo.rotateX(Math.PI / 2);
  batch.add(sleeveGeo, 'graph', _m.makeTranslation(0, 0, L / 2));
  sleeveGeo.dispose();
  // бронепластины сверху и снаружи
  for (let i = 0; i < 3; i++) {
    const z = 0.06 + i * 0.105;
    const r = 0.03 + (0.016 * z) / L;
    addBox(batch, [0.042, 0.009, 0.085], [0, r + 0.002, z], 'armor', [0.04, 0, 0]);
    addBox(batch, [0.009, 0.034, 0.085], [r + 0.002, 0, z], 'armor', [0, -0.04, 0]);
  }
  // светящиеся полосы вдоль рукава
  addBox(batch, [0.004, 0.004, L * 0.9], [0.022, 0.035, L / 2], 'glow', [0.045, 0, 0]);
  addBox(batch, [0.004, 0.004, L * 0.9], [0.035, -0.02, L / 2], 'glow', [0, -0.045, 0]);
  // кольца: матрица предплечья уже в faM — база не нужна
  batch.base.identity();
  for (let i = 0; i < 3; i++) {
    const z = 0.06 + i * 0.105;
    const r = 0.03 + (0.016 * z) / L;
    addRing(batch, faM, z + 0.05, (r + 0.003) / 0.031);
  }
}

// Слитые геометрии общие для всех перчаток (цвет — только в материале): 'hand' | 'arm'
const mergedGeos = {};
function gloveGeos(withArm) {
  const key = withArm ? 'arm' : 'hand';
  if (!mergedGeos[key]) {
    const batch = createBatch();
    buildGlove(batch);
    if (withArm) buildForearm(batch);
    mergedGeos[key] = batch.merge();
  }
  return mergedGeos[key];
}

// Перчатка: по одному мешу на материал (броня, графит, ладонь, свечение)
function buildHand(side, color, withArm) {
  baseMats();
  const group = new THREE.Group();
  group.name = 'hand-' + side;
  const pivot = new THREE.Group();     // точка — центр рукояти
  pivot.position.copy(GRIP);
  if (side === 'left') pivot.scale.x = -1;   // рендерер сам разворачивает грани
  group.add(pivot);
  const mats = { armor: ARMOR, graph: GRAPH, palm: PALM, glow: glowMat(color) };
  const geos = gloveGeos(withArm);
  const glowMeshes = [];
  for (const role in geos) {
    const mesh = new THREE.Mesh(geos[role], mats[role]);
    mesh.name = 'glove-' + role;
    pivot.add(mesh);
    if (role === 'glow') glowMeshes.push(mesh);
  }
  return { group, glowMeshes };
}

export function createHand({ side = 'right', color = 0x3ec5ff } = {}) {
  const { group, glowMeshes } = buildHand(side, color, false);
  let t = Math.random() * 6;
  return {
    group,
    update(dt) {
      t += dt;
      const k = 1.4 + 0.5 * Math.sin(t * 3.2);
      // материал берём с меша: tintCharacter() подменяет его клоном
      for (let i = 0; i < glowMeshes.length; i++) {
        const mat = glowMeshes[i].material;
        if (mat && mat.emissiveIntensity !== undefined) mat.emissiveIntensity = k;
      }
    },
  };
}

// ---------- предплечье для десктопного вида ----------
export function createArm({ color = 0xff7ad9 } = {}) {
  // кисть и рукав слиты в общие меши (свечение статичное, как и раньше — update нет)
  const { group } = buildHand('right', color, true);
  group.name = 'arm';
  return { group };
}

// ---------- голографический HUD на запястье ----------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createWristHud() {
  const W = 256, H = 176;   // нижний ряд — оружие
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, fog: false, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09 * H / W), mat);   // пропорции холста
  mesh.rotation.x = -1.0;   // смотрит вверх и назад, к глазам
  mesh.renderOrder = 10;
  const group = new THREE.Group();
  group.name = 'wrist-hud';
  group.position.set(0, 0.035, 0.13);
  group.add(mesh);

  let ls = null, lt = null, lm = null, lk = null, lwn = null, lwa = null, lws = null;
  function draw(score, t, mult, mk, wn, wa, ws) {
    ctx.clearRect(0, 0, W, H);
    roundRect(ctx, 4, 4, W - 8, H - 8, 14);
    ctx.fillStyle = 'rgba(8,14,40,0.62)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#3ec5ff';
    ctx.shadowColor = '#3ec5ff'; ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // очки
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#7c9cff';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('ОЧКИ', 18, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.fillText(String(score), 16, 78);
    // время
    ctx.textAlign = 'right';
    ctx.fillStyle = '#7c9cff';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('ВРЕМЯ', 238, 30);
    ctx.fillStyle = t <= 10 ? '#ff4060' : '#3ec5ff';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.fillText(String(t), 238, 76);
    // множитель
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText('x' + mult, 18, 112);
    // МК
    ctx.textAlign = 'right';
    ctx.fillStyle = '#c8d0ff';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText('МК', 214, 111);
    ctx.beginPath();
    ctx.arc(228, 104, 7, 0, Math.PI * 2);
    ctx.fillStyle = mk ? '#34e89e' : '#5a6070';
    ctx.fill();
    // оружие: название слева, патроны справа, статус — янтарём ниже
    if (wn || wa || ws) {
      ctx.strokeStyle = 'rgba(62,197,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(18, 122); ctx.lineTo(238, 122);
      ctx.stroke();
      let aw = 0;
      if (wa) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px system-ui, sans-serif';
        ctx.fillText(wa, 238, 146, 130);
        aw = Math.min(130, ctx.measureText(wa).width) + 12;
      }
      if (wn) {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#9fdcff';
        ctx.font = 'bold 19px system-ui, sans-serif';
        ctx.fillText(wn, 18, 145, Math.max(40, 220 - aw));
      }
      if (ws) {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffb23f';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillText(ws, 18, 164, 220);
      }
    }
    tex.needsUpdate = true;
  }
  draw(0, 0, 1, false, '', '', '');

  return {
    group,
    update({ score = 0, timeLeft = 0, multiplier = 1, mk = false, weapon = null } = {}) {
      const t = Math.max(0, Math.ceil(timeLeft));
      const wn = weapon && weapon.name != null ? String(weapon.name) : '';
      const wa = weapon && weapon.ammo != null ? String(weapon.ammo) : '';
      const ws = weapon && weapon.status ? String(weapon.status) : '';
      if (score === ls && t === lt && multiplier === lm && mk === lk &&
          wn === lwn && wa === lwa && ws === lws) return;
      ls = score; lt = t; lm = multiplier; lk = mk; lwn = wn; lwa = wa; lws = ws;
      draw(score, t, multiplier, mk, wn, wa, ws);
    },
  };
}

// ---------- мягкая тень на полу ----------
let shadowTex = null;
export function createShadowBlob() {
  if (!shadowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.45)');
    gr.addColorStop(0.5, 'rgba(0,0,0,0.25)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
  }
  const geo = new THREE.CircleGeometry(0.45, 32);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: shadowTex, transparent: true, depthWrite: false, color: 0xffffff,
  }));
  mesh.position.y = 0.005;
  mesh.renderOrder = 1;
  mesh.name = 'shadow-blob';
  return mesh;
}
