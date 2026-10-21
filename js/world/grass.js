// js/world/grass.js — трава (раздел 1.3.5): InstancedMesh из пучков по 3 лезвия (3 треугольника),
// колышется ветром в шейдере (makeToon wind), только вокруг игрока; раскладка детерминирована по клеткам.
import * as THREE from 'three';
import { makeToon } from '../render/toon.js';

// плотность по биому (порядок BIOME_IDS) и высота пучка
const DENSITY = { b_meadow: 1, b_forest: 0.75, b_swamp: 0.45, b_mountains: 0.35, b_desert_ruins: 0.06, b_volcano: 0 };
const HEIGHT = { b_meadow: 0.3, b_forest: 0.38, b_swamp: 0.6, b_mountains: 0.22, b_desert_ruins: 0.3, b_volcano: 0.25 };
const RADIUS = { quest: 20, phone: 22, pc_low: 30, pc_high: 45 };

function tuftGeometry() {
  const pos = [], col = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI + 0.3, c = Math.cos(a), s = Math.sin(a), w = 0.045, lean = 0.08 * (k - 1);
    pos.push(-c * w, 0, -s * w, c * w, 0, s * w, lean * s, 1, -lean * c);
    col.push(0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 1.15, 1.15, 1.05);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // нормали вверх: пучок освещён как земля под ним, без тёмных «изнанок»
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

const hash = (i, j, s) => {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export function createGrass({ terrain, sampler, preset, max, biomeIds }) {
  const R = RADIUS[preset] || 20;
  const spacing = R * Math.sqrt(Math.PI / max) * 1.05;
  const mat = makeToon({ vertexColors: true, wind: true });
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.InstancedMesh(tuftGeometry(), mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.name = 'grass';
  const color = new THREE.Color();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const w = new Float64Array(biomeIds.length);
  const nrm = { x: 0, y: 1, z: 0 };
  const dens = biomeIds.map((id) => DENSITY[id] ?? 0.3), hgt = biomeIds.map((id) => HEIGHT[id] ?? 0.4);
  const { n, step, colors } = terrain;
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  let cx = Infinity, cz = Infinity;
  const stats = { count: 0, rebuilds: 0, ms: 0, radius: R };
  let job = null; // пересборка идёт по строкам несколько кадров, ≤ BUDGET_MS за кадр
  const BUDGET_MS = 3;

  function start(x0, z0) {
    job = { x0, z0, i0: Math.floor((x0 - R) / spacing), i1: Math.ceil((x0 + R) / spacing),
      j: Math.floor((z0 - R) / spacing), j1: Math.ceil((z0 + R) / spacing), k: 0, ms: 0 };
  }

  function work(full) {
    const t0 = performance.now();
    const { x0, z0, i0, i1, j1 } = job;
    let k = job.k, j = job.j;
    for (; j <= j1 && k < max; j++) {
      if (!full && performance.now() - t0 > BUDGET_MS) break;
      for (let i = i0; i <= i1 && k < max; i++) {
        const x = (i + hash(i, j, 1)) * spacing, z = (j + hash(i, j, 2)) * spacing;
        const dx = x - x0, dz = z - z0, d2 = dx * dx + dz * dz;
        if (d2 > R * R) continue;
        sampler.biomeWeightsAt(x, z, w);
        let de = 0, he = 0;
        for (let b = 0; b < w.length; b++) { de += w[b] * dens[b]; he += w[b] * hgt[b]; }
        if (hash(i, j, 3) > de) continue;
        const h = sampler.heightAt(x, z);
        const water = w[biomeIds.indexOf('b_swamp')] > 0.5 ? 1.35 : 0.25;
        if (h < water) continue;
        if (he < 0.33 && h > 95) continue; // снег в горах без травы
        sampler.normalAt(x, z, nrm);
        if (nrm.y < 0.86) continue;
        const fade = 1 - Math.max(0, (Math.sqrt(d2) - R * 0.75) / (R * 0.25)); // край — короче, без «стены»
        const sc = he * (0.7 + 0.6 * hash(i, j, 4)) * fade;
        p.set(x, h - 0.02, z);
        q.setFromAxisAngle(up, hash(i, j, 5) * Math.PI * 2);
        s.set(1 + hash(i, j, 6) * 0.6, sc, 1 + hash(i, j, 6) * 0.6);
        m4.compose(p, q, s);
        mesh.setMatrixAt(k, m4);
        const gi = Math.min(n - 1, Math.max(0, Math.round(x / step))), gj = Math.min(n - 1, Math.max(0, Math.round(z / step)));
        const o = (gj * n + gi) * 3;
        color.setRGB(lin(colors[o]) * 0.95, lin(colors[o + 1]) * 1.05, lin(colors[o + 2]) * 0.9);
        mesh.setColorAt(k, color);
        k++;
      }
    }
    job.k = k; job.j = j;
    job.ms += performance.now() - t0;
    const done = j > j1 || k >= max;
    mesh.count = done ? k : Math.max(k, mesh.count);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (done) {
      stats.count = k;
      stats.rebuilds++;
      stats.ms = +job.ms.toFixed(2);
      job = null;
    }
  }

  return {
    mesh,
    stats,
    update(head) {
      // пересобрать, когда ушли на четверть радиуса; первый раз (и после телепорта) — сразу целиком
      const far = Math.hypot(head.x - cx, head.z - cz);
      if (far > R * 0.25) {
        const jump = far > R;
        cx = head.x; cz = head.z;
        start(cx, cz);
        if (jump) work(true);
      }
      if (job) work(false);
    },
  };
}
