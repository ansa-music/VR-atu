// js/world/melee.js — рантайм ближнего боя в стиле SAO для ?mode=openworld. Подключается БЕЗ правки main.js:
//   import('../world/melee.js').then((m) => m.install(api));   // api = window.__OW (см. хук в N-sword-skills.md)
// Режим меча: G (ПК) / кнопка «⚔» (телефон) / левый хват (VR). B — следующий меч. ЛКМ — авто-удар с захватом цели,
// ПКМ: тап — парирование, зажать + рывок мыши ↑→↓← или без движения — мечевой навык; 4–8 — слоты навыков; C — парирование.
// VR: физический взмах (скорость кончика + sweep-тест), навык — удержать позу 0,35 с (клинок загорается) и взмахнуть.
import * as THREE from 'three';
import { MELEE_WEAPONS, SWORD_SKILLS, ELEMENT_GLOW, POSES, PRE_MOTION, PARRY, LIGHT_ATTACK, SLOT_DIRS, SLOT_KEYS, MELEE_CLASSES, meleeClassOf } from '../../shared/defs/melee.js';
import { SwordEngine, sweepHitsSphere, swingMul, classifyPose, classifyDir, masteryFromXp } from './sword-skills.js';

const SAVE_KEY = 'ow-melee-v1';
const DIR_ARROW = { up: '↑', right: '→', down: '↓', left: '←', none: '•' };
const POSE_DIR = Object.fromEntries(Object.entries(POSES).map(([k, v]) => [k, v.pcDir]));
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q1 = new THREE.Quaternion();
const arr = (v) => [v.x, v.y, v.z];

// ---------- модели клинков (процедурно, ≤ 120 треугольников на меч, общий материал на класс) ----------
function makeBlade(w) {
  const g = new THREE.Group(), len = w.bladeLen || 1, col = new THREE.Color(w.color || '#ddd');
  const steel = new THREE.MeshToonMaterial ? new THREE.MeshToonMaterial({ color: col }) : new THREE.MeshLambertMaterial({ color: col });
  const dark = new THREE.MeshLambertMaterial({ color: 0x3a2a1c });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const add = (geo, mat, y, rz = 0, x = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, 0); m.rotation.z = rz; g.add(m); return m; };
  const spear = w.mclass === 'spear';
  add(new THREE.CylinderGeometry(0.018, 0.02, spear ? 1.5 : 0.2, 6), dark, spear ? 0.4 : -0.1);
  if (!spear) add(new THREE.BoxGeometry(0.2, 0.025, 0.04), dark, 0.01);
  const blades = [];
  if (spear) { blades.push(add(new THREE.ConeGeometry(0.045, 0.4, 4), steel, 1.35)); }
  else if (w.mclass === 'curved') { // сабыл: 3 сегмента с нарастающим изгибом
    let y = 0.02, x = 0; for (let i = 0; i < 3; i++) { const h = len / 3, rz = -0.08 * (i + 1); blades.push(add(new THREE.BoxGeometry(0.045 - i * 0.008, h, 0.012), steel, y + h / 2, rz, x)); y += h * Math.cos(rz); x += -Math.sin(rz) * h; }
  } else blades.push(add(new THREE.BoxGeometry(w.mclass === 'two_hand' ? 0.085 : 0.055, len, 0.014), steel, 0.02 + len / 2));
  const glows = blades.map((b) => { const m = new THREE.Mesh(b.geometry, glowMat); m.position.copy(b.position); m.rotation.copy(b.rotation); m.scale.set(1.9, 1.04, 2.5); g.add(m); return m; });
  g.userData = { len: spear ? 1.55 : len, glowMat, glows };
  return g;
}
// ---------- шлейф взмаха: один ribbon на 24 сегмента (Quest: 1 draw call) ----------
class Trail {
  constructor(scene, n = 24) {
    this.n = n; this.pos = new Float32Array(n * 2 * 3); this.alpha = 0;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } geo.setIndex(idx);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; scene.add(this.mesh); this.geo = geo; this.primed = false;
  }
  push(base, tip, on, color) {
    const p = this.pos; if (!this.primed) { for (let i = 0; i < this.n; i++) { p.set(arr(base), i * 6); p.set(arr(tip), i * 6 + 3); } this.primed = true; }
    p.copyWithin(6, 0, (this.n - 1) * 6); p.set(arr(base), 0); p.set(arr(tip), 3);
    this.geo.attributes.position.needsUpdate = true; this.alpha += ((on ? 0.75 : 0) - this.alpha) * 0.25; this.mat.opacity = this.alpha; if (color) this.mat.color.set(color);
  }
}

export function install(ow) {
  if (!ow?.scene || !ow?.player) { console.warn('[melee] нет ow.scene/ow.player'); return null; }
  if (ow.melee) return ow.melee;
  const { scene, camera, player, mobs, renderer } = ow, st = ow.state || {};
  let save = null; try { save = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch {}
  const ids = Object.keys(MELEE_WEAPONS);
  // body.ow-on прячет всех прямых детей body, кроме #ow-root → наш DOM живёт внутри #ow-root
  const uiRoot = document.getElementById('ow-root') || document.body;
  const ui = { el: null };
  const emit = (ev, d) => {
    if (ev === 'skill') { hudFlash(`${d.skill.name}${d.switch ? ' · SWITCH!' : ''}`, ELEMENT_GLOW[d.skill.element]); sfx(d.switch ? 880 : 520, 0.09); }
    else if (ev === 'switch' && d.open) { hudFlash('SWITCH — следующий навык без задержки', '#ffe14d'); }
    else if (ev === 'parry') { hudFlash(d.counter ? 'Контратака!' : d.perfect ? 'Идеальное парирование!' : 'Блок', d.perfect ? '#9ff' : '#ccc'); sfx(d.perfect ? 1200 : 300, 0.06); }
    else if (ev === 'mastery') hudFlash(`Мастерство «${MELEE_CLASSES[d.mclass].name}»: ${d.level}`, '#ffd23f');
    else if (ev === 'skillEnd') persist();
  };
  const engine = new SwordEngine({ weaponId: save?.weapon && MELEE_WEAPONS[save.weapon] ? save.weapon : 'w_steel_longsword', save, emit, playerLevel: st.level || 1 });
  const ctl = { engine, on: false, target: null, version: 1 };
  ow.melee = ctl;
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...engine.serialize(), weapon: engine.weaponId })); } catch {} }

  // ---------- звук (синтез, 1 осциллятор на событие) ----------
  let actx = null, gest = false; addEventListener('pointerdown', () => (gest = true), { once: true }); addEventListener('keydown', () => (gest = true), { once: true });
  function sfx(f, d) { if (!gest) return; try { actx ??= new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain(); o.type = 'triangle'; o.frequency.value = f; g.gain.value = 0.06; g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + d); o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + d); } catch {} }

  // ---------- визуал: клинки (ПК — на камере, VR — на контроллерах) ----------
  const holder = new THREE.Group(); holder.position.set(0.34, -0.36, -0.5); holder.scale.setScalar(0.75); holder.visible = false; camera.add(holder);
  const pivot = new THREE.Group(); holder.add(pivot);
  let blade = null, blade2 = null;
  const grips = { right: null, left: null };
  for (let i = 0; i < 2; i++) { try { const gp = renderer.xr.getControllerGrip(i); gp.addEventListener('connected', (e) => { grips[e.data.handedness === 'left' ? 'left' : 'right'] = gp; if (!gp.parent) player.rig.add(gp); attachBlades(); }); } catch {} }
  function attachBlades() {
    const w = engine.weapon; for (const b of [blade, blade2]) b?.removeFromParent();
    blade = makeBlade(w); blade2 = w.dual ? makeBlade(w) : null;
    const vr = player.xr && grips.right;
    if (vr) { blade.rotation.x = -Math.PI / 2.4; grips.right.add(blade); if (blade2 && grips.left) { blade2.rotation.x = -Math.PI / 2.4; grips.left.add(blade2); } }
    else { blade.rotation.set(-1.05, 0.2, -0.35); pivot.add(blade); if (blade2) { blade2.position.set(-0.55, 0, 0); blade2.rotation.set(-1.05, -0.2, 0.35); pivot.add(blade2); } }
    blade.visible = ctl.on; if (blade2) blade2.visible = ctl.on; ctl.vrAttached = !!vr;
  }
  attachBlades();
  const trail = new Trail(scene);
  const lockRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.85, depthWrite: false }));
  lockRing.visible = false; scene.add(lockRing);
  const setGlow = (color, a) => { for (const b of [blade, blade2]) if (b) { b.userData.glowMat.color.set(color); b.userData.glowMat.opacity = a; } };
  const tipBase = (b, base, tip) => { b.updateWorldMatrix(true, false); base.set(0, 0.05, 0).applyMatrix4(b.matrixWorld); tip.set(0, b.userData.len, 0).applyMatrix4(b.matrixWorld); };

  // ---------- цели ----------
  const alive = () => (mobs?.list || []).filter((m) => m.state !== 'dead' && !m.gone);
  const center = (m, out = v3) => out.set(m.g.position.x, m.g.position.y + (m.hit?.body?.[0] ?? 0.8) * m.g.scale.x, m.g.position.z);
  const radius = (m) => (m.hit?.body?.[1] ?? 0.5) * m.g.scale.x;
  const fwd = () => v1.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  function pickTarget(range = LIGHT_ATTACK.lockRange) {
    const f = fwd().clone(), cos = Math.cos(LIGHT_ATTACK.lockConeDeg * Math.PI / 360); let best = null, bs = 1e9;
    for (const m of alive()) { v2.subVectors(m.g.position, player.pos); v2.y = 0; const d = v2.length(); if (d > range + radius(m)) continue;
      const c = d > 0.01 ? v2.dot(f) / d : 1; if (c < cos && d > 1.2) continue; const s = d * (2 - c); if (s < bs) { bs = s; best = m; } }
    return best;
  }
  const distTo = (m) => Math.hypot(m.g.position.x - player.pos.x, m.g.position.z - player.pos.z) - radius(m);
  function faceTarget(m, k) { if (!m || !k || player.xr) return; const dx = m.g.position.x - player.pos.x, dz = m.g.position.z - player.pos.z; const want = Math.atan2(-dx, -dz); let d = want - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); player.yaw += d * k; }
  // ---------- урон ----------
  const nums = []; function popNum(m, n, color) {
    if (!ui.el) return; let e = nums.find((x) => x.t <= 0); if (!e) { if (nums.length >= 12) return; e = { d: document.createElement('div'), t: 0 }; e.d.style.cssText = 'position:fixed;font:700 18px system-ui;pointer-events:none;z-index:41;text-shadow:0 0 6px #000;transform:translate(-50%,-50%)'; uiRoot.appendChild(e.d); nums.push(e); }
    e.p = center(m, new THREE.Vector3()).setY(m.g.position.y + 1.6 * m.g.scale.x); e.d.textContent = n; e.d.style.color = color; e.t = 0.8;
  }
  function applyHit(m, params, color) {
    if (!m || m.state === 'dead') return null;
    const r = mobs.damage(m, { base: params.base, type: params.type, zoneKind: params.zoneKind, zone: params.zone, attacker: params.attacker, charge: params.charge, stagger: params.stagger ? params.stagger * (m.elite || m.def?.boss ? 0.5 : 1) : 0 });
    if (!r) return null;
    try { if (params.status && typeof mobs.applyStatus === 'function') mobs.applyStatus(m, params.status); } catch {}
    if (st) st.lastCombat = performance.now(); popNum(m, r.dmg, color || '#fff');
    if (r.killed) engine.onKill();
    return r;
  }
  // навыки: удары по расписанию → цели (AoE — все в радиусе; волна — линия; иначе захваченная/ближайшая)
  function resolveSkillHit(p, idx, sk) {
    const h = sk.hits[idx], color = ELEMENT_GLOW[sk.element]; let list = [];
    if (p.aoe) list = alive().filter((m) => distTo(m) <= p.aoe);
    else if (h.wave) { const f = fwd().clone(); list = alive().filter((m) => { v2.subVectors(m.g.position, player.pos); v2.y = 0; const along = v2.dot(f); return along > 0 && along <= p.reach && v2.addScaledVector(f, -along).length() < 1.2 + radius(m); }); }
    else { const t = ctl.target && distTo(ctl.target) <= p.reach + 0.6 ? ctl.target : pickTarget(p.reach + 0.6); if (t && distTo(t) <= p.reach + 0.6) list = [t]; }
    swingAnim(h.dir, color); let hit = 0, staggered = false;
    for (const m of list) { const r = applyHit(m, p, color); if (r) { hit++; staggered ||= !!p.stagger && !r.killed; } }
    return hit ? { hit: true, count: hit, staggered } : { hit: false };
  }
  // ---------- анимация взмаха на ПК/телефоне ----------
  let anim = { t: 0, dir: 'diag', dur: 0.18 };
  const POSE_ROT = { diag: [-1.2, 0.3, 1.0], down: [-1.5, 0, 0], up: [1.1, 0, 0], left: [-0.3, 1.4, 0], right: [-0.3, -1.4, 0], thrust: [-1.45, 0, 0], spin: [-0.3, 3.0, 0] };
  function swingAnim(dir, color) { anim = { t: 0, dir, dur: dir === 'spin' ? 0.3 : 0.16 }; trailColor = color || ELEMENT_GLOW.physical; trailOnUntil = now() + 0.2; }
  let trailColor = '#fff', trailOnUntil = 0;
  const now = () => performance.now() / 1000;

  // ---------- действия ----------
  function lightAttack() {
    const t = now(); if (!ctl.on || player.dead || !engine.lightAttackReady(t)) return false;
    const tg = pickTarget(); ctl.target = tg || ctl.target; engine.markLight(t);
    const dirs = ['diag', 'right', 'left', 'down']; ctl._ls = ((ctl._ls || 0) + 1) % 4; swingAnim(engine.weapon.mclass === 'spear' ? 'thrust' : dirs[ctl._ls]);
    if (!tg) { sfx(180, 0.04); return true; }
    faceTarget(tg, LIGHT_ATTACK.assistYaw[player.touch ? 'phone' : 'pc']);
    let d = distTo(tg); const reach = engine.weapon.range;
    if (d > reach && d <= reach + LIGHT_ATTACK.lungeM) { const k = (d - reach * 0.8) / Math.max(0.01, d + radius(tg)); player.pos.x += (tg.g.position.x - player.pos.x) * k; player.pos.z += (tg.g.position.z - player.pos.z) * k; d = distTo(tg); }
    if (d <= reach + 0.15) { const p = engine.lightAttackParams(1); const r = applyHit(tg, p); if (r) { engine.registerHit(t); sfx(240, 0.05); } }
    return true;
  }
  function castSkill(id, viaDir) {
    const t = now(); if (!ctl.on || player.dead) return { ok: false, reason: 'off' };
    const res = engine.tryActivate(id, t, st.energy ?? Infinity);
    if (!res.ok) { hudFlash({ locked: 'Навык закрыт мастерством', cooldown: 'Перезарядка', energy: 'Мало энергии', delay: 'Задержка после навыка', busy: '' }[res.reason] || '', '#889'); return res; }
    if (st.energy != null) { st.energy = Math.max(0, st.energy - res.energy); st.lastEnergy = ow._clock ?? st.lastEnergy; }
    const sk = SWORD_SKILLS[id]; ctl.target = pickTarget(Math.max(LIGHT_ATTACK.lockRange, (sk.lungeM || 0) + engine.weapon.range)) || ctl.target;
    faceTarget(ctl.target, 0.8); setGlow(ELEMENT_GLOW[sk.element], 0.85);
    ctl.lunge = sk.lungeM && ctl.target ? { m: ctl.target, left: Math.max(0, Math.min(sk.lungeM, distTo(ctl.target) - engine.weapon.range * 0.7)), t: 0.18 } : null;
    ctl.root = { x: player.pos.x, z: player.pos.z };
    return res;
  }
  const castDir = (dir) => { const id = engine.slotSkill(dir); return id ? castSkill(id, dir) : { ok: false }; };
  function parry() { if (!ctl.on) return false; const ok = engine.parry(now()); if (ok) { swingAnim('left', '#9ff'); } return ok; }
  function toggle(on = !ctl.on) {
    ctl.on = on; for (const c of camera.children) if (c !== holder && c.isObject3D && !c.userData.keepInMelee && c !== player.vignette) { if (on) { c.userData._mv = c.visible; c.visible = false; } else if (c.userData._mv !== undefined) c.visible = c.userData._mv; }
    holder.visible = on && !ctl.vrAttached; for (const b of [blade, blade2]) if (b) b.visible = on;
    lockRing.visible = false; player.fire = false; hudFlash(on ? `Меч: ${engine.weapon.name}` : 'Огнестрел', '#fff'); if (phoneUI) phoneUI.style.display = on ? 'block' : 'none'; drawHud(true);
  }
  function setWeapon(id) { if (!MELEE_WEAPONS[id]) return false; engine.setWeapon(id); attachBlades(); persist(); hudFlash(`${engine.weapon.name} · ${MELEE_CLASSES[engine.mclass].name}`, engine.weapon.color); drawHud(true); return true; }
  const nextWeapon = () => setWeapon(ids[(ids.indexOf(engine.weaponId) + 1) % ids.length]);

  // ---------- ввод ПК (capture: в режиме меча ЛКМ не стреляет, ПКМ-рывок не крутит камеру) ----------
  const canvas = renderer.domElement; let lmb = false, rmb = null;
  const inGame = (e) => ctl.on && player.enabled !== false && !player.dead && (document.pointerLockElement === canvas || e.target === canvas);
  addEventListener('mousedown', (e) => { if (!inGame(e)) return;
    if (e.button === 0) { if (document.pointerLockElement !== canvas) return; e.stopImmediatePropagation(); lmb = true; lightAttack(); }
    else if (e.button === 2) { e.preventDefault(); rmb = { t: now(), dx: 0, dy: 0 }; engine.arm('pc', now()); } }, true);
  addEventListener('mouseup', (e) => { if (e.button === 0) lmb = false;
    if (e.button === 2 && rmb) { const held = now() - rmb.t, dir = classifyDir(rmb.dx, -rmb.dy); rmb = null;
      if (dir === 'none' && held < PRE_MOTION.pcHoldThrustS) parry(); else castDir(dir); } }, true);
  addEventListener('mousemove', (e) => { if (rmb && ctl.on) { rmb.dx += e.movementX || 0; rmb.dy += e.movementY || 0; e.stopImmediatePropagation(); } }, true);
  addEventListener('contextmenu', (e) => { if (ctl.on) e.preventDefault(); }, true);
  addEventListener('keydown', (e) => { if (player.enabled === false || e.repeat) return;
    if (e.code === 'KeyG') toggle(); else if (!ctl.on) return;
    else if (e.code === 'KeyB') nextWeapon(); else if (e.code === 'KeyC') parry();
    else { const i = SLOT_KEYS.pc.indexOf(e.code); if (i >= 0) castDir(SLOT_DIRS[i]); } }, true);

  // ---------- телефон: «⚔» режим, «Удар» (удержание = серия), «Навык» (свайп = направление, тап = выпад), «Блок» ----------
  let phoneUI = null, phoneHold = false;
  function buildPhone() {
    const wrap = document.createElement('div'); wrap.id = 'ow-melee-touch'; wrap.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:31;display:none'; uiRoot.appendChild(wrap);
    const B = (txt, css, on) => { const b = document.createElement('div'); b.textContent = txt; b.style.cssText = 'position:fixed;pointer-events:auto;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font:700 15px system-ui;border:2px solid #fff6;user-select:none;touch-action:none;' + css; on(b); wrap.appendChild(b); return b; };
    B('Удар', 'right:24px;bottom:170px;width:88px;height:88px;background:#ff3a6aaa', (b) => { b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); phoneHold = true; lightAttack(); }, { passive: false }); b.addEventListener('touchend', (e) => { e.preventDefault(); phoneHold = false; }, { passive: false }); });
    B('Навык', 'right:130px;bottom:300px;width:76px;height:76px;background:#4f5bd5aa', (b) => { let s = null;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); const t = e.changedTouches[0]; s = { x: t.clientX, y: t.clientY }; engine.arm('phone', now()); }, { passive: false });
      b.addEventListener('touchend', (e) => { e.preventDefault(); if (!s) return; const t = e.changedTouches[0]; castDir(classifyDir(t.clientX - s.x, -(t.clientY - s.y), PRE_MOTION.phoneSwipePx)); s = null; }, { passive: false }); });
    B('Блок', 'right:220px;bottom:200px;width:64px;height:64px;background:#2a8a9aaa', (b) => b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); parry(); }, { passive: false }));
    B('Меч→', 'right:220px;bottom:280px;width:56px;height:56px;background:#555a', (b) => b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); nextWeapon(); }, { passive: false }));
    const tg = document.createElement('div'); tg.textContent = '⚔'; tg.style.cssText = 'position:fixed;right:24px;bottom:370px;width:56px;height:56px;border-radius:50%;background:#222a;color:#fff;font:24px system-ui;display:flex;align-items:center;justify-content:center;z-index:32;border:2px solid #fff6;touch-action:none';
    tg.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); toggle(); }, { passive: false }); uiRoot.appendChild(tg);
    return wrap;
  }
  if (player.touch || matchMedia('(pointer: coarse)').matches) phoneUI = buildPhone();
  // кнопка «ОГОНЬ» из player.js в режиме меча = «Удар»
  addEventListener('touchstart', (e) => { if (ctl.on && e.target?.textContent === 'ОГОНЬ') { e.stopImmediatePropagation(); e.preventDefault(); phoneHold = true; lightAttack(); } }, { capture: true, passive: false });
  addEventListener('touchend', (e) => { if (e.target?.textContent === 'ОГОНЬ') phoneHold = false; }, true);

  // ---------- VR ----------
  const vr = { poseT: 0, pose: null, prevB: new THREE.Vector3(), prevT: new THREE.Vector3(), b: new THREE.Vector3(), tip: new THREE.Vector3(), speed: 0, lastFast: -9, hitCd: new Map(), prevL: {}, primed: false };
  function pollVR(t, dt) {
    const s = renderer.xr.getSession?.(); if (!s) return;
    for (const src of s.inputSources) { const gp = src.gamepad; if (!gp) continue;
      if (src.handedness === 'left') { const g = gp.buttons[1]?.pressed, tr = gp.buttons[0]?.pressed; if (g && !vr.prevL.g) toggle(); if (tr && !vr.prevL.t && ctl.on) nextWeapon(); vr.prevL = { g, t: tr }; } }
    if (!ctl.on || !blade || !ctl.vrAttached) return;
    tipBase(blade, vr.b, vr.tip);
    if (!vr.primed) { vr.prevB.copy(vr.b); vr.prevT.copy(vr.tip); vr.primed = true; }
    vr.speed = vr.tip.distanceTo(vr.prevT) / Math.max(1e-3, dt);
    // поза: в системе камеры
    camera.updateWorldMatrix(true, false); const inv = camera.matrixWorld.clone().invert();
    const pose = classifyPose(arr(vr.tip.clone().applyMatrix4(inv)), arr(vr.b.clone().applyMatrix4(inv)));
    if (engine.canAct(t) && vr.speed < 1.2 && pose) { if (pose === vr.pose) vr.poseT += dt; else { vr.pose = pose; vr.poseT = 0; } if (vr.poseT >= PRE_MOTION.holdS && engine.armed !== pose) { engine.arm(pose, t); const sk = SWORD_SKILLS[engine.slotSkill(POSE_DIR[pose])]; if (sk) { setGlow(ELEMENT_GLOW[sk.element], 0.6); pulse(); } } }
    else if (!pose) vr.poseT = 0;
    if (vr.speed > 2.5) vr.lastFast = t;
    if (engine.armed && engine.armed !== 'pc' && engine.armed !== 'phone' && vr.speed >= PRE_MOTION.vrSwingSpeed) { castDir(POSE_DIR[engine.armed]); }
    else if (engine.state !== 'active') { // физические удары
      const mul = swingMul(vr.speed, engine.weapon.swing);
      if (mul) for (const m of alive()) { const c = center(m, new THREE.Vector3()); if (c.distanceTo(vr.b) > 3) continue;
        if ((vr.hitCd.get(m) || 0) > t) continue;
        if (sweepHitsSphere(arr(vr.prevB), arr(vr.prevT), arr(vr.b), arr(vr.tip), arr(c), radius(m) * 1.05) >= 0) {
          vr.hitCd.set(m, t + engine.weapon.intervalMs / 1000); const r = applyHit(m, engine.lightAttackParams(mul)); if (r) { engine.registerHit(t); pulse(0.6, 40); } } }
    }
    vr.prevB.copy(vr.b); vr.prevT.copy(vr.tip);
  }
  function pulse(i = 0.8, ms = 60) { try { for (const src of renderer.xr.getSession()?.inputSources || []) if (src.handedness === 'right') src.gamepad?.hapticActuators?.[0]?.pulse?.(i, ms); } catch {} }
  function bladeBetween(m) { if (!ctl.vrAttached) return false; const head = camera.getWorldPosition(new THREE.Vector3()), c = center(m, new THREE.Vector3()); const mid = vr.b.clone().lerp(vr.tip, 0.5);
    const ab = c.sub(head), L = ab.length(); const k = Math.max(0, Math.min(1, mid.clone().sub(head).dot(ab) / (L * L))); return head.addScaledVector(ab, k).distanceTo(mid) < 0.35 && k * L < 1.2; }

  // ---------- защита: перехват ударов мобов ----------
  const origHit = mobs.onPlayerHit;
  mobs.onPlayerHit = (h) => {
    if (ctl.on && h?.mob && !player.dead) { const t = now(), d = distTo(h.mob), melee = !(h.atk?.projSpeed);
      if (melee) { if (player.xr && ctl.vrAttached) { if (bladeBetween(h.mob)) engine.parryAt = t - (t - vr.lastFast <= PARRY.perfectS ? 0 : PARRY.perfectS + 0.01); else engine.parryAt = -99; }
        const r = engine.incoming(t, d);
        if (r.perfect) { h.mob.stagger = Math.max(h.mob.stagger || 0, (r.stagger || 0.5) * (h.mob.elite ? 0.5 : 1)); if (r.energy && st.energy != null) st.energy = Math.min(st.energyMax || 100, st.energy + r.energy); pulse(1, 90); }
        if (r.mul === 0) return; if (r.mul < 1) h = { ...h, base: h.base * r.mul }; } else engine.incoming(t, 99);
    }
    return origHit?.(h);
  };
  const origKill = mobs.onKill; mobs.onKill = (m) => { if (m === ctl.target) ctl.target = null; return origKill?.(m); };

  // ---------- радиал: страница «Мечевые» (выбор = назначить навык в слот его позы) ----------
  const radial = ow.radial || window.__OW_H?.radial;
  if (radial?.state?.stack?.[0]?.children) {
    const items = Object.values(SWORD_SKILLS).map((s) => ({ kind: 'sword', id: s.id, label: s.name, icon: DIR_ARROW[POSE_DIR[s.pose]], line: `${POSES[s.pose].name} · ${s.hits.length} уд. · мастерство ${s.mastery}` }));
    const page = (list, i = 0) => (list.length <= 8 ? list : [...list.slice(0, 7), { kind: 'page', id: 'pg_sword_more' + i, label: 'Ещё…', icon: '⋯', children: page(list.slice(7), i + 1) }]);
    const node = { kind: 'page', id: 'pg_sword', label: 'Мечевые', icon: '🗡️', children: page(items) };
    const root = radial.state.stack[0];
    if (root.children.length < 8) root.children.push(node); else { const more = root.children.find((c) => c.kind === 'page' && c.id.startsWith('more_')); (more?.children || root.children).push(node); }
    const conf = radial.confirm.bind(radial);
    radial.confirm = () => { const r = conf(); if (r?.picked?.startsWith?.('ssk_')) { const sk = SWORD_SKILLS[r.picked], dir = POSE_DIR[sk.pose];
      if (engine.assignSlot(dir, r.picked)) { persist(); hudFlash(`Слот ${DIR_ARROW[dir]}: ${sk.name}`, ELEMENT_GLOW[sk.element]); } else hudFlash(`${sk.name}: не для «${MELEE_CLASSES[engine.mclass].name}»`, '#889'); drawHud(true); } return r; };
    ctl.radialPage = node;
  }

  // ---------- HUD (DOM, 10 Гц) ----------
  ui.el = document.createElement('div'); ui.el.id = 'ow-melee-hud';
  ui.el.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:40;pointer-events:none;font:12px system-ui;color:#e8edff;text-align:center;display:none';
  uiRoot.appendChild(ui.el);
  const flashEl = document.createElement('div'); flashEl.style.cssText = 'position:fixed;left:50%;top:30%;transform:translateX(-50%);z-index:41;pointer-events:none;font:800 26px system-ui;letter-spacing:.04em;text-shadow:0 0 12px currentColor,0 2px 4px #000;opacity:0;transition:opacity .2s';
  uiRoot.appendChild(flashEl); let flashT = 0;
  function hudFlash(txt, color = '#fff') { if (!txt) return; flashEl.textContent = txt; flashEl.style.color = color; flashEl.style.opacity = 1; flashT = 1.1; }
  let hudT = 0;
  function drawHud(force) {
    ui.el.style.display = ctl.on ? 'block' : 'none'; if (!ctl.on) return; const t = now(), m = engine.mastery();
    const slots = SLOT_DIRS.map((d) => { const id = engine.slotSkill(d), sk = SWORD_SKILLS[id]; if (!sk) return ''; const cd = Math.max(0, (engine.cd[id] || 0) - t), lock = m.level < sk.mastery;
      return `<span style="display:inline-block;margin:0 3px;padding:4px 7px;border-radius:8px;background:${lock ? '#2a2f40' : cd ? '#333a' : '#1d2550cc'};border:1px solid ${ELEMENT_GLOW[sk.element]};opacity:${lock ? 0.45 : 1}">${DIR_ARROW[d]} ${sk.name}${cd ? ` ${cd.toFixed(1)}с` : lock ? ' 🔒' + sk.mastery : ''}</span>`; }).join('');
    const post = engine.state === 'post' && t < engine.postUntil ? `<div style="height:4px;margin:4px auto;width:180px;background:#333"><div style="height:4px;background:#ff3a6a;width:${Math.round(100 * (engine.postUntil - t) / 1.8)}%"></div></div>` : '';
    const sw = t < engine.switchUntil ? '<b style="color:#ffe14d;text-shadow:0 0 8px #ffe14d">SWITCH</b> · ' : '';
    ui.el.innerHTML = `<div style="font:800 ${engine.combo >= 10 ? 30 : 22}px system-ui;color:#ffd23f;text-shadow:0 0 8px #f80">${engine.combo > 1 ? engine.combo + ' COMBO' : '&nbsp;'}</div>${post}
      <div>${sw}${MELEE_CLASSES[engine.mclass].icon} ${engine.weapon.name} · мастерство ${m.level}${m.need ? ` (${m.into}/${m.need})` : ' MAX'}</div><div style="margin-top:4px">${slots}</div>
      <div style="opacity:.6;margin-top:3px">${player.touch ? 'Навык: свайп ↑→↓← / тап — выпад · Блок' : player.xr ? 'Держи позу → клинок загорелся → взмах' : 'ЛКМ удар · ПКМ+рывок навык · тап ПКМ/C парир. · 4–8 слоты · B меч · G огнестрел'}</div>`;
  }

  // ---------- кадр: оборачиваем player.endFrame (вызывается раз в кадр до рендера) ----------
  let last = now(); const origEnd = player.endFrame.bind(player);
  player.endFrame = function () {
    const t = now(), dt = Math.min(0.1, t - last); last = t;
    try { tick(t, dt); } catch (e) { if (!ctl._err) console.warn('[melee] tick', e); ctl._err = String(e); }
    return origEnd();
  };
  function tick(t, dt) {
    if (player.xr && !ctl.vrAttached && grips.right) attachBlades();
    if (!player.xr && ctl.vrAttached) attachBlades();
    pollVR(t, dt);
    if (!ctl.on) { if ((flashT -= dt) <= 0) flashEl.style.opacity = 0; return; }
    player.fire = false; player.firePressed = false; // огнестрел молчит в режиме меча (VR-курок, телефон)
    if ((lmb || phoneHold || (player.xr === false && false))) lightAttack();
    // захват цели
    if (!ctl.target || ctl.target.state === 'dead' || distTo(ctl.target) > LIGHT_ATTACK.lockRange * 1.4) ctl.target = engine.state === 'active' ? ctl.target : pickTarget();
    if (ctl.target && ctl.target.state !== 'dead') { lockRing.visible = true; lockRing.position.set(ctl.target.g.position.x, ctl.target.g.position.y + 0.05, ctl.target.g.position.z); lockRing.scale.setScalar(Math.max(0.6, radius(ctl.target) * 1.6)); lockRing.rotation.y += dt * 2; } else lockRing.visible = false;
    // навык: рывок и «корни» (в навыке и задержке игрок не ходит — как в SAO)
    if (ctl.lunge && ctl.lunge.left > 0 && ctl.lunge.m.state !== 'dead') { const step = Math.min(ctl.lunge.left, ctl.lunge.left * dt / Math.max(dt, ctl.lunge.t)); const dx = ctl.lunge.m.g.position.x - player.pos.x, dz = ctl.lunge.m.g.position.z - player.pos.z, L = Math.hypot(dx, dz) || 1;
      player.pos.x += dx / L * step; player.pos.z += dz / L * step; ctl.lunge.left -= step; ctl.lunge.t = Math.max(0.02, ctl.lunge.t - dt); ctl.root = { x: player.pos.x, z: player.pos.z }; }
    else if ((engine.state === 'active' || (engine.state === 'post' && t < engine.postUntil)) && ctl.root && !player.xr) { player.pos.x = ctl.root.x; player.pos.z = ctl.root.z; }
    engine.update(t, resolveSkillHit);
    // свечение: навык активен → по стихии; готовность (armed) → мерцание; иначе гаснет
    const sk = engine.skill || (engine.armed && SWORD_SKILLS[engine.slotSkill(POSE_DIR[engine.armed] || (rmb ? classifyDir(rmb.dx, -rmb.dy) : 'none'))]);
    if (sk) setGlow(ELEMENT_GLOW[sk.element], engine.skill ? 0.85 : 0.35 + 0.25 * Math.sin(t * 18)); else if (blade?.userData.glowMat.opacity > 0) setGlow('#fff', Math.max(0, blade.userData.glowMat.opacity - dt * 3));
    // анимация ПК
    if (!ctl.vrAttached) { anim.t += dt; const k = Math.min(1, anim.t / anim.dur), e = Math.sin(k * Math.PI), r = POSE_ROT[anim.dir] || POSE_ROT.diag;
      pivot.rotation.set(r[0] * e, r[1] * e, r[2] * e); pivot.position.z = anim.dir === 'thrust' ? -0.35 * e : 0; holder.position.y = -0.36 + (engine.armed ? 0.06 : 0); }
    if (blade) { tipBase(blade, v2, v3); trail.push(v2, v3, t < trailOnUntil || (ctl.vrAttached && vr.speed > 2.5) || !!engine.skill, sk ? ELEMENT_GLOW[sk.element] : trailColor); }
    for (const n of nums) if (n.t > 0) { n.t -= dt; n.p.y += dt * 0.8; const s = n.p.clone().project(camera); n.d.style.display = s.z < 1 && n.t > 0 ? 'block' : 'none'; n.d.style.left = (s.x + 1) * 50 + '%'; n.d.style.top = (1 - s.y) * 50 + '%'; n.d.style.opacity = Math.min(1, n.t * 2); }
    if ((flashT -= dt) <= 0) flashEl.style.opacity = 0;
    if ((hudT -= dt) <= 0) { hudT = 0.1; drawHud(); }
  }
  Object.assign(ctl, { toggle, setWeapon, nextWeapon, lightAttack, castSkill, castDir, parry, pickTarget, persist, mastery: () => masteryFromXp(engine.xp[engine.mclass] || 0), classOf: meleeClassOf });
  if (new URLSearchParams(location.search).has('melee')) toggle(true);
  console.info(`[melee] installed: ${ids.length} мечей, ${Object.keys(SWORD_SKILLS).length} навыков, radial=${!!ctl.radialPage}`);
  return ctl;
}
