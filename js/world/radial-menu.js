// js/world/radial-menu.js — радиальное меню навыков/заклинаний для ПК, телефона и VR.
// Логика чистая (тестируется в Node). Рендер: DOM (ПК/телефон) и Three (VR-запястье), THREE передаётся снаружи.
import { SKILL_UI, ELEMENT_UI, FORM_UI, ACCESSIBILITY } from '../../shared/defs/input_v2.js';

export const RADIAL = Object.freeze({ maxSectors: 8, deadzone: 0.25, vrDeadzoneM: 0.03, vrRadiusM: 0.12, pcRadiusPx: 140, phoneRadiusPx: 120 });

// Корень: «Навыки» + 7 стихий + «Слияния» (≤ 8 секторов: навыки и слияния вместе, если не влезает).
export function buildRadialTree({ skills = {}, spells = {}, fusions = {}, unlocked = null } = {}) {
  const ok = (id) => !unlocked || unlocked.has(id);
  const skillItems = Object.values(skills).filter((s) => s.type !== 'passive' && ok(s.id))
    .map((s) => ({ kind: 'skill', id: s.id, label: s.name, icon: SKILL_UI[s.id]?.icon ?? '•', line: SKILL_UI[s.id]?.line ?? '' }));
  const byEl = {};
  for (const sp of Object.values(spells)) if (ok(sp.id)) (byEl[sp.element] ??= []).push({ kind: 'spell', id: sp.id, label: sp.name, icon: ELEMENT_UI[sp.element]?.icon ?? '✦', line: FORM_UI[sp.form] ?? sp.form });
  const fu = Object.values(fusions).filter((f) => ok(f.id)).map((f) => ({ kind: 'spell', id: f.id, label: f.name, icon: ELEMENT_UI.fusion.icon, line: `${f.elements.join(' + ')} · ${FORM_UI[f.form] ?? f.form}` }));
  const root = [];
  const pageOf = (id, label, icon, items) => ({ kind: 'page', id, label, icon, children: paginate(items) });
  if (skillItems.length) root.push(pageOf('pg_skills', 'Навыки', '⚔️', skillItems));
  for (const [el, items] of Object.entries(byEl)) root.push(pageOf(`pg_${el}`, el, ELEMENT_UI[el]?.icon ?? '✦', items));
  if (fu.length) root.push(pageOf('pg_fusion', 'Слияния', ELEMENT_UI.fusion.icon, fu));
  return { kind: 'page', id: 'root', label: 'Меню', children: paginate(root) };
}
// Больше 8 — последний сектор «Ещё…» (вложенная страница).
export function paginate(items, max = RADIAL.maxSectors) {
  if (items.length <= max) return items;
  return [...items.slice(0, max - 1), { kind: 'page', id: `more_${items[max - 1].id}`, label: 'Ещё…', icon: '⋯', children: paginate(items.slice(max - 1), max) }];
}
export function allLeaves(node, acc = []) { if (node.kind === 'page') node.children.forEach((c) => allLeaves(c, acc)); else acc.push(node); return acc; }

// Сектор по вектору (x вправо, y вверх), 0 = верх, по часовой. null — в мёртвой зоне.
export function pickSector(x, y, n, deadzone = RADIAL.deadzone) {
  if (n <= 0 || Math.hypot(x, y) < deadzone) return null;
  const a = (Math.atan2(x, y) + 2 * Math.PI) % (2 * Math.PI);
  return Math.floor((a + Math.PI / n) / (2 * Math.PI / n)) % n;
}
export const sectorAngle = (i, n) => (i * 2 * Math.PI) / n; // от верха по часовой

// Автомат: open → hover → confirm (отпуск/курок/тап) | cancel (отпуск в центре / Esc / B).
export function createRadial(tree, { onPick = () => {}, onSlowMo = () => {} } = {}) {
  const st = { open: false, stack: [tree], hover: null, assignSlot: null };
  const node = () => st.stack[st.stack.length - 1];
  return {
    state: st,
    get items() { return node().children; },
    open(assignSlot = null) { st.open = true; st.stack = [tree]; st.hover = null; st.assignSlot = assignSlot; onSlowMo(ACCESSIBILITY.radialSlowMo); },
    move(x, y) { if (st.open) st.hover = pickSector(x, y, node().children.length); return st.hover; },
    // confirm: страница → вглубь; лист → выбор (каст или назначение в слот). Возврат: {picked}|{page}|{cancel}
    confirm() {
      if (!st.open) return { cancel: true };
      if (st.hover == null) return this.back();
      const it = node().children[st.hover];
      if (it.kind === 'page') { st.stack.push(it); st.hover = null; return { page: it.id }; }
      st.open = false; onSlowMo(1); onPick(it, st.assignSlot);
      return { picked: it.id, assignSlot: st.assignSlot };
    },
    back() { if (st.stack.length > 1) { st.stack.pop(); st.hover = null; return { page: node().id }; } st.open = false; onSlowMo(1); return { cancel: true }; },
    close() { st.open = false; onSlowMo(1); },
  };
}
// Путь до листа (для тестов достижимости и для Arduino «круг стиком» — перебор по кругу).
export function pathTo(tree, id, path = []) {
  for (let i = 0; i < tree.children.length; i++) {
    const c = tree.children[i];
    if (c.id === id && c.kind !== 'page') return [...path, i];
    if (c.kind === 'page') { const p = pathTo(c, id, [...path, i]); if (p) return p; }
  }
  return null;
}

// ── DOM-рендер (ПК, телефон). Удерж. клавиши/кнопки → open; мышь/палец → move; отпуск → confirm.
export function renderDOM(radial, root = document.body, { radiusPx = RADIAL.pcRadiusPx } = {}) {
  let el = root.querySelector('#atu-radial');
  if (!el) { el = document.createElement('div'); el.id = 'atu-radial'; el.style.cssText = 'position:fixed;left:50%;top:50%;width:0;height:0;z-index:50;pointer-events:none;font:15px Philosopher,system-ui,sans-serif;color:#f4f6ff'; root.appendChild(el); }
  if (!radial.state.open) { el.style.display = 'none'; return el; }
  el.style.display = 'block';
  const items = radial.items, n = items.length;
  el.innerHTML = items.map((it, i) => {
    const a = sectorAngle(i, n), x = Math.sin(a) * radiusPx, y = -Math.cos(a) * radiusPx, h = radial.state.hover === i;
    return `<div style="position:absolute;transform:translate(${x - 44}px,${y - 32}px);width:88px;text-align:center;padding:6px;border-radius:12px;background:${h ? 'rgba(124,92,255,.9)' : 'rgba(14,20,48,.78)'};outline:${h ? '2px solid #ffd23f' : 'none'}"><div style="font-size:26px">${it.icon}</div><div>${it.label}</div></div>`;
  }).join('');
  const h = radial.state.hover != null ? items[radial.state.hover] : null;
  el.innerHTML += `<div style="position:absolute;transform:translate(-120px,${radiusPx + 50}px);width:240px;text-align:center">${h?.line ?? 'Отпусти в центре — отмена'}</div>`;
  return el;
}

// ── Three-рендер (VR: диск над левым запястьем; правая рука указывает, курок — выбор).
export function createRadialMesh(THREE, { radiusM = RADIAL.vrRadiusM } = {}) {
  const group = new THREE.Group(); group.name = 'atu-radial';
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radiusM * 1.35, 32), new THREE.MeshBasicMaterial({ color: 0x0e1430, transparent: true, opacity: 0.75, depthWrite: false }));
  group.add(disc);
  const sectors = [];
  for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.CircleGeometry(radiusM * 0.28, 16), new THREE.MeshBasicMaterial({ color: 0x3ec5ff })); m.position.z = 0.002; group.add(m); sectors.push(m); }
  group.visible = false;
  return {
    group,
    update(radial) {
      group.visible = radial.state.open; if (!group.visible) return;
      const n = radial.items.length;
      sectors.forEach((m, i) => { m.visible = i < n; if (i >= n) return; const a = sectorAngle(i, n); m.position.set(Math.sin(a) * radiusM, Math.cos(a) * radiusM, 0.002); m.material.color.setHex(radial.state.hover === i ? 0xffd23f : 0x3ec5ff); m.scale.setScalar(radial.state.hover === i ? 1.25 : 1); });
    },
    // Точка луча правой руки в локальных координатах диска → move(x,y) (нормировано на радиус).
    pointerToRadial(radial, localPoint) { return radial.move(localPoint.x / radiusM, localPoint.y / radiusM); },
  };
}
