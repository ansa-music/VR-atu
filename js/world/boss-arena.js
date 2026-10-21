// js/world/boss-arena.js — арены боссов (казахский орнамент, туманная стена как в SAO), телеграфы, модель босса, HUD и музыка боя.
// Quest: на арену ≤ ~14 draw calls; телеграфы — пул из 6 мешей; без теней и пост-обработки.
import * as THREE from 'three';
const ORN = await import('./kz-ornaments.js').catch(() => null);
const KM = await import('./kz-music.js').catch(() => null);

// палитра по этажам: [пол, кайма, туман]
const FLOOR_STYLE = {
  boss_slime_king: ['#6e8f4e', '#fec50c', '#9fe8a0'], boss_rotroot: ['#4d5b33', '#c8282d', '#a6ff7a'], boss_hydra_tinara: ['#3d5a55', '#1aa39a', '#8fffe0'],
  boss_ymir: ['#b9cfe0', '#1f5fae', '#d8f4ff'], boss_akhmaret: ['#d6b26b', '#1aa39a', '#ffd27a'], boss_ignarok: ['#2c2626', '#ff5a1f', '#ff9a5a'] };
const COVER = { boss_ymir: 'rock', boss_ignarok: 'obsidian', boss_akhmaret: 'obelisk', boss_hydra_tinara: 'island' };

export function bossTitle(id, KZ = {}) { const k = KZ.KZ_BOSSES?.[id]; return k ? `${k.nameKk} · ${k.nameRu}` : id; }

export function buildArena(THREE_, { id, center, y, radius: R, floor, kz, poiKz }) {
  const [cFloor, cTrim, cFog] = FLOOR_STYLE[id] || FLOOR_STYLE.boss_slime_king;
  const group = new THREE.Group(); group.name = 'arena_' + id; group.position.set(center.x, y, center.z);
  const basic = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });
  // пол-ковёр (сырмақ): кольцо орнамента по краю
  let ornTex = null; try { if (ORN?.drawMotif) { const mid = ORN.MOTIF_IDS.includes('qoshqar_muiiz') ? 'qoshqar_muiiz' : ORN.MOTIF_IDS[0]; ornTex = new THREE.CanvasTexture(ORN.toCanvas(ORN.drawMotif(mid, 128))); ornTex.colorSpace = THREE.SRGBColorSpace; ornTex.wrapS = ornTex.wrapT = THREE.RepeatWrapping; ornTex.repeat.set(24, 1); } } catch {}
  const floorM = new THREE.Mesh(new THREE.CircleGeometry(R, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: cFloor })); floorM.position.y = 0.06; group.add(floorM);
  const band = new THREE.Mesh(new THREE.RingGeometry(R - 2.2, R, 64, 1).rotateX(-Math.PI / 2), ornTex ? new THREE.MeshBasicMaterial({ map: ornTex, color: '#ffffff' }) : basic(cTrim)); band.position.y = 0.08; group.add(band);
  const inner = new THREE.Mesh(new THREE.RingGeometry(R * 0.32, R * 0.36, 48).rotateX(-Math.PI / 2), basic(cTrim)); inner.position.y = 0.09; group.add(inner);
  // балбал-столбы + 1 инстансированный набор (1 draw call)
  const N = 12, pillarGeo = new THREE.BoxGeometry(0.9, 3.4, 0.7); pillarGeo.translate(0, 1.7, 0);
  const pillars = new THREE.InstancedMesh(pillarGeo, new THREE.MeshLambertMaterial({ color: '#8d8578' }), N); const M4 = new THREE.Matrix4();
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; if (Math.abs(Math.sin(a / 2)) < 0.01) continue; M4.makeRotationY(-a).setPosition(Math.sin(a) * (R + 1), 0, Math.cos(a) * (R + 1)); pillars.setMatrixAt(i, M4); }
  group.add(pillars);
  // вход-шаңырақ (юг, +Z): арка с золотым кольцом
  const arch = new THREE.Group(); arch.position.set(0, 0, R + 0.5);
  for (const sx of [-2.4, 2.4]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5, 0.7), basic(cTrim)); c.position.set(sx, 2.5, 0); arch.add(c); }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.22, 6, 24), basic('#fec50c')); ring.position.y = 5; arch.add(ring); group.add(arch);
  // безопасная зона у входа (VR: без механик)
  const safe = new THREE.Mesh(new THREE.RingGeometry(1.6, 2, 24).rotateX(-Math.PI / 2), basic('#34e89e', { transparent: true, opacity: 0.5 })); safe.position.set(0, 0.1, R + 2.5); group.add(safe);
  // туманная стена (SAO): цилиндр без крышек, видна только в бою
  const fogMat = new THREE.MeshBasicMaterial({ color: cFog, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const fog = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 9, 48, 1, true), fogMat); fog.position.y = 4.5; fog.visible = false; group.add(fog);
  // табличка с названием этажа (canvas-текстура, kk + ru)
  try { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const g = cv.getContext('2d'); g.fillStyle = '#2a2324'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#fec50c'; g.lineWidth = 8; g.strokeRect(6, 6, 500, 116);
    g.fillStyle = '#fec50c'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.fillText(`${floor}-қабат · ${poiKz?.nameKk || ''}`, 256, 58); g.fillStyle = '#fff'; g.font = '26px sans-serif'; g.fillText(`Этаж ${floor} · ${kz?.nameRu || ''}`, 256, 100);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) })); sign.position.set(0, 6.4, R + 0.6); sign.rotation.y = 0; group.add(sign); } catch {}
  // укрытия (Сверхнова/лавина/затмение)
  const covers = []; const ck = COVER[id];
  if (ck) { for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i / 4) * Math.PI * 2, r = R * 0.6;
    const geo = ck === 'obelisk' ? new THREE.CylinderGeometry(0.5, 0.9, 6, 4) : ck === 'island' ? new THREE.CylinderGeometry(3, 3.4, 0.5, 10) : new THREE.CylinderGeometry(1.4, 1.8, ck === 'rock' ? 3 : 5, 6);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: ck === 'obsidian' ? '#1b1620' : ck === 'obelisk' ? '#c9a24a' : ck === 'island' ? '#5c6b3a' : '#8a8f98' }));
    m.position.set(Math.cos(a) * r, (geo.parameters.height || 1) / 2, Math.sin(a) * r); group.add(m); covers.push(m); } }
  // объекты фаз (якоря-корни, кристаллы, зеркала, баллисты) — пул из 4
  const objectives = []; for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), basic('#ff6aff')); const a = (i / 4) * Math.PI * 2 + 0.3;
    m.position.set(Math.cos(a) * R * 0.75, 1.6, Math.sin(a) * R * 0.75); m.visible = false; m.userData.r = 1.3; group.add(m); objectives.push(m); }
  // телеграфы: пул кругов (заливка растёт к удару) — красный = уходить
  const teles = []; for (let i = 0; i < 6; i++) { const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), basic('#ff2a3a', { transparent: true, opacity: 0.35, depthWrite: false }));
    const edge = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 32).rotateX(-Math.PI / 2), basic('#ffe14a', { transparent: true, opacity: 0.9, depthWrite: false })); fill.add(edge); fill.visible = false; scene0(fill); teles.push({ m: fill, t: 0, dur: 1, flash: 0 }); }
  function scene0(m) { m.userData.free = true; m.renderOrder = 2; }
  const enrageMat = basic('#ff3020', { transparent: true, opacity: 0, depthWrite: false }); const enrageDisk = new THREE.Mesh(new THREE.CircleGeometry(R, 32).rotateX(-Math.PI / 2), enrageMat); enrageDisk.position.y = 0.11; enrageDisk.visible = false; group.add(enrageDisk);
  let fogOn = false, fogA = 0, worldTeles = null;
  const api = { group, objectives, covers,
    setFog(on) { fogOn = on; fog.visible = true; },
    setEnrage(on) { enrageDisk.visible = on; enrageMat.opacity = on ? 0.18 : 0; },
    setPhase(p) { inner.material.color.set(p >= 2 ? '#ff5a1f' : p === 1 ? '#fec50c' : cTrim); },
    setObjectives(list) { objectives.forEach((m, i) => { const o = list[i]; m.visible = !!o && o.hp > 0; if (o) m.material.color.set(o.kind === 'crystal' ? '#7fd8ff' : o.kind === 'anchor' ? '#7a5a2a' : o.kind === 'ballista' ? '#c0c0c0' : '#ffd27a'); }); },
    inCover(p, from) { // за укрытием относительно босса
      for (const c of covers) { const cx = group.position.x + c.position.x, cz = group.position.z + c.position.z; const ax = p.x - from.x, az = p.z - from.z, L = Math.hypot(ax, az) || 1;
        const t = ((cx - from.x) * ax + (cz - from.z) * az) / L; if (t < 0 || t > L) continue; const px = from.x + ax / L * t, pz = from.z + az / L * t; if (Math.hypot(px - cx, pz - cz) < 2) return true; }
      return false; },
    telegraph(atk, at, tele, r, hAt) { const T = teles.find((x) => x.m.visible === false) || teles[0]; if (!worldTeles) { worldTeles = true; for (const x of teles) group.parent?.add(x.m); }
      T.m.position.set(at.x, hAt(at.x, at.z) + 0.15, at.z); T.r = r; T.t = 0; T.dur = Math.max(0.3, tele); T.flash = 0; T.m.visible = true; T.m.scale.setScalar(0.01); },
    flashStrike(at) { const T = teles.reduce((b, x) => (x.m.visible && (!b || Math.hypot(x.m.position.x - at.x, x.m.position.z - at.z) < Math.hypot(b.m.position.x - at.x, b.m.position.z - at.z)) ? x : b), null); if (T) { T.flash = 0.18; T.t = T.dur; } },
    clearTelegraphs() { for (const x of teles) x.m.visible = false; },
    update(dt, { active, near, t }) {
      group.visible = near || active; fogA += ((fogOn && active ? 0.42 : 0) - fogA) * Math.min(1, dt * 3); fogMat.opacity = fogA * (0.85 + 0.15 * Math.sin(t * 2)); fog.visible = fogA > 0.01;
      if (ornTex) ornTex.offset.x = (t * 0.02) % 1;
      for (const x of teles) { if (!x.m.visible) continue; if (x.flash > 0) { x.flash -= dt; x.m.material.opacity = 0.8; x.m.scale.setScalar(x.r); if (x.flash <= 0) x.m.visible = false; continue; }
        x.t += dt; const k = Math.min(1, x.t / x.dur); x.m.scale.setScalar(Math.max(0.01, x.r * k)); x.m.children[0].scale.setScalar(1); x.m.material.opacity = 0.25 + 0.3 * k; if (x.t > x.dur + 0.6) x.m.visible = false; }
      for (const m of objectives) if (m.visible) m.rotation.y += dt * 1.5;
    } };
  return api;
}

/** Модель босса: процедурная (часть C) или запасной toon-примитив. Возвращает высоты сфер попадания (тело/слабое место). */
export function buildBossView(THREE_, PM, id, def) {
  const group = new THREE.Group(); let model = null;
  try { model = PM?.createModel?.(THREE, id); } catch {}
  if (model) { const box = new THREE.Box3().setFromObject(model), h = Math.max(0.5, box.max.y - box.min.y), want = { boss_slime_king: 5, boss_rotroot: 9, boss_hydra_tinara: 7, boss_ymir: 10, boss_akhmaret: 7, boss_ignarok: 8 }[id] || 6;
    model.scale.setScalar(want / h); group.add(model); }
  else { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(3, 1), new THREE.MeshLambertMaterial({ color: '#7a3' })); m.position.y = 3; group.add(m); }
  const H = new THREE.Box3().setFromObject(group), height = H.max.y - H.min.y, wide = Math.max(H.max.x - H.min.x, H.max.z - H.min.z);
  const weak = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.85 })); weak.position.y = height * 0.55; weak.position.z = wide * 0.3; group.add(weak);
  return { group, model, weak, bodyY: height * 0.45, bodyR: Math.max(1.5, Math.min(height, wide) * 0.45), weakY: height * 0.55, weakR: Math.max(0.8, height * 0.1),
    animate(clip, t) { try { if (model && PM?.animate) PM.animate(model, clip, t, clip === 'stagger' ? 0.4 : 1); } catch {} weak.material.opacity = 0.5 + 0.4 * Math.sin(t * 6); } };
}

/** Большая полоса HP вверху экрана: имя kk крупно + ru, засечки фаз, полоса оглушения, таймер ярости, щит. */
export function createBossHud(doc, KZ = {}) {
  const el = doc.createElement('div'); el.id = 'ow-boss-hud';
  el.style.cssText = 'position:fixed;top:44px;left:50%;transform:translateX(-50%);width:min(760px,86vw);z-index:45;pointer-events:none;font:600 14px system-ui;color:#fff;text-shadow:0 1px 3px #000;display:none';
  let frame = ''; try { frame = ORN?.frameCss?.({ band: 12 }) || ''; } catch {}
  el.innerHTML = `<div class="bh-box" style="padding:8px 12px;background:rgba(42,35,36,.78);${frame}"><div style="display:flex;justify-content:space-between;align-items:baseline"><span class="bh-kk" style="font-size:22px;color:#fec50c"></span><span class="bh-floor" style="opacity:.8"></span></div>
<div class="bh-ru" style="opacity:.85;margin-bottom:4px"></div><div class="bh-bar" style="position:relative;height:16px;background:#311;border:1px solid #fec50c"><i style="position:absolute;inset:0;width:100%;background:linear-gradient(90deg,#c8282d,#ff6a3a)"></i><s style="position:absolute;inset:0;width:0;background:rgba(127,216,255,.6)"></s></div>
<div class="bh-st" style="height:5px;margin-top:3px;background:#222"><i style="display:block;height:100%;width:0;background:#ffe14a"></i></div><div class="bh-info" style="margin-top:3px;display:flex;justify-content:space-between;font-size:12px"><span class="bh-phase"></span><span class="bh-enr"></span></div></div>
<div class="bh-win" style="display:none;margin-top:10px;text-align:center;font-size:20px;color:#fec50c;background:rgba(0,0,0,.6);padding:10px"></div>`;
  (doc.getElementById('ow-root') || doc.body).appendChild(el); const q = (s) => el.querySelector(s); let ticks = null, cur = null, winT = 0;
  return {
    show(id, f, floor) { el.style.display = 'block'; q('.bh-box').style.display = 'block';
      if (cur !== id) { cur = id; const k = KZ.KZ_BOSSES?.[id]; q('.bh-kk').textContent = k?.nameKk || f.def.name; q('.bh-ru').textContent = k ? `${k.nameRu} — ${f.def.name}` : ''; q('.bh-floor').textContent = `${floor}-қабат · этаж ${floor} · ур. ${f.def.lvl}`;
        ticks?.forEach((t) => t.remove()); ticks = f.def.phases.slice(1).map((p) => { const t = doc.createElement('b'); t.style.cssText = `position:absolute;top:-3px;bottom:-3px;width:2px;background:#fec50c;left:${p.from * 100}%`; q('.bh-bar').appendChild(t); return t; }); }
      q('.bh-bar i').style.width = (100 * f.frac).toFixed(1) + '%'; q('.bh-bar s').style.width = f.shield ? Math.min(100, f.shield / 30) + '%' : '0';
      q('.bh-st i').style.width = (100 * Math.min(1, f.stagger / f.def.stagger.bar)).toFixed(0) + '%'; q('.bh-st i').style.background = f.state === 'staggered' ? '#7fd8ff' : '#ffe14a';
      q('.bh-phase').textContent = `${f.def.phases[f.phase].name}${f.state === 'staggered' ? ' · ОГЛУШЁН — бей в слабое место!' : ''}${f.cast ? ' · ⚠ ' + f.cast.atk.name : ''}`;
      const left = Math.max(0, f.def.enrage.time - f.fightT); q('.bh-enr').textContent = f.enraged ? 'ЯРОСТЬ ×1,5' : `ярость через ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
      if (winT && performance.now() > winT) { q('.bh-win').style.display = 'none'; winT = 0; } },
    hide() { if (winT && performance.now() < winT) { q('.bh-box').style.display = 'none'; return; } el.style.display = 'none'; cur = null; },
    phase(name, mech) { q('.bh-phase').textContent = name; },
    flashStagger() { q('.bh-st').animate?.([{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], 400); },
    victory(id, rw, gate) { const k = KZ.KZ_BOSSES?.[id]; el.style.display = 'block'; q('.bh-box').style.display = 'none'; const w = q('.bh-win'); w.style.display = 'block';
      w.innerHTML = `Жеңіс! · Победа над «${k?.nameKk || id}»<br><small style="color:#fff">+${rw.xp} XP · +${rw.skillPoints} очк. навыков${rw.legendaryUnlocks.length ? ' · легендарка: ' + rw.legendaryUnlocks.join(', ') : ''}<br>${gate}</small>`; winT = performance.now() + 7000; },
    el };
}

/** Боевая музыка: kz-music (күй биома, интенсивность ↑). AudioContext — лениво, по первому жесту/бою. */
export function createBossMusic() {
  let ctx = null, m = null, biome = null;
  return {
    play(b, intensity) { try { if (!KM?.createKzMusic) return; if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      if (ctx.state === 'suspended') ctx.resume?.().catch(() => {});
      if (!m || biome !== b) { m?.stop(); m = KM.createKzMusic(ctx, { biome: b, volume: 0.35 }); biome = b; m.start(); } m.setIntensity(intensity); } catch {} },
    stop() { if (m) { try { m.stop(); } catch {} m = null; biome = null; } } };
}
