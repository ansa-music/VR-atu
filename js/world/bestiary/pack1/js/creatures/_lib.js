// VR-atu — общая библиотека процедурных существ (Three.js 0.160, без сборки).
// Материалы PBR + процедурные текстуры (оюу-өрнек), dissolve-шейдер, архетипы, LOD, процедурные анимации.
export const BUDGET = { mob: 3000, boss: 15000, cr: 6000, fauna: 2500, npc: 4000 };
export const WINDUP = 0.5; // замах атаки, c (>= 0.4)

const DEF = {
  body: 'fur:#7d6a55', belly: 'fur:#b9a78f', eye: 'eye:#ffd24a', horn: 'bone:#d9cfb6', rune: 'rune:#38e0ff',
  weak: 'rune:#ff3355', metal: 'metal:#9aa0a6', gold: 'gold:#d4a72c', cloth: 'cloth:#7a2a1e', cloth2: 'cloth:#1e4a7a',
  trim: 'gold:#d4a72c:orn', skin: 'skin:#c99a74', hair: 'fur:#1a1410', wing: 'hide:#4a403a', claw: 'bone:#2a2420',
  wood: 'wood:#5a3d22', fire: 'fire:#ff6a1a', leather: 'leather:#5b3a22', wingi: 'ice:#d8f4ff', boot: 'leather:#2b1d12', legs: 'chitin:#2a2420', fin: 'hide:#8a6a4a'
};
const KIND = {
  fur: { r: .92, m: 0, pat: 'fur' }, hide: { r: .8, m: 0, pat: 'leather' }, leather: { r: .62, m: 0, pat: 'leather' },
  scales: { r: .42, m: .15, pat: 'scales' }, chitin: { r: .3, m: .25, pat: 'scales' }, stone: { r: .95, m: 0, pat: 'stone' },
  metal: { r: .32, m: 1 }, gold: { r: .24, m: 1 }, bronze: { r: .36, m: 1 }, bone: { r: .6, m: 0 }, wood: { r: .88, m: 0, pat: 'bark' },
  cloth: { r: .86, m: 0, pat: 'cloth' }, felt: { r: .96, m: 0, pat: 'cloth' }, skin: { r: .55, m: 0 },
  slime: { r: .08, m: 0, op: .78 }, ice: { r: .1, m: .05, op: .72 }, feather: { r: .78, m: 0, pat: 'feather' },
  rune: { r: .4, m: 0, emi: 2.4 }, eye: { r: .2, m: 0, emi: 1.6 }, fire: { r: .6, m: 0, emi: 3.2 }
};
const ALIAS = { headMat: 'body', abdMat: 'body', stingMat: 'rune', handMat: 'skin' };
const EMI = new Set(['rune', 'eye', 'fire']);

// ---------- процедурные текстуры (только в браузере) ----------
const TEX = {};
const hasDOM = () => typeof document !== 'undefined';
function canvas(n) { const c = document.createElement('canvas'); c.width = c.height = n; return [c, c.getContext('2d')]; }
function patternTexture(T, kind) {
  if (!hasDOM() || !kind) return null;
  if (TEX[kind]) return TEX[kind];
  const [c, g] = canvas(256); g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, 256, 256);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  if (kind === 'fur') { for (let i = 0; i < 2600; i++) { const x = rnd() * 256, y = rnd() * 256, v = 170 + rnd() * 85 | 0; g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 1 + rnd(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - .5) * 4, y + 6 + rnd() * 8); g.stroke(); } }
  else if (kind === 'scales' || kind === 'feather') { const s = kind === 'scales' ? 22 : 34; for (let y = -s; y < 256 + s; y += s * .55) for (let x = -s; x < 256 + s; x += s) { const ox = ((y / (s * .55)) | 0) % 2 ? s / 2 : 0; const gr = g.createRadialGradient(x + ox, y, 1, x + ox, y, s * .62); gr.addColorStop(0, '#ffffff'); gr.addColorStop(.85, '#b8b8b8'); gr.addColorStop(1, '#6a6a6a'); g.fillStyle = gr; g.beginPath(); g.arc(x + ox, y, s * .62, 0, Math.PI); g.fill(); } }
  else if (kind === 'bark') { for (let i = 0; i < 160; i++) { const x = rnd() * 256, v = 120 + rnd() * 110 | 0; g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 2 + rnd() * 5; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 10 * (rnd() - .5), 90, x + 14 * (rnd() - .5), 170, x, 256); g.stroke(); } }
  else if (kind === 'cloth') { for (let y = 0; y < 256; y += 4) for (let x = 0; x < 256; x += 4) { const v = ((x + y) / 4) % 2 ? 235 : 205; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 4, 4); } }
  else { for (let i = 0; i < 900; i++) { const x = rnd() * 256, y = rnd() * 256, r = 2 + rnd() * (kind === 'stone' ? 18 : 6), v = 150 + rnd() * 100 | 0; g.fillStyle = `rgba(${v},${v},${v},.5)`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } }
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(2, 2); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
  return (TEX[kind] = t);
}
// Казахский орнамент оюу-өрнек: мотив «қошқар мүйіз» (бараньи рога) + ромбическая кайма.
export function ornamentTexture(T, fg = '#e8c14a', bg = '#6a1c14') {
  if (!hasDOM()) return null;
  const key = 'orn' + fg + bg; if (TEX[key]) return TEX[key];
  const [c, g] = canvas(256); g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = fg; g.lineCap = 'round'; g.lineWidth = 7;
  const spiral = (cx, cy, R, dir) => { g.beginPath(); for (let i = 0; i <= 50; i++) { const a = i / 50 * Math.PI * 2.2, r = R * (1 - i / 62); const x = cx + dir * (R - Math.cos(a) * r), y = cy - Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); };
  for (const [cx, cy] of [[64, 64], [192, 64], [64, 192], [192, 192]]) {
    g.beginPath(); g.moveTo(cx, cy + 40); g.lineTo(cx, cy + 6); g.stroke();
    spiral(cx, cy + 6, 26, 1); spiral(cx, cy + 6, 26, -1);
    g.beginPath(); g.moveTo(cx - 12, cy + 44); g.lineTo(cx, cy + 32); g.lineTo(cx + 12, cy + 44); g.stroke();
  }
  g.lineWidth = 4; g.beginPath(); for (let x = 0; x <= 256; x += 32) { g.moveTo(x, 128); g.lineTo(x + 16, 116); g.lineTo(x + 32, 128); g.lineTo(x + 16, 140); g.closePath(); } g.stroke();
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
  return (TEX[key] = t);
}

// ---------- dissolve (onBeforeCompile, шумовой discard + светящийся край) ----------
const NOISE = `
uniform float uDissolve; uniform float uHit; uniform vec3 uEdge; varying vec3 vDPos;
float dh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
float dnoise(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f);
 return mix(mix(mix(dh(i),dh(i+vec3(1,0,0)),f.x),mix(dh(i+vec3(0,1,0)),dh(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(dh(i+vec3(0,0,1)),dh(i+vec3(1,0,1)),f.x),mix(dh(i+vec3(0,1,1)),dh(i+vec3(1,1,1)),f.x),f.y),f.z); }
float dfbm(vec3 p){ return dnoise(p)*.6 + dnoise(p*2.7)*.4; }`;
export function applyDissolve(m, U) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDissolve = U.uDissolve; sh.uniforms.uHit = U.uHit; sh.uniforms.uEdge = U.uEdge;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + NOISE)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfloat dn = dfbm(vDPos*5.0);\nif (uDissolve > 0.0 && dn < uDissolve) discard;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uEdge * ((uDissolve > 0.0) ? step(dn, uDissolve + 0.07) * 4.0 : 0.0) + vec3(1.0,0.35,0.25) * uHit;');
  };
  m.customProgramCacheKey = () => 'vratu-dissolve';
}

// ---------- контекст материалов ----------
function makeCtx(T, spec) {
  const U = { uDissolve: { value: 0 }, uHit: { value: 0 }, uEdge: { value: new T.Color(spec.edge || '#ff8a2a') } };
  const cache = {};
  const ctx = { T, spec, U, mats: [], speed: 1, phase: 1 };
  ctx.mat = (key) => {
    if (cache[key]) return cache[key];
    if (!(spec.mats && spec.mats[key]) && ALIAS[key]) return (cache[key] = ctx.mat(ALIAS[key]));
    const def = (spec.mats && spec.mats[key]) || DEF[key] || key;
    const [kind, col = '#888888', flag] = def.split(':');
    const k = KIND[kind] || KIND.skin;
    const m = new T.MeshStandardMaterial({ color: col, roughness: k.r, metalness: k.m });
    if (EMI.has(kind)) { m.emissive = new T.Color(col); m.emissiveIntensity = k.emi; m.color.multiplyScalar(.35); }
    if (k.op) { m.transparent = true; m.opacity = k.op; m.depthWrite = kind !== 'ice'; }
    const pat = patternTexture(T, k.pat);
    if (pat) { m.map = pat; m.bumpMap = pat; m.bumpScale = .6; }
    if (flag === 'orn') {
      const c0 = new T.Color(col);
      const orn = ornamentTexture(T, '#' + c0.clone().offsetHSL(0, 0, .25).getHexString(), '#' + c0.clone().multiplyScalar(.35).getHexString());
      if (orn) { m.map = orn; m.color.set('#ffffff'); if (EMI.has(kind)) { m.emissiveMap = orn; m.emissive.set(col); } }
    }
    m.userData = { kind, emi: m.emissiveIntensity, emiColor: m.emissive.clone(), color: m.color.clone() };
    if (kind === 'wingi' || k.op) m.side = T.DoubleSide;
    applyDissolve(m, U);
    ctx.mats.push(m);
    return (cache[key] = m);
  };
  return ctx;
}

// ---------- геометрия ----------
function geo(T, type, a, s) {
  switch (type) {
    case 'sph': return new T.SphereGeometry(a[0], s, Math.max(3, Math.round(s * .7)));
    case 'cap': return new T.CapsuleGeometry(a[0], Math.max(.001, a[1]), Math.max(1, Math.round(s / 4)), s);
    case 'cyl': return new T.CylinderGeometry(a[0], a[1], a[2], s, 1, !!a[3]);
    case 'cone': return new T.ConeGeometry(a[0], a[1], s, 1);
    case 'box': return new T.BoxGeometry(a[0], a[1], a[2]);
    case 'tor': return new T.TorusGeometry(a[0], a[1], Math.max(3, Math.round(s / 2.5)), s, a[2] || Math.PI * 2);
    case 'ico': return new T.IcosahedronGeometry(a[0], a[1] || 0);
    case 'oct': return new T.OctahedronGeometry(a[0], 0);
    case 'dod': return new T.DodecahedronGeometry(a[0], 0);
  }
  throw new Error('geo ' + type);
}
function M(c, parent, type, a, mk, pos, rot, scl, o = {}) {
  if (o.fine && c.lvl >= 2) return null;
  const s = Math.max(3, Math.round(c.s * (o.seg || 1)));
  const m = new c.T.Mesh(geo(c.T, type, a, s), c.mat(mk));
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  if (scl != null) typeof scl === 'number' ? m.scale.setScalar(scl) : m.scale.set(scl[0], scl[1], scl[2]);
  if (o.phase) m.userData.phase = o.phase;
  if (o.phaseMax) m.userData.phaseMax = o.phaseMax;
  parent.add(m); return m;
}
function G(c, parent, pos, rot) { const g = new c.T.Group(); if (pos) g.position.set(pos[0], pos[1], pos[2]); if (rot) g.rotation.set(rot[0], rot[1], rot[2]); parent.add(g); return g; }
const PI = Math.PI;

// ---------- общие детали головы ----------
function eyes(c, head, r, y, z, x, n = 1) {
  if (n === 1) { M(c, head, 'sph', [r * 1.6], 'eye', [0, y, z], null, null, { seg: .6 }); return; }
  for (const sx of [-1, 1]) M(c, head, 'sph', [r], 'eye', [sx * x, y, z], null, null, { seg: .6 });
  if (n === 4) for (const sx of [-1, 1]) M(c, head, 'sph', [r * .7], 'eye', [sx * x * .5, y + r * 1.6, z * .95], null, null, { seg: .5, fine: 1 });
}
function horns(c, head, type, hs, mk = 'horn') {
  if (!type) return;
  for (const sx of [-1, 1]) {
    if (type === 'saiga') { const g = G(c, head, [sx * hs * .25, hs * .8, -hs * .1], [-.35, 0, sx * -.1]); M(c, g, 'cone', [hs * .12, hs * 1.5], mk, [0, hs * .75, 0], null, null, { seg: .5 }); for (let i = 0; i < 3; i++) M(c, g, 'tor', [hs * .1, hs * .025], mk, [0, hs * (.25 + i * .3), 0], [PI / 2, 0, 0], null, { seg: .5, fine: 1 }); }
    else if (type === 'ram') { M(c, head, 'tor', [hs * .45, hs * .16, PI * 1.5], mk, [sx * hs * .7, hs * .4, -hs * .25], [0, PI / 2, 0], null, { seg: .7 }); }
    else if (type === 'goat') { const g = G(c, head, [sx * hs * .3, hs * .7, -hs * .2], [-.9, 0, sx * -.25]); M(c, g, 'cone', [hs * .16, hs * 1.6], mk, [0, hs * .8, 0], null, null, { seg: .5 }); }
    else if (type === 'antler') { const g = G(c, head, [sx * hs * .4, hs * .7, -hs * .2], [-.3, 0, sx * -.6]); M(c, g, 'cyl', [hs * .05, hs * .08, hs * 1.6], mk, [0, hs * .8, 0], null, null, { seg: .4 }); for (let i = 0; i < 3; i++) M(c, g, 'cone', [hs * .05, hs * .7], mk, [sx * hs * .15, hs * (.6 + i * .4), 0], [0, 0, sx * -.7], null, { seg: .4, fine: 1 }); }
    else if (type === 'demon') { const g = G(c, head, [sx * hs * .45, hs * .75, 0], [-.3, 0, sx * -.7]); M(c, g, 'cone', [hs * .18, hs * 1.3], mk, [0, hs * .6, 0], null, null, { seg: .5 }); const g2 = G(c, g, [0, hs * 1.2, 0], [0, 0, sx * 1.0]); M(c, g2, 'cone', [hs * .09, hs * .7], mk, [0, hs * .3, 0], null, null, { seg: .4, fine: 1 }); }
    else if (type === 'dragon') { const g = G(c, head, [sx * hs * .35, hs * .45, -hs * .5], [-1.9, 0, sx * -.25]); M(c, g, 'cone', [hs * .12, hs * 1.8], mk, [0, hs * .9, 0], null, null, { seg: .5 }); }
    else if (type === 'stub') { M(c, head, 'cone', [hs * .12, hs * .4], mk, [sx * hs * .4, hs * .85, 0], [0, 0, sx * -.3], null, { seg: .4 }); }
  }
}
function extras(c, at, list) {
  for (const p of list || []) {
    const [where, type, a, mk, pos, rot, scl, o = {}] = p;
    const par = at[where] || at.body; if (!par) continue;
    M(c, par, type, a, mk, pos, rot, scl, o);
    if (o.mirror && pos) M(c, par, type, a, mk, [-pos[0], pos[1], pos[2]], rot ? [rot[0], -rot[1], -rot[2]] : null, scl, o);
  }
}
function weapon(c, hand, w, ref) {
  if (!w) return;
  const g = G(c, hand, [0, -ref * .02, 0], [PI / 2, 0, 0]);
  const L = ref;
  if (w === 'sword') { M(c, g, 'box', [L * .035, L * .5, L * .012], 'metal', [0, L * .3, 0]); M(c, g, 'box', [L * .16, L * .025, L * .03], 'gold', [0, L * .04, 0]); M(c, g, 'cyl', [L * .015, L * .015, L * .1], 'leather', [0, -L * .02, 0], null, null, { seg: .4 }); }
  else if (w === 'spear') { M(c, g, 'cyl', [L * .012, L * .012, L * 1.1], 'wood', [0, L * .25, 0], null, null, { seg: .4 }); M(c, g, 'cone', [L * .03, L * .14, 4], 'metal', [0, L * .86, 0], null, null, { seg: .4 }); M(c, g, 'tor', [L * .02, L * .006], 'cloth', [0, L * .76, 0], [PI / 2, 0, 0], null, { fine: 1, seg: .5 }); }
  else if (w === 'staff') { M(c, g, 'cyl', [L * .014, L * .018, L * .95], 'wood', [0, L * .2, 0], null, null, { seg: .4 }); M(c, g, 'ico', [L * .05, 0], 'rune', [0, L * .72, 0]); M(c, g, 'tor', [L * .05, L * .008], 'gold', [0, L * .72, 0], null, null, { fine: 1, seg: .5 }); }
  else if (w === 'hammer') { M(c, g, 'cyl', [L * .015, L * .015, L * .5], 'wood', [0, L * .15, 0], null, null, { seg: .4 }); M(c, g, 'box', [L * .2, L * .1, L * .1], 'metal', [0, L * .4, 0]); }
  else if (w === 'club') { M(c, g, 'cyl', [L * .06, L * .025, L * .7], 'wood', [0, L * .3, 0], null, null, { seg: .5 }); for (let i = 0; i < 4; i++) M(c, g, 'cone', [L * .015, L * .06], 'bone', [Math.cos(i * 1.6) * L * .06, L * (.45 + i * .05), Math.sin(i * 1.6) * L * .06], [0, 0, Math.cos(i * 1.6) * -1.4], null, { fine: 1, seg: .3 }); }
  else if (w === 'bow') { M(c, g, 'tor', [L * .3, L * .012, PI * .9], 'wood', [0, L * .1, 0], [0, PI / 2, PI * .55], null, { seg: .8 }); }
  else if (w === 'dombra') { M(c, g, 'sph', [L * .09], 'wood', [0, L * .05, 0], null, [1, 1.4, .45]); M(c, g, 'box', [L * .03, L * .45, L * .02], 'wood', [0, L * .35, 0]); }
  else if (w === 'drum') { M(c, g, 'cyl', [L * .16, L * .16, L * .04], 'hide', [0, L * .02, L * .05], [PI / 2, 0, 0], null, { seg: .8 }); M(c, g, 'tor', [L * .16, L * .01], 'trim', [0, L * .02, L * .05], null, null, { seg: .8 }); }
  else if (w === 'tongs') { M(c, g, 'box', [L * .02, L * .4, L * .02], 'metal', [L * .015, L * .2, 0], [0, 0, .06]); M(c, g, 'box', [L * .02, L * .4, L * .02], 'metal', [-L * .015, L * .2, 0], [0, 0, -.06]); }
  else if (w === 'scales') { M(c, g, 'cyl', [L * .006, L * .006, L * .25], 'gold', [0, L * .1, 0], null, null, { seg: .3 }); M(c, g, 'cyl', [L * .05, L * .04, L * .01], 'gold', [0, L * .2, 0], null, null, { seg: .6 }); }
  else if (w === 'claws') { for (let i = -1; i <= 1; i++) M(c, g, 'cone', [L * .012, L * .18], 'metal', [i * L * .025, L * .1, 0], null, null, { seg: .3 }); }
}

// ---------- архетипы ----------
function quad(c, p) {
  const L = p.len ?? 1.2, R = p.r ?? .3, H = p.h ?? .6, lr = p.legR ?? R * .24, hs = p.head ?? R * .7;
  const by = H + R * .5;
  const body = G(c, c.pose, [0, by, 0]);
  M(c, body, 'cap', [R, Math.max(.01, L - 2 * R)], 'body', [0, 0, 0], [PI / 2, 0, 0], [1, p.bodyY ?? .92, 1]);
  M(c, body, 'sph', [R * .85], 'belly', [0, -R * .28, 0], null, [.95, .7, (L / (2 * R)) * .85], { fine: 1 });
  for (let i = 0; i < (p.hump || 0); i++) M(c, body, 'sph', [R * .55], 'body', [0, R * .75, p.hump === 2 ? (i ? -1 : 1) * L * .2 : 0], null, [1, 1.15, 1.1]);
  for (let i = 0; i < (p.spikes || 0); i++) M(c, body, 'cone', [R * .12, R * .6], p.spikeMat || 'horn', [0, R * .9, L * .4 - i * L * .8 / Math.max(1, p.spikes - 1)], [-.3, 0, 0], null, { seg: .4 });
  if (p.shell) M(c, body, 'sph', [R * 1.15], p.shell, [0, R * .15, 0], null, [1, .7, L / (2 * R) * .9]);
  const legs = [], n = p.legsN || 4, fz = L / 2 - R * .45;
  const zs = n === 6 ? [fz, 0, -fz] : [fz, -fz];
  let hand;
  zs.forEach((z, zi) => [-1, 1].forEach((sx) => {
    const pv = G(c, body, [sx * R * .58, -R * .3, z]);
    M(c, pv, 'cap', [lr, H * .4], 'body', [0, -H * .28, 0]);
    const kn = G(c, pv, [0, -H * .55, 0]);
    M(c, kn, 'cap', [lr * .7, H * .3], p.legMat || 'body', [0, -H * .18, 0]);
    const fy = -(H * .45 + R * .2) + lr * .6;
    M(c, kn, 'sph', [lr * .85], p.hoof || 'claw', [0, fy, lr * .3], null, [1, .7, 1.25], { seg: .6 });
    legs.push({ p: pv, k: kn, off: (zi % 2 ? PI : 0) + (sx > 0 ? PI : 0), front: zi === 0 });
    if (zi === 0 && sx < 0) hand = G(c, kn, [0, fy, lr * .5]);
  }));
  const nk = G(c, body, [0, R * .3, L / 2 - R * .2], [PI / 2 - (p.neckUp ?? .9), 0, 0]);
  const NL = p.neck ?? R * 1.1;
  if (NL > .01) M(c, nk, 'cyl', [R * .38 * (p.neckR ?? 1), R * .5 * (p.neckR ?? 1), NL], 'body', [0, NL / 2, 0]);
  if (p.mane) M(c, nk, 'box', [R * .12, NL * 1.05, R * .35], p.mane === true ? 'hair' : p.mane, [0, NL * .5, -R * .38]);
  const head = G(c, nk, [0, NL, 0], [-(PI / 2 - (p.neckUp ?? .9)), 0, 0]);
  M(c, head, 'sph', [hs], 'body', [0, hs * .2, 0], null, [.85, .85, 1.15]);
  const sn = p.snout ?? 1;
  if (sn > 0) M(c, head, 'cap', [hs * .45, hs * sn * .8], 'belly', [0, 0, hs * (.7 + sn * .3)], [PI / 2, 0, 0], [1, .85, 1]);
  const jaw = G(c, head, [0, -hs * .25, hs * .4]);
  if (sn > 0) M(c, jaw, 'cap', [hs * .3, hs * sn * .6], 'belly', [0, -hs * .05, hs * (.3 + sn * .3)], [PI / 2, 0, 0], null, { fine: 1 });
  if (p.tusks) for (const sx of [-1, 1]) M(c, jaw, 'cone', [hs * .08, hs * .6], 'horn', [sx * hs * .3, hs * .2, hs * .7 * sn + hs * .2], [-.4, 0, 0], null, { seg: .4 });
  if (p.ears === 'pointy') for (const sx of [-1, 1]) M(c, head, 'cone', [hs * .22, hs * .6], 'body', [sx * hs * .45, hs * .9, -hs * .2], [0, 0, sx * -.25], null, { seg: .4 });
  if (p.ears === 'long') for (const sx of [-1, 1]) M(c, head, 'cap', [hs * .16, hs * 1.4], 'body', [sx * hs * .25, hs * 1.5, -hs * .3], [-.2, 0, sx * -.12], [1, 1, .5], { seg: .5 });
  if (p.ears === 'round') for (const sx of [-1, 1]) M(c, head, 'sph', [hs * .25], 'body', [sx * hs * .55, hs * .8, -hs * .2], null, [1, 1, .4], { seg: .5 });
  if (p.ears === 'horse') for (const sx of [-1, 1]) M(c, head, 'cone', [hs * .14, hs * .55], 'body', [sx * hs * .3, hs * .95, -hs * .3], null, null, { seg: .4 });
  eyes(c, head, hs * .13, hs * .35, hs * .65, hs * .5, 2);
  horns(c, head, p.horns, hs);
  const tail = [];
  if (p.tail) {
    const t = p.tail; let prev = G(c, body, [0, R * .3, -L / 2 + R * .15], [t.lift ?? -.5, 0, 0]);
    const n2 = t.n || 3, sl = (t.len ?? R * 1.5) / n2;
    for (let i = 0; i < n2; i++) {
      const g = G(c, prev, i ? [0, 0, -sl] : [0, 0, 0], i ? [t.curl || 0, 0, 0] : null);
      const rr = (t.r ?? R * .18) * (1 - i / n2 * .6);
      if (t.bushy) M(c, g, 'sph', [rr * 1.6], t.mat || 'body', [0, 0, -sl * .5], null, [1, 1, 1.6]);
      else M(c, g, 'cap', [rr, sl * .8], t.mat || 'body', [0, 0, -sl * .5], [PI / 2, 0, 0], null, { seg: .6 });
      tail.push(g); prev = g;
    }
    if (t.tip) M(c, prev, t.tip === 'sting' ? 'cone' : 'sph', [sl * .3, sl * .8], t.tipMat || 'rune', [0, 0, -sl], [-PI / 2, 0, 0]);
  }
  const wings = [];
  if (p.wings) for (const sx of [-1, 1]) {
    const S = p.wings, pv = G(c, body, [sx * R * .7, R * .6, L * .2]);
    M(c, pv, 'box', [S * .5, R * .08, R * 1.4], p.wingMat || 'feather:#f4f0e8', [sx * S * .25, 0, 0]);
    const o = G(c, pv, [sx * S * .5, 0, 0]);
    M(c, o, 'box', [S * .5, R * .06, R * 1.1], p.wingMat || 'feather:#f4f0e8', [sx * S * .25, 0, -R * .15]);
    for (let i = 0; i < 3; i++) M(c, o, 'box', [S * .15, R * .04, R * .8], p.wingTip || 'feather:#e8d8a0', [sx * S * (.4 + i * .08), 0, -R * (.6 + i * .1)], [0, sx * (.3 + i * .15), 0], null, { fine: 1 });
    wings.push({ p: pv, o, side: sx });
  }
  return { weak: ['body', [0, R * .95, -L * .2], R * .16], ref: by + R, body, head, neck: nk, jaw, legs, tail, wings, at: { body, head, neck: nk, handR: hand, tail: tail[tail.length - 1] } };
}

function biped(c, p) {
  const H = p.h ?? 1.8, B = p.bulk ?? 1, legL = H * .46 * (p.legF ?? 1), tL = H * .3, w = H * .062 * B, armL = H * .36 * (p.armF ?? 1), hd = H * .072 * (p.headF ?? 1);
  const hip = G(c, c.pose, [0, p.float ? legL * .9 : legL, 0]);
  const legs = [];
  if (!p.float && !p.longRobe) for (const sx of [-1, 1]) {
    const pv = G(c, hip, [sx * w * 1.3, 0, 0]);
    M(c, pv, 'cap', [w * .95, legL * .4], p.legMat || 'cloth2', [0, -legL * .25, 0]);
    const kn = G(c, pv, [0, -legL * .5, 0]);
    M(c, kn, 'cap', [w * .75, legL * .38], p.bootMat || 'boot', [0, -legL * .24, 0]);
    M(c, kn, 'box', [w * 1.3, w * .6, w * 2.6], p.footMat || p.bootMat || 'boot', [0, -legL * .5 + w * .3, p.backFeet ? -w * .7 : w * .6]);
    legs.push({ p: pv, k: kn, off: sx > 0 ? PI : 0 });
  }
  if (p.float) M(c, hip, 'cone', [H * .14 * B, legL * 1.1], p.floatMat || 'cloth', [0, -legL * .5, 0], [PI, 0, 0]);
  const torso = G(c, hip, null, [p.hunch || 0, 0, 0]);
  M(c, torso, 'cap', [H * .11 * B, tL * .55], p.torsoMat || 'cloth', [0, tL * .5, 0], null, [1.2, 1, .78]);
  if (p.belly) M(c, torso, 'sph', [H * .13 * B], p.torsoMat || 'cloth', [0, tL * .3, H * .03], null, [1.1, 1, 1]);
  if (p.robe) {
    const rl = p.robe; M(c, hip, 'cyl', [H * .12 * B, H * .2 * B, rl], p.robeMat || 'cloth', [0, -rl / 2 + H * .05, 0], null, null, { seg: 1 });
    M(c, hip, 'tor', [H * .2 * B, H * .012], 'trim', [0, -rl + H * .05, 0], [PI / 2, 0, 0], null, { fine: 1 });
    M(c, hip, 'tor', [H * .125 * B, H * .015], p.beltMat || 'gold', [0, H * .05, 0], [PI / 2, 0, 0], null, { fine: 1 });
  }
  const arms = []; let handR, handL;
  for (const sx of [-1, 1]) {
    const pv = G(c, torso, [sx * H * .155 * B, tL * .92, 0], [0, 0, sx * .12]);
    M(c, pv, 'sph', [w * 1.15], p.shoulderMat || p.armMat || 'cloth', [0, 0, 0], null, null, { seg: .6 });
    M(c, pv, 'cap', [w * .8, armL * .38], p.armMat || 'cloth', [0, -armL * .25, 0]);
    const el = G(c, pv, [0, -armL * .5, 0]);
    M(c, el, 'cap', [w * .68, armL * .36], p.foreMat || p.armMat || 'cloth', [0, -armL * .22, 0]);
    const hn = G(c, el, [0, -armL * .48, 0]);
    M(c, hn, 'sph', [w * .75], p.handMat || 'handMat', [0, 0, 0], null, [1, 1.2, .8], { seg: .6 });
    if (p.claws) for (let i = -1; i <= 1; i++) M(c, hn, 'cone', [w * .12, w * (p.claws)], 'claw', [i * w * .3, -w * .9, w * .2], [PI, 0, 0], null, { seg: .3, fine: 1 });
    arms.push({ p: pv, e: el, side: sx });
    if (sx < 0) handR = hn; else handL = hn;
  }
  const nk = G(c, torso, [0, tL * 1.02, 0]);
  const head = G(c, nk, [0, H * .03, 0]);
  M(c, head, 'sph', [hd], p.headMat || 'skin', [0, hd, 0], null, [.92, 1.08, .98]);
  if (p.oneEye) M(c, head, 'sph', [hd * .28], 'eye', [0, hd * 1.15, hd * .82], null, null, { seg: .6 });
  else eyes(c, head, hd * .12, hd * 1.15, hd * .85, hd * .36, 2);
  M(c, head, 'cone', [hd * .12, hd * .3], p.headMat || 'skin', [0, hd * .9, hd * 1.0], [PI / 2, 0, 0], null, { seg: .4, fine: 1 });
  if (p.beard) M(c, head, 'cone', [hd * .45, hd * p.beard], p.beardMat || 'hair', [0, hd * .35 - hd * p.beard / 2 + hd * .2, hd * .65], [PI, 0, 0], null, { seg: .6 });
  if (p.mustache) for (const sx of [-1, 1]) M(c, head, 'cap', [hd * .06, hd * .4], p.beardMat || 'hair', [sx * hd * .2, hd * .65, hd * .9], [0, 0, sx * 1.2], null, { seg: .4, fine: 1 });
  if (p.hair === 'long') M(c, head, 'cap', [hd * .9, H * .35], 'hair', [0, hd * .2 - H * .12, -hd * .35], null, [1, 1, .5]);
  if (p.hair === 'braids') for (const sx of [-1, 1]) M(c, head, 'cap', [hd * .14, H * .25], 'hair', [sx * hd * .55, hd * .2 - H * .08, -hd * .2], null, null, { seg: .5 });
  if (p.hair === 'wild') for (let i = 0; i < 7; i++) M(c, head, 'cone', [hd * .25, hd * 1.2], 'hair', [Math.sin(i) * hd * .7, hd * 1.3, -hd * .4 + Math.cos(i * 2) * hd * .3], [-.8 + Math.cos(i) * .4, 0, Math.sin(i) * .9], null, { seg: .4 });
  horns(c, head, p.horns, hd * 1.2);
  const hat = p.hat;
  if (hat === 'takiya') { M(c, head, 'cyl', [hd * .86, hd * .95, hd * .4], p.hatMat || 'trim', [0, hd * 1.75, 0]); M(c, head, 'sph', [hd * .86], p.hatMat || 'trim', [0, hd * 1.95, 0], null, [1, .35, 1], { fine: 1 }); }
  if (hat === 'borik') { M(c, head, 'tor', [hd * .92, hd * .32], 'fur:#3a2a1c', [0, hd * 1.6, 0], [PI / 2, 0, 0]); M(c, head, 'cone', [hd * .88, hd * 1.0], p.hatMat || 'cloth', [0, hd * 2.1, 0]); M(c, head, 'sph', [hd * .12], 'gold', [0, hd * 2.6, 0], null, null, { fine: 1, seg: .5 }); }
  if (hat === 'saukele') { M(c, head, 'cone', [hd * .85, hd * 4.2], p.hatMat || 'cloth:#b0182a:orn', [0, hd * 3.6, 0]); M(c, head, 'cyl', [hd * .95, hd * .95, hd * .5], 'gold:#d4a72c:orn', [0, hd * 1.7, 0]); M(c, head, 'sph', [hd * .25], 'fur:#f4f0ea', [0, hd * 5.75, 0], null, null, { seg: .5 }); for (const sx of [-1, 1]) M(c, head, 'cyl', [hd * .06, hd * .06, hd * 1.6], 'gold', [sx * hd * .95, hd * .9, 0], null, null, { fine: 1, seg: .3 }); M(c, head, 'cap', [hd * .7, H * .4], 'cloth:#f2efe6', [0, hd * 1.4 - H * .18, -hd * .5], null, [1, 1, .2], { fine: 1 }); }
  if (hat === 'helmet') { M(c, head, 'sph', [hd * 1.08], 'metal', [0, hd * 1.25, 0], null, [1, .85, 1]); M(c, head, 'cone', [hd * .2, hd * 1.1], 'gold', [0, hd * 2.4, 0], null, null, { seg: .5 }); M(c, head, 'cyl', [hd * 1.1, hd * 1.15, hd * .25], 'trim', [0, hd * 1.25, 0], null, null, { fine: 1 }); }
  if (hat === 'shaman') { M(c, head, 'cyl', [hd * .95, hd * 1.0, hd * .7], 'fur:#2a2018', [0, hd * 1.8, 0]); for (let i = 0; i < 5; i++) M(c, head, 'cone', [hd * .12, hd * 1.4], 'feather:#e8e2d0', [(i - 2) * hd * .3, hd * 2.6, -hd * .3], [-.3, 0, (i - 2) * -.25], [1, 1, .3], { seg: .4 }); }
  if (hat === 'crown') for (let i = 0; i < 6; i++) M(c, head, 'cone', [hd * .16, hd * .7], 'gold', [Math.sin(i * PI / 3) * hd * .75, hd * 2.05, Math.cos(i * PI / 3) * hd * .75], null, null, { seg: .4 });
  if (hat === 'hood') M(c, head, 'cone', [hd * 1.25, hd * 2.6], p.hatMat || 'cloth', [0, hd * 1.5, -hd * .2], [-.25, 0, 0]);
  const tail = [];
  if (p.tail) { let prev = G(c, hip, [0, 0, -w], [-.6, 0, 0]); for (let i = 0; i < 4; i++) { const g = G(c, prev, i ? [0, 0, -H * .12] : null, [.15, 0, 0]); M(c, g, 'cap', [w * (.6 - i * .1), H * .1], p.tail, [0, 0, -H * .06], [PI / 2, 0, 0], null, { seg: .5 }); tail.push(g); prev = g; } }
  const wings = [];
  if (p.wings) for (const sx of [-1, 1]) {
    const pv = G(c, torso, [sx * H * .06, tL * .8, -H * .08]);
    const S = H * (p.wingS ?? .6);
    if (p.wings === 'fairy') { M(c, pv, 'sph', [S * .5], 'wingi', [sx * S * .45, S * .15, 0], [0, 0, sx * .5], [1, .45, .05]); M(c, pv, 'sph', [S * .32], 'wingi', [sx * S * .32, -S * .25, 0], [0, 0, sx * -.4], [1, .5, .05], { fine: 1 }); }
    else { M(c, pv, 'cyl', [w * .3, w * .2, S], 'claw', [sx * S * .45, S * .2, 0], [0, 0, sx * -1.1], null, { seg: .3 }); M(c, pv, 'cone', [S * .5, S * .9], p.wings === 'feather' ? 'feather:#efe9dd' : 'wing', [sx * S * .45, -S * .05, 0], [0, PI / 2, sx * .4 + PI], [1, 1, .06]); }
    wings.push({ p: pv, side: sx, fold: true });
  }
  weapon(c, handR, p.weapon, H);
  if (p.shield) M(c, handL, 'cyl', [H * .14, H * .14, H * .02], 'trim', [H * .02, 0, 0], [0, 0, PI / 2], null, { seg: .8 });
  return { weak: ['chest', [0, tL * .6, -H * .085], H * .03], ref: H, body: hip, torso, head, neck: nk, legs, arms, tail, wings, biped: true, at: { body: hip, chest: torso, head, neck: nk, handR, handL, tail: tail[3] } };
}

function flyer(c, p) {
  const S = p.span ?? 1.2, Bd = p.body ?? .16, y0 = p.y ?? S * .5;
  const body = G(c, c.pose, [0, y0, 0]);
  M(c, body, 'sph', [Bd], 'body', [0, 0, 0], null, [.8, .8, 1.55]);
  M(c, body, 'sph', [Bd * .8], 'belly', [0, -Bd * .2, Bd * .2], null, [.75, .7, 1.2], { fine: 1 });
  const head = G(c, body, [0, Bd * .45, Bd * 1.35]);
  M(c, head, 'sph', [Bd * .55 * (p.headF ?? 1)], p.headMat || 'headMat', [0, 0, 0]);
  if (p.beak !== 0) M(c, head, 'cone', [Bd * .18, Bd * .7 * (p.beak ?? 1)], 'horn', [0, -Bd * .08, Bd * .7], [PI / 2 + .25, 0, 0], null, { seg: .5 });
  if (p.fangs) for (const sx of [-1, 1]) M(c, head, 'cone', [Bd * .05, Bd * .25], 'bone', [sx * Bd * .12, -Bd * .3, Bd * .4], [PI, 0, 0], null, { seg: .3, fine: 1 });
  eyes(c, head, Bd * .09, Bd * .1, Bd * .42, Bd * .3, 2);
  if (p.crest) for (let i = 0; i < 3; i++) M(c, head, 'cone', [Bd * .1, Bd * .7], p.crest, [0, Bd * .5, -Bd * (.1 + i * .2)], [-.7 - i * .2, 0, 0], [1, 1, .3], { seg: .4 });
  if (p.ears) for (const sx of [-1, 1]) M(c, head, 'cone', [Bd * .18, Bd * .6], 'body', [sx * Bd * .3, Bd * .45, 0], null, null, { seg: .4 });
  const wings = [];
  const wm = p.wing === 'membrane' ? 'wing' : p.wing === 'insect' ? 'wingi' : (p.wingMat || 'body');
  for (const sx of [-1, 1]) {
    const pv = G(c, body, [sx * Bd * .55, Bd * .35, Bd * .2]);
    if (p.wing === 'insect') {
      M(c, pv, 'sph', [S * .3], 'wingi', [sx * S * .28, 0, 0], [0, sx * .3, 0], [1, .03, .35]);
      M(c, pv, 'sph', [S * .22], 'wingi', [sx * S * .2, 0, -Bd * 1.2], [0, sx * -.3, 0], [1, .03, .3], { fine: 1 });
      wings.push({ p: pv, side: sx });
    } else {
      M(c, pv, 'box', [S * .26, Bd * .12, Bd * 1.7], wm, [sx * S * .13, 0, 0]);
      const o = G(c, pv, [sx * S * .26, 0, 0]);
      M(c, o, 'box', [S * .24, Bd * .08, Bd * 1.3], wm, [sx * S * .12, 0, -Bd * .1]);
      if (p.wing !== 'membrane') for (let i = 0; i < 3; i++) M(c, o, 'box', [S * .08, Bd * .05, Bd * .9], p.tipMat || 'feather:#2a241e', [sx * S * (.2 + i * .05), 0, -Bd * (.5 + i * .1)], [0, sx * (.3 + i * .15), 0], null, { fine: 1 });
      else M(c, o, 'cone', [Bd * .05, S * .12], 'claw', [sx * S * .24, 0, Bd * .5], [0, 0, sx * PI / 2], null, { seg: .3, fine: 1 });
      wings.push({ p: pv, o, side: sx });
    }
  }
  if (p.tailFan !== 0) M(c, body, 'box', [Bd * 1.1, Bd * .08, Bd * 1.2], p.tailMat || 'body', [0, 0, -Bd * 1.9], [.15, 0, 0]);
  let hand = body;
  if (p.legs !== 0) for (const sx of [-1, 1]) {
    const g = G(c, body, [sx * Bd * .3, -Bd * .6, 0]);
    M(c, g, 'cyl', [Bd * .05, Bd * .05, Bd * .6], 'horn', [0, -Bd * .3, 0], null, null, { seg: .3 });
    for (let i = -1; i <= 1; i++) M(c, g, 'cone', [Bd * .04, Bd * .25], 'claw', [i * Bd * .06, -Bd * .62, Bd * .1], [PI / 2 + .5, 0, 0], null, { seg: .3, fine: 1 });
    if (sx < 0) hand = G(c, g, [0, -Bd * .65, 0]);
  }
  return { weak: ['body', [0, Bd * .75, -Bd * .3], Bd * .22], ref: y0 + Bd, body, head, wings, legs: [], tail: [], flyer: true, at: { body, head, handR: hand } };
}

function serpent(c, p) {
  const n = p.n ?? 10, R = p.r ?? .25, sl = p.seg ?? R * 1.5, y0 = R + (p.y ?? 0);
  const spine = G(c, c.pose, [0, y0, p.z ?? sl * n * .35]);
  const segs = []; let prev = spine; const legs = []; const wings = [];
  for (let i = 0; i < n; i++) {
    const g = G(c, prev, i ? [0, 0, -sl] : null);
    const rr = R * (1 - (i / n) * .78);
    M(c, g, 'sph', [rr], 'body', [0, 0, -sl * .5], null, [1, .86, sl / rr * .75]);
    if (p.belly !== 0) M(c, g, 'sph', [rr * .8], 'belly', [0, -rr * .3, -sl * .5], null, [1, .55, sl / rr * .7], { fine: 1 });
    if (p.spikes && i % 1 === 0) M(c, g, 'cone', [rr * .2, rr * .8], p.spikeMat || 'horn', [0, rr * .9, -sl * .5], [-.4, 0, 0], [1, 1, .4], { seg: .4, fine: i % 2 });
    if (p.legs && (i === 1 || i === Math.floor(n * .45))) for (const sx of [-1, 1]) {
      const pv = G(c, g, [sx * rr * .8, -rr * .3, -sl * .4], [0, 0, sx * .6]);
      M(c, pv, 'cap', [rr * .22, R * 1.4], 'body', [0, -R * .9, 0], null, null, { seg: .6 });
      M(c, pv, 'cone', [rr * .2, rr * .5], 'claw', [0, -R * 1.8, rr * .2], [PI / 2, 0, 0], null, { seg: .4, fine: 1 });
      legs.push({ p: pv, k: pv, off: sx > 0 ? PI : 0 });
    }
    if (p.wings && i === 1) for (const sx of [-1, 1]) {
      const pv = G(c, g, [sx * rr * .7, rr * .6, -sl * .4]);
      const S = R * p.wings;
      M(c, pv, 'cyl', [rr * .1, rr * .06, S], 'horn', [sx * S * .5, 0, 0], [0, 0, PI / 2], null, { seg: .3 });
      const o = G(c, pv, [sx * S, 0, 0]);
      M(c, o, 'cyl', [rr * .06, rr * .03, S * .8], 'horn', [sx * S * .4, 0, -S * .1], [0, 0, PI / 2], null, { seg: .3 });
      M(c, pv, 'box', [S, rr * .04, S * .8], 'wing', [sx * S * .5, 0, -S * .4]);
      M(c, o, 'box', [S * .8, rr * .03, S * .6], 'wing', [sx * S * .4, 0, -S * .35]);
      wings.push({ p: pv, o, side: sx });
    }
    segs.push(g); prev = g;
  }
  if (p.tailTip) M(c, prev, 'cone', [R * .3, R * 1.2], p.tailTip, [0, 0, -sl * 1.2], [-PI / 2, 0, 0], [1, 1, .3]);
  const nk = G(c, spine, [0, R * .2, sl * .3], [-(p.rise ?? 0), 0, 0]);
  if (p.rise) M(c, nk, 'cap', [R * .7, R * 2], 'body', [0, R * 1.0, 0], null, null, { seg: .8 });
  const hs = R * (p.headF ?? 1.05);
  const head = G(c, nk, [0, p.rise ? R * 2 : 0, p.rise ? 0 : sl * .3], [p.rise ?? 0, 0, 0]);
  M(c, head, 'sph', [hs], 'body', [0, 0, 0], null, [.95, .75, 1.3]);
  M(c, head, 'box', [hs * 1.1, hs * .4, hs * 1.4], 'body', [0, hs * .05, hs * 1.0], null, null);
  const jaw = G(c, head, [0, -hs * .3, hs * .2]);
  M(c, jaw, 'box', [hs * 1.0, hs * .25, hs * 1.4], 'belly', [0, -hs * .05, hs * .75]);
  if (p.fangs !== 0) for (const sx of [-1, 1]) M(c, head, 'cone', [hs * .06, hs * .35], 'bone', [sx * hs * .4, -hs * .25, hs * 1.5], [PI, 0, 0], null, { seg: .3, fine: 1 });
  eyes(c, head, hs * .14, hs * .38, hs * .65, hs * .55, 2);
  horns(c, head, p.horns, hs);
  if (p.whiskers) for (const sx of [-1, 1]) M(c, head, 'cyl', [hs * .03, hs * .01, hs * 2.6], p.whiskers, [sx * hs * .9, -hs * .1, hs * 1.3], [0.6, 0, sx * 1.1], null, { seg: .3, fine: 1 });
  if (p.mane) for (let i = 0; i < 4; i++) M(c, head, 'cone', [hs * .2, hs * 1.0], p.mane, [0, hs * .6, -hs * (.3 + i * .35)], [-1.1, 0, 0], [1, 1, .3], { seg: .4 });
  return { weak: [null, [0, R * .55, -sl * .5], R * .22], ref: y0 + R, body: spine, head, neck: nk, jaw, segs, legs, wings, tail: [], serpent: true, at: { body: segs[Math.floor(n / 3)], head, handR: jaw, tail: prev, neck: nk } };
}

function slime(c, p) {
  const R = p.r ?? .5;
  const body = G(c, c.pose, [0, R * .8, 0]);
  if (p.shroom) {
    M(c, body, 'cyl', [R * .35, R * .45, R * 1.2], 'skin', [0, -R * .2, 0]);
    M(c, body, 'sph', [R], 'body', [0, R * .45, 0], null, [1, .55, 1]);
    for (let i = 0; i < 7; i++) M(c, body, 'sph', [R * .12], 'belly', [Math.sin(i * 2.4) * R * .65, R * .85 - Math.abs(Math.sin(i)) * R * .1, Math.cos(i * 2.4) * R * .65], null, [1, .4, 1], { seg: .5, fine: 1 });
  } else {
    M(c, body, 'sph', [R], 'body', [0, 0, 0], null, [1, .8, 1]);
    for (let i = 0; i < (p.blobs ?? 4); i++) M(c, body, 'sph', [R * .28], 'body', [Math.sin(i * 1.7) * R * .85, -R * .45, Math.cos(i * 1.7) * R * .85], null, [1, .6, 1], { seg: .6, fine: 1 });
  }
  const head = G(c, body, [0, R * .25, R * .7]);
  eyes(c, head, R * .1, 0, R * .05, R * .3, p.eyes ?? 2);
  if (p.crown) { M(c, body, 'cyl', [R * .42, R * .38, R * .2], 'gold:#e2b23a:orn', [0, R * .85, 0]); for (let i = 0; i < 6; i++) M(c, body, 'cone', [R * .07, R * .3], 'gold', [Math.sin(i * PI / 3) * R * .4, R * 1.05, Math.cos(i * PI / 3) * R * .4], null, null, { seg: .4 }); }
  const hand = G(c, body, [-R * .7, 0, R * .5]);
  return { weak: ['body', [0, 0, 0], R * .2], ref: R * 1.6, body, head, legs: [], tail: [], slime: true, at: { body, head, handR: hand } };
}

function bug(c, p) {
  const B = p.size ?? .4, y0 = p.y ?? B * .6;
  const body = G(c, c.pose, [0, y0, 0]);
  M(c, body, 'sph', [B * .45], 'body', [0, 0, 0], null, [1, .7, 1.15]);
  M(c, body, 'sph', [B * .5 * (p.abd ?? 1)], p.abdMat || 'abdMat', [0, B * .1, -B * .95 * (p.abd ?? 1)], null, [1, .8, 1.3]);
  const head = G(c, body, [0, B * .05, B * .55]);
  M(c, head, 'sph', [B * .3], 'body', [0, 0, B * .1]);
  for (const sx of [-1, 1]) M(c, head, 'cone', [B * .05, B * .3], 'claw', [sx * B * .1, -B * .12, B * .4], [PI / 2 + .3, 0, sx * .3], null, { seg: .3 });
  eyes(c, head, B * .06, B * .12, B * .32, B * .14, p.eyes4 ? 4 : 2);
  if (p.antenna) for (const sx of [-1, 1]) M(c, head, 'cyl', [B * .015, B * .015, B * .9], 'claw', [sx * B * .15, B * .45, B * .4], [.6, 0, sx * -.4], null, { seg: .3, fine: 1 });
  const legs = [];
  const np = p.legs ?? 3;
  for (let i = 0; i < np; i++) for (const sx of [-1, 1]) {
    const pv = G(c, body, [sx * B * .3, 0, B * (.25 - i * .22)], [0, sx * (.3 - i * .25), sx * .5]);
    M(c, pv, 'cyl', [B * .05, B * .04, B * .8 * (p.legF ?? 1)], 'legs', [sx * B * .4 * (p.legF ?? 1), 0, 0], [0, 0, PI / 2], null, { seg: .4 });
    const kn = G(c, pv, [sx * B * .8 * (p.legF ?? 1), 0, 0], [0, 0, -sx * 1.6]);
    M(c, kn, 'cyl', [B * .04, B * .015, B * 1.0 * (p.legF ?? 1)], 'legs', [sx * B * .5 * (p.legF ?? 1), 0, 0], [0, 0, PI / 2], null, { seg: .4 });
    legs.push({ p: pv, k: kn, off: (i % 2 ? PI : 0) + (sx > 0 ? PI : 0), bug: true });
  }
  let hand = head; const arms = [];
  if (p.pincers) for (const sx of [-1, 1]) {
    const pv = G(c, body, [sx * B * .35, B * .05, B * .5], [0, sx * -.5, 0]);
    M(c, pv, 'cap', [B * .08, B * .5], 'body', [0, 0, B * .3], [PI / 2, 0, 0], null, { seg: .5 });
    const cl = G(c, pv, [0, 0, B * .65], [0, sx * .9, 0]);
    M(c, cl, 'sph', [B * .17 * (p.pincers)], 'body', [0, 0, B * .15], null, [.8, .6, 1.3], { seg: .7 });
    M(c, cl, 'cone', [B * .06 * p.pincers, B * .35 * p.pincers], 'claw', [sx * B * .06, 0, B * .45], [PI / 2, 0, 0], null, { seg: .4 });
    M(c, cl, 'cone', [B * .05 * p.pincers, B * .3 * p.pincers], 'claw', [-sx * B * .06, 0, B * .42], [PI / 2, 0, 0], null, { seg: .4, fine: 1 });
    arms.push({ p: pv, e: cl, side: sx, pincer: true });
    if (sx < 0) hand = cl;
  }
  const tail = [];
  if (p.stinger) {
    let prev = G(c, body, [0, B * .2, -B * 1.8 * (p.abd ?? 1)], [.6, 0, 0]);
    for (let i = 0; i < 5; i++) { const g = G(c, prev, i ? [0, 0, -B * .3] : null, [i ? .45 : 0, 0, 0]); M(c, g, 'sph', [B * (.14 - i * .015)], 'body', [0, 0, -B * .15], null, [1, 1, 1.6], { seg: .6 }); tail.push(g); prev = g; }
    M(c, prev, 'cone', [B * .07, B * .4], p.stingMat || 'stingMat', [0, 0, -B * .45], [-PI / 2, 0, 0], null, { seg: .5 });
  }
  const wings = [];
  if (p.wings) for (const sx of [-1, 1]) { const pv = G(c, body, [sx * B * .2, B * .3, 0]); M(c, pv, 'sph', [B * p.wings], 'wingi', [sx * B * p.wings * .9, 0, -B * .3], [0, sx * .5, 0], [1, .03, .4]); wings.push({ p: pv, side: sx, insect: true }); }
  return { weak: ['abd', [0, B * .5, -B * .95 * (p.abd ?? 1)], B * .1], ref: y0 + B * .5, body, head, legs, arms, tail, wings, bug: true, at: { body, head, handR: hand, tail: tail[4] } };
}

function fish(c, p) {
  const L = p.len ?? .6, y0 = p.y ?? .6;
  const body = G(c, c.pose, [0, y0, 0]);
  M(c, body, 'sph', [L * .5], 'body', [0, 0, 0], null, [.35, .5, 1]);
  M(c, body, 'sph', [L * .42], 'belly', [0, -L * .08, L * .02], null, [.3, .35, .95], { fine: 1 });
  const head = G(c, body, [0, L * .03, L * .38]);
  eyes(c, head, L * .035, L * .03, L * .02, L * .14, 2);
  if (p.whiskers) for (const sx of [-1, 1]) M(c, head, 'cyl', [L * .008, L * .004, L * .3], 'horn', [sx * L * .06, -L * .1, L * .1], [.9, 0, sx * .3], null, { seg: .3, fine: 1 });
  M(c, body, 'cone', [L * .2, L * .35], 'fin', [0, L * .25, -L * .05], [-.5, 0, 0], [.1, 1, 1], { seg: .5 });
  for (const sx of [-1, 1]) M(c, body, 'cone', [L * .08, L * .2], 'fin', [sx * L * .15, -L * .1, L * .15], [-1.9, 0, sx * .9], [.2, 1, 1], { seg: .4, fine: 1 });
  const t = G(c, body, [0, 0, -L * .45]);
  M(c, t, 'cone', [L * .22, L * .3], 'fin', [0, 0, -L * .12], [PI / 2, 0, 0], [.12, 1, 1], { seg: .5 });
  return { weak: ['body', [0, L * .2, 0], L * .05], ref: y0 + L * .3, body, head, legs: [], tail: [t], fish: true, at: { body, head, handR: head } };
}

function wisp(c, p) {
  const R = p.r ?? .3, y0 = p.y ?? 1.2;
  const body = G(c, c.pose, [0, y0, 0]);
  M(c, body, 'sph', [R * .55], p.coreMat || 'fire', [0, 0, 0]);
  if (p.shell !== 0) M(c, body, 'sph', [R], p.shellMat || 'slime', [0, 0, 0], null, [1, 1.1, 1]);
  if (p.flame) for (let i = 0; i < 5; i++) M(c, body, 'cone', [R * .35, R * 1.4], p.flame, [Math.sin(i * 1.26) * R * .4, R * .6, Math.cos(i * 1.26) * R * .4], [Math.cos(i * 1.26) * .3, 0, -Math.sin(i * 1.26) * .3], null, { seg: .5 });
  const head = G(c, body, [0, R * .1, R * .7]);
  if (p.eye) M(c, head, 'sph', [R * .22], 'eye', [0, 0, 0], null, null, { seg: .6 });
  const orbit = G(c, body, null);
  for (let i = 0; i < (p.shards ?? 4); i++) M(c, orbit, p.shardType || 'oct', [R * .25 * (p.shardS ?? 1)], p.shardMat || 'rune', [Math.cos(i / (p.shards ?? 4) * PI * 2) * R * 1.7, Math.sin(i * 2) * R * .4, Math.sin(i / (p.shards ?? 4) * PI * 2) * R * 1.7], null, [1, 1.6, 1]);
  if (p.tailCone) M(c, body, 'cone', [R * .6, R * 2.2], p.shellMat || 'slime', [0, -R * 1.3, 0], [PI, 0, 0]);
  return { weak: ['body', [0, 0, 0], R * .3], ref: y0 + R, body, head, legs: [], tail: [], orbit, wisp: true, at: { body, head, handR: orbit } };
}

const ARCH = { quad, biped, flyer, serpent, slime, bug, fish, wisp };

// ---------- сборка уровня LOD ----------
function buildLevel(ctx, spec, lvl, s) {
  const T = ctx.T; const c = Object.assign(Object.create(ctx), { lvl, s });
  c.pose = new T.Group(); c.pose.name = 'pose';
  const level = new T.Group(); level.add(c.pose);
  const rig = ARCH[spec.arch](c, spec.p || {});
  rig.pose = c.pose; rig.at.root = c.pose;
  extras(c, rig.at, spec.parts);
  // слабое место
  const [wAt, wPos, wR] = spec.weak || rig.weak;
  const wp = rig.at[wAt] || rig.at.body;
  M(c, wp, 'ico', [wR, lvl ? 0 : 1], 'weak', wPos);
  if (lvl === 0) {
    const mk = (name, par, pos) => { const o = new T.Object3D(); o.name = name; if (pos) o.position.set(...pos); (par || rig.body).add(o); return o; };
    mk('head', rig.at.head); mk('WeakPoint', wp, wPos); mk('hand_R', rig.at.handR || rig.at.body);
  }
  level.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = lvl === 0; } });
  rig.base = { bodyY: rig.body.position.y };
  return { group: level, rig };
}
export function countTris(obj) {
  let n = 0;
  obj.traverse((o) => { if (o.isMesh && o.geometry) { const g = o.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  return Math.round(n);
}

// ---------- процедурная анимация ----------
const sm = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
function animate(rig, ctx, spec, state, t, st) {
  const r = rig.ref, sp = ctx.speed, pose = rig.pose;
  const gait = state === 'walk' ? 1 : state === 'run' ? 2 : 0;
  const f = (gait === 1 ? 1.3 : gait === 2 ? 2.4 : 0) * sp;
  const ph = t * f * PI * 2, amp = gait === 1 ? .42 : gait === 2 ? .8 : 0;
  pose.position.set(0, 0, 0); pose.rotation.set(0, 0, 0); pose.scale.set(1, 1, 1);
  // атака: замах WINDUP с, удар 0.12 с, возврат
  let w = 0, k = 0;
  if (state === 'attack') { const a = (st * sp) % 1.4; w = a < WINDUP ? sm(a / WINDUP) : a < WINDUP + .12 ? 1 - (a - WINDUP) / .12 : 0; k = a < WINDUP ? 0 : a < WINDUP + .12 ? (a - WINDUP) / .12 : a < .8 ? 1 : a < 1.2 ? 1 - (a - .8) / .4 : 0; }
  // тело
  const bob = Math.abs(Math.sin(ph)) * .035 * amp * r;
  rig.body.position.y = rig.base.bodyY + bob + (rig.flyer || rig.wisp ? Math.sin(t * 2) * .05 * r : 0);
  rig.body.scale.y = 1 + Math.sin(t * 2.2) * .012;
  if (rig.slime) { const q = gait ? Math.sin(ph * 1.5) * .12 : Math.sin(t * 2.5) * .05; const a2 = state === 'attack' ? -.3 * w + .35 * k : 0; rig.body.scale.set(1 - q * .5 - a2 * .4, 1 + q + a2, 1 - q * .5 - a2 * .4); rig.body.position.y = rig.base.bodyY * (1 + a2 * .5) + (gait ? Math.abs(Math.sin(ph * .75)) * .15 * r : 0); }
  pose.rotation.x = -.15 * w + .2 * k; pose.position.z = (-.06 * w + .18 * k) * r;
  // ноги
  for (const L of rig.legs || []) {
    const s1 = Math.sin(ph + L.off);
    if (L.bug) { L.p.rotation.x = 0; L.p.rotation.y = (L.p.userData.ry ??= L.p.rotation.y) + s1 * amp * .45 + (gait ? 0 : Math.sin(t * 3 + L.off) * .03); }
    else { L.p.rotation.x = s1 * amp - (rig.biped ? 0 : (L.front ? .25 * w : 0)); if (L.k !== L.p) L.k.rotation.x = rig.biped ? Math.max(0, -s1) * amp * 1.1 : -Math.max(0, s1) * amp * .9; }
  }
  // руки / клешни
  for (const A of rig.arms || []) {
    if (A.pincer) { A.p.rotation.x = -.5 * w + .2 * k + Math.sin(t * 2 + A.side) * .05; A.e.rotation.y = A.side * (.9 - .7 * w); continue; }
    const swing = Math.sin(ph + (A.side > 0 ? 0 : PI)) * amp * .7;
    if (A.side < 0 && state === 'attack') { A.p.rotation.x = -2.6 * w - .7 * k; A.e.rotation.x = -.7 * w; }
    else if (A.side > 0 && state === 'attack') { A.p.rotation.x = .4 * w - .3 * k; A.e.rotation.x = -.3; }
    else { A.p.rotation.x = swing + (gait ? 0 : Math.sin(t * 1.6) * .03); A.e.rotation.x = -.15 - (gait === 2 ? .8 : 0); }
  }
  if (rig.torso) rig.torso.rotation.y = state === 'attack' ? .45 * w - .5 * k : Math.sin(ph) * amp * .12;
  // голова
  if (rig.head) {
    const graze = spec.behavior === 'graze' && !gait && state === 'idle' ? sm(Math.sin(t * .4) * 2 - .2) : 0;
    rig.head.rotation.y = gait ? 0 : Math.sin(t * .6) * .25;
    if (rig.neck) rig.neck.rotation.x = (rig.neck.userData.rx ??= rig.neck.rotation.x) + graze * 1.0 - .3 * w + .4 * k;
    if (rig.jaw) rig.jaw.rotation.x = .45 * w + (state === 'idle' ? Math.max(0, Math.sin(t * 1.3)) * .06 : 0);
  }
  // хвост / сегменты
  rig.tail.forEach((g, i) => { g.rotation.y = Math.sin(t * (2 + gait) - i * .7) * (rig.fish ? .5 : .18) * (1 + gait * .5); if (rig.bug) g.rotation.x = (g.userData.rx ??= g.rotation.x) + .25 * w - .35 * k; });
  (rig.segs || []).forEach((g, i) => { g.rotation.y = Math.sin(t * (1.2 + gait * 1.2) * sp - i * .55) * (.12 + gait * .08) * (i ? 1 : .4); });
  if (rig.fish) rig.body.rotation.y = Math.sin(t * 3 * (1 + gait)) * .12;
  // крылья
  for (const W of rig.wings || []) {
    const fl = W.fold ? (gait ? 2 : .6) : W.insect || spec.p?.wing === 'insect' ? 14 : (gait === 2 ? 3.2 : gait ? 2.2 : 1.4);
    const A2 = W.fold ? .25 : .6 + (state === 'attack' ? .5 * w : 0);
    W.p.rotation.z = W.side * (Math.sin(t * fl * sp * PI * 2) * A2 + (W.fold ? 0 : .1));
    if (W.o) W.o.rotation.z = W.side * Math.sin(t * fl * sp * PI * 2 - .7) * .45;
  }
  if (rig.flyer) { rig.body.rotation.x = .3 * k - .2 * w + (gait ? .15 : 0); }
  if (rig.orbit) rig.orbit.rotation.y = t * (1.5 + gait + w * 4) * sp;
  if (rig.wisp) { const pls = 1 + Math.sin(t * 4) * .05 + .3 * w; rig.body.scale.set(pls, pls, pls); }
  // попадание
  if (state === 'hit') { const h = Math.min(st / .35, 1); pose.rotation.x = -.28 * Math.sin(h * PI); pose.position.z = -.08 * r * Math.sin(h * PI); }
  // смерть
  if (state === 'death') { const d = sm(st / .9); if (rig.flyer || rig.wisp) { pose.position.y = -rig.base.bodyY * d * .9; pose.rotation.z = d * 1.2; } else { pose.rotation.z = d * PI / 2 * .92; pose.position.y = d * r * .05; } }
}

// ---------- главная фабрика ----------
export function makeCreature(THREE, spec, meta, opts = {}) {
  const budget = BUDGET[meta.budget || meta.type] || 3000;
  const ctx = makeCtx(THREE, spec);
  let s = opts.seg || (meta.type === 'boss' ? 30 : 18), L0;
  for (;;) { L0 = buildLevel(ctx, spec, 0, s); if (countTris(L0.group) <= budget || s <= 5) break; L0.group.traverse((o) => o.geometry && o.geometry.dispose()); s -= 1; }
  const L1 = buildLevel(ctx, spec, 1, Math.max(5, Math.round(s * .55)));
  const L2 = buildLevel(ctx, spec, 2, Math.max(4, Math.round(s * .32)));
  const levels = [L0, L1, L2];
  const lod = new THREE.LOD(); lod.name = 'lod';
  const sc = spec.scale || 1; lod.scale.setScalar(sc);
  const root = new THREE.Group(); root.name = meta.id; root.add(lod);
  lod.add(L0.group); root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(L0.group); lod.remove(L0.group);
  const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const hRef = Math.max(size.x, size.y, size.z);
  lod.addLevel(L0.group, 0); lod.addLevel(L1.group, Math.max(6, hRef * 3.5)); lod.addLevel(L2.group, Math.max(15, hRef * 9));
  const tris = levels.map((l) => countTris(l.group));
  let state = opts.state || 'idle', t0 = 0, last = 0;
  const ud = root.userData;
  Object.assign(ud, {
    id: meta.id, meta, tris, budget, lod, levels: levels.map((l) => l.group), seg: s,
    hitbox: { type: 'box', size: [+size.x.toFixed(2), +size.y.toFixed(2), +size.z.toFixed(2)], center: [+ctr.x.toFixed(2), +ctr.y.toFixed(2), +ctr.z.toFixed(2)], capsule: { radius: +(Math.max(size.x, size.z) / 2 * .8).toFixed(2), height: +size.y.toFixed(2) } },
    behavior: spec.behavior || null, phases: spec.phases || null, phase: 1, windup: WINDUP,
    get state() { return state; },
    setState(s2, t = last) { if (s2 !== state) { state = s2; t0 = t; } },
    setPhase(n) {
      const P = (spec.phases || [])[n - 1]; if (!P) return; ud.phase = n; ctx.speed = P.speed || 1;
      for (const l of levels) l.group.traverse((o) => { if (o.isMesh) { const a = o.userData.phase || 1, b = o.userData.phaseMax || 9; o.visible = n >= a && n <= b; } });
      for (const m of ctx.mats) { const u = m.userData; if (u.emi > 0 && m.emissive) { m.emissiveIntensity = u.emi * (P.glow || 1); m.emissive.copy(P.rune && u.kind === 'rune' ? new THREE.Color(P.rune) : u.emiColor); } if (P.tint && (u.kind !== 'rune' && u.kind !== 'eye' && u.kind !== 'fire')) m.color.copy(u.color).lerp(new THREE.Color(P.tint), P.tintK ?? .35); }
      lod.scale.setScalar(sc * (P.scale || 1));
      if (P.edge) ctx.U.uEdge.value.set(P.edge);
    },
    update(t, s2) {
      last = t; if (s2) ud.setState(s2, t);
      let st = t - t0;
      if (state === 'hit' && st > .6) { state = 'idle'; t0 = t; st = 0; }
      ctx.U.uHit.value = state === 'hit' ? Math.max(0, 1 - st / .35) : 0;
      ctx.U.uDissolve.value = state === 'death' ? Math.min(1.05, Math.max(0, (st - .5) / 1.4)) : 0;
      for (const l of levels) animate(l.rig, ctx, spec, state, t, st);
    },
    reset() { state = 'idle'; t0 = last; ctx.U.uDissolve.value = 0; }
  });
  if (spec.phases) ud.setPhase(opts.phase || 1);
  if (opts.lod != null) { lod.autoUpdate = false; levels.forEach((l, i) => (l.group.visible = i === opts.lod)); }
  ud.update(0, state);
  return root;
}
