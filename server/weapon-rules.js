// Authoritative PvP weapon balance. Keep IDs, intervals and pellet counts in sync
// with js/arsenal.js; server/weapon-rules.test.js checks this on every push.
// Numbers are GAME BALANCE values, not real-world ballistics.
export const WEAPON_RULES = Object.freeze({
  pm: Object.freeze({ id: 'pm', intervalMs: 120, damage: 29, head: 1.85, limb: .72, range: 44, falloffStart: 13, falloffEnd: 40, minDamage: .66, pellets: 1 }),
  ak: Object.freeze({ id: 'ak', intervalMs: 92, damage: 27, head: 1.95, limb: .74, range: 68, falloffStart: 19, falloffEnd: 58, minDamage: .72, pellets: 1 }),
  shotgun: Object.freeze({ id: 'shotgun', intervalMs: 550, damage: 9, head: 1.15, limb: .8, range: 28, falloffStart: 6, falloffEnd: 22, minDamage: .35, pellets: 9, spreadRad: 1.3 * Math.PI / 180 }),
  sniper: Object.freeze({ id: 'sniper', intervalMs: 1050, damage: 89, head: 1.45, limb: .82, range: 90, falloffStart: 48, falloffEnd: 85, minDamage: .78, pellets: 1 }),
  blaster: Object.freeze({ id: 'blaster', intervalMs: 143, damage: 24, head: 1.65, limb: .75, range: 55, falloffStart: 18, falloffEnd: 52, minDamage: .72, pellets: 1 }),
});
export function weaponRule(id) {
  return Object.hasOwn(WEAPON_RULES, id) ? WEAPON_RULES[id] : null;
}
export function calculateDamage(rule, zone, range) {
  if (!rule || !Number.isFinite(range) || range < 0 || range > rule.range) return 0;
  const factor = range <= rule.falloffStart ? 1
    : 1 - (1 - rule.minDamage) * Math.min(1, (range - rule.falloffStart) / (rule.falloffEnd - rule.falloffStart));
  const region = zone === 'head' ? rule.head : zone === 'limb' ? rule.limb : 1;
  return Math.max(1, Math.round(rule.damage * factor * region));
}
