// Навыки фэнтези-режима в шлеме и мана игрока.
// Мгновенный шаг (дуга левым стиком), энергосфера, волна ки, ускорение восприятия,
// барьер, небесный шаг, руны жестами, ульта «Пробуждение».
// Мир (мишени, противники, перемещение рига) — через hooks из main.js. Без аллокаций в кадре.
import * as THREE from 'three';
import { createRuneRecorder, createHandTracker, palmNormal, palmUp, palmForward, kiPose } from './gestures.js';

// слои 1 и 2 рисуют только глаза XR (как в vr-comfort.js)
const XR_ONLY = 0b110;
const FONT = 'system-ui, sans-serif';

export const SKILLS = [
  { id: 'flash', name: 'Шаг', cost: 8, cooldown: 0.35 },
  { id: 'orb', name: 'Сфера', cost: 15, cooldown: 1 },
  { id: 'ki', name: 'Волна ки', cost: 40, cooldown: 6 },
  { id: 'focus', name: 'Восприятие', cost: 30, cooldown: 15 },
  { id: 'barrier', name: 'Барьер', cost: 5, cooldown: 1 },
  { id: 'sky', name: 'Небо', cost: 6, cooldown: 0 },
  { id: 'rune', name: 'Руны', cost: 15, cooldown: 1.2 },
];
const RUNE_COST = { circle: 20, triangle: 15, zigzag: 20, spiral: 0 };
const RUNE_NAME = { circle: 'ЩИТ', triangle: 'ОГНЕННЫЙ ШАР', zigzag: 'МОЛНИЯ', spiral: 'МАНА' };

const MAX_MANA = 100;
const REGEN = 5;              // маны в секунду
const BARRIER_DRAIN = 10;     // маны в секунду, пока держим щит
const FOCUS_TIME = 4, FOCUS_SCALE = 0.25;
const ULT_TIME = 8;
const KI_CHARGE = 1.5;
const SKY_MAX = 3;
const ARC_STEPS = 40, ARC_DT = 0.045, ARC_SPEED = 8, GRAVITY = 9.8;
const GHOSTS = 4;
const ORBS = 4;
const TRAIL = 160;

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const glow = (color, opacity = 0.8, extra = {}) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, ...extra,
});
const xrOnly = (o) => { o.layers.mask = XR_ONLY; o.traverse((c) => { c.layers.mask = XR_ONLY; }); return o; };

// шестиугольная сетка щита на canvas
function hexTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = '#9fe7ff';
  g.lineWidth = 3;
  const r = 22, h = r * Math.sqrt(3) / 2;
  for (let row = -1; row < 8; row++) {
    for (let col = -1; col < 8; col++) {
      const x = col * r * 1.5, y = row * h * 2 + (col & 1 ? h : 0);
      g.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = k * Math.PI / 3;
        g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92);
      }
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createSkills({ scene, camera, quality, hooks = {} } = {}) {
  const H = {
    teleport() {}, skyJump() {}, blink() {},
    damageSphere() { return 0; }, damageRay() { return 0; }, lightning() { return null; },
    hitTest() { return null; }, hitstop() {}, sound() {}, notify() {}, vibrate() {},
    projectiles() { return null; }, surfaces() { return { radius: 11, platforms: [] }; },
    groundAt: null,   // (x, z) → высота земли; null — ровный пол острова y = 0
    canStand: null,   // (x, z) → можно ли встать (открытый мир); null — внутри радиуса острова
    ...hooks,
  };
  const fxQuality = quality?.id || 'high';

  const root = new THREE.Group();
  root.name = 'fantasy-skills';
  scene.add(root);

  // ---------- состояние ----------
  const cd = Object.fromEntries(SKILLS.map((s) => [s.id, 0])); // откаты, с
  let enabled = false;
  let mana = MAX_MANA, ult01 = 0, ultLeft = 0, focusLeft = 0, timeScale = 1;
  let skyUsed = 0;
  let lastCast = ''; // последний сработавший навык (для отладки)
  let freeMana = false; // открытый мир: навыки без маны, только откаты
  const ground = (x, z) => (H.groundAt ? H.groundAt(x, z) : 0);
  const trackers = { left: createHandTracker(), right: createHandTracker() };

  const spend = (id, cost = SKILLS.find((s) => s.id === id).cost) => {
    if (freeMana) mana = MAX_MANA;
    if (cd[id] > 0 || mana < cost) {
      if (mana < cost) H.sound('rune-fail');
      return false;
    }
    mana -= cost;
    cd[id] = SKILLS.find((s) => s.id === id).cooldown;
    return true;
  };
  const power = () => (ultLeft > 0 ? 2 : 1);

  // ---------- мгновенный шаг: дуга, цель, послеобразы ----------
  const arcGeo = new THREE.BufferGeometry();
  const arcPos = new Float32Array(ARC_STEPS * 3);
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3).setUsage(THREE.DynamicDrawUsage));
  const arcMat = new THREE.LineBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: 0.9, fog: false });
  const arc = xrOnly(new THREE.Line(arcGeo, arcMat));
  arc.frustumCulled = false;
  arc.visible = false;
  const ringGeo = new THREE.RingGeometry(0.28, 0.36, 32).rotateX(-Math.PI / 2);
  const targetRing = xrOnly(new THREE.Mesh(ringGeo, glow(0x7fe9ff, 0.9, { side: THREE.DoubleSide })));
  targetRing.visible = false;
  const ghostGeo = new THREE.CapsuleGeometry(0.2, 1.15, 3, 8).translate(0, 0.78, 0);
  const ghosts = Array.from({ length: GHOSTS }, () => {
    const m = new THREE.Mesh(ghostGeo, glow(0x63d7ff, 0));
    m.visible = false;
    m.userData.t = 0;
    root.add(m);
    return m;
  });
  root.add(arc, targetRing);
  const flashTarget = new THREE.Vector3();
  let flashAiming = false, flashValid = false;

  // дуга из левой руки: пол острова (y = 0, внутри радиуса) или верх платформы
  function traceArc(hand) {
    const surf = H.surfaces() || {};
    const radius = surf.radius || 11;
    const plats = surf.platforms || [];
    hand.getWorldPosition(tmpA);
    hand.getWorldQuaternion(tmpQ);
    tmpB.set(0, 0, -1).applyQuaternion(tmpQ).multiplyScalar(ARC_SPEED); // скорость
    let n = 0, hit = false;
    for (; n < ARC_STEPS; n++) {
      arcPos[n * 3] = tmpA.x; arcPos[n * 3 + 1] = tmpA.y; arcPos[n * 3 + 2] = tmpA.z;
      tmpC.copy(tmpA).addScaledVector(tmpB, ARC_DT);
      tmpC.y -= GRAVITY * ARC_DT * ARC_DT * 0.5;
      // платформы: пересекли уровень верха сверху вниз внутри круга
      for (const p of plats) {
        const top = p.position.y;
        if (tmpA.y >= top && tmpC.y < top) {
          const t = (tmpA.y - top) / (tmpA.y - tmpC.y);
          const x = tmpA.x + (tmpC.x - tmpA.x) * t, z = tmpA.z + (tmpC.z - tmpA.z) * t;
          if (Math.hypot(x - p.position.x, z - p.position.z) < (p.radius || 1) * 0.9) {
            flashTarget.set(x, top, z); hit = true; break;
          }
        }
      }
      const gA = ground(tmpA.x, tmpA.z), gC = ground(tmpC.x, tmpC.z);
      if (!hit && tmpA.y >= gA && tmpC.y < gC) {
        const t = (tmpA.y - gA) / ((tmpA.y - gA) - (tmpC.y - gC));
        const fx = tmpA.x + (tmpC.x - tmpA.x) * t, fz = tmpA.z + (tmpC.z - tmpA.z) * t;
        flashTarget.set(fx, ground(fx, fz), fz);
        hit = H.canStand ? H.canStand(fx, fz) : Math.hypot(fx, fz) <= radius;
        n++;
        arcPos[n * 3] = flashTarget.x; arcPos[n * 3 + 1] = flashTarget.y; arcPos[n * 3 + 2] = flashTarget.z;
        break;
      }
      if (hit) { n++; arcPos[n * 3] = flashTarget.x; arcPos[n * 3 + 1] = flashTarget.y; arcPos[n * 3 + 2] = flashTarget.z; break; }
      tmpA.copy(tmpC);
      tmpB.y -= GRAVITY * ARC_DT;
    }
    arcGeo.setDrawRange(0, Math.min(ARC_STEPS, n + 1));
    arcGeo.attributes.position.needsUpdate = true;
    return hit;
  }

  function flashStep(from, headPos) {
    if (!spend('flash')) return;
    // послеобразы по пути: от ног игрока к цели
    for (let i = 0; i < GHOSTS; i++) {
      const g = ghosts[i];
      g.position.lerpVectors(tmpA.set(headPos.x, from.y, headPos.z), flashTarget, (i + 0.5) / GHOSTS);
      g.userData.t = 0.5 + i * 0.06;
      g.visible = true;
    }
    H.blink();
    H.teleport(flashTarget);
    lastCast = 'flash';
    H.sound('flash-step');
  }

  function updateFlash(dt, ctx) {
    const left = ctx.left;
    const axes = left?.userData.src?.gamepad?.axes;
    const sy = axes && axes.length >= 4 ? axes[3] : 0;
    if (!flashAiming && sy < -0.6) flashAiming = true;
    if (flashAiming) {
      if (sy > -0.3) {
        // отпустили стик — шагаем
        flashAiming = false;
        if (flashValid) flashStep(tmpC.set(0, ctx.feetY, 0), ctx.headPos);
        flashValid = false;
      } else {
        flashValid = traceArc(left);
        arcMat.color.setHex(flashValid ? (mana >= 8 ? 0x7fe9ff : 0xffb03a) : 0xff4d6a);
        targetRing.position.copy(flashTarget);
        targetRing.position.y += 0.02;
        targetRing.visible = flashValid;
      }
    }
    arc.visible = flashAiming;
    if (!flashAiming) targetRing.visible = false;
    for (const g of ghosts) {
      if (!g.visible) continue;
      g.userData.t -= dt;
      g.material.opacity = Math.max(0, Math.min(0.45, g.userData.t * 0.9));
      if (g.userData.t <= 0) g.visible = false;
    }
  }

  // ---------- энергосфера и огненный шар (полёт и взрыв) ----------
  const orbGeo = new THREE.IcosahedronGeometry(1, 2);
  const heldOrb = new THREE.Mesh(orbGeo, glow(0x7fd8ff, 0.85));
  const heldCore = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
  heldCore.scale.setScalar(0.45);
  heldOrb.add(heldCore);
  heldOrb.visible = false;
  root.add(heldOrb);
  let orbHand = null, orbCharge = 0;

  const flying = Array.from({ length: ORBS }, () => {
    const m = new THREE.Mesh(orbGeo, glow(0x7fd8ff, 0.9));
    m.visible = false;
    root.add(m);
    return { mesh: m, vel: new THREE.Vector3(), life: 0, radius: 1.5, power: 1, color: 0x7fd8ff, fire: false };
  });
  const blast = Array.from({ length: 3 }, () => {
    const m = new THREE.Mesh(orbGeo, glow(0x7fd8ff, 0));
    m.visible = false;
    root.add(m);
    return { mesh: m, t: 0, r: 1 };
  });

  function launch(from, vel, { radius, power: pw, color, fire }) {
    const o = flying.find((f) => !f.mesh.visible) || flying[0];
    o.mesh.position.copy(from);
    o.mesh.scale.setScalar(fire ? 0.12 : 0.08 + 0.1 * Math.min(1, radius / 3));
    o.mesh.material.color.setHex(color);
    o.vel.copy(vel);
    o.life = 3;
    o.radius = radius;
    o.power = pw;
    o.color = color;
    o.fire = fire;
    o.mesh.visible = true;
  }

  function explode(o, point) {
    o.mesh.visible = false;
    const hits = H.damageSphere(point, o.radius, o.power * power(), o.fire ? 'fire' : 'ki');
    const b = blast.find((x) => !x.mesh.visible) || blast[0];
    b.mesh.position.copy(point);
    b.mesh.material.color.setHex(o.color);
    b.t = 0; b.r = o.radius;
    b.mesh.visible = true;
    H.sound(o.fire ? 'fireball' : 'cast-orb');
    if (hits > 0 && o.radius > 2) H.hitstop(0.06);
  }

  function updateOrbs(dt) {
    for (const o of flying) {
      if (!o.mesh.visible) continue;
      o.life -= dt;
      o.vel.y -= (o.fire ? 0 : 4) * dt;
      const len = o.vel.length() * dt;
      tmpA.copy(o.vel).normalize();
      const hit = len > 0 ? H.hitTest(o.mesh.position, tmpA, len) : null;
      if (hit) { explode(o, hit.point); continue; }
      o.mesh.position.addScaledVector(o.vel, dt);
      if (o.mesh.position.y <= ground(o.mesh.position.x, o.mesh.position.z) + 0.05 || o.life <= 0) explode(o, o.mesh.position);
    }
    for (const b of blast) {
      if (!b.mesh.visible) continue;
      b.t += dt;
      const k = b.t / 0.35;
      b.mesh.scale.setScalar(b.r * (0.3 + 0.7 * k));
      b.mesh.material.opacity = Math.max(0, 0.6 * (1 - k));
      if (k >= 1) b.mesh.visible = false;
    }
  }

  function updateHeldOrb(dt) {
    if (!orbHand) return;
    const needed = 15 * dt * 0.6; // дозаряд маны, пока растёт
    if (orbCharge < 1 && mana > needed) { orbCharge = Math.min(1, orbCharge + dt / 1.2); mana -= needed; }
    orbHand.getWorldPosition(heldOrb.position);
    heldOrb.position.addScaledVector(palmNormal(orbHand, orbHand.userData.src?.handedness, tmpA), 0.09);
    heldOrb.scale.setScalar(0.05 + 0.11 * orbCharge + Math.sin(performance.now() * 0.02) * 0.004);
    if (Math.random() < dt * 8) H.vibrate(orbHand, 0.1 + 0.3 * orbCharge, 20);
  }

  function releaseOrb() {
    const side = orbHand.userData.src?.handedness === 'left' ? 'left' : 'right';
    const v = trackers[side].velocity;
    const speed = v.length();
    heldOrb.visible = false;
    if (speed < 1.2) {
      mana = Math.min(MAX_MANA, mana + 6); // не бросили — рассеялась, часть маны вернулась
      H.sound('rune-fail');
    } else {
      tmpB.copy(v).normalize().multiplyScalar(THREE.MathUtils.clamp(speed * 3, 9, 24));
      lastCast = 'orb';
      launch(heldOrb.position, tmpB, { radius: 1.4 + 1.8 * orbCharge, power: 1 + orbCharge, color: 0x7fd8ff, fire: false });
      H.sound('cast-orb');
      H.vibrate(orbHand, 0.6, 60);
    }
    orbHand = null;
    orbCharge = 0;
  }

  // ---------- волна ки ----------
  const kiBall = new THREE.Mesh(orbGeo, glow(0x9ff3ff, 0.8));
  kiBall.visible = false;
  const beamGeo = new THREE.CylinderGeometry(0.35, 1, 1, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, -0.5);
  const beam = new THREE.Mesh(beamGeo, glow(0x8ff0ff, 0, { side: THREE.DoubleSide }));
  const beamCore = new THREE.Mesh(beamGeo, glow(0xffffff, 0, { side: THREE.DoubleSide }));
  beamCore.scale.set(0.45, 0.45, 1);
  beam.add(beamCore);
  beam.visible = false;
  root.add(kiBall, beam);
  let kiState = 'idle', kiTime = 0, beamT = 0;
  const KI_LEN = 40;

  function updateKi(dt, ctx) {
    const { left, right, headPos } = ctx;
    const both = left && right && squeezed(left) && squeezed(right);
    const lp = trackers.left.position, rp = trackers.right.position;
    if (kiState === 'idle' || kiState === 'charging') {
      if (both && !orbHand && !barrierHand && cd.ki <= 0 && kiPose(lp, rp, headPos, ctx.fwd)) {
        if (kiState === 'idle') { kiState = 'charging'; kiTime = 0; H.sound('charge'); }
        kiTime += dt;
        if (Math.random() < dt * 10) { H.vibrate(left, 0.2 + 0.4 * kiTime / KI_CHARGE, 25); H.vibrate(right, 0.2 + 0.4 * kiTime / KI_CHARGE, 25); }
        if (kiTime >= KI_CHARGE) { kiState = 'ready'; kiTime = 0; H.notify('ВОЛНА КИ ГОТОВА — ТОЛЧОК!', '#9ff3ff'); }
      } else kiState = 'idle';
    } else if (kiState === 'ready') {
      kiTime += dt;
      const push = trackers.left.velocity.dot(ctx.fwd) + trackers.right.velocity.dot(ctx.fwd);
      if (!both || kiTime > 3) kiState = 'idle';
      else if (push > 2.2) {
        kiState = 'idle';
        fireKi(ctx);
      }
    }
    kiBall.visible = kiState !== 'idle';
    if (kiBall.visible) {
      kiBall.position.addVectors(lp, rp).multiplyScalar(0.5);
      const k = kiState === 'ready' ? 1 : kiTime / KI_CHARGE;
      kiBall.scale.setScalar(0.04 + 0.1 * k + Math.sin(performance.now() * 0.03) * 0.006);
    }
    if (beam.visible) {
      beamT += dt;
      const k = beamT / 0.7;
      const r = (k < 0.15 ? k / 0.15 : 1) * 0.7;
      beam.scale.set(r, r, KI_LEN);
      beam.material.opacity = 0.4 * (1 - k * k);
      beamCore.material.opacity = 0.9 * (1 - k);
      if (k >= 1) beam.visible = false;
    }
  }

  function fireKi(ctx) {
    if (freeMana) mana = MAX_MANA;
    if (mana < SKILLS[2].cost) { H.notify('Мало маны для волны ки', '#ff8a6e'); H.sound('rune-fail'); return; }
    const pw = 1 + 2 * (mana / MAX_MANA);
    mana = 0;
    cd.ki = SKILLS[2].cooldown;
    camera.getWorldDirection(tmpB);
    beam.position.copy(kiBall.position);
    beam.quaternion.setFromUnitVectors(tmpA.set(0, 0, -1), tmpB);
    beam.visible = true;
    beamT = 0;
    const hits = H.damageRay(kiBall.position, tmpB, KI_LEN, 0.9, pw * power(), 'ki');
    lastCast = 'ki';
    H.sound('ki-wave');
    H.vibrate(ctx.left, 1, 300);
    H.vibrate(ctx.right, 1, 300);
    H.hitstop(hits > 0 ? 0.08 : 0.05);
  }

  // ---------- ускорение восприятия: коснуться наруча другой рукой ----------
  const wristLocal = new THREE.Vector3(0, 0.03, 0.12);
  let focusTouch = false;
  function updateFocus(dt, ctx) {
    if (focusLeft > 0) {
      focusLeft -= dt;
      if (focusLeft <= 0) { focusLeft = 0; H.sound('slowmo-out'); }
    }
    const target = focusLeft > 0 ? FOCUS_SCALE : 1;
    timeScale += (target - timeScale) * Math.min(1, dt * 10);
    if (Math.abs(timeScale - target) < 0.01) timeScale = target;
    const { left, right } = ctx;
    if (!left || !right) return;
    tmpA.copy(wristLocal);
    left.localToWorld(tmpA);
    const near = trackers.right.position.distanceTo(tmpA) < 0.09 && !squeezed(right);
    if (near && !focusTouch && focusLeft <= 0) {
      if (spend('focus')) {
        focusLeft = FOCUS_TIME;
        H.sound('slowmo-in');
        H.notify('УСКОРЕНИЕ ВОСПРИЯТИЯ', '#b49cff');
        H.vibrate(left, 0.5, 80);
      }
    }
    focusTouch = near;
  }

  // ---------- барьер ----------
  const shield = new THREE.Mesh(new THREE.CircleGeometry(0.42, 6), glow(0x8fe6ff, 0.55, { map: hexTexture(), side: THREE.DoubleSide }));
  shield.visible = false;
  root.add(shield);
  const bubble = new THREE.Mesh(orbGeo, glow(0x8fe6ff, 0.18, { side: THREE.DoubleSide }));
  bubble.visible = false;
  root.add(bubble);
  let barrierHand = null, bubbleLeft = 0;
  const shieldNormal = new THREE.Vector3();

  function deflectNear(center, radius, normal) {
    const pr = H.projectiles();
    if (!pr?.list) return;
    for (let i = pr.list.length - 1; i >= 0; i--) {
      const p = pr.list[i];
      const pos = p.position || p.mesh?.position;
      if (!pos || pos.distanceToSquared(center) > radius * radius) continue;
      if (normal) tmpB.copy(normal);
      else tmpB.subVectors(pos, center).normalize();
      try { pr.deflect?.(p, tmpB); } catch (e) { console.warn(e); }
      H.sound('barrier-hit');
    }
  }

  function updateBarrier(dt, ctx) {
    if (barrierHand) {
      mana -= BARRIER_DRAIN * dt;
      if (mana <= 0) { mana = 0; stopBarrier(); }
    }
    if (barrierHand) {
      const side = barrierHand.userData.src?.handedness;
      barrierHand.getWorldPosition(shield.position);
      palmNormal(barrierHand, side, shieldNormal);
      shield.position.addScaledVector(shieldNormal, 0.16);
      shield.quaternion.setFromUnitVectors(Z_AXIS, shieldNormal);
      shield.material.opacity = 0.45 + 0.1 * Math.sin(performance.now() * 0.01);
      deflectNear(shield.position, 0.7, shieldNormal);
    }
    if (bubbleLeft > 0) {
      bubbleLeft -= dt;
      bubble.position.copy(ctx.headPos);
      bubble.position.y -= 0.5;
      bubble.scale.setScalar(1.3);
      bubble.material.opacity = 0.18 * Math.min(1, bubbleLeft * 2);
      deflectNear(bubble.position, 1.5, null);
      if (bubbleLeft <= 0) bubble.visible = false;
    }
  }
  function stopBarrier() {
    barrierHand = null;
    shield.visible = false;
  }

  // ---------- небесный шаг ----------
  const skyRing = new THREE.Mesh(ringGeo, glow(0xbfe9ff, 0, { side: THREE.DoubleSide }));
  skyRing.visible = false;
  root.add(skyRing);
  let skyT = 0;
  function updateSky(dt, ctx) {
    if (!ctx.airborne) skyUsed = 0;
    if (!skyRing.visible) return;
    skyT += dt;
    skyRing.scale.setScalar(1 + skyT * 3);
    skyRing.material.opacity = Math.max(0, 0.8 * (1 - skyT / 0.4));
    if (skyT > 0.4) skyRing.visible = false;
  }

  // ---------- руны ----------
  const recorder = createRuneRecorder();
  const trailGeo = new THREE.BufferGeometry();
  const trailPos = new Float32Array(TRAIL * 3);
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
  const trail = xrOnly(new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffd36e, transparent: true, opacity: 1, fog: false })));
  trail.frustumCulled = false;
  trail.visible = false;
  root.add(trail);
  let runeHand = null, trailFade = 0;
  // молния: ломаная через цели
  const boltGeo = new THREE.BufferGeometry();
  const boltPos = new Float32Array(64 * 3);
  boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPos, 3).setUsage(THREE.DynamicDrawUsage));
  const bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 1, fog: false }));
  bolt.frustumCulled = false;
  bolt.visible = false;
  root.add(bolt);
  let boltT = 0;

  function updateRunes(dt) {
    if (runeHand) {
      runeHand.getWorldPosition(tmpA);
      runeHand.getWorldQuaternion(tmpQ);
      tmpA.addScaledVector(tmpB.set(0, 0, -1).applyQuaternion(tmpQ), 0.06);
      if (recorder.add(tmpA)) {
        const n = recorder.count;
        if (n <= TRAIL) {
          tmpA.toArray(trailPos, (n - 1) * 3);
          trailGeo.setDrawRange(0, n);
          trailGeo.attributes.position.needsUpdate = true;
        }
      }
    } else if (trail.visible) {
      trailFade -= dt;
      trail.material.opacity = Math.max(0, trailFade / 0.4);
      if (trailFade <= 0) trail.visible = false;
    }
    if (bolt.visible) {
      boltT -= dt;
      bolt.material.opacity = Math.max(0, boltT / 0.25);
      if (boltT <= 0) bolt.visible = false;
    }
  }

  function castRune(shape, hand, ctx) {
    lastCast = 'rune:' + (shape || 'none');
    if (!shape) { H.sound('rune-fail'); return; }
    if (cd.rune > 0) { H.sound('rune-fail'); return; }
    if (shape === 'spiral') {
      if (cd.spiral > 0) { H.notify('Спираль ещё не готова', '#ffb03a'); H.sound('rune-fail'); return; }
      mana = Math.min(MAX_MANA, mana + 40);
      cd.spiral = 15;
      cd.rune = SKILLS[6].cooldown;
      H.sound('mana-restore');
      H.notify('РУНА: МАНА +40', '#7fd8ff');
      return;
    }
    const cost = RUNE_COST[shape];
    if (freeMana) mana = MAX_MANA;
    if (mana < cost) { H.notify('Мало маны', '#ff8a6e'); H.sound('rune-fail'); return; }
    mana -= cost;
    cd.rune = SKILLS[6].cooldown;
    H.sound('rune-drawn');
    H.notify('РУНА: ' + RUNE_NAME[shape], '#ffd36e');
    hand.getWorldPosition(tmpA);
    camera.getWorldDirection(tmpB);
    if (shape === 'circle') {
      bubbleLeft = 4;
      bubble.visible = true;
    } else if (shape === 'triangle') {
      launch(tmpA, tmpC.copy(tmpB).multiplyScalar(16), { radius: 2.2, power: 2, color: 0xff7a2a, fire: true });
    } else if (shape === 'zigzag') {
      const pts = H.lightning(tmpA, tmpB, 3, 25, 1.5 * power()) || [];
      drawBolt(tmpA, pts);
      if (pts.length) H.hitstop(0.05);
    }
  }

  function drawBolt(from, points) {
    let n = 0;
    const put = (v) => { if (n < 64) { v.toArray(boltPos, n * 3); n++; } };
    tmpC.copy(from);
    put(tmpC);
    const list = points.length ? points : [tmpA.copy(from).addScaledVector(tmpB, 12)];
    for (const p of list) {
      // зубцы между точками
      for (let k = 1; k <= 6; k++) {
        const t = k / 6;
        const x = tmpC.x + (p.x - tmpC.x) * t + (k < 6 ? (Math.random() - 0.5) * 0.4 : 0);
        const y = tmpC.y + (p.y - tmpC.y) * t + (k < 6 ? (Math.random() - 0.5) * 0.4 : 0);
        const z = tmpC.z + (p.z - tmpC.z) * t + (k < 6 ? (Math.random() - 0.5) * 0.4 : 0);
        if (n < 64) { boltPos[n * 3] = x; boltPos[n * 3 + 1] = y; boltPos[n * 3 + 2] = z; n++; }
      }
      tmpC.copy(p);
    }
    boltGeo.setDrawRange(0, n);
    boltGeo.attributes.position.needsUpdate = true;
    bolt.visible = true;
    boltT = 0.25;
    H.sound('cast-bolt');
  }

  // ---------- ульта «Пробуждение» ----------
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    glow(0xffc46b, 0, { side: THREE.BackSide }));
  dome.visible = false;
  root.add(dome);
  function updateUlt(dt, ctx) {
    if (ultLeft <= 0) return;
    ultLeft -= dt;
    dome.position.set(ctx.headPos.x, 0, ctx.headPos.z);
    const k = Math.min(1, (ULT_TIME - ultLeft) / 0.6);
    dome.scale.setScalar(11 * k);
    dome.material.opacity = 0.12 * Math.min(1, ultLeft);
    if (ultLeft <= 0) { ultLeft = 0; dome.visible = false; H.notify('Пробуждение закончилось', '#ffc46b'); }
  }
  function tryUlt(ctx) {
    if (ult01 < 1 || ultLeft > 0) return false;
    if (!(ctx.left && ctx.right && squeezed(ctx.left) && squeezed(ctx.right))) return false;
    ult01 = 0;
    ultLeft = ULT_TIME;
    mana = MAX_MANA;
    dome.visible = true;
    H.sound('ult');
    H.notify('ПРОБУЖДЕНИЕ!', '#ffc46b');
    H.hitstop(0.08);
    H.vibrate(ctx.left, 1, 400);
    H.vibrate(ctx.right, 1, 400);
    return true;
  }

  // ---------- общее ----------
  const squeezed = (c) => !!c?.userData.src?.gamepad?.buttons?.[1]?.pressed;
  let lastCtx = null;

  function update(dt, ctx) {
    lastCtx = ctx;
    if (freeMana) mana = MAX_MANA;
    for (const k in cd) if (cd[k] > 0) cd[k] = Math.max(0, cd[k] - dt);
    if (!enabled) { timeScale = 1; return; }
    if (ctx.left) trackers.left.update(ctx.left, dt);
    if (ctx.right) trackers.right.update(ctx.right, dt);
    if (!barrierHand && !orbHand) mana = Math.min(MAX_MANA, mana + REGEN * dt);
    updateFlash(dt, ctx);
    updateHeldOrb(dt);
    updateOrbs(dt);
    updateKi(dt, ctx);
    updateFocus(dt, ctx);
    updateBarrier(dt, ctx);
    updateSky(dt, ctx);
    updateRunes(dt);
    updateUlt(dt, ctx);
  }

  // хват свободной руки: ладонь вверх — сфера, ладонь вперёд — барьер; true — навык взял хват
  function onSqueeze(c, down, ctx = lastCtx) {
    if (!enabled || !ctx) return false;
    const side = c.userData.src?.handedness === 'left' ? 'left' : 'right';
    if (!down) {
      if (c === orbHand) { releaseOrb(); return true; }
      if (c === barrierHand) { stopBarrier(); return true; }
      return false;
    }
    if (c === ctx.weaponHand) return false;
    // вторая рука уже держит хват перед животом — это волна ки, а не сфера
    if (palmUp(c, side) && !orbHand) {
      if (!spend('orb')) return false;
      orbHand = c;
      orbCharge = 0;
      heldOrb.visible = true;
      H.sound('charge');
      return true;
    }
    if (palmForward(c, side, ctx.fwd) && !barrierHand) {
      if (!spend('barrier')) return false;
      barrierHand = c;
      shield.visible = true;
      H.sound('barrier-up');
      return true;
    }
    return false;
  }

  // курок: у руки с оружием — ульта (если готова и зажаты оба хвата), у свободной — рисование руны
  function onTrigger(c, down, ctx = lastCtx) {
    if (!enabled || !ctx) return false;
    if (c === ctx.weaponHand) return down ? tryUlt(ctx) : false;
    if (down) {
      if (runeHand) return true;
      runeHand = c;
      recorder.begin(ctx.fwd);
      trailGeo.setDrawRange(0, 0);
      trail.material.opacity = 1;
      trail.visible = true;
      return true;
    }
    if (c !== runeHand) return false;
    runeHand = null;
    trailFade = 0.4;
    castRune(recorder.end(), c, ctx);
    return true;
  }

  // A в воздухе: прыжок от воздуха, до 3 раз
  function onJump(airborne, feet) {
    if (!enabled || !airborne || skyUsed >= SKY_MAX) return false;
    if (!spend('sky')) return false;
    skyUsed++;
    H.skyJump();
    skyRing.position.set(feet.x, feet.y + 0.02, feet.z);
    skyRing.scale.setScalar(1);
    skyRing.visible = true;
    skyT = 0;
    H.sound('flash-step');
    return true;
  }

  // ---------- ПК: навыки по клавишам (в шлеме — жестами) ----------
  // id: flash | orb | ki | focus | ult | shield | fireball | lightning
  const keyDir = new THREE.Vector3();
  function castKey(id, ctx) {
    if (!enabled || !ctx) return false;
    if (freeMana) mana = MAX_MANA;
    const head = ctx.headPos;
    keyDir.copy(ctx.dir).normalize();
    switch (id) {
      case 'flash': {
        // шаг вперёд по взгляду до 9 м на землю
        tmpB.set(keyDir.x, 0, keyDir.z);
        if (tmpB.lengthSq() < 1e-6) return false;
        tmpB.normalize();
        let ok = false;
        for (let d = 9; d >= 3; d -= 1.5) {
          const x = head.x + tmpB.x * d, z = head.z + tmpB.z * d;
          if (H.canStand ? H.canStand(x, z) : Math.hypot(x, z) <= (H.surfaces()?.radius || 11)) { flashTarget.set(x, ground(x, z), z); ok = true; break; }
        }
        if (!ok) { H.sound('rune-fail'); return false; }
        flashStep(tmpC.set(head.x, ctx.feetY ?? ground(head.x, head.z), head.z), head);
        return lastCast === 'flash';
      }
      case 'orb': {
        if (!spend('orb')) return false;
        tmpA.copy(head).addScaledVector(keyDir, 0.7);
        tmpA.y -= 0.15;
        launch(tmpA, tmpB.copy(keyDir).multiplyScalar(18), { radius: 2.6, power: 1.8, color: 0x7fd8ff, fire: false });
        lastCast = 'orb';
        H.sound('cast-orb');
        return true;
      }
      case 'ki': {
        if (cd.ki > 0) { H.sound('rune-fail'); return false; }
        kiBall.position.copy(head).addScaledVector(keyDir, 0.8);
        kiBall.position.y -= 0.2;
        fireKi({ left: null, right: null });
        return lastCast === 'ki';
      }
      case 'focus': {
        if (focusLeft > 0 || !spend('focus')) return false;
        focusLeft = FOCUS_TIME;
        H.sound('slowmo-in');
        H.notify('УСКОРЕНИЕ ВОСПРИЯТИЯ', '#b49cff');
        lastCast = 'focus';
        return true;
      }
      case 'ult': {
        if (ult01 < 1 || ultLeft > 0) { H.notify('Ульта ещё не готова', '#ffc46b'); return false; }
        ult01 = 0; ultLeft = ULT_TIME; mana = MAX_MANA; dome.visible = true;
        H.sound('ult'); H.notify('ПРОБУЖДЕНИЕ!', '#ffc46b'); H.hitstop(0.08);
        lastCast = 'ult';
        return true;
      }
      case 'shield': castRune('circle', camera, ctx); return lastCast === 'rune:circle';
      case 'fireball': castRune('triangle', camera, ctx); return lastCast === 'rune:triangle';
      case 'lightning': castRune('zigzag', camera, ctx); return lastCast === 'rune:zigzag';
    }
    return false;
  }

  function addCharge(points = 1) {
    if (!enabled || ultLeft > 0) return;
    const was = ult01;
    ult01 = Math.min(1, ult01 + 0.035 * points);
    if (was < 1 && ult01 >= 1) { H.notify('УЛЬТА ГОТОВА: оба хвата + курок', '#ffc46b'); H.sound('level-up'); }
  }

  function setEnabled(v) {
    enabled = !!v;
    root.visible = enabled;
    if (!enabled) reset();
  }

  function reset() {
    mana = MAX_MANA;
    focusLeft = 0; timeScale = 1;
    ultLeft = 0; dome.visible = false;
    flashAiming = false; arc.visible = targetRing.visible = false;
    if (orbHand) { orbHand = null; heldOrb.visible = false; }
    stopBarrier();
    bubbleLeft = 0; bubble.visible = false;
    runeHand = null; recorder.cancel(); trail.visible = false;
    kiState = 'idle'; kiBall.visible = false; beam.visible = false;
    for (const o of flying) o.mesh.visible = false;
    for (const g of ghosts) g.visible = false;
    for (const k in cd) cd[k] = 0;
  }

  const status = SKILLS.map((s) => ({ id: s.id, name: s.name, ready: true, cooldown01: 0 }));
  function skillStatus() {
    for (let i = 0; i < SKILLS.length; i++) {
      const s = SKILLS[i], st = status[i];
      st.cooldown01 = s.cooldown ? cd[s.id] / s.cooldown : 0;
      st.ready = cd[s.id] <= 0 && mana >= (s.id === 'rune' ? 15 : s.cost);
    }
    return status;
  }

  setEnabled(false);

  return {
    get enabled() { return enabled; },
    get mana() { return mana; },
    maxMana: MAX_MANA,
    get ult01() { return ult01; },
    get ultActive() { return ultLeft > 0; },
    get power() { return power(); },
    get timeScale() { return timeScale; },
    get focusActive() { return focusLeft > 0; },
    get flashAiming() { return flashAiming; },  // левый стик занят дугой — не ходить
    get drawing() { return !!runeHand; },
    get lastCast() { return lastCast; },
    get barrier() { return !!barrierHand; },
    get holdingOrb() { return !!orbHand; },
    get kiState() { return kiState; },
    quality: fxQuality,
    setEnabled, update, onSqueeze, onTrigger, onJump, addCharge, reset, skillStatus, castKey,
    get freeMana() { return freeMana; },
    set freeMana(v) { freeMana = !!v; if (freeMana) mana = MAX_MANA; },
    cooldown(id) { return cd[id] || 0; },
  };
}

// ---------- наруч-заглушка (пока нет js/fantasy/bracer.js): тот же API, что createBracer ----------
export function createFallbackBracer() {
  const W = 256, H = 200;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1 * H / W),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  mesh.rotation.x = -1.0;
  mesh.renderOrder = 10;
  const group = new THREE.Group();
  group.name = 'fantasy-bracer';
  group.position.set(0, 0.035, 0.13);
  group.add(mesh);
  let key = '', last = 0;

  function bar(x, y, w, h, v, color) {
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(x, y, w, h);
    g.fillStyle = color;
    g.fillRect(x, y, w * Math.max(0, Math.min(1, v)), h);
  }
  function update(info = {}) {
    const now = performance.now();
    if (now - last < 100) return; // 10 раз в секунду хватает
    const mana01 = (info.mana || 0) / (info.maxMana || 100);
    const sk = info.skills || [];
    const k = [Math.round(mana01 * 50), Math.round((info.ult01 || 0) * 20), info.score | 0, Math.ceil(info.timeLeft || 0),
      info.weapon?.name || '', Math.round((info.weapon?.mana01 ?? -1) * 20), info.fps | 0,
      ...sk.map((s) => (s.ready ? 1 : 0) + Math.round((s.cooldown01 || 0) * 8) * 2)].join('|');
    if (k === key) return;
    key = k; last = now;
    g.clearRect(0, 0, W, H);
    g.beginPath();
    g.roundRect ? g.roundRect(4, 4, W - 8, H - 8, 16) : g.rect(4, 4, W - 8, H - 8);
    g.fillStyle = 'rgba(20,12,40,0.72)';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = '#c9a2ff';
    g.stroke();
    g.font = `bold 20px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillStyle = '#9fe7ff';
    g.textAlign = 'left';
    g.fillText('МАНА', 16, 26);
    bar(84, 17, 156, 18, mana01, '#3ec5ff');
    g.fillStyle = '#ffc46b';
    g.fillText('УЛЬТА', 16, 54);
    bar(84, 45, 156, 18, info.ult01 || 0, (info.ult01 || 0) >= 1 ? '#ffd23f' : '#c08a3a');
    // навыки: кружки с откатом
    const n = sk.length, step = (W - 32) / Math.max(1, n);
    g.font = `bold 11px ${FONT}`;
    g.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      const s = sk[i], x = 16 + step * (i + 0.5), y = 92;
      g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2);
      g.fillStyle = s.ready ? 'rgba(127,233,255,0.85)' : 'rgba(90,90,120,0.6)';
      g.fill();
      if (s.cooldown01 > 0) {
        g.beginPath(); g.moveTo(x, y); g.arc(x, y, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.cooldown01);
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.fill();
      }
      g.fillStyle = '#e8edff';
      g.fillText(s.name.slice(0, 5), x, y + 22);
    }
    g.font = `bold 22px ${FONT}`;
    g.textAlign = 'left';
    g.fillStyle = '#ffffff';
    g.fillText(`${info.score | 0}`, 16, 146);
    g.textAlign = 'right';
    g.fillStyle = (info.timeLeft || 0) <= 10 ? '#ff5a6e' : '#9fe7ff';
    g.fillText(`${Math.ceil(info.timeLeft || 0)} с`, W - 16, 146);
    g.font = `16px ${FONT}`;
    g.textAlign = 'left';
    g.fillStyle = '#c9a2ff';
    g.fillText(info.weapon?.name || '', 16, 176, 150);
    g.textAlign = 'right';
    g.fillStyle = '#8f9bc8';
    g.fillText(`${info.fps | 0} FPS`, W - 16, 176);
    tex.needsUpdate = true;
  }
  return { group, update };
}

// ---------- FPS на наруче в «Реализме» (маленькая табличка рядом с наручным экраном) ----------
export function createFpsBadge() {
  const canvas = document.createElement('canvas');
  canvas.width = 96; canvas.height = 32;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.012),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  mesh.rotation.x = -1.0;
  mesh.position.set(0, 0.045, 0.168);
  mesh.renderOrder = 11;
  let shown = -1;
  return {
    mesh,
    update(fps) {
      const v = Math.round(fps);
      if (v === shown) return;
      shown = v;
      g.clearRect(0, 0, 96, 32);
      g.fillStyle = 'rgba(8,14,40,0.7)';
      g.fillRect(0, 0, 96, 32);
      g.font = `bold 20px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = v >= 70 ? '#34e89e' : v >= 55 ? '#ffd23f' : '#ff5a6e';
      g.fillText(`${v} FPS`, 48, 17);
      tex.needsUpdate = true;
    },
  };
}

// ---------- выбор режима под VR-меню (пока нет js/fantasy/ui.js) ----------
export function createModeSwitch() {
  const W = 512, H = 96;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false }));
  mesh.name = 'mode-switch';
  function set(mode) {
    g.clearRect(0, 0, W, H);
    const btn = (x, label, on, color) => {
      g.beginPath();
      g.roundRect ? g.roundRect(x + 6, 8, W / 2 - 12, H - 16, 36) : g.rect(x + 6, 8, W / 2 - 12, H - 16);
      g.fillStyle = on ? color : 'rgba(8,12,35,0.88)';
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = color;
      g.stroke();
      g.font = `bold 34px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = on ? '#10061f' : '#e8edff';
      g.fillText(label, x + W / 4, H / 2 + 1);
    };
    btn(0, '✦ Фэнтези', mode !== 'realism', '#c9a2ff');
    btn(W / 2, 'Реализм', mode === 'realism', '#3ec5ff');
    tex.needsUpdate = true;
  }
  set('fantasy');
  return { mesh, set, pick: (uv) => (uv ? (uv.x < 0.5 ? 'mode-fantasy' : 'mode-realism') : null) };
}
