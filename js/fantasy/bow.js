// Лук рун: натяжение тетивы свободной рукой.
// Свободная рука хватает тетиву у точки натяжения (bow.string), тянет назад вдоль лука;
// сила 0..1 = оттяжка / длина натяжения. Стрела летит от руки к луку (как у настоящего лука).
import * as THREE from 'three';

const _rest = new THREE.Vector3();
const _hand = new THREE.Vector3();
const _back = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _m = new THREE.Matrix3();

function worldPos(o, out) {
  if (!o) return null;
  if (o.isVector3) return out.copy(o);
  o.updateWorldMatrix?.(true, false);
  return out.setFromMatrixPosition(o.matrixWorld);
}

// opts: length — полное натяжение, м; min — минимальная сила для выстрела; grab — радиус захвата тетивы, м
export function createBowController({ length = 0.55, min = 0.12, grab = 0.14, slack = 0.25 } = {}) {
  const release = { power: 0, origin: new THREE.Vector3(), dir: new THREE.Vector3() };
  let prevDrawing = false;
  let lastBow = null;

  const ctl = {
    draw01: 0,       // текущее натяжение 0..1
    nocked: false,   // тетива в руке
    near: false,     // рука у тетивы (подсказка/вибрация)
    ticks: 0,        // число «щелчков» натяжения (каждые 10 %) — для вибрации
    origin: release.origin, dir: release.dir,  // куда полетит стрела сейчас (для руны-прицела)

    // Возвращает { power, origin, dir } в кадр, когда тетиву отпустили с силой ≥ min, иначе null.
    // bow — модель из createFantasyGun('bow') (нужны group, string, muzzle; setDraw — по возможности),
    // bowHand — рука с луком (не обязательна), drawHand — Object3D или Vector3 свободной руки,
    // drawing — зажат хват/курок свободной руки.
    update(dt, { bow, bowHand, drawHand, drawing } = {}) {
      if (!bow || !bow.string || !drawHand) { ctl.cancel(); prevDrawing = !!drawing; return null; }
      if (bow !== lastBow) { ctl.cancel(); lastBow = bow; }
      const s = bow.string;
      // точка покоя тетивы в координатах group — запоминаем один раз
      if (!s.userData.restLocal) s.userData.restLocal = s.position.clone();
      bow.group.updateWorldMatrix(true, false);
      _rest.copy(s.userData.restLocal).applyMatrix4(bow.group.matrixWorld);
      _m.setFromMatrix4(bow.group.matrixWorld);
      _back.set(0, 0, 1).applyMatrix3(_m).normalize(); // «назад» вдоль лука (+Z модели)
      worldPos(drawHand, _hand);

      const dist = _hand.distanceTo(_rest);
      ctl.near = dist < grab;
      const pressed = !!drawing && !prevDrawing;
      prevDrawing = !!drawing;

      if (!ctl.nocked) {
        if (pressed && ctl.near) { ctl.nocked = true; ctl.ticks = 0; }
        else { setDraw(bow, 0); return null; }
      }

      // натяжение = проекция руки на ось «назад»
      const d = _tmp.subVectors(_hand, _rest).dot(_back);
      const k = Math.max(0, Math.min(1, d / length));
      ctl.draw01 = k;
      const tick = Math.floor(k * 10);
      if (tick > ctl.ticks) ctl.ticks = tick;
      setDraw(bow, k);

      // направление стрелы: от руки к точке вылета на луке
      const from = bow.muzzle ? worldPos(bow.muzzle, release.origin) : release.origin.copy(_rest).addScaledVector(_back, -0.18);
      release.dir.subVectors(from, _hand);
      if (k < 0.05 || release.dir.lengthSq() < 1e-6) release.dir.copy(_back).negate();
      release.dir.normalize();

      // рука ушла слишком далеко от тетивы вбок — тетива срывается
      const lateral = _tmp.subVectors(_hand, _rest).addScaledVector(_back, -d).length();
      const slipped = lateral > slack + 0.1 || d > length + slack;
      if (!drawing || slipped) {
        const power = slipped ? 0 : k;
        ctl.nocked = false;
        ctl.draw01 = 0;
        ctl.ticks = 0;
        setDraw(bow, 0);
        if (power < min) return null;
        release.power = power;
        return release;
      }
      return null;
    },

    cancel() {
      ctl.nocked = false; ctl.draw01 = 0; ctl.ticks = 0; ctl.near = false;
      if (lastBow) setDraw(lastBow, 0);
    },
  };
  return ctl;
}

function setDraw(bow, k) {
  if (bow.setDraw) bow.setDraw(k);
  else if (bow.string?.userData.restLocal) bow.string.position.copy(bow.string.userData.restLocal).z += k * 0.55;
}
