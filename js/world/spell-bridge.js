// js/world/spell-bridge.js — заклинания по рунам (раздел F дизайн-документа) в нашем открытом мире ?mode=world.
// SpellRuntime писался под отдельный рантайм раздела E; здесь — переходник к нашему миру:
// противники — существа «Арены магов» (js/fantasy/enemies.js), урон по формуле канона пересчитан под их здоровье,
// энергия бесконечная (ограничивают только откаты), в шлеме не подключается (там руны рисуются курком — навыки арены).
// ПК: U — режим заклинаний вкл/выкл; в нём 1–7 стихии (огонь, мороз, молния, аркана, яд, земля, ветер),
// две разные подряд — слияние; ЛКМ — снаряд (удержание — луч), ПКМ — волна вокруг, колесо вверх — оберег, вниз — буря.
import * as THREE from 'three';
import { SpellRuntime } from './spell-runtime.js';
import { SPELL_ELEMENTS } from '../../shared/defs/spells.js';
import { createMobAdapter } from './enemy-adapter.js';

const KEY_TO_EL = Object.fromEntries(Object.entries(SPELL_ELEMENTS).map(([el, e]) => [`Digit${e.pcKey}`, el]));
const EL_RU = { fire: 'Огонь', frost: 'Мороз', lightning: 'Молния', arcane: 'Аркана', poison: 'Яд', earth: 'Земля', wind: 'Ветер' };
// стихия канона → стихия существ арены
const ENEMY_EL = { fire: 'fire', frost: 'ice', lightning: 'lightning' };

class WorldSpellRuntime extends SpellRuntime {
  // свой ввод на ПК: U — режим вкл/выкл, без удержания
  _bindPc() {
    addEventListener('keydown', (e) => {
      if (!this.api.active()) return;
      if (e.code === 'KeyU' && !e.repeat) {
        e.stopImmediatePropagation();
        this.mode = !this.mode;
        if (this.mode) { if (this.m.state === 'idle') this.m.enterStance(); this.api.hud.flash('Заклинания: 1–7 стихия · ЛКМ снаряд (удерж. — луч) · ПКМ волна · колесо — оберег/буря · U выход', 3200); }
        else { this.m.exitStance(); this.lastElements = null; this.api.hud.flash('Заклинания выключены', 900); }
        return;
      }
      if (!this.mode) return;
      if (e.code === 'Escape') { this.mode = false; this.m.exitStance(); return; }
      if (this.m.state === 'idle') this.m.enterStance();
      const el = KEY_TO_EL[e.code];
      if (el) { e.stopImmediatePropagation(); if (this.m.elements.length >= 2 || this.m.elements.includes(el)) this.m.elements.length = 0; this.m.addElement(el); this.api.hud.flash(`Руна: ${EL_RU[el] || el}${this.m.elements.length > 1 ? ' + слияние' : ''}`, 700); }
    }, true);
    addEventListener('mousedown', (e) => {
      if (!this.api.active() || !this.mode) return;
      e.stopImmediatePropagation();
      if (this.m.state === 'idle') this.m.enterStance();
      if (e.button === 0) this.lmbDownAt = this.api.now();
      if (e.button === 2) this._release('nova');
    }, true);
    addEventListener('mouseup', (e) => {
      if (!this.api.active() || !this.mode || e.button !== 0) return;
      e.stopImmediatePropagation();
      const h = this.api.now() - this.lmbDownAt;
      if (this.m.state === 'channeling') this.m.stopChannel(); else this._release(h > 0.35 ? 'beam' : 'bolt', h);
    }, true);
    addEventListener('wheel', (e) => {
      if (!this.api.active() || !this.mode) return;
      if (this.m.state === 'idle') this.m.enterStance();
      this._release(e.deltaY < 0 ? 'ward' : 'storm');
    }, { passive: true, capture: true });
  }
  _bindPhone() {} // телефон — позже
  _release(form, holdS = 0) {
    // последняя выбранная стихия остаётся: можно кастовать кликами подряд
    if (!this.m.elements.length && this.lastElements?.length) for (const el of this.lastElements) this.m.addElement(el);
    if (!this.m.elements.length) { this.api.hud.flash('Сначала стихия: 1–7', 900); return; }
    this.lastElements = this.m.elements.slice();
    super._release(form, holdS);
  }
}

/**
 * deps: { scene, camera, enemies, headPos, notify, fx, particles, vfx, scoreEnemy, isActive, raycastEnemies }
 */
export function createSpellBridge(deps) {
  const { scene, camera, enemies } = deps;
  const st = { energy: 999, hp: 150, shield: 0, shieldMax: 75, lastEnergy: 0 };
  const now = () => performance.now() / 1000;
  const feet = new THREE.Vector3();
  const elemOf = (hit) => ENEMY_EL[Object.keys(SPELL_ELEMENTS).find((k) => SPELL_ELEMENTS[k].dmgType === hit?.type)] || 'rune';
  const mobsBase = createMobAdapter(deps);
  const api = {
    scene, camera, st, now,
    active: deps.isActive,
    hud: { flash: (t, ms) => deps.notify(typeof t === 'string' ? t : String(t), '#c9a2ff', ms) },
    player: {
      xr: false, // в шлеме — руны арены (курок свободной руки)
      xrPads: () => ({}),
      get pos() { return feet.set(deps.headPos.x, deps.headPos.y - 1.5, deps.headPos.z); },
      aimRay(ro, rd) { camera.getWorldPosition(ro); camera.getWorldDirection(rd); },
    },
    mobs: {
      get list() { return mobsBase.list; },
      raycast: (ro, rd, range) => mobsBase.raycast(ro, rd, range),
      damage: (mob, hit) => mobsBase.damage(mob, hit, elemOf(hit)),
    },
    fx: {
      tracer: (a, b) => deps.fx.tracer(a, b, 0xc9a2ff),
      pulse: (pos, R) => deps.particles?.burst?.(deps.vfx?.arcane?.hit || [], pos, null, Math.min(2, R / 3)),
    },
    onDamageNumber: (p, dmg, color) => deps.fx.popup?.(p, '-' + dmg, typeof color === 'string' ? color : '#e2b8ff'),
    level: 1, unlocked: () => true, rankOf: () => 1, advancedGlyphs: false, glyphAssist: true,
  };
  const rt = new WorldSpellRuntime(api);
  return {
    runtime: rt,
    get state() { return rt.mode ? (rt.m.state === 'idle' ? 'stance' : rt.m.state) : 'idle'; },
    get elements() { return rt.m.elements.slice(); },
    update(dt) {
      st.energy = 999; // без ограничений по энергии — только откаты
      if (!deps.isActive()) { if (rt.m.state !== 'idle') rt.m.exitStance(); rt.mode = false; return; }
      rt.update(dt);
      if (rt.mode && rt.m.state === 'idle') rt.m.enterStance(); // режим держится до U
    },
  };
}
