// js/world/sky.js — небо и смена суток (разделы 1.2.5, 1.3.4): градиент, солнце, луна, звёзды
// в одном шейдере, облака одной InstancedMesh, свет (небо + солнце/луна) и цвет тумана.
import * as THREE from 'three';
import { WORLD_CONFIG, BIOMES } from './config.js';
import { THEME } from '../../shared/defs/theme.js';

const DN = THEME.dayNight;
const NIGHT_ZENITH = new THREE.Color('#060a22');
const NIGHT_HORIZON = new THREE.Color('#1c2850');
const WARM = new THREE.Color(DN.warmHorizon);
const MOON = new THREE.Color(DN.moon.color);
const SUN_DAY = new THREE.Color('#fff1dc');
const SUN_LOW = new THREE.Color('#ffb070');

/** Час (0–24) → доля дня 0..1 и тёплый сдвиг горизонта по ключам THEME.dayNight.keys. */
export function dayFactors(hour) {
  const k = DN.keys;
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < k.length - 1; i++) {
    if (h >= k[i].h && h <= k[i + 1].h) {
      const t = (h - k[i].h) / Math.max(1e-6, k[i + 1].h - k[i].h);
      const s = t * t * (3 - 2 * t);
      return { day: k[i].day + (k[i + 1].day - k[i].day) * s, warm: k[i].warm + (k[i + 1].warm - k[i].warm) * s };
    }
  }
  return { day: 0, warm: 0 };
}

/** Направление на солнце: восход в 6:00 на востоке, зенит в 12:00, закат в 18:00 на западе. */
export function sunDirection(hour, out = new THREE.Vector3()) {
  const a = ((hour - 6) / 12) * Math.PI;
  return out.set(Math.cos(a), Math.sin(a), 0.35).normalize();
}

export function createSky({ radius, quality = 'quest' }) {
  const uniforms = {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) }, uNight: { value: 0 }, uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunColor, uMoonDir; uniform float uNight, uTime;
      varying vec3 vDir;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(uHorizon, uZenith, pow(h, 0.55)) : mix(uHorizon, uGround, min(1.0, -h * 4.0));
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(sd, 900.0) * 6.0 + pow(sd, 12.0) * 0.35);
        float md = max(dot(d, uMoonDir), 0.0);
        col += vec3(0.8, 0.88, 1.0) * (smoothstep(0.9993, 0.9996, md) * 1.2 + pow(md, 60.0) * 0.08) * uNight;
        vec3 cell = floor(d * 220.0);
        float star = step(0.9975, hash(cell)) * smoothstep(0.0, 0.15, h);
        col += vec3(star) * uNight * (0.6 + 0.4 * sin(uTime * 3.0 + hash(cell) * 40.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  dome.name = 'sky';

  // облака: приплюснутые «ватные» комки на высоте над игроком, один вызов
  const CLOUDS = quality === 'pc_high' ? 16 : quality === 'pc_low' ? 12 : 8;
  const cloudGeo = new THREE.IcosahedronGeometry(1, 1);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.92, depthWrite: false });
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, CLOUDS);
  clouds.frustumCulled = false;
  clouds.renderOrder = -900;
  clouds.name = 'clouds';
  const cloudData = [];
  for (let i = 0; i < CLOUDS; i++) {
    const a = (i / CLOUDS) * Math.PI * 2 + Math.sin(i * 7.3) * 0.4;
    cloudData.push({ a, r: radius * (0.45 + 0.35 * ((i * 0.618) % 1)), y: radius * (0.32 + 0.12 * ((i * 0.37) % 1)),
      s: [radius * (0.09 + 0.05 * ((i * 0.53) % 1)), radius * 0.025, radius * (0.05 + 0.03 * ((i * 0.71) % 1))] });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  const group = new THREE.Group();
  group.name = 'sky-group';
  group.add(dome, clouds);

  // свет мира
  const hemi = new THREE.HemisphereLight(0xd8f0ff, 0x56603e, 1.15);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.1);
  sun.position.set(0, 100, 0);
  const lights = [hemi, sun];

  // время суток
  const dayS = WORLD_CONFIG.dayLengthMin * 60;
  let hour = WORLD_CONFIG.startTime, speed = 1;
  const pal = Object.fromEntries(Object.keys(BIOMES).map((id) => [id, {
    fog: new THREE.Color(BIOMES[id].palette.fog), top: new THREE.Color(BIOMES[id].palette.skyTop), ground: new THREE.Color(BIOMES[id].palette.shade || BIOMES[id].palette.ground),
  }]));
  const fogDay = new THREE.Color(), topDay = new THREE.Color(), groundDay = new THREE.Color();
  const fogNow = new THREE.Color(), topNow = new THREE.Color(), groundNow = new THREE.Color();
  const tmp = new THREE.Color();
  let first = true, drift = 0, night = 0;

  return {
    group,
    lights,
    sunDir: uniforms.uSunDir.value,
    get hour() { return hour; },
    get night() { return night; },
    /** Перевести часы (0–24) и множитель скорости суток (1 = 40 мин на сутки). */
    setTime(h, mul = speed) { hour = ((h % 24) + 24) % 24; speed = mul; first = true; },
    /** weights — веса биомов (порядок BIOMES), head — позиция головы. Возвращает цвет тумана. */
    update(dt, head, weights, ids) {
      hour = (hour + (dt * speed * 24) / dayS) % 24;
      uniforms.uTime.value += dt;
      // дневные цвета по биому под игроком
      fogDay.setRGB(0, 0, 0); topDay.setRGB(0, 0, 0); groundDay.setRGB(0, 0, 0);
      for (let b = 0; b < ids.length; b++) {
        const w = weights[b];
        if (w <= 0) continue;
        const P = pal[ids[b]];
        fogDay.r += P.fog.r * w; fogDay.g += P.fog.g * w; fogDay.b += P.fog.b * w;
        topDay.r += P.top.r * w; topDay.g += P.top.g * w; topDay.b += P.top.b * w;
        groundDay.r += P.ground.r * w; groundDay.g += P.ground.g * w; groundDay.b += P.ground.b * w;
      }
      const { day, warm } = dayFactors(hour);
      night = 1 - day;
      // ночь темнее, но не чёрная; закат — тёплый горизонт
      tmp.copy(NIGHT_HORIZON).lerp(fogDay, day).lerp(WARM, warm * 0.6 * Math.min(1, day * 2 + 0.2));
      const k = first ? 1 : 1 - Math.exp(-dt * 0.8);
      fogNow.lerp(tmp, k);
      topNow.lerp(tmp.copy(NIGHT_ZENITH).lerp(topDay, day), k);
      groundNow.lerp(tmp.copy(groundDay).multiplyScalar(0.25 + 0.5 * day), k);
      first = false;
      uniforms.uHorizon.value.copy(fogNow);
      uniforms.uZenith.value.copy(topNow);
      uniforms.uGround.value.copy(groundNow);
      uniforms.uNight.value = night;
      const sd = sunDirection(hour, uniforms.uSunDir.value);
      uniforms.uMoonDir.value.copy(sd).negate();
      uniforms.uSunColor.value.copy(SUN_DAY).lerp(SUN_LOW, warm).multiplyScalar(Math.max(0, Math.min(1, sd.y * 4 + 0.2)));
      // свет: солнце днём, луна ночью (голубой, 0,4); небо не темнее 0,35 от дня
      const sunUp = sd.y > 0;
      const dir = sunUp ? sd : uniforms.uMoonDir.value;
      sun.position.copy(dir).multiplyScalar(100);
      if (sunUp) { sun.color.copy(SUN_DAY).lerp(SUN_LOW, warm); sun.intensity = 2.1 * Math.min(1, sd.y * 3) * day + 0.05; }
      else { sun.color.copy(MOON); sun.intensity = DN.moon.intensity * Math.min(1, dir.y * 3) * night; }
      const amb = DN.nightMinAmbient + (1 - DN.nightMinAmbient) * day;
      hemi.intensity = 1.15 * amb;
      hemi.color.copy(topNow).lerp(tmp.set(0xffffff), 0.5);
      hemi.groundColor.copy(groundNow);
      // небо и облака следуют за головой
      dome.position.copy(head);
      drift += dt * 0.004;
      cloudMat.color.copy(fogNow).lerp(tmp.set(0xffffff), 0.35 + 0.5 * day).lerp(WARM, warm * 0.3);
      for (let i = 0; i < cloudData.length; i++) {
        const c = cloudData[i], a = c.a + drift;
        p.set(head.x + Math.cos(a) * c.r, head.y + c.y, head.z + Math.sin(a) * c.r);
        q.setFromAxisAngle(up, a * 1.7);
        m4.compose(p, q, sc.fromArray(c.s));
        clouds.setMatrixAt(i, m4);
      }
      clouds.instanceMatrix.needsUpdate = true;
      return fogNow;
    },
  };
}
