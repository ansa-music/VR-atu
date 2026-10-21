// js/world/kz-ornaments.js — процедурные казахские ою-өрнек (ornaments) для текстур и UI-рамок.
// Чистый JS: рисует в RGBA-буфер (работает в Node для тестов/превью и в браузере через ImageData).
// Toon-friendly: 2–3 плоских цвета, жёсткие края, без градиентов; симметрия как в войлочных сырмақ/текемет.
// API: drawMotif(id, size, colors) -> {w,h,data}; buildOrnamentAtlas(opts) -> {w,h,data,uv}; frameBorder(w,h,opts);
//      toCanvas(img) (браузер), createOrnamentTexture(THREE, opts) -> {texture, uv}.
export const MOTIFS = Object.freeze({
  qoshqar_muiiz: { kk: 'Қошқар мүйіз', lat: 'Qoşqar müiiz', ru: 'Бараний рог', meaning: 'достаток, сила рода' },
  synyq_muiiz: { kk: 'Сынық мүйіз', lat: 'Synyq müiiz', ru: 'Сломанный рог', meaning: 'стойкость, преодоление' },
  tuie_taban: { kk: 'Түйе табан', lat: 'Tüie taban', ru: 'Верблюжий след', meaning: 'путь, дорога, караван' },
  qus_qanaty: { kk: 'Құс қанаты', lat: 'Qus qanaty', ru: 'Птичье крыло', meaning: 'свобода, небо, мечта' },
  it_quiryq: { kk: 'Ит құйрық', lat: 'It quiryq', ru: 'Собачий хвост', meaning: 'верность, охрана дома (бордюр)' },
  orkesh: { kk: 'Өркеш', lat: 'Örkeş', ru: 'Горб (волна)', meaning: 'изобилие, горы (бордюр)' },
  tumar: { kk: 'Тұмар', lat: 'Tumar', ru: 'Оберег-треугольник', meaning: 'защита от сглаза' },
  shanyrak: { kk: 'Шаңырақ', lat: 'Şañyraq', ru: 'Купольный круг юрты', meaning: 'дом, преемственность, небо' },
  tanba: { kk: 'Таңба', lat: 'Tañba', ru: 'Тамга рода', meaning: 'знак рода, петроглиф' },
  zhylan_iz: { kk: 'Жылан із', lat: 'Jylan iz', ru: 'Змеиный след', meaning: 'мудрость/опасность (яд)' },
  tolqyn: { kk: 'Толқын', lat: 'Tolqyn', ru: 'Волна', meaning: 'вода, Арал' },
  girih_tile: { kk: 'Кесене өрнегі', lat: 'Kesene örnegi', ru: 'Изразец мавзолея', meaning: 'звёздный изразец (бирюза)' },
});
export const MOTIF_IDS = Object.keys(MOTIFS);
export const DEFAULT_COLORS = Object.freeze({ bg: '#c8282d', fg: '#fec50c', line: '#2a2324' });

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
function img(w, h, bg) { const d = new Uint8ClampedArray(w * h * 4), c = hex(bg); for (let i = 0; i < w * h; i++) d.set(c, i * 4); return { w, h, data: d }; }
// заливка полигонов (even-odd, координаты в [0..1]) со сдвигом/масштабом
function fill(im, polys, color, ox = 0, oy = 0, s = im.w) {
  const c = hex(color);
  for (const poly of polys) {
    const P = poly.map(([x, y]) => [ox + x * s, oy + y * s]);
    let y0 = Infinity, y1 = -Infinity; for (const p of P) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(im.h - 1, Math.ceil(y1)); y++) {
      const yy = y + 0.5, xs = [];
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xa, ya] = P[i], [xb, yb] = P[j]; if ((ya > yy) !== (yb > yy)) xs.push(xa + ((yy - ya) / (yb - ya)) * (xb - xa)); }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(im.w - 1, Math.floor(xs[k + 1] - 0.5)); x++) im.data.set(c, (y * im.w + x) * 4);
    }
  }
}
// толстая линия-полилиния → набор квадов
function stroke(pts, wd) { const out = []; for (let i = 0; i + 1 < pts.length; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1]; const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * wd / 2, ny = (dx / l) * wd / 2; out.push([[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]]); } return out; }
const circle = (cx, cy, r, n = 28) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * 2 * Math.PI) * r, cy + Math.sin((i / n) * 2 * Math.PI) * r]);
// спираль-завиток рога: архимедова, с сужением
function hornCurl(cx, cy, r, dir = 1, turns = 1.35, up = 1) { const p = []; for (let i = 0; i <= 40; i++) { const t = i / 40, a = -Math.PI / 2 * up + dir * t * turns * 2 * Math.PI, rr = r * (1 - 0.75 * t); p.push([cx + Math.cos(a) * rr * dir, cy + Math.sin(a) * rr]); } return p; }
const mirX = (polys) => polys.map((p) => p.map(([x, y]) => [1 - x, y]));
const rot4 = (polys) => { const o = []; for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a); o.push(...polys.map((p) => p.map(([x, y]) => [0.5 + (x - 0.5) * c - (y - 0.5) * s, 0.5 + (x - 0.5) * s + (y - 0.5) * c]))); } return o; };

// каждый мотив: функция -> массив полигонов в единичном квадрате (fg)
const SHAPES = {
  qoshqar_muiiz() { // ствол + два завитка вверх (классический бараний рог), отражён по Y для «ромба»
    const curl = []; for (let i = 0; i <= 48; i++) { const t = i / 48, a = -t * 2.4 * Math.PI, r = 0.17 * (1 - 0.7 * t); curl.push([0.32 + Math.cos(a) * r, 0.42 + Math.sin(a) * r]); }
    const half = [...stroke([[0.5, 0.95], [0.5, 0.42]], 0.08), ...stroke([[0.5, 0.44], [0.49, 0.42]].concat(curl), 0.07), [[0.5, 0.62], [0.38, 0.74], [0.5, 0.86]]];
    return [...half, ...mirX(half)];
  },
  synyq_muiiz() { // угловатый «сломанный» рог — меандр
    const p = [[0.5, 0.9], [0.5, 0.5], [0.2, 0.5], [0.2, 0.2], [0.42, 0.2], [0.42, 0.36], [0.32, 0.36]];
    const h = stroke(p, 0.07); return [...h, ...mirX(h)];
  },
  tuie_taban() { // четыре лепестка-следа вокруг ромба
    const lobe = [circle(0.5, 0.22, 0.12, 16)]; const d = [[[0.5, 0.38], [0.62, 0.5], [0.5, 0.62], [0.38, 0.5]]];
    return [...rot4(lobe), ...d];
  },
  qus_qanaty() { // крыло: веер из 5 перьев
    const o = []; for (let i = 0; i < 5; i++) { const a = -Math.PI * 0.9 + i * 0.2 * Math.PI * 0.9; o.push([[0.5, 0.85], [0.5 + Math.cos(a - 0.12) * 0.55, 0.85 + Math.sin(a - 0.12) * 0.55], [0.5 + Math.cos(a + 0.05) * 0.62, 0.85 + Math.sin(a + 0.05) * 0.62]]); } return o;
  },
  it_quiryq() { // бордюр: S-волна завитков (тайлится по X)
    const o = []; for (const x0 of [0, 0.5]) o.push(...stroke(hornCurl(x0 + 0.25, 0.5, 0.2, 1, 1.1), 0.06)); o.push(...stroke([[0, 0.92], [1, 0.92]], 0.06), ...stroke([[0, 0.08], [1, 0.08]], 0.06)); return o;
  },
  orkesh() { const o = stroke([[0, 0.7], [0.25, 0.3], [0.5, 0.7], [0.75, 0.3], [1, 0.7]], 0.09); o.push(...stroke([[0, 0.92], [1, 0.92]], 0.05)); return o; },
  tumar() { return [[[0.5, 0.12], [0.9, 0.82], [0.1, 0.82]], ...stroke([[0.5, 0.82], [0.5, 0.97]], 0.06), circle(0.5, 0.58, 0.1, 14)]; },
  shanyrak() { // круг + крест-решётка күлдіреуіш (3+3 перекрещенные дуги)
    const o = [...stroke(circle(0.5, 0.5, 0.42, 36).concat([[0.92, 0.5]]), 0.07)];
    for (const d of [-0.14, 0, 0.14]) { o.push(...stroke([[0.5 + d, 0.1], [0.5 + d, 0.9]], 0.045)); o.push(...stroke([[0.1, 0.5 + d], [0.9, 0.5 + d]], 0.045)); }
    return o;
  },
  tanba() { // тамга-«солнцеголовый» петроглиф Тамгалы: круг с лучами и фигура
    const o = [circle(0.5, 0.3, 0.13, 18)]; for (let i = 0; i < 10; i++) { const a = (i / 10) * 2 * Math.PI; o.push(...stroke([[0.5 + Math.cos(a) * 0.15, 0.3 + Math.sin(a) * 0.15], [0.5 + Math.cos(a) * 0.24, 0.3 + Math.sin(a) * 0.24]], 0.03)); }
    o.push(...stroke([[0.5, 0.45], [0.5, 0.75]], 0.06), ...stroke([[0.3, 0.55], [0.7, 0.55]], 0.05), ...stroke([[0.5, 0.75], [0.35, 0.95]], 0.05), ...stroke([[0.5, 0.75], [0.65, 0.95]], 0.05)); return o;
  },
  zhylan_iz() { const p = []; for (let i = 0; i <= 30; i++) { const t = i / 30; p.push([t, 0.5 + Math.sin(t * Math.PI * 4) * 0.25]); } return stroke(p, 0.08); },
  tolqyn() { const o = []; for (const y of [0.3, 0.7]) { const p = []; for (let i = 0; i <= 30; i++) { const t = i / 30; p.push([t, y + Math.sin(t * Math.PI * 2) * 0.1]); } o.push(...stroke(p, 0.07)); } return o; },
  girih_tile() { // 8-конечная звезда (две повернутые квадратные рамки) — изразец мавзолея
    const sq = (a) => [0, 1, 2, 3].map((k) => [0.5 + Math.cos(a + (k * Math.PI) / 2) * 0.4, 0.5 + Math.sin(a + (k * Math.PI) / 2) * 0.4]);
    return [sq(Math.PI / 4), sq(0), circle(0.5, 0.5, 0.12, 16)];
  },
};

/** Один мотив size×size. colors {bg,fg,line}: fg рисуется поверх контура line (обводка = toon-контур). */
export function drawMotif(id, size = 128, colors = DEFAULT_COLORS) {
  const f = SHAPES[id]; if (!f) throw new Error('kz-ornaments: unknown motif ' + id);
  const im = img(size, size, colors.bg || DEFAULT_COLORS.bg), polys = f();
  const sym = polys;
  // контур: тот же полигон, раздутый на 2px через отрисовку со смещениями
  const o = Math.max(1, Math.round(size / 64));
  for (const [dx, dy] of [[o, 0], [-o, 0], [0, o], [0, -o]]) fill(im, sym, colors.line || DEFAULT_COLORS.line, dx, dy, size);
  fill(im, sym, colors.fg || DEFAULT_COLORS.fg, 0, 0, size);
  return im;
}
/** Атлас: grid×grid ячеек по cell px. Возвращает uv[id] = [u0,v0,u1,v1] (v снизу, как в Three.js). */
export function buildOrnamentAtlas({ cell = 128, motifs = MOTIF_IDS, schemes } = {}) {
  const cols = Math.ceil(Math.sqrt(motifs.length)), rows = Math.ceil(motifs.length / cols), W = cols * cell, H = rows * cell;
  const atlas = img(W, H, '#000000'), uv = {};
  const SCHEMES = schemes || [
    { bg: '#c8282d', fg: '#fec50c', line: '#2a2324' }, { bg: '#00afca', fg: '#f6f1e6', line: '#0b5c8a' }, { bg: '#d8c4a0', fg: '#8f6f4a', line: '#2a2324' },
    { bg: '#0b5c8a', fg: '#fec50c', line: '#2a2324' }, { bg: '#f6f1e6', fg: '#c8282d', line: '#2a2324' }, { bg: '#2a2324', fg: '#00afca', line: '#f6f1e6' },
  ];
  motifs.forEach((id, i) => {
    const m = drawMotif(id, cell, SCHEMES[i % SCHEMES.length]), cx = (i % cols) * cell, cy = Math.floor(i / cols) * cell;
    for (let y = 0; y < cell; y++) atlas.data.set(m.data.subarray(y * cell * 4, (y + 1) * cell * 4), ((cy + y) * W + cx) * 4);
    uv[id] = [cx / W, 1 - (cy + cell) / H, (cx + cell) / W, 1 - cy / H];
  });
  return { ...atlas, uv, cols, rows, cell };
}
/** UI-рамка: бордюр it_quiryq/orkesh по периметру + уголки қошқар мүйіз; центр прозрачный (alpha 0) — для 9-slice. */
export function frameBorder(w = 512, h = 256, { band = 32, motif = 'it_quiryq', corner = 'qoshqar_muiiz', colors = DEFAULT_COLORS } = {}) {
  const out = img(w, h, colors.bg); for (let i = 3; i < out.data.length; i += 4) out.data[i] = 0;
  const strip = drawMotif(motif, band, colors), cor = drawMotif(corner, band, { ...colors, bg: colors.line });
  const blit = (src, x0, y0, rot) => { for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const [sx, sy] = rot ? [y, src.w - 1 - x] : [x, y]; const X = x0 + x, Y = y0 + y; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; out.data.set(src.data.subarray((sy * src.w + sx) * 4, (sy * src.w + sx) * 4 + 4), (Y * w + X) * 4); } };
  for (let x = 0; x < w; x += band) { blit(strip, x, 0); blit(strip, x, h - band); }
  for (let y = 0; y < h; y += band) { blit(strip, 0, y, true); blit(strip, w - band, y, true); }
  for (const [x, y] of [[0, 0], [w - band, 0], [0, h - band], [w - band, h - band]]) blit(cor, x, y);
  return { ...out, slice: band };
}
/** CSS для DOM-HUD: border-image из frameBorder (вызывать в браузере). */
export function frameCss(opts) { const f = frameBorder(256, 256, opts); const c = toCanvas(f); return `border:${f.slice}px solid transparent;border-image:url(${c.toDataURL()}) ${f.slice} round;`; }
export function toCanvas(im) {
  const c = typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined' ? new OffscreenCanvas(im.w, im.h) : document.createElement('canvas');
  c.width = im.w; c.height = im.h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(im.data), im.w, im.h), 0, 0); return c;
}
/** Three.js r160: CanvasTexture с NearestFilter (toon), SRGB. Один атлас на всё (1 draw-call-friendly). */
let _atlasTex = null;
export function createOrnamentTexture(THREE, opts = {}) {
  if (_atlasTex && !opts.fresh) return _atlasTex;
  const a = buildOrnamentAtlas(opts), tex = new THREE.CanvasTexture(toCanvas(a));
  tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.generateMipmaps = true;
  _atlasTex = { texture: tex, uv: a.uv, w: a.w, h: a.h }; return _atlasTex;
}
