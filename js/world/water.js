// js/world/water.js — вода и лава (раздел 1.3.5). Вода непрозрачная (дёшево для Quest): мелководье и
// глубина по карте высот (текстура 8 бит, −8…16 м), пена у берега ступенями, лёгкие волны, блик солнца.
import * as THREE from 'three';
import { WORLD_CONFIG, BIOMES } from './config.js';
import { CRATER } from './heightmap.js';

const DEPTH_MIN = -8, DEPTH_SPAN = 24;

/** Карта высот → R8-текстура для глубины воды. */
export function makeDepthTexture(terrain) {
  const { n, heights } = terrain;
  const data = new Uint8Array(n * n);
  for (let i = 0; i < data.length; i++) data[i] = Math.max(0, Math.min(255, Math.round(((heights[i] - DEPTH_MIN) / DEPTH_SPAN) * 255)));
  const tex = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function waterMaterial({ depthTex, level, shallow, deep, foam, waves, sunDir, sky }) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uDepth: { value: null }, uLevel: { value: level }, uSize: { value: WORLD_CONFIG.size },
      uShallow: { value: new THREE.Color(shallow) }, uDeep: { value: new THREE.Color(deep) }, uFoam: { value: new THREE.Color(foam) },
      uSky: { value: sky }, uSunDir: { value: sunDir }, uLight: { value: 1 }, uTime: { value: 0 }, uWaves: { value: waves },
    }]),
    vertexShader: /* glsl */`
      uniform float uTime, uWaves; varying vec3 vWorld; varying vec3 vView;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += uWaves * (sin(wp.x * 0.35 + uTime * 1.3) + sin(wp.z * 0.27 - uTime * 1.1) * 0.8);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        vView = cameraPosition - wp.xyz;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uDepth; uniform float uLevel, uSize, uTime, uLight;
      uniform vec3 uShallow, uDeep, uFoam, uSky, uSunDir; varying vec3 vWorld; varying vec3 vView;
      #include <fog_pars_fragment>
      float n2(vec2 p) { return fract(sin(dot(floor(p), vec2(12.9898, 78.233))) * 43758.5453); }
      float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(n2(i), n2(i + vec2(1, 0)), f.x), mix(n2(i + vec2(0, 1)), n2(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float ground = texture2D(uDepth, vWorld.xz / uSize).r * ${DEPTH_SPAN.toFixed(1)} + ${DEPTH_MIN.toFixed(1)};
        float depth = uLevel - ground;
        float d01 = clamp(depth / 6.0, 0.0, 1.0);
        vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 1.0, d01));
        // пена у берега: ступенькой, шевелится шумом
        float f = (1.0 - clamp(depth / 1.2, 0.0, 1.0)) + (vnoise(vWorld.xz * 0.9 + uTime * 0.3) - 0.5) * 0.35;
        col = mix(col, uFoam, step(0.82, f));
        // френель к цвету неба и блик солнца ступенькой
        vec3 V = normalize(vView);
        float fres = pow(1.0 - max(V.y, 0.0), 4.0);
        col = mix(col, uSky, fres * 0.6);
        vec3 N = normalize(vec3(sin(vWorld.x * 0.8 + uTime) * 0.04, 1.0, cos(vWorld.z * 0.7 - uTime * 0.9) * 0.04));
        float spec = pow(max(dot(reflect(-uSunDir, N), V), 0.0), 64.0);
        col += vec3(1.0, 0.97, 0.9) * step(0.5, spec) * 0.6 * uLight;
        col *= 0.35 + 0.65 * uLight;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  });
}

function lavaMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: /* glsl */`
      uniform float uTime; varying vec2 vXZ;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += sin(wp.x * 0.2 + uTime * 0.6) * 0.15;
        vXZ = wp.xz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vXZ;
      #include <fog_pars_fragment>
      float n2(vec2 p) { return fract(sin(dot(floor(p), vec2(12.9898, 78.233))) * 43758.5453); }
      float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(n2(i), n2(i + vec2(1, 0)), f.x), mix(n2(i + vec2(0, 1)), n2(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float n = 0.6 * vnoise(vXZ * 0.18 + vec2(uTime * 0.05, 0.0)) + 0.4 * vnoise(vXZ * 0.43 - vec2(0.0, uTime * 0.08));
        float crust = smoothstep(0.45, 0.55, n);
        vec3 glow = mix(vec3(1.0, 0.353, 0.122), vec3(1.0, 0.827, 0.42), smoothstep(0.2, 0.45, 0.45 - abs(n - 0.25)));
        vec3 col = mix(glow * 1.6, vec3(0.165, 0.071, 0.094), crust);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true, toneMapped: false,
  });
}

export function createWater({ terrain, preset, sunDir }) {
  const depthTex = makeDepthTexture(terrain);
  const sky = new THREE.Color();
  const group = new THREE.Group();
  group.name = 'water';
  const waves = preset === 'pc_high' ? 0.05 : 0.035;

  // море: плоскость вокруг игрока до тумана
  const seaSize = WORLD_CONFIG.quality[preset].fogFar * 2 + 256;
  const seaPal = BIOMES.b_meadow.palette;
  const seaMat = waterMaterial({ depthTex, level: WORLD_CONFIG.seaLevel, shallow: '#7fe0e6', deep: '#1f6fae', foam: '#f4fbff', waves, sunDir, sky });
  seaMat.uniforms.uDepth.value = depthTex;
  void seaPal;
  const seg = preset === 'pc_high' ? 96 : 48;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(seaSize, seaSize, seg, seg).rotateX(-Math.PI / 2), seaMat);
  sea.position.y = WORLD_CONFIG.seaLevel;
  sea.frustumCulled = false;
  sea.name = 'sea';

  // болото: мутная вода на своём уровне над всей юго-западной частью
  const sw = BIOMES.b_swamp;
  const swampMat = waterMaterial({ depthTex, level: sw.waterLevel, shallow: '#556b3a', deep: '#22301f', foam: sw.palette.duckweed, waves: waves * 0.4, sunDir, sky });
  swampMat.uniforms.uDepth.value = depthTex;
  const swamp = new THREE.Mesh(new THREE.PlaneGeometry(620, 600, 24, 24).rotateX(-Math.PI / 2), swampMat);
  swamp.position.set(300, sw.waterLevel, 1236);
  swamp.name = 'swamp-water';

  // лава в кальдере
  const lavaMat = lavaMaterial();
  const lava = new THREE.Mesh(new THREE.CircleGeometry(CRATER.r + 6, 48).rotateX(-Math.PI / 2), lavaMat);
  lava.position.set(CRATER.x, BIOMES.b_volcano.lavaLevel, CRATER.z);
  lava.name = 'lava';

  group.add(sea, swamp, lava);
  const mats = [seaMat, swampMat, lavaMat];
  // UniformsUtils.merge клонирует значения — общие цвет неба и направление солнца ставим ссылками
  for (const m of [seaMat, swampMat]) { m.uniforms.uSky.value = sky; m.uniforms.uSunDir.value = sunDir; }
  return {
    group,
    depthTex,
    update(dt, head, skyColor, light) {
      for (const m of mats) m.uniforms.uTime.value += dt;
      sky.copy(skyColor);
      seaMat.uniforms.uLight.value = swampMat.uniforms.uLight.value = light;
      sea.position.x = Math.round(head.x / 32) * 32;
      sea.position.z = Math.round(head.z / 32) * 32;
    },
  };
}
