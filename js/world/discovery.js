// js/world/discovery.js — J: открытие локаций (тост kk+ru), туман войны карты, мини-карта и карта мира, телепорт между святилищами/башнями.
// Логика (FogGrid, newlyDiscovered, travelTargets, canTravel) — чистая и тестируется в node; UI создаётся только в браузере.
import { WORLD_CONFIG, BIOMES, POIS } from '../../shared/defs/index.js';
import { KZ_POIS, KZ_BIOMES } from '../../shared/defs/theme_kz.js';

const W = WORLD_CONFIG;
export const TRAVEL_TYPES = Object.freeze(['hub', 'shrine', 'tower']);
export const DISCOVER = Object.freeze({ minR: 22, padR: 6, walkRevealM: 70 });
const POI_ICON = { hub: '⌂', tower: '▲', shrine: '✦', dungeon: '☗', arena: '☠', camp: '⚑', cave: '◒', puzzle: '?', ruin: '▦', viewpoint: '◉', treasure: '◆' };

export function poiLabel(id) {
  const p = POIS.find((q) => q.id === id), k = KZ_POIS[id];
  return { kk: k?.nameKk || p?.name || id, ru: p?.name || k?.nameRu || id, type: p?.type };
}
export function biomeLabel(b) { return { kk: KZ_BIOMES[b]?.nameKk || BIOMES[b]?.name || b, ru: BIOMES[b]?.name || b }; }

/** Туман войны 96×96 (клетка 16 м). Сериализуется в hex-строку для сейва. */
export class FogGrid {
  constructor(n = W.fogOfWarGrid || 96, size = W.size) { this.n = n; this.cell = size / n; this.bits = new Uint8Array(n * n); this.count = 0; }
  reveal(x, z, r) {
    const n = this.n, c = this.cell, i0 = Math.max(0, Math.floor((x - r) / c)), i1 = Math.min(n - 1, Math.floor((x + r) / c)), j0 = Math.max(0, Math.floor((z - r) / c)), j1 = Math.min(n - 1, Math.floor((z + r) / c));
    let added = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * n + i; if (this.bits[k]) continue; if (Math.hypot((i + 0.5) * c - x, (j + 0.5) * c - z) <= r) { this.bits[k] = 1; added++; } }
    this.count += added; return added;
  }
  isRevealed(x, z) { const i = Math.floor(x / this.cell), j = Math.floor(z / this.cell); return i >= 0 && j >= 0 && i < this.n && j < this.n && !!this.bits[j * this.n + i]; }
  get ratio() { return this.count / this.bits.length; }
  toString() { let s = ''; for (let k = 0; k < this.bits.length; k += 4) s += ((this.bits[k] << 3) | (this.bits[k + 1] << 2) | (this.bits[k + 2] << 1) | this.bits[k + 3]).toString(16); return s; }
  load(s) { if (!s || s.length * 4 !== this.bits.length) return false; this.count = 0; for (let q = 0; q < s.length; q++) { const v = parseInt(s[q], 16); for (let b = 0; b < 4; b++) { const bit = (v >> (3 - b)) & 1; this.bits[q * 4 + b] = bit; this.count += bit; } } return true; }
}

/** Какие POI открылись в точке (x,z): радиус max(22, r+6). */
export function newlyDiscovered(x, z, known) {
  const out = [];
  for (const p of POIS) { if (known.has(p.id)) continue; if (Math.hypot(p.pos[0] - x, p.pos[1] - z) < Math.max(DISCOVER.minR, (p.r || 0) + DISCOVER.padR)) out.push(p); }
  return out;
}
export const isTravelPoint = (p) => !!p && (p.fastTravel || TRAVEL_TYPES.includes(p.type));
export function travelTargets(discovered, floorOk = () => true) { return POIS.filter((p) => discovered.has(p.id) && isTravelPoint(p) && floorOk(p.biome)); }
/** Телепорт запрещён рядом с агрессивными мобами (fastTravel.noEnemiesRadius = 30 м). */
export function canTravel(mobsList, px, pz, R = W.fastTravel.noEnemiesRadius) {
  for (const m of mobsList || []) { if (m.state === 'dead' || m.state === 'idle' || m.state === 'return') continue; const p = m.g?.position || m; if (Math.hypot(p.x - px, p.z - pz) < R) return false; }
  return true;
}

// ---------------- UI (браузер) ----------------
const CSS = `
#ow-zone-toast{position:fixed;left:50%;top:16%;transform:translateX(-50%);z-index:45;pointer-events:none;text-align:center;font-family:system-ui,sans-serif;opacity:0;transition:opacity .4s}
#ow-zone-toast .kk{font-size:30px;font-weight:800;letter-spacing:.06em;color:#fff;text-shadow:0 0 12px #3ec5ff,0 2px 0 #0a3a5a}
#ow-zone-toast .ru{font-size:15px;color:#d6f4ff;margin-top:2px}
#ow-zone-toast .tag{display:inline-block;font-size:11px;letter-spacing:.3em;color:#ffd166;border-top:1px solid #ffd16688;border-bottom:1px solid #ffd16688;padding:2px 12px;margin-bottom:6px}
#ow-minimap{position:fixed;right:14px;top:14px;width:156px;height:156px;z-index:41;border-radius:50%;border:3px solid #e9c46a;box-shadow:0 0 0 2px #0a3a5a,0 4px 14px #0008;overflow:hidden;pointer-events:none;background:#0b1a26}
#ow-minimap canvas{width:100%;height:100%;image-rendering:pixelated}
#ow-minimap .fl{position:absolute;left:0;right:0;bottom:6px;text-align:center;font:700 10px system-ui;color:#fff;text-shadow:0 1px 2px #000}
#ow-zone-hz{position:fixed;right:14px;top:178px;width:156px;z-index:41;font:600 11px system-ui;color:#fff;pointer-events:none;display:none}
#ow-zone-hz .bar{height:7px;border-radius:4px;background:#0006;overflow:hidden;margin-top:3px}#ow-zone-hz .bar i{display:block;height:100%;width:0}
#ow-worldmap{position:fixed;inset:0;z-index:60;display:none;background:#04101acc;font-family:system-ui,sans-serif;color:#fff;align-items:center;justify-content:center;gap:18px}
#ow-worldmap canvas{width:min(78vh,62vw);height:min(78vh,62vw);border:3px solid #e9c46a;border-radius:10px;image-rendering:pixelated}
#ow-worldmap .side{width:260px;max-height:78vh;overflow:auto}#ow-worldmap h3{margin:4px 0 8px;color:#ffd166;font-size:15px}
#ow-worldmap button{display:block;width:100%;text-align:left;margin:3px 0;padding:6px 8px;border-radius:6px;border:1px solid #3ec5ff66;background:#0a2a40;color:#fff;font-size:12px;cursor:pointer}
#ow-worldmap button:hover{background:#13527a}#ow-worldmap .fl{font-size:12px;margin:2px 0;opacity:.9}`;

export class MapUI {
  /** fns: { heightAt, biomeAt } — сэмплеры рельефа; state: { fog, discovered, floorOf(biome), floorUnlocked[] , gates[] } */
  constructor(fns, state, { onTravel } = {}) {
    this.fns = fns; this.s = state; this.onTravel = onTravel; this.N = state.fog.n; this.row = 0;
    this.base = new Uint8ClampedArray(this.N * this.N * 4);
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.toastEl = el('div', 'ow-zone-toast'); this.toastEl.innerHTML = '<div class="tag"></div><div class="kk"></div><div class="ru"></div>';
    this.mini = el('div', 'ow-minimap'); this.mc = document.createElement('canvas'); this.mc.width = this.mc.height = 128; this.mini.append(this.mc); this.flEl = document.createElement('div'); this.flEl.className = 'fl'; this.mini.append(this.flEl);
    this.hz = el('div', 'ow-zone-hz'); this.hz.innerHTML = '<span></span><div class="bar"><i></i></div>';
    this.wm = el('div', 'ow-worldmap'); this.wc = document.createElement('canvas'); this.wc.width = this.wc.height = 384; this.side = document.createElement('div'); this.side.className = 'side'; this.wm.append(this.wc, this.side);
    this.wm.addEventListener('click', (e) => { const b = e.target.closest('button[data-poi]'); if (b) { this.onTravel?.(b.dataset.poi); } });
    this.img = new ImageData(this.N, this.N); this.off = document.createElement('canvas'); this.off.width = this.off.height = this.N;
  }
  /** Фон карты строится по строке за кадр (96 кадров) — без фриза на Quest. */
  bakeStep(rows = 2) {
    const N = this.N, c = W.size / N;
    for (let r = 0; r < rows && this.row < N; r++, this.row++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * c, z = (this.row + 0.5) * c, b = this.fns.biomeAt(x, z) || 'b_meadow', h = this.fns.heightAt(x, z), k = (this.row * N + i) * 4;
      let col = hex(BIOMES[b]?.palette?.ground || '#7ED957');
      if (h < W.seaLevel + 0.2) col = hex(BIOMES[b]?.palette?.water || '#5EC8F2');
      else { const sh = 0.75 + Math.min(0.45, h / 260); col = col.map((v) => v * sh); if (b === 'b_mountains' && h > 115) col = [240, 248, 255]; if (b === 'b_volcano' && this.s.lavaAt?.(x, z, h)) col = [255, 110, 30]; }
      this.base.set([col[0], col[1], col[2], 255], k);
    }
    return this.row >= N;
  }
  _compose() {
    const N = this.N, d = this.img.data, f = this.s.fog.bits;
    for (let k = 0; k < N * N; k++) { const o = k * 4; if (f[k]) { d[o] = this.base[o]; d[o + 1] = this.base[o + 1]; d[o + 2] = this.base[o + 2]; } else { d[o] = 18; d[o + 1] = 30; d[o + 2] = 44; } d[o + 3] = 255; }
    this.off.getContext('2d').putImageData(this.img, 0, 0);
  }
  _marks(ctx, S, x0, z0, scale, player) {
    const P = (x, z) => [(x - x0) * scale, (z - z0) * scale];
    for (const g of this.s.gates || []) { const [u, v] = P(g.x, g.z); ctx.fillStyle = g.open ? '#34e89e' : '#ff4d6d'; ctx.fillRect(u - 3, v - 3, 6, 6); }
    ctx.font = `${Math.max(9, 11 * S / 128)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of POIS) { if (!this.s.discovered.has(p.id)) continue; const [u, v] = P(p.pos[0], p.pos[1]); if (u < -8 || v < -8 || u > S + 8 || v > S + 8) continue; ctx.fillStyle = isTravelPoint(p) ? '#ffd166' : '#fff'; ctx.fillText(POI_ICON[p.type] || '•', u, v); }
    const [u, v] = P(player.x, player.z); ctx.save(); ctx.translate(u, v); ctx.rotate(-player.yaw); ctx.fillStyle = '#3ec5ff'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  drawMini(player, floorText) {
    this._compose(); const ctx = this.mc.getContext('2d'), S = 128, span = 320, x0 = player.x - span / 2, z0 = player.z - span / 2, sc = S / span;
    ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#122030'; ctx.fillRect(0, 0, S, S);
    ctx.drawImage(this.off, x0 / W.size * this.N, z0 / W.size * this.N, span / W.size * this.N, span / W.size * this.N, 0, 0, S, S);
    this._marks(ctx, S, x0, z0, sc, player); this.flEl.textContent = floorText;
  }
  drawWorld(player, open, list) {
    this.wm.style.display = open ? 'flex' : 'none'; if (!open) return;
    this._compose(); const ctx = this.wc.getContext('2d'), S = 384; ctx.imageSmoothingEnabled = false; ctx.drawImage(this.off, 0, 0, S, S); this._marks(ctx, S, 0, 0, S / W.size, player);
    const key = list.map((t) => t.id).join() + '|' + this.s.floorUnlocked.join();
    if (key !== this._sideKey) { this._sideKey = key;
      this.side.innerHTML = `<h3>Қабаттар · Этажи</h3>${this.s.floors.map((f) => `<div class="fl">${this.s.floorUnlocked[f.n] ? '🔓' : '🔒'} ${f.n}-қабат · ${biomeLabel(f.biome).kk} <small>(${biomeLabel(f.biome).ru})</small></div>`).join('')}
        <h3 style="margin-top:12px">Жылдам сапар · Телепорт</h3>${list.length ? list.map((p) => { const l = poiLabel(p.id); return `<button data-poi="${p.id}">${POI_ICON[p.type] || '•'} ${l.kk}<br><small>${l.ru}</small></button>`; }).join('') : '<small>Открой святилище или башню</small>'}
        <p style="font-size:11px;opacity:.7">Tab — закрыть. Телепорт недоступен в бою.</p>`; }
  }
  toast(tag, kk, ru, ms = 3200) { const t = this.toastEl; t.children[0].textContent = tag; t.children[1].textContent = kk; t.children[2].textContent = ru; t.style.opacity = 1; clearTimeout(this._tt); this._tt = setTimeout(() => (t.style.opacity = 0), ms); }
  hazard(kind, meter, immune) {
    if (!kind && meter <= 0) { this.hz.style.display = 'none'; return; }
    const L = { poison: ['☣ Яд топи', '#7CFF4F'], cold: ['❄ Холод', '#9FE8FF'], heat: ['🔥 Жар лавы', '#FF6A1A'], heat_sun: ['☀ Зной', '#FFD166'] }[kind] || ['…', '#fff'];
    this.hz.style.display = 'block'; this.hz.children[0].textContent = L[0] + (immune ? ' (защита)' : '') + (meter >= 100 ? ' — урон!' : '');
    const i = this.hz.querySelector('i'); i.style.width = Math.min(100, meter) + '%'; i.style.background = L[1];
  }
}
function el(tag, id) { const e = document.createElement(tag); e.id = id; (document.getElementById('ow-root') || document.body).appendChild(e); return e; } // внутри #ow-root: main.js прячет прочие дети body
function hex(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
