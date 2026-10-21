// js/world/chunks.js — чанки ландшафта (раздел 2.13.2): кольца LOD вокруг игрока.
// LOD0 — отдельные меши из пула (отсекаются по видимости), LOD1 и LOD2 — по одной склеенной
// геометрии на кольцо. Швы закрывают «юбки». Геометрия переиспользуется, без new/dispose в игре.
import * as THREE from 'three';

const CHUNK_M = 64;
const STRIDES = [1, 2, 4]; // шаг сетки LOD0/1/2 в клетках карты высот (2/4/8 м)
const HYSTERESIS = 0.5;    // центр колец сдвигается, когда игрок ушёл на полчанка за край

// сетка m × m и юбка по периметру; юбка в обе стороны, чтобы закрывать щели под любым углом
function makeTopology(m) {
  const perim = [];
  for (let i = 0; i < m - 1; i++) perim.push(i);                       // север, запад → восток
  for (let j = 0; j < m - 1; j++) perim.push(j * m + m - 1);           // восток, сверху вниз
  for (let i = m - 1; i > 0; i--) perim.push((m - 1) * m + i);         // юг, восток → запад
  for (let j = m - 1; j > 0; j--) perim.push(j * m);                   // запад, снизу вверх
  const L = perim.length, grid = m * m, verts = grid + L;
  const idx = [];
  for (let j = 0; j < m - 1; j++) {
    for (let i = 0; i < m - 1; i++) {
      const a = j * m + i, b = a + 1, c = a + m, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  for (let k = 0; k < L; k++) {
    const e0 = perim[k], e1 = perim[(k + 1) % L], s0 = grid + k, s1 = grid + (k + 1) % L;
    idx.push(e0, s0, e1, e1, s0, s1, e0, e1, s0, e1, s1, s0);
  }
  return { m, perim: Int32Array.from(perim), verts, index: Uint32Array.from(idx) };
}

export function createTerrainChunks({ terrain, rings, material, strides = STRIDES }) {
  const { n, step, heights, colors } = terrain;
  const cells = CHUNK_M / step;            // 32 клетки на чанк
  const count = Math.round((n - 1) / cells); // 24 × 24 чанка
  const lin = new Float32Array(256);       // sRGB → линейный цвет
  for (let i = 0; i < 256; i++) { const c = i / 255; lin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const topo = strides.map((s) => makeTopology(cells / s + 1));
  const group = new THREE.Group();
  group.name = 'terrain';

  // заполнить вершины чанка (cx, cz) уровня lod в массивы с вершины v0; вернуть [minY, maxY]
  function fill(cx, cz, lod, pos, nor, col, v0) {
    const s = strides[lod], T = topo[lod], m = T.m, skirt = step * s * 2 + 1;
    const gx0 = cx * cells, gz0 = cz * cells;
    let minY = Infinity, maxY = -Infinity;
    for (let j = 0; j < m; j++) {
      const gj = gz0 + j * s, jm = Math.max(0, gj - 1) * n, jp = Math.min(n - 1, gj + 1) * n;
      for (let i = 0; i < m; i++) {
        const gi = gx0 + i * s, o = gj * n + gi, v = (v0 + j * m + i) * 3, y = heights[o];
        pos[v] = gi * step; pos[v + 1] = y; pos[v + 2] = gj * step;
        const gx = (heights[gj * n + Math.min(n - 1, gi + 1)] - heights[gj * n + Math.max(0, gi - 1)]) / (2 * step);
        const gz = (heights[jp + gi] - heights[jm + gi]) / (2 * step);
        const l = 1 / Math.sqrt(1 + gx * gx + gz * gz);
        nor[v] = -gx * l; nor[v + 1] = l; nor[v + 2] = -gz * l;
        col[v] = lin[colors[o * 3]]; col[v + 1] = lin[colors[o * 3 + 1]]; col[v + 2] = lin[colors[o * 3 + 2]];
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const grid = m * m;
    for (let k = 0; k < T.perim.length; k++) {
      const a = (v0 + T.perim[k]) * 3, b = (v0 + grid + k) * 3;
      pos[b] = pos[a]; pos[b + 1] = pos[a + 1] - skirt; pos[b + 2] = pos[a + 2];
      nor[b] = nor[a]; nor[b + 1] = nor[a + 1]; nor[b + 2] = nor[a + 2];
      col[b] = col[a]; col[b + 1] = col[a + 1]; col[b + 2] = col[a + 2];
    }
    return [minY - skirt, maxY];
  }

  function makeGeometry(verts, index) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    g.setIndex(index);
    return g;
  }

  // LOD0: пул отдельных мешей
  const r0 = rings[0], lod0Max = (2 * r0 + 1) ** 2;
  const lod0Index = new THREE.BufferAttribute(topo[0].index, 1);
  const pool = [];
  const active = new Map(); // "cx,cz" → mesh
  for (let k = 0; k < lod0Max; k++) {
    const mesh = new THREE.Mesh(makeGeometry(topo[0].verts, lod0Index), material);
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    mesh.geometry.boundingSphere = new THREE.Sphere();
    mesh.geometry.boundingBox = new THREE.Box3();
    pool.push(mesh);
    group.add(mesh);
  }

  // LOD1 и LOD2: склеенные кольца
  const ringMeshes = [1, 2].map((lod) => {
    const inner = rings[lod - 1], outer = rings[lod];
    const cap = (2 * outer + 1) ** 2 - (2 * inner + 1) ** 2, T = topo[lod];
    const index = new Uint32Array(cap * T.index.length);
    for (let k = 0; k < cap; k++) for (let t = 0; t < T.index.length; t++) index[k * T.index.length + t] = T.index[t] + k * T.verts;
    const mesh = new THREE.Mesh(makeGeometry(cap * T.verts, new THREE.BufferAttribute(index, 1)), material);
    mesh.frustumCulled = false; // кольцо окружает игрока — всегда видно
    mesh.matrixAutoUpdate = false;
    mesh.userData = { lod, inner, outer, used: 0 };
    group.add(mesh);
    return mesh;
  });

  const inWorld = (cx, cz) => cx >= 0 && cz >= 0 && cx < count && cz < count;
  let ccx = -999, ccz = -999;
  const stats = { center: [0, 0], lod0: 0, ring1: 0, ring2: 0, rebuilds: 0, lastMs: 0 };

  function rebuild() {
    const t0 = performance.now();
    // LOD0: оставить совпавшие, остальные вернуть в пул
    const want = new Set();
    for (let dz = -r0; dz <= r0; dz++) for (let dx = -r0; dx <= r0; dx++) {
      if (inWorld(ccx + dx, ccz + dz)) want.add((ccx + dx) + ',' + (ccz + dz));
    }
    for (const [key, mesh] of active) {
      if (!want.has(key)) { active.delete(key); mesh.visible = false; }
    }
    const free = pool.filter((m) => !m.visible);
    for (const key of want) {
      if (active.has(key)) continue;
      const [cx, cz] = key.split(',').map(Number);
      const mesh = free.pop();
      const g = mesh.geometry, a = g.attributes;
      const [minY, maxY] = fill(cx, cz, 0, a.position.array, a.normal.array, a.color.array, 0);
      a.position.needsUpdate = a.normal.needsUpdate = a.color.needsUpdate = true;
      const x0 = cx * CHUNK_M, z0 = cz * CHUNK_M;
      g.boundingBox.min.set(x0, minY, z0);
      g.boundingBox.max.set(x0 + CHUNK_M, maxY, z0 + CHUNK_M);
      g.boundingBox.getBoundingSphere(g.boundingSphere);
      mesh.visible = true;
      active.set(key, mesh);
    }
    stats.lod0 = active.size;
    // кольца: квадрат outer без квадрата inner
    for (const mesh of ringMeshes) {
      const { lod, inner, outer } = mesh.userData, T = topo[lod], a = mesh.geometry.attributes;
      let k = 0;
      for (let dz = -outer; dz <= outer; dz++) for (let dx = -outer; dx <= outer; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) <= inner || !inWorld(ccx + dx, ccz + dz)) continue;
        fill(ccx + dx, ccz + dz, lod, a.position.array, a.normal.array, a.color.array, k * T.verts);
        k++;
      }
      mesh.userData.used = k;
      mesh.geometry.setDrawRange(0, k * T.index.length);
      a.position.needsUpdate = a.normal.needsUpdate = a.color.needsUpdate = true;
      mesh.visible = k > 0;
      stats['ring' + lod] = k;
    }
    stats.center = [ccx, ccz];
    stats.rebuilds++;
    stats.lastMs = +(performance.now() - t0).toFixed(2);
  }

  return {
    group,
    stats,
    /** Сдвинуть кольца, если игрок ушёл от центра дальше, чем на полчанка за край. */
    update(x, z) {
      const fx = x / CHUNK_M, fz = z / CHUNK_M;
      if (Math.abs(fx - (ccx + 0.5)) > 0.5 + HYSTERESIS || Math.abs(fz - (ccz + 0.5)) > 0.5 + HYSTERESIS) {
        ccx = Math.floor(fx);
        ccz = Math.floor(fz);
        rebuild();
      }
    },
    /** Треугольников в кадре (для отладки). */
    triangles() {
      let t = stats.lod0 * topo[0].index.length / 3;
      for (const m of ringMeshes) t += m.userData.used * topo[m.userData.lod].index.length / 3;
      return t;
    },
  };
}
