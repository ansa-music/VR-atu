// Единственная canvas-текстура для HUD и торговли в шлеме; DOM в XR не нужен.
import * as THREE from 'three';
const { xpToNext, questText } = await import('./progression.js' + new URL(import.meta.url).search);
const { SHOP, sellPrice, itemLabel } = await import('./inventory.js' + new URL(import.meta.url).search);

export function createProgressionVr({ bridge, camera, renderer }) {
  const api = bridge.api, canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 640;
  const ctx = canvas.getContext('2d'), texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.72), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
  mesh.name = 'world-progression-hud'; mesh.renderOrder = 1001;
  mesh.position.set(-0.46, -0.34, -1.65); camera.add(mesh);
  const ray = new THREE.Raycaster(), rot = new THREE.Matrix4(), hits = [], buttons = [];
  let shop = false, page = 0, timer = 0;
  function button(label, x, y, w, h, action) {
    ctx.fillStyle = '#235477'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#fff'; ctx.font = '24px sans-serif'; ctx.fillText(label, x + 12, y + h * 0.64, w - 24);
    buttons.push({ x, y, w, h, action });
  }
  function draw() {
    buttons.length = 0; ctx.clearRect(0, 0, 1024, 640); ctx.fillStyle = '#091629ef'; ctx.fillRect(0, 0, 1024, 640);
    const p = api.prog, st = bridge.state, q = questText(api.quests);
    ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 38px sans-serif'; ctx.fillText(`Уровень ${p.level}     ◈ ${api.inv.gold}`, 28, 48);
    ctx.font = '26px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(`Здоровье ${Math.ceil(st.hp)} / ${st.hpMax}`, 28, 88);
    ctx.fillStyle = '#26364b'; ctx.fillRect(28, 102, 950, 18); ctx.fillStyle = '#4cea87'; ctx.fillRect(28, 102, 950 * Math.max(0, st.hp / st.hpMax), 18);
    ctx.fillStyle = '#ddd'; ctx.fillText(`Опыт ${p.xp} / ${p.level === 30 ? 'максимум' : xpToNext(p.level)}`, 28, 155);
    ctx.fillStyle = '#26364b'; ctx.fillRect(28, 168, 950, 12); ctx.fillStyle = '#a985ff'; ctx.fillRect(28, 168, 950 * (p.level === 30 ? 1 : p.xp / xpToNext(p.level)), 12);
    ctx.fillStyle = '#ffd23f'; ctx.fillText(q.title, 28, 220, 950); ctx.fillStyle = '#fff'; ctx.fillText(q.step, 28, 258, 950);
    if (shop) {
      ctx.fillStyle = '#ffd23f'; ctx.fillText('Торговец Мот · наведи луч и нажми курок', 28, 305);
      const stock = SHOP.stock.slice(page * 3, page * 3 + 3);
      stock.forEach(([id, price], i) => button(`${itemLabel(id)} · ${price} з.`, 28, 326 + i * 55, 650, 48, () => api.buy(id)));
      const gear = api.inv.gear.find(g => !Object.values(api.inv.equipped).includes(g.uid));
      if (gear) button(`Продать: ${gear.name} · ${sellPrice(gear)} з.`, 28, 494, 950, 48, () => api.sell(gear.uid));
      button('Далее', 700, 326, 278, 48, () => { page = (page + 1) % Math.ceil(SHOP.stock.length / 3); });
      button('Закрыть', 700, 384, 278, 48, () => { shop = false; });
    } else if (api.inHub()) button('Торговец · открыть лучом', 28, 326, 950, 66, () => { shop = true; });
    else if (api.resourceHere()) button('Собрать: ' + itemLabel(api.resourceHere()), 28, 326, 950, 66, () => api.harvest());
    else { ctx.fillStyle = '#abc'; ctx.fillText('Торговец ждёт на базаре Рассветного Брода', 28, 355, 950); }
    texture.needsUpdate = true;
  }
  api.toggleShop = () => { if (api.inHub()) { shop = !shop; draw(); } };
  draw(); mesh.visible = false;
  return {
    mesh, targets: [mesh],
    update(dt) { mesh.visible = renderer.xr.isPresenting; if (shop && !api.inHub()) shop = false; if ((timer -= dt) <= 0) { timer = 0.1; draw(); } },
    select(controller) {
      if (!mesh.visible) return false;
      camera.updateWorldMatrix(true, true); controller.updateWorldMatrix(true, false);
      rot.extractRotation(controller.matrixWorld); ray.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      ray.ray.direction.set(0, 0, -1).transformDirection(rot); hits.length = 0; ray.intersectObject(mesh, false, hits);
      const uv = hits[0]?.uv; if (!uv) return false;
      const x = uv.x * 1024, y = (1 - uv.y) * 640;
      const b = buttons.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      b?.action(); draw(); return true;
    },
    get debug() { return { visible: mesh.visible, shop, page, buttons: buttons.length, level: api.prog.level, hp: bridge.state.hp, texture: texture.uuid }; },
    dispose() { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); texture.dispose(); delete api.toggleShop; },
  };
}
