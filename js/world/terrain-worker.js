// js/world/terrain-worker.js — модульный воркер: считает карту высот мира, не блокируя страницу.
// Буферы уходят в основной поток без копирования (Transferable).
import { generateTerrain } from './heightmap.js';

self.onmessage = (e) => {
  try {
    const t0 = performance.now();
    const t = generateTerrain(e.data?.seed);
    t.ms = Math.round(performance.now() - t0);
    self.postMessage({ ok: true, terrain: t }, [t.heights.buffer, t.colors.buffer, t.mask.buffer]);
  } catch (err) {
    self.postMessage({ ok: false, error: String(err?.stack || err) });
  }
};
