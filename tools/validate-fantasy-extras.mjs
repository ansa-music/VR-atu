// tools/validate-fantasy-extras.mjs — проверка shared/defs/fantasy_extras.js против канона (exit 1 при ошибках).
import * as D from '../shared/defs/index.js';
import * as X from '../shared/defs/fantasy_extras.js';
const errors = [], err = (m) => errors.push(m); let refs = 0;
const keys = (o) => new Set(Object.keys(o));
const POI = new Set(D.POIS.map((p) => p.id));
const reg = {
  b_: keys(D.BIOMES), poi_: POI, npc_: keys(D.NPCS), stn_: keys(D.STATIONS),
  q_: new Set([...Object.keys(D.QUESTS), ...D.SIDE_QUEST_TEMPLATES.map((t) => t.id)]),
  m_: keys(D.MOBS), boss_: new Set([...Object.keys(D.BOSSES), ...Object.keys(D.WORLD_EVENTS).filter((k) => k.startsWith('boss_'))]),
  ev_: new Set(Object.keys(D.WORLD_EVENTS).filter((k) => k.startsWith('ev_'))), w_: keys(D.WEAPONS), s_: keys(D.SKILLS),
  st_: keys(D.STATUSES), it_: keys(D.ITEMS), c_: new Set(Object.values(D.COMBOS).map((c) => c.id)), rc_: keys(D.RECIPES),
  art_: keys(X.ARTIFACTS), mnt_: keys(X.MOUNTS), pet_: keys(X.PETS), gad_: keys(X.GADGETS), wnd_: keys(X.WONDERS),
  lgv_: keys(X.LEGENDARY_VARIANTS), cos_: keys(X.COSMETICS), sec_: keys(X.SECRETS), pai_: keys(X.PET_AI),
};
// 1) префиксы, отсутствие пересечения с каноническим реестром
for (const p of Object.keys(X.EXTRA_ID_PREFIXES)) if (D.ID_PREFIXES[p]) err(`prefix ${p} clashes with canon`);
for (const p of Object.keys(D.ID_PREFIXES)) for (const q of Object.keys(X.EXTRA_ID_PREFIXES)) if (p !== q && (q.startsWith(p) || p.startsWith(q)))
  if (!(p === 'a_' && q === 'art_')) err(`prefix overlap ${p}/${q}`); // a_ — только внутри MOBS (defOnly), art_ отделяется длиной
const reg2 = { ARTIFACTS: 'art_', MOUNTS: 'mnt_', PETS: 'pet_', GADGETS: 'gad_', WONDERS: 'wnd_', LEGENDARY_VARIANTS: 'lgv_', COSMETICS: 'cos_', SECRETS: 'sec_' };
for (const [r, p] of Object.entries(reg2)) for (const k of Object.keys(X[r])) if (!D.hasPrefix(k, p)) err(`${r}: bad key ${k}`);
const counts = { ARTIFACTS: 12, MOUNTS: 6, PETS: 6, GADGETS: 8, WONDERS: 6, LEGENDARY_VARIANTS: 5, COSMETICS: 6, SECRETS: 5 };
for (const [r, n] of Object.entries(counts)) if (Object.keys(X[r]).length < n) err(`${r}: need ≥ ${n}`);
// 2) все ссылки в данных и прозе
const prefixes = Object.keys(reg).sort((a, b) => b.length - a.length);
const rx = new RegExp(`\\b(?:${prefixes.join('|')})[a-z0-9_]*[a-z0-9]`, 'g');
const walk = (v, path) => {
  if (typeof v === 'string') for (const mm of v.matchAll(rx)) {
    const id = mm[0], p = prefixes.find((x) => id.startsWith(x)); refs++;
    if (!reg[p].has(id)) err(`${path}: unknown ${id}`);
  } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k !== 'vfx') walk(x, `${path}.${k}`); }
};
for (const r of Object.keys(reg2)) walk(X[r], r);
// 3) источники: kind ↔ поле
const SRC = { poi: 'poi', boss: 'boss', quest: 'quest', event: 'event', craft: 'station', wonder: 'wonder', secret: 'secret' };
const checkSrc = (s, path) => {
  if (!s || !SRC[s.kind]) return err(`${path}: bad source`);
  if (!s[SRC[s.kind]]) err(`${path}: source.${SRC[s.kind]} missing`);
  if (s.cost) for (const [it, n] of s.cost) if (!D.ITEMS[it] || !(n > 0)) err(`${path}: bad cost ${it}`);
};
for (const r of ['ARTIFACTS', 'MOUNTS', 'PETS', 'GADGETS', 'COSMETICS']) for (const [k, v] of Object.entries(X[r])) checkSrc(v.source, `${r}.${k}`);
for (const [k, v] of Object.entries(X.LEGENDARY_VARIANTS)) checkSrc(v.unlock, `LEGENDARY_VARIANTS.${k}`);
// каждая сущность достижима: всё, что указано как награда/источник wonder/secret, существует (п. 2) — и каждый секрет что-то даёт
for (const [k, s] of Object.entries(X.SECRETS)) if (!s.reward || !s.where) err(`SECRETS.${k}: reward/where`);
// 4) потолки артефактов
const GROUP_CAP = { attacker: 'attackerBonus', vuln: 'vulnerability', mitigation: 'mitigation', dmgReduction: 'dmgReductionBuffMax',
  cooldownReduction: 'cooldownReduction', energyCostReduction: 'energyCostReduction', statusDuration: 'statusDuration',
  moveSpeedBonus: 'moveSpeedBonus', energyRegenBonus: 'energyRegenBonus', lootLuck: 'lootLuckMax' };
const R = X.ARTIFACT_RULES; const share = R.shareCapBudget;
const groups = {};
for (const [k, a] of Object.entries(X.ARTIFACTS)) {
  if (!D.RARITIES.includes(a.rarity)) err(`${k}: rarity`);
  for (const e of a.passive || []) {
    const cap = D.CAPS[GROUP_CAP[e.group]]; if (cap === undefined) { err(`${k}: unknown group ${e.group}`); continue; }
    const capV = e.group === 'lootLuck' ? cap - 1 : cap;
    if (!(e.value > 0 && e.value <= capV * share)) err(`${k}: ${e.group} ${e.value} > ${capV * share}`);
    (groups[e.group] ||= []).push({ k, v: e.value, leg: a.rarity === 'legendary' });
  }
  if (a.proc && !(Number.isInteger(a.proc.every) && a.proc.every >= 2)) err(`${k}: proc must be deterministic every ≥ 2`);
  if (a.proc && !D.STATUSES[a.proc.status]) err(`${k}: proc status`);
}
// худший набор: 3 слота, ≤ 1 легендарки, максимизируем сумму группы
for (const [g, arr] of Object.entries(groups)) {
  const leg = arr.filter((x) => x.leg).sort((a, b) => b.v - a.v), non = arr.filter((x) => !x.leg).sort((a, b) => b.v - a.v);
  const best = Math.max(non.slice(0, 3).reduce((s, x) => s + x.v, 0), (leg[0]?.v || 0) + non.slice(0, 2).reduce((s, x) => s + x.v, 0));
  const cap = D.CAPS[GROUP_CAP[g]], capV = g === 'lootLuck' ? cap - 1 : cap;
  if (best > capV * share + 1e-9) err(`worst-case ${g} ${best.toFixed(3)} > ${(capV * share).toFixed(3)}`);
  console.log(`artifact worst-case ${g}: ${best.toFixed(3)} / cap ${capV}`);
}
// 5) маунты — VR-комфорт
const MC = X.MOUNT_COMFORT;
for (const [k, m] of Object.entries(X.MOUNTS)) {
  const vmax = m.mode === 'fly' ? MC.maxFlySpeed : MC.maxGroundSpeed;
  if (m.speed > vmax) err(`${k}: speed ${m.speed} > ${vmax}`);
  if (m.accel > MC.maxAccel) err(`${k}: accel`);
  if (m.climbDeg && m.climbDeg > MC.maxClimbDeg) err(`${k}: climb`);
  if (m.mode === 'fly' && !m.landingAssist) err(`${k}: fly needs landingAssist`);
  for (const b of m.biomes) if (!D.BIOMES[b]) err(`${k}: biome ${b}`);
}
// 6) питомцы — доля DPS, статусы, ИИ
const petDpsMax = D.BALANCE_REF.refDps * X.PET_RULES.dpsShareMax;
for (const [k, p] of Object.entries(X.PETS)) {
  if (!X.PET_AI[p.ai]) err(`${k}: ai`);
  if (p.dps > petDpsMax) err(`${k}: dps ${p.dps} > ${petDpsMax}`);
  if (p.dps > 0 && !D.DAMAGE_TYPES.includes(p.type)) err(`${k}: type`);
  if (p.status && (!D.STATUSES[p.status.id] || p.status.every < 2)) err(`${k}: status`);
}
// 7) гаджеты — урон, контроль, замедление
const ref = D.BALANCE_REF.mobRef;
for (const [k, g] of Object.entries(X.GADGETS)) {
  if (!(g.energy > 0 && g.energy <= D.PLAYER_BASE.energy * 0.5)) err(`${k}: energy`);
  if (!(g.cdS >= 10)) err(`${k}: cd`);
  if (g.damage) {
    if (!D.DAMAGE_TYPES.includes(g.type)) err(`${k}: type`);
    const total = g.damage * (g.tickS ? Math.ceil(g.durS / g.tickS) : 1) * (1 - (g.type === 'physical' ? ref.armor : g.type === 'arcane' ? ref.armor / 2 : 0));
    if (total >= ref.hp) err(`${k}: kills m_ref in one use (${total})`);
    if (g.damage >= D.PLAYER_BASE.hp * 0.5) err(`${k}: single hit too big`);
  }
  if (g.slow !== undefined && g.slow > D.CAPS.slow) err(`${k}: slow > cap`);
  if (g.pullS !== undefined && g.pullS > D.CAPS.controlS) err(`${k}: control > cap`);
  if (g.status && !D.STATUSES[g.status.id]) err(`${k}: status`);
}
// 8) чудеса — биом, POI в этом биоме, урон среды ≤ 60 % ожидаемого HP L1
const poiBiome = Object.fromEntries(D.POIS.map((p) => [p.id, p.biome]));
for (const [k, w] of Object.entries(X.WONDERS)) {
  if (!D.BIOMES[w.biome]) err(`${k}: biome`);
  if (poiBiome[w.anchorPoi] !== w.biome) err(`${k}: anchorPoi ${w.anchorPoi} not in ${w.biome}`);
  if (w.hazard) { if (!D.DAMAGE_TYPES.includes(w.hazard.type)) err(`${k}: hazard type`);
    if (w.hazard.dmg > D.PLAYER_BASE.hp * D.CAPS.mobSingleHitOfPlayerHp) err(`${k}: hazard dmg`);
    if (w.hazard.status && !D.STATUSES[w.hazard.status]) err(`${k}: hazard status`); }
  if (w.drawCalls && w.drawCalls > 5) err(`${k}: drawCalls`);
}
// 9) легендарные трансформации — та же логика, что check-weapons
for (const [k, l] of Object.entries(X.LEGENDARY_VARIANTS)) {
  const b = D.WEAPONS[l.base]; if (!b) { err(`${k}: base`); continue; }
  if (!D.DAMAGE_TYPES.includes(l.type)) err(`${k}: type`);
  if (!D.STATIONS[l.station]) err(`${k}: station`);
  const w = { ...b, ...l.patch };
  if (w.damage > b.damage * 1.10) err(`${k}: damage +${((w.damage / b.damage - 1) * 100).toFixed(0)}% > 10%`);
  const chargeMul = w.charge && (w.cls === 'bow' || w.charge.required) ? w.charge.max : 1;
  const hit = w.damage * w.pellets * chargeMul, head = hit * D.ZONE[w.zone].head;
  if (hit >= D.PLAYER_BASE.hp) err(`${k}: ONE-SHOT BODY`);
  if (head >= D.PLAYER_BASE.hp && !['w_sv98', 'w_rune_bow', 'w_thunder_rail'].includes(l.base)) err(`${k}: ONE-SHOT HEAD`);
  const per = w.intervalMs / 1000, ttk = (Math.ceil(D.PLAYER_BASE.hp / hit) - 1) * per;
  console.log(`${k}: hit ${hit} head ${head.toFixed(1)} TTK150 ${ttk.toFixed(2)} s`);
}
// 10) косметика — бюджет частиц
const pBudget = D.PERF_CAPS.quest.particles * X.COSMETIC_RULES.particleShareMax;
for (const [k, c] of Object.entries(X.COSMETICS)) if (c.particles > pBudget) err(`${k}: particles ${c.particles} > ${pBudget}`);
// 11) ввод: 4 платформы, нет конфликтов с каноном
const usedPc = new Set(D.RESERVED_PC_KEYS), usedArd = new Set(Object.values(D.INPUT_MAP).map((x) => x.arduino));
const seenPc = new Set();
for (const [k, i] of Object.entries(X.EXTRA_INPUT)) {
  for (const pf of ['pc', 'phone', 'vr', 'arduino']) if (!i[pf]) err(`input ${k}: no ${pf}`);
  if (usedPc.has(i.pc) || seenPc.has(i.pc)) err(`input ${k}: PC key ${i.pc} taken`); seenPc.add(i.pc);
  if (usedArd.has(i.arduino)) err(`input ${k}: arduino gesture taken`);
}
console.log(`fantasy extras: ${Object.entries(reg2).map(([r]) => `${r}=${Object.keys(X[r]).length}`).join(' ')}; refs checked: ${refs}`);
if (errors.length) { console.error(errors.join('\n')); console.error(`ERRORS ${errors.length}`); process.exit(1); }
console.log('OK');
