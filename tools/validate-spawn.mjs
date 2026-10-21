// tools/validate-spawn.mjs — все ID в shared/defs/spawn.js существуют в реестрах канона.
import * as D from '../shared/defs/index.js';
import * as S from '../shared/defs/spawn.js';
const reg = {
  b_: D.BIOMES, poi_: Object.fromEntries(D.POIS.map((p) => [p.id, p])), gate_: Object.fromEntries(D.GATES.map((g) => [g.id, g])),
  npc_: D.NPCS, stn_: D.STATIONS, m_: D.MOBS, boss_: { ...D.BOSSES, ...D.WORLD_EVENTS }, ev_: D.WORLD_EVENTS,
  aff_: D.ELITE_AFFIXES, it_: D.ITEMS, s_: D.SKILLS, w_: D.WEAPONS, st_: D.STATUSES, q_: D.QUESTS,
};
const errs = []; let refs = 0;
const check = (v, path) => {
  if (typeof v !== 'string' || !/^[a-z0-9_]+$/.test(v)) return;
  const p = Object.keys(reg).sort((a, b) => b.length - a.length).find((k) => v.startsWith(k)); if (!p) return;
  refs++; if (!(v in reg[p])) errs.push(`${path}: ${v}`);
};
const walk = (o, path) => {
  if (Array.isArray(o)) o.forEach((x, i) => walk(x, `${path}[${i}]`));
  else if (o && typeof o === 'object') for (const [k, x] of Object.entries(o)) { check(k, path + '.' + k + '(key)'); walk(x, path + '.' + k); }
  else check(o, path);
};
for (const k of ['PLAYER_SPAWN', 'RESPAWN', 'SPAWN_RULES', 'CAMP_LAYOUTS', 'NODE_SPAWNS']) walk(S[k], k);
// смысловые проверки
for (const [k, c] of Object.entries(S.CAMP_LAYOUTS)) {
  const poi = c.poi && D.POIS.find((p) => p.id === c.poi);
  const biome = poi?.biome ?? c.biome;
  for (const s of c.slots) if (s.mob && D.MOBS[s.mob].biome !== biome) errs.push(`${k}: ${s.mob} не из биома ${biome}`);
  for (const s of c.slots) if (Math.hypot(...s.at) > c.r) errs.push(`${k}: слот вне радиуса`);
}
for (const [id, r] of Object.entries(S.NODE_SPAWNS.resources)) for (const b of r.biomes) if (!D.BIOMES[b].resources.includes(id)) errs.push(`NODE ${id} не в BIOMES.${b}.resources`);
for (const b of Object.keys(D.BIOMES)) { if (!S.SPAWN_RULES.events.pool[b]) errs.push('нет пула событий ' + b);
  for (const e of S.SPAWN_RULES.events.pool[b] ?? []) { const ev = D.WORLD_EVENTS[e]; if (!ev.biomes.includes('*') && !ev.biomes.includes(b)) errs.push(`${e} не разрешён в ${b}`); } }
if (S.SPAWN_RULES.events.intervalS !== D.WORLD_CONFIG.eventIntervalS || S.SPAWN_RULES.events.chance !== D.WORLD_CONFIG.eventChance) errs.push('events ≠ WORLD_CONFIG');
if (S.PLAYER_SPAWN.safe.noHostileRadius !== D.WORLD_CONFIG.fastTravel.noEnemiesRadius) errs.push('noHostileRadius ≠ канон');
if (S.PLAYER_SPAWN.firstLaunch.poi !== D.WORLD_CONFIG.spawn.poi) errs.push('spawn poi ≠ канон');
console.log(`spawn refs: ${refs}, errors: ${errs.length}`); errs.forEach((e) => console.log('  ✗ ' + e));
process.exitCode = errs.length ? 1 : 0;
