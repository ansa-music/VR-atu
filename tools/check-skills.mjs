// tools/check-skills.mjs — проверка навыков, потолков, комбо и XP + генерация карточек/матрицы (Markdown).
// Запуск: node tools/check-skills.mjs [--md <каталог>]  (без --md только печать и код выхода)
import { SKILLS, COMBOS, CAPS, SKILL_RANK_MULT as RM, levelMul, STATUS_DEFAULTS as SD, LOADOUT, MOBS, BOSSES, WORLD_EVENTS, BALANCE_REF, LEVEL_CURVE, QUESTS, POIS } from '../shared/defs/index.js';
import fs from 'node:fs';
const out = {}; const err = []; const warn = [];
const ids = Object.keys(SKILLS); const sk = Object.values(SKILLS);
const KNOWN_MOBS = [...Object.keys(MOBS), ...Object.keys(BOSSES), ...Object.keys(WORLD_EVENTS).filter((k) => k.startsWith('boss_'))];
const STATUSES = Object.keys(SD); const TYPES = ['physical','fire','frost','lightning','arcane','poison'];
const r = (x, d = 0) => +x.toFixed(d);
const at = (v, i) => Array.isArray(v) ? v[i] : v;
// ── 1. структура
if (ids.length !== 20) err.push('count ' + ids.length);
for (const a of ['guardian','rogue','mystic','gunslinger']) { const n = sk.filter(s => s.archetype === a).length; if (n !== 5) err.push(a + ' ' + n); }
for (const s of sk) {
  if (!/^s_[a-z0-9_]+$/.test(s.id) || SKILLS[s.id] !== s) err.push('id ' + s.id);
  if (s.damage && s.damage.type && !TYPES.includes(s.damage.type)) err.push('type ' + s.id);
  if (s.status && !STATUSES.includes(s.status.id)) err.push('status ' + s.id);
  if (s.control && s.control.sec > CAPS.controlS) err.push('control>1s ' + s.id);
  if (s.status?.sec > CAPS.controlS) err.push('stagger>1s ' + s.id);
  for (const c of s.counters || []) for (const m of c.mobs) if (!KNOWN_MOBS.includes(m)) err.push(`моб ${m} (${s.id}) нет в enemies.js`);
  for (const k of ['vr','pc','phone','arduino']) if (!s.input?.[k]) err.push('input ' + k + ' ' + s.id);
  if (!s.unlock?.level) err.push('unlock ' + s.id);
  if ((s.talents || []).length !== 2) err.push('talents ' + s.id);
}
for (const c of Object.values(COMBOS)) {
  if (!/^c_[a-z_]+$/.test(c.id)) err.push('combo id ' + c.id);
  if (c.icdS < CAPS.comboIcdS && c.hit) err.push('combo icd<2 with hit ' + c.id);
  for (const k of ['skill','zone','stealth','buff','mark','passive']) { const v = c.requires?.[k]; if (v && !SKILLS[v]) err.push('combo ref ' + c.id + ' ' + v); }
  for (const v of c.trigger?.skill || []) if (!SKILLS[v]) err.push('combo trig ' + c.id + ' ' + v);
}
// ── 2. формула
const MOB = (L, mul = 1) => ({ hp: BALANCE_REF.mobRef.hp * levelMul(L) * mul, armor: BALANCE_REF.mobRef.armor });
function resolve({ base, type, zone = 1, attacker = [], charge = 1, vuln = [], armor = 0, resist = 0, buffs = [] }) {
  const aSum = attacker.reduce((a, b) => a + b, 0), vSum = vuln.reduce((a, b) => a + b, 0);
  const aM = 1 + Math.min(CAPS.attackerBonus, aSum), vM = 1 + Math.min(CAPS.vulnerability, vSum);
  const arm = type === 'physical' ? armor : type === 'arcane' ? armor / 2 : 0;
  const mit = Math.min(CAPS.mitigation, arm + resist + buffs.reduce((a, b) => a + b, 0));
  return { dmg: Math.max(1, Math.round(base * zone * aM * charge * vM * (1 - mit))), aSum, vSum, aM, vM, mit };
}
const skillBase = (s, rank, L, extra = 1) => (s.damage?.base || 0) * RM[rank - 1] * levelMul(L) * extra;
// таблица урона навыков
const dmgRows = [];
for (const s of sk) {
  if (!s.damage || !s.damage.base) continue;
  const row = { id: s.id, type: s.damage.type };
  for (const [L, rk] of [[1,1],[10,3],[20,4],[30,5]]) {
    const b = skillBase(s, rk, L); const m = MOB(L);
    const d = resolve({ base: b, type: s.damage.type, armor: m.armor }).dmg;
    row[`L${L}r${rk}`] = `${r(b)} / ${d} (${r(100 * d / m.hp)} %)`;
  }
  const e = at(s.energy, 0) || 0; row.dpe = e ? r(s.damage.base / e, 2) : '—';
  dmgRows.push(row);
}
// DoT
const burnTotal = (L, rk) => SD.st_burn.dps * SD.st_burn.durS * levelMul(L) * RM[rk - 1];
const poisonTotal = (L, rk, st) => SD.st_poison.dpsPerStack * st * SD.st_poison.durS * levelMul(L) * RM[rk - 1];
// ── 3. комбо: сценарии в худшем случае (L30, ранг 5, все потолки насыщены, моб без брони/резиста)
const L = 30, RK = 5, gearA = 0.25, attrA = 0.15, bracerA = 0.10; // экипировка/атрибуты/наруч — до потолка
const allA = [gearA, attrA, bracerA];
const elite = MOB(L, LEVEL_CURVE.elite.hp), boss = { hp: BOSSES[BALANCE_REF.bossRef].hp * LEVEL_CURVE.hpMult(BOSSES[BALANCE_REF.bossRef].lvl), armor: 0 };
const scen = [];
function sc(name, parts, note = '') {
  let total = 0; const det = [];
  for (const p of parts) { const x = resolve(p); total += x.dmg; det.push(`${p.label}: ${x.dmg}${x.aSum > CAPS.attackerBonus ? ` (attacker ${r(x.aSum*100)}%→50%)` : ''}${x.vSum > CAPS.vulnerability ? ` (vuln ${r(x.vSum*100)}%→30%)` : ''}`); }
  scen.push({ name, total, det, pctElite: r(100 * total / elite.hp, 1), pctBoss: r(100 * total / boss.hp, 1), note });
  return total;
}
const lm = levelMul(L), rm = RM[RK - 1];
const RES = SKILLS.s_resonance.mods.attacker[4];
sc('Раскол: Ледяной выстрел (хедшот, 3 chill) → Цепная молния', [
  { label: 'Ледяной выстрел ×2.2 голова', base: 50 * rm * lm, type: 'frost', zone: 2.0 + 0.20, attacker: [...allA, RES], vuln: [0.15] },
  { label: 'Молния', base: 40 * rm * lm, type: 'lightning', attacker: [...allA, RES], vuln: [0.15] },
  { label: 'Раскол 3×25', base: 75 * rm * lm, type: 'frost', attacker: [...allA, RES], vuln: [0.15, 0.10] },
  { label: '2 прыжка ×0.6', base: 2 * 0.6 * 40 * rm * lm, type: 'lightning', attacker: [...allA, RES] },
]);
sc('Перегрузка: Цепная молния → Огненный шар', [
  { label: 'Молния', base: 40 * rm * lm, type: 'lightning', attacker: [...allA, RES] },
  { label: 'Шар прямой', base: 45 * rm * lm, type: 'fire', attacker: [...allA, RES], vuln: [0.10] },
  { label: 'Перегрузка', base: 40 * rm * lm, type: 'fire', attacker: [...allA, RES], vuln: [0.10] },
  { label: 'Горение 3 стака 3 с', base: 3 * burnTotal(L, RK), type: 'fire', attacker: [...allA, RES] },
]);
sc('Сингулярность: Гравиколодец + Огненный шар (по 1 цели в центре)', [
  { label: 'Шар +20 % сингулярность', base: 45 * rm * lm, type: 'fire', attacker: [...allA, RES, 0.20] },
  { label: 'Схлопывание', base: 28 * rm * lm, type: 'arcane', attacker: [...allA, RES] },
]);
sc('Удар из тени + Казнь: Туман → Клинки → Танец клинков (1 цель, 5 стаков)', [
  { label: 'Танец: 2 удара по элите', base: 2 * 70 * rm * lm, type: 'physical', attacker: [...allA, 0.20, RES] },
  { label: 'Казнь 5 стаков', base: 3 * 5 * 6 * 1.5 * rm * lm, type: 'poison', attacker: [...allA, RES] },
]);
sc('Приговор + Волна ки (метка 15 % + шок 10 % + слабость 30 %)', [
  { label: 'Волна ки', base: 140 * rm * lm, type: 'arcane', attacker: [...allA, RES], vuln: [0.15, 0.10, 0.30] },
]);
sc('Ядовитое пламя: 5 стаков яда → Огненный шар', [
  { label: 'Шар', base: 45 * rm * lm, type: 'fire', attacker: [...allA] },
  { label: 'Ядовитое пламя 5×12', base: 60 * rm * lm, type: 'fire', attacker: [...allA] },
]);
// бурст-ротация мистика за 3 с (энергия 100): молния 30 + шар 25 + колодец(чужой, ×1.2=36) = 91
const mystic3s = scen.slice(0, 3).map(s => s.total);
// ── 4. потолки (нагрузочные проверки)
const capChecks = [];
const chk = (name, raw, cap, unit = '%') => { capChecks.push({ name, raw, cap, final: Math.min(raw, cap), unit }); };
chk('attacker: Резонанс 24 + Туман 20 + Сингулярность 20 + экипировка 25 + атрибуты 15 + наруч 10', 114, 50);
chk('vuln: Метка 15 + Шок 10 + слабость к типу 30 + аффикс «Ослабление» 5', 60, 30);
chk('замедление: Колодец 30 + Территория 25 + 3×chill 45', 100, 50);
chk('прыжки цепи: 3 + Проводимость 1 + Грозовая крепость 2 + Развилка 1', 7, 4, ' шт.');
chk('снижение урона игрока: Стойкость 16 + Территория 28 + броня экипировки 30 + резист 20', 94, 75);
chk('зона «голова»: пуля 2.0 + Твёрдая рука 0.20 + аффикс 0.15', 2.35, 2.4, '×');
chk('контроль: заморозка 1.0 с (элита/босс 0.5)', 1.0, 1.0, ' с');
chk('откаты: аффиксы 3×10 + талант созвездия 10', 40, 30);
for (const c of capChecks) if (c.final > c.cap) err.push('cap ' + c.name);
// ── 5. экономика энергии
const econ = sk.filter(s => s.type === 'active' && s.damage?.base).map(s => ({ id: s.id, e: at(s.energy, 0), cd: at(s.cooldownS, 0), perS: r(at(s.energy, 0) / at(s.cooldownS, 0), 2) }));
const loadEnergy = econ.sort((a, b) => b.perS - a.perS).slice(0, 3).reduce((a, b) => a + b.perS, 0);
if (loadEnergy > 8 * 1.0) warn.push('3 самых дорогих актива тратят ' + r(loadEnergy, 2) + ' энергии/с > реген 8/с (это ок: спам ограничен энергией)');
// ── 6. XP
const xpNext = LEVEL_CURVE.xpToNext;
const mobXp = (L) => 10 + 4 * L; // «эквивалент убийства» своего уровня (до нормировки mobXp core.js)
const BIOME_BY_L = (L) => L <= 5 ? 'b_meadow' : L <= 11 ? 'b_forest' : L <= 15 ? 'b_swamp' : L <= 21 ? 'b_mountains' : L <= 25 ? 'b_desert_ruins' : 'b_volcano';
let cum = 0, killEq = 0; const xp = [];
for (let l = 1; l <= 30; l++) {
  const n = l < 30 ? xpNext(l) : 0; const k = n ? Math.ceil(n / mobXp(l)) : 0;
  xp.push({ l, n, cum, k, biome: BIOME_BY_L(l), sp: l === 1 ? 1 : 1, tp: l % 3 === 0 ? 1 : 0, ap: l === 1 ? 0 : 2 }); cum += n; killEq += k;
}
const hours = killEq / 180;
if (hours < 10 || hours > 22) err.push('XP hours ' + hours);
for (const q of ['q_main_04', 'q_main_05', 'q_main_07', 'q_main_09', 'q_main_12']) if (!QUESTS[q]?.rewards?.skillPoints) err.push('skill point quest ' + q);
if (POIS.filter((p) => p.grants === 'skill_point').length !== 5) err.push('skill point shrines != 5');
// ── 7. матрица
const short = { s_grapple: 'Крю', s_barrier: 'Бар', s_gravity_well: 'Грв', s_bulwark: 'Стк', s_territory: 'Тер', s_dash: 'Рыв', s_venom_blades: 'ЯдК', s_toxic_smoke: 'Тум', s_second_wind: 'ВтД', s_blade_dance: 'Тан', s_teleport: 'Тлп', s_fireball: 'Огн', s_chain_lightning: 'Мол', s_resonance: 'Рез', s_ki_wave: 'Ки', s_glide: 'Пар', s_scan: 'Скн', s_frost_shot: 'Лёд', s_steady_hand: 'ТвР', s_bullet_time: 'Уск' };
const applies = (s) => { const a = new Set(); if (s.status) a.add(s.status.id); if (s.talents.some(t => /st_chill/.test(t.effect))) a.add('st_chill'); return a; };
const dtype = (s) => s.damage?.type;
const key = (a, b) => [a, b].sort().join('|');
const partial = {
  [key('s_gravity_well','s_territory')]: 'P1', [key('s_gravity_well','s_frost_shot')]: 'P1',
  [key('s_territory','s_frost_shot')]: 'P2', [key('s_fireball','s_frost_shot')]: 'P3', [key('s_fireball','s_territory')]: 'P3',
  [key('s_bulwark','s_territory')]: 'P4', [key('s_resonance','s_toxic_smoke')]: 'P5', [key('s_barrier','s_ki_wave')]: 'P6',
  [key('s_barrier','s_dash')]: 'P7', [key('s_barrier','s_teleport')]: 'P7', [key('s_grapple','s_dash')]: 'P8', [key('s_grapple','s_teleport')]: 'P8', [key('s_grapple','s_glide')]: 'P8',
  [key('s_venom_blades','s_blade_dance')]: 'P9', [key('s_steady_hand','s_scan')]: 'P10', [key('s_bullet_time','s_venom_blades')]: 'P11', [key('s_bullet_time','s_toxic_smoke')]: 'P11',
};
const beltExcl = ['s_dash', 's_glide', 's_teleport'];
const star = {};
const addStar = (a, b, tag) => { if (a === b || !SKILLS[a] || !SKILLS[b]) return; const k = key(a, b); (star[k] ||= new Set()).add(tag); };
// по комбо-данным
for (const c of Object.values(COMBOS)) {
  const reqFix = [c.requires?.skill, c.requires?.zone, c.requires?.stealth, c.requires?.buff, c.requires?.mark, c.requires?.passive, c.requires?.airborne].filter(Boolean); const req = [...reqFix, ...(c.requires?.skillAny || [])];
  const trg = c.trigger?.skill || [];
  for (const a of req) for (const b of trg) addStar(a, b, c.name);
  if (reqFix.length > 1) addStar(reqFix[0], reqFix[1], c.name);
  // статус + тип урона
  if (c.requires?.status && c.trigger?.dmgType) for (const a of sk) if (applies(a).has(c.requires.status)) for (const b of sk) if (c.trigger.dmgType.includes(dtype(b))) addStar(a.id, b.id, c.name);
  if (c.requires?.status && trg.length) for (const a of sk) if (applies(a).has(c.requires.status)) for (const b of trg) addStar(a.id, b, c.name);
}
addStar('s_grapple', 's_gravity_well', 'Таран якорем'); addStar('s_scan', 's_chain_lightning', 'Приговор');
for (const a of sk) if (a.id !== 's_resonance' && applies(a).size) addStar('s_resonance', a.id, 'Резонанс');
const cell = (a, b) => {
  if (a === b) return '—';
  if (SKILLS[a].type === 'ultimate' && SKILLS[b].type === 'ultimate') return '✖';
  if (beltExcl.includes(a) && beltExcl.includes(b)) return '✖';
  const k = key(a, b);
  if (partial[k]) return '◐' + partial[k].slice(1);
  if (star[k]) return '★';
  return '✔';
};
const order = ['s_grapple','s_barrier','s_gravity_well','s_bulwark','s_territory','s_dash','s_venom_blades','s_toxic_smoke','s_second_wind','s_blade_dance','s_teleport','s_fireball','s_chain_lightning','s_resonance','s_ki_wave','s_glide','s_scan','s_frost_shot','s_steady_hand','s_bullet_time'];
let mx = '| | ' + order.map(i => short[i]).join(' | ') + ' |\n|---|' + order.map(() => '---').join('|') + '|\n';
const cnt = { '✔': 0, '★': 0, '◐': 0, '✖': 0 };
for (const a of order) { mx += `| **${short[a]}** | ` + order.map(b => { const c = cell(a, b); if (a < b) cnt[c[0]] = (cnt[c[0]] || 0) + 1; return c; }).join(' | ') + ' |\n'; }
const starList = Object.entries(star).filter(([k]) => { const [a, b] = k.split('|'); const c = cell(a, b); return c === '★'; }).map(([k, v]) => `${k.split('|').map(i => short[i]).join('+')}: ${[...v].join(', ')}`);

// ── 8. карточки навыков
const AR = { guardian: 'Страж', rogue: 'Ловкач', mystic: 'Мистик', gunslinger: 'Стрелок' };
const TY = { movement: 'перемещение (пояс)', utility: 'утилита (врождённый)', active: 'активный', passive: 'пассивный', ultimate: 'ульта' };
const fmt = (v, u = '') => v === undefined || v === null ? '—' : Array.isArray(v) ? v.join(' / ') + u : v + u;
const capNotes = {
  s_barrier: 'поглощение — до HP и щита; отражение ≤ 100 % сырого урона снаряда; идеальный блок 1 раз в 2 с',
  s_gravity_well: 'slow 30 % в общем потолке 50 %; притяжение 0,5 с (элита 0,25 с), затем иммунитет к притяжению 3 с',
  s_bulwark: 'броня-бонус в общем потолке снижения 75 %', s_territory: 'снижение урона ≤ 30 % (потолок баффов) внутри 75 %; slow в потолке 50 %; заморозка 1 с → иммунитет 3 с',
  s_dash: 'i-frames не стыкуются: между окнами ≥ 0,5 с', s_venom_blades: 'яд ≤ 5 стаков; ≤ 1 стак за выстрел (дробь)', s_toxic_smoke: '+20 % засады — в attacker (потолок 50 %); 1 засада на цель за 6 с',
  s_second_wind: 'щит не выше 75; срабатывание не чаще 1 раза в 1 с', s_blade_dance: 'по боссу ≤ 2 удара; яд ≤ 5 стаков', s_teleport: 'i-frames только от снарядов; ≥ 0,5 с между окнами i-frames с Рывком/Танцем',
  s_fireball: 'горение ≤ 3 стаков; лужа не стакается сама с собой', s_chain_lightning: 'прыжков ≤ 4 из всех источников; по щиту ×1,5 только на шаге «щит»',
  s_resonance: '≤ +24 % (3 статуса × 8 %) внутри attacker 50 %', s_ki_wave: 'заряд прерывается стаггером; урон по каждой цели 1 раз',
  s_glide: 'скорость ≤ 10 м/с горизонт.; нельзя активировать ниже 2 м над землёй', s_scan: 'Метка +15 % в группе vuln (потолок 30 %); не стакается сама с собой',
  s_frost_shot: 'chill ≤ 3 стака; заморозка ≤ 1 с (элита 0,5)', s_steady_hand: 'итоговый множитель головы ≤ 2,4', s_bullet_time: 'мир ×0,3 (боссы ×0,6); продление ≤ +1,5 с', s_grapple: 'стаггер 0,4 с (элита 0,2), иммунитет к притяжению 3 с',
};
const synBy = {}; for (const [k, v] of Object.entries(star)) { const [a, b] = k.split('|'); for (const [x, y] of [[a, b], [b, a]]) (synBy[x] ||= []).push(y === 's_resonance' ? 'Резонанс усиливает (статус)' : x === 's_resonance' ? `статус от «${SKILLS[y].name}»` : `${[...v].join('/')} ← ${SKILLS[y].name}`); }
const cards = [];
for (const id of order) {
  const s = SKILLS[id]; const d = s.damage;
  const dmg = d && d.base ? `${d.type}, база ${d.base}${d.splash ? ` (+${d.splash} по области)` : ''}; по рангам ${RM.map(m => r(d.base * m)).join(' / ')} (L1), × levelMul(L)${d.when ? ' — ' + d.when : ''}` : d?.note ? d.note : '—';
  const st = s.status ? `${s.status.id}${s.status.stacks ? ' ×' + s.status.stacks : ''}${s.status.sec ? ' ' + s.status.sec + ' с' : ''}${s.status.everyS ? ' каждые ' + s.status.everyS + ' с' : ''}` : '—';
  const geo = [s.rangeM && `дальность ${fmt(s.rangeM, ' м')}`, s.radiusM && `радиус ${fmt(s.radiusM, ' м')}`, s.distanceM && `дистанция ${fmt(s.distanceM, ' м')}`, s.durationS && `длительность ${fmt(s.durationS, ' с')}`, s.lengthM && `луч ${s.lengthM}×${s.widthM} м`, s.targets && `целей ${fmt(s.targets)}`, s.absorb && `поглощение ${fmt(s.absorb)} × levelMul`, s.mods?.mitigation && `снижение урона ${fmt(s.mods.mitigation.map(x => +(x * 100).toFixed(1)), ' %')}`, s.perStatusAttacker && `+${fmt(s.perStatusAttacker.map(x => +(x * 100).toFixed(1)), ' %')} за статус`, s.headZoneBonus && `голова +${fmt(s.headZoneBonus)}`, s.onKill && `щит за убийство ${fmt(s.onKill.shield)}`, s.fallSpeed && `падение ${fmt(s.fallSpeed, ' м/с')}, полёт ${fmt(s.airSpeed, ' м/с')}`, s.regenOutOfCombatHp && `реген вне боя ${fmt(s.regenOutOfCombatHp, ' HP/с')}`, s.jumps && `прыжков ${fmt(s.jumps)} по ${s.jumpFalloff * 100} %`].filter(Boolean).join('; ');
  const cost = s.type === 'ultimate' ? `ульта ${s.ultCost}` : [s.energy ? `энергия ${fmt(s.energy)}` : null, s.stamina ? `стамина ${fmt(s.stamina)}` : null, s.staminaPerS ? `стамина ${fmt(s.staminaPerS, '/с')}` : null].filter(Boolean).join(', ') || '—';
  cards.push(`#### ${s.name} — \`${s.id}\`
| Поле | Значение |
|---|---|
| Архетип / тип | ${AR[s.archetype]} / ${TY[s.type]} |
| Стоимость | ${cost} |
| Откат (ранги 1→5) | ${s.cooldownS ? fmt(s.cooldownS, ' с') : '—'}${s.charges ? `; заряды ${fmt(s.charges)}` : ''} |
| Урон | ${dmg} |
| Статус / контроль | ${st}${s.control ? `; контроль ${s.control.kind} ≤ ${s.control.sec} с` : ''} |
| Радиус / время / прочее | ${geo || '—'} |
| Особенность | ${s.affinity || s.note || [s.reflect && 'отражение ' + s.reflect * 100 + ' %, идеальный блок ' + s.perfectBlockS + ' с', s.stealth && 'невидимость в облаке и ' + s.stealth.afterS + ' с после выхода', s.mark && 'Метка +' + s.mark.vuln * 100 + ' % на ' + s.mark.durationS + ' с', s.worldTimeScale && 'мир ×' + s.worldTimeScale + ', перезарядка ×' + s.reloadMul].filter(Boolean).join('; ') || '—'} |
| Открытый мир | ${s.utility} |
| Синергии | ${(synBy[id] || []).join('; ') || '—'} |
| Потолки | ${capNotes[id] || '—'} |
| Контры (мобы) | ${s.counters.map(c => `${c.mobs.length ? c.mobs.map(m => '`' + m + '`').join(', ') : c.tags.join(', ')} — ${c.effect}`).join('; ')} |
| Открытие | ур. ${s.unlock.level}: ${s.unlock.how} |
| VR | ${s.input.vr} |
| ПК | ${s.input.pc} |
| Телефон | ${s.input.phone} |
| Arduino | ${s.input.arduino} |
| Таланты (ранг 3, выбрать 1) | ${s.talents.map(t => `**${t.name}** (\`${t.id}\`): ${t.effect}`).join('; ')} |
`);
}
out.cards = cards.join('\n');

// ── вывод
const md = [];
md.push('### Урон навыков (база после ранга и уровня / итог по мобу-эталону 240×levelMul HP, броня 15 % (% его HP))');
md.push('| Навык | Тип | L1 r1 | L10 r3 | L20 r4 | L30 r5 | Урон/энергия (L1) |\n|---|---|---|---|---|---|---|');
for (const x of dmgRows) md.push(`| \`${x.id}\` | ${x.type} | ${x.L1r1} | ${x.L10r3} | ${x.L20r4} | ${x.L30r5} | ${x.dpe} |`);
md.push(`\nDoT: горение 3 стака за 3 с — L1 r1 ${r(3*burnTotal(1,1))}, L30 r5 ${r(3*burnTotal(30,5))}; яд 5 стаков за 6 с — L1 r1 ${r(poisonTotal(1,1,5))}, L30 r5 ${r(poisonTotal(30,5,5))}.`);
md.push(`\n### Комбо в худшем случае (L30, ранг 5, экипировка +25 %, атрибуты +15 %, наруч +10 %, Резонанс +24 %; элита = ${r(elite.hp)} HP, босс = ${r(boss.hp)} HP, без брони)`);
md.push('| Сценарий | Итог урона | % HP элиты | % HP босса | Разбивка |\n|---|---|---|---|---|');
for (const s of scen) md.push(`| ${s.name} | ${s.total} | ${s.pctElite} | ${s.pctBoss} | ${s.det.join('; ')} |`);
md.push('\n### Нагрузочные проверки потолков\n| Проверка | Сумма без потолка | Потолок | Итог |\n|---|---|---|---|');
for (const c of capChecks) md.push(`| ${c.name} | ${c.raw}${c.unit} | ${c.cap}${c.unit} | ${c.final}${c.unit} |`);
md.push(`\nЭнергия: 3 самых «дорогих в секунду» актива тратят ${r(loadEnergy, 2)} энергии/с при регене 8/с → непрерывный спам невозможен, ротация упирается в энергию через ≈ ${r(100 / Math.max(0.01, loadEnergy - 8), 1)} с.`);
md.push(`\nОпыт: всего до 30 уровня ${cum} XP ≈ ${killEq} «убийств-эквивалентов» ≈ ${r(hours, 1)} ч при 180 эквивалентах/ч (убийства + POI + квесты).`);
out.dmg = md.join('\n');
out.matrix = mx + `\nИтого пар: ✔ ${cnt['✔']}, ★ ${cnt['★']}, ◐ ${cnt['◐']}, ✖ ${cnt['✖']} (из 190).`;
out.stars = starList.map(s => '- ' + s).join('\n');
out.xp = '| Ур. | XP до след. | XP всего (на входе) | Убийств моба своего уровня | Биом-ориентир | ОН | ОТ | ОХ |\n|---|---|---|---|---|---|---|---|\n' + xp.map(x => `| ${x.l} | ${x.n || '—'} | ${x.cum} | ${x.k || '—'} | ${x.biome} | ${x.l === 1 ? '1 (старт)' : 1} | ${x.tp || ''} | ${x.ap || ''} |`).join('\n');
const mdDir = process.argv.includes('--md') ? process.argv[process.argv.indexOf('--md') + 1] : null;
if (mdDir) for (const [k, v] of Object.entries(out)) fs.writeFileSync(`${mdDir}/out_${k}.md`, v);
console.log(out.dmg); console.log(out.matrix); console.log(out.stars);
console.log('WARN', warn); console.log('ERRORS', err.length, err);
process.exitCode = err.length ? 1 : 0;
