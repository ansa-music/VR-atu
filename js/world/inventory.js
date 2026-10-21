// js/world/inventory.js — инвентарь, экипировка (9 слотов + 3 артефакта), редкость, аффиксы af_*, лут с таблиц мобов,
// крафт на станциях, золото и магазин хаба. Чистая логика (без DOM), детерминированный ГСЧ для тестов.
import { RARITIES, DAMAGE_TYPES } from '../../shared/defs/core.js';
import { GEAR_SLOTS, GEAR_AFFIXES, AFFIX_COUNT_BY_RARITY } from '../../shared/defs/progression.js';
import { ITEMS } from '../../shared/defs/items.js';
import { RECIPES, FORGE } from '../../shared/defs/crafting.js';
import { WEAPONS, RARITY } from '../../shared/defs/weapons.js';
import { MOBS, BOSSES, RARITY_WEIGHTS } from '../../shared/defs/enemies.js';
import { ARTIFACTS, ARTIFACT_RULES } from '../../shared/defs/fantasy_extras.js';

export const RARITY_COLOR = Object.freeze(Object.fromEntries(RARITIES.map((r) => [r, RARITY[r]?.color || '#ccc'])));
export const RARITY_RU = Object.freeze({ common: 'Обычный', uncommon: 'Необычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' });
export const SLOT_RU = Object.freeze({ weapon: 'Оружие', bracer: 'Наруч', head: 'Голова', body: 'Тело', hands: 'Руки', legs: 'Ноги', amulet: 'Амулет', ring1: 'Кольцо 1', ring2: 'Кольцо 2' });
export const GEAR_CAP = 60;
const AMMO_RU = { it_ammo_pistol: 'Пистолетные патроны', it_ammo_rifle: 'Винтовочные патроны', it_ammo_shell: 'Дробовые патроны', it_ammo_sniper: 'Снайперские патроны', it_arrow: 'Стрела', it_bolt: 'Болт', it_fuel: 'Топливо', it_ammo_cell: 'Энергоячейка', it_rune_grenade: 'Рунная граната' };
export const itemLabel = id => AMMO_RU[id] || ITEMS[id]?.name || ARTIFACTS[id]?.name || WEAPONS[id]?.name || id;
const TYPE_RU = { physical: 'физический', fire: 'огонь', frost: 'мороз', lightning: 'молния', arcane: 'аркана', poison: 'яд', swamp: 'болото', cold: 'холод', heat: 'жара', heat_sun: 'зной', thorns: 'шипы' };
const ARMOR_BASES = { head: ['Шлем стража', 'Капюшон следопыта', 'Тюбетейка-оберег'], body: ['Чапан странника', 'Кольчуга', 'Броня Самұрық'], hands: ['Перчатки охотника', 'Наручи кузнеца'],
  legs: ['Сапоги степняка', 'Поножи'], bracer: ['Арканный наруч', 'Рунный наруч'], amulet: ['Тұмар', 'Амулет звезды'], ring: ['Кольцо огня', 'Серебряный перстень', 'Кольцо ветра'] };
const AFFIX_RU = { af_dmg_type: 'урон {t}', af_skill_dmg: 'урон навыков', af_weapon_dmg: 'урон оружия', af_vs_status: 'урон по целям со статусом', af_airborne: 'урон в воздухе', af_weaken: 'ослабление',
  af_head_mult: 'урон в голову', af_armor: 'броня', af_resist: 'сопротивление {t}', af_hp: 'здоровье', af_shield_regen: 'реген щита/с', af_shield_delay: 'задержка щита −с', af_energy_regen: 'реген энергии/с',
  af_energy_cost: 'стоимость энергии −', af_cdr: 'перезарядка навыков −', af_status_dur: 'длительность статусов', af_status_every: 'статус на удар раньше', af_cc_reduction: 'сопр. контролю', af_stamina: 'стамина',
  af_move_speed: 'скорость', af_glide: 'расход планирования −', af_ult_gain: 'заряд ульты', af_heal_received: 'получаемое лечение', af_hazard: 'защита от среды {t}', af_loot_find: 'поиск добычи', af_xp: 'опыт', af_skill_rank: '+1 ранг навыка' };

export function rng(seed = 1) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];
export const tierForIl = (il) => (il >= 22 ? 4 : il >= 16 ? 3 : il >= 10 ? 2 : il >= 5 ? 1 : 0);
const slotKey = (s) => (s === 'ring1' || s === 'ring2' ? 'ring' : s);
const affixFits = (a, slot) => { const k = slotKey(slot); return a.slots.includes(k) || (a.slots.includes('armor') && ['head', 'body', 'hands', 'legs'].includes(k)); };

export function rollRarity(profile = 'normal', r = Math.random, lootFind = 0) {
  const w = { ...(RARITY_WEIGHTS[profile] || RARITY_WEIGHTS.normal) };
  for (const k of ['rare', 'epic', 'legendary']) w[k] *= 1 + Math.min(0.25, lootFind);
  const sum = RARITIES.reduce((s, k) => s + (w[k] || 0), 0); let x = r() * sum;
  for (const k of RARITIES) { x -= w[k] || 0; if (x < 0) return k; } return 'common';
}
let UID = 1; const newUid = () => `g${Date.now().toString(36)}${(UID++).toString(36)}`;
/** Ролл аффиксов по правилам 5.9: число по редкости, уникальные ключи, ступень по il, af_skill_rank только epic+. */
export function rollAffixes(slot, rarity, il, r = Math.random) {
  const n = AFFIX_COUNT_BY_RARITY[rarity] || 1, t = tierForIl(il), out = [];
  const pool = Object.entries(GEAR_AFFIXES).filter(([id, a]) => affixFits(a, slot) && (id !== 'af_skill_rank' || rarity === 'epic' || rarity === 'legendary'));
  while (out.length < n && pool.length) {
    const i = Math.floor(r() * pool.length); const [id, a] = pool.splice(i, 1)[0];
    const af = { id, tier: t + 1, value: a.tiers[t] };
    if (a.perType) af.type = pick(DAMAGE_TYPES, r); if (a.perHazard) af.type = pick(a.perHazard, r); if (a.perSkill) af.type = 's_dash';
    out.push(af);
  }
  return out;
}
export function rollGear({ slot, il = 1, rarity = 'common', r = Math.random } = {}) {
  slot = slot || pick(GEAR_SLOTS, r); il = Math.max(1, Math.min(30, Math.round(il)));
  const g = { uid: newUid(), kind: slot === 'weapon' ? 'weapon' : 'gear', slot: slot === 'ring2' ? 'ring1' : slot, rarity, il, affixes: rollAffixes(slot, rarity, il, r) };
  if (slot === 'weapon') { const wid = pick(Object.keys(WEAPONS).filter((k) => !WEAPONS[k].legendaryOnly && k !== 'w_thunder_rail' || rarity === 'legendary'), r); g.base = wid; g.name = WEAPONS[wid].name; }
  else g.name = pick(ARMOR_BASES[slotKey(slot)] || ['Снаряжение'], r);
  return g;
}
export function affixText(a) { const v = Math.abs(a.value) < 1 && a.id !== 'af_status_every' ? `+${Math.round(a.value * 100)} %` : `+${a.value}`; return `${v} ${(AFFIX_RU[a.id] || a.id).replace('{t}', TYPE_RU[a.type] || a.type || '')} (T${a.tier})`; }
export const sellPrice = (g) => Math.round((5 + g.il * 2) * (1 + RARITIES.indexOf(g.rarity) * 1.5));

/** Лут с таблицы моба (MOBS[].loot / BOSSES[].loot). Возвращает {gold, items:[[id,n]], gear:[...]}. */
export function rollMobLoot(m, { playerL = 1, lootFind = 0, r = Math.random } = {}) {
  const id = m.id || m.def?.id, boss = BOSSES[id], def = boss || m.def || MOBS[id] || {}; const lvl = boss?.lvl || m.lvl || 1;
  const prof = boss ? 'boss' : m.elite ? 'elite' : def.loot?.rw || 'normal'; const out = { gold: 0, items: [], gear: [] };
  const table = def.loot?.items || (boss ? [['it_gold', 100], ['it_gear_roll', 100], ['it_gear_roll', 100], ['it_core_shard', 100]] : []);
  for (const [item, pct] of table) {
    if (r() * 100 >= pct * (m.elite ? 2 : 1)) continue;
    if (item === 'it_gold') out.gold += Math.round((3 + r() * 6) * (1 + 0.15 * lvl) * (boss ? 20 : m.elite ? 3 : 1));
    else if (item === 'it_gear_roll') { if (playerL - lvl < 5) out.gear.push(rollGear({ il: Math.max(lvl, playerL - 2), rarity: rollRarity(prof, r, lootFind), r })); }
    else if (ITEMS[item]) out.items.push([item, 1]);
  }
  if (boss?.loot?.unique && ITEMS[boss.loot.unique]) out.items.push([boss.loot.unique, 1]);
  for (const [uid, it] of Object.entries(ITEMS)) if (it.cat === 'unique' && it.boss === id && !out.items.some((x) => x[0] === uid)) out.items.push([uid, 1]);
  return out;
}

// ───────── Магазин хаба (npc_mot, poi_hub_dawnford) ─────────
export const SHOP = Object.freeze({ npc: 'npc_mot', poi: 'poi_hub_dawnford', stock: [['it_potion_hp_s', 25], ['it_antidote', 30], ['it_food_meat', 12], ['it_ammo_pistol', 10], ['it_ammo_rifle', 14],
  ['it_wood', 4], ['it_rope', 15], ['it_gunpowder', 8], ['it_warm_tonic', 40], ['it_frost_salve', 40], ['it_mana_crystal', 60]].filter(([id]) => ITEMS[id]),
  gearOffers: 3, gearMarkup: 4 });

export class Inventory {
  constructor(data) {
    this.gold = 0; this.stacks = {}; this.gear = []; this.equipped = Object.fromEntries(GEAR_SLOTS.map((s) => [s, null])); this.artifacts = [null, null, null]; this.unlocked = [];
    if (data) Object.assign(this, structuredClone(data));
  }
  toJSON() { return { gold: this.gold, stacks: this.stacks, gear: this.gear, equipped: this.equipped, artifacts: this.artifacts, unlocked: this.unlocked }; }
  count(id) { return id === 'it_gold' ? this.gold : this.stacks[id] || 0; }
  add(id, n = 1) {
    if (id === 'it_gold') { this.gold += n; return true; }
    const def = ITEMS[id]; if (!def && !WEAPONS[id] && !ARTIFACTS[id]) return false;
    if (WEAPONS[id]) return this.addGear({ uid: newUid(), kind: 'weapon', slot: 'weapon', base: id, name: WEAPONS[id].name, rarity: 'common', il: 1, affixes: [] });
    if (ARTIFACTS[id]) { if (!this.unlocked.includes(id)) this.unlocked.push(id); return true; }
    if (def.cat === 'unique') return this.addGear({ uid: newUid(), kind: 'gear', slot: def.slot === 'ring' ? 'ring1' : def.slot, base: id, name: def.name, rarity: 'legendary', il: 30, affixes: [], effect: def.effect });
    const cap = def.stack ?? 99; this.stacks[id] = Math.min(cap, (this.stacks[id] || 0) + n); return true;
  }
  remove(id, n = 1) { if (id === 'it_gold') { if (this.gold < n) return false; this.gold -= n; return true; } if ((this.stacks[id] || 0) < n) return false; this.stacks[id] -= n; if (!this.stacks[id]) delete this.stacks[id]; return true; }
  addGear(g) { if (this.gear.length >= GEAR_CAP) return false; this.gear.push(g); return true; }
  find(uid) { return this.gear.find((g) => g.uid === uid); }
  equip(uid, level = 30) {
    const g = this.find(uid); if (!g) return { ok: false, reason: 'нет предмета' };
    if (g.il > level + 2) return { ok: false, reason: `нужен уровень ${g.il - 2}` };
    let slot = g.slot; if (slot === 'ring1' && this.equipped.ring1 && !this.equipped.ring2) slot = 'ring2';
    if (g.rarity === 'legendary' && g.kind === 'gear') { /* одна легендарка на слот — естественно */ }
    for (const s of GEAR_SLOTS) if (this.equipped[s] === uid) this.equipped[s] = null;
    this.equipped[slot] = uid; return { ok: true, slot };
  }
  unequip(slot) { this.equipped[slot] = null; }
  equipArtifact(id, idx, level = 1) {
    if (!this.unlocked.includes(id) || idx < 0 || idx > 2) return false; if (level < ARTIFACT_RULES.unlockSlotsAtLevel[idx]) return false;
    const leg = this.artifacts.filter((a, i) => a && i !== idx && ARTIFACTS[a]?.rarity === 'legendary').length;
    if (ARTIFACTS[id]?.rarity === 'legendary' && leg >= ARTIFACT_RULES.maxLegendary) return false;
    this.artifacts = this.artifacts.map((a) => (a === id ? null : a)); this.artifacts[idx] = id; return true;
  }
  salvage(uid) {
    const g = this.find(uid); if (!g || Object.values(this.equipped).includes(uid)) return false;
    this.gear = this.gear.filter((x) => x !== g); const rare = RARITIES.indexOf(g.rarity) >= 2; this.add(rare ? 'it_arcane_dust' : 'it_scrap', 1 + Math.floor(g.il / 6)); return true;
  }
  sell(uid) { const g = this.find(uid); if (!g || Object.values(this.equipped).includes(uid)) return 0; const p = sellPrice(g); this.gear = this.gear.filter((x) => x !== g); this.gold += p; return p; }
  buy(id, price) { if (this.gold < price) return false; this.gold -= price; return this.add(id, 1); }
  /** Сумма аффиксов экипированного (по id и id:type), с потолками раздела 3.3 на уровне потребителя. */
  gearStats() {
    const s = {}; for (const uid of Object.values(this.equipped)) { const g = uid && this.find(uid); if (!g) continue;
      for (const a of g.affixes) { s[a.id] = +((s[a.id] || 0) + a.value).toFixed(4); if (a.type) s[`${a.id}:${a.type}`] = +((s[`${a.id}:${a.type}`] || 0) + a.value).toFixed(4); } }
    return s;
  }
  equippedWeapon() { const uid = this.equipped.weapon; return uid ? this.find(uid) : null; }
  // ───────── крафт ─────────
  canCraft(rid, stations = []) {
    const rc = RECIPES[rid]; if (!rc) return { ok: false, reason: 'нет рецепта' };
    if (!stations.includes(rc.station)) return { ok: false, reason: 'нужна станция ' + rc.station };
    if (rc.unlock && !this.unlocked.includes(rid)) return { ok: false, reason: 'нет чертежа' };
    for (const [id, n] of rc.in) if (this.count(id) < n) return { ok: false, reason: `не хватает ${ITEMS[id]?.name || id}` };
    return { ok: true };
  }
  craft(rid, stations = []) {
    const c = this.canCraft(rid, stations); if (!c.ok) return c; const rc = RECIPES[rid];
    for (const [id, n] of rc.in) this.remove(id, n); const [oid, on] = rc.out; this.add(oid, on); return { ok: true, out: rc.out };
  }
  forgeLevelUp(uid, playerL, stations = []) {
    const g = this.find(uid); if (!g || !stations.includes('stn_forge') || g.il >= playerL) return false;
    const cost = FORGE.itemLevelUp.cost(g.il); for (const [id, n] of cost) if (this.count(id) < n) return false;
    for (const [id, n] of cost) this.remove(id, n); g.il++; return true;
  }
}
