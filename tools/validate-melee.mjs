// tools/validate-melee.mjs — проверка мечей и мечевых навыков: ID, ссылки, TTK/DPS, потолки, раскладки слотов.
import { MELEE_WEAPONS, SWORD_SKILLS, DEFAULT_SLOTS, MELEE_CLASSES, POSES, MELEE_LIMITS as L, ELEMENT_GLOW, ALL_WEAPONS } from '../shared/defs/melee.js';
import { WEAPONS } from '../shared/defs/weapons.js';
import { DAMAGE_TYPES, CAPS, BALANCE_REF } from '../shared/defs/core.js';
import { STATUSES } from '../shared/defs/statuses.js';
import { POIS } from '../shared/defs/pois.js';
import { BOSSES } from '../shared/defs/enemies.js';
const err = []; const E = (m) => err.push(m); const r2 = (x) => Math.round(x * 100) / 100;
const poiIds = new Set(POIS.map((p) => p.id));
console.log('id | класс | урон | инт мс | DPS | TTK150 с | дальн');
for (const [id, w] of Object.entries(MELEE_WEAPONS)) {
  if (!/^w_[a-z0-9_]+$/.test(id) || w.id !== id) E(`${id}: плохой id`);
  if (WEAPONS[id]) E(`${id}: конфликт с WEAPONS`);
  if (!MELEE_CLASSES[w.mclass]) E(`${id}: класс ${w.mclass}`);
  if (!DAMAGE_TYPES.includes(w.type)) E(`${id}: тип ${w.type}`);
  if (w.status && !STATUSES[w.status.id]) E(`${id}: статус ${w.status.id}`);
  if (w.source?.poi && !poiIds.has(w.source.poi)) E(`${id}: POI ${w.source.poi}`);
  if (w.source?.boss && !BOSSES[w.source.boss]) E(`${id}: босс ${w.source.boss}`);
  const dps = w.damage / (w.intervalMs / 1000), hits = Math.ceil(BALANCE_REF.targetHp / w.damage), ttk = (hits - 1) * w.intervalMs / 1000;
  console.log(`${id} | ${w.mclass} | ${w.damage} | ${w.intervalMs} | ${r2(dps)} | ${r2(ttk)} | ${w.range}`);
  if (dps > L.maxWeaponDps) E(`${id}: DPS ${r2(dps)} > ${L.maxWeaponDps}`);
  if (ttk < L.ttk150[0] || ttk > L.ttk150[1]) E(`${id}: TTK ${r2(ttk)} вне ${L.ttk150}`);
  if (w.damage * w.swing.max > L.maxSingleHit) E(`${id}: сильный взмах > потолка`);
}
const classes = Object.keys(MELEE_CLASSES), count = Object.fromEntries(classes.map((c) => [c, 0]));
console.log('\nнавык | поза | ударов | Σmul | энерг | откат | задержка | худший удар | цикл DPS');
for (const [id, s] of Object.entries(SWORD_SKILLS)) {
  if (!/^ssk_[a-z0-9_]+$/.test(id) || s.id !== id) E(`${id}: плохой id`);
  if (!POSES[s.pose]) E(`${id}: поза ${s.pose}`);
  if (!DAMAGE_TYPES.includes(s.element) || !ELEMENT_GLOW[s.element]) E(`${id}: стихия ${s.element}`);
  if (s.status && !STATUSES[s.status.id]) E(`${id}: статус ${s.status.id}`);
  if (!s.classes.length || s.classes.some((c) => !MELEE_CLASSES[c])) E(`${id}: классы`);
  if (s.mastery < 1 || s.mastery > 10) E(`${id}: мастерство`);
  if (s.postDelayS < L.postDelayMin || s.postDelayS > L.postDelayMax) E(`${id}: задержка ${s.postDelayS}`);
  if ((s.stagger || 0) > STATUSES.st_stagger.maxS) E(`${id}: оглушение > maxS`);
  const sum = s.hits.reduce((a, h) => a + h.mul, 0); if (sum > L.maxSkillMul) E(`${id}: Σmul ${sum}`);
  for (let i = 1; i < s.hits.length; i++) if (s.hits[i].t <= s.hits[i - 1].t) E(`${id}: расписание не по возрастанию`);
  const dur = s.hits.at(-1).t / 1000 + (s.counter?.windowS ? 0 : 0) + s.postDelayS;
  let worstHit = 0, worstDps = 0;
  for (const c of s.classes) { count[c]++; const w = Object.values(MELEE_WEAPONS).find((x) => x.mclass === c);
    // худший случай: оружие × mul × сильный взмах нет (навык без charge) × attacker cap
    const hit = Math.max(...s.hits.map((h) => h.mul)) * w.damage * (1 + CAPS.attackerBonus); worstHit = Math.max(worstHit, hit);
    worstDps = Math.max(worstDps, sum * w.damage / Math.max(0.2, dur)); }
  console.log(`${id} | ${s.pose} | ${s.hits.length} | ${r2(sum)} | ${s.energy} | ${s.cooldownS} | ${s.postDelayS} | ${Math.round(worstHit)} | ${Math.round(worstDps)}`);
  if (worstDps > L.maxSkillCycleDps) E(`${id}: цикл DPS ${Math.round(worstDps)} > ${L.maxSkillCycleDps}`);
  if (worstHit / (1 + CAPS.attackerBonus) > L.maxSingleHit) E(`${id}: удар ${Math.round(worstHit)} > ${L.maxSingleHit}`);
}
for (const c of classes) if (count[c] < 3) E(`класс ${c}: навыков ${count[c]} < 3`);
for (const [c, slots] of Object.entries(DEFAULT_SLOTS)) for (const [d, id] of Object.entries(slots)) { const s = SWORD_SKILLS[id]; if (!s) E(`слот ${c}.${d}: ${id}`); else if (!s.classes.includes(c)) E(`слот ${c}.${d}: ${id} не для класса`); }
if (L.attackerFromMelee > L.attackerCap) E(`attacker от ближнего боя ${L.attackerFromMelee} > ${L.attackerCap}`);
if (Object.keys(SWORD_SKILLS).length < 15) E('навыков < 15');
if (Object.keys(MELEE_WEAPONS).length < 5) E('мечей < 5');
if (Object.keys(ALL_WEAPONS).length !== Object.keys(WEAPONS).length + Object.keys(MELEE_WEAPONS).length) E('ALL_WEAPONS');
console.log(`\nмечей ${Object.keys(MELEE_WEAPONS).length}, навыков ${Object.keys(SWORD_SKILLS).length}, по классам ${JSON.stringify(count)}`);
if (err.length) { console.error('validate-melee: ОШИБКИ\n' + err.join('\n')); process.exit(1); } else console.log('validate-melee: OK');
