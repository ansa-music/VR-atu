// js/world/hitzones.js — зоны попадания мобов по сокетам процедурных моделей (head / WeakPoint / spine + bbox).
// Чистый модуль без three: работает и в браузере, и в node-тестах. Модели смотрят в −Z (как procedural-models.js).
import { MOBS } from '../../shared/defs/index.js';
import { buildModelData } from './procedural-models.js';

const cache = new Map();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Мировые позиции узлов модели (без поворотов: генератор задаёт только смещения). */
export function socketsOf(id) {
  const d = buildModelData(id), w = [], out = {};
  d.nodes.forEach((n, i) => { const p = n.parent >= 0 ? w[n.parent] : [0, 0, 0]; w[i] = [p[0] + n.t[0], p[1] + n.t[1], p[2] + n.t[2]]; out[n.name] = w[i]; });
  return { sockets: out, bbox: d.bbox, rig: d.rig || null, hover: d.hover || 0 };
}

/**
 * Зоны: body (капсула-сфера по bbox), head (сокет head), weak (сокет WeakPoint, только если в MOBS есть zones.weak).
 * Возвращает и «наследный» формат MobManager: body:[y,r], head:[y,r], headZ, headIsWeak.
 */
export function computeHitZones(id) {
  if (cache.has(id)) return cache.get(id);
  const def = MOBS[id] || {}; let S;
  try { S = socketsOf(id); } catch { S = null; }
  let z;
  if (!S) z = { body: { c: [0, 0.6, 0], r: 0.5 }, head: { c: [0, 1.2, 0], r: 0.25 }, weak: null };
  else {
    const [mn, mx] = S.bbox, h = Math.max(0.3, mx[1] - mn[1]), wx = mx[0] - mn[0], wz = mx[2] - mn[2];
    const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
    // тело: сфера по центру bbox; для длинных четвероногих — радиус по полу-ширине ×1.4, а не по длине (чтобы не «ловить» воздух)
    const long = wz > h * 1.3, hum = S.rig === 'humanoid';
    const rBody = clamp(hum ? Math.max(Math.max(wx, wz) * 0.55, h * 0.26) : long ? Math.max(wx, h) * 0.5 : Math.max(wx, wz, h) * 0.42, 0.18, 2.2);
    const body = { c: [cx, mn[1] + h * (long ? 0.55 : 0.45), cz], r: rBody };
    const hs = S.sockets.head || S.sockets.WeakPoint || null;
    const rHead = clamp(hum ? h * 0.1 : Math.min(h, Math.max(wx, 0.2)) * 0.24, 0.12, 0.7);
    const head = hs && hs !== S.sockets.WeakPoint ? { c: [hs[0], hs[1] + rHead * 0.6, hs[2] - (long ? rHead * 0.5 : 0)], r: rHead } : null;
    const ws = S.sockets.WeakPoint, weak = def.zones?.weak && ws ? { c: [...ws], r: clamp(rHead * 0.8, 0.09, 0.5), mult: def.zones.weak.mult, name: def.zones.weak.name } : null;
    z = { body, head, weak };
  }
  // наследный формат (main.js aimAt / _marker используют hit.body[0], hit.head)
  const H = z.weak || z.head || { c: [0, z.body.c[1] + z.body.r, 0], r: z.body.r * 0.4 };
  z.legacy = { body: [z.body.c[1], z.body.r], head: [H.c[1], H.r], headZ: H.c[2], headIsWeak: !!z.weak && !z.head };
  cache.set(id, z); return z;
}

/** Сфера vs луч: расстояние до входа или -1. o,d — {x,y,z}; d нормирован. */
export function raySphere(o, d, c, r) {
  const ox = c[0] - o.x, oy = c[1] - o.y, oz = c[2] - o.z, t = ox * d.x + oy * d.y + oz * d.z;
  const d2 = ox * ox + oy * oy + oz * oz - t * t; if (d2 > r * r) return -1;
  const th = t - Math.sqrt(r * r - d2); return th >= 0 ? th : (t >= 0 ? 0 : -1);
}
/** Локальная точка зоны → мир (поворот только по yaw, масштаб s). */
export function zoneWorld(c, pos, yaw, s) {
  const cs = Math.cos(yaw), sn = Math.sin(yaw), x = c[0] * s, z = c[2] * s;
  return [pos.x + x * cs + z * sn, pos.y + c[1] * s, pos.z - x * sn + z * cs];
}
/**
 * Луч по списку целей [{pos,yaw,scale,zones,alive,exposed}] → {target, zone, dist} | null.
 * Приоритет: weak > head > body, если вход в пределах 0,08 м (иначе ближайшая). weak работает, только если target.exposed !== false.
 */
export function raycastZones(targets, o, d, maxD) {
  let best = null;
  for (const T of targets) {
    if (T.alive === false) continue; const s = T.scale || 1, Z = T.zones;
    for (const name of ['weak', 'head', 'body']) {
      const zz = Z[name]; if (!zz || (name === 'weak' && T.exposed === false)) continue;
      const th = raySphere(o, d, zoneWorld(zz.c, T.pos, T.yaw || 0, s), zz.r * s * 1.1);
      if (th < 0 || th > maxD) continue;
      const pr = name === 'weak' ? 2 : name === 'head' ? 1 : 0;
      if (!best || th < best.dist - 0.08 || (Math.abs(th - best.dist) <= 0.08 && pr > best.pr)) best = { target: T, zone: name, dist: th, pr };
    }
  }
  return best;
}
