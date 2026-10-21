// js/world/save.js — сохранения открытого мира (раздел 2.11): IndexedDB `vr-atu-world`/`saves`,
// запасной localStorage `vr-atu-world-save`, 3 ручных слота + auto, версия схемы и миграции, экспорт/импорт base64.
export const SAVE_VERSION = 2;
export const DB_NAME = 'vr-atu-world', STORE = 'saves', LS_KEY = 'vr-atu-world-save';
export const SLOTS = Object.freeze(['auto', 'slot1', 'slot2', 'slot3']);
export const AUTOSAVE_S = 120, COMBAT_GRACE_S = 8;

/** Миграции: migrations[v] переводит сейв версии v в v+1. */
export const migrations = {
  1: (s) => ({ ...s, v: 2, progression: s.progression || { level: s.player?.level || 1, xp: s.player?.xp || 0, xpTotal: s.player?.xp || 0, sp: 1, tp: 0, ap: 0, archetype: s.player?.archetype || 'gunslinger',
      attrs: { vit: 0, agi: 0, wil: 0, pre: 0 }, skills: Object.fromEntries((s.equipped?.skills || []).map((k) => [k, 1])), talents: {}, constellations: [], mastery: 0, shrines: [], trials: [], bossQuestsPaid: [] },
    inventory: Array.isArray(s.inventory) ? { gold: s.player?.gold || 0, stacks: Object.fromEntries(s.inventory.map((i) => [i.id, i.n])), gear: [], equipped: {}, artifacts: [null, null, null], unlocked: [] } : s.inventory,
    questLog: s.questLog || { active: Object.entries(s.quests || {}).find(([, q]) => q.state === 'active')?.[0] || 'q_main_01', step: 0, counters: {}, done: Object.entries(s.quests || {}).filter(([, q]) => q.state === 'done').map(([k]) => k) } }),
};
export function migrate(s) {
  if (!s || typeof s !== 'object') throw new Error('сейв повреждён');
  let v = s.v || 1; if (v > SAVE_VERSION) throw new Error(`сейв из новой версии (${v})`);
  while (v < SAVE_VERSION) { s = migrations[v](s); v = s.v; } return s;
}
export function validate(s) {
  const p = s?.progression; if (!p || !(p.level >= 1 && p.level <= 30) || !Number.isFinite(p.xp)) return 'progression';
  if (!s.inventory || !Number.isFinite(s.inventory.gold)) return 'inventory'; if (!Array.isArray(s.player?.pos)) return 'player';
  return null;
}
/** Собрать снимок. parts = {progression, inventory(Inventory|json), questLog, player:{pos,rotY,hp,shield,energy}, world:{time, discovered:[]}, stats, playTime} */
export function snapshot(parts) {
  const inv = parts.inventory?.toJSON ? parts.inventory.toJSON() : parts.inventory;
  return JSON.parse(JSON.stringify({ v: SAVE_VERSION, seed: parts.seed ?? 1337, savedAt: Date.now(), playTime: parts.playTime || 0,
    player: parts.player, progression: parts.progression, inventory: inv, questLog: parts.questLog, world: parts.world || {}, stats: parts.stats || {} }));
}
export const exportB64 = (s) => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(JSON.stringify(s)))) : Buffer.from(JSON.stringify(s), 'utf8').toString('base64'));
export const importB64 = (b) => migrate(JSON.parse(typeof atob === 'function' ? decodeURIComponent(escape(atob(b.trim()))) : Buffer.from(b.trim(), 'base64').toString('utf8')));

function memoryBackend() { const m = new Map(); return { kind: 'memory', get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, del: async (k) => { m.delete(k); }, keys: async () => [...m.keys()] }; }
function lsBackend(ls) {
  // localStorage хранит только последний слот (< 200 КБ): ключ LS_KEY, плюс метка слота.
  return { kind: 'localStorage', get: async (k) => { try { const o = JSON.parse(ls.getItem(LS_KEY) || 'null'); return o && o.slot === k ? o.data : null; } catch { return null; } },
    put: async (k, v) => { const s = JSON.stringify({ slot: k, data: v }); if (s.length > 200_000) throw new Error('сейв > 200 КБ'); ls.setItem(LS_KEY, s); },
    del: async (k) => { try { if (JSON.parse(ls.getItem(LS_KEY) || 'null')?.slot === k) ls.removeItem(LS_KEY); } catch {} }, keys: async () => { try { const o = JSON.parse(ls.getItem(LS_KEY) || 'null'); return o ? [o.slot] : []; } catch { return []; } } };
}
function idbBackend(idb) {
  const open = () => new Promise((res, rej) => { const r = idb.open(DB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  let dbp = null; const db = () => (dbp ||= open());
  const tx = (mode, fn) => db().then((d) => new Promise((res, rej) => { const t = d.transaction(STORE, mode); const req = fn(t.objectStore(STORE)); t.oncomplete = () => res(req?.result); t.onerror = () => rej(t.error); }));
  return { kind: 'indexedDB', get: (k) => tx('readonly', (s) => s.get(k)).then((v) => v ?? null), put: (k, v) => tx('readwrite', (s) => s.put(v, k)), del: (k) => tx('readwrite', (s) => s.delete(k)), keys: () => tx('readonly', (s) => s.getAllKeys()) };
}
export async function createSaveStore({ backend } = {}) {
  let be = backend;
  if (!be && typeof indexedDB !== 'undefined') { try { be = idbBackend(indexedDB); await be.keys(); } catch { be = null; } }
  if (!be && typeof localStorage !== 'undefined') be = lsBackend(localStorage);
  if (!be) be = memoryBackend();
  try { navigator?.storage?.persist?.(); } catch {}
  return {
    kind: be.kind,
    async save(slot, snap) { if (!SLOTS.includes(slot)) throw new Error('слот'); const bad = validate(snap); if (bad) throw new Error('сейв не прошёл проверку: ' + bad); await be.put(slot, snap); return true; },
    async load(slot) { const s = await be.get(slot); return s ? migrate(s) : null; },
    async list() { const out = []; for (const k of SLOTS) { const s = await be.get(k); if (s) out.push({ slot: k, level: s.progression?.level ?? s.player?.level, savedAt: s.savedAt, playTime: s.playTime }); } return out; },
    async remove(slot) { await be.del(slot); },
    async latest() { const l = (await this.list()).sort((a, b) => b.savedAt - a.savedAt)[0]; return l ? this.load(l.slot) : null; },
  };
}
/** Автосейв: tick(dt, {inCombat}) — каждые AUTOSAVE_S вне боя; trigger(reason) — костёр/хаб/квест (не чаще раза в 5 с). */
export function createAutosaver(store, getSnapshot, { onSaved } = {}) {
  let t = 0, last = -1e9, combatT = 0, busy = false, now = 0;
  const run = async (reason) => { if (busy || now - last < 5) return false; busy = true; try { await store.save('auto', getSnapshot()); last = now; t = 0; onSaved?.(reason); return true; } catch (e) { console.warn('[save]', e?.message); return false; } finally { busy = false; } };
  return { tick(dt, { inCombat = false } = {}) { now += dt; combatT = inCombat ? COMBAT_GRACE_S : Math.max(0, combatT - dt); t += dt; if (t >= AUTOSAVE_S && combatT <= 0) return run('timer'); return null; }, trigger: (r) => run(r), get sinceLast() { return now - last; } };
}
