// Адаптер существующего мира к меню M. Не зависит от Three.js и рантайма E.
import { BIOMES } from '../../shared/defs/world.js';
import { MOBS, BOSSES } from '../../shared/defs/enemies.js';
const { maxHp, createProgression } = await import('./progression.js' + new URL(import.meta.url).search);
import { POIS } from '../../shared/defs/pois.js';
import { KZ_BOSSES } from '../../shared/defs/theme_kz.js';

export const CREATURE_MOBS = Object.freeze(Object.fromEntries(Object.entries({
  b_meadow: ['m_meadow_slime', 'm_gold_fairy', 'm_goblin_slinger', 'm_tusk_boar', 'm_wisp'],
  b_forest: ['m_forest_wolf', 'm_gold_fairy', 'm_forest_bandit', 'm_thorn_treant', 'm_ghost_owl'],
  b_swamp: ['m_bog_drowner', 'm_gold_fairy', 'm_bog_hag', 'm_mire_croc', 'm_mosquito_cloud'],
  b_mountains: ['m_ice_wraith', 'm_gold_fairy', 'm_kobold_icecaller', 'm_yeti', 'm_harpy'],
  b_desert_ruins: ['m_scarab_swarm', 'm_gold_fairy', 'm_cursed_skull', 'm_stone_guardian', 'm_flying_eye'],
  b_volcano: ['m_magma_imp', 'm_gold_fairy', 'm_obsidian_priest', 'm_lava_golem', 'm_ash_wyvern'],
}).map(([b, ids]) => [b, Object.freeze({ ...Object.fromEntries(['wisp', 'fairy', 'skull', 'guardian', 'eye'].map((t, i) => [t, ids[i]])), boss: BIOMES[b].boss })])));

export function canonicalMob(type, biome = 'b_meadow') {
  const id = CREATURE_MOBS[biome]?.[type];
  if (!id) return null;
  const def = MOBS[id] || BOSSES[id];
  return { id, def, name: KZ_BOSSES[id]?.nameKk || def.name, lvl: Array.isArray(def.lvl) ? def.lvl[0] : def.lvl || 1 };
}

// Та же дуга лавок, что в settlements.layoutPoi: r=12.5 у южных ворот.
const hub = POIS.find(p => p.id === 'poi_hub_dawnford');
export const MARKET = Object.freeze({ x: hub.pos[0], z: hub.pos[1] + 12.5, r: 16 });
export const nearMarket = p => Math.hypot(p.x - MARKET.x, p.z - MARKET.z) <= MARKET.r;
const bossSites = Object.values(BIOMES).map(b => {
  const def = BOSSES[b.boss], poi = POIS.find(p => p.id === def.arena.poi);
  return { biome: def.biome, pos: poi.pos, r: def.arena.radius + 12 };
});
export const bossBiomeAt = p => bossSites.find(s => Math.hypot(p.x - s.pos[0], p.z - s.pos[1]) <= s.r)?.biome || null;

export async function createProgressionBridge({ world, headPos, moveTo, scene, renderer, notify = () => {}, installMenus, saveBackend }) {
  if (typeof document !== 'undefined' && !document.getElementById('ow-hud')) {
    const mount = document.createElement('div'); mount.id = 'ow-hud'; document.body.appendChild(mount);
  }
  const state = { hp: maxHp(createProgression()), hpMax: maxHp(createProgression()), gold: 0, level: 1, lastHit: 0 };
  const player = { pos: headPos, enabled: true, get xr() { return !!renderer?.xr?.isPresenting; } };
  const ow = { state, player, scene, renderer, discovered: new Set(), mobs: {},
    tp(x, z) { moveTo(x, world.heightAt(x, z), z); },
    sky: { get hour() { return world.hour; } },
    setTime: h => world.setTime?.(h), nearMarket: () => nearMarket(headPos), notify,
    levelUp(level) { notify(`НОВЫЙ УРОВЕНЬ ${level}!`, '#ffd23f'); world.particles?.burst(world.vfx?.arcane?.hit, headPos, null); },
  };
  const install = installMenus || (await import('./menus.js' + new URL(import.meta.url).search)).install;
  const api = await install(ow, { externalTick: true, saveBackend });
  let poiTime = 0, uiTime = 0;
  return {
    ow, api, state, player,
    bossBiome: () => bossBiomeAt(headPos),
    bossTitle: biome => KZ_BOSSES[BIOMES[biome].boss]?.nameKk || BOSSES[BIOMES[biome].boss].name,
    bindEnemy(e, biome = world.biome) { if (e) { e.worldMob = canonicalMob(e.type, biome); e.progressionPaid = false; } return e; },
    killed(e) { if (!e || e.progressionPaid || !e.worldMob) return false; e.progressionPaid = true; ow.mobs.onKill?.(e.worldMob); return true; },
    update(dt) {
      if ((poiTime -= dt) <= 0) { poiTime = 0.25;
        for (const p of POIS) if (Math.hypot(p.pos[0] - headPos.x, p.pos[1] - headPos.z) <= Math.max(18, p.r)) ow.discovered.add(p.id);
      }
      uiTime += dt;
      if (uiTime >= 0.1) { api.tick?.(uiTime); uiTime = 0; }
    },
    get debug() { return { level: api.prog.level, xp: api.prog.xp, gold: api.inv.gold, items: api.inv.toJSON(), activeQuest: api.quests.active, step: api.quests.step, counters: { ...api.quests.counters }, hp: state.hp, hpMax: state.hpMax, discovered: [...ow.discovered] }; },
  };
}
