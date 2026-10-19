// Загрузка 3D-моделей из assets/models/<id>.glb (GLTFLoader r160).
// loadModel(id) → Promise<Object3D | null>: null, если файла нет — модуль берёт процедурную модель.
// Каждый вызов отдаёт свою копию (clone), исходник кэшируется.
import * as THREE from 'three';

const BASE = new URL('../../assets/models/', import.meta.url);
const cache = new Map(); // id → Promise<Object3D | null>
let loaderPromise = null;

// загрузчик подгружаем лениво: в режиме «Реализм» он не нужен
function getLoader() {
  if (!loaderPromise) {
    loaderPromise = import('three/addons/loaders/GLTFLoader.js')
      .then((m) => new m.GLTFLoader())
      .catch((e) => { console.warn('[assets] GLTFLoader не загружен', e); return null; });
  }
  return loaderPromise;
}

// у моделей нет скелетной анимации — достаточно обычного clone(); материалы общие
function prepare(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = false;
    const m = o.material;
    if (m?.map) m.map.colorSpace = THREE.SRGBColorSpace;
    if (m?.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
  });
  return root;
}

async function fetchModel(id) {
  if (!/^[a-z0-9_-]+$/i.test(id)) return null;
  const url = new URL(`${id}.glb`, BASE).href;
  // сначала HEAD: на отсутствующий файл не будет ошибки парсера в консоли
  try {
    const head = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    if (!head.ok) return null;
  } catch { return null; }
  const loader = await getLoader();
  if (!loader) return null;
  try {
    const gltf = await loader.loadAsync(url);
    return prepare(gltf.scene || gltf.scenes?.[0] || null);
  } catch (e) {
    console.warn('[assets] не удалось прочитать', url, e);
    return null;
  }
}

export function loadModel(id) {
  if (!cache.has(id)) cache.set(id, fetchModel(String(id)));
  return cache.get(id).then((src) => (src ? src.clone(true) : null));
}

// найти узел по имени (Muzzle, String, Tip, Crystal, WeakPoint), без учёта регистра
export function findNode(root, name) {
  const want = String(name).toLowerCase();
  let found = null;
  root?.traverse((o) => { if (!found && o.name?.toLowerCase() === want) found = o; });
  return found;
}

// заранее запросить список моделей (например, при выборе режима «Фэнтези»)
export function preloadModels(ids) {
  return Promise.all(ids.map((id) => loadModel(id)));
}
