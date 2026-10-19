// Жесты руками в шлеме: распознавание рун (круг, треугольник, зигзаг, спираль),
// позы ладони, скорость руки, поза «волна ки». Без аллокаций в кадре.
import * as THREE from 'three';

// ---------- руны ----------
const N = 32;             // точек после передискретизации
const MAX_POINTS = 160;   // точек в записи
const MIN_SIZE = 0.12;    // м: меньше — случайное движение, а не знак
const CORNER = 0.95;      // рад: резкий излом (~55°)

const rx = new Float32Array(N), ry = new Float32Array(N);

// равномерно по длине пути
function resample(xs, ys, n, len) {
  const step = len / (N - 1);
  rx[0] = xs[0]; ry[0] = ys[0];
  let k = 1, acc = 0;
  let px = xs[0], py = ys[0];
  for (let i = 1; i < n && k < N; i++) {
    let qx = xs[i], qy = ys[i];
    let d = Math.hypot(qx - px, qy - py);
    while (acc + d >= step && k < N && d > 0) {
      const t = (step - acc) / d;
      px += (qx - px) * t; py += (qy - py) * t;
      rx[k] = px; ry[k] = py; k++;
      d = Math.hypot(qx - px, qy - py);
      acc = 0;
    }
    acc += d; px = qx; py = qy;
  }
  for (; k < N; k++) { rx[k] = xs[n - 1]; ry[k] = ys[n - 1]; }
}

// xs, ys — плоские координаты (м), n — сколько точек. → 'circle' | 'triangle' | 'zigzag' | 'spiral' | null
export function recognizeRune(xs, ys, n = xs.length) {
  if (n < 8) return null;
  let len = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (i) len += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]);
    minY = Math.min(minY, ys[i]); maxY = Math.max(maxY, ys[i]);
  }
  const size = Math.max(maxX - minX, maxY - minY);
  if (size < MIN_SIZE || len < size * 1.25) return null;
  resample(xs, ys, n, len);

  const closure = Math.hypot(rx[N - 1] - rx[0], ry[N - 1] - ry[0]) / size;
  // повороты между соседними отрезками; у замкнутой фигуры — ещё излом в точке старта
  let turn = 0, corners = 0, signFlips = 0, lastCornerSign = 0;
  let prevD = 0; // излом — резкий поворот за 1–2 шага
  const first = Math.atan2(ry[1] - ry[0], rx[1] - rx[0]);
  let prevA = first;
  const step = (a) => {
    let d = a - prevA;
    if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
    prevA = a;
    turn += d;
    const run = d + prevD;
    prevD = d;
    if (Math.abs(run) > CORNER) {
      corners++;
      const s = Math.sign(run);
      if (lastCornerSign && s !== lastCornerSign) signFlips++;
      lastCornerSign = s;
      prevD = 0;
    }
  };
  for (let i = 1; i + 1 < N; i++) {
    if (Math.hypot(rx[i + 1] - rx[i], ry[i + 1] - ry[i]) < 1e-5) continue;
    step(Math.atan2(ry[i + 1] - ry[i], rx[i + 1] - rx[i]));
  }
  if (closure < 0.25) step(first);
  const absTurn = Math.abs(turn);

  // спираль: больше полутора оборотов, радиус заметно меняется
  if (absTurn > 3 * Math.PI) {
    let cx = 0, cy = 0;
    for (let i = 0; i < N; i++) { cx += rx[i]; cy += ry[i]; }
    cx /= N; cy /= N;
    const r0 = Math.hypot(rx[0] - cx, ry[0] - cy), r1 = Math.hypot(rx[N - 1] - cx, ry[N - 1] - cy);
    if (Math.abs(r0 - r1) > size * 0.18) return 'spiral';
  }
  // зигзаг: открытая линия, изломы в разные стороны
  if (closure > 0.45 && corners >= 2 && signFlips >= 1 && absTurn < 2 * Math.PI) return 'zigzag';
  // замкнутые фигуры: около одного оборота
  if (closure < 0.4 && absTurn > 1.4 * Math.PI && absTurn < 3.2 * Math.PI) {
    return corners >= 2 && corners <= 4 && signFlips === 0 ? 'triangle' : 'circle';
  }
  return null;
}

// запись знака рукой: точки проецируются на плоскость перед глазами (вправо, вверх)
export function createRuneRecorder() {
  const xs = new Float32Array(MAX_POINTS), ys = new Float32Array(MAX_POINTS);
  const world = Array.from({ length: MAX_POINTS }, () => new THREE.Vector3());
  const right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3();
  let n = 0, active = false;
  return {
    get active() { return active; },
    get count() { return n; },
    world, // мировые точки для следа
    begin(headFwd) {
      fwd.copy(headFwd); fwd.y = 0;
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
      fwd.normalize();
      right.crossVectors(fwd, up);
      n = 0; active = true;
    },
    add(p) {
      if (!active || n >= MAX_POINTS) return false;
      if (n && world[n - 1].distanceToSquared(p) < 0.012 * 0.012) return false; // слишком близко к прошлой
      world[n].copy(p);
      xs[n] = p.dot(right); ys[n] = p.y;
      n++;
      return true;
    },
    end() {
      active = false;
      const r = recognizeRune(xs, ys, n);
      n = 0;
      return r;
    },
    cancel() { active = false; n = 0; },
  };
}

// ---------- позы и скорость руки ----------
const _q = new THREE.Quaternion();
const _palm = new THREE.Vector3();

// нормаль ладони в мире: правая ладонь смотрит в −X контроллера, левая — в +X
export function palmNormal(controller, side, out = _palm) {
  controller.getWorldQuaternion(_q);
  return out.set(side === 'left' ? 1 : -1, 0, 0).applyQuaternion(_q);
}
export const palmUp = (controller, side) => palmNormal(controller, side).y > 0.55;
export const palmForward = (controller, side, headFwd) => {
  const n = palmNormal(controller, side);
  return n.x * headFwd.x + n.z * headFwd.z > 0.55 && n.y < 0.6;
};

// скорость руки по последним кадрам (м/с, мир)
export function createHandTracker() {
  const K = 6;
  const pos = Array.from({ length: K }, () => new THREE.Vector3());
  const dts = new Float32Array(K);
  const velocity = new THREE.Vector3();
  const position = new THREE.Vector3();
  let i = 0, filled = 0;
  return {
    position, velocity,
    update(controller, dt) {
      controller.getWorldPosition(position);
      pos[i].copy(position); dts[i] = dt;
      i = (i + 1) % K; filled = Math.min(K, filled + 1);
      if (filled < 3) { velocity.set(0, 0, 0); return; }
      const oldest = (i - filled + K) % K;
      let t = 0;
      for (let k = 1; k < filled; k++) t += dts[(oldest + k) % K];
      if (t > 1e-4) velocity.subVectors(position, pos[oldest]).divideScalar(t);
    },
    reset() { filled = 0; velocity.set(0, 0, 0); },
  };
}

// обе руки перед животом: ниже головы, впереди, рядом друг с другом
export function kiPose(left, right, headPos, headFwd) {
  const ok = (p) => {
    const dy = headPos.y - p.y;
    const ahead = (p.x - headPos.x) * headFwd.x + (p.z - headPos.z) * headFwd.z;
    return dy > 0.35 && dy < 0.9 && ahead > 0.15 && ahead < 0.6;
  };
  return ok(left) && ok(right) && left.distanceTo(right) < 0.45;
}
