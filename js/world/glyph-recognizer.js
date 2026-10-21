// js/world/glyph-recognizer.js — распознаватель однострочных рун в стиле $1 (Wobbrock 2007), чистые функции, без DOM/THREE.
// Ориентация ВАЖНА (V ≠ Λ), поэтому поворот ищется только в ±maxRotDeg. Каждый шаблон хранится в обоих направлениях обхода.
// Вход: массив точек [[x,y],...] в любых единицах (пиксели экрана, проекция контроллера VR на плоскость взгляда, путь стика Arduino).
import { GLYPHS } from '../../shared/defs/spells.js';

export const N = 64, SIZE = 1;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const pathLength = (p) => { let d = 0; for (let i = 1; i < p.length; i++) d += dist(p[i - 1], p[i]); return d; };

export function resample(pts, n = N) {
  const I = pathLength(pts) / (n - 1); let D = 0; const src = pts.map((p) => [p[0], p[1]]); const out = [src[0]];
  for (let i = 1; i < src.length; i++) {
    const d = dist(src[i - 1], src[i]);
    if (D + d >= I && d > 0) {
      const t = (I - D) / d, q = [src[i - 1][0] + t * (src[i][0] - src[i - 1][0]), src[i - 1][1] + t * (src[i][1] - src[i - 1][1])];
      out.push(q); src.splice(i, 0, q); D = 0;
    } else D += d;
  }
  while (out.length < n) out.push(src[src.length - 1]);
  return out.slice(0, n);
}
const centroid = (p) => p.reduce((c, q) => [c[0] + q[0] / p.length, c[1] + q[1] / p.length], [0, 0]);
export function normalize(pts) {
  let p = resample(pts);
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  const s = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1; // равномерный масштаб: линии не раздуваются
  p = p.map((q) => [q[0] / s * SIZE, q[1] / s * SIZE]);
  const c = centroid(p); return p.map((q) => [q[0] - c[0], q[1] - c[1]]);
}
const rotate = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return p.map((q) => [q[0] * c - q[1] * s, q[0] * s + q[1] * c]); };
const pathDist = (a, b) => a.reduce((d, q, i) => d + dist(q, b[i]), 0) / a.length;
// Поворот ищем перебором (шаг 3°) с повторной нормализацией масштаба: у повёрнутого квадрата другая рамка.
function distAtBest(p, t, lo, hi, step = 3 * Math.PI / 180) {
  let best = Infinity;
  for (let a = lo; a <= hi + 1e-9; a += step) best = Math.min(best, pathDist(rescale(rotate(p, a)), t));
  return best;
}
function rescale(p) {
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  const s = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  const q = p.map((v) => [v[0] / s * SIZE, v[1] / s * SIZE]); const c = centroid(q); return q.map((v) => [v[0] - c[0], v[1] - c[1]]);
}

/** Точки шаблона глифа из GLYPHS (кривые генерируются). */
export function glyphPoints(g) {
  if (g.pts) return g.pts.map((q) => [...q]);
  const out = [];
  if (g.circle) for (let i = 0; i <= 48; i++) { const a = -Math.PI / 2 + (i / 48) * 2 * Math.PI; out.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]); }
  if (g.spiral) for (let i = 0; i <= 80; i++) { const t = i / 80, a = t * 3 * Math.PI, r = 0.08 + 0.42 * t; out.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]); }
  if (g.wave) for (let i = 0; i <= 48; i++) { const t = i / 48; out.push([t, 0.5 + 0.25 * Math.sin(t * 4 * Math.PI)]); }
  return out;
}

export class GlyphRecognizer {
  constructor(glyphs = GLYPHS, { maxRotDeg = 30 } = {}) {
    this.maxRot = (maxRotDeg * Math.PI) / 180; this.templates = [];
    for (const [id, g] of Object.entries(glyphs)) { const p = glyphPoints(g); this.add(id, p); this.add(id, [...p].reverse()); }
  }
  add(id, pts) { this.templates.push({ id, pts: normalize(pts) }); }
  /** @returns {{id:string|null, score:number, second:string|null}} score 0..1 (1 — идеально). */
  recognize(pts) {
    if (!pts || pts.length < 2 || pathLength(pts) <= 0) return { id: null, score: 0, second: null };
    const p = normalize(pts); const best = new Map();
    for (const t of this.templates) { const d = distAtBest(p, t.pts, -this.maxRot, this.maxRot); if (!best.has(t.id) || d < best.get(t.id)) best.set(t.id, d); }
    const sorted = [...best.entries()].sort((a, b) => a[1] - b[1]);
    const half = 0.5 * Math.sqrt(2 * SIZE * SIZE);
    return { id: sorted[0][0], score: Math.max(0, 1 - sorted[0][1] / half), second: sorted[1]?.[0] ?? null };
  }
}

/** Arduino: путь стика (x,y ∈ −1..1, сэмплы 30–60 Гц) — тот же распознаватель; мёртвая зона отбрасывается. */
export function stickPathToStroke(samples, dead = 0.25) { return samples.filter(([x, y]) => Math.hypot(x, y) > dead).map(([x, y]) => [x, -y]); }
