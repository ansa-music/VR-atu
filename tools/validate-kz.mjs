// tools/validate-kz.mjs — проверка казахской темы: все ID существуют, полнота покрытия, казахские глифы, шрифты, локаль.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
export async function validateKz() {
  const errors = [], warn = [];
  const T = await imp('shared/defs/theme_kz.js'), W = await imp('shared/defs/world.js'), PO = await imp('shared/defs/pois.js'), E = await imp('shared/defs/enemies.js');
  const WP = await imp('shared/defs/weapons.js'), SK = await imp('shared/defs/skills.js'), FX = await imp('shared/defs/fantasy_extras.js'), Q = await imp('shared/defs/quests.js'), C = await imp('shared/defs/core.js');
  const reg = {
    KZ_BIOMES: [T.KZ_BIOMES, Object.keys(W.BIOMES), true], KZ_POIS: [T.KZ_POIS, PO.POIS.map((p) => p.id), true], KZ_NPCS: [T.KZ_NPCS, Object.keys(PO.NPCS), true],
    KZ_MOBS: [T.KZ_MOBS, Object.keys(E.MOBS), true], KZ_BOSSES: [T.KZ_BOSSES, [...Object.keys(E.BOSSES), ...Object.keys(E.WORLD_EVENTS).filter((k) => k.startsWith("boss_"))], false],
    KZ_WEAPONS: [T.KZ_WEAPONS, Object.keys(WP.WEAPONS), true], KZ_SKILLS: [T.KZ_SKILLS, Object.keys(SK.SKILLS), true],
    KZ_COMPANIONS: [T.KZ_COMPANIONS, [...Object.keys(FX.MOUNTS), ...Object.keys(FX.PETS)], false],
  };
  const KK = /[ӘәҒғҚқҢңӨөҰұҮүҺһІі]/; let n = 0;
  for (const [name, [map, ids, full]] of Object.entries(reg)) {
    const set = new Set(ids);
    for (const id of Object.keys(map)) { n++; if (!set.has(id)) errors.push(`${name}: неизвестный ID ${id}`); const e = map[id]; if (!e.nameKk || !e.nameLat || !e.nameRu) errors.push(`${name}.${id}: нет nameKk/nameLat/nameRu`); if (/[a-z]/i.test(e.nameKk) && !/[А-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі]/.test(e.nameKk)) errors.push(`${name}.${id}: nameKk не кириллица`); }
    if (full) for (const id of set) if (!map[id]) errors.push(`${name}: нет имени для ${id}`);
  }
  for (const b of Object.keys(W.BIOMES)) if (!b.startsWith('b_')) errors.push('biome prefix ' + b);
  // квесты в лоре, стили POI, мотивы
  for (const q of Object.keys(T.KZ_LORE.questFlavor)) if (!Q.QUESTS[q]) errors.push('KZ_LORE.questFlavor: нет квеста ' + q);
  const OR = await imp('js/world/kz-ornaments.js'), MD = await imp('js/world/kz-models.js'), MU = await imp('js/world/kz-music.js');
  for (const [id, p] of Object.entries(T.KZ_POIS)) if (p.style && !T.KZ_STYLES[p.style]) errors.push(`KZ_POIS.${id}: неизвестный style ${p.style}`);
  for (const [s, v] of Object.entries(T.KZ_STYLES)) { for (const m of v.models || []) if (!MD.KZ_MODEL_IDS.includes(m)) errors.push(`KZ_STYLES.${s}: нет модели ${m}`); for (const o of v.ornaments || []) if (!OR.MOTIF_IDS.includes(o)) errors.push(`KZ_STYLES.${s}: нет мотива ${o}`); }
  for (const [el, v] of Object.entries(T.KZ_THEME.elements)) { if (!OR.MOTIF_IDS.includes(v.motif)) errors.push(`element ${el}: нет мотива ${v.motif}`); if (!C.DAMAGE_TYPES.includes(el) && !C.DAMAGE_TYPES.includes(v.damageType)) errors.push(`element ${el}: нет damageType`); if (!T.KZ_SPELL_NAMES[el]) errors.push(`KZ_SPELL_NAMES: нет стихии ${el}`); if (!MU.KZ_CAST_SFX[el]) errors.push(`KZ_CAST_SFX: нет ${el}`); }
  for (const dt of C.DAMAGE_TYPES) if (!T.KZ_THEME.elements[dt]) errors.push('нет стихии для DAMAGE_TYPE ' + dt);
  for (const r of C.RARITIES) if (!T.KZ_THEME.rarityColors[r]) errors.push('нет цвета редкости ' + r);
  for (const b of Object.keys(W.BIOMES)) if (!MU.KZ_KUIS[b]) errors.push('нет кюя для ' + b); else for (const ins of [MU.KZ_KUIS[b].lead]) if (!MU.KZ_INSTRUMENTS[ins]) errors.push('кюй ' + b + ': нет инструмента ' + ins);
  for (const c of Object.values(T.KZ_COMPANIONS)) void c;
  const mnt = MD.KZ_MODEL_IDS.map((id) => MD.buildKzModelData(id));
  for (const d of mnt) { if (d.triCount > d.budget) errors.push(`модель ${d.id}: ${d.triCount} > бюджет ${d.budget}`); if (d.mount && !FX.MOUNTS[d.mount]) errors.push(`модель ${d.id}: нет маунта ${d.mount}`); }
  // локаль
  const kk = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales/kk.json'), 'utf8'));
  for (const [k, v] of Object.entries(kk)) if (k !== '_meta' && (typeof v !== 'string' || !v.trim())) errors.push('kk.json: пустой ключ ' + k);
  for (const dt of [...C.DAMAGE_TYPES, 'wind', 'water']) if (!kk['element.' + dt]) errors.push('kk.json: нет element.' + dt);
  for (const r of C.RARITIES) if (!kk['rarity.' + r]) errors.push('kk.json: нет rarity.' + r);
  const kkCount = Object.values(kk).filter((v) => typeof v === 'string' && KK.test(v)).length; if (kkCount < 30) warn.push('мало строк с казахскими буквами: ' + kkCount);
  // шрифты: все требуемые глифы указаны
  for (const ch of 'ӘәҒғҚқҢңӨөҰұҮүҺһІі') if (!T.KZ_THEME.fonts.requiredGlyphs.includes(ch)) errors.push('fonts.requiredGlyphs: нет ' + ch);
  // заклинания / слияния / руны (часть F)
  try {
    const SP = await imp('shared/defs/spells.js');
    const named = typeof SP.fillSpellNamesKk === 'function' ? SP.fillSpellNamesKk(T.applyKzSpellNames) : { ...(SP.SPELLS_NAMED || {}) };
    for (const id of Object.keys({ ...SP.SPELLS, ...SP.FUSIONS })) {
      const n = named[id] || {};
      if (!n.nameKk) errors.push(`spell ${id}: нет nameKk`);
      else if (/[a-z]/i.test(n.nameKk) && !/[А-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі]/.test(n.nameKk)) errors.push(`spell ${id}: nameKk не кириллица`);
    }
    for (const [id, r] of Object.entries(SP.RUNES_NAMED || {})) {
      if (!r.nameKk) errors.push(`rune ${id}: нет nameKk`);
    }
  } catch (e) { warn.push('spells not loaded: ' + e.message); }

  const allKk = Object.values(T).filter((v) => v && typeof v === 'object').flatMap((m) => Object.values(m)).map((e) => e && e.nameKk).filter(Boolean).join('');
  for (const ch of new Set(allKk)) if (/[\u0400-\u04FF]/.test(ch) && !/[А-Яа-яЁё]/.test(ch) && !T.KZ_THEME.fonts.requiredGlyphs.includes(ch)) errors.push('глиф вне requiredGlyphs: ' + ch);
  return { errors, warn, checked: n, kkStrings: kkCount };
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await validateKz();
  for (const w of r.warn) console.warn('[validate-kz] warn:', w);
  for (const e of r.errors) console.error('[validate-kz] ERROR:', e);
  console.log(`[validate-kz] проверено имён: ${r.checked}, строк kk: ${r.kkStrings}, ошибок: ${r.errors.length}`);
  process.exit(r.errors.length ? 1 : 0);
}
