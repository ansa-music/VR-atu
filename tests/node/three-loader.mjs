// Резолв 'three' → vendor/three.module.js для проверок в Node: node --import ./tests/node/register.mjs
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return next(new URL('../../vendor/three.module.js', import.meta.url).href, ctx);
  if (spec.startsWith('three/addons/')) return next(new URL('../../vendor/addons/' + spec.slice(13), import.meta.url).href, ctx);
  return next(spec, ctx);
}
