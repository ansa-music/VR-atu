// js/world/onboarding.js — обучение в хабе (Сарыарқа, стартовый аул). Шаги по событиям игры; подсказки под платформу.
import { INPUT_MAP_V2, STARTER_LOADOUTS } from '../../shared/defs/input_v2.js';

// Каждый шаг: действие (для подписи кнопки), событие завершения, сколько раз, текст. Можно пропустить (Esc / «Пропустить»).
export const ONBOARDING_STEPS = Object.freeze([
  { id: 'ob_move',     action: 'move',     done: 'moved_m',      count: 5,  text: 'Иди к костру',                         where: 'старт у юрты' },
  { id: 'ob_look',     action: 'turn',     done: 'looked_deg',   count: 90, text: 'Оглядись',                              where: 'костёр' },
  { id: 'ob_interact', action: 'interact', done: 'interact',     count: 1,  text: 'Поговори со старейшиной',               where: 'старейшина у юрты' },
  { id: 'ob_archetype',action: null,       done: 'archetype',    count: 1,  text: 'Выбери путь — набор навыков встанет сам', where: 'старейшина' },
  { id: 'ob_fire',     action: 'fire',     done: 'target_hit',   count: 3,  text: 'Попади в 3 мишени',                     where: 'стрельбище' },
  { id: 'ob_dash',     action: 'dash',     done: 'dash',         count: 2,  text: 'Сделай рывок через ручей',              where: 'ручей' },
  { id: 'ob_slot1',    action: 'slot1',    done: 'cast_slot1',   count: 1,  text: 'Используй навык 1',                     where: 'чучело' },
  { id: 'ob_slot2',    action: 'slot2',    done: 'cast_slot2',   count: 1,  text: 'Используй навык 2',                     where: 'чучело' },
  // ↑ 6 базовых действий выучены — дальше необязательные шаги (можно позже из меню «Обучение»)
  { id: 'ob_radial',   action: 'radial',   done: 'radial_pick',  count: 1,  text: 'Открой меню умений и выбери заклинание', where: 'камень рун', optional: true },
  { id: 'ob_slot4',    action: 'slot4',    done: 'cast_slot4',   count: 1,  text: 'Ульта заряжена — используй',             where: 'волна чучел', optional: true },
  { id: 'ob_glide',    action: 'glide',    done: 'glide_s',      count: 2,  text: 'Прыгни с обрыва и пари',                 where: 'обрыв', optional: true },
  { id: 'ob_glyph',    action: 'spellStance', done: 'glyph_cast', count: 1, text: 'Продвинуто: начерти руну огня (треугольник)', where: 'камень рун', optional: true, advanced: true },
]);

export function createOnboarding({ platform = 'pc', archetype = null, steps = ONBOARDING_STEPS, skipOptional = false } = {}) {
  const list = steps.filter((s) => !(skipOptional && s.optional));
  const st = { i: 0, progress: 0, finished: false, archetype };
  const cur = () => list[st.i];
  return {
    state: st,
    get step() { return cur() ?? null; },
    prompt() {
      const s = cur(); if (!s) return null;
      const key = s.action ? INPUT_MAP_V2[s.action]?.[platform] : null;
      const tip = s.id === 'ob_slot1' && st.archetype ? STARTER_LOADOUTS[st.archetype]?.tip : null;
      return { id: s.id, text: s.text, key, where: s.where, tip, progress: `${Math.min(st.progress, s.count)}/${s.count}`, optional: !!s.optional };
    },
    // event(name, amount) — игра сообщает события; возвращает true, если шаг завершён.
    event(name, amount = 1, data = {}) {
      const s = cur(); if (!s || name !== s.done) return false;
      if (name === 'archetype' && data.archetype) st.archetype = data.archetype;
      st.progress += amount;
      if (st.progress >= s.count) { st.i++; st.progress = 0; if (st.i >= list.length) st.finished = true; return true; }
      return false;
    },
    skip() { st.i = list.length; st.finished = true; },
    skipStep() { if (cur()) { st.i++; st.progress = 0; st.finished = st.i >= list.length; } },
    coreDone() { return list.slice(0, st.i).filter((s) => !s.optional).length >= list.filter((s) => !s.optional).length; },
  };
}
