#!/usr/bin/env node
// tools/gen-models.mjs — генератор low-poly GLB для VR-ATU open world. Без зависимостей (Node ≥18).
//   node tools/gen-models.mjs                     -> assets/models/gen/*.glb + palette.png + manifest.json + validation.json
//   node tools/gen-models.mjs --out DIR --preview DIR --only w_,m_   (фильтр по префиксу)
// Источник геометрии — js/world/procedural-models.js (тот же код, что строит меши в браузере).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(arg('--out', path.join(here, '..', 'assets', 'models', 'gen')));
const PREV = arg('--preview', null);
const ONLY = arg('--only', '').split(',').filter(Boolean);
const PM = await import(pathToFileURL(path.resolve(arg('--src', path.join(here, '..', 'js', 'world', 'procedural-models.js')))).href);
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();

// ---------- PNG (RGBA8, без зависимостей) ----------
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function png(w, h, rgba) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// palette.png 256×256, 8×8 ячеек по 32 px (ряд 0 сверху = UV v≈1)
{
  const W = 256, img = new Uint8Array(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const c = Math.floor(y / 32) * 8 + Math.floor(x / 32), h = PM.PALETTE[c]; img.set([parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255], (y * W + x) * 4); }
  fs.writeFileSync(path.join(OUT, 'palette.png'), png(W, W, img));
}

// ---------- GLB writer ----------
function glb(d) {
  const bufs = []; let off = 0; const views = [], accs = [], meshes = [];
  const push = (arr, target) => { const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); const pad = (4 - (b.length % 4)) % 4; views.push({ buffer: 0, byteOffset: off, byteLength: b.length, target }); bufs.push(b, Buffer.alloc(pad)); off += b.length + pad; return views.length - 1; };
  const acc = (arr, type, comps, minmax) => { const a = { bufferView: push(arr, 34962), componentType: 5126, count: arr.length / comps, type }; if (minmax) { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < arr.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], arr[i + k]); mx[k] = Math.max(mx[k], arr[i + k]); } a.min = mn; a.max = mx; } accs.push(a); return accs.length - 1; };
  const nodes = d.nodes.map((n, i) => {
    const node = { name: n.name }; if (n.t.some((v) => v !== 0)) node.translation = n.t.map((v) => Math.fround(v));
    if (n.tris) { meshes.push({ name: n.name, primitives: [{ attributes: { POSITION: acc(n.position, 'VEC3', 3, true), NORMAL: acc(n.normal, 'VEC3', 3), COLOR_0: acc(n.color, 'VEC4', 4), TEXCOORD_0: acc(n.uv, 'VEC2', 2) }, material: 0, mode: 4 }] }); node.mesh = meshes.length - 1; }
    const ch = d.nodes.map((c, j) => (c.parent === i && j !== i ? j : -1)).filter((j) => j > 0); if (ch.length) node.children = ch;
    return node;
  });
  const bin = Buffer.concat(bufs);
  const extras = { cat: d.cat, rig: d.rig || null, tris: d.triCount, budget: d.budget, generator: 'vr-atu procedural-models v1' };
  const json = { asset: { version: '2.0', generator: 'VR-ATU tools/gen-models.mjs' }, scene: 0, scenes: [{ name: d.id, nodes: [0] }], nodes, meshes,
    materials: [{ name: 'palette', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } }],
    accessors: accs, bufferViews: views, buffers: [{ byteLength: bin.length }], extras };
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
  return Buffer.concat([head, ch(js.length, 0x4e4f534a), js, ch(bin.length, 0x004e4942), bin]);
}

// ---------- валидация: перечитываем GLB с диска ----------
const REQUIRED = { weapon: (id) => (['w_rune_grenades'].includes(id) ? [] : id === 'w_venom_fangs' || id === 'w_soul_blade' ? ['Tip'] : id === 'w_thunder_hammer' ? ['Head', 'Grip2'] : ['Muzzle']), mob: () => ['WeakPoint'], boss: () => ['WeakPoint'], player: (id) => (id.includes('hand') ? ['wrist', 'palm_socket'] : ['Crystal']), prop: () => [] };
function validate(file, d) {
  const b = fs.readFileSync(file), err = [];
  if (b.readUInt32LE(0) !== 0x46546c67 || b.readUInt32LE(4) !== 2) err.push('bad header');
  if (b.readUInt32LE(8) !== b.length) err.push('length mismatch');
  const jl = b.readUInt32LE(12); if (b.readUInt32LE(16) !== 0x4e4f534a) err.push('no JSON chunk');
  const j = JSON.parse(b.slice(20, 20 + jl).toString()); const bl = b.readUInt32LE(20 + jl);
  if (b.readUInt32LE(24 + jl) !== 0x004e4942 || bl !== j.buffers[0].byteLength) err.push('BIN chunk mismatch');
  let tris = 0; for (const m of j.meshes) for (const p of m.primitives) { const a = j.accessors[p.attributes.POSITION]; tris += a.count / 3; for (const k of ['NORMAL', 'COLOR_0', 'TEXCOORD_0']) if (j.accessors[p.attributes[k]].count !== a.count) err.push('attr count ' + k); }
  for (const v of j.bufferViews) if (v.byteOffset + v.byteLength > bl) err.push('view out of range');
  if (j.nodes[0].name !== d.id) err.push('root name != id');
  if (j.materials.length !== 1) err.push('materials != 1');
  const names = new Set(j.nodes.map((n) => n.name)); if (names.size !== j.nodes.length) err.push('duplicate node names');
  for (const r of REQUIRED[d.cat](d.id)) if (!names.has(r)) err.push('missing node ' + r);
  if (tris !== d.triCount) err.push('tri mismatch');
  if (tris > d.budget) err.push(`over budget ${tris}>${d.budget}`);
  const seen = new Set([0]); const walk = (i) => (j.nodes[i].children || []).forEach((c) => { seen.add(c); walk(c); }); walk(0); if (seen.size !== j.nodes.length) err.push('orphan nodes');
  return { tris, nodes: j.nodes.length, bytes: b.length, err };
}

const ids = PM.MODEL_IDS.filter((id) => !ONLY.length || ONLY.some((p) => id.startsWith(p)));
const manifest = { generated: new Date().toISOString(), palette: 'palette.png', models: {} }, report = [];
for (const id of ids) {
  const d = PM.buildModelData(id), file = path.join(OUT, id + '.glb');
  fs.writeFileSync(file, glb(d));
  const v = validate(file, d);
  manifest.models[id] = { file: id + '.glb', cat: d.cat, rig: d.rig || null, tris: v.tris, nodes: d.nodes.map((n) => n.name), bytes: v.bytes, size: d.bbox[1].map((x, i) => +(x - d.bbox[0][i]).toFixed(3)) };
  report.push({ id, cat: d.cat, tris: v.tris, budget: d.budget, nodes: v.nodes, bytes: v.bytes, errors: v.err });
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
fs.writeFileSync(path.join(OUT, 'validation.json'), JSON.stringify(report, null, 1));
const bad = report.filter((r) => r.errors.length);
const byCat = {}; for (const r of report) { const c = (byCat[r.cat] ||= { n: 0, tris: 0, max: 0, bytes: 0 }); c.n++; c.tris += r.tris; c.max = Math.max(c.max, r.tris); c.bytes += r.bytes; }
console.log(`[gen-models] ${report.length} GLB -> ${OUT} за ${Date.now() - t0} мс; ошибок: ${bad.length}`);
for (const [c, s] of Object.entries(byCat)) console.log(`  ${c.padEnd(7)} ${String(s.n).padStart(3)} шт  Σ${s.tris} tris  max ${s.max}  ${(s.bytes / 1024).toFixed(0)} KiB`);
for (const r of bad) console.log('  FAIL', r.id, r.errors.join('; '));

// ---------- превью: софт-растеризатор (изометрия, z-buffer, тун-ступени + контур) ----------
if (PREV) {
  fs.mkdirSync(PREV, { recursive: true });
  const cats = { player: [], weapon: [], mob: [], boss: [], prop: [] };
  for (const id of ids) cats[PM.buildModelData(id).cat].push(id);
  const FONT = { // 3×5 bitmap для подписей
    a: '7d7', b: 'fa5', c: 'f99', d: 'f96', e: 'fbb', f: 'fa8', g: 'f9d', h: 'f2f', i: '9f9', j: '19f', k: 'f2d', l: 'f11', m: 'f4f', n: 'f8f', o: 'f9f', p: 'fa4', q: '69f', r: 'fad', s: 'bbd', t: '8f8', u: 'f1f', v: 'e1e', w: 'f2f', x: 'd2d', y: 'c3c', z: 'dbb', _: '111', 0: 'f9f', 1: '0f0', 2: 'dbb', 3: 'bbf', 4: 'e2f', 5: 'bbd', 6: 'fbd', 7: '88f', 8: 'fbf', 9: 'bbf', ' ': '000' };
  for (const [cat, list] of Object.entries(cats)) {
    if (!list.length) continue;
    const cell = 200, cols = Math.min(6, list.length), rows = Math.ceil(list.length / cols), W = cols * cell, H = rows * cell;
    const img = new Uint8Array(W * H * 4), zb = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) img.set([238, 232, 222, 255], i * 4);
    const yaw = 2.45, pit = 0.5, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), spp = Math.sin(pit), L = [0.45, 0.8, -0.4];
    const ll = Math.hypot(...L); L.forEach((v, i) => (L[i] = v / ll));
    list.forEach((id, idx) => {
      const d = PM.buildModelData(id), ox = (idx % cols) * cell, oy = Math.floor(idx / cols) * cell, world = [];
      d.nodes.forEach((n, i) => { const p = n.parent >= 0 ? world[n.parent] : [0, 0, 0]; world[i] = [p[0] + n.t[0], p[1] + n.t[1], p[2] + n.t[2]]; });
      const [mn, mx] = d.bbox, ctr = mn.map((v, i) => (v + mx[i]) / 2), ext = Math.max(...mx.map((v, i) => v - mn[i])) || 1, sc = (cell * 0.72) / ext;
      const proj = (p) => { const x = p[0] - ctr[0], y = p[1] - ctr[1], z = p[2] - ctr[2]; const x1 = x * cy - z * sy, z1 = x * sy + z * cy; const y2 = y * cp - z1 * spp, z2 = y * spp + z1 * cp; return [ox + cell / 2 + x1 * sc, oy + cell / 2 + 8 - y2 * sc, z2]; };
      zb.fill(-1e9);
      const local = new Float32Array(cell * cell).fill(-1e9);
      d.nodes.forEach((n, ni) => {
        for (let t = 0; t < n.tris; t++) {
          const P3 = [0, 1, 2].map((k) => proj([n.position[(t * 3 + k) * 3] + world[ni][0], n.position[(t * 3 + k) * 3 + 1] + world[ni][1], n.position[(t * 3 + k) * 3 + 2] + world[ni][2]]));
          const nx = n.normal[t * 9], ny = n.normal[t * 9 + 1], nz = n.normal[t * 9 + 2];
          const lam = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]), tone = lam > 0.55 ? 1 : lam > 0.2 ? 0.8 : 0.62;
          const c = [0, 1, 2].map((k) => ((n.color[t * 12 + k] + n.color[t * 12 + 4 + k] + n.color[t * 12 + 8 + k]) / 3));
          const glow = c.some((v) => v > 0.97) ? 1.1 : 1;
          const rgb = c.map((v) => Math.min(255, v * 255 * tone * glow));
          const x0 = Math.max(ox, Math.floor(Math.min(P3[0][0], P3[1][0], P3[2][0]))), x1 = Math.min(ox + cell - 1, Math.ceil(Math.max(P3[0][0], P3[1][0], P3[2][0])));
          const y0 = Math.max(oy, Math.floor(Math.min(P3[0][1], P3[1][1], P3[2][1]))), y1 = Math.min(oy + cell - 1, Math.ceil(Math.max(P3[0][1], P3[1][1], P3[2][1])));
          const [a, b, cc] = P3, area = (b[0] - a[0]) * (cc[1] - a[1]) - (b[1] - a[1]) * (cc[0] - a[0]); if (Math.abs(area) < 1e-9) continue;
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const px = x + 0.5, py = y + 0.5;
            const w0 = ((b[0] - px) * (cc[1] - py) - (b[1] - py) * (cc[0] - px)) / area, w1 = ((cc[0] - px) * (a[1] - py) - (cc[1] - py) * (a[0] - px)) / area, w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            const z = w0 * a[2] + w1 * b[2] + w2 * cc[2], li = (y - oy) * cell + (x - ox);
            if (z > local[li]) { local[li] = z; img.set([rgb[0], rgb[1], rgb[2], 255], (y * W + x) * 4); }
          }
        }
      });
      // контур: граница силуэта и разрывы глубины
      for (let y = 1; y < cell - 1; y++) for (let x = 1; x < cell - 1; x++) {
        const z = local[y * cell + x]; let edge = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const z2 = local[(y + dy) * cell + x + dx]; if ((z > -1e8) !== (z2 > -1e8) || (z > -1e8 && Math.abs(z - z2) > ext * sc * 0.06)) edge = true; }
        if (edge && z > -1e8) img.set([40, 32, 48, 255], ((oy + y) * W + ox + x) * 4);
      }
      // подпись id + треугольники
      const label = (id + ' ' + d.triCount).toLowerCase(); let lx = ox + 4; const ly = oy + cell - 9;
      for (const ch of label) { const g = FONT[ch] || '000'; for (let col = 0; col < 3; col++) { const bits = parseInt(g[col], 16); for (let r = 0; r < 4; r++) if ((bits >> (3 - r)) & 1) img.set([60, 50, 70, 255], ((ly + r) * W + lx + col) * 4); } lx += 4; if (lx > ox + cell - 4) break; }
    });
    fs.writeFileSync(path.join(PREV, `${cat}.png`), png(W, H, img));
  }
  console.log('[gen-models] превью ->', PREV, Object.keys(cats).filter((c) => cats[c].length).map((c) => c + '.png').join(', '));
}
process.exitCode = bad.length ? 1 : 0;

