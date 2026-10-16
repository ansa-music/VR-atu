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

const _up = new THREE.Vector3(0, 1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3();
// сегмент-капсула между точками a и b
function seg(parent, a, b, r, mat) {
  _a.fromArray(a); _b.fromArray(b);
  const len = _a.distanceTo(_b);
  const m = new THREE.Mesh(capsule(r, len), mat);
  m.position.copy(_a).add(_b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_up, _b.sub(_a).normalize());
  parent.add(m);
  return m;
}
function addBox(parent, size, pos, mat, rot) {
  const m = new THREE.Mesh(box(size[0], size[1], size[2]), mat);
  m.position.fromArray(pos);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(m);
  return m;
}

// ---------- перчатка (строится для правой руки, левая — зеркало) ----------
function buildGlove(parent, glow) {
  // пальцы: средний, безымянный, мизинец обхватывают рукоять
  const fingers = [[0.003, 0.0088], [-0.017, 0.0083], [-0.035, 0.0074]];
  for (const [y, r] of fingers) {
    const p0 = [0.031, y, -0.002], p1 = [0.023, y, -0.031];
    const p2 = [-0.004, y, -0.035], p3 = [-0.024, y, -0.017];
    seg(parent, p0, p1, r, ARMOR);
    seg(parent, p1, p2, r * 0.95, GRAPH);
    seg(parent, p2, p3, r * 0.9, ARMOR);
    // накладка-костяшка
    addBox(parent, [0.012, 0.015, 0.016], [0.038, y, -0.004], GRAPH);
    // пластина на первой фаланге
    addBox(parent, [0.006, r * 1.6, 0.02], [0.033, y, -0.018], ARMOR, [0, -0.3, 0]);
  }
  // указательный — на спуске (0, -0.03, 0.035) в пространстве контроллера
  const iy = 0.024;
  seg(parent, [0.031, iy, -0.003], [0.021, iy + 0.002, -0.031], 0.0085, ARMOR);
  seg(parent, [0.021, iy + 0.002, -0.031], [0.006, iy, -0.041], 0.008, GRAPH);
  seg(parent, [0.006, iy, -0.041], [0.0, iy - 0.004, -0.04], 0.0075, ARMOR);
  addBox(parent, [0.012, 0.015, 0.016], [0.038, iy, -0.005], GRAPH);
  // большой палец — с другой стороны рукояти
  seg(parent, [0.022, 0.028, 0.036], [0.0, 0.036, 0.022], 0.0105, ARMOR);
  seg(parent, [0.0, 0.036, 0.022], [-0.021, 0.033, 0.003], 0.0095, GRAPH);
  seg(parent, [-0.021, 0.033, 0.003], [-0.026, 0.029, -0.014], 0.0085, ARMOR);
  addBox(parent, [0.014, 0.01, 0.018], [0.004, 0.044, 0.024], GRAPH, [0, 0.6, 0]);

  // ладонь и тыльная бронепластина (тыл смотрит наружу, +X)
  addBox(parent, [0.02, 0.068, 0.058], [0.027, -0.004, 0.026], PALM);
  addBox(parent, [0.011, 0.07, 0.062], [0.041, -0.003, 0.022], ARMOR, [0, 0, 0.06]);
  addBox(parent, [0.006, 0.05, 0.04], [0.048, 0.0, 0.026], GRAPH, [0, 0, 0.06]);
  // светящиеся полосы на тыле
  addBox(parent, [0.003, 0.005, 0.05], [0.0515, 0.012, 0.024], glow);
  addBox(parent, [0.003, 0.005, 0.034], [0.0515, -0.006, 0.03], glow);
  // запястье-манжета с кольцом
  const cuff = new THREE.Group();
  cuff.position.set(0.02, 0.006, 0.072);
  cuff.rotation.x = 0.35;   // предплечье уходит назад и вниз
  parent.add(cuff);
  const cyl = new THREE.Mesh(cuffGeo(), ARMOR);
  cuff.add(cyl);
  const ring = new THREE.Mesh(ringGeo(), glow);
  ring.position.z = -0.012;
  cuff.add(ring);
  const ring2 = new THREE.Mesh(ringGeo(), glow);
  ring2.position.z = 0.014;
  ring2.scale.setScalar(1.06);
  cuff.add(ring2);
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

export function createHand({ side = 'right', color = 0x3ec5ff } = {}) {
  baseMats();
  const group = new THREE.Group();
  group.name = 'hand-' + side;
  const glow = glowMat(color);
  const pivot = new THREE.Group();     // точка — центр рукояти
  pivot.position.copy(GRIP);
  if (side === 'left') pivot.scale.x = -1;   // рендерер сам разворачивает грани
  group.add(pivot);
  buildGlove(pivot, glow);
  let t = Math.random() * 6;
  return {
    group,
    update(dt) {
      t += dt;
      glow.emissiveIntensity = 1.4 + 0.5 * Math.sin(t * 3.2);
    },
  };
}

// ---------- предплечье для десктопного вида ----------
export function createArm({ color = 0xff7ad9 } = {}) {
  baseMats();
  const hand = createHand({ side: 'right', color });
  const group = hand.group;
  group.name = 'arm';
  const glow = hand.group.children[0].children.find((m) => m.material && m.material.emissive && m.material.emissiveIntensity > 1).material;

  const L = 0.36;
  const fa = new THREE.Group();
  fa.position.set(GRIP.x + 0.02, GRIP.y + 0.006, GRIP.z + 0.085);
  fa.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0.18, -0.42, 1).normalize());
  group.add(fa);

  // рукав: сужающийся цилиндр от запястья к локтю
  const sleeveGeo = new THREE.CylinderGeometry(0.046, 0.03, L, 12, 1, false);
  sleeveGeo.rotateX(Math.PI / 2);
  const sleeve = new THREE.Mesh(sleeveGeo, GRAPH);
  sleeve.position.z = L / 2;
  fa.add(sleeve);
  // бронепластины сверху и снаружи
  for (let i = 0; i < 3; i++) {
    const z = 0.06 + i * 0.105;
    const r = 0.03 + (0.016 * z) / L;
    addBox(fa, [0.042, 0.009, 0.085], [0, r + 0.002, z], ARMOR, [0.04, 0, 0]);
    addBox(fa, [0.009, 0.034, 0.085], [r + 0.002, 0, z], ARMOR, [0, -0.04, 0]);
    const ring = new THREE.Mesh(ringGeo(), glow);
    ring.position.z = z + 0.05;
    ring.scale.setScalar((r + 0.003) / 0.031);
    fa.add(ring);
  }
  // светящиеся полосы вдоль рукава
  addBox(fa, [0.004, 0.004, L * 0.9], [0.022, 0.035, L / 2], glow, [0.045, 0, 0]);
  addBox(fa, [0.004, 0.004, L * 0.9], [0.035, -0.02, L / 2], glow, [0, -0.045, 0]);
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
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, fog: false, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.045), mat);
  mesh.rotation.x = -1.0;   // смотрит вверх и назад, к глазам
  mesh.renderOrder = 10;
  const group = new THREE.Group();
  group.name = 'wrist-hud';
  group.position.set(0, 0.035, 0.13);
  group.add(mesh);

  let ls = null, lt = null, lm = null, lk = null;
  function draw(score, t, mult, mk) {
    ctx.clearRect(0, 0, 256, 128);
    roundRect(ctx, 4, 4, 248, 120, 14);
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
    tex.needsUpdate = true;
  }
  draw(0, 0, 1, false);

  return {
    group,
    update({ score = 0, timeLeft = 0, multiplier = 1, mk = false } = {}) {
      const t = Math.max(0, Math.ceil(timeLeft));
      if (score === ls && t === lt && multiplier === lm && mk === lk) return;
      ls = score; lt = t; lm = multiplier; lk = mk;
      draw(score, t, multiplier, mk);
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
