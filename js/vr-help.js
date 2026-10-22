// js/vr-help.js — справка в шлеме: все навыки, руны и оружие (клинки) с жестами.
// Открывается удержанием Y (левая рука), короткое Y — следующая страница, удержание — закрыть.
// Окно встаёт перед игроком чуть ниже глаз и не следует за головой (не мешает), догоняет, только если ушёл дальше 3 м.
import * as THREE from 'three';

const W = 1024, H = 720;
const FONT = 'system-ui, "Segoe UI", sans-serif';

export const HELP_PAGES = [
  {
    title: 'Навыки', color: '#9fe7ff',
    rows: [
      ['Шаг', 'Левый стик вперёд — дуга; отпусти — перенос в кольцо', 'откат 0,35 с'],
      ['Сфера', 'Свободная рука ладонью вверх + хват, растёт; брось рукой', '1 с'],
      ['Барьер', 'Свободная рука ладонью вперёд + хват — щит отражает шары', '1 с'],
      ['Волна ки', 'Обе руки у груди + оба хвата 1,5 с — затем толчок вперёд', '6 с'],
      ['Замедление', 'Коснись наруча на левом запястье пальцем правой руки', '15 с'],
      ['Шаг по небу', 'A в прыжке — ещё прыжок, до 3 раз', '—'],
      ['Ульта', 'Шкала на наруче полна — оба хвата + курок руки с оружием', 'за убийства'],
    ],
    foot: 'Без маны — только откаты · держи X — скрыть/показать окно уровня',
  },
  {
    title: 'Руны', color: '#ffd36e',
    rows: [
      ['○  Круг', 'Щит-пузырь вокруг тебя на 4 с', 'откат 1,2 с'],
      ['△  Треугольник', 'Огненный шар туда, куда смотришь', '1,2 с'],
      ['ϟ  Зигзаг', 'Молния по 3 ближайшим врагам', '1,2 с'],
      ['@  Спираль', 'Мана +40 (на арене)', '15 с'],
    ],
    foot: 'Зажми курок свободной руки и нарисуй фигуру в воздухе, отпусти курок',
  },
  {
    title: 'Оружие и клинки', color: '#c9a2ff',
    rows: [
      ['Жезл «Искра»', 'Курок — выстрел; держи курок — заряд, отпусти', 'бедро справа'],
      ['Посох стихий', 'Курок — заклинание; B — огонь / лёд / молния', 'правое плечо'],
      ['Клинок души', 'Взмах рукой рубит; сильный взмах — волна-полумесяц', 'за спиной'],
      ['Лук рун', 'Свободной рукой хват/курок у тетивы — натяни и отпусти', 'левое плечо'],
      ['Перчатка ки', 'Курок — заряд ки из ладони', 'бедро слева'],
    ],
    foot: 'Возьми оружие хватом у кобуры (место справа) · B / Y — следующее / предыдущее',
  },
];

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export function createVrHelp() {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.86, 0.86 * H / W),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.94, depthWrite: false, toneMapped: false, fog: false }),
  );
  mesh.name = 'vr-help';
  mesh.visible = false;
  mesh.renderOrder = 20;
  let page = 0, fade = 0, want = false;
  const anchor = new THREE.Vector3(), tmp = new THREE.Vector3(), fwd = new THREE.Vector3();

  function draw() {
    const P = HELP_PAGES[page];
    g.clearRect(0, 0, W, H);
    roundRect(g, 6, 6, W - 12, H - 12, 34);
    g.fillStyle = 'rgba(10, 12, 28, 0.86)';
    g.fill();
    g.lineWidth = 4; g.strokeStyle = P.color + 'aa'; g.stroke();
    // вкладки
    const tw = (W - 80) / HELP_PAGES.length;
    HELP_PAGES.forEach((p, i) => {
      const x = 40 + i * tw;
      roundRect(g, x + 6, 26, tw - 12, 58, 18);
      g.fillStyle = i === page ? p.color + '33' : 'rgba(255,255,255,0.05)';
      g.fill();
      if (i === page) { g.lineWidth = 3; g.strokeStyle = p.color; g.stroke(); }
      g.fillStyle = i === page ? p.color : 'rgba(220,230,255,0.55)';
      g.font = `700 30px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(p.title, x + tw / 2, 56);
    });
    // строки
    g.textAlign = 'left';
    const top = 112, rowH = Math.min(104, (H - top - 100) / Math.max(5, P.rows.length));
    P.rows.forEach(([name, how, note], i) => {
      const y = top + i * rowH;
      if (i % 2 === 0) { g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(36, y, W - 72, rowH); }
      g.fillStyle = P.color; g.font = `700 29px ${FONT}`; g.textBaseline = 'middle';
      g.fillText(name, 54, y + rowH * 0.36);
      g.fillStyle = 'rgba(160,175,205,0.9)'; g.font = `500 22px ${FONT}`; g.textAlign = 'right';
      g.fillText(note, W - 54, y + rowH * 0.36);
      g.textAlign = 'left'; g.fillStyle = '#e8eeff'; g.font = `400 24px ${FONT}`;
      g.fillText(how, 54, y + rowH * 0.74, W - 108);
    });
    // подвал
    g.fillStyle = 'rgba(200,215,240,0.78)'; g.font = `500 22px ${FONT}`; g.textAlign = 'center';
    g.fillText(P.foot, W / 2, H - 70, W - 80);
    g.fillStyle = 'rgba(160,175,205,0.7)'; g.font = `400 20px ${FONT}`;
    g.fillText('Y коротко — следующая страница  ·  держи Y — закрыть', W / 2, H - 36);
    tex.needsUpdate = true;
  }

  function place(head, camera) {
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    anchor.copy(head).addScaledVector(fwd, 1.0);
    anchor.y = head.y - 0.22;
    mesh.position.copy(anchor);
    mesh.lookAt(tmp.set(head.x, anchor.y + 0.1, head.z));
  }

  return {
    mesh,
    get open() { return want; },
    get page() { return page; },
    show(head, camera) { want = true; page = 0; draw(); place(head, camera); mesh.visible = true; },
    hide() { want = false; },
    toggle(head, camera) { if (want) this.hide(); else this.show(head, camera); },
    next() { page = (page + 1) % HELP_PAGES.length; draw(); },
    /** Кадр: плавное появление/исчезание; догоняет, если игрок ушёл дальше 3 м. */
    update(dt, head, camera) {
      fade += ((want ? 1 : 0) - fade) * Math.min(1, dt * 10);
      mesh.material.opacity = 0.94 * fade;
      mesh.scale.setScalar(0.92 + 0.08 * fade);
      if (!want && fade < 0.02) { mesh.visible = false; return; }
      if (want && tmp.set(head.x - anchor.x, 0, head.z - anchor.z).length() > 3) place(head, camera);
    },
  };
}
