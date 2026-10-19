// Загрузка GLB-моделей фэнтези-режима (assets/models/<id>.glb).
// Все 16 файлов встраивают всего 2 PNG-атласа: одинаковые картинки находим по хешу байтов
// и заменяем текстуры на общие, чтобы в видеопамять ушло по одной текстуре на атлас.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MARKERS = ['Muzzle', 'String', 'Tip', 'Crystal', 'WeakPoint'];

const loader = new GLTFLoader();
const cache = new Map();          // id → Promise<{ scene, nodes } | null>
const ready = new Map();          // id → { scene, nodes } после загрузки
const texByKey = new Map();       // хеш|uv|сэмплер → общая текстура
const sourceByHash = new Map();   // хеш → общий THREE.Source (одна загрузка в GPU на атлас)
const keptSources = new Set();

// Модель: новый клон корня на каждый вызов (геометрия, материалы, текстуры общие — материал не менять у одного экземпляра)
export function loadModel(id) {
  return load(id).then((e) => (e ? e.scene.clone(true) : null));
}

export async function preloadModels(ids) {
  await Promise.all((ids || []).map(load));
}

// Точки модели (Muzzle, String, Tip, Crystal, WeakPoint) в координатах корня; null, пока не загружена
export function modelInfo(id) {
  const e = ready.get(id);
  if (!e) return null;
  const nodes = {};
  for (const k in e.nodes) nodes[k] = e.nodes[k].clone();
  return { nodes };
}

function load(id) {
  let p = cache.get(id);
  if (!p) {
    p = loadEntry(id).catch((err) => {
      console.warn(`[assets] ${id}: не загрузилась`, err);
      cache.delete(id); // сетевая ошибка — дадим повторить позже
      return null;
    });
    cache.set(id, p);
  }
  return p;
}

async function loadEntry(id) {
  const url = new URL(`../../assets/models/${id}.glb`, import.meta.url);
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[assets] ${id}: HTTP ${res.status}`);
    return null; // 404 и т.п. — кэшируем «нет модели»
  }
  const buffer = await res.arrayBuffer();
  try {
    const { json, bin } = readGlb(buffer);
    const imageHashes = await hashImages(json, bin);
    const gltf = await loader.parseAsync(buffer, new URL('./', url).href);
    const scene = gltf.scene;
    shareTextures(scene, gltf.parser, json, imageHashes);
    setupScene(scene, id);
    const entry = { scene, nodes: collectNodes(scene) };
    ready.set(id, entry);
    return entry;
  } catch (err) {
    console.warn(`[assets] ${id}: не разобрать GLB`, err);
    return null;
  }
}

// ---------- GLB: JSON-чанк и BIN-чанк ----------
function readGlb(buffer) {
  const dv = new DataView(buffer);
  if (buffer.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) throw new Error('не GLB');
  let json = null, bin = null, off = 12;
  while (off + 8 <= dv.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, off + 8, len)));
    else if (type === 0x004e4942) bin = new Uint8Array(buffer, off + 8, len);
    off += 8 + len;
  }
  if (!json) throw new Error('нет JSON-чанка');
  return { json, bin };
}

// Хеш байтов каждой встроенной картинки (индекс images[] → хеш или null)
function hashImages(json, bin) {
  return Promise.all((json.images || []).map((img) => {
    const bv = img.bufferView !== undefined && json.bufferViews ? json.bufferViews[img.bufferView] : null;
    if (!bv || !bin || (bv.buffer || 0) !== 0) return null; // только BIN-чанк GLB
    const start = bv.byteOffset || 0;
    return hashBytes(bin.subarray(start, start + bv.byteLength));
  }));
}

async function hashBytes(bytes) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle; // есть только на HTTPS/localhost
  if (subtle) {
    try {
      const d = new Uint8Array(await subtle.digest('SHA-1', bytes));
      let s = '';
      for (let i = 0; i < d.length; i++) s += d[i].toString(16).padStart(2, '0');
      return s;
    } catch (e) { /* ниже запасной хеш */ }
  }
  // запасной вариант для http по IP (телефон в локальной сети): cyrb53 по всем байтам
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `c53:${(h2 >>> 0).toString(16)}${(h1 >>> 0).toString(16)}:${bytes.length}`;
}

// ---------- общие текстуры ----------
function shareTextures(scene, parser, json, imageHashes) {
  // Source → хеш: клон для TEXCOORD_1 не попадает в associations, но делит source с оригиналом
  const hashOfSource = new Map();
  for (const [obj, ref] of parser.associations) {
    if (!obj || !obj.isTexture || !ref || ref.textures === undefined) continue;
    const def = json.textures && json.textures[ref.textures];
    const h = def && def.source !== undefined ? imageHashes[def.source] : null;
    if (h) hashOfSource.set(obj.source, h);
  }

  const dups = new Set();
  const seen = new Set();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!mat || seen.has(mat)) continue;
      seen.add(mat);
      for (const k of Object.keys(mat)) {
        const tex = mat[k];
        if (!tex || !tex.isTexture) continue;
        const h = hashOfSource.get(tex.source);
        if (!h) { tex.anisotropy = 2; continue; }
        const shared = sharedTexture(tex, h);
        if (shared !== tex) { mat[k] = shared; dups.add(tex); }
      }
      if ('envMapIntensity' in mat) mat.envMapIntensity = 0.6; // неоновая карта окружения не засвечивает
      if (mat.transparent) mat.depthWrite = false; // blade: alphaMode BLEND
    }
  });

  // дубликаты: текстуру освобождаем, ненужную картинку закрываем (ImageBitmap держит память)
  for (const tex of dups) {
    tex.dispose();
    if (!keptSources.has(tex.source)) {
      const img = tex.source.data;
      if (img && typeof img.close === 'function') img.close();
    }
  }
}

// Одна текстура на (хеш, uv-канал, сэмплер); все с одним Source → одна загрузка в GPU
function sharedTexture(tex, h) {
  const key = `${h}|${tex.channel}|${tex.wrapS},${tex.wrapT},${tex.magFilter},${tex.minFilter},${tex.colorSpace}`;
  let shared = texByKey.get(key);
  if (shared) return shared;
  let src = sourceByHash.get(h);
  if (!src) {
    src = tex.source;
    sourceByHash.set(h, src);
    keptSources.add(src);
  }
  if (tex.source === src) shared = tex;
  else {
    shared = tex.clone(); // clone() сохраняет channel и прочие параметры
    shared.source = src;
  }
  shared.anisotropy = 2; // мипмапы остаются (minFilter из сэмплера, generateMipmaps = true)
  texByKey.set(key, shared);
  return shared;
}

// ---------- сцена ----------
function setupScene(scene, id) {
  scene.userData.modelId = id;
  scene.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
    if (o.isMesh) o.frustumCulled = true;
  });
}

function collectNodes(scene) {
  scene.updateMatrixWorld(true);
  const nodes = {};
  scene.traverse((o) => {
    if (o === scene || o.isMesh || !o.name) return;
    if (!MARKERS.includes(o.name) && o.children.length) return;
    nodes[o.name] = scene.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
  });
  return nodes;
}
