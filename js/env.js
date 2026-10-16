import * as THREE from 'three';

const LANE_ANGLE = Math.PI * 1.5 + Math.PI / 16; // направление дальнего рубежа (281.25°), см. range.js

// Окружение VR-тира: пол, сетка, неоновые колонны, звёзды, кольца в небе
export function buildEnvironment(scene) {
  scene.background = new THREE.Color(0x070b1a);
  scene.fog = new THREE.Fog(0x070b1a, 12, 45);

  // Свет
  scene.add(new THREE.HemisphereLight(0x8899ff, 0x221133, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(3, 8, 2);
  scene.add(sun);

  // Глянцевый тёмный пол (блики от карты окружения) и светящаяся сетка
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({ color: 0x060914, roughness: 0.25, metalness: 0.6 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const grid = new THREE.GridHelper(80, 80, 0xff3aa8, 0x3ec5ff);
  grid.material.transparent = true;
  grid.material.opacity = 0.45;
  grid.material.depthWrite = false;
  grid.material.toneMapped = false;
  grid.position.y = 0.002;
  scene.add(grid);

  // радиальная текстура свечения (для пятен света на полу и горизонта)
  const glowTex = (() => {
    const s = 64, cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(cv);
  })();

  // Неоновые колонны по кругу (общая геометрия, у каждой свой материал)
  const PILLARS = 16;
  const pillarGeo = new THREE.BoxGeometry(0.3, 6, 0.3);
  const pillarMats = [];
  const colliders = []; // колонны останавливают пули
  // металлические основания/капители и светящиеся пояса — инстансами
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x1a1f3a, metalness: 0.9, roughness: 0.3 });
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.35, 0.7), metalMat, PILLARS * 2);
  const bands = new THREE.InstancedMesh(new THREE.BoxGeometry(0.78, 0.06, 0.78),
    new THREE.MeshBasicMaterial({ toneMapped: false }), PILLARS * 2);
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), PILLARS);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  for (let i = 0; i < PILLARS; i++) {
    const mat = new THREE.MeshBasicMaterial();
    mat.color.setHSL(i / PILLARS, 0.8, 0.55);
    const a = (i / PILLARS) * Math.PI * 2;
    const x = Math.cos(a) * 14, z = Math.sin(a) * 14;
    const pillar = new THREE.Mesh(pillarGeo, mat);
    pillar.position.set(x, 3, z);
    scene.add(pillar);
    pillarMats.push(mat);
    colliders.push(pillar);
    col.setHSL(i / PILLARS, 0.9, 0.6);
    blocks.setMatrixAt(i * 2, m4.makeTranslation(x, 0.175, z));
    blocks.setMatrixAt(i * 2 + 1, m4.makeTranslation(x, 6.1, z));
    bands.setMatrixAt(i * 2, m4.makeTranslation(x, 0.38, z));
    bands.setMatrixAt(i * 2 + 1, m4.makeTranslation(x, 5.9, z));
    bands.setColorAt(i * 2, col);
    bands.setColorAt(i * 2 + 1, col);
    pools.setMatrixAt(i, m4.makeTranslation(x, 0.005, z));
    pools.setColorAt(i, col);
  }
  scene.add(blocks, bands, pools);

  // ---- Силуэты города на горизонте (радиус 48–56, без тумана) ----
  const winTex = (() => { // окна: тёмный фон, редкие огни
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 64;
    const g = cv.getContext('2d');
    g.fillStyle = '#0a0a1e';
    g.fillRect(0, 0, 32, 64);
    const cols = ['#3ec5ff', '#ff3aa8', '#ffd23f', '#7c5cff'];
    for (let y = 2; y < 64; y += 4) for (let x = 2; x < 32; x += 4) {
      if (Math.random() < 0.22) { g.fillStyle = cols[(Math.random() * 4) | 0]; g.fillRect(x, y, 2, 2); }
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    return t;
  })();
  const BLD = 70;
  const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ map: winTex, fog: false, toneMapped: false }), BLD);
  const roofs = new THREE.InstancedMesh(new THREE.BoxGeometry(1.02, 0.12, 1.02),
    new THREE.MeshBasicMaterial({ fog: false, toneMapped: false }), BLD);
  const q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3(), yAx = new THREE.Vector3(0, 1, 0);
  let nb = 0;
  for (let i = 0; i < BLD; i++) {
    const a = (i / BLD) * Math.PI * 2 + Math.random() * 0.05;
    let d = Math.abs(a - Math.PI * 1.5) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d < 0.22) continue; // не закрываем солнце
    if (Math.abs(a - LANE_ANGLE) < 0.16) continue; // и дальний рубеж
    const r = 48 + Math.random() * 8, w = 2 + Math.random() * 3, h = 3 + Math.random() * 10;
    q.setFromAxisAngle(yAx, -a);
    pv.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    city.setMatrixAt(nb, m4.compose(pv, q, sc.set(w, h, w)));
    pv.y = h;
    roofs.setMatrixAt(nb, m4.compose(pv, q, sc.set(w, 1, w)));
    roofs.setColorAt(nb, col.set(i % 3 === 0 ? 0xff3aa8 : 0x3ec5ff));
    nb++;
  }
  city.count = roofs.count = nb;
  city.frustumCulled = roofs.frustumCulled = false;
  scene.add(city, roofs);

  // ---- Светящаяся линия горизонта (цилиндр с градиентом) ----
  const hzTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = 4; cv.height = 64;
    const g = cv.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, 'rgba(255,58,168,0)');
    grd.addColorStop(0.85, 'rgba(255,58,168,0.5)');
    grd.addColorStop(1, 'rgba(255,210,63,0.9)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 64);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const horizon = new THREE.Mesh(new THREE.CylinderGeometry(58, 58, 10, 96, 1, true),
    new THREE.MeshBasicMaterial({ map: hzTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.BackSide, toneMapped: false }));
  horizon.position.y = 5;
  horizon.frustumCulled = false;
  scene.add(horizon);

  // Звёзды: верхняя полусфера радиуса 80, y >= 5
  const STARS = 1500, R = 80;
  const pos = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++) {
    const y = 5 / R + Math.random() * (1 - 5 / R); // равномерно по площади сферы
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(a) * rr * R;
    pos[i * 3 + 1] = y * R;
    pos[i * 3 + 2] = Math.sin(a) * rr * R;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, fog: false })));

  // Большие каркасные кольца высоко в небе (далеко от зоны мишеней)
  const ringCfg = [
    { r: 22, y: 16, color: 0x3a5bff, tilt: 0.30, speed: 0.05 },
    { r: 26, y: 20, color: 0xff3aa8, tilt: -0.25, speed: -0.035 },
    { r: 30, y: 24, color: 0x3affd0, tilt: 0.20, speed: 0.025 },
  ];
  const rings = [];
  for (const c of ringCfg) {
    const mat = new THREE.MeshBasicMaterial({
      color: c.color, wireframe: true, transparent: true, opacity: 0.25, fog: false,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(c.r, 0.5, 8, 72), mat);
    ring.rotation.order = 'YXZ'; // Y — вращение вокруг вертикали, X — наклон
    ring.rotation.x = Math.PI / 2 + c.tilt;
    ring.position.y = c.y;
    scene.add(ring);
    rings.push({ mesh: ring, speed: c.speed });
  }

  // ---- Градиентный купол неба (радиус 150 < far 200, без тумана) ----
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    uniforms: {
      uZenith: { value: new THREE.Color(0x02040d) }, // зенит
      uMid: { value: new THREE.Color(0x2a1060) },    // фиолетовый у горизонта
      uGlow: { value: new THREE.Color(0xff3aa8) },   // розовая полоса на горизонте
      uBelow: { value: new THREE.Color(0x070b1a) },  // ниже горизонта
    },
    vertexShader: /* glsl */`
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uZenith;
      uniform vec3 uMid;
      uniform vec3 uGlow;
      uniform vec3 uBelow;
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y;
        vec3 col;
        if (h >= 0.0) {
          vec3 base = mix(uMid, uZenith, pow(clamp(h, 0.0, 1.0), 0.6));
          float glow = pow(1.0 - clamp(h / 0.16, 0.0, 1.0), 2.0); // тонкая полоса у горизонта
          col = mix(base, uGlow, glow);
        } else {
          col = mix(uGlow, uBelow, smoothstep(0.0, 0.1, -h));
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), skyMat);
  skyDome.renderOrder = -100; // рисуется первым, глубину не пишет
  skyDome.frustumCulled = false;
  scene.add(skyDome);

  // ---- Синтвейв-солнце далеко впереди (по -Z) ----
  const sunMat = new THREE.ShaderMaterial({
    fog: false,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0xffd23f) },    // жёлтый сверху
      uBottom: { value: new THREE.Color(0xff3aa8) }, // маджента снизу
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop;
      uniform vec3 uBottom;
      varying vec2 vUv;
      void main() {
        // в нижней половине вырезаем горизонтальные полосы, к низу они шире
        if (vUv.y < 0.5) {
          float s = (0.5 - vUv.y) / 0.5;
          if (fract(vUv.y * 14.0) < s * 0.65) discard;
        }
        vec3 col = mix(uBottom, uTop, smoothstep(0.1, 0.9, vUv.y));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(22, 64), sunMat);
  sunDisc.position.set(0, 14, -130);
  sunDisc.lookAt(0, 14, 0); // нормаль (+Z) смотрит в сторону игрока
  scene.add(sunDisc);

  // ---- Каркасные low-poly горы кольцом (радиус 60–95), разрыв за солнцем ----
  const mtnMats = [
    new THREE.MeshBasicMaterial({ color: 0x3affd0, wireframe: true, transparent: true, opacity: 0.5, fog: false }),
    new THREE.MeshBasicMaterial({ color: 0xff3aa8, wireframe: true, transparent: true, opacity: 0.5, fog: false }),
  ];
  // детерминированный «шум» по координатам вершины (швы конуса совпадают)
  const hash = (x, y, z, seed) => {
    const v = Math.sin(Math.round(x * 100) * 12.9898 + Math.round(y * 100) * 37.719 + Math.round(z * 100) * 78.233 + seed) * 43758.5453;
    return v - Math.floor(v);
  };
  const MTN_SLOTS = 14;
  const SUN_ANGLE = Math.PI * 1.5; // направление на -Z
  for (let i = 0; i < MTN_SLOTS; i++) {
    const a = (i / MTN_SLOTS) * Math.PI * 2 + 0.2;
    let d = Math.abs(a - SUN_ANGLE) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d < 0.2) continue; // не закрываем солнце
    if (Math.abs(a - LANE_ANGLE) < 0.36) continue; // и гонги дальнего рубежа
    const rad = 60 + Math.random() * 35;
    const height = 10 + Math.random() * 12;
    const baseR = 10 + Math.random() * 8;
    const geo = new THREE.ConeGeometry(baseR, height, 5 + (i % 2), 3, true);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const onBase = y < -height / 2 + 0.01;
      const onApex = y > height / 2 - 0.01;
      const n1 = hash(x, y, z, i * 3.1), n2 = hash(x, y, z, i * 7.7 + 1.3);
      if (!onBase) p.setY(k, y + (n1 - 0.5) * height * 0.22); // рваные высоты
      if (!onBase) { // небольшой разброс по горизонтали для асимметрии
        p.setX(k, x + (n2 - 0.5) * baseR * 0.3);
        p.setZ(k, z + (n1 - 0.5) * baseR * 0.3);
      }
      if (onApex) p.setY(k, p.getY(k) + height * 0.08 * n2);
    }
    p.needsUpdate = true;
    const mtn = new THREE.Mesh(geo, mtnMats[i % 2]);
    mtn.position.set(Math.cos(a) * rad, height / 2, Math.sin(a) * rad);
    mtn.rotation.y = Math.random() * Math.PI * 2;
    mtn.frustumCulled = false;
    scene.add(mtn);
  }

  // ---- Светящаяся граница арены на полу (радиус 11) ----
  const arenaMat = new THREE.MeshBasicMaterial({
    color: 0x3ec5ff, transparent: true, opacity: 0.8, depthWrite: false,
  });
  const arenaRing = new THREE.Mesh(new THREE.RingGeometry(10.9, 11.05, 128), arenaMat);
  arenaRing.rotation.x = -Math.PI / 2;
  arenaRing.position.y = 0.01;
  scene.add(arenaRing);

  // ---- Пылинки в воздухе: ~300 точек в радиусе 12, y 0.2–5 ----
  const DUST = 300, DUST_MIN_Y = 0.2, DUST_MAX_Y = 5;
  const dustPos = new Float32Array(DUST * 3);
  const dustSpeed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    const r = 12 * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    dustPos[i * 3] = Math.cos(a) * r;
    dustPos[i * 3 + 1] = DUST_MIN_Y + Math.random() * (DUST_MAX_Y - DUST_MIN_Y);
    dustPos[i * 3 + 2] = Math.sin(a) * r;
    dustSpeed[i] = 0.05 + Math.random() * 0.12; // м/с вверх
  }
  const dustGeo = new THREE.BufferGeometry();
  const dustAttr = new THREE.BufferAttribute(dustPos, 3);
  dustAttr.setUsage(THREE.DynamicDrawUsage);
  dustGeo.setAttribute('position', dustAttr);
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0x9fe7ff, size: 0.04, transparent: true, opacity: 0.6, depthWrite: false,
  }));
  dust.frustumCulled = false;
  scene.add(dust);

  // Лёгкая анимация: пульс колонн, поворот колец, пульс границы, дрейф пыли (без аллокаций)
  function update(dt, time) {
    for (let i = 0; i < PILLARS; i++) {
      pillarMats[i].color.setHSL(i / PILLARS, 0.8, 0.55 + 0.12 * Math.sin(time * 2 + i));
    }
    for (let i = 0; i < rings.length; i++) {
      rings[i].mesh.rotation.y += rings[i].speed * dt;
    }
    arenaMat.opacity = 0.65 + 0.25 * Math.sin(time * 2.0);
    for (let i = 0; i < DUST; i++) {
      const j = i * 3;
      dustPos[j] += Math.sin(time * 0.5 + i) * 0.02 * dt; // лёгкое покачивание
      let y = dustPos[j + 1] + dustSpeed[i] * dt;
      if (y > DUST_MAX_Y) y = DUST_MIN_Y; // возврат вниз
      dustPos[j + 1] = y;
    }
    dustAttr.needsUpdate = true;
  }

  return { update, colliders };
}
