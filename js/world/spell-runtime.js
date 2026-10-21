// js/world/spell-runtime.js — подключение магии к срезу E (js/openworld/main.js). Ввод 4 платформ → GlyphRecognizer → CastingMachine → mobs.damage (resolveHit).
// VFX data-driven: SPELL_VFX[def.vfx] {shape, color, core}; тема (казахский орнамент и т. п.) переопределяет через setTheme({ vfx_id: {...} }).
import * as THREE from 'three';
import { SPELL_ELEMENTS, SPELL_VFX, CAST_RULES, GLYPHS } from '../../shared/defs/spells.js';
import { resolveHit } from '../../shared/damage.js';
import { GlyphRecognizer, stickPathToStroke } from './glyph-recognizer.js';
import { CastingMachine } from './casting.js';

const GLYPH_TO_EL = Object.fromEntries(Object.entries(SPELL_ELEMENTS).map(([el, e]) => [e.glyph, el]));
const KEY_TO_EL = Object.fromEntries(Object.entries(SPELL_ELEMENTS).map(([el, e]) => [`Digit${e.pcKey}`, el]));

export class SpellRuntime {
  /**
   * @param {object} api { scene, camera, player, mobs, hud, st, now:()=>number, rightCtrl, leftCtrl,
   *   fx?: { tracer(a,b,type), pulse(pos,R) }, onDamageNumber?(pos, dmg, color), level?, runes?, unlocked?(id), rankOf?(id) }
   */
  constructor(api) {
    this.api = api; this.rec = new GlyphRecognizer(GLYPHS);
    this.m = new CastingMachine({ level: api.level || 1, runes: api.runes || [], unlocked: api.unlocked, rankOf: api.rankOf });
    this.theme = {}; this.stroke = null; this.lmbDownAt = 0; this.storms = []; this.parts = []; this.channelHit = null;
    this.advancedGlyphs = !!api.advancedGlyphs; // H.5: стойка U только при advancedGlyphs
    this.glyphAssist = api.glyphAssist !== false; // assisted → 0.65
    this._minGlyph = this.glyphAssist ? 0.65 : (CAST_RULES.minGlyphScore || 0.78);
    this._pool(); this._bindPc(); this._bindPhone();
  }
  setTheme(map) { this.theme = map || {}; }
  vfx(key) { return { ...SPELL_VFX[key], ...(this.theme[key] || {}) }; }

  // ---------- ввод ----------
  _bindPc() {
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyU' && !e.repeat && this.advancedGlyphs) { this.m.enterStance(); this.stroke = []; }
      if (this.m.state !== 'idle' && KEY_TO_EL[e.code]) { this.m.addElement(KEY_TO_EL[e.code]); e.stopImmediatePropagation(); }
    }, true);
    addEventListener('keyup', (e) => { if (e.code === 'KeyU' && this.advancedGlyphs) { this._endStroke(); this.m.exitStance(); } });
    addEventListener('mousemove', (e) => { if (this.stroke && this.m.state === 'stance') { const l = this.stroke.at(-1) || [0, 0]; this.stroke.push([l[0] + e.movementX, l[1] + e.movementY]); } });
    // в стойке ЛКМ/ПКМ/колесо — формы, а не стрельба (capture + stopImmediatePropagation)
    addEventListener('mousedown', (e) => { if (this.m.state === 'idle') return; e.stopImmediatePropagation(); this._endStroke(); if (e.button === 0) this.lmbDownAt = this.api.now(); if (e.button === 2) this._release('nova'); }, true);
    addEventListener('mouseup', (e) => { if (this.m.state === 'idle' || e.button !== 0) return; e.stopImmediatePropagation(); const h = this.api.now() - this.lmbDownAt; if (this.m.state === 'channeling') this.m.stopChannel(); else this._release(e.shiftKey ? 'bolt' : h > 0.35 ? 'beam' : 'bolt', e.shiftKey ? h : 0); }, true); // Shift+удерж. ЛКМ = заряженный снаряд
    addEventListener('wheel', (e) => { if (this.m.state === 'idle') return; this._endStroke(); this._release(e.deltaY < 0 ? 'ward' : 'storm'); }, { passive: true });
  }
  _bindPhone() {
    if (!matchMedia('(pointer: coarse)').matches) return;
    const b = document.createElement('div'); b.textContent = '✦'; b.style.cssText = 'position:fixed;right:24px;bottom:370px;width:62px;height:62px;border-radius:50%;display:grid;place-items:center;background:#2a0f46c0;border:2px solid #c04bff;color:#fff;font:700 26px system-ui;z-index:42';
    let t0 = 0, start = null;
    b.addEventListener('touchstart', (e) => { e.preventDefault(); if (!this.advancedGlyphs) { this.api.hud?.flash('Включи «продвинутый каст» в настройках', 1200); return; } this.m.enterStance(); this.stroke = []; }, { passive: false });
    b.addEventListener('touchend', (e) => { e.preventDefault(); this._endStroke(); }, { passive: false });
    addEventListener('touchstart', (e) => { if (this.m.state === 'idle') return; const t = e.touches[e.touches.length - 1]; t0 = this.api.now(); start = [t.clientX, t.clientY]; if (e.touches.length >= 3) this._release('ward'); }, { passive: true });
    addEventListener('touchmove', (e) => { if (!this.stroke || this.m.state !== 'stance') return; const t = e.touches[e.touches.length - 1]; if (t.clientX > innerWidth / 2) this.stroke.push([t.clientX, t.clientY]); }, { passive: true });
    addEventListener('touchend', (e) => { if (this.m.state === 'idle' || !start || this.stroke?.length) return; const t = e.changedTouches[0], dy = t.clientY - start[1], h = this.api.now() - t0;
      if (this.m.state === 'channeling') return this.m.stopChannel();
      this._release(dy > 80 ? 'nova' : dy < -80 ? 'storm' : h > 0.35 ? 'beam' : 'bolt', h); start = null; }, { passive: true });
    document.body.appendChild(b);
  }
  /** Arduino: вызывать из моста serial с сэмплами стика в стойке; formFromButtons — из жестов кнопки b. */
  arduinoStroke(samples) { this._recognize(stickPathToStroke(samples)); }
  arduinoForm(form, holdS = 0) { this._release(form, holdS); }
  _endStroke() { if (this.stroke && this.stroke.length > 6) this._recognize(this.stroke); this.stroke = this.m.state === 'idle' ? null : []; }
  _recognize(pts) {
    const r = this.rec.recognize(pts);
    if (r.id && r.score >= (this._minGlyph ?? CAST_RULES.minGlyphScore)) { this.m.addElement(GLYPH_TO_EL[r.id]); this.api.hud?.flash(`Руна: ${GLYPHS[r.id].name}`, 600); }
    else this.api.hud?.flash('Руна не распознана', 600);
  }
  _release(form, holdS = 0) {
    const st = this.api.st; const r = this.m.release(form, st.energy, { holdS });
    if (!r.ok) { if (r.reason !== 'state') this.api.hud?.flash({ energy: 'Мало энергии', cooldown: 'Перезарядка', no_spell: 'Нет такого заклинания', locked: 'Страница не открыта', gcd: '…' }[r.reason] || r.reason, 600); return; }
    st.energy = Math.max(0, st.energy - r.energy); st.lastEnergy = this.api.now();
  }

  // ---------- VR: рисование левым контроллером при зажатом grip (проекция на плоскость взгляда) ----------
  _vr() {
    const { player, leftCtrl, camera } = this.api; if (!player.xr) return;
    const pad = player.xrPads().left; const grip = pad?.buttons?.[1]?.pressed;
    if (grip && this.m.state === 'idle' && this.advancedGlyphs) { this.m.enterStance(); this.stroke = []; }
    if (grip && this.stroke) { const p = leftCtrl.getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse); this.stroke.push([p.x, -p.y]); }
    if (!grip && this.stroke?.length) this._endStroke();
    const trig = player.xrPads().right?.buttons?.[0]?.pressed;
    if (this.m.state === 'stance' && this.m.elements.length) { if (trig && !this._trig) this._trigT = this.api.now(); if (!trig && this._trig) this._release(this.api.now() - this._trigT > 0.35 ? 'beam' : 'bolt', this.api.now() - this._trigT); }
    if (this.m.state === 'channeling' && !trig) this.m.stopChannel();
    this._trig = trig; if (!grip && this.m.state === 'stance' && !this.m.elements.length) this.m.exitStance();
  }

  // ---------- кадр ----------
  /** Вызывать в цикле main.js; stagger: true, если игрока оглушили в этом кадре. */
  update(dt, { staggered = false } = {}) {
    this._vr(); if (staggered) this.m.interrupt('st_stagger');
    const st = this.api.st; st.energy -= this.m.update(dt, st.energy);
    for (const e of this.m.drain()) this._event(e);
    for (const s of this.storms) { s.t -= dt; if (s.t <= 0 && s.left > 0) { s.left--; s.t = s.def.pulseS; this._area(s.pos, s.def.radiusM, s.def, s.hit); } }
    this.storms = this.storms.filter((s) => s.left > 0);
    this._parts(dt);
  }
  _event(e) {
    const { hud, st } = this.api;
    if (e.type === 'fire' || e.type === 'tick') this._cast(e.def || this.m.spell, e.hit, e.type === 'tick');
    if (e.type === 'interrupted') { st.energy += e.refund; hud?.flash('Каст прерван', 700); }
    if (e.type === 'backlash') { // щит не спасает: target.shield = 0
      const r = resolveHit({ base: e.hp, type: e.dmgType, target: { hp: st.hp, shield: 0, armor: 0, res: {} } });
      st.hp = Math.max(1, st.hp - r.hpDmg); st.lastEnergy = this.api.now() + e.regenLockS; hud?.flash(`Откат магии −${r.hpDmg}`, 900);
    }
  }
  _origin() { const ro = new THREE.Vector3(), rd = new THREE.Vector3(); this.api.player.aimRay(ro, rd, this.api.rightCtrl); return { ro, rd }; }
  _cast(def, hit, tick) {
    const { mobs, player } = this.api, v = this.vfx(def.vfx), { ro, rd } = this._origin();
    if (def.form === 'bolt' || def.form === 'beam') {
      const h = mobs.raycast(ro, rd, def.rangeM || 60); const end = h ? h.point : ro.clone().addScaledVector(rd, def.rangeM || 60);
      this._beam(ro, end, v, tick ? 0.06 : 0.12);
      if (h) { this._hit(h.mob, def, { ...hit, zone: h.zone, range: h.dist }, h.point, v); this._chain(h.mob, def, hit, v); }
    } else if (def.form === 'nova') this._area(player.pos.clone(), def.radiusM, def, hit);
    else if (def.form === 'storm') { const h = mobs.raycast(ro, rd, 40); const pos = h ? h.point : ro.clone().addScaledVector(rd, 20); this.storms.push({ def, hit, pos, left: def.pulses, t: 0 }); }
    else if (def.form === 'ward') this._ward(def, v);
  }
  _hit(mob, def, hit, point, v) {
    const s = def.status; const stagger = (s?.id === 'st_stagger' ? s.sec : 0) || (def.status2?.id === 'st_stagger' ? def.status2.sec : 0);
    const r = this.api.mobs.damage(mob, { ...hit, stagger: stagger || undefined });
    if (r) { (mob.spellStatuses ||= []).push(...[s, def.status2].filter(Boolean).map((x) => x.id)); this.api.onDamageNumber?.(point, r.dmg, v.color); }
    this._burst(point, v, 14); return r;
  }
  _chain(first, def, hit, v) {
    if (!def.chain) return; let from = first, mul = 1; const done = new Set([first]);
    for (let j = 0; j < def.chain.jumps; j++) {
      const next = this.api.mobs.list.find((m) => m.state !== 'dead' && !done.has(m) && m.g.position.distanceTo(from.g.position) < def.chain.rangeM); if (!next) break;
      mul *= def.chain.falloff; done.add(next); this._beam(from.g.position, next.g.position, v, 0.1);
      this._hit(next, def, { ...hit, base: hit.base * mul, zone: 'body' }, next.g.position, v); from = next;
    }
  }
  _area(pos, R, def, hit) {
    const v = this.vfx(def.vfx); this.api.fx?.pulse?.(pos, R); this._burst(pos, v, 40, R);
    for (const m of this.api.mobs.list) if (m.state !== 'dead' && m.g.position.distanceTo(pos) <= R) this._hit(m, def, { ...hit, zone: undefined }, m.g.position, v);
  }
  _ward(def, v) {
    const st = this.api.st, w = def.ward || {};
    if (w.absorb) st.shield = Math.min(st.shieldMax + w.absorb, Math.max(st.shield, w.absorb)); // не стакается с s_barrier: берётся больший
    st.spellWard = { id: def.id, until: this.api.now() + (w.durationS || def.durationS || 6), ...w };
    if (def.base) this._area(this.api.player.pos.clone(), 3, def, { base: this.m.p?.base || def.base, type: def.dmgType, zoneKind: 'aoe', attacker: [] });
    this._burst(this.api.player.pos.clone().setY(this.api.player.pos.y + 1), v, 30, 1.2);
  }
  // ---------- частицы (пул; бюджет — QUALITY_PRESETS[*].particles) ----------
  _pool() {
    const n = 600; this.pg = new THREE.BufferGeometry(); this.pp = new Float32Array(n * 3); this.pc = new Float32Array(n * 3);
    this.pg.setAttribute('position', new THREE.BufferAttribute(this.pp, 3)); this.pg.setAttribute('color', new THREE.BufferAttribute(this.pc, 3));
    this.points = new THREE.Points(this.pg, new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false; this.api.scene.add(this.points); this.cap = n;
  }
  _burst(pos, v, count, R = 0.6) {
    const c1 = new THREE.Color(v.color), c2 = new THREE.Color(v.core || v.color);
    for (let i = 0; i < count && this.parts.length < this.cap; i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(R * (1 + Math.random()) * (v.shape === 'rain' ? 0.5 : 1.5));
      this.parts.push({ p: pos.clone(), v: v.shape === 'rain' ? new THREE.Vector3(d.x, -6, d.z) : d, life: 0.6, c: i % 3 ? c1 : c2 });
      if (v.shape === 'rain') this.parts.at(-1).p.y += 6;
    }
  }
  _beam(a, b, v, life) { if (this.api.fx?.tracer) return this.api.fx.tracer(a, b, v.base); const c = new THREE.Color(v.color); for (let i = 0; i <= 12 && this.parts.length < this.cap; i++) this.parts.push({ p: a.clone().lerp(b, i / 12), v: new THREE.Vector3(), life, c }); }
  _parts(dt) {
    this.parts = this.parts.filter((q) => (q.life -= dt) > 0);
    this.parts.forEach((q, i) => { q.p.addScaledVector(q.v, dt); this.pp.set([q.p.x, q.p.y, q.p.z], i * 3); this.pc.set([q.c.r * q.life * 1.6, q.c.g * q.life * 1.6, q.c.b * q.life * 1.6], i * 3); });
    this.pg.setDrawRange(0, this.parts.length); this.pg.attributes.position.needsUpdate = this.pg.attributes.color.needsUpdate = true;
  }
}
