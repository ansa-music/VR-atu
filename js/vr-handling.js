// VR: хват двумя руками, ручная перезарядка из подсумка и передёргивание затвора свободной рукой.
// Точки оружия — в координатах gun.group в покое (= body в guns.js): метры, вперёд −Z, вверх +Y.
// Ладонь перчатки в системе контроллера — GRIP (character.js); там же рукоять в оружейной руке.
import * as THREE from 'three';

const GRIP = new THREE.Vector3(0, -0.055, 0.075);
const FWD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);

const FORE_R = 0.10;      // радиус захвата цевья и пистолетной «чашки»
const RACK_R = 0.08;      // радиус захвата рукоятки затвора
const POUCH_R = 0.14;     // радиус подсумка
const INSERT_R = 0.08;    // верх магазина/патрона ближе к горловине — вставлен
const POUCH = [-0.10, -0.62, -0.14]; // от головы (с её поворотом по рысканию): влево, вниз, вперёд
const RACK_PULL = 0.05;   // оттянуть рукой назад вдоль +Z не меньше, м
const BOLT_LIFT = 0.015;  // СВ-98: первые 1,5 см хода руки — подъём рукоятки затвора
const CUP_BREAK = 0.16;   // пистолет: ладонь дальше от «чашки» — хват потерян
const BREAK_MIN = 0.45, BREAK_EXTRA = 0.2;   // цевьё: руки дальше max(0,45; плечо цевья + 0,2) — хват потерян
const MAX_COS = Math.cos((70 * Math.PI) / 180); // цевьё: рука ушла от исходного направления больше 70°
const SMOOTH = 0.025, SMOOTH_IN = 0.06, RETURN = 0.07; // постоянные сглаживания, с
const SPRING = 0.03;      // возврат затвора после отпускания, с
const DROP_TIME = 0.6, GRAV = 9.81;

// Точки оружия (сняты с геометрии guns.js и weapon.js):
//  fore — отрезок оси цевья: вторая рука берётся за ближайшую точку, ствол разворачивается на неё
//  cup  — пистолет: ладонь второй руки сбоку-снизу рукояти (x зеркалится к стороне руки), ствол не крутится
//  rack — рукоятка затвора: node — подвижный узел, p — точка хвата, travel — ход узла назад (+Z), м
//  well — горловина магазина (ружьё — окно заряжания под коробкой)
//  item — что достаётся из подсумка (клон узла 'mag'/'shell'); tip — «верх» предмета в его координатах,
//         он должен попасть в well; hold — точка предмета в ладони; tilt — наклон в кулаке вокруг X, рад
const POINTS = {
  pm: {
    cup: [0.042, -0.07, 0.07],                                  // ладонь сбоку и чуть ниже GRIP
    rack: { node: 'slide', p: [0, 0.006, 0.078], travel: 0.028 }, // насечки затвора z 0,063…0,085
    well: [0, -0.108, 0.093],                                   // низ рукояти, крышка магазина
    item: 'mag', tip: [0, 0.047, 0], hold: [0, -0.013, 0], tilt: -0.28, // коробка 0,094 по центру узла
  },
  ak: {
    fore: [[0, 0.02, -0.185], [0, 0.02, -0.335]],               // цевьё z −0,168…−0,345, ось AY−0,005
    rack: { node: 'handle', p: [0.032, 0.029, -0.09], travel: 0.105 }, // шарик рукоятки затворной рамы
    well: [0, -0.01, -0.047],                                   // низ коробки (RB −0,008) над magBase
    item: 'mag', tip: [0, 0, 0], hold: [0, -0.087, -0.021], tilt: -0.66, // рожок: ладонь в 9 см по дуге
  },
  shotgun: {
    fore: [[0, 0.0125, -0.245], [0, 0.0125, -0.41]],            // помпа z −0,225…−0,43 на оси магазина
    well: [0, -0.014, -0.066],                                  // окно заряжания (0, RB, −0,066)
    item: 'shell', tip: [0, 0, -0.035], hold: [0, -0.02, 0.045], tilt: 0, // патрон вперёд, донце в пальцах
  },
  sniper: {
    fore: [[0, 0, -0.16], [0, 0, -0.38]],                       // ложа z −0,005…−0,42, низ −0,022
    rack: { node: 'bolt', p: [0.047, 0.006, 0.0885], travel: 0.09, bolt: true }, // шар рукоятки затвора
    well: [0, -0.024, -0.058],                                  // низ ложи над magBase (0, −0,022, −0,058)
    item: 'mag', tip: [0, 0.023, 0], hold: [0, -0.025, 0], tilt: -0.28,
  },
  blaster: {
    fore: [[0, -0.02, -0.055], [0, -0.02, -0.11]],              // под передом корпуса (низ −0,002)
  },
};

const v3 = (a) => (a ? new THREE.Vector3().fromArray(a) : null);
const PTS = {};
for (const id in POINTS) {
  const p = POINTS[id];
  PTS[id] = {
    fore: p.fore ? [v3(p.fore[0]), v3(p.fore[1])] : null,
    cup: v3(p.cup),
    rack: p.rack ? { node: p.rack.node, p: v3(p.rack.p), travel: p.rack.travel, bolt: !!p.rack.bolt } : null,
    well: v3(p.well),
    item: p.item || null, tip: v3(p.tip), hold: v3(p.hold), tilt: p.tilt || 0,
  };
}

const EV = {
  mag: Object.freeze({ type: 'mag-inserted' }),
  shell: Object.freeze({ type: 'shell-inserted' }),
  rack: Object.freeze({ type: 'racked', ok: true }),
  rackDry: Object.freeze({ type: 'racked', ok: false }), // затвор передёрнут вхолостую
  gripOn: Object.freeze({ type: 'grip-on' }),
  gripOff: Object.freeze({ type: 'grip-off' }),
};

// запасные модели, если у оружия нет узла 'mag'/'shell'
let fbMag = null, fbShell = null;
function fallbackItem(kind) {
  if (kind === 'shell') {
    if (!fbShell) {
      const red = new THREE.CylinderGeometry(0.0102, 0.0102, 0.058, 14);
      red.rotateX(Math.PI / 2); red.translate(0, 0, -0.006);
      const brass = new THREE.CylinderGeometry(0.0108, 0.0108, 0.013, 14);
      brass.rotateX(Math.PI / 2); brass.translate(0, 0, 0.0295);
      fbShell = {
        red, brass,
        mr: new THREE.MeshStandardMaterial({ color: 0x9c1f1a, roughness: 0.5 }),
        mb: new THREE.MeshStandardMaterial({ color: 0xb8913f, metalness: 0.45, roughness: 0.3 }),
      };
    }
    const g = new THREE.Group();
    g.add(new THREE.Mesh(fbShell.red, fbShell.mr), new THREE.Mesh(fbShell.brass, fbShell.mb));
    return g;
  }
  if (!fbMag) {
    fbMag = {
      geo: new THREE.BoxGeometry(0.024, 0.09, 0.03),
      mat: new THREE.MeshStandardMaterial({ color: 0x1d2128, metalness: 0.8, roughness: 0.4 }),
    };
  }
  return new THREE.Mesh(fbMag.geo, fbMag.mat);
}

function pulse(c, intensity, ms) {
  try { c?.userData?.src?.gamepad?.hapticActuators?.[0]?.pulse(intensity, ms)?.catch?.(() => {}); } catch {}
}

const approach = (v, to, step) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));

export function createVrHandling({ scene = null, camera = null } = {}) {
  // временные объекты: в кадре ничего не создаём
  const _palm = new THREE.Vector3(), _loc = new THREE.Vector3(), _tmp = new THREE.Vector3(), _tmp2 = new THREE.Vector3();
  const _gp = new THREE.Vector3(), _gw = new THREE.Vector3(), _dir = new THREE.Vector3(), _a = new THREE.Vector3();
  const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _up = new THREE.Vector3();
  const _pp = new THREE.Vector3(), _ps = new THREE.Vector3(), _sd = new THREE.Vector3();
  const _head = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
  const _fgPt = new THREE.Vector3(), _cupPt = new THREE.Vector3();
  const _hv = new THREE.Vector3(), _prevPalm = new THREE.Vector3(), _drop = new THREE.Vector3();
  const _pq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
  const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();

  const events = [], queued = [];
  // что держит свободная рука: 'foregrip' | 'handle' | 'item'
  const st = { kind: null, hand: null, gun: null, weapon: null, id: '', t: 0 };
  const fg = { local: new THREE.Vector3(), rInv: new THREE.Quaternion(), reach: 0, pistol: false, cup: new THREE.Vector3() };
  const rk = { def: null, z0: 0, armed: false };
  // ход подвижной детали (затвор/рукоятка) — накладывается после gun.update
  const vis = { gun: null, node: null, bolt: false, travel: 0, p0z: 0, amt: 0, held: false };
  const item = { obj: null, tip: new THREE.Vector3() };
  const drops = [];
  for (let i = 0; i < 4; i++) drops.push({ obj: null, v: new THREE.Vector3(), w: new THREE.Vector3(), t: 0 });
  const rests = new Map();   // gun → исходные position/quaternion у gun.group
  const hooked = new Map();  // gun → исходный gun.update
  let posed = null;          // ствол, повёрнутый хватом (или ещё возвращающийся)
  let stab = 0, lastLeft = false, lastWeaponHand = null, prevHand = null;

  // ---------- координаты ----------
  function palmWorld(c, out) {
    c.updateWorldMatrix(true, false);
    return out.copy(GRIP).applyMatrix4(c.matrixWorld);
  }
  function toGunLocal(gun, world, out) {
    gun.group.updateWorldMatrix(true, false);
    _inv.copy(gun.group.matrixWorld).invert();
    return out.copy(world).applyMatrix4(_inv);
  }
  // ближайшая к p точка отрезка seg → out, возвращает расстояние
  function segClosest(p, seg, out) {
    const a = seg[0];
    _sd.subVectors(seg[1], a);
    const t = Math.min(1, Math.max(0, _tmp2.subVectors(p, a).dot(_sd) / _sd.lengthSq()));
    out.copy(a).addScaledVector(_sd, t);
    return p.distanceTo(out);
  }
  // подсумок на поясе спереди, со стороны свободной руки
  function pouchWorld(hand, out) {
    if (!camera) return null;
    camera.updateWorldMatrix(true, false);
    _head.setFromMatrixPosition(camera.matrixWorld);
    _fwd.set(0, 0, -1).transformDirection(camera.matrixWorld);
    const fy = _fwd.y;
    _fwd.y = 0;
    if (_fwd.lengthSq() < 0.04) { // смотрит вниз/вверх: вперёд — по «макушке» камеры
      _fwd.set(0, fy > 0 ? -1 : 1, 0).transformDirection(camera.matrixWorld);
      _fwd.y = 0;
    }
    if (_fwd.lengthSq() < 1e-8) _fwd.set(0, 0, -1);
    _fwd.normalize();
    _right.crossVectors(_fwd, UP);
    const hd = hand?.userData?.src?.handedness;
    const sx = hd === 'right' ? -1 : hd === 'left' ? 1 : lastLeft ? -1 : 1;
    return out.copy(_head)
      .addScaledVector(_right, POUCH[0] * sx)
      .addScaledVector(UP, POUCH[1])
      .addScaledVector(_fwd, -POUCH[2]);
  }

  // ---------- поза ствола ----------
  function saveRest(gun) {
    if (!rests.has(gun)) rests.set(gun, { p: gun.group.position.clone(), q: gun.group.quaternion.clone() });
  }
  function snapRest(gun) {
    const r = rests.get(gun);
    if (r) { gun.group.position.copy(r.p); gun.group.quaternion.copy(r.q); }
    if (posed === gun) posed = null;
  }
  // рукоять остаётся на месте в системе контроллера: position = рукоять − q·GRIP
  function placeAroundGrip(g, rest) {
    _gp.copy(GRIP).applyQuaternion(rest.q).add(rest.p);
    g.position.copy(GRIP).applyQuaternion(g.quaternion).negate().add(_gp);
  }
  function returnRest(dt) {
    const g = posed.group, rest = rests.get(posed);
    if (!rest) { posed = null; return; }
    g.quaternion.slerp(rest.q, 1 - Math.exp(-dt / RETURN));
    if (g.quaternion.angleTo(rest.q) < 0.002) { snapRest(posed); return; }
    placeAroundGrip(g, rest);
  }

  // подвижная деталь после анимации guns.js (она каждый кадр ставит узлы заново)
  function hook(gun) {
    if (!gun || hooked.has(gun) || typeof gun.update !== 'function') return;
    const orig = gun.update;
    hooked.set(gun, orig);
    gun.update = (dt, s) => {
      orig(dt, s);
      if (vis.gun === gun && vis.node && vis.amt > 0) applyVis();
    };
  }
  function applyVis() {
    const n = vis.node, a = vis.amt;
    if (vis.bolt) {
      n.rotation.z = Math.max(n.rotation.z, 1.2 * Math.min(1, a / BOLT_LIFT));
      n.position.z = Math.max(n.position.z, vis.p0z + Math.min(vis.travel, Math.max(0, a - BOLT_LIFT)));
    } else {
      n.position.z = Math.max(n.position.z, vis.p0z + Math.min(vis.travel, a));
    }
  }

  // ---------- состояние ----------
  function clearState() {
    st.kind = null; st.hand = null; st.gun = null; st.weapon = null; st.id = ''; st.t = 0;
    rk.def = null; rk.armed = false;
  }
  function endForegrip() {
    queued.push(EV.gripOff);
    clearState();
  }
  function endRack() {
    vis.held = false;
    clearState();
  }
  function finishRack() {
    const w = st.weapon;
    const ok = !!(w && typeof w.manualRack === 'function' && w.manualRack());
    queued.push(ok ? EV.rack : EV.rackDry);
    pulse(st.hand, 0.5, 40);
    pulse(lastWeaponHand, 0.5, 40);
    endRack();
  }
  function cancel() {
    if (st.kind === 'foregrip') endForegrip();
    else if (st.kind === 'handle') endRack();
    else if (st.kind === 'item') dropItem();
    else clearState();
  }

  // ---------- предметы из подсумка ----------
  function canLoad(w) {
    if (!w || !w.def || w.reserve <= 0 || w.mag >= w.def.mag) return false;
    if (w.def.action === 'pump') return typeof w.manualInsertShell === 'function';
    return !!w.magFed && typeof w.manualMagSwap === 'function';
  }
  function spawnItem(hand, gun, P) {
    const src = gun?.group?.getObjectByName(P.item);
    let obj;
    if (src) {
      obj = src.clone(true); // геометрия и материалы общие с оружием (вместе со скином)
      obj.position.set(0, 0, 0); obj.rotation.set(0, 0, 0); obj.scale.set(1, 1, 1);
      obj.visible = true;
      item.tip.copy(P.tip); _tmp2.copy(P.hold);
    } else {
      obj = fallbackItem(P.item);
      if (P.item === 'shell') { item.tip.copy(P.tip); _tmp2.copy(P.hold); }
      else { item.tip.set(0, 0.045, 0); _tmp2.set(0, -0.01, 0); }
    }
    obj.name = 'held-' + P.item;
    obj.quaternion.setFromAxisAngle(AXIS_X, P.tilt);
    obj.position.copy(GRIP).sub(_tmp2.applyQuaternion(obj.quaternion));
    hand.add(obj);
    item.obj = obj;
  }
  function startDrop(obj, v) {
    if (!scene) { obj.removeFromParent(); return; }
    let slot = null, oldest = drops[0];
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (!d.obj) { slot = d; break; }
      if (d.t > oldest.t) oldest = d;
    }
    if (!slot) { slot = oldest; slot.obj.removeFromParent(); }
    scene.attach(obj);
    slot.obj = obj;
    slot.v.copy(v);
    slot.t = 0;
    slot.w.set(Math.random() * 6 - 3, Math.random() * 4 - 2, Math.random() * 6 - 3);
  }
  function updateDrops(dt) {
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (!d.obj) continue;
      d.t += dt;
      if (d.t >= DROP_TIME) { d.obj.removeFromParent(); d.obj = null; continue; }
      d.v.y -= GRAV * dt;
      d.obj.position.addScaledVector(d.v, dt);
      d.obj.rotation.x += d.w.x * dt;
      d.obj.rotation.y += d.w.y * dt;
      d.obj.rotation.z += d.w.z * dt;
    }
  }
  // отпустили не у оружия: предмет падает (отпустили сразу же — просто исчезает)
  function dropItem() {
    const obj = item.obj;
    item.obj = null;
    if (obj) {
      if (st.t < 0.05) obj.removeFromParent();
      else startDrop(obj, _hv);
    }
    clearState();
  }
  function updateItem(gun, weapon) {
    const P = PTS[st.id];
    if (!item.obj || !P || !P.well || !gun?.group?.visible || !weapon) return;
    item.obj.updateWorldMatrix(true, false);
    _tmp.copy(item.tip).applyMatrix4(item.obj.matrixWorld);
    gun.group.updateWorldMatrix(true, false);
    _tmp2.copy(P.well).applyMatrix4(gun.group.matrixWorld);
    if (_tmp.distanceToSquared(_tmp2) > INSERT_R * INSERT_R) return;
    const shell = P.item === 'shell';
    const ok = shell
      ? typeof weapon.manualInsertShell === 'function' && weapon.manualInsertShell()
      : typeof weapon.manualMagSwap === 'function' && weapon.manualMagSwap();
    if (!ok) return;
    queued.push(shell ? EV.shell : EV.mag);
    pulse(st.hand, 0.6, 50);
    pulse(lastWeaponHand, 0.6, 50);
    const obj = item.obj;
    item.obj = null;
    // тот же объект выпадает из горловины как старый магазин
    const src = shell ? null : gun.group.getObjectByName('mag');
    if (src && src.parent && scene) {
      src.parent.add(obj);
      obj.position.copy(src.position);
      obj.quaternion.copy(src.quaternion);
      obj.scale.copy(src.scale);
      startDrop(obj, _drop.set(0, -0.5, 0));
    } else {
      obj.removeFromParent();
    }
    clearState();
  }

  // ---------- хват двумя руками ----------
  // false — хват потерян
  function updateForegrip(dt, offHand) {
    const gun = st.gun, g = gun.group;
    if (!g.visible || !g.parent) return false;
    palmWorld(offHand, _palm);
    if (fg.pistol) {
      toGunLocal(gun, _palm, _loc);
      return _loc.distanceTo(fg.cup) < CUP_BREAK;
    }
    const rest = rests.get(gun);
    if (!rest) return false;
    const parent = g.parent;
    parent.updateWorldMatrix(true, false);
    parent.matrixWorld.decompose(_pp, _pq, _ps);
    _gp.copy(GRIP).applyQuaternion(rest.q).add(rest.p);   // рукоять в системе контроллера
    _gw.copy(_gp).applyMatrix4(parent.matrixWorld);       // и в мире
    _dir.subVectors(_palm, _gw);
    const dist = _dir.length();
    if (dist < 0.06 || dist > Math.max(BREAK_MIN, fg.reach + BREAK_EXTRA)) return false;
    _dir.divideScalar(dist);
    _rq.copy(_pq).multiply(rest.q);                        // ствол в покое, мир
    _a.subVectors(fg.local, GRIP).normalize().applyQuaternion(_rq);
    if (_a.dot(_dir) < MAX_COS) return false;
    // базис: цевьё на ладонь второй руки, крен — от оружейной руки
    _up.copy(UP).applyQuaternion(_rq);
    _z.copy(_dir).negate();
    _x.crossVectors(_up, _z);
    if (_x.lengthSq() < 1e-6) _x.copy(AXIS_X).applyQuaternion(_rq);
    _x.normalize();
    _y.crossVectors(_z, _x);
    _m.makeBasis(_x, _y, _z);
    _q.setFromRotationMatrix(_m).multiply(fg.rInv);        // мировой поворот gun.group
    _q.premultiply(_qi.copy(_pq).invert());                // → в систему контроллера
    const tau = st.t < 0.12 ? SMOOTH_IN : SMOOTH;
    g.quaternion.slerp(_q, 1 - Math.exp(-dt / tau));
    placeAroundGrip(g, rest);
    return true;
  }

  // ---------- затвор ----------
  function updateRack() {
    const gun = st.gun;
    if (!gun.group.visible) { endRack(); return; }
    palmWorld(st.hand, _palm);
    toGunLocal(gun, _palm, _loc);
    const p = rk.def.p;
    const pull = Math.max(0, _loc.z - rk.z0);
    vis.amt = Math.min(pull, vis.travel + (vis.bolt ? BOLT_LIFT : 0));
    if (!rk.armed && pull >= RACK_PULL) { rk.armed = true; pulse(st.hand, 0.3, 20); }
    if (rk.armed && pull < RACK_PULL * 0.4) { finishRack(); return; } // толкнули вперёд
    // рука ушла от оружия: если успели оттянуть — досылаем
    if (Math.hypot(_loc.x - p.x, _loc.y - p.y) > 0.2 || pull > 0.35) {
      if (rk.armed) finishRack(); else endRack();
    }
  }

  // скорость ладони — для броска предмета
  function trackHand(hand, dt) {
    if (!hand) { prevHand = null; _hv.set(0, 0, 0); return; }
    palmWorld(hand, _tmp);
    if (prevHand === hand && dt > 0) {
      _hv.subVectors(_tmp, _prevPalm).divideScalar(dt);
      if (_hv.lengthSq() > 64) _hv.setLength(8);
    } else _hv.set(0, 0, 0);
    _prevPalm.copy(_tmp);
    prevHand = hand;
  }

  // ---------- API ----------
  function grab(hand, { gun = null, weaponHand = null, weapon = null } = {}) {
    if (!hand || hand === weaponHand) return null;
    if (st.hand === hand) release(hand);
    if (st.kind) cancel();
    const id = weapon?.def?.id || gun?.id || '';
    const P = PTS[id];
    if (!P) return null;
    if (weaponHand) lastWeaponHand = weaponHand;
    palmWorld(hand, _palm);

    // ближайшая точка в долях её радиуса
    let best = null, score = 1;
    if (gun?.group?.visible && weaponHand) {
      toGunLocal(gun, _palm, _loc);
      if (P.fore) {
        const d = segClosest(_loc, P.fore, _tmp) / FORE_R;
        if (d < score) { score = d; best = 'fore'; _fgPt.copy(_tmp); }
      }
      if (P.cup) {
        const side = Math.abs(_loc.x) > 0.005 ? Math.sign(_loc.x) : hand.userData?.src?.handedness === 'right' ? 1 : -1;
        _tmp.copy(P.cup); _tmp.x *= side;
        const d = _loc.distanceTo(_tmp) / FORE_R;
        if (d < score) { score = d; best = 'cup'; _cupPt.copy(_tmp); }
      }
      if (P.rack && weapon?.magFed && typeof weapon.manualRack === 'function') {
        const d = _loc.distanceTo(P.rack.p) / RACK_R;
        if (d < score) { score = d; best = 'rack'; }
      }
    }
    if (P.item && canLoad(weapon) && pouchWorld(hand, _tmp)) {
      const d = _palm.distanceTo(_tmp) / POUCH_R;
      if (d < score) { score = d; best = 'pouch'; }
    }
    if (!best) return null;

    st.hand = hand; st.gun = gun; st.weapon = weapon; st.id = id; st.t = 0;
    if (best === 'fore' || best === 'cup') {
      fg.pistol = best === 'cup';
      if (fg.pistol) fg.cup.copy(_cupPt);
      else {
        fg.local.copy(_fgPt);
        fg.reach = fg.local.distanceTo(GRIP);
        _a.subVectors(fg.local, GRIP).normalize();
        fg.rInv.setFromUnitVectors(FWD, _a).invert();
        if (posed !== gun) { if (posed) snapRest(posed); saveRest(gun); posed = gun; }
      }
      st.kind = 'foregrip';
      queued.push(EV.gripOn);
      pulse(hand, 0.25, 25);
      return 'foregrip';
    }
    if (best === 'rack') {
      rk.def = P.rack; rk.z0 = _loc.z; rk.armed = false;
      const node = gun.group.getObjectByName(P.rack.node) || null;
      hook(gun);
      vis.gun = gun; vis.node = node; vis.bolt = P.rack.bolt; vis.travel = P.rack.travel;
      vis.p0z = node ? (node.userData.p0 ? node.userData.p0.z : node.position.z) : 0;
      vis.amt = 0; vis.held = true;
      st.kind = 'handle';
      pulse(hand, 0.3, 20);
      return 'handle';
    }
    spawnItem(hand, gun, P);
    st.kind = 'item';
    pulse(hand, 0.35, 30);
    return 'pouch';
  }

  function release(hand) {
    if (!hand || hand !== st.hand) return;
    if (st.kind === 'foregrip') endForegrip();
    else if (st.kind === 'handle') { if (rk.armed) finishRack(); else endRack(); }
    else if (st.kind === 'item') dropItem();
  }

  function update(dt, { gun = null, weaponHand = null, offHand = null, weapon = null, enabled = true, leftHanded = false } = {}) {
    events.length = 0;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    lastLeft = !!leftHanded;
    if (weaponHand) lastWeaponHand = weaponHand;
    const id = weapon?.def?.id || gun?.id || '';

    // сменилось оружие или руки — всё отпускаем
    if (st.kind) {
      const lost = !offHand || st.hand !== offHand || !weaponHand
        || (st.kind === 'item' ? st.id !== id : st.gun !== gun);
      if (lost) cancel();
    }
    if (posed && posed !== gun) snapRest(posed); // чужой ствол сразу на место

    if (st.kind) st.t += dt;
    if (st.kind === 'foregrip') {
      if (!enabled || !updateForegrip(dt, offHand)) endForegrip();
    } else if (st.kind === 'handle') {
      if (!enabled) endRack(); else updateRack();
    } else if (st.kind === 'item') {
      if (enabled) updateItem(gun, weapon);
    }
    if (posed && !(st.kind === 'foregrip' && !fg.pistol)) returnRest(dt);

    if (vis.gun && !vis.held) {
      vis.amt *= Math.exp(-dt / SPRING);
      if (vis.amt < 5e-4) { vis.amt = 0; vis.gun = null; vis.node = null; }
    }
    updateDrops(dt);
    const twoHand = st.kind === 'foregrip';
    stab = approach(stab, twoHand ? 1 : 0, dt / (twoHand ? 0.12 : 0.08));
    trackHand(offHand, dt);

    for (let i = 0; i < queued.length; i++) events.push(queued[i]);
    queued.length = 0;
    return events;
  }

  function dispose() {
    if (item.obj) { item.obj.removeFromParent(); item.obj = null; }
    clearState();
    vis.gun = null; vis.node = null; vis.amt = 0; vis.held = false;
    if (posed) snapRest(posed);
    for (let i = 0; i < drops.length; i++) {
      if (drops[i].obj) { drops[i].obj.removeFromParent(); drops[i].obj = null; }
    }
    for (const [gun, orig] of hooked) gun.update = orig;
    hooked.clear();
    rests.clear();
    events.length = 0;
    queued.length = 0;
    stab = 0;
  }

  return {
    grab, release, update, dispose,
    get twoHand() { return st.kind === 'foregrip'; },
    get stability() { return stab; },
    // что держит свободная рука: 'foregrip' | 'handle' | 'pouch' | null
    get grabbed() { return st.kind === 'item' ? 'pouch' : st.kind; },
  };
}
