// js/world/enemy-adapter.js — существа «Арены магов» (js/fantasy/enemies.js) в виде «мобов» для модулей
// дизайн-документа (заклинания spell-runtime.js, мечи melee.js), которые писались под рантайм раздела E.
// Урон канона (снаряд ≈ 38 по мобу 240 HP) пересчитывается под здоровье существ арены (1–3 HP, колосс 60).
const DMG_SCALE = 1 / 25;
const ONE = { x: 1, y: 1, z: 1 };

/** deps: { enemies, raycastEnemies(ro, rd, range) → { object, instanceId, point, distance } | null, scoreEnemy(r, point) } */
export function createMobAdapter({ enemies, raycastEnemies, scoreEnemy }) {
  const wrap = (e) => ({
    e, state: e.alive ? 'alive' : 'dead', elite: false, def: { boss: e.type === 'boss' },
    g: { position: e.pos, scale: ONE },
    hit: { body: [Math.max(0.2, e.center.y - e.pos.y), e.def?.radius || 0.5] },
  });
  return {
    get list() { return (enemies?.active || []).filter((e) => e.alive).map(wrap); },
    raycast(ro, rd, range) {
      const h = raycastEnemies(ro, rd, range);
      if (!h) return null;
      const near = (enemies?.active || []).filter((e) => e.alive).sort((a, b) => a.center.distanceToSquared(h.point) - b.center.distanceToSquared(h.point))[0];
      const mob = near ? wrap(near) : { state: 'alive', g: { position: h.point.clone(), scale: ONE } };
      mob.hitObj = h.object; mob.instanceId = h.instanceId;
      return { mob, point: h.point, dist: h.distance, zone: 'body' };
    },
    /** hit: { base, type, zone } в единицах канона → урон существам; { dmg, killed } или null */
    damage(mob, hit, element = 'rune') {
      if (!mob || mob.state === 'dead') return null;
      const dmg = Math.max(0.5, (hit.base || 20) * DMG_SCALE * (hit.zone === 'head' ? 1.5 : 1));
      const point = mob.e ? mob.e.center : mob.g.position;
      let r = null;
      if (mob.hitObj) r = enemies.hit(mob.hitObj, point, { damage: dmg, element, instanceId: mob.instanceId });
      else r = enemies.explode(point, 0.4, { damage: dmg, element })?.[0] || null;
      if (!r) return null;
      scoreEnemy(r, point.clone ? point.clone() : point);
      if (r.killed) mob.state = 'dead';
      return { dmg: Math.round(dmg * 25), killed: !!r.killed };
    },
    applyStatus() {},
  };
}
