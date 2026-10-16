// Процедурный sci-fi бластер «VR Тир»: корпус, кожух ствола, энергоячейки, голоприцел
import * as THREE from 'three';

export const GRIP = new THREE.Vector3(0, -0.055, 0.075);   // центр рукояти (локально)
export const MUZZLE = new THREE.Vector3(0, 0.012, -0.19);  // срез ствола (локально)

const AY = 0.012;          // высота оси ствола
const FLASH = 0.07;        // длительность вспышки, с
const KICK = 0.03;         // откат назад, м
const PITCH = 0.14;        // подброс ~8°, рад

// --- общие текстуры на все экземпляры ---
let flashTex = null, knurlTex = null;

function getFlashTex() {
  if (flashTex) return flashTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.22, 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.2)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  // лучи
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * 31, 32 + Math.sin(a) * 31); g.stroke();
  }
  flashTex = new THREE.CanvasTexture(c);
  flashTex.colorSpace = THREE.SRGBColorSpace;
  return flashTex;
}

function getKnurlTex() {
  if (knurlTex) return knurlTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#000'; g.lineWidth = 3;
  for (let i = -64; i < 128; i += 8) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke();
    g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke();
  }
  knurlTex = new THREE.CanvasTexture(c);
  knurlTex.wrapS = knurlTex.wrapT = THREE.RepeatWrapping;
  knurlTex.repeat.set(40, 40); // UV экструзии — в метрах
  return knurlTex;
}

// Профиль сбоку (u = вперёд по -Z, v = вверх) → экструзия по X с фаской
function sideExtrude(pts, width, bevel) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  const depth = width - bevel * 2;
  const g = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8,
    bevelSegments: 2, curveSegments: 4,
  });
  g.rotateY(Math.PI / 2);          // u → -Z, глубина → +X
  g.translate(-depth / 2, 0, 0);   // по центру
  return g;
}

// Рёбристый кожух ствола (lathe вдоль -Z)
function shroudGeo() {
  const p = [];
  const r0 = 0.0158, r1 = 0.0176, L = 0.06;
  p.push(new THREE.Vector2(0.008, 0), new THREE.Vector2(0.0145, 0), new THREE.Vector2(r0, 0.004));
  for (let k = 0; k < 4; k++) {
    const h = 0.009 + k * 0.012;
    p.push(new THREE.Vector2(r0, h), new THREE.Vector2(r1, h + 0.002),
      new THREE.Vector2(r1, h + 0.007), new THREE.Vector2(r0, h + 0.009));
  }
  p.push(new THREE.Vector2(r0, L - 0.004), new THREE.Vector2(0.0135, L), new THREE.Vector2(0.008, L));
  const g = new THREE.LatheGeometry(p, 14);
  g.rotateX(-Math.PI / 2); // ось Y → -Z
  return g;
}

export function createWeapon({ color = 0x3ec5ff } = {}) {
  const col = new THREE.Color(color);
  const white = new THREE.Color(0xffffff);

  const group = new THREE.Group(); group.name = 'weapon';
  const pivot = new THREE.Group();     // покачивание при ходьбе
  const recoil = new THREE.Group();    // отдача, ось — в рукояти
  recoil.position.copy(GRIP);
  const body = new THREE.Group();
  body.position.copy(GRIP).negate();   // координаты body = координаты group в покое
  group.add(pivot); pivot.add(recoil); recoil.add(body);

  // --- материалы (общие внутри оружия) ---
  const gunmetal = new THREE.MeshStandardMaterial({ color: 0x3a4252, metalness: 0.8, roughness: 0.3 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x12151d, metalness: 0.7, roughness: 0.45 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0x9aa3b5, metalness: 1.0, roughness: 0.18 });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x1c1e27, metalness: 0.15, roughness: 0.8, bumpMap: getKnurlTex(), bumpScale: 1.2,
  });
  const accent = new THREE.MeshStandardMaterial({ color: 0x050608, emissive: col, emissiveIntensity: 2.2, roughness: 0.4 });
  const muzzleMat = accent.clone();
  const cellMats = [];
  for (let i = 0; i < 3; i++) {
    cellMats.push(new THREE.MeshStandardMaterial({
      color: col.clone().multiplyScalar(0.35), emissive: col, emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.1,
    }));
  }
  const holoMat = new THREE.MeshBasicMaterial({
    color: col, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const reticleMat = new THREE.MeshBasicMaterial({
    color: col.clone().lerp(white, 0.3), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });

  function add(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    body.add(m);
    return m;
  }

  // --- корпус ---
  add(sideExtrude([
    [-0.085, 0.0], [-0.085, 0.024], [-0.07, 0.034], [0.06, 0.034], [0.075, 0.029],
    [0.118, 0.029], [0.118, -0.002], [0.05, -0.002], [0.035, -0.011], [-0.05, -0.011],
  ], 0.03, 0.003), gunmetal, 0, 0, 0);

  // боковые тёмные панели под ячейки
  const panelGeo = new THREE.BoxGeometry(0.002, 0.018, 0.088);
  for (const s of [-1, 1]) add(panelGeo, darkMetal, s * 0.0152, AY + 0.002, 0.005);

  // светящиеся полосы по бокам
  const stripeGeo = new THREE.BoxGeometry(0.0012, 0.0024, 0.17);
  for (const s of [-1, 1]) add(stripeGeo, accent, s * 0.0156, 0.0285, -0.015);
  // полоса снизу спереди
  add(new THREE.BoxGeometry(0.012, 0.0012, 0.095), accent, 0, -0.0045, -0.068);
  // вентиляционные щели сверху спереди
  const ventGeo = new THREE.BoxGeometry(0.014, 0.0012, 0.0028);
  for (let i = 0; i < 3; i++) add(ventGeo, accent, 0, 0.0318, -0.088 - i * 0.01);

  // --- энергоячейки (3 шт., видны с обеих сторон) ---
  const cellGeo = new THREE.CylinderGeometry(0.0062, 0.0062, 0.036, 14, 1);
  cellGeo.rotateZ(Math.PI / 2);
  const ringGeo = new THREE.TorusGeometry(0.0074, 0.0014, 4, 14);
  ringGeo.rotateY(Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const z = -0.022 + i * 0.024;
    add(cellGeo, cellMats[i], 0, AY + 0.002, z);
    for (const s of [-1, 1]) add(ringGeo, chrome, s * 0.0168, AY + 0.002, z);
  }

  // --- кожух, ствол, дульный срез ---
  add(shroudGeo(), gunmetal, 0, AY, -0.104);
  const barrelGeo = new THREE.CylinderGeometry(0.0075, 0.0075, 0.03, 12);
  barrelGeo.rotateX(Math.PI / 2);
  add(barrelGeo, chrome, 0, AY, -0.173);
  add(new THREE.TorusGeometry(0.0078, 0.0018, 6, 16), muzzleMat, 0, AY, -0.187);
  const bore = new THREE.CircleGeometry(0.0062, 12); bore.rotateY(Math.PI);
  add(bore, muzzleMat, 0, AY, -0.1882);

  // --- рукоять с насечкой ---
  add(sideExtrude([
    [-0.045, -0.006], [-0.052, -0.035], [-0.05, -0.05], [-0.06, -0.072], [-0.068, -0.1],
    [-0.074, -0.106], [-0.113, -0.106], [-0.118, -0.1], [-0.1, -0.04], [-0.09, -0.006],
  ], 0.026, 0.004), rubber, 0, 0, 0);
  const gStripe = new THREE.BoxGeometry(0.0012, 0.055, 0.0024);
  for (const s of [-1, 1]) add(gStripe, accent, s * 0.0135, -0.056, 0.097, -0.29);
  add(new THREE.BoxGeometry(0.03, 0.007, 0.054), gunmetal, 0, -0.108, 0.094); // пятка

  // --- спусковая скоба и крючок ---
  const guard = new THREE.TorusGeometry(0.016, 0.0022, 5, 12, Math.PI);
  guard.rotateZ(Math.PI); guard.rotateY(Math.PI / 2);
  add(guard, darkMetal, 0, -0.011, 0.028);
  add(new THREE.BoxGeometry(0.0035, 0.014, 0.0045), chrome, 0, -0.019, 0.031, 0.25);

  // --- задняя заглушка с кольцом ---
  const capGeo = new THREE.CylinderGeometry(0.011, 0.012, 0.008, 14);
  capGeo.rotateX(Math.PI / 2);
  add(capGeo, darkMetal, 0, AY, 0.089);
  add(new THREE.TorusGeometry(0.0085, 0.0013, 4, 16), accent, 0, AY, 0.0935);

  // --- верхняя планка с зубцами ---
  add(new THREE.BoxGeometry(0.011, 0.004, 0.13), darkMetal, 0, 0.039, -0.02);
  const toothGeo = new THREE.BoxGeometry(0.014, 0.0025, 0.004);
  for (let i = 0; i < 6; i++) add(toothGeo, gunmetal, 0, 0.0415, -0.078 + i * 0.014);

  // --- голографический прицел ---
  add(new THREE.BoxGeometry(0.016, 0.006, 0.022), gunmetal, 0, 0.044, 0.03);
  const postGeo = new THREE.BoxGeometry(0.003, 0.014, 0.005);
  for (const s of [-1, 1]) add(postGeo, darkMetal, s * 0.0118, 0.054, 0.03);
  add(new THREE.TorusGeometry(0.012, 0.0016, 6, 24), gunmetal, 0, 0.062, 0.03);
  add(new THREE.CircleGeometry(0.0108, 20), holoMat, 0, 0.062, 0.03);
  add(new THREE.TorusGeometry(0.0035, 0.0005, 4, 20), reticleMat, 0, 0.062, 0.0298);
  add(new THREE.CircleGeometry(0.0008, 8), reticleMat, 0, 0.062, 0.0297);

  // --- дуло и вспышка ---
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle';
  muzzle.position.copy(MUZZLE);
  body.add(muzzle);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getFlashTex(), color: col.clone().lerp(white, 0.35), blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, opacity: 0,
  }));
  flash.position.set(MUZZLE.x, MUZZLE.y, MUZZLE.z - 0.012);
  flash.visible = false;
  body.add(flash);

  // --- состояние анимаций ---
  let t = 0, kickT = 1, flashT = 0, flare = 0, walk = 0, sway = 0;
  const charge = [1, 1, 1];

  function fire() {
    kickT = 0; flashT = FLASH; flare = 1;
    charge[0] = charge[1] = charge[2] = 0;
    flash.visible = true;
    flash.material.rotation = Math.random() * Math.PI * 2;
  }

  function update(dt, opts) {
    if (dt > 0.1) dt = 0.1;
    t += dt;

    // отдача: резкий толчок, пружинный возврат ~0.12 с
    kickT += dt;
    let k = 0;
    if (kickT < 0.02) k = kickT / 0.02;
    else if (kickT < 0.14) { const u = 1 - (kickT - 0.02) / 0.12; k = u * u * (3 - 2 * u); }
    recoil.position.z = GRIP.z + KICK * k;
    recoil.rotation.x = PITCH * k;

    // вспышка
    if (flashT > 0) {
      flashT -= dt;
      const f = flashT > 0 ? flashT / FLASH : 0;
      flash.material.opacity = f;
      const s = 0.04 + 0.05 * f;
      flash.scale.set(s, s, s);
      if (flashT <= 0) flash.visible = false;
    }

    // ячейки: вспышка → разряд → поочерёдная перезарядка + пульс
    flare = Math.max(0, flare - dt / 0.09);
    muzzleMat.emissiveIntensity = 2.2 + flare * 8;
    accent.emissiveIntensity = 2.2 + flare * 1.5;
    for (let i = 0; i < 3; i++) {
      if (kickT > 0.06 + i * 0.07) charge[i] = Math.min(1, charge[i] + dt * 3);
      const pulse = 0.85 + 0.15 * Math.sin(t * 3.2 - i * 0.9);
      cellMats[i].emissiveIntensity = (0.3 + 1.6 * charge[i]) * pulse + flare * 6;
    }

    // покачивание при ходьбе (только pivot)
    const moving = !!(opts && opts.moving);
    sway += ((moving ? 1 : 0) - sway) * Math.min(1, dt * 5);
    if (sway > 0.001) {
      walk += dt * 8;
      pivot.position.x = Math.sin(walk) * 0.006 * sway;
      pivot.position.y = (Math.cos(walk * 2) - 1) * 0.0035 * sway;
      pivot.rotation.z = Math.sin(walk) * 0.035 * sway;
      pivot.rotation.x = Math.cos(walk * 2) * 0.012 * sway;
    } else if (sway !== 0) {
      sway = 0;
      pivot.position.set(0, 0, 0); pivot.rotation.set(0, 0, 0);
    }
  }

  return { group, muzzle, fire, update };
}
