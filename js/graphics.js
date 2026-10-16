import * as THREE from 'three';

// Графика: тон-маппинг, неоновая карта окружения, красивые мишени

// Карта окружения: тёмная комната с неоновыми панелями, запекается в PMREM
export function setupGraphics(renderer, scene) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const tmp = new THREE.Scene();
  const disposables = [];
  const room = new THREE.BoxGeometry(20, 20, 20);
  const roomMat = new THREE.MeshBasicMaterial({ color: 0x05060f, side: THREE.BackSide });
  tmp.add(new THREE.Mesh(room, roomMat));
  disposables.push(room, roomMat);

  // панели: [цвет, яркость, w, h, x, y, z]
  const panels = [
    [0xff3aa8, 4, 8, 1.2, 0, 2, -9.9],   // розовая полоса впереди
    [0xffd23f, 2.5, 5, 3, 0, 5, -9.9],     // «солнце»
    [0x3ec5ff, 4, 1, 10, -9.9, 2, 0],    // голубая слева
    [0x7c5cff, 4, 1, 10, 9.9, 2, 0],     // фиолетовая справа
    [0x3ec5ff, 3, 12, 0.6, 0, 9.9, 0],   // голубая сверху
    [0xff3aa8, 3, 10, 0.8, 0, -2, 9.9],  // розовая сзади
    [0x7c5cff, 2, 14, 0.5, 0, -9.9, 0],  // отсвет снизу
  ];
  const plane = new THREE.PlaneGeometry(1, 1);
  disposables.push(plane);
  for (const [c, k, w, h, x, y, z] of panels) {
    const m = new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
    m.color.multiplyScalar(k);
    disposables.push(m);
    const p = new THREE.Mesh(plane, m);
    p.scale.set(w, h, 1);
    p.position.set(x, y, z);
    p.lookAt(0, 0, 0);
    tmp.add(p);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(tmp, 0.04);
  scene.environment = rt.texture;
  pmrem.dispose();
  for (const d of disposables) d.dispose();

  return { update() {} };
}

// ---- общие ресурсы мишеней (кэш, main их не удаляет) ----
let C = null;
function sparkTexture() {
  const s = 64, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,240,180,0.8)');
  grd.addColorStop(1, 'rgba(255,200,60,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  // лучи звезды
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(s / 2 - 1, 2, 2, s - 4);
  g.fillRect(2, s / 2 - 1, s - 4, 2);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// слияние неиндексированных геометрий (позиции + нормали)
function merge(list) {
  const geos = list.map(g => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o);
    nor.set(g.attributes.normal.array, o);
    o += g.attributes.position.array.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
function cache() {
  if (C) return C;
  C = {};
  // обычная: ядро и кольцо
  C.coreGeo = new THREE.SphereGeometry(0.45, 12, 8);
  C.ringGeo = new THREE.TorusGeometry(1.45, 0.025, 6, 48);
  C.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  // золотая: два скрещенных кольца + искра
  const r1 = new THREE.TorusGeometry(1.3, 0.035, 6, 48);
  const r2 = r1.clone().rotateY(Math.PI / 2);
  C.goldRingsGeo = merge([r1, r2]);
  C.goldRingMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 1, roughness: 0.25, emissive: 0xff9a00, emissiveIntensity: 0.6 });
  C.sparkMat = new THREE.SpriteMaterial({ map: sparkTexture(), color: 0xfff0b0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  // бомба: шипы, светящиеся кончики, пояс
  const dirs = [];
  const N = 10;
  for (let i = 0; i < N; i++) { // равномерно по сфере (Фибоначчи)
    const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    dirs.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  const up = new THREE.Vector3(0, 1, 0);
  const spikes = [], tips = [];
  for (const d of dirs) {
    const q = new THREE.Quaternion().setFromUnitVectors(up, d);
    const cone = new THREE.ConeGeometry(0.17, 0.55, 8);
    cone.applyQuaternion(q).translate(d.x * 1.15, d.y * 1.15, d.z * 1.15);
    spikes.push(cone);
    const tip = new THREE.SphereGeometry(0.09, 8, 6);
    tip.translate(d.x * 1.45, d.y * 1.45, d.z * 1.45);
    tips.push(tip);
  }
  C.spikeGeo = merge(spikes);
  C.tipGeo = merge(tips);
  C.spikeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a22, metalness: 0.9, roughness: 0.35 });
  C.tipMat = new THREE.MeshBasicMaterial({ color: 0xff1030, toneMapped: false });
  C.bandGeo = new THREE.TorusGeometry(1.02, 0.07, 6, 40).rotateX(Math.PI / 2);
  C.bandMat = new THREE.MeshBasicMaterial({ color: 0xff2040, toneMapped: false });
  C.coreMats = new Map(); // ядро по цвету
  return C;
}
function coreMat(color) {
  const key = new THREE.Color(color).getHex();
  let m = C.coreMats.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: key, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    C.coreMats.set(key, m);
  }
  return m;
}
// вращение украшений по абсолютному времени (корректно и для двух глаз в VR)
function spin(obj, sx, sy) {
  const r0 = obj.rotation.clone();
  obj.onBeforeRender = () => {
    const t = performance.now() * 0.001;
    obj.rotation.set(r0.x + t * sx, r0.y + t * sy, r0.z);
  };
}

export function createTargetVisual(type, color = 0x3ec5ff) {
  cache();
  if (type === 'gold') {
    const geo = new THREE.OctahedronGeometry(1, 0).scale(0.72, 1, 0.72);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffd23f, metalness: 1, roughness: 0.2, emissive: 0xffa000, emissiveIntensity: 0.5, flatShading: true,
    });
    const root = new THREE.Mesh(geo, mat);
    const rings = new THREE.Mesh(C.goldRingsGeo, C.goldRingMat);
    rings.rotation.x = 0.5;
    spin(rings, 0, 1.6);
    root.add(rings);
    const spark = new THREE.Sprite(C.sparkMat);
    spark.scale.setScalar(1.8);
    spark.onBeforeRender = () => { // мерцание
      const t = performance.now() * 0.001;
      spark.scale.setScalar(1.5 + 0.5 * Math.sin(t * 6));
    };
    root.add(spark);
    return root;
  }
  if (type === 'bomb') {
    const geo = new THREE.SphereGeometry(1, 20, 14);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x330a0a, metalness: 0.6, roughness: 0.35, emissive: 0xff0022, emissiveIntensity: 0.6,
    });
    const root = new THREE.Mesh(geo, mat);
    root.add(new THREE.Mesh(C.spikeGeo, C.spikeMat));
    root.add(new THREE.Mesh(C.tipGeo, C.tipMat));
    root.add(new THREE.Mesh(C.bandGeo, C.bandMat));
    return root;
  }
  // обычная: огранённый кристалл
  const geo = new THREE.IcosahedronGeometry(1, 0).scale(0.85, 1, 0.85);
  const mat = new THREE.MeshPhysicalMaterial({
    color, emissive: color, emissiveIntensity: 0.4, metalness: 0.1, roughness: 0.15,
    clearcoat: 1, clearcoatRoughness: 0.1, iridescence: 0.6, iridescenceIOR: 1.6,
    flatShading: true, transparent: true, opacity: 0.88, depthWrite: false,
  });
  const root = new THREE.Mesh(geo, mat);
  const core = new THREE.Mesh(C.coreGeo, coreMat(color));
  core.renderOrder = 2; // поверх полупрозрачной оболочки
  root.add(core);
  const ring = new THREE.Mesh(C.ringGeo, C.ringMat);
  ring.rotation.x = Math.PI / 2 + 0.4;
  spin(ring, 0, 1.2);
  root.add(ring);
  return root;
}
