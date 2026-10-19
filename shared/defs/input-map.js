// shared/defs/input-map.js — ЕДИНАЯ раскладка (раздел 7). Источник правды для js/main.js, js/touch.js, vr-handling.js, arduino-парсера.
// Arduino-протокол не меняется: J,x,y,b (кнопка = огонь). Все жесты распознаются по осям стика и таймингу кнопки.
export const INPUT_MAP = Object.freeze({
  move:        { pc: 'WASD', phone: 'левый джойстик', vr: 'левый стик (плавно/телепорт по комфорту)', arduino: 'стик' },
  turn:        { pc: 'мышь / ← →', phone: 'свайп правой половины', vr: 'правый стик (снап 30°/плавно)', arduino: '—' },
  jump:        { pc: 'Пробел', phone: 'кнопка прыжка', vr: 'A', arduino: '—' },
  sprint:      { pc: 'Shift', phone: 'джойстик до края', vr: 'нажатие левого стика', arduino: 'стик до края 1 с' },
  crouch:      { pc: 'C', phone: 'кнопка присед', vr: 'физически присесть / B (удерж.)', arduino: '—' },
  fire:        { pc: 'ЛКМ', phone: 'кнопка огня', vr: 'курок', arduino: 'кнопка b' },
  aim:         { pc: 'ПКМ', phone: 'кнопка прицела', vr: 'поднести к глазу / второй хват', arduino: '—' },
  weaponAlt:   { pc: 'СКМ (колесо-клик)', phone: 'кнопка «альт.»', vr: 'жест оружия (карточка)', arduino: '—', note: 'было V в разделе оружия — V отдан поясу' },
  charge:      { pc: 'удерж. ЛКМ', phone: 'удерж. огня', vr: 'удерж. курка', arduino: 'удерж. b (заряд оружия)' },
  reload:      { pc: 'R', phone: 'авто', vr: 'B/Y сброс + магазин с пояса', arduino: 'авто' },
  fireMode:    { pc: 'B / колесо', phone: 'кнопка стихии', vr: 'B / поворот кристалла', arduino: 'авто (после перегрева)' },
  weaponSlots: { pc: '1–5', phone: 'свайп по иконке оружия', vr: 'кобуры/спина/пояс', arduino: '—' },
  grenade:     { pc: 'G (удерж. — дуга)', phone: 'кнопка + дуга', vr: 'взять с пояса, бросок', arduino: '—' },
  belt1:       { pc: 'V', phone: 'свайп вверх по джойстику / кнопка пояса 1', vr: 'жест навыка', arduino: 'рывок стика <150 мс (направление — по навыку)' },
  belt2:       { pc: 'Alt (запасной — Mouse4)', phone: 'кнопка пояса 2', vr: 'жест навыка', arduino: 'рывок стика <150 мс (направление — по навыку)' },
  glide:       { pc: 'удерж. Пробел в воздухе', phone: 'удерж. прыжок в воздухе', vr: 'раскинуть руки', arduino: 'удерж. стик вверх в воздухе' },
  active1:     { pc: 'Q', phone: 'кнопка актива 1', vr: 'руна/жест свободной рукой', arduino: 'двойное нажатие b' },
  active2:     { pc: 'E', phone: 'кнопка актива 2', vr: 'руна/жест', arduino: 'тройное нажатие b' },
  active3:     { pc: 'X', phone: 'кнопка актива 3', vr: 'руна/жест; дубль — круговое меню (нажатие левого стика)', arduino: 'круг стиком 360° < 0,6 с' },
  ultimate:    { pc: 'Z (удерж. 0,4 с) или Q+E', phone: 'кнопка ульты', vr: 'жест обеими руками', arduino: 'b + стик вниз 1 с (Волна ки — 1,5 с)' },
  scan:        { pc: 'T', phone: 'кнопка «глаз»', vr: 'коснуться виска', arduino: 'стик назад 1 с' },
  interact:    { pc: 'F', phone: 'контекстная кнопка', vr: 'grip у объекта', arduino: 'авто при остановке рядом 1 с' },
  skillTree:   { pc: 'K', phone: 'значок наруча', vr: 'скрижаль на наруче', arduino: '—' },
  inventory:   { pc: 'Tab', phone: 'кнопка сумки', vr: 'сумка за плечом', arduino: '—' },
  map:         { pc: 'M', phone: 'миникарта (тап)', vr: 'карта на левом запястье', arduino: '—' },
  menu:        { pc: 'Esc', phone: 'пауза', vr: 'Menu', arduino: '—' },
});
// Удалено старое правило Arduino «удерж. ≥1,5 с = ульта, двойное = рывок»: удержание = заряд, двойное = актив 1.
export const ARDUINO_GESTURES = Object.freeze({ flickMaxMs: 150, multiPressWindowMs: 350, circleMaxMs: 600, holdStickMs: 1000, assistAutoCastEnergy: 60 });
export const RESERVED_PC_KEYS = Object.freeze(['W', 'A', 'S', 'D', 'Space', 'Shift', 'C', 'R', 'B', 'G', 'V', 'Alt', 'Q', 'E', 'X', 'Z', 'T', 'F', 'K', 'M', 'Tab', 'Esc', '1', '2', '3', '4', '5']);
