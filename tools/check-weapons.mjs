// tools/check-weapons.mjs — DPS/TTK оружия на L1 (на любом L масштаб оружия = масштаб HP мобов, levelMul). Запуск: node tools/check-weapons.mjs
import { WEAPONS, ZONE, PLAYER_BASE, BALANCE_REF } from '../shared/defs/index.js';
const HP = PLAYER_BASE.hp, MOB = BALANCE_REF.mobRef;
const mit = (t) => t === 'physical' ? 1 - MOB.armor : t === 'arcane' ? 1 - MOB.armor / 2 : 1;
const fo = (w, r) => { const [s, e, m] = w.falloff; return r <= s ? 1 : 1 - (1 - m) * Math.min(1, (r - s) / Math.max(1e-6, e - s)); };
const rows = []; let bad = 0;
for (const w of Object.values(WEAPONS)) {
  const chargeMul = w.charge && (w.cls === 'bow' || w.charge.required) ? w.charge.max : 1;
  const hit = w.damage * w.pellets * chargeMul;            // корпус, в упор, полный заряд
  const per = w.intervalMs / 1000;
  const burst = hit / per;
  let sus = burst;
  if (w.mag && w.reloadS) sus = w.reloadPer === 'shell' ? (w.mag * hit) / (w.mag * per + w.mag * w.reloadS) : (w.mag * hit) / (w.mag * per + w.reloadS);
  if (w.heat) { const n = Math.ceil(1 / w.heat.perShot); sus = (n * hit) / (n * per + w.heat.overheatS); }
  if (w.energy) sus = Math.min(burst, (8 / w.energy) * hit);
  const shots = Math.ceil(HP / hit), ttk = (shots - 1) * per;
  const mh = Math.round(hit * mit(w.type) * 100) / 100, mshots = Math.ceil(MOB.hp / mh), mttk = (mshots - 1) * per;
  const z = ZONE[w.zone]; const head = hit * z.head;
  const farHit = hit * fo(w, w.falloff[1]); const farShots = Math.ceil(HP / farHit);
  const oneShotBody = hit >= HP, oneShotHead = head >= HP;
  rows.push({ id: w.id, type: w.type, hit, head: +head.toFixed(1), limb: +(hit * z.limb).toFixed(1), per, burst: +burst.toFixed(1), sus: +sus.toFixed(1), shots, ttk: +ttk.toFixed(2), mshots, mttk: +mttk.toFixed(2), farShots, farTtk: +((farShots - 1) * per).toFixed(2), oneShotHead });
  if (oneShotBody) { bad++; console.error('ONE-SHOT BODY', w.id); }
  if (oneShotHead && !['w_sv98', 'w_rune_bow', 'w_thunder_rail'].includes(w.id)) { bad++; console.error('ONE-SHOT HEAD', w.id); }
  if (ttk > 2.0 || (ttk < 0.5 && shots > 1)) console.warn('TTK out of 0.5–2.0', w.id, ttk);
}
const ids = Object.keys(WEAPONS); if (ids.length !== 20) { bad++; console.error('count', ids.length); }
for (const k of ids) if (!/^w_[a-z0-9_]+$/.test(k) || WEAPONS[k].id !== k) { bad++; console.error('id', k); }
const prim = rows.filter(r => !['w_arcane_bracer', 'w_aegis_shield', 'w_rune_grenades', 'w_harpoon_crossbow'].includes(r.id));
const mx = Math.max(...prim.map(r => r.burst)), mn = Math.min(...prim.map(r => r.burst));
console.log('| ID | Тип | Удар (корпус) | Голова | Конечн. | Интервал, с | DPS пик | DPS устойч. | Попаданий 150 HP | TTK 150 HP, с | Попаданий моб 240/15% | TTK моб, с | TTK на конце падения, с |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| \`${r.id}\` | ${r.type} | ${r.hit} | ${r.head}${r.oneShotHead ? ' ⚠' : ''} | ${r.limb} | ${r.per} | ${r.burst} | ${r.sus} | ${r.shots} | ${r.ttk} | ${r.mshots} | ${r.mttk} | ${r.farTtk} |`);
console.log(`\nmaxDPS/minDPS (основное) = ${mx}/${mn} = ${(mx / mn).toFixed(2)}; errors=${bad}`);
process.exit(bad ? 1 : 0);
