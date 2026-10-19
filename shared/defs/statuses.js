// shared/defs/statuses.js — ЕДИНЫЙ канон статусов (решение конфликта №6). Все разделы ссылаются только сюда.
// Числа DoT — на L1 и ранге 1; итог = dps × levelMul(уровень источника) × ранг навыка-источника (у оружия ранг = 1).
// DoT проходит только шаги attacker → vuln → mitigation (без falloff, зон и заряда).
// Накопление у оружия детерминированное («каждый N-й удар»), случайных шансов у игрока нет.
export const STATUSES = Object.freeze({
  st_burn: Object.freeze({ name: 'Горение', type: 'fire', dps: 5, durS: 3, maxStacks: 3, refresh: true,
    removedBy: ['frost'], note: 'frost-урон гасит горение (комбо c_steam)' }),
  st_chill: Object.freeze({ name: 'Озноб', type: 'frost', slowPerStack: 0.15, durS: 3, maxStacks: 3, refresh: true,
    freezeAt: 3, freezeS: 1.0, immunityS: 3, removedBy: ['fire'], note: '3 стака → st_freeze; fire снимает все стаки (комбо c_steam)' }),
  st_freeze: Object.freeze({ name: 'Заморозка', type: 'frost', control: true, durS: 1.0, immunityS: 3,
    physicalVuln: 0.2, note: 'наступает от 3 стаков st_chill; physical по замороженной цели +20 % (группа vuln)' }),
  st_shock: Object.freeze({ name: 'Шок', type: 'lightning', vuln: 0.10, durS: 4, maxStacks: 1, refresh: true,
    chainBonusJumps: 1, note: 'следующий lightning-удар по цели получает +1 прыжок цепи (в потолке 4)' }),
  st_poison: Object.freeze({ name: 'Яд', type: 'poison', dpsPerStack: 3, durS: 6, maxStacks: 5, refresh: true,
    healingCutPerStack: 0.10, healingCutMax: 0.5 }),
  st_stagger: Object.freeze({ name: 'Оглушение', control: true, interruptS: 0.4, minS: 0.3, maxS: 0.5, immunityS: 2,
    note: 'источник задаёт 0,3–0,5 с; в VR — раскачка оружия и замедление, камера не двигается' }),
});
// Элиты и боссы: длительность контроля (st_freeze, st_stagger, притяжение) ×0,5; любой контроль ≤ 1 с (CAPS.controlS).
export const CONTROL_IMMUNITY_S = Object.freeze({ st_freeze: 3, st_stagger: 2, pull: 3 });
// Скан-«Метка» — НЕ статус, а дебафф группы vuln: +15 % на 6 с, сам с собой не стакается.
export const MARK = Object.freeze({ id: 'mark_scan', vuln: 0.15, durS: 6 });
