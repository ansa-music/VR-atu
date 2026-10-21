// js/world/bestiary/populate.js — оба бестиария (74 + 74) в открытом мире ?mode=world.
// Только витрина: в боевой ростер (MOBS) не подмешиваются. В каждом биоме два ряда вдоль X с шагом 14 м:
// pack1 — севернее якоря на 22 м лицом к тропе (yaw = π), pack2 — южнее на 22 м (yaw = 0).
// Модели грузятся по одной (setTimeout 0), ошибка одной — в консоль и дальше; видны и анимируются — только в радиусе 70 м.
import * as THREE from 'three';
import { PACK1 } from './pack1-loaders.js';
import { PACK2 } from './pack2-loaders.js';
import { isStandaloneHeadset } from '../../quality.js';

const BIOME_OF = {
  step: 'b_meadow', steppe: 'b_meadow', any: 'b_meadow',
  forest: 'b_forest', swamp: 'b_swamp', mountain: 'b_mountains', mountains: 'b_mountains',
  desert: 'b_desert_ruins', volcano: 'b_volcano',
};
const ANCHOR = {
  b_meadow: [980, 1280], b_swamp: [340, 1240], b_forest: [420, 760],
  b_desert_ruins: [1120, 760], b_mountains: [480, 280], b_volcano: [1180, 280],
};
const STEP = 14, ROW_DZ = 22, ANIM_R = 70;
// видимость: в автономном шлеме и на низком качестве ближе (каждое существо — несколько вызовов отрисовки)
const lowEnd = () => { try { return isStandaloneHeadset() || new URLSearchParams(location.search).get('quality') === 'low'; } catch { return false; } };
const VIS_R = lowEnd() ? 35 : ANIM_R;

/** Точки ряда: центр на якоре, шаг STEP по X. */
export function planRows(pack1 = PACK1, pack2 = PACK2) {
  const out = [];
  for (const [list, pack, dz, yaw] of [[pack1, 1, ROW_DZ, Math.PI], [pack2, 2, -ROW_DZ, 0]]) {
    const byBiome = {};
    for (const c of list) (byBiome[BIOME_OF[c.biome] || 'b_meadow'] ||= []).push(c);
    for (const [biome, row] of Object.entries(byBiome)) {
      const [ax, az] = ANCHOR[biome];
      row.forEach((c, i) => out.push({ ...c, pack, biome, x: ax + (i - (row.length - 1) / 2) * STEP, z: az + dz, yaw }));
    }
  }
  return out;
}

export function createBestiary({ group, heightAt }) {
  const root = new THREE.Group();
  root.name = 'bestiary';
  group.add(root);
  const plan = planRows();
  const live = []; // { obj, pack, x, z }
  let done = 0, failed = 0, time = 0, cancelled = false;

  const spawnOne = async (p) => {
    const mod = await p.load();
    const build = mod.build || mod.default;
    const obj = p.pack === 1 ? build(THREE, { state: 'idle' }) : build(THREE, { shadows: false, proceduralTextures: true });
    obj.position.set(p.x, heightAt(p.x, p.z), p.z);
    obj.rotation.y = p.yaw;
    obj.name = 'bestiary:' + p.id;
    obj.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    obj.visible = false; // покажет update, когда игрок рядом
    root.add(obj);
    live.push({ obj, pack: p.pack, x: p.x, z: p.z });
  };
  // по одной модели на тик, чтобы мир не замирал
  let i = 0;
  const next = () => {
    if (cancelled || i >= plan.length) {
      if (i >= plan.length) console.info(`[bestiary] в мире ${done} из ${plan.length}` + (failed ? ` (ошибок: ${failed})` : ''));
      return;
    }
    const p = plan[i++];
    spawnOne(p).then(() => { done++; }, (e) => { failed++; console.warn('[bestiary] не загрузилась модель', p.id, e); })
      .finally(() => setTimeout(next, 0));
  };
  setTimeout(next, 0);

  return {
    group: root,
    get stats() { return { placed: done, failed, total: plan.length }; },
    update(dt, head) {
      time += dt;
      const r2 = ANIM_R * ANIM_R, v2 = VIS_R * VIS_R;
      for (const c of live) {
        const dx = c.x - head.x, dz = c.z - head.z;
        const d2 = dx * dx + dz * dz, show = d2 <= v2;
        if (c.obj.visible !== show) c.obj.visible = show; // дальше радиуса видимости не рисуем: в шлеме каждый вызов платится дважды
        if (d2 > r2 || !show) continue;
        try {
          if (c.pack === 1) c.obj.userData.update?.(time, 'idle');
          else c.obj.userData.animator?.update(dt); // behavior.update не вызываем: модели уходят в ноль
        } catch (e) { /* одна модель не ломает кадр */ }
      }
    },
    dispose() { cancelled = true; },
  };
}
