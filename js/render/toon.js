// js/render/toon.js  (новый модуль)
import * as THREE from 'three';

// 3 ступени: тень / полутон / свет. NearestFilter обязателен, иначе ступени размываются.
export function makeGradientMap(steps = [70, 160, 255]) {
  const tex = new THREE.DataTexture(new Uint8Array(steps), steps.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
const GRADIENT = makeGradientMap();

// Общие uniform'ы, их меняют день/ночь и биом. Один объект на все материалы.
export const SHARED = {
  uTime:     { value: 0 },
  uRimColor: { value: new THREE.Color(0xbfe3ff) },
  uRimPower: { value: 0.6 },                      // 0 = выкл
  uWind:     { value: new THREE.Vector3(1, 0, 0.3) },
  uWindStr:  { value: 0.5 },
};

/** Тун + rim + (опц.) ветер + (опц.) статусы. Новых вызовов отрисовки не добавляет. */
export function makeToon({ map = null, color = 0xffffff, vertexColors = true,
                           wind = false, statusFx = false } = {}) {
  const m = new THREE.MeshToonMaterial({ map, color, gradientMap: GRADIENT, vertexColors });
  const status = statusFx ? { uFrost: { value: 0 }, uBurn: { value: 0 }, uPoison: { value: 0 }, uFlash: { value: 0 } } : null;
  m.userData.status = status;                      // сюда пишет игровой код
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, SHARED, status || {});
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec3 uWind; uniform float uWindStr;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      #if ${wind ? 1 : 0}
        #ifdef USE_INSTANCING
          vec2 ph = instanceMatrix[3].xz;
        #else
          vec2 ph = modelMatrix[3].xz;
        #endif
        #ifdef USE_COLOR_ALPHA
          float w = color.a;          // вес ветра: 0 у корня, 1 у верхушки (COLOR_0.a)
        #else
          float w = clamp(position.y * 0.5, 0.0, 1.0);
        #endif
        float sw = sin(uTime * 1.7 + dot(ph, vec2(0.37, 0.21)) + position.y * 0.8);
        transformed.xz += uWind.xz * (sw * 0.6 + 0.4) * uWindStr * w * 0.12;
      #endif`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uRimColor; uniform float uRimPower; uniform float uTime;
        ${status ? 'uniform float uFrost; uniform float uBurn; uniform float uPoison; uniform float uFlash;' : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rimF = 1.0 - saturate(dot(normalize(-vViewPosition), normal));
        totalEmissiveRadiance += uRimColor * smoothstep(0.55, 0.85, rimF) * uRimPower;
        ${status ? `
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.97, 1.0), uFrost * smoothstep(0.2, 0.9, normal.y * 0.5 + 0.5));
        totalEmissiveRadiance += vec3(1.0, 0.42, 0.12) * uBurn * (0.5 + 0.5 * sin(uTime * 12.0)) * smoothstep(0.4, 0.9, rimF);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.86, 0.16), uPoison * 0.45);
        totalEmissiveRadiance += vec3(uFlash);      // белая вспышка попадания 60 мс` : ''}`);
  };
  // Разные варианты = разные программы. Без ключа three может переиспользовать чужой шейдер.
  m.customProgramCacheKey = () => `toon-w${+wind}-s${+statusFx}`;
  return m;
}

// --- контур (inverted hull), тот же модуль js/render/toon.js ---
// Контур: второй проход той же геометрии, задние грани, раздутые по сглаженной нормали.
export function makeOutlineMaterial({ color = 0x1a1430, thickness = 0.012 } = {}) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uThick = { value: thickness };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uThick;\nattribute vec3 outlineNormal;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed += normalize(outlineNormal) * uThick;`);
  };
  m.customProgramCacheKey = () => 'outline';
  return m;
}

// У low-poly flat-моделей нормали разрезаны по граням, и без этого контур рвётся на углах.
// Усредняем нормали по совпадающим позициям и кладём в отдельный атрибут (один раз при загрузке).
export function computeOutlineNormals(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const acc = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i), a = acc.get(k) || [0, 0, 0];
    a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i); acc.set(k, a);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) out.set(acc.get(key(i)), i * 3);
  geo.setAttribute('outlineNormal', new THREE.BufferAttribute(out, 3));
}

export function addOutline(mesh, mat) {
  if (!mesh.geometry.attributes.outlineNormal) computeOutlineNormals(mesh.geometry);
  let o;
  if (mesh.isSkinnedMesh) { o = new THREE.SkinnedMesh(mesh.geometry, mat); o.bind(mesh.skeleton, mesh.bindMatrix); }
  else if (mesh.isInstancedMesh) { o = new THREE.InstancedMesh(mesh.geometry, mat, mesh.count); o.instanceMatrix = mesh.instanceMatrix; }
  else o = new THREE.Mesh(mesh.geometry, mat);
  o.renderOrder = mesh.renderOrder - 1;
  o.frustumCulled = mesh.frustumCulled;
  o.userData.isOutline = true;
  // Обычный и скинированный меш: ребёнок (наследует трансформ). InstancedMesh: сосед в том же parent.
  (mesh.isInstancedMesh ? mesh.parent : mesh).add(o);
  return o;
}
