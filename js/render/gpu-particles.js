// js/render/gpu-particles.js — GPU-частицы открытого мира (раздел 1.3.6).
// Вспышки: две системы на весь мир (additive и alpha), каждая — один THREE.Points с кольцевым буфером;
// движение p = p0 + v·t − ½·g·t² считает вершинный шейдер, CPU пишет только новые частицы.
// Погода/атмосфера: один Points-слой в кубе вокруг камеры, позиция берётся по модулю в шейдере.
import * as THREE from 'three';

const SIZE_FN = /* glsl */`
  uniform float uViewH;
  float pointSize(float worldSize, vec4 mv) { return worldSize * projectionMatrix[1][1] * uViewH * 0.5 / max(0.05, -mv.z); }`;

function burstMaterial(additive) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uViewH: { value: 900 } },
    vertexShader: /* glsl */`
      attribute vec3 aVel; attribute vec4 aColor; attribute vec2 aSize; attribute vec3 aMeta; // birth, life, gravity
      uniform float uTime; varying vec4 vColor; varying float vSoft;
      ${SIZE_FN}
      void main() {
        float t = uTime - aMeta.x, k = t / aMeta.y;
        vec3 p = position + aVel * t - vec3(0.0, 0.5 * aMeta.z * t * t, 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        bool alive = t >= 0.0 && k < 1.0;
        gl_PointSize = alive ? pointSize(mix(aSize.x, aSize.y, k), mv) : 0.0;
        vColor = vec4(aColor.rgb, aColor.a * (1.0 - k * k));
        vSoft = aSize.y > aSize.x ? 1.0 : 0.0; // растущие (дым, кольца) — мягкие
      }`,
    fragmentShader: /* glsl */`
      varying vec4 vColor; varying float vSoft;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = vSoft > 0.5 ? smoothstep(1.0, 0.2, d) : step(d, 1.0) * (1.0 - d * 0.5);
        if (a < 0.02) discard;
        gl_FragColor = vec4(vColor.rgb, vColor.a * a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, toneMapped: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

function makeBurstSystem(capacity, additive) {
  const g = new THREE.BufferGeometry();
  const attrs = {
    position: new THREE.BufferAttribute(new Float32Array(capacity * 3), 3),
    aVel: new THREE.BufferAttribute(new Float32Array(capacity * 3), 3),
    aColor: new THREE.BufferAttribute(new Float32Array(capacity * 4), 4),
    aSize: new THREE.BufferAttribute(new Float32Array(capacity * 2), 2),
    aMeta: new THREE.BufferAttribute(new Float32Array(capacity * 3).fill(-1e6), 3),
  };
  for (const [k, a] of Object.entries(attrs)) { a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); }
  const points = new THREE.Points(g, burstMaterial(additive));
  points.frustumCulled = false;
  points.renderOrder = 10;
  return { points, attrs, capacity, head: 0, dirtyFrom: -1, dirtyTo: -1 };
}

const _c = new THREE.Color();
const _n = new THREE.Vector3(), _t = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const range = (r) => (Array.isArray(r) ? r[0] + (r[1] - r[0]) * rnd() : r);

/** Две системы вспышек. spawn(emitter, pos, normal, scale) — эмиттер в формате DAMAGE_TYPE_VFX.hit[*]. */
export function createBurstParticles({ capacity = 1024 } = {}) {
  const sys = { additive: makeBurstSystem(capacity, true), alpha: makeBurstSystem(capacity >> 1, false) };
  const group = new THREE.Group();
  group.name = 'gpu-particles';
  group.add(sys.additive.points, sys.alpha.points);
  let time = 0;

  function spawn(e, pos, normal = null, scale = 1) {
    const s = sys[e.blend === 'alpha' ? 'alpha' : 'additive'];
    const count = Math.min(s.capacity, Math.max(1, Math.round((e.count ?? 6) * scale)));
    _n.copy(normal || _t.set(0, 1, 0)).normalize();
    // базис вокруг нормали: разброс конусом spread°
    _t.set(Math.abs(_n.y) < 0.9 ? 0 : 1, Math.abs(_n.y) < 0.9 ? 1 : 0, 0).cross(_n).normalize();
    _b.crossVectors(_n, _t);
    const spread = THREE.MathUtils.degToRad(e.spread ?? 60);
    _c.set(e.color || '#ffffff');
    const A = s.attrs;
    for (let k = 0; k < count; k++) {
      const i = s.head;
      s.head = (s.head + 1) % s.capacity;
      const th = rnd() * spread, ph = rnd() * Math.PI * 2, v = range(e.speed ?? [1, 2]) * scale;
      _d.copy(_n).multiplyScalar(Math.cos(th))
        .addScaledVector(_t, Math.sin(th) * Math.cos(ph)).addScaledVector(_b, Math.sin(th) * Math.sin(ph));
      A.position.setXYZ(i, pos.x, pos.y, pos.z);
      A.aVel.setXYZ(i, _d.x * v, _d.y * v, _d.z * v);
      A.aColor.setXYZW(i, _c.r, _c.g, _c.b, 1);
      const sz = e.size ?? [0.1, 0];
      A.aSize.setXY(i, sz[0] * scale, sz[1] * scale);
      A.aMeta.setXYZ(i, time, Math.max(0.02, range(e.life ?? [0.3, 0.6])), e.gravity ?? 0);
      if (s.dirtyFrom < 0) { s.dirtyFrom = i; s.dirtyTo = i; }
      else s.dirtyTo = i;
    }
    s.wrapped = s.wrapped || s.dirtyTo < s.dirtyFrom;
  }

  return {
    group,
    spawn,
    /** Все эмиттеры пресета (например, DAMAGE_TYPE_VFX.fire.hit). */
    burst(emitters, pos, normal, scale = 1) { for (const e of emitters) spawn(e, pos, normal, scale); },
    update(dt, viewH) {
      time += dt;
      for (const s of Object.values(sys)) {
        s.points.material.uniforms.uTime.value = time;
        s.points.material.uniforms.uViewH.value = viewH;
        if (s.dirtyFrom < 0) continue;
        for (const [name, a] of Object.entries(s.attrs)) {
          a.clearUpdateRanges();
          if (s.wrapped) a.addUpdateRange(0, s.capacity * a.itemSize);
          else a.addUpdateRange(s.dirtyFrom * a.itemSize, (s.dirtyTo - s.dirtyFrom + 1) * a.itemSize);
          a.needsUpdate = true;
          void name;
        }
        s.dirtyFrom = s.dirtyTo = -1;
        s.wrapped = false;
      }
    },
  };
}

// стили атмосферы: цвет, размер (м), скорость, покачивание, свечение (additive)
export const AMBIENT_STYLES = Object.freeze({
  pollen:    { color: '#fff3b0', size: 0.035, vel: [0.25, 0.05, 0.12], sway: 0.35, glow: 0, alpha: 0.75 },
  fireflies: { color: '#d9ff6a', size: 0.06, vel: [0.1, 0.05, 0.08], sway: 0.6, glow: 1, alpha: 1, blink: 1 },
  spores:    { color: '#9cff3b', size: 0.04, vel: [0.05, 0.12, 0.05], sway: 0.3, glow: 1, alpha: 0.6 },
  snow:      { color: '#ffffff', size: 0.05, vel: [0.3, -1.2, 0.15], sway: 0.4, glow: 0, alpha: 0.9 },
  dust:      { color: '#f2cf96', size: 0.03, vel: [1.6, 0.05, 0.4], sway: 0.2, glow: 0, alpha: 0.55 },
  ash:       { color: '#9a8f88', size: 0.05, vel: [0.2, -0.45, 0.1], sway: 0.3, glow: 0, alpha: 0.8, embers: 1 },
});

/** Атмосферный слой: count точек в кубе box м вокруг камеры. setStyle(id) плавно меняет вид. */
export function createAmbientParticles({ count = 300, box = 28 } = {}) {
  const g = new THREE.BufferGeometry();
  const seeds = new Float32Array(count * 4);
  const r = (s) => { s = Math.sin(s * 12.9898) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < count * 4; i++) seeds[i] = r(i + 1.7);
  g.setAttribute('position', new THREE.BufferAttribute(seeds.slice(0, count * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds.filter((_, i) => i % 4 === 3), 1));
  const uniforms = {
    uTime: { value: 0 }, uViewH: { value: 900 }, uOrigin: { value: new THREE.Vector3() }, uBox: { value: box },
    uVel: { value: new THREE.Vector3() }, uSway: { value: 0.3 }, uSize: { value: 0.04 },
    uColor: { value: new THREE.Color() }, uAlpha: { value: 0 }, uBlink: { value: 0 }, uEmbers: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      attribute float aSeed;
      uniform float uTime, uBox, uSway, uSize, uBlink, uEmbers; uniform vec3 uOrigin, uVel;
      varying float vA; varying float vEmber;
      ${SIZE_FN}
      void main() {
        vec3 p = position * uBox + uVel * uTime * (0.6 + 0.8 * aSeed);
        p += uSway * vec3(sin(uTime * 0.7 + aSeed * 40.0), sin(uTime * 0.9 + aSeed * 23.0) * 0.5, cos(uTime * 0.6 + aSeed * 31.0));
        p = mod(p - uOrigin + 0.5 * uBox, uBox) + uOrigin - 0.5 * uBox;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vEmber = step(0.85, aSeed) * uEmbers;
        float blink = mix(1.0, smoothstep(0.2, 1.0, sin(uTime * (1.5 + aSeed * 2.0) + aSeed * 60.0)), uBlink);
        float fade = 1.0 - smoothstep(0.35 * uBox, 0.5 * uBox, length(mv.xyz)); // края куба не видны
        vA = blink * fade;
        gl_PointSize = pointSize(uSize * (0.7 + 0.6 * aSeed) * (1.0 + vEmber * 0.5), mv);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uAlpha; varying float vA; varying float vEmber;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.3, d) * vA * uAlpha;
        if (a < 0.02) discard;
        vec3 c = mix(uColor, vec3(1.0, 0.45, 0.12), vEmber);
        gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, toneMapped: false, blending: THREE.NormalBlending,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  points.renderOrder = 11;
  points.name = 'ambient-particles';

  let style = null, target = 0;
  const tVel = new THREE.Vector3(), tColor = new THREE.Color();
  return {
    points,
    get style() { return style; },
    setStyle(id) {
      const s = AMBIENT_STYLES[id];
      if (!s || id === style) return;
      style = id;
      target = s.alpha;
      tVel.fromArray(s.vel);
      tColor.set(s.color);
      uniforms.uSway.value = s.sway;
      uniforms.uSize.value = s.size;
      uniforms.uBlink.value = s.blink || 0;
      uniforms.uEmbers.value = s.embers || 0;
      mat.blending = s.glow ? THREE.AdditiveBlending : THREE.NormalBlending;
      uniforms.uAlpha.value = 0; // новая погода проявляется
    },
    update(dt, origin, viewH) {
      uniforms.uTime.value += dt;
      uniforms.uOrigin.value.copy(origin);
      uniforms.uViewH.value = viewH;
      const k = 1 - Math.exp(-dt * 1.5);
      uniforms.uVel.value.lerp(tVel, k);
      uniforms.uColor.value.lerp(tColor, k);
      uniforms.uAlpha.value += (target - uniforms.uAlpha.value) * k;
    },
  };
}
