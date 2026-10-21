// tests/world-terrain.test.mjs — открытый мир, фаза 1: детерминизм рельефа, heightAt, биомы, POI, границы
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimplex2D, mulberry32, hashBytes } from '../js/world/noise.js';
import { generateTerrain, createTerrainSampler, BIOME_IDS, PEAK } from '../js/world/heightmap.js';
import { WORLD_CONFIG } from '../shared/defs/world.js';
import { POIS } from '../shared/defs/pois.js';

const T = generateTerrain(WORLD_CONFIG.seed);
const S = createTerrainSampler(T);
const { size, seaLevel, borderSoft, heightRange: [hMin, hMax] } = WORLD_CONFIG;

test('шум и PRNG детерминированы', () => {
  const a = mulberry32(1337), b = mulberry32(1337);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
  const n1 = createSimplex2D(1337), n2 = createSimplex2D(1337), n3 = createSimplex2D(7);
  let diff = 0;
  for (let i = 0; i < 200; i++) {
    const x = i * 0.37 - 20, y = i * 0.53 + 3;
    assert.equal(n1(x, y), n2(x, y));
    assert.ok(Math.abs(n1(x, y)) <= 1.05);
    diff += Math.abs(n1(x, y) - n3(x, y));
  }
  assert.ok(diff > 1, 'другой seed — другой шум');
});

test('одинаковый хеш карты высот для seed 1337, другой seed — другой хеш', () => {
  const again = generateTerrain(WORLD_CONFIG.seed);
  assert.equal(hashBytes(again.heights), hashBytes(T.heights));
  assert.equal(hashBytes(again.colors), hashBytes(T.colors));
  assert.notEqual(hashBytes(generateTerrain(7).heights), hashBytes(T.heights));
});

test('размер карты и диапазон высот', () => {
  assert.equal(T.n, size / WORLD_CONFIG.heightStep + 1);
  assert.equal(T.heights.length, T.n * T.n);
  let mn = Infinity, mx = -Infinity;
  for (const h of T.heights) { mn = Math.min(mn, h); mx = Math.max(mx, h); }
  assert.ok(mn >= hMin - 0.01 && mx <= hMax + 0.01, `высоты ${mn}…${mx}`);
  assert.ok(mx > 190, 'есть высокие горы');
  assert.ok(mn < seaLevel - 3, 'есть море');
});

test('heightAt: узлы сетки и билинейная середина', () => {
  const { n, step, heights } = T;
  for (const [i, j] of [[0, 0], [100, 200], [590, 650], [n - 1, n - 1]]) {
    assert.ok(Math.abs(S.heightAt(i * step, j * step) - heights[j * n + i]) < 1e-4);
  }
  const i = 300, j = 400, o = j * n + i;
  const mid = (heights[o] + heights[o + 1] + heights[o + n] + heights[o + n + 1]) / 4;
  assert.ok(Math.abs(S.heightAt((i + 0.5) * step, (j + 0.5) * step) - mid) < 1e-4);
  assert.ok(Number.isFinite(S.heightAt(-50, size + 50)), 'за краем — высота края');
});

test('каждая POI стоит в своём биоме, площадка ровная и над водой', () => {
  for (const p of POIS) {
    const [x, z] = p.pos;
    assert.equal(S.biomeAt(x, z), p.biome, p.id);
    const hc = S.heightAt(x, z);
    if (!/sunken/.test(p.id)) assert.ok(hc >= seaLevel + 1.4, `${p.id} над водой (${hc.toFixed(1)})`);
    for (let a = 0; a < 8; a++) {
      const r = p.r * 0.8;
      const h = S.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r);
      assert.ok(Math.abs(h - hc) < 0.75, `${p.id}: площадка ровная (${(h - hc).toFixed(2)} м)`);
    }
  }
});

test('старт в Рассветном Броде, на лугу, на суше', () => {
  assert.equal(S.biomeAt(T.spawn.x, T.spawn.z), 'b_meadow');
  assert.ok(S.heightAt(T.spawn.x, T.spawn.z) > seaLevel + 2);
  assert.equal(BIOME_IDS.length, 6);
});

test('границы: море на западе и юге до зоны бури, скалы на севере, стена на востоке', () => {
  for (const t of [200, 700, 1100, 1300]) {
    let x = 400;
    while (x > 0 && S.heightAt(x, t) > seaLevel - 1) x--;
    assert.ok(x > borderSoft, `запад z=${t}: вода с x=${x}`);
  }
  for (const t of [300, 800, 1180]) {
    let z = 1300;
    while (z < size && S.heightAt(t, z) > seaLevel - 1) z++;
    assert.ok(size - z > borderSoft, `юг x=${t}: вода с z=${z}`);
  }
  for (const t of [300, 800]) assert.ok(S.heightAt(t, 4) > 150, 'северные скалы');
  for (const t of [600, 1000]) assert.ok(S.heightAt(size - 4, t) > 120, 'пепельная стена');
  assert.ok(S.heightAt(PEAK.x, PEAK.z) > 180, 'пик Стужа');
});
