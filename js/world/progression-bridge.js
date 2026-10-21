// Связка существующего ?mode=world с прогрессией среза E, без второго рантайма.
import { BIOMES } from '../../shared/defs/world.js';
import { MOBS, BOSSES } from '../../shared/defs/enemies.js';
import { POIS } from '../../shared/defs/pois.js';
import { questText, xpToNext } from './progression.js';
import { install } from './menus.js';

// В каждой строке только ID из канонического списка мобов биома.
export const CREATURE_MOBS = Object.freeze({
  b_meadow: { wisp: 'm_meadow_slime', fairy: 'm_gold_fairy', skull: 'm_wisp', guardian: 'm_tusk_boar', eye: 'm_goblin_slinger' },
  b_forest: { wisp: 'm_ghost_owl', fairy: 'm_gold_fairy', skull: 'm_weaver_spider', guardian: 'm_thorn_treant', eye: 'm_forest_bandit' },
  b_swamp: { wisp: 'm_mosquito_cloud', fairy: 'm_gold_fairy', skull: 'm_bog_hag', guardian: 'm_mire_croc', eye: 'm_spitter_toad' },
  b_mountains: { wisp: 'm_ice_wraith', fairy: 'm_gold_fairy', skull: 'm_kobold_icecaller', guardian: 'm_yeti', eye: 'm_harpy' },
  b_desert_ruins: { wisp: 'm_scarab_swarm', fairy: 'm_gold_fairy', skull: 'm_cursed_skull', guardian: 'm_stone_guardian', eye: 'm_flying_eye' },
  b_volcano: { wisp: 'm_magma_imp', fairy: 'm_gold_fairy', skull: 'm_obsidian_priest', guardian: 'm_lava_golem', eye: 'm_ash_wyvern', boss: 'boss_ignarok' },
});
export function canonicalMob(type, biome = 'b_meadow') {
  if (type === 'boss') return biome === 'b_volcano' ? 'boss_ignarok' : BIOMES[biome]?.boss || 'boss_slime_king';
  const id = (CREATURE_MOBS[biome] || CREATURE_MOBS.b_meadow)[type];
  return id && BIOMES[biome]?.mobs.includes(id) ? id : 'm_meadow_slime';
}
export function mobForEvent(type, biome, level = 1) {
  const id = canonicalMob(type, biome);
  const def = MOBS[id] || BOSSES[id];
  return { id, def, lvl: Array.isArray(def?.lvl) ? Math.max(def.lvl[0], Math.min(def.lvl[1], level)) : def?.lvl || level };
}

/** Адресация ссылки на позицию, хп и контроллеры реального мира. */
export async function installProgressionBridge(ctx) {
  const discovered = new Set();
  const state = { hpMax: 150, gold: 0, level: 1, shield: 0, shieldMax: 75, lastHit: 0 };
  Object.defineProperty(state, 'hp', {
    get: () => ctx.getHp(), set: (v) => ctx.setHp(v), enumerable: true,
  });
  const ow = {
    state, discovered, scene: ctx.scene, renderer: ctx.renderer,
    sky: ctx.world.sky || {},
    player: { get pos() { return ctx.headPos; }, enabled: true, touch: false, get xr() { return ctx.renderer.xr.isPresenting; } },
    tp(x, z) { ctx.teleport(x, ctx.world.heightAt(x, z), z); },
    mobs: { onKill: null, onLoot: null },
  };
  if (!document.getElementById('ow-hud')) {
    const mount = document.createElement('div');
    mount.id = 'ow-hud'; document.body.appendChild(mount);
  }
  const api = await install(ow);
  if (!api) return null;
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const c = canvas.getContext('2d');
  const texture = new ctx.THREE.CanvasTexture(canvas);
  const panel = new ctx.THREE.Mesh(new ctx.THREE.PlaneGeometry(0.50, 0.25), new ctx.THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false }));
  panel.position.set(0.38, -0.17, -0.85);
  panel.visible = false; panel.renderOrder = 999; ctx.camera.add(panel);
  let uiTime = 0, poiTime = 0, lastNear = '';
  function draw() {
    if (!c) return;
    const p = api.prog, q = questText(api.quests);
    c.clearRect(0, 0, 512, 256); c.fillStyle = 'rgba(8,18,39,.90)'; c.fillRect(0, 0, 512, 256);
    c.strokeStyle = '#3ec5ff'; c.lineWidth = 4; c.strokeRect(2, 2, 508, 252);
    c.fillStyle = '#ffd23f'; c.font = 'bold 36px sans-serif'; c.fillText('УРОВЕНЬ ' + p.level, 20, 45);
    c.fillStyle = '#ffffff'; c.font = '26px sans-serif'; c.fillText('HP ' + Math.ceil(state.hp) + '/' + state.hpMax + '   ◈ ' + api.inv.gold, 20, 94);
    c.fillStyle = '#28314d'; c.fillRect(20, 109, 472, 18);
    c.fillStyle = '#886cff'; c.fillRect(20, 109, 472 * (p.level >= 30 ? 1 : p.xp / xpToNext(p.level)), 18);
    c.fillStyle = '#ffd23f'; c.font = 'bold 24px sans-serif'; c.fillText(q.title.slice(0, 31), 20, 170);
    c.fillStyle = '#eafaff'; c.font = '22px sans-serif'; c.fillText(q.step.slice(0, 38), 20, 205);
    texture.needsUpdate = true;
  }
  draw();
  return {
    api, ow,
    onKilled(type, biome) { ow.mobs.onKill?.(mobForEvent(type, biome, api.prog.level)); },
    tick(dt) {
      state.lastHit = ctx.getLastHit();
      const xr = ctx.renderer.xr.isPresenting;
      if (panel.visible !== xr) panel.visible = xr;
      uiTime += dt; if (uiTime >= 0.25) { uiTime = 0; if (xr) draw(); }
      poiTime += dt; if (poiTime < 0.25) return;
      poiTime = 0;
      const pos = ctx.headPos;
      let nearest = '';
      for (const poi of POIS) {
        const d2 = (poi.pos[0] - pos.x) ** 2 + (poi.pos[1] - pos.z) ** 2;
        if (d2 <= Math.max(20, poi.r) ** 2) {
          if (!discovered.has(poi.id)) discovered.add(poi.id);
          if (!nearest) nearest = poi.id;
        }
      }
      if (nearest !== lastNear) { lastNear = nearest; if (nearest) ctx.onPoi?.(nearest); }
    },
    get debug() { const p = api.prog, q = questText(api.quests); return { level: p.level, xp: p.xp, gold: api.inv.gold, items: { ...api.inv.stacks }, quest: api.quests.active, step: api.quests.step, stepText: q.step }; },
    giveXp(n) { api.gainXp(Math.max(0, Number(n) || 0), 'отладка'); },
  };
}
