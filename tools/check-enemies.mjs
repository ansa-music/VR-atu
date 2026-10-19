// tools/check-enemies.mjs — баланс врагов по ЕДИНОЙ кривой (core.js): HP мобов ×levelMul = урон игрока ×levelMul;
// запас игрока = playerPoolRef(L); потолки удара = CAPS × playerHpRef(L). Запуск: node tools/check-enemies.mjs
import { LEVEL_CURVE as LC, CAPS, BALANCE_REF, MOBS, BOSSES, ELITE_AFFIXES, SPAWN_TABLES, WORLD_EVENTS, BIOMES } from '../shared/defs/index.js';
const TYPES = ['physical', 'fire', 'frost', 'lightning', 'arcane', 'poison'];
const BIOME = Object.fromEntries(Object.entries(BIOMES).map(([k, b]) => [k, b.levels]));
const REF_DPS = BALANCE_REF.refDps; // 160: середина канона 150 HP / 0,94 с (115–215)
const hitCap = (L) => CAPS.mobSingleHitOfPlayerHp * LC.playerHpRef(L), chanCap = (L) => CAPS.mobChannelOfPlayerHp * LC.playerHpRef(L);
const errs = []; const warn = [];
const mitig = (res, t) => Math.min(0.75, Math.max(-0.5, t === 'arcane' ? (res.arcane || 0) + 0.5 * (res.physical || 0) : (res[t] || 0)));
const ttk = (hp, L, res, t, zone = 1, dps = REF_DPS) => hp * LC.hpMult(L) / (dps * LC.playerDmgMult(L) * zone * (1 - mitig(res, t)));
const WIN = { swarm: [0.15, 0.6], flyer: [0.25, 1.2], ranged: [0.5, 1.2], caster: [0.6, 1.4], support: [0.6, 1.4], melee: [0.7, 1.7], tank: [2.0, 5.0] };
const perUse = (a) => (a.dmg || 0) * (a.aoe ? 1 : (a.count || 1)) * (a.tick && a.dur ? a.dur / a.tick : 1);
const rows = [];
for (const [id, m] of Object.entries(MOBS)) {
  const [a, b] = m.lvl, L = Math.round((a + b) / 2), br = BIOME[m.biome];
  if (id !== 'm_gold_fairy' && (a < br[0] || b > br[1])) errs.push(`${id}: уровни ${a}-${b} вне биома ${br}`);
  for (const t of TYPES) { const v = m.res[t]; if (v === undefined || v < -0.5 || v > 0.6) errs.push(`${id}: res.${t}=${v}`); }
  const phys = ttk(m.hp, L, m.res, 'physical');
  const all = TYPES.map((t) => ttk(m.hp, L, m.res, t)); const best = Math.min(...all), worst = Math.max(...all);
  const weak = m.zones.weak && m.zones.weak.mult > 1 ? ttk(m.hp, L, m.res, 'physical', m.zones.weak.mult) : null;
  const [lo, hi] = WIN[m.role];
  if (phys < lo || phys > hi) errs.push(`${id}: TTK(phys) ${phys.toFixed(2)} вне окна ${m.role} ${lo}-${hi}`);
  if (m.role === 'tank' && weak && weak > 2.5) errs.push(`${id}: TTK по слабому месту ${weak.toFixed(2)} > 2.5`);
  const elite = phys * LC.elite.hp;
  let maxHit = 0, dps = 0;
  for (const at of m.attacks) {
    if ((at.dmg || 0) >= 25 && at.tele < 0.6) errs.push(`${id}.${at.id}: урон ${at.dmg} с телеграфом ${at.tele} < 0.6`);
    if (at.dmg > 0 && at.tele < 0.3) errs.push(`${id}.${at.id}: телеграф < 0.3`);
    if (at.status?.st_stagger > 1) errs.push(`${id}.${at.id}: контроль > 1 с`);
    const u = perUse(at) * LC.dmgMult(b) * LC.elite.dmg; maxHit = Math.max(maxHit, u);
    if (at.dmg > 0) dps += perUse(at) * LC.dmgMult(b) / ((at.cd || at.tick || 1) + (at.cd ? at.tele : 0));
  }
  if (maxHit > hitCap(b)) errs.push(`${id}: макс. удар элиты на ур.${b} = ${maxHit.toFixed(0)} > ${hitCap(b).toFixed(0)}`);
  rows.push({ id, role: m.role, L, phys, best, worst, weak, elite, dps, maxHit });
}
// паки: время убийства игрока без брони (при 50 % времени атак — реальная доля из-за перемещений/телеграфов)
const packRows = [];
for (const [bid, st] of Object.entries(SPAWN_TABLES)) {
  for (const p of st.packs) {
    let dps = 0, hp = 0, n = 0, burst = 0;
    for (const [mid, , max] of p.mobs) {
      const m = MOBS[mid]; if (!m) { errs.push(`${bid}: нет моба ${mid}`); continue; }
      const r = rows.find((x) => x.id === mid); n += max;
      if (m.ai === 'ai_kamikaze') burst += m.attacks[0].dmg * LC.dmgMult(st.lvl[1]) * max * 0.5; // половина долетает
      else dps += r.dps * max * 0.5;
      hp += m.hp * LC.hpMult(st.lvl[1]) / (1 - mitig(m.res, 'physical')) * max;
    }
    if (!dps && !burst) continue;
    const PLAYER_POOL = LC.playerPoolRef(st.lvl[1]);
    if (burst >= PLAYER_POOL * 0.6) errs.push(`${bid}: взрывной урон пака ${burst.toFixed(0)} ≥ 60 % запаса`);
    const tPlayer = dps ? (PLAYER_POOL - burst) / dps : Infinity, tPack = hp / (REF_DPS * LC.playerDmgMult(st.lvl[1]));
    if (tPlayer < 5) errs.push(`${bid} пак [${p.mobs.map((x) => x[0]).join(',')}]: игрок умирает за ${tPlayer.toFixed(1)} с < 5`);
    packRows.push({ bid, pack: p.mobs.map((x) => `${x[0].slice(2)}×${x[2]}`).join(' + '), n, tPlayer, tPack, burst });
  }
  for (const list of Object.values(st.poi || {})) for (const [mid] of list) if (!MOBS[mid]) errs.push(`${bid}.poi: нет ${mid}`);
  for (const e of st.night.events) if (!WORLD_EVENTS[e]) errs.push(`${bid}: нет события ${e}`);
  if (!BOSSES[st.boss]) errs.push(`${bid}: нет босса ${st.boss}`);
}
const bossRows = [];
const bossCheck = (id, b, L) => {
  const pure = ttk(b.hp, L, b.res, 'physical'); const real = pure / 0.65;
  const atks = b.phases ? b.phases.flatMap((p) => p.attacks) : b.attacks;
  for (const at of atks) {
    if (at.dmg > 0 && at.tele < 0.6) errs.push(`${id}.${at.id}: телеграф ${at.tele} < 0.6`);
    const hit = (at.tick ? at.dmg * at.dur / at.tick : at.aoe ? at.dmg : at.dmg * (at.count || 1)) * LC.dmgMult(L);
    if (hit > hitCap(L) && !at.tick) errs.push(`${id}.${at.id}: удар ${hit.toFixed(0)} > ${hitCap(L).toFixed(0)}`);
    if (at.tick && hit > chanCap(L)) errs.push(`${id}.${at.id}: полный канал ${hit.toFixed(0)} > ${chanCap(L).toFixed(0)}`);
    if (at.summon && !MOBS[at.summon[0]]) errs.push(`${id}: призыв неизвестного ${at.summon[0]}`);
  }
  bossRows.push({ id, L, pure, real, hpL: Math.round(b.hp * LC.hpMult(L)) });
};
for (const [id, b] of Object.entries(BOSSES)) bossCheck(id, b, b.lvl);
for (const [id, e] of Object.entries(WORLD_EVENTS)) if (e.kind === 'roaming_miniboss') bossCheck(id, e, e.lvl[1]);
for (const r of bossRows) {
  const mini = r.id.startsWith('boss_roam');
  const [lo, hi] = mini ? [15, 60] : [40, 140];
  if (r.pure < lo || r.pure > hi) errs.push(`${r.id}: чистый TTK ${r.pure.toFixed(0)} с вне ${lo}-${hi}`);
}
for (const [id, a] of Object.entries(ELITE_AFFIXES)) for (const x of a.excl) if (!ELITE_AFFIXES[x]?.excl.includes(id)) errs.push(`${id}: несимметричная несовместимость с ${x}`);
// оружие канона: окно 0,7–1,3 с по 150 HP → проверка, что ref DPS лежит в окне
const wLo = 150 / 1.3, wHi = 150 / 0.7;
const f = (x) => (x == null ? '—' : x.toFixed(2));
console.log(`Ref DPS ${REF_DPS} (канон ${wLo.toFixed(0)}–${wHi.toFixed(0)}), масштаб HP = масштаб урона оружия по уровню\n`);
console.log('| Моб | Роль | Ур. | TTK phys | TTK лучш. тип | TTK худш. тип | TTK слаб. место | Элита phys | DPS моба | Макс. удар элиты |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.id} | ${r.role} | ${r.L} | ${f(r.phys)} | ${f(r.best)} | ${f(r.worst)} | ${f(r.weak)} | ${f(r.elite)} | ${r.dps.toFixed(1)} | ${r.maxHit.toFixed(0)} |`);
console.log('\n| Биом | Пак (макс., ур. = верх биома) | Мобов | Взрывной урон | Игрок без брони умирает за, с | Пак умирает за, с |\n|---|---|---|---|---|---|');
for (const p of packRows) console.log(`| ${p.bid} | ${p.pack} | ${p.n} | ${p.burst ? p.burst.toFixed(0) : '—'} | ${isFinite(p.tPlayer) ? p.tPlayer.toFixed(1) : '∞'} | ${p.tPack.toFixed(1)} |`);
console.log('\n| Босс | Ур. | HP на уровне | Чистый TTK, с | Реальный (65 % аптайм), с |\n|---|---|---|---|---|');
for (const r of bossRows) console.log(`| ${r.id} | ${r.L} | ${r.hpL} | ${r.pure.toFixed(0)} | ${r.real.toFixed(0)} |`);
console.log(`\nОшибок: ${errs.length}`); errs.forEach((e) => console.log(' ✗ ' + e));
process.exitCode = errs.length ? 1 : 0;
export const ENEMY_ERRORS = errs;
