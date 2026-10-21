// tools/kz-previews.mjs — headless превью казахской темы без зависимостей: атлас орнаментов, UI-рамка, модели (софт-растеризатор toon + контур), палитра.
// node tools/kz-previews.mjs [--out DIR]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { buildOrnamentAtlas, frameBorder, MOTIF_IDS } from '../js/world/kz-ornaments.js';
import { KZ_MODEL_IDS, buildKzModelData } from '../js/world/kz-models.js';
import { KZ_THEME } from '../shared/defs/theme_kz.js';
const OUT = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : 'previews-kz'; })();
fs.mkdirSync(OUT, { recursive: true });
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function png(w, h, rgba) { const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); }; const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6; const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]); }
const save = (name, im) => { fs.writeFileSync(path.join(OUT, name), png(im.w, im.h, im.data)); console.log('[kz-previews]', path.join(OUT, name), im.w + '×' + im.h); };
// 1) атлас
save('kz-ornament-atlas.png', buildOrnamentAtlas({ cell: 128 }));
// 2) рамка UI поверх «неба»
{ const f = frameBorder(640, 320, { band: 40 }), bg = new Uint8ClampedArray(f.data.length); for (let i = 0; i < f.w * f.h; i++) { const a = f.data[i * 4 + 3] / 255, y = Math.floor(i / f.w) / f.h; const sky = [0 + 30 * y, 175 - 60 * y, 202 - 40 * y]; for (let k = 0; k < 3; k++) bg[i * 4 + k] = f.data[i * 4 + k] * a + sky[k] * (1 - a); bg[i * 4 + 3] = 255; } save('kz-ui-frame.png', { w: f.w, h: f.h, data: bg }); }
// 3) палитра + цвета стихий
{ const cols = [...Object.values(KZ_THEME.palette), ...Object.values(KZ_THEME.elements).map((e) => e.color)], s = 48, W = cols.length * s, d = new Uint8ClampedArray(W * s * 4); cols.forEach((h, i) => { const c = [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)); for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) d.set([...c, 255], (y * W + i * s + x) * 4); }); save('kz-palette.png', { w: W, h: s, data: d }); }
// 4) модели
{
  const cell = 260, ids = KZ_MODEL_IDS, cols = 4, rows = Math.ceil(ids.length / cols), W = cols * cell, H = rows * cell, img = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { const y = Math.floor(i / W) % cell / cell; img.set([238 - 40 * y, 232 - 20 * y, 214 - 10 * y, 255], i * 4); }
  const yaw = 2.5, pit = 0.42, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit), L = [0.45, 0.8, -0.4].map((v, _, a) => v / Math.hypot(...a));
  ids.forEach((id, idx) => {
    const d = buildKzModelData(id), ox = (idx % cols) * cell, oy = Math.floor(idx / cols) * cell, world = [];
    d.nodes.forEach((n, i) => { const p = n.parent >= 0 ? world[n.parent] : [0, 0, 0]; world[i] = [p[0] + n.t[0], p[1] + n.t[1], p[2] + n.t[2]]; });
    const [mn, mx] = d.bbox, ctr = mn.map((v, i) => (v + mx[i]) / 2), ext = Math.max(...mx.map((v, i) => v - mn[i])) || 1, sc = (cell * 0.72) / ext;
    const proj = (p) => { const x = p[0] - ctr[0], y = p[1] - ctr[1], z = p[2] - ctr[2]; const x1 = x * cy - z * sy, z1 = x * sy + z * cy; return [ox + cell / 2 + x1 * sc, oy + cell / 2 - (y * cp - z1 * sp) * sc, y * sp + z1 * cp]; };
    const zb = new Float32Array(cell * cell).fill(-1e9);
    d.nodes.forEach((n, ni) => { for (let t = 0; t < n.tris; t++) {
      const P = [0, 1, 2].map((k) => proj([0, 1, 2].map((a) => n.position[(t * 3 + k) * 3 + a] + world[ni][a])));
      const lam = Math.max(0, n.normal[t * 9] * L[0] + n.normal[t * 9 + 1] * L[1] + n.normal[t * 9 + 2] * L[2]), tone = lam > 0.55 ? 1 : lam > 0.2 ? 0.8 : 0.62;
      const rgb = [0, 1, 2].map((k) => Math.min(255, ((n.color[t * 12 + k] + n.color[t * 12 + 4 + k] + n.color[t * 12 + 8 + k]) / 3) * 255 * tone));
      const [a, b, c] = P, area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); if (Math.abs(area) < 1e-9) continue;
      const x0 = Math.max(ox, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(ox + cell - 1, Math.ceil(Math.max(a[0], b[0], c[0]))), y0 = Math.max(oy, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(oy + cell - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const px = x + 0.5, py = y + 0.5, w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area, w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area, w2 = 1 - w0 - w1; if (w0 < 0 || w1 < 0 || w2 < 0) continue; const z = w0 * a[2] + w1 * b[2] + w2 * c[2], li = (y - oy) * cell + x - ox; if (z > zb[li]) { zb[li] = z; img.set([...rgb, 255], (y * W + x) * 4); } }
    } });
    for (let y = 1; y < cell - 1; y++) for (let x = 1; x < cell - 1; x++) { const z = zb[y * cell + x]; if (z < -1e8) continue; let e = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const z2 = zb[(y + dy) * cell + x + dx]; if (z2 < -1e8 || Math.abs(z - z2) > ext * sc * 0.05) e = true; } if (e) img.set([42, 35, 36, 255], ((oy + y) * W + ox + x) * 4); }
  });
  save('kz-models.png', { w: W, h: H, data: img });
}
console.log('[kz-previews] мотивы:', MOTIF_IDS.join(', '), '| модели:', KZ_MODEL_IDS.join(', '));
