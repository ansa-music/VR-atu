import * as THREE from 'three';

// Окружение VR-тира: пол, сетка, неоновые колонны, звёзды, кольца в небе
export function buildEnvironment(scene) {
  scene.background = new THREE.Color(0x070b1a);
  scene.fog = new THREE.Fog(0x070b1a, 12, 45);

  // Свет
  scene.add(new THREE.HemisphereLight(0x8899ff, 0x221133, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(3, 8, 2);
  scene.add(sun);

  // Пол и сетка
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({ color: 0x0d1330, roughness: 0.9 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const grid = new THREE.GridHelper(80, 80, 0x3a5bff, 0x1b2550);
  grid.position.y = 0.002;
  scene.add(grid);

  // Неоновые колонны по кругу (общая геометрия, у каждой свой материал)
  const PILLARS = 16;
  const pillarGeo = new THREE.BoxGeometry(0.3, 6, 0.3);
  const pillarMats = [];
  for (let i = 0; i < PILLARS; i++) {
    const mat = new THREE.MeshBasicMaterial();
    mat.color.setHSL(i / PILLARS, 0.8, 0.55);
    const a = (i / PILLARS) * Math.PI * 2;
    const pillar = new THREE.Mesh(pillarGeo, mat);
    pillar.position.set(Math.cos(a) * 14, 3, Math.sin(a) * 14);
    scene.add(pillar);
    pillarMats.push(mat);
  }

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

  // Лёгкая анимация: пульс колонн и медленный поворот колец (без аллокаций)
  function update(dt, time) {
    for (let i = 0; i < PILLARS; i++) {
      pillarMats[i].color.setHSL(i / PILLARS, 0.8, 0.55 + 0.12 * Math.sin(time * 2 + i));
    }
    for (let i = 0; i < rings.length; i++) {
      rings[i].mesh.rotation.y += rings[i].speed * dt;
    }
  }

  return { update };
}
