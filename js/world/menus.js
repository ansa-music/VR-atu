// js/world/menus.js — runtime прогрессии для среза E: SAO-HUD (HP+уровень слева сверху), level-up VFX/звук,
// меню I (инвентарь/экипировка/крафт/магазин), K (навыки, атрибуты, созвездия), L (квесты, сохранения).
// Подключение: export install(ow), где ow = API из js/openworld/main.js (window.__OW). main.js не правится этим модулем.
import * as THREE from 'three';
import { SKILLS } from '../../shared/defs/skills.js';
import { ITEMS } from '../../shared/defs/items.js';
import { RECIPES } from '../../shared/defs/crafting.js';
import { POIS } from '../../shared/defs/index.js';
import { STATIONS } from '../../shared/defs/pois.js';
import { BOSSES } from '../../shared/defs/enemies.js';
import { QUESTS } from '../../shared/defs/quests.js';
import { ATTRIBUTES, CONSTELLATIONS, GEAR_SLOTS } from '../../shared/defs/progression.js';
import { ARTIFACTS } from '../../shared/defs/fantasy_extras.js';
import * as P from './progression.js';
import { Inventory, rollMobLoot, RARITY_COLOR, RARITY_RU, SLOT_RU, SHOP, affixText, sellPrice, rollGear, rollRarity } from './inventory.js';
import { createSaveStore, createAutosaver, snapshot, exportB64, importB64 } from './save.js';

const CSS = `
#owm-hud{position:fixed;left:14px;top:12px;z-index:41;pointer-events:none;font:700 12px system-ui,sans-serif;color:#eafaff;text-shadow:0 1px 2px #000}
#owm-hud .plate{display:flex;align-items:center;gap:8px;padding:6px 12px 6px 8px;background:linear-gradient(90deg,#0b1430e6,#0b143080);clip-path:polygon(0 0,100% 0,94% 100%,0 100%);border-left:3px solid #3ec5ff;min-width:300px}
#owm-hud .lv{font:800 15px "Russo One",system-ui;color:#ffd23f;min-width:46px}
#owm-hud .nm{font-size:11px;opacity:.85;margin-bottom:2px;letter-spacing:.06em}
#owm-hud .hp{position:relative;width:230px;height:11px;background:#0008;border:1px solid #fff4;transform:skewX(-20deg);overflow:hidden}
#owm-hud .hp i{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#3cff7a,#b6ff4a);transition:width .15s}
#owm-hud .hp.mid i{background:linear-gradient(90deg,#ffd23f,#ffe08a)} #owm-hud .hp.low i{background:linear-gradient(90deg,#ff3a3a,#ff7a5a)}
#owm-hud .hpt{font-size:10px;margin-left:6px;opacity:.9}
#owm-hud .xp{width:230px;height:3px;margin-top:3px;background:#0008;transform:skewX(-20deg)} #owm-hud .xp i{display:block;height:100%;background:#7c5cff}
#owm-hud .gold{margin-top:4px;font-size:11px;color:#ffd23f}
#owm-qt{position:fixed;right:14px;top:44px;z-index:41;pointer-events:none;max-width:280px;padding:8px 12px;border-right:3px solid #ffd23f;background:linear-gradient(270deg,#0b1430e0,#0b143060);font:600 12px system-ui;color:#eafaff;text-align:right}
#owm-qt b{display:block;color:#ffd23f;font:800 13px "Russo One",system-ui}
#owm-lvl{position:fixed;left:50%;top:30%;transform:translate(-50%,-50%) scale(.6);z-index:45;pointer-events:none;opacity:0;text-align:center;transition:opacity .3s,transform .5s cubic-bezier(.2,1.6,.4,1)}
#owm-lvl.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
#owm-lvl h1{margin:0;font:900 54px "Russo One",system-ui;letter-spacing:.12em;background:linear-gradient(180deg,#fff,#ffd23f 55%,#ff9a2e);-webkit-background-clip:text;color:transparent;filter:drop-shadow(0 0 14px #ffd23faa)}
#owm-lvl p{margin:4px 0 0;font:700 16px system-ui;color:#eafaff;text-shadow:0 0 8px #3ec5ff}
#owm-menu{pointer-events:auto;position:fixed;inset:6% 8%;z-index:46;display:none;flex-direction:column;background:#0a1028f2;border:1px solid #3ec5ff66;border-radius:14px;box-shadow:0 0 40px #3ec5ff33;font:13px system-ui;color:#eafaff;overflow:hidden}
#owm-menu.on{display:flex}
#owm-menu nav{display:flex;gap:4px;padding:8px;background:#060a1c;border-bottom:1px solid #3ec5ff33}
#owm-menu nav button{flex:0 0 auto;padding:8px 14px;border:1px solid #3ec5ff44;border-radius:8px;background:#0f1838;color:#cfe;cursor:pointer;font:700 13px system-ui}
#owm-menu nav button.on{background:#3ec5ff;color:#061024} #owm-menu nav button:disabled{opacity:.35}
#owm-menu nav .x{margin-left:auto}
#owm-menu .body{flex:1;overflow:auto;padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
#owm-menu h3{margin:0 0 6px;font:800 14px "Russo One",system-ui;color:#ffd23f}
#owm-menu .card{padding:7px 9px;margin:4px 0;border:1px solid #ffffff22;border-left:4px solid var(--c,#ccc);border-radius:8px;background:#ffffff08;cursor:pointer}
#owm-menu .card:hover{background:#3ec5ff1a} #owm-menu .card .t{font-weight:800;color:var(--c,#fff)} #owm-menu .card small{display:block;opacity:.8}
#owm-menu .slots{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
#owm-menu .slot{min-height:54px;padding:6px;border:1px dashed #ffffff33;border-radius:8px;font-size:11px}
#owm-menu .btn{padding:4px 10px;margin:2px;border:0;border-radius:6px;background:#34e89e;color:#04140c;font-weight:800;cursor:pointer} #owm-menu .btn.g{background:#7c5cff;color:#fff} #owm-menu .btn:disabled{background:#555;color:#aaa}
#owm-menu .row{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #ffffff10}
#owm-menu .pts{font:800 13px system-ui;color:#ffd23f}
#owm-toast{position:fixed;left:14px;top:96px;z-index:41;pointer-events:none;font:700 12px system-ui;display:flex;flex-direction:column;gap:3px}
#owm-toast div{padding:3px 10px;background:#0b1430c0;border-left:3px solid var(--c,#3ec5ff);transition:opacity .4s}
`;

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const itemName = (id) => ITEMS[id]?.name || ARTIFACTS[id]?.name || id;

/** Звук level-up: синтез (арпеджио + колокол), без файлов. */
function chime(ctx, kind = 'level') {
  if (!ctx) return; const t0 = ctx.currentTime; const notes = kind === 'level' ? [523, 659, 784, 1047, 1319] : kind === 'quest' ? [659, 880, 1175] : [880, 1320];
  notes.forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = i === notes.length - 1 ? 'sine' : 'triangle'; o.frequency.value = f;
    const t = t0 + i * 0.09; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + (i === notes.length - 1 ? 1.4 : 0.35)); o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 1.5); });
}

/** VFX уровня в стиле SAO: столб света + 2 кольца-руны, поднимающиеся вокруг игрока. 3 меша, аддитивно, ~1,6 с. */
function levelUpVfx(scene, pos) {
  const grp = new THREE.Group(); grp.position.set(pos.x, pos.y - 1.6, pos.z);
  const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 6, 20, 1, true), mat(0xffd23f, 0.35)); pillar.position.y = 3; grp.add(pillar);
  const r1 = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.45, 40).rotateX(-Math.PI / 2), mat(0x3ec5ff, 0.9)); grp.add(r1);
  const r2 = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.95, 6).rotateX(-Math.PI / 2), mat(0xffffff, 0.9)); grp.add(r2);
  scene.add(grp); let t = 0;
  return (dt) => { t += dt; const k = t / 1.6; r1.position.y = k * 3.2; r2.position.y = k * 2.2; r2.rotation.y += dt * 3; r1.scale.setScalar(1 + k * 0.5);
    pillar.material.opacity = 0.35 * (1 - k); r1.material.opacity = r2.material.opacity = 0.9 * (1 - k);
    if (t >= 1.6) { scene.remove(grp); grp.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); return false; } return true; };
}

export async function install(ow, opts = {}) {
  if (!ow || ow.__progression) return ow?.__progression;
  const Q = new URLSearchParams(location.search);
  const st = ow.state; const style = el('style', null, CSS); document.head.appendChild(style);
  let prog = P.createProgression(), inv = new Inventory(), qlog = P.createQuestLog(), playTime = 0, kills = 0;
  inv.gold = st.gold || 0; for (const [k, n] of Object.entries(st.inv || {})) inv.add(k, n);
  const store = await createSaveStore(opts.saveBackend ? { backend: opts.saveBackend } : {});
  if (!Q.has('owfresh')) { try { const s = await store.latest(); if (s) { prog = s.progression; inv = new Inventory(s.inventory); qlog = s.questLog || qlog; playTime = s.playTime || 0;
    if (s.player?.pos && ow.tp) ow.tp(s.player.pos[0], s.player.pos[2]); for (const id of s.world?.discovered || []) ow.discovered?.add(id); } } catch (e) { console.warn('[progression] load', e?.message); } }
  let audio = null; const getAudio = () => { try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch {} return audio; };

  // ───── HUD ─────
  const hud = el('div', null, `<div class="plate"><div class="lv">Lv 1</div><div><div class="nm">СТРАННИК · ${esc(prog.archetype)}</div><div style="display:flex;align-items:center"><div class="hp"><i></i></div><span class="hpt"></span></div><div class="xp"><i></i></div><div class="gold"></div></div></div>`);
  hud.id = 'owm-hud'; const qt = el('div'); qt.id = 'owm-qt'; const lvl = el('div', null, '<h1>LEVEL UP!</h1><p></p>'); lvl.id = 'owm-lvl'; const toast = el('div'); toast.id = 'owm-toast';
  const menu = el('div'); menu.id = 'owm-menu'; // main.js прячет все прямые дети body, кроме #ow-root/#ow-hud — поэтому монтируемся внутрь #ow-hud
  const mount = document.getElementById('ow-hud') || document.body; mount.append(hud, qt, lvl, toast, menu);
  const $ = (s) => hud.querySelector(s);
  function say(text, color = '#3ec5ff', ms = 2200) { const d = el('div', null, esc(text)); d.style.setProperty('--c', color); toast.appendChild(d); while (toast.children.length > 6) toast.firstChild.remove(); setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 450); }, ms); }

  // ───── применение характеристик к состоянию среза ─────
  function applyStats() {
    const d = P.derivedStats(prog, inv.gearStats()); const ratio = st.hpMax ? st.hp / st.hpMax : 1;
    st.hpMax = d.hpMax; st.hp = Math.min(d.hpMax, Math.max(1, Math.round(ratio * d.hpMax))); st.gold = inv.gold; st.level = prog.level; st.derived = d; return d;
  }
  const vfx = [];
  function onLevelUps(ups) {
    if (!ups?.length) return; const last = ups[ups.length - 1]; applyStats(); st.hp = st.hpMax; st.shield = st.shieldMax;
    lvl.querySelector('p').textContent = `Уровень ${last.level} · HP ${last.hpMax} · +${ups.reduce((s, u) => s + u.sp, 0)} ОН · +${ups.reduce((s, u) => s + u.ap, 0)} ОХ${ups.some((u) => u.tp) ? ' · +1 ОТ' : ''}`;
    lvl.classList.add('on'); setTimeout(() => lvl.classList.remove('on'), 2600); chime(getAudio(), 'level');
    try { const p = ow.player.pos; vfx.push(levelUpVfx(ow.scene, { x: p.x, y: (p.y ?? 1.6), z: p.z })); } catch {}
    autosaver.trigger('levelup');
  }
  function gainXp(n, why) { if (n > 0) say(`+${n} XP · ${why}`, '#7c5cff', 1400); onLevelUps(P.addXp(prog, n, P.derivedStats(prog, inv.gearStats()).xpMul)); }
  function questProgress(ev) {
    const done = P.questEvent(qlog, ev); if (!done) return;
    const r = P.applyQuestReward(prog, done); for (const it of r.items) inv.add(it, 1);
    say(`Квест выполнен: ${done}`, '#ffd23f', 3500); chime(getAudio(), 'quest'); onLevelUps(r.ups); autosaver.trigger('quest');
    // collect-шаги следующего квеста могут быть уже выполнены
    { const s = QUESTS_STEP(qlog); if (s?.type === 'collect') questProgress({ type: 'collect', item: s.item, have: inv.count(s.item) }); }
  }
  const QUESTS_STEP = (log) => QUESTS[log.active]?.steps?.[log.step];

  // ───── хуки мобов: XP за убийство, лут по таблицам, гир-роллы ─────
  const mobs = ow.mobs; const origKill = mobs.onKill;
  mobs.onKill = (m) => { origKill?.(m); kills++;
    const xp = P.xpForKill(m, prog.level); gainXp(xp, m.def?.name || m.id);
    questProgress({ type: 'kill', mob: m.id }); if (BOSSES[m.id]) questProgress({ type: 'boss', boss: m.id });
    const loot = rollMobLoot(m, { playerL: prog.level, lootFind: P.derivedStats(prog, inv.gearStats()).lootFind });
    for (const g of loot.gear) { if (inv.addGear(g)) say(`${RARITY_RU[g.rarity]}: ${g.name} (ур. ${g.il})`, RARITY_COLOR[g.rarity], 3000); else say('Сумка полна', '#ff3a6a'); }
    for (const [id, n] of loot.items) if (ITEMS[id]?.cat === 'unique') { inv.add(id, n); say(`Уникальный: ${itemName(id)}`, RARITY_COLOR.legendary, 4000); }
    if (m.id && m.def) { lastKill = m.lvl || 1; }
  };
  let lastKill = 1;
  mobs.onLoot = (item, n) => {
    if (item === 'it_gear_roll') { const g = rollGear({ il: Math.max(lastKill, prog.level - 2), rarity: rollRarity(m_prof(), Math.random) }); if (inv.addGear(g)) say(`${g.name} · ${RARITY_RU[g.rarity]}`, RARITY_COLOR[g.rarity], 2500); }
    else if (item === 'it_gold') { inv.gold += n; say(`+${n} золота`, '#ffd23f', 900); }
    else { inv.add(item, n); say(`+${n} ${itemName(item)}`, '#9ff', 1100); questProgress({ type: 'collect', item, have: inv.count(item) }); }
    st.gold = inv.gold;
  };
  const m_prof = () => 'normal';

  // ───── открытия POI, станции рядом ─────
  const seen = new Set(ow.discovered || []);
  function nearPoi(maxR = 0) { const p = ow.player.pos; let best = null, bd = 1e9; for (const q of POIS) { const d = Math.hypot(q.pos[0] - p.x, q.pos[1] - p.z); if (d < Math.max(maxR, q.r || 20) && d < bd) { bd = d; best = q; } } return best; }
  const stationsHere = () => { const q = nearPoi(); return [...(q?.stations || []), ...(Q.has('owstations') ? Object.keys(STATIONS) : [])]; };
  const inHub = () => { const q = nearPoi(); return q?.id === SHOP.poi || Q.has('owstations'); };

  // ───── меню ─────
  let tab = null; const TABS = [['inv', 'Инвентарь [I]'], ['craft', 'Крафт'], ['shop', 'Магазин'], ['skills', 'Навыки [K]'], ['quests', 'Квесты [L]']];
  function openMenu(t) {
    tab = t; menu.classList.add('on'); try { document.exitPointerLock?.(); } catch {} ow.player.enabled = false; render();
  }
  function closeMenu() { tab = null; menu.classList.remove('on'); ow.player.enabled = true; try { if (!ow.player.touch && !ow.player.xr) ow.renderer.domElement.requestPointerLock?.(); } catch {} }
  function gearCard(g, extra = '') {
    return `<div class="card" style="--c:${RARITY_COLOR[g.rarity]}" data-uid="${g.uid}"><span class="t">${esc(g.name)}</span> <small>${SLOT_RU[g.slot] || g.slot} · ур. ${g.il} · ${RARITY_RU[g.rarity]}${g.effect ? ' · ' + esc(g.effect) : ''}</small>${g.affixes.map((a) => `<small>${esc(affixText(a))}</small>`).join('')}${extra}</div>`;
  }
  function render() {
    const nav = `<nav>${TABS.map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}" ${k === 'shop' && !inHub() ? 'disabled title="Только в хабе"' : ''}>${n}</button>`).join('')}<span class="pts" style="align-self:center;margin-left:12px">Lv ${prog.level} · ${inv.gold} з.</span><button class="x" data-close>✕ Esc</button></nav>`;
    let body = '';
    if (tab === 'inv') {
      const eq = GEAR_SLOTS.map((s) => { const g = inv.equipped[s] && inv.find(inv.equipped[s]); return `<div class="slot" style="border-color:${g ? RARITY_COLOR[g.rarity] : '#fff3'}"><b>${SLOT_RU[s]}</b><br>${g ? `<span style="color:${RARITY_COLOR[g.rarity]}">${esc(g.name)}</span> ур.${g.il}<br><button class="btn g" data-uneq="${s}">снять</button>` : '—'}</div>`; }).join('');
      const art = inv.artifacts.map((a, i) => `<div class="slot"><b>Артефакт ${i + 1}</b><br>${a ? esc(itemName(a)) : '—'}</div>`).join('');
      const d = P.derivedStats(prog, inv.gearStats());
      const bag = inv.gear.filter((g) => !Object.values(inv.equipped).includes(g.uid)).sort((a, b) => b.il - a.il);
      const stacks = Object.entries(inv.stacks).map(([id, n]) => `<div class="row"><span>${esc(itemName(id))}</span><span>×${n}${ITEMS[id]?.heal ? ` <button class="btn" data-use="${id}">выпить</button>` : ''}</span></div>`).join('') || '<small>пусто</small>';
      body = `<div><h3>Экипировка</h3><div class="slots">${eq}${art}</div><h3 style="margin-top:10px">Характеристики</h3><div class="row"><span>HP</span><b>${d.hpMax}</b></div><div class="row"><span>Стамина</span><b>${d.staminaMax}</b></div><div class="row"><span>Скорость</span><b>+${Math.round(d.moveSpeed * 100)} %</b></div><div class="row"><span>Реген энергии</span><b>${d.energyRegen.toFixed(1)}/с</b></div><div class="row"><span>Перезарядка навыков</span><b>−${Math.round(d.cdr * 100)} %</b></div><div class="row"><span>Поиск добычи</span><b>+${Math.round(d.lootFind * 100)} %</b></div><h3 style="margin-top:10px">Материалы и расходники</h3>${stacks}</div>
        <div><h3>Сумка (${inv.gear.length}/60)</h3>${bag.map((g) => gearCard(g, `<div><button class="btn" data-eq="${g.uid}">надеть</button><button class="btn g" data-salv="${g.uid}">разобрать</button>${inHub() ? `<button class="btn g" data-sell="${g.uid}">продать ${sellPrice(g)} з.</button>` : ''}</div>`)).join('') || '<small>Победите мобов — экипировка выпадает с it_gear_roll</small>'}</div>`;
    } else if (tab === 'craft') {
      const stn = stationsHere();
      body = `<div style="grid-column:1/3"><h3>Станции рядом: ${stn.map((s) => STATIONS[s]?.name || s).join(', ') || 'нет (подойдите к хабу или костру)'}</h3>${Object.entries(RECIPES).map(([rid, rc]) => { const c = inv.canCraft(rid, stn); return `<div class="row"><span><b>${esc(itemName(rc.out[0]) || rc.out[0])}</b> ×${rc.out[1]} <small style="opacity:.7">· ${STATIONS[rc.station]?.name || rc.station} · ${rc.in.map(([i, n]) => `${esc(itemName(i))} ${inv.count(i)}/${n}`).join(', ')}</small></span><button class="btn" data-craft="${rid}" ${c.ok ? '' : `disabled title="${esc(c.reason)}"`}>создать</button></div>`; }).join('')}</div>`;
    } else if (tab === 'shop') {
      body = `<div><h3>Торговец Мот · товары</h3>${SHOP.stock.map(([id, p]) => `<div class="row"><span>${esc(itemName(id))}</span><button class="btn" data-buy="${id}:${p}" ${inv.gold < p ? 'disabled' : ''}>${p} з.</button></div>`).join('')}</div><div><h3>Снаряжение дня</h3>${shopGear().map((g) => gearCard(g, `<button class="btn" data-buyg="${g.uid}" ${inv.gold < sellPrice(g) * SHOP.gearMarkup ? 'disabled' : ''}>${sellPrice(g) * SHOP.gearMarkup} з.</button>`)).join('')}</div>`;
    } else if (tab === 'skills') {
      const byA = {}; for (const s of Object.values(SKILLS)) (byA[s.archetype || 'common'] ||= []).push(s);
      const attrs = P.ATTR_KEYS.map((k) => `<div class="row"><span>${ATTRIBUTES[k].name} <small>${Object.entries(ATTRIBUTES[k].perPoint).map(([a, v]) => `${a} +${v}`).join(', ')}</small></span><span><b>${prog.attrs[k]}</b> <button class="btn" data-attr="${k}" ${prog.ap ? '' : 'disabled'}>+</button></span></div>`).join('');
      const cons = ['A', 'B'].map((br) => { const c = CONSTELLATIONS[prog.archetype]?.[br]; if (!c) return ''; return `<div><b>${esc(c.name)}</b>${c.nodes.map((n, i) => { const key = `${prog.archetype}.${br}.${i}`, own = prog.constellations.includes(key); return `<div class="row"><small>${esc(n)} (${CONSTELLATIONS.nodeCost[i]} ОТ)</small>${own ? '✔' : `<button class="btn g" data-cons="${key}" ${prog.tp ? '' : 'disabled'}>взять</button>`}</div>`; }).join('')}</div>`; }).join('');
      body = `<div><h3>Древо навыков · <span class="pts">ОН ${prog.sp}</span></h3>${Object.entries(byA).map(([a, list]) => `<div style="margin:6px 0"><b style="color:#3ec5ff">${a}</b>${list.map((s) => { const r = prog.skills[s.id] || 0; return `<div class="row"><span>${esc(s.name)} <small>${s.type} · ранг ${r}/5${r >= 3 ? ` · талант ${prog.talents[s.id] || '—'} <button class="btn g" data-tal="${s.id}:A">A</button><button class="btn g" data-tal="${s.id}:B">B</button>` : ''}</small></span><button class="btn" data-rank="${s.id}">${r ? 'ранг +' : 'открыть'}</button></div>`; }).join('')}</div>`).join('')}</div>
        <div><h3>Характеристики · <span class="pts">ОХ ${prog.ap}</span></h3>${attrs}<h3 style="margin-top:10px">Созвездия · <span class="pts">ОТ ${prog.tp}</span></h3>${cons}</div>`;
    } else if (tab === 'quests') {
      const q = P.questText(qlog);
      body = `<div><h3>Основная линия</h3><div class="card" style="--c:#ffd23f"><span class="t">${esc(q.title)}</span><small>шаг ${q.stepIdx + 1 || '-'}/${q.steps || '-'} · ${esc(q.step)}</small></div><h3>Выполнено</h3>${qlog.done.map((d) => `<small>✔ ${d} · ${esc(QUESTS[d]?.title || '')}</small><br>`).join('') || '<small>пока ничего</small>'}<h3 style="margin-top:10px">Статистика</h3><small>Убито мобов: ${kills} · время в мире: ${Math.round(playTime / 60)} мин · XP всего: ${prog.xpTotal}</small></div>
        <div><h3>Сохранения (${store.kind})</h3>${['slot1', 'slot2', 'slot3'].map((s) => `<div class="row"><span>${s}</span><span><button class="btn" data-save="${s}">сохранить</button><button class="btn g" data-load="${s}">загрузить</button></span></div>`).join('')}<div class="row"><span>Перенос ПК ↔ Quest</span><span><button class="btn g" data-export>копировать</button><button class="btn g" data-import>вставить</button></span></div><small id="owm-saves"></small></div>`;
    }
    menu.innerHTML = nav + `<div class="body">${body}</div>`;
    if (tab === 'quests') store.list().then((l) => { const e = menu.querySelector('#owm-saves'); if (e) e.textContent = l.map((x) => `${x.slot}: Lv ${x.level}, ${new Date(x.savedAt).toLocaleString()}`).join(' · '); });
  }
  let shopStock = null, shopDay = -1; function shopGear() { const day = Math.floor(playTime / 600); if (day !== shopDay) { shopDay = day; shopStock = [0, 1, 2].map(() => rollGear({ il: prog.level, rarity: rollRarity('tank') })); } return shopStock; }
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; const D = b.dataset; let msg = null;
    if (D.tab) tab = D.tab; else if ('close' in D) return closeMenu();
    else if (D.eq) { const r = inv.equip(D.eq, prog.level); msg = r.ok ? 'Надето' : r.reason; applyStats(); }
    else if (D.uneq) { inv.unequip(D.uneq); applyStats(); }
    else if (D.salv) inv.salvage(D.salv);
    else if (D.sell) msg = `+${inv.sell(D.sell)} з.`;
    else if (D.use) { if (inv.remove(D.use, 1)) { st.hp = Math.min(st.hpMax, st.hp + (ITEMS[D.use].heal || 0)); msg = 'Лечение'; } }
    else if (D.craft) { const r = inv.craft(D.craft, stationsHere()); msg = r.ok ? `Создано: ${itemName(r.out[0])}` : r.reason; if (r.ok) chime(getAudio(), 'item'); }
    else if (D.buy) { const [id, p] = D.buy.split(':'); msg = inv.buy(id, +p) ? `Куплено: ${itemName(id)}` : 'Не хватает золота'; }
    else if (D.buyg) { const g = shopStock.find((x) => x.uid === D.buyg), p = sellPrice(g) * SHOP.gearMarkup; if (inv.gold >= p && inv.addGear(g)) { inv.gold -= p; shopStock = shopStock.filter((x) => x !== g); msg = 'Куплено'; } }
    else if (D.rank) { const r = P.rankUpSkill(prog, D.rank); msg = r.ok ? `${SKILLS[D.rank].name}: ранг ${r.rank}` : r.reason; }
    else if (D.tal) { const [id, ab] = D.tal.split(':'); P.pickTalent(prog, id, ab); }
    else if (D.attr) { P.spendAttr(prog, D.attr); applyStats(); }
    else if (D.cons) msg = P.buyConstellation(prog, D.cons) ? 'Узел взят' : 'Недоступно';
    else if (D.save) { store.save(D.save, snap()).then(() => say('Сохранено: ' + D.save, '#34e89e')).catch((er) => say(er.message, '#ff3a6a')); }
    else if (D.load) { store.load(D.load).then((s) => { if (!s) return say('Слот пуст', '#ff3a6a'); loadFrom(s); say('Загружено', '#34e89e'); render(); }); }
    else if ('export' in D) { const b64 = exportB64(snap()); navigator.clipboard?.writeText(b64).then(() => say('Сохранение скопировано', '#34e89e'), () => prompt('Скопируйте:', b64)); }
    else if ('import' in D) { const b64 = prompt('Вставьте сохранение (base64):'); if (b64) { try { loadFrom(importB64(b64)); say('Импортировано', '#34e89e'); } catch (er) { say('Ошибка: ' + er.message, '#ff3a6a'); } } }
    st.gold = inv.gold; if (msg) say(msg); render();
  });
  function loadFrom(s) { prog = s.progression; inv = new Inventory(s.inventory); qlog = s.questLog || P.createQuestLog(); playTime = s.playTime || 0; if (s.player?.pos) ow.tp?.(s.player.pos[0], s.player.pos[2]); applyStats(); }
  const KEYMAP = { KeyI: 'inv', KeyK: 'skills', KeyL: 'quests' };
  const onKey = (e) => {
    if (e.repeat || e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return; window.__owmKey = e.code + ':' + tab;
    const t = KEYMAP[e.code]; if (t) { e.preventDefault(); if (tab === t) closeMenu(); else openMenu(t); }
    else if (e.code === 'Escape' && tab) closeMenu();
  };
  addEventListener('keydown', onKey, true);

  // ───── сохранения ─────
  const snap = () => snapshot({ progression: prog, inventory: inv, questLog: qlog, playTime, stats: { kills },
    player: { pos: [ow.player.pos.x, ow.player.pos.y, ow.player.pos.z], rotY: ow.player.yaw || 0, hp: st.hp, shield: st.shield, energy: st.energy },
    world: { time: ow.sky?.hour ?? 8, discovered: [...(ow.discovered || [])] } });
  const autosaver = createAutosaver(store, snap, { onSaved: (r) => say(`Автосохранение (${r})`, '#34e89e', 1200) });

  // ───── тик: свой таймер (работает и в XR, не трогает цикл main.js) ─────
  let lastT = performance.now(), poiT = 0, lastHitSeen = st.lastHit;
  function tick() {
    const now = performance.now(), dt = Math.min(0.25, (now - lastT) / 1000); lastT = now; playTime += dt;
    for (let i = vfx.length - 1; i >= 0; i--) if (!vfx[i](dt)) vfx.splice(i, 1);
    if ((poiT -= dt) <= 0) { poiT = 0.5; for (const id of ow.discovered || []) if (!seen.has(id)) { seen.add(id); const r = P.onPoiDiscovered(prog, id); say(`Открытие: +${r.xp} XP${r.sp ? ' · +1 ОН' : ''}${r.tp ? ' · +1 ОТ' : ''}`, '#7c5cff'); onLevelUps(r.ups); questProgress({ type: 'goto', poi: id });
      const pq = POIS.find((p) => p.id === id); if (pq?.type === 'hub' || pq?.stations?.includes('stn_campfire')) autosaver.trigger('hub'); } }
    const near = nearPoi(); if (near && QUESTS_STEP(qlog)?.poi === near.id) questProgress({ type: 'goto', poi: near.id });
    const inCombat = st.lastHit !== lastHitSeen; lastHitSeen = st.lastHit; autosaver.tick(dt, { inCombat });
    // HUD
    const hpK = st.hpMax ? st.hp / st.hpMax : 0; const hp = $('.hp'); hp.className = 'hp' + (hpK < 0.25 ? ' low' : hpK < 0.5 ? ' mid' : '');
    $('.hp i').style.width = `${Math.max(0, hpK * 100)}%`; $('.hpt').textContent = `${Math.ceil(st.hp)}/${st.hpMax}`; $('.lv').textContent = `Lv ${prog.level}`;
    $('.xp i').style.width = `${prog.level >= 30 ? 100 : (prog.xp / P.xpToNext(prog.level)) * 100}%`; $('.gold').textContent = `◈ ${inv.gold}  ·  ОН ${prog.sp}  ОХ ${prog.ap}  ОТ ${prog.tp}`;
    const q = P.questText(qlog); qt.innerHTML = `<b>${esc(q.title)}</b>${esc(q.step)}`;
  }
  const iv = setInterval(tick, 100);
  applyStats(); tick();
  const api = { get prog() { return prog; }, get inv() { return inv; }, get quests() { return qlog; }, store, openMenu, closeMenu, gainXp, snap, save: (s = 'slot1') => store.save(s, snap()), load: (s) => store.load(s).then((x) => x && loadFrom(x)),
    dispose() { clearInterval(iv); removeEventListener('keydown', onKey, true); mobs.onKill = origKill; [hud, qt, lvl, toast, menu, style].forEach((e) => e.remove()); } };
  ow.__progression = api; window.__OW_PROG = api; console.info(`[progression] installed store=${store.kind} L${prog.level}`);
  return api;
}
