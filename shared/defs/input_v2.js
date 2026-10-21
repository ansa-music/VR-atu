// shared/defs/input_v2.js — упрощённое управление v2 (часть H). Не ломает старое: INPUT_MAP (input-map.js) остаётся,
// здесь все старые ключи действий + новые (dash, radial, slot1..4, quick1..4). Чистые данные + маленькие хелперы, без Three/DOM.
const F = Object.freeze;
export const PLATFORMS = F(['pc', 'phone', 'vr', 'arduino']);

// 6 базовых действий — всё, что нужно выучить. Остальное — подсказки по контексту и радиальное меню.
export const CORE_ACTIONS = F(['move', 'fire', 'dash', 'slot1', 'slot2', 'interact']);

// Слоты одинаковы на всех платформах: 1 = навык A, 2 = навык B, 3 = быстрое заклинание/навык C, 4 = ульта.
export const SKILL_SLOTS = F({
  slot1: F({ role: 'active', legacy: 'active1', color: '#3ec5ff' }),
  slot2: F({ role: 'active', legacy: 'active2', color: '#34e89e' }),
  slot3: F({ role: 'spell_or_active', legacy: 'active3', color: '#c78bff' }),
  slot4: F({ role: 'ultimate', legacy: 'ultimate', color: '#ffd23f' }),
});

const A = (pc, phone, vr, arduino, extra = {}) => F({ pc, phone, vr, arduino, ...extra });
// pcKeys — машиночитаемые бинды (для конфликтов и rebind), pc — подпись для UI.
export const INPUT_MAP_V2 = F({
  // ── базовые ──
  move:      A('WASD', 'левый виртуальный стик', 'левый стик (плавно / телепорт)', 'стик', { pcKeys: F(['W', 'A', 'S', 'D']), core: true }),
  turn:      A('мышь', 'перетаскивание правой половины', 'правый стик (снап 30° / плавно)', '—', { pcKeys: F([]) }),
  fire:      A('ЛКМ', 'большая кнопка «Огонь» (авто-огонь при наведении — опция)', 'указать рукой + курок', 'кнопка b', { pcKeys: F(['Mouse1']), core: true }),
  aim:       A('ПКМ (удерж.; опция — переключение)', 'двойной тап по «Огню» = прицел', 'вторая рука на оружие / поднести к глазу', 'авто', { pcKeys: F(['Mouse2']) }),
  weaponAlt: A('СКМ', 'долгое нажатие «Огня» на оружии с альт. режимом', 'кнопка на оружии (B/Y)', '—', { pcKeys: F(['Mouse3']) }),
  charge:    A('удерж. ЛКМ', 'удерж. «Огонь»', 'удерж. курок', 'удерж. b'),
  dash:      A('Shift (тап); удерж. — бег', 'кнопка «Рывок» (свайп по ней вверх — прыжок)', 'резкий мах ладонью в сторону рывка', 'резкий рывок стика', { pcKeys: F(['Shift']), core: true, skillSource: 'movement' }),
  jump:      A('Пробел', 'свайп вверх по «Рывку»', 'кнопка A', '—', { pcKeys: F(['Space']) }),
  glide:     A('удерж. Пробел в воздухе', 'удерж. «Рывок» в воздухе', 'раскинуть руки в воздухе', 'стик вверх в воздухе'),
  sprint:    A('удерж. Shift', 'стик до края', 'стик до края', 'стик до края 1 с'),
  crouch:    A('C (опция — переключение)', 'авто у укрытия', 'физически присесть', '—', { pcKeys: F(['C']) }),
  interact:  A('F', '«Огонь» превращается в «Взять/Говорить» рядом с объектом без врагов', 'grip у объекта', 'авто: стоять рядом 1 с', { pcKeys: F(['F']), core: true }),
  reload:    A('R', 'авто', 'авто (или ткнуть оружием в пояс)', 'авто', { pcKeys: F(['R']) }),
  // ── навыки (слоты 1-4 одинаковы везде) ──
  slot1:     A('Q', 'кнопка навыка 1', 'кнопка B (правый)', 'двойное b', { pcKeys: F(['Q']), core: true, holdOpensRadial: true }),
  slot2:     A('E', 'кнопка навыка 2', 'кнопка Y (левый)', 'тройное b', { pcKeys: F(['E']), core: true, holdOpensRadial: true }),
  slot3:     A('X', 'малая кнопка над навыками (✦ заклинание)', 'кнопка X (левый)', 'круг стиком', { pcKeys: F(['X']), holdOpensRadial: true }),
  slot4:     A('Z (или Q+E вместе)', 'кнопка ульты — появляется, когда заряжена', 'обе руки вверх 0,4 с или оба курка+grip', 'b + стик вниз 1 с', { pcKeys: F(['Z']), chord: F(['Q', 'E']) }),
  radial:    A('удерж. V (или удерж. Q/E/X 0,3 с)', 'удерж. любую кнопку навыка / кнопка ✦', 'посмотреть на левое запястье + курок правой', 'круг стиком при удерж. b', { pcKeys: F(['V']) }),
  quick1:    A('1', 'тап по иконке оружия (слева)', 'кобура правое бедро', '—', { pcKeys: F(['1']) }),
  quick2:    A('2', 'свайп по иконке оружия', 'кобура левое бедро', '—', { pcKeys: F(['2']) }),
  quick3:    A('3', 'свайп по иконке оружия', 'за спину (правое плечо)', '—', { pcKeys: F(['3']) }),
  quick4:    A('4', 'свайп по иконке оружия', 'за спину (левое плечо)', '—', { pcKeys: F(['4']) }),
  grenade:   A('G', 'через радиальное меню', 'взять с пояса и бросить', '—', { pcKeys: F(['G']) }),
  scan:      A('T', 'кнопка «глаз» у миникарты', 'коснуться виска', 'стик назад 1 с', { pcKeys: F(['T']) }),
  map:       A('Tab', 'тап по миникарте', 'посмотреть на левое запястье (вкладка «карта»)', '—', { pcKeys: F(['Tab']) }),
  inventory: A('I', 'кнопка сумки', 'сумка за плечом', '—', { pcKeys: F(['I']) }),
  skillTree: A('K', 'значок наруча', 'скрижаль на наруче', '—', { pcKeys: F(['K']) }),
  grimoire:  A('L', 'книга в меню', 'левое бедро (grip)', '—', { pcKeys: F(['L']) }),
  spellStance: A('удерж. U — продвинутые глифы (опция)', 'удерж. ✦ 1 с — рисовать глиф', 'удерж. grip левой — рисовать руну (допуск ×1,5, автодорисовка)', 'b + стик вправо 1 с', { pcKeys: F(['U']), advanced: true }),
  menu:      A('Esc', 'пауза', 'Menu', '—', { pcKeys: F(['Esc']) }),
  // ── совместимость со старыми ключами (раздел 7): те же действия, новые бинды ──
  active1:   A('Q', 'кнопка навыка 1', 'кнопка B', 'двойное b', { alias: 'slot1' }),
  active2:   A('E', 'кнопка навыка 2', 'кнопка Y', 'тройное b', { alias: 'slot2' }),
  active3:   A('X', 'кнопка ✦', 'кнопка X', 'круг стиком', { alias: 'slot3' }),
  ultimate:  A('Z / Q+E', 'кнопка ульты', 'обе руки вверх', 'b + стик вниз 1 с', { alias: 'slot4' }),
  belt1:     A('Shift', 'кнопка «Рывок»', 'мах ладонью', 'рывок стика', { alias: 'dash' }),
  belt2:     A('радиал (V)', 'радиал', 'радиал на запястье', 'радиал', { alias: 'radial' }),
  fireMode:  A('колесо мыши', 'через радиал', 'через радиал', 'авто', { alias: 'radial' }),
  weaponSlots: A('1–4 (колесо — 5-е оружие)', 'иконка оружия', 'кобуры', '—', { alias: 'quick1' }),
});
export const LEGACY_ALIASES = F(Object.fromEntries(Object.entries(INPUT_MAP_V2).filter(([, v]) => v.alias).map(([k, v]) => [k, v.alias])));
export const resolveAction = (id) => LEGACY_ALIASES[id] ?? id;
// Клавиши, занятые v2 (для rebind и проверки конфликтов; модификаторы U-стойки 1–7 действуют только в стойке).
export const RESERVED_PC_KEYS_V2 = F([...new Set(Object.values(INPUT_MAP_V2).filter((v) => !v.alias).flatMap((v) => v.pcKeys ?? []))]);

// Что изменилось против раздела 7 (для основной сессии).
export const CHANGES_FROM_V1 = F([
  'Shift: тап = рывок (навык передвижения архетипа), удерж. = бег. Пояс 2 (Alt) убран — второй навык передвижения в радиале.',
  'Ульта: Z (без удержания) или Q+E вместе. X = слот 3 (быстрое заклинание по умолчанию).',
  'Tab = карта (было M, M оставлен как запасной бинд), I = инвентарь (было Tab).',
  '1–4 = быстрые слоты оружия ИЛИ заклинания; 5-е оружие — колесо мыши. Смена стихии (B) — через радиал.',
  'Глифы (U) — опция «продвинутый каст»; по умолчанию заклинания выбираются в радиале или стоят в слоте 3.',
  'Телефон: 4 большие кнопки (Огонь/Взять, Рывок/Прыжок, Навык 1, Навык 2) + появляющаяся Ульта + ✦.',
]);
export const PC_FALLBACK_BINDS = F({ map: 'M' });

// Каст: smart (мгновенно в цель под прицелом / авто-цель) или aim (показать зону, отпуск = каст).
export const CAST_MODES = F({ smart: F({ name: 'Быстрый каст', desc: 'нажал — сработало в цель под прицелом' }), aim: F({ name: 'Каст с прицелом', desc: 'держи — видна зона, отпусти — каст' }) });
export const DEFAULT_CAST_MODE = F({ pc: 'smart', phone: 'smart', vr: 'aim', arduino: 'smart' });

// Помощь в прицеливании: угол конуса притяжения, сила доводки, авто-выбор цели для навыков.
export const ASSIST_LEVELS = F({
  off:    F({ coneDeg: 0,  pull: 0,    autoTargetSkills: false, autoFire: false }),
  low:    F({ coneDeg: 3,  pull: 0.15, autoTargetSkills: true,  autoFire: false }),
  medium: F({ coneDeg: 6,  pull: 0.3,  autoTargetSkills: true,  autoFire: false }),
  high:   F({ coneDeg: 10, pull: 0.5,  autoTargetSkills: true,  autoFire: true }),
  full:   F({ coneDeg: 25, pull: 1.0,  autoTargetSkills: true,  autoFire: true, note: 'Arduino / одна рука: цель выбирается сама' }),
});
export const DEFAULT_ASSIST = F({ pc: 'low', phone: 'high', vr: 'medium', arduino: 'full' });

export const ACCESSIBILITY = F({
  holdVsToggle: F({ aim: 'hold', sprint: 'hold', crouch: 'toggle', radial: 'hold', spellStance: 'hold' }), // каждое переключается в настройках
  oneHand: F({
    pc: F({ desc: 'всё на мыши: ЛКМ огонь, ПКМ навык 1, СКМ навык 2, Mouse4 рывок, Mouse5 радиал; движение — авто-бег к курсору при удерж. ЛКМ+ПКМ', binds: F({ fire: 'Mouse1', slot1: 'Mouse2', slot2: 'Mouse3', dash: 'Mouse4', radial: 'Mouse5' }) }),
    phone: F({ desc: 'все 4 кнопки в правом нижнем углу, движение — авто-путь по тапу на карте/земле, assist = full' }),
    vr: F({ desc: 'всё на доминантной руке: курок огонь, A/B навыки 1/2, stick-click радиал, рывок — стик вбок' }),
  }),
  radialSlowMo: 0.3,        // замедление мира при открытом радиале (только одиночная игра)
  holdThresholdS: 0.3,      // тап < 0,3 с, удерж. ≥ 0,3 с
  bigText: true, colorblindIcons: 'форма иконки + цвет', subtitles: true,
  glyphTolerance: F({ normal: 0.78, assisted: 0.65, autoCompleteAt: 0.6 }), // автодорисовка после 60 % пути
});

// Навыки: одна строка, иконка (эмодзи-заглушка + форма для дальтоников), читаемый откат.
export const SKILL_UI = F({
  s_grapple:         F({ line: 'Цепляешься и подтягиваешься к точке или тянешь врага к себе', icon: '🪝', shape: 'triangle' }),
  s_barrier:         F({ line: 'Щит перед тобой, отражает снаряды', icon: '🛡️', shape: 'square' }),
  s_gravity_well:    F({ line: 'Стягивает врагов в точку и бьёт в конце', icon: '🌀', shape: 'circle' }),
  s_bulwark:         F({ line: 'Пассив: меньше урона, когда HP низкое', icon: '🧱', shape: 'square', passive: true }),
  s_territory:       F({ line: 'Ульта: зона, где ты и союзники крепче', icon: '🏰', shape: 'star' }),
  s_dash:            F({ line: 'Быстрый рывок в сторону движения', icon: '💨', shape: 'triangle' }),
  s_venom_blades:    F({ line: 'Клинки с ядом: удары отравляют', icon: '🗡️', shape: 'diamond' }),
  s_toxic_smoke:     F({ line: 'Облако яда, в нём тебя не видно', icon: '☁️', shape: 'circle' }),
  s_second_wind:     F({ line: 'Пассив: раз в бою спасает от смерти', icon: '❤️‍🩹', shape: 'square', passive: true }),
  s_blade_dance:     F({ line: 'Ульта: серия ударов по всем рядом', icon: '⚔️', shape: 'star' }),
  s_teleport:        F({ line: 'Мгновенный шаг вперёд сквозь опасность', icon: '✨', shape: 'triangle' }),
  s_fireball:        F({ line: 'Огненный шар, взрывается и поджигает', icon: '🔥', shape: 'circle' }),
  s_chain_lightning: F({ line: 'Молния прыгает по нескольким врагам', icon: '⚡', shape: 'diamond' }),
  s_resonance:       F({ line: 'Пассив: чередуй стихии — растёт урон', icon: '🎶', shape: 'square', passive: true }),
  s_ki_wave:         F({ line: 'Ульта: мощный луч энергии вперёд', icon: '🌊', shape: 'star' }),
  s_glide:           F({ line: 'Паришь в воздухе после прыжка', icon: '🪂', shape: 'triangle' }),
  s_scan:            F({ line: 'Подсвечивает врагов и слабые места', icon: '👁️', shape: 'circle' }),
  s_frost_shot:      F({ line: 'Ледяной выстрел замедляет цель', icon: '❄️', shape: 'diamond' }),
  s_steady_hand:     F({ line: 'Пассив: точнее и сильнее в прицеле', icon: '🎯', shape: 'square', passive: true }),
  s_bullet_time:     F({ line: 'Ульта: время замедляется для всех, кроме тебя', icon: '⏳', shape: 'star' }),
});
export const ELEMENT_UI = F({ fire: F({ icon: '🔥', color: '#ff7a3c' }), frost: F({ icon: '❄️', color: '#8fd3ff' }), lightning: F({ icon: '⚡', color: '#ffe14d' }), arcane: F({ icon: '✴️', color: '#b48cff' }), poison: F({ icon: '☠️', color: '#7be04a' }), earth: F({ icon: '🪨', color: '#c9a36b' }), wind: F({ icon: '🌪️', color: '#c8f4ff' }), fusion: F({ icon: '☯️', color: '#ffd23f' }) });
export const FORM_UI = F({ bolt: '➶ снаряд', nova: '◎ вокруг себя', beam: '━ луч', ward: '⛨ оберег', storm: '☄ в точку' });

// Откат: кольцо вокруг иконки + целые секунды крупно (дробь только < 3 с), вспышка и звук при готовности, серый = нет энергии.
export const COOLDOWN_UI = F({ ring: true, showSecondsAbove: 0, decimalsBelowS: 3, readyFlashMs: 250, readySfx: 'ui_skill_ready', noEnergyTint: '#5a6275', lockedTint: '#2a2f3d' });
export function cooldownLabel(remainingS) {
  if (!(remainingS > 0)) return '';
  return remainingS < COOLDOWN_UI.decimalsBelowS ? remainingS.toFixed(1) : String(Math.ceil(remainingS));
}

// Стартовые наборы (автоэкипировка при выборе архетипа).
export const STARTER_LOADOUTS = F({
  guardian:   F({ dash: 's_grapple',  slot1: 's_barrier',      slot2: 's_gravity_well',    slot3: 'sp_earth_bolt',     slot4: 's_territory',    passive: 's_bulwark',      tip: 'Щит (Q) — когда в тебя стреляют, Колодец (E) — когда врагов много' }),
  rogue:      F({ dash: 's_dash',     slot1: 's_venom_blades', slot2: 's_toxic_smoke',     slot3: 'sp_poison_bolt',    slot4: 's_blade_dance',  passive: 's_second_wind',  tip: 'Яд на клинки (Q) перед боем, туман (E) — чтобы уйти' }),
  mystic:     F({ dash: 's_teleport', slot1: 's_fireball',     slot2: 's_chain_lightning', slot3: 'sp_frost_bolt',     slot4: 's_ki_wave',      passive: 's_resonance',    tip: 'Чередуй огонь (Q), молнию (E) и лёд (X) — растёт Резонанс' }),
  gunslinger: F({ dash: 's_glide',    slot1: 's_frost_shot',   slot2: 's_scan',            slot3: 'sp_lightning_bolt', slot4: 's_bullet_time',  passive: 's_steady_hand',  tip: 'Скан (E) показывает слабые места, Ледяной выстрел (Q) их держит' }),
});

// Автоэкипировка: новый навык/заклинание само встаёт в пустой подходящий слот; иначе — в радиал с меткой «новое».
export function autoEquip(loadout, item, skills = {}) {
  const out = { ...loadout };
  const s = skills[item];
  const kind = item.startsWith('sp_') || item.startsWith('fu_') ? 'spell' : s?.type;
  const order = kind === 'ultimate' ? ['slot4'] : kind === 'movement' ? ['dash'] : kind === 'passive' ? ['passive'] : kind === 'spell' ? ['slot3'] : ['slot1', 'slot2', 'slot3'];
  if (Object.values(out).includes(item)) return { loadout: out, slot: null, toRadial: false };
  for (const k of order) if (!out[k]) { out[k] = item; return { loadout: out, slot: k, toRadial: false }; }
  return { loadout: out, slot: null, toRadial: true };
}

// Контекстные подсказки: показываются 1–3 раза, потом прячутся (кроме interact).
export const CONTEXT_PROMPTS = F({
  near_npc:      F({ action: 'interact', text: 'Говорить' }),
  near_loot:     F({ action: 'interact', text: 'Взять' }),
  near_anchor:   F({ action: 'dash', text: 'Зацепиться', when: 's_grapple' }),
  skill_ready:   F({ action: 'slot1', text: 'Навык готов', maxShows: 3 }),
  ult_ready:     F({ action: 'slot4', text: 'УЛЬТА ГОТОВА', maxShows: 5 }),
  low_hp:        F({ action: 'dash', text: 'Уйди рывком', maxShows: 3 }),
  ledge:         F({ action: 'glide', text: 'Держи прыжок — парить', maxShows: 3 }),
  new_spell:     F({ action: 'radial', text: 'Новое заклинание в меню', maxShows: 2 }),
  weak_point:    F({ action: 'aim', text: 'Целься в слабое место', maxShows: 2 }),
});
export function promptLabel(promptId, platform, bindings = INPUT_MAP_V2) {
  const p = CONTEXT_PROMPTS[promptId]; if (!p) return null;
  return { text: p.text, key: bindings[p.action]?.[platform] ?? '?' };
}

// Rebind: проверка конфликта и применение (результат хранить в localStorage 'atu.binds.v2').
export function rebind(current, action, key) {
  if (!INPUT_MAP_V2[action] || INPUT_MAP_V2[action].alias) return { ok: false, reason: 'unknown_action' };
  if (['Esc'].includes(key) && action !== 'menu') return { ok: false, reason: 'reserved' };
  const owner = Object.entries(current).find(([a, keys]) => a !== action && keys.includes(key));
  if (owner) return { ok: false, reason: 'conflict', with: owner[0], swap: true };
  return { ok: true, binds: { ...current, [action]: [key] } };
}
export function defaultPcBinds() {
  return Object.fromEntries(Object.entries(INPUT_MAP_V2).filter(([, v]) => !v.alias && v.pcKeys?.length).map(([k, v]) => [k, [...v.pcKeys]]));
}
export function swapBind(current, a, b) { return { ...current, [a]: current[b], [b]: current[a] }; }
