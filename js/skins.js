import * as THREE from 'three';

// Cosmetic-only palettes. Existing weapon geometry, recoil and hit detection stay unchanged.
export const SKINS = Object.freeze({
  cyan: { name: 'CYBER ICE', color: 0x3ec5ff, metal: 0x29394c, dark: 0x101927 },
  crimson: { name: 'CRIMSON', color: 0xff456d, metal: 0x4b2234, dark: 0x1e101d },
  gold: { name: 'ROYAL GOLD', color: 0xffd23f, metal: 0x6a5634, dark: 0x25201b },
  obsidian: { name: 'OBSIDIAN', color: 0x9c76ff, metal: 0x242038, dark: 0x0c0a15 },
});
export const DEFAULT_SKIN = 'cyan';
export function skinId(id) { return Object.hasOwn(SKINS, id) ? id : DEFAULT_SKIN; }
export function skinColor(id) { return SKINS[skinId(id)].color; }

// Materials cloned per model so selecting a skin never recolors other players.
export function tintWeapon(weapon, id) {
  const root = weapon?.group;
  if (!root) return;
  const skin = SKINS[skinId(id)];
  root.traverse(child => {
    if (!child.isMesh || !child.material) return;
    if (!child.userData.originalSkinMaterials) {
      child.userData.originalSkinMaterials = (Array.isArray(child.material) ? child.material : [child.material]).map(mat => mat.clone());
    }
    const originals = child.userData.originalSkinMaterials;
    const materials = originals.map(mat => {
      const clone = mat.clone();
      if (clone.emissive?.getHex() && clone.emissive.getHex() !== 0) {
        clone.emissive.setHex(skin.color);
        clone.color?.setHex(0x161922);
      } else if (clone.metalness >= 0.5 && clone.color) {
        clone.color.setHex(skin.metal);
      }
      return clone;
    });
    const old = Array.isArray(child.material) ? child.material : [child.material];
    if (child.userData.skinOwnedMaterials) old.forEach(mat => mat.dispose());
    child.material = Array.isArray(child.material) ? materials : materials[0];
    child.userData.skinOwnedMaterials = true;
  });
}

export function createRemoteAvatar(id = DEFAULT_SKIN) {
  const color = skinColor(id);
  const group = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0x202b3b, roughness: 0.42, metalness: 0.65 });
  const armor = new THREE.MeshStandardMaterial({ color: SKINS[skinId(id)].metal, roughness: 0.25, metalness: 0.78 });
  const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.75, roughness: 0.3 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x081528, metalness: 0.8, roughness: 0.1, emissive: color, emissiveIntensity: 0.17 });
  const add = (geo, mat, xyz, scale) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...xyz);
    if (scale) mesh.scale.set(...scale);
    group.add(mesh);
    return mesh;
  };
  // Root is at tracked head position; proportions extend downward.
  add(new THREE.SphereGeometry(0.20, 12, 10), armor, [0, 0, 0]);
  add(new THREE.BoxGeometry(0.31, 0.12, 0.075), visor, [0, 0.015, -0.15]);
  add(new THREE.BoxGeometry(0.31, 0.014, 0.025), glow, [0, 0.075, -0.184]);
  add(new THREE.CylinderGeometry(0.075, 0.09, 0.13, 10), shell, [0, -0.23, 0]);
  add(new THREE.CylinderGeometry(0.22, 0.19, 0.55, 10), shell, [0, -0.60, 0]);
  add(new THREE.BoxGeometry(0.39, 0.24, 0.12), armor, [0, -0.49, -0.12]);
  add(new THREE.BoxGeometry(0.11, 0.035, 0.025), glow, [0, -0.48, -0.19]);
  add(new THREE.BoxGeometry(0.38, 0.13, 0.24), shell, [0, -0.91, 0]);
  for (const side of [-1, 1]) {
    add(new THREE.SphereGeometry(0.115, 10, 8), armor, [side * 0.27, -0.40, 0]);
    add(new THREE.CylinderGeometry(0.075, 0.065, 0.40, 8), shell, [side * 0.30, -0.65, -0.03]);
    add(new THREE.BoxGeometry(0.08, 0.17, 0.055), armor, [side * 0.30, -0.61, -0.102]);
    add(new THREE.BoxGeometry(0.04, 0.09, 0.04), glow, [side * 0.30, -0.59, -0.136]);
    add(new THREE.CylinderGeometry(0.105, 0.083, 0.58, 9), armor, [side * 0.13, -1.25, 0]);
    add(new THREE.CylinderGeometry(0.082, 0.075, 0.44, 9), shell, [side * 0.13, -1.72, -0.03]);
    add(new THREE.BoxGeometry(0.19, 0.12, 0.3), armor, [side * 0.13, -1.99, -0.08]);
  }
  return { group, materials: [shell, armor, glow, visor] };
}
