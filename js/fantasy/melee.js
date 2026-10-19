// Клинок души: удары взмахом в VR и волна-полумесяц.
// Скорость кончика считается по смещению за кадр; удар — пересечение лезвия,
// «прометённого» между кадрами (несколько отрезков от прежнего положения к новому), с целями.
import * as THREE from 'three';

const SAMPLES = 8;            // точек вдоль лезвия (шаг ~10 см)
const HIT_COOLDOWN = 0.35;    // с, одна цель не получает два удара за взмах
const MAX_HITS = 8;

const _tip = new THREE.Vector3();
const _base = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _m3 = new THREE.Matrix3();
const _found = [];

function worldPos(o, out) {
  if (o.isVector3) return out.copy(o);
  o.updateWorldMatrix?.(true, false);
  return out.setFromMatrixPosition(o.matrixWorld);
}

// opts: minSpeed — с какой скорости кончика (м/с) взмах бьёт; fullSpeed — сила 1; waveSpeed — порог волны
export function createMelee({ minSpeed = 2, fullSpeed = 7, waveSpeed = 6, waveCooldown = 0.6 } = {}) {
  const raycaster = new THREE.Raycaster();
  const prevTip = new THREE.Vector3();
  const prevBase = new THREE.Vector3();
  const vel = new THREE.Vector3();          // сглаженная скорость кончика, м/с
  const hits = [];
  const pool = [];
  for (let i = 0; i < MAX_HITS; i++) pool.push({ object: null, instanceId: undefined, point: new THREE.Vector3(), strength: 0, dir: new THREE.Vector3() });
  const recent = new Map();                 // ключ цели → время до следующего удара
  const waveObj = { origin: new THREE.Vector3(), dir: new THREE.Vector3(), up: new THREE.Vector3(), power: 0 };
  let has = false, time = 0, waveCd = 0, peak = 0;

  const melee = {
    tipSpeed: 0,
    wave: null,                             // { origin, dir, up, power } в кадр сильного взмаха
    segment: { from: new THREE.Vector3(), to: new THREE.Vector3() }, // путь кончика за кадр (для разрубания снарядов)

    // blade — модель клинка (tip, base | group), hand — не обязательна, hittables — Mesh[]/InstancedMesh[]
    // → [{ object, instanceId, point, strength 0..1, dir }] (массив и объекты переиспользуются)
    update(dt, { blade, hand, hittables } = {}) {
      hits.length = 0;
      melee.wave = null;
      if (!blade || !blade.tip || !(dt > 0)) { has = false; return hits; }
      time += dt;
      waveCd = Math.max(0, waveCd - dt);
      for (const [k, t] of recent) if (t <= time) recent.delete(k);

      worldPos(blade.tip, _tip);
      worldPos(blade.base || blade.group, _base);
      if (!has) { prevTip.copy(_tip); prevBase.copy(_base); melee.segment.from.copy(_tip); melee.segment.to.copy(_tip); has = true; return hits; }

      _dir.subVectors(_tip, prevTip);
      const step = _dir.length();
      const inst = step / dt;
      vel.lerp(_dir.divideScalar(dt), Math.min(1, dt * 30));
      melee.tipSpeed = inst;
      melee.segment.from.copy(prevTip);
      melee.segment.to.copy(_tip);
      const strength = Math.max(0, Math.min(1, (inst - minSpeed) / (fullSpeed - minSpeed)));

      if (inst >= minSpeed && hittables && hittables.length) {
        // от прежнего положения лезвия к новому: SAMPLES отрезков от гарды до кончика
        // + последний отрезок: само лезвие в новом положении (укол)
        for (let i = 0; i <= SAMPLES && hits.length < MAX_HITS; i++) {
          const u = (i + 1) / SAMPLES;
          if (i < SAMPLES) { _a.lerpVectors(prevBase, prevTip, u); _b.lerpVectors(_base, _tip, u); }
          else { _a.copy(_base); _b.copy(_tip); }
          _dir.subVectors(_b, _a);
          const len = _dir.length();
          if (len < 1e-4) continue;
          raycaster.set(_a, _dir.divideScalar(len));
          raycaster.far = len + 0.05;
          _found.length = 0;
          raycaster.intersectObjects(hittables, false, _found);
          for (let j = 0; j < _found.length && hits.length < MAX_HITS; j++) {
            const f = _found[j];
            if (!f.object.visible) continue;
            const key = f.object.id * 4096 + (f.instanceId ?? 4095);
            if (recent.has(key)) continue;
            recent.set(key, time + HIT_COOLDOWN);
            const h = pool[hits.length];
            h.object = f.object; h.instanceId = f.instanceId; h.point.copy(f.point);
            h.strength = Math.max(0.25, strength); h.dir.copy(_dir);
            hits.push(h);
          }
        }
        _found.length = 0;
      }

      // волна: пик скорости выше порога — выпускаем на спаде (конец взмаха)
      if (inst > peak) peak = inst;
      if (peak >= waveSpeed && inst < peak * 0.6 && waveCd <= 0) {
        _m3.setFromMatrix4(blade.group.matrixWorld);
        _fwd.set(0, 0, -1).applyMatrix3(_m3).normalize();   // куда смотрит лезвие
        const w = waveObj;
        w.origin.copy(_tip);
        // волна летит вперёд по лезвию, полумесяц лежит в плоскости взмаха
        w.dir.copy(_fwd).addScaledVector(_a.copy(vel).normalize(), 0.35).normalize();
        w.up.copy(vel).normalize();
        w.power = Math.min(1, peak / (waveSpeed * 1.5));
        melee.wave = w;
        waveCd = waveCooldown;
        peak = 0;
      } else if (inst < minSpeed) {
        peak = 0;
      }
      prevTip.copy(_tip); prevBase.copy(_base);
      return hits;
    },

    reset() { has = false; peak = 0; recent.clear(); hits.length = 0; melee.wave = null; vel.set(0, 0, 0); },
  };
  return melee;
}

// ---------- Волны-полумесяцы: полёт и попадания (один InstancedMesh) ----------
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _mx = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _p = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export function createSlashWaves(scene, { quality, cap = 6, color = 0x7fd8ff } = {}) {
  const low = quality?.id === 'low';
  const geo = new THREE.TorusGeometry(0.8, 0.045, low ? 4 : 6, low ? 16 : 28, Math.PI * 0.85);
  geo.rotateZ(Math.PI * 0.075);   // дуга симметрична вокруг +Y
  geo.translate(0, -0.55, 0);      // центр — у середины дуги
  geo.rotateX(-Math.PI / 2);       // дуга в плоскости XZ, выпуклостью вперёд (−Z), концы по ±X
  geo.scale(1, 0.35, 1);           // плоская
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = cap;
  mesh.visible = false;
  mesh.raycast = () => {};
  for (let i = 0; i < cap; i++) mesh.setMatrixAt(i, ZERO);
  scene.add(mesh);

  const raycaster = new THREE.Raycaster();
  const list = [];
  for (let i = 0; i < cap; i++) {
    list.push({ alive: false, pos: new THREE.Vector3(), dir: new THREE.Vector3(), up: new THREE.Vector3(), speed: 0, left: 0, power: 0, damage: 0, width: 1.6, hitIds: new Array(8).fill(-1), nHits: 0 });
  }
  const hitEv = { wave: null, object: null, instanceId: undefined, point: new THREE.Vector3(), damage: 0 };

  return {
    mesh, list,
    // wave — из createMelee().wave; def — описание клинка (def.wave: speed, damage, range, width)
    spawn(wave, def = {}) {
      let w = list.find((x) => !x.alive) || list[0];
      w.alive = true;
      w.pos.copy(wave.origin);
      w.dir.copy(wave.dir).normalize();
      // «верх» полумесяца перпендикулярен полёту
      w.up.copy(wave.up).addScaledVector(w.dir, -w.up.dot(w.dir));
      if (w.up.lengthSq() < 1e-6) w.up.set(0, 1, 0);
      w.up.normalize();
      w.speed = def.speed ?? 16;
      w.left = def.range ?? 30;
      w.power = wave.power ?? 1;
      w.damage = (def.damage ?? 3) * (0.6 + 0.4 * w.power);
      w.width = (def.width ?? 1.6) * (0.7 + 0.3 * w.power);
      w.nHits = 0;
      mesh.visible = true;
      return w;
    },
    // onHit(ev) на каждое новое попадание: ev = { wave, object, instanceId, point, damage }
    update(dt, { hittables, onHit, timeScale = 1 } = {}) {
      let any = false;
      for (let i = 0; i < list.length; i++) {
        const w = list[i];
        if (!w.alive) { mesh.setMatrixAt(i, ZERO); continue; }
        const step = Math.min(w.left, w.speed * dt * timeScale);
        // три луча по ширине полумесяца
        if (hittables?.length && step > 0) {
          for (let r = -1; r <= 1; r++) {
            _p.copy(w.pos).addScaledVector(w.up, r * w.width * 0.4);
            raycaster.set(_p, w.dir);
            raycaster.far = step;
            _found.length = 0;
            raycaster.intersectObjects(hittables, false, _found);
            for (let j = 0; j < _found.length; j++) {
              const f = _found[j];
              const id = f.object.id * 4096 + (f.instanceId ?? 4095);
              if (w.hitIds.indexOf(id) >= 0 || w.nHits >= w.hitIds.length) continue;
              w.hitIds[w.nHits++] = id;
              hitEv.wave = w; hitEv.object = f.object; hitEv.instanceId = f.instanceId;
              hitEv.point.copy(f.point); hitEv.damage = w.damage;
              onHit?.(hitEv);
            }
          }
          _found.length = 0;
        }
        w.pos.addScaledVector(w.dir, step);
        w.left -= step;
        if (w.left <= 0) { w.alive = false; mesh.setMatrixAt(i, ZERO); continue; }
        any = true;
        // ориентация: X модели → up (плоскость взмаха), −Z → dir
        _p.copy(w.dir).negate();
        _x.crossVectors(_p, w.up).normalize();
        _mx.makeBasis(w.up, _x, _p);
        _q.setFromRotationMatrix(_mx);
        const k = w.width / 1.6 * (1 + 0.25 * (1 - w.left / 30));
        _s.set(k, k, k);
        _mx.compose(w.pos, _q, _s);
        mesh.setMatrixAt(i, _mx);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = any;
    },
    clear() { for (const w of list) w.alive = false; mesh.visible = false; },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}
