// Frame-independent weapon controller. No gameplay coupling; browser/Node compatible.
export class CombatController {
  constructor({ capacity = 24, reserve = 144, fireInterval = 125, reloadMs = 1450, now = () => performance.now() } = {}) {
    this.capacity = capacity;
    this.ammo = capacity;
    this.reserve = reserve;
    this.fireInterval = fireInterval;
    this.reloadMs = reloadMs;
    this.now = now;
    this.lastShot = -Infinity;
    this.reloadUntil = 0;
    this.reloading = false;
    this.recoil = 0;
    this.shotIndex = 0;
  }
  reset() {
    this.ammo = this.capacity;
    this.reserve = 144;
    this.reloading = false;
    this.reloadUntil = 0;
    this.lastShot = -Infinity;
    this.recoil = 0;
    this.shotIndex = 0;
  }
  fire() {
    const t = this.now();
    if (this.reloading) return { ok: false, reason: 'reloading' };
    if (t - this.lastShot < this.fireInterval) return { ok: false, reason: 'cooldown' };
    if (!this.ammo) return { ok: false, reason: 'empty' };
    this.lastShot = t;
    this.ammo--;
    this.shotIndex++;
    this.recoil = Math.min(1, this.recoil + 0.27);
    return { ok: true, ammo: this.ammo };
  }
  reload() {
    if (this.reloading || this.ammo === this.capacity || this.reserve <= 0) return false;
    this.reloading = true;
    this.reloadUntil = this.now() + this.reloadMs;
    return true;
  }
  update(dt) {
    if (this.reloading && this.now() >= this.reloadUntil) {
      const moved = Math.min(this.capacity - this.ammo, this.reserve);
      this.ammo += moved;
      this.reserve -= moved;
      this.reloading = false;
    }
    this.recoil = Math.max(0, this.recoil - Math.max(0, dt) * 2.4);
  }
  get status() {
    return { ammo: this.ammo, reserve: this.reserve, reloading: this.reloading, recoil: this.recoil };
  }
}

// Deterministic spread based on stance and movement, converted to a normalized ray.
export function shotSpread({ aiming = false, moving = false, jumping = false, crouching = false, shotIndex = 0 } = {}) {
  let spread = aiming ? 0.003 : 0.012;
  if (crouching) spread *= 0.65;
  if (moving) spread *= 2.0;
  if (jumping) spread *= 3.1;
  const a = shotIndex * 2.399963229728653;
  return [Math.cos(a) * spread, Math.sin(a) * spread];
}
