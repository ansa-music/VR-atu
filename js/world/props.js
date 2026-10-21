// js/world/props.js — деревья, камни, кусты и цветы из Kenney Nature Kit (CC0, assets/nature).
// Каждая модель — InstancedMesh на материал; расстановка детерминированная по биомам вокруг точки старта.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mulberry32 } from './noise.js';

// модель → [масштаб, плотность по биомам]
const SETS = {
  b_meadow: [['tree_default', 4, 6], ['tree_oak', 4, 5], ['plant_bush', 3, 14], ['plant_bushLarge', 3, 6], ['flower_redA', 3, 30], ['flower_yellowA', 3, 30], ['flower_purpleA', 3, 20], ['rock_smallA', 3, 10], ['rock_largeA', 3, 3]],
  b_forest: [['tree_detailed', 5, 22], ['tree_fat', 5, 10], ['tree_pineTallA', 5, 12], ['mushroom_redGroup', 3, 14], ['plant_bushLarge', 3, 10], ['rock_largeC', 3, 4]],
  b_swamp: [['tree_fat', 4, 6], ['mushroom_redGroup', 3, 18], ['plant_bush', 3, 12]],
  b_mountains: [['tree_pineDefaultA', 5, 14], ['tree_pineRoundC', 5, 10], ['rock_tallB', 4, 10], ['stone_largeB', 4, 8]],
  b_desert_ruins: [['tree_palmTall', 4, 4], ['cactus_tall', 4, 8], ['rock_largeC', 3, 6]],
  b_volcano: [['rock_tallB', 4, 12], ['stone_largeB', 4, 10]],
};
const RADIUS = { quest: 160, phone: 160, pc_low: 220, pc_high: 300 };
const CELL = 6; // шаг сетки кандидатов, м
const DENSITY = { quest: 0.5, phone: 0.5, pc_low: 0.8, pc_high: 1 }; // на Quest вдвое реже: бюджет треугольников

export async function createProps({ sampler, center, seaLevel, presetId = 'quest' }) {
  const group = new THREE.Group();
  group.name = 'world-props';
  const loader = new GLTFLoader();
  const names = [...new Set(Object.values(SETS).flat().map((s) => s[0]))];
  const protos = {};
  await Promise.all(names.map(async (n) => {
    try {
      const g = await loader.loadAsync(new URL(`../../assets/nature/${n}.glb`, import.meta.url).href);
      g.scene.updateMatrixWorld(true);
      const parts = [];
      g.scene.traverse((o) => { if (o.isMesh) parts.push({ geo: o.geometry.clone().applyMatrix4(o.matrixWorld), mat: o.material }); });
      protos[n] = parts;
    } catch (e) { console.warn('[props] нет модели', n, e); }
  }));

  // кандидаты: сетка + джиттер, биом, высота над водой, пологий склон
  const rnd = mulberry32(1337);
  const R = RADIUS[presetId] || 160;
  const picks = {}; // имя → [[x,y,z,rot,scale]]
  const nrm = { x: 0, y: 1, z: 0 };
  for (let gx = -R; gx <= R; gx += CELL) {
    for (let gz = -R; gz <= R; gz += CELL) {
      if (gx * gx + gz * gz > R * R) continue;
      const x = center.x + gx + (rnd() - 0.5) * CELL, z = center.z + gz + (rnd() - 0.5) * CELL;
      if (Math.hypot(x - center.x, z - center.z) < 8) continue; // площадка старта свободна
      const y = sampler.heightAt(x, z);
      if (y < seaLevel + 0.6) continue;
      if (sampler.normalAt(x, z, nrm).y < 0.86) continue;
      const set = SETS[sampler.biomeAt(x, z)];
      if (!set) continue;
      const total = set.reduce((s, e) => s + e[2], 0);
      if (rnd() * 100 > total * (DENSITY[presetId] ?? 0.5)) continue; // плотность: сумма весов на 100 клеток
      let r = rnd() * total, pick = set[0];
      for (const e of set) { r -= e[2]; if (r <= 0) { pick = e; break; } }
      (picks[pick[0]] ||= []).push([x, y, z, rnd() * Math.PI * 2, pick[1] * (0.8 + rnd() * 0.4)]);
    }
  }

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let instances = 0, meshes = 0;
  for (const [name, list] of Object.entries(picks)) {
    const parts = protos[name];
    if (!parts) continue;
    for (const part of parts) {
      const im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
      list.forEach(([x, y, z, rot, sc], i) => im.setMatrixAt(i, m.compose(p.set(x, y - 0.05, z), q.setFromAxisAngle(up, rot), s.setScalar(sc))));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      group.add(im);
      meshes++;
    }
    instances += list.length;
  }
  return { group, stats: { instances, meshes } };
}
