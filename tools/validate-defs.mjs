// tools/validate-defs.mjs — перекрёстная проверка всех ID и структурных правил открытого мира.
// Запуск: node tools/validate-defs.mjs  (exit 1 при ошибках). Также экспортирует validateDefs() для тестов.
import * as D from '../shared/defs/index.js';
import { QUALITY_PRESETS } from '../js/render/quality-presets.js';
import { THEME } from '../shared/defs/theme.js';
import { DAMAGE_TYPE_VFX } from '../shared/defs/damage-vfx.js';
import { pathToFileURL } from 'node:url';

export function validateDefs() {
  const errors = [], warn = [];
  const err = (m) => errors.push(m);
  const keys = (o) => new Set(Object.keys(o));
  const POI = Object.fromEntries(D.POIS.map((p) => [p.id, p]));
  const reg = {
    b_: keys(D.BIOMES), poi_: keys(POI), gate_: new Set(Object.values(D.GATES).map((g) => g.id)), npc_: keys(D.NPCS),
    stn_: keys(D.STATIONS), q_: new Set([...Object.keys(D.QUESTS), ...D.SIDE_QUEST_TEMPLATES.map((t) => t.id)]),
    m_: new Set([...Object.keys(D.MOBS), D.BALANCE_REF.mobRef.id]), boss_: new Set([...Object.keys(D.BOSSES), ...Object.keys(D.WORLD_EVENTS).filter((k) => k.startsWith('boss_'))]),
    ev_: new Set(Object.keys(D.WORLD_EVENTS).filter((k) => k.startsWith('ev_'))), aff_: keys(D.ELITE_AFFIXES), w_: keys(D.WEAPONS),
    s_: keys(D.SKILLS), c_: new Set(Object.values(D.COMBOS).map((c) => c.id)), st_: keys(D.STATUSES), it_: keys(D.ITEMS),
    af_: keys(D.GEAR_AFFIXES), rc_: keys(D.RECIPES),
  };
  // 1) ключи реестров имеют свой префикс
  for (const [p, set] of Object.entries(reg)) for (const id of set) if (!D.hasPrefix(id, p) && !(p === 'm_' && id === 'm_ref')) err(`registry ${p}: bad key ${id}`);
  for (const p of Object.keys(reg)) if (!D.ID_PREFIXES[p]) err(`prefix ${p} not in ID_PREFIXES`);
  // 2) все ссылки (целые строки и вхождения в прозе) существуют
  const defOnly = /^(a_|ba_|t_)/; const ignore = new Set(['st_', 'it_']);
  const prefixes = Object.keys(reg).sort((a, b) => b.length - a.length);
  const rx = new RegExp(`\\b(?:${prefixes.join('|')})[a-z0-9_]*[a-z0-9]`, 'g');
  let refs = 0; const seen = new WeakSet();
  const walk = (v, path) => {
    if (typeof v === 'string') {
      for (const mm of v.matchAll(rx)) {
        const id = mm[0]; if (v[mm.index + id.length] === '_') continue; // шаблон вида it_essence_<type>
        if (defOnly.test(id) || ignore.has(id)) continue;
        const p = prefixes.find((x) => id.startsWith(x));
        if (p === 's_' && /^s_(?:id)$/.test(id)) continue;
        refs++; if (!reg[p].has(id)) err(`${path}: unknown ${id}`);
      }
    } else if (v && typeof v === 'object' && !seen.has(v)) { seen.add(v); for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`); }
  };
  const roots = ['BIOMES', 'POIS', 'GATES', 'NPCS', 'STATIONS', 'QUESTS', 'SIDE_QUEST_TEMPLATES', 'MOBS', 'BOSSES', 'ELITE_AFFIXES', 'SPAWN_TABLES', 'WORLD_EVENTS',
    'WEAPONS', 'STARTER_KITS', 'UPGRADE_TIERS', 'UPGRADE_STATIONS', 'MODS', 'AMMO', 'SKILLS', 'COMBOS', 'LOADOUT', 'ITEMS', 'RECIPES', 'FORGE', 'POINTS', 'STATUSES', 'WORLD_CONFIG'];
  for (const r of roots) walk(D[r], r);
  // ключи-ссылки (лут POI по ключам SPAWN_TABLES.poi, статусы как ключи onHit)
  for (const [b, t] of Object.entries(D.SPAWN_TABLES)) { if (!reg.b_.has(b)) err(`SPAWN_TABLES key ${b}`); for (const p of Object.keys(t.poi || {})) if (!reg.poi_.has(p)) err(`SPAWN_TABLES.${b}.poi ${p}`); }
  // 3) структура мира
  for (const [id, p] of Object.entries(POI)) {
    if (!reg.b_.has(p.biome)) err(`${id}: biome ${p.biome}`);
    if (!D.POI_TYPES.includes(p.type)) err(`${id}: type ${p.type}`);
    for (const s of p.stations || []) if (!reg.stn_.has(s)) err(`${id}: station ${s}`);
    for (const n of p.npcs || []) if (D.NPCS[n]?.hub !== id) err(`${id}: npc ${n} hub mismatch`);
  }
  for (const [id, n] of Object.entries(D.NPCS)) if (!POI[n.hub]) err(`${id}: hub ${n.hub}`);
  for (const [id, b] of Object.entries(D.BOSSES)) {
    const a = POI[b.arena.poi]; if (!a) { err(`${id}: arena ${b.arena.poi}`); continue; }
    if (a.biome !== b.biome) err(`${id}: arena biome ${a.biome} != ${b.biome}`);
    if (D.BIOMES[b.biome].boss !== id) err(`${id}: BIOMES.${b.biome}.boss = ${D.BIOMES[b.biome].boss}`);
    if (D.SPAWN_TABLES[b.biome].boss !== id) err(`${id}: SPAWN_TABLES boss mismatch`);
  }
  for (const [qid, q] of Object.entries(D.QUESTS)) for (const s of q.steps) if (s.type === 'boss' && s.poi && D.BOSSES[s.boss]?.arena.poi !== s.poi) err(`${qid}: boss ${s.boss} poi ${s.poi} != arena`);
  for (const [id, m] of Object.entries(D.MOBS)) {
    if (!reg.b_.has(m.biome)) err(`${id}: biome`);
    const inTable = Object.values(D.SPAWN_TABLES).some((t) => JSON.stringify(t).includes(`"${id}"`)) || Object.values(D.WORLD_EVENTS).some((e) => JSON.stringify(e).includes(`"${id}"`)) || JSON.stringify(D.BOSSES).includes(`"${id}"`);
    if (!inTable) err(`${id}: never spawned`);
    if (!D.BIOMES[m.biome].mobs.includes(id)) warn.push(`${id}: not listed in BIOMES.${m.biome}.mobs`);
  }
  // 4) оружие: источники согласованы с POI/боссами/рецептами
  for (const [id, w] of Object.entries(D.WEAPONS)) {
    const s = w.source;
    if (s.kind === 'poi' && !(POI[s.poi]?.loot || []).includes(id) && !s.note?.includes('npc_')) err(`${id}: POI ${s.poi} loot lacks weapon`);
    if (s.kind === 'boss' && !D.BOSSES[s.boss]?.rewards.items.some(([x]) => x === id)) err(`${id}: boss ${s.boss} does not drop it`);
    if (s.kind === 'craft' && D.RECIPES[s.recipe]?.out[0] !== id && !D.AMMO[D.RECIPES[s.recipe]?.out[0]]) err(`${id}: recipe ${s.recipe}`);
    if (s.kind === 'craft' && s.station && D.RECIPES[s.recipe]?.station !== s.station) err(`${id}: station ${s.station} != recipe station`);
    if (w.vendor && !D.NPCS[w.vendor]) err(`${id}: vendor ${w.vendor}`);
    if (w.ammo && !reg.it_.has(w.ammo)) err(`${id}: ammo ${w.ammo}`);
    if (w.status && !String(w.status.id).match(/^(st_|by_element$)/)) err(`${id}: status ${w.status.id}`);
  }
  for (const [id, p] of Object.entries(POI)) for (const x of p.loot || []) if (x.startsWith('w_') && D.WEAPONS[x]?.source.poi !== id) err(`${id}: loot ${x} but weapon source differs`);
  // 5) навыки: тома и квесты
  for (const [id, s] of Object.entries(D.SKILLS)) {
    const u = s.unlock || {};
    if (u.tome) { if (!POI[u.tome.poi] || (u.tome.npc ? !D.NPCS[u.tome.npc] : !u.tome.found)) err(`${id}: tome place`); if (!D.ITEMS[`it_tome_${id}`]) err(`${id}: tome item missing`); }
    for (const q of [u.quest, u.offArchetypeQuest].filter(Boolean)) if (!D.QUESTS[q]) err(`${id}: quest ${q}`);
    if (s.type !== 'passive' && !s.input?.pc) err(`${id}: no pc input`);
  }
  // 6) рецепты
  for (const [id, r] of Object.entries(D.RECIPES)) { if (!reg.stn_.has(r.station)) err(`${id}: station`); for (const [x] of [...r.in, r.out]) if (!reg.it_.has(x) && !reg.w_.has(x)) err(`${id}: ${x}`); }
  for (const [id, a] of Object.entries(D.AMMO)) if (!D.RECIPES[a.recipe]) err(`${id}: recipe ${a.recipe}`);
  // 7) статусы и типы урона
  for (const [id, st] of Object.entries(D.STATUSES)) if (st.id && st.id !== id) err(`${id}: id field ${st.id}`);
  for (const t of D.DAMAGE_TYPES) { if (!THEME.damage[t]) err(`THEME.damage.${t}`); if (!DAMAGE_TYPE_VFX[t]) err(`VFX.${t}`); }
  // 8) пресеты качества — одни ключи везде; дальность = туман мира
  const qk = Object.keys(QUALITY_PRESETS).join();
  for (const [n, o] of [['WORLD_CONFIG.quality', D.WORLD_CONFIG.quality], ['PERF_CAPS', Object.fromEntries(Object.entries(D.PERF_CAPS).filter(([, v]) => typeof v === 'object'))]]) if (Object.keys(o).join() !== qk) err(`${n} keys ${Object.keys(o)} != ${qk}`);
  for (const [k, q] of Object.entries(QUALITY_PRESETS)) {
    const w = D.WORLD_CONFIG.quality[k]; if (q.drawDistance !== w.fogFar) err(`${k}: drawDistance ${q.drawDistance} != fogFar ${w.fogFar}`);
    if (q.chunkRadius !== Math.max(...w.lodRings)) err(`${k}: chunkRadius`);
    if (q.mobs.active !== D.PERF_CAPS[k].activeMobs) err(`${k}: mobs.active`);
  }
  if (THEME.dayNight.dayLengthMin !== D.WORLD_CONFIG.dayLengthMin) err('day length mismatch');
  // 9) раскладка: без дублей клавиш ПК среди одиночных действий
  const pcKeys = {}; for (const [a, v] of Object.entries(D.INPUT_MAP)) { const k = v.pc.split(' ')[0]; if (/^[A-Z0-9]$|^(Alt|Tab|Esc)$/.test(k)) { if (pcKeys[k]) err(`INPUT_MAP: ${k} used by ${pcKeys[k]} and ${a}`); pcKeys[k] = a; } }
  // 10) уровни
  for (const [id, b] of Object.entries(D.BIOMES)) { const t = D.SPAWN_TABLES[id]; if (t.lvl[0] !== b.levels[0] || t.lvl[1] !== b.levels[1]) warn.push(`${id}: spawn lvl ${t.lvl} vs biome ${b.levels}`); }
  return { errors, warn, refs, counts: Object.fromEntries(Object.entries(reg).map(([p, s]) => [p, s.size])) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = validateDefs();
  console.log('registries:', JSON.stringify(r.counts)); console.log('refs checked:', r.refs);
  for (const w of r.warn) console.log('WARN', w);
  for (const e of r.errors) console.log('ERR ', e);
  console.log(r.errors.length ? `FAIL ${r.errors.length} errors` : 'OK');
  process.exit(r.errors.length ? 1 : 0);
}
