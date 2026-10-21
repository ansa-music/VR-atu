// js/world/noise.js — детерминированный шум мира без зависимостей (браузер, воркер, node).
// Только сложение, умножение, floor и sqrt: на всех устройствах одинаковый результат.

/** PRNG mulberry32: seed → функция, возвращающая числа [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = new Float64Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1]);

/** 2D simplex-шум с перестановкой от seed. Возвращает noise(x, y) ≈ [-1, 1]. */
export function createSimplex2D(seed) {
  const rnd = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  const g8 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; g8[i] = (perm[i] & 7) * 2; }

  return function noise(x, y) {
    const s = (x + y) * F2;
    const i = Math.floor(x + s), j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t), y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = g8[ii + perm[jj]]; t0 *= t0; n += t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = g8[ii + i1 + perm[jj + j1]]; t1 *= t1; n += t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = g8[ii + 1 + perm[jj + 1]]; t2 *= t2; n += t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2); }
    return 70 * n;
  };
}

/** fBm: сумма октав, нормированная к ≈ [-1, 1]. */
export function fbm(noise, x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * f, y * f);
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}

/** Ridged-шум для хребтов: [0, 1], острые гребни. */
export function ridged(noise, x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0, amp = 0.5, f = 1, prev = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(noise(x * f, y * f));
    n *= n;
    sum += n * amp * prev;
    norm += amp;
    prev = n;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}

/** FNV-1a по байтам массива: хеш для проверки детерминизма. */
export function hashBytes(view) {
  const b = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
