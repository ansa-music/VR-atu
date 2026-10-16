import * as THREE from 'three';
import { skinColor, skinId, SKINS } from './skins.js';

// Shared low-poly geometry: even eight simultaneous opponents allocate zero
// additional mesh geometry. Each avatar owns only six lightweight materials.
const CUBE = new THREE.BoxGeometry(1, 1, 1);
const SPHERE = new THREE.SphereGeometry(1, 12, 8);
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 9);
const PANEL = new THREE.PlaneGeometry(1, 1);
const TEAM_COLOR = Object.freeze({ alpha: 0x36d5ff, bravo: 0xff9959 });
const LABEL_TEXTURES = new Map();

function labelTexture(team) {
  if (LABEL_TEXTURES.has(team)) return LABEL_TEXTURES.get(team);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#111c2b'; ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = team === 'alpha' ? '#36d5ff' : '#ff9959';
  ctx.lineWidth = 7; ctx.strokeRect(5, 5, 246, 118);
  ctx.font = '800 53px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = '#eaf8ff'; ctx.fillText('ATU', 128, 72);
  ctx.font = '700 19px system-ui, sans-serif';
  ctx.fillStyle = team === 'alpha' ? '#36d5ff' : '#ff9959';
  ctx.fillText(team === 'alpha' ? 'АЛЬФА' : 'БРАВО', 128, 105);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  LABEL_TEXTURES.set(team, tex);
  return tex;
}

export function createCombatAvatar({ skin = 'cyan', team = 'alpha' } = {}) {
  skin = skinId(skin);
  team = team === 'bravo' ? 'bravo' : 'alpha';
  const root = new THREE.Group();
  root.name = 'ATU | Сетевой бронекостюм';
  const torso = new THREE.Group();
  const helmet = new THREE.Group();
  root.add(torso, helmet);
  const mats = {
    suit: new THREE.MeshStandardMaterial({ color: 0x172333, roughness: .83, metalness: .22 }),
    plates: new THREE.MeshStandardMaterial({ color: SKINS[skin].metal, roughness: .42, metalness: .67 }),
    edge: new THREE.MeshStandardMaterial({ color: 0x728ca2, roughness: .32, metalness: .8 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x061520, emissive: skinColor(skin), emissiveIntensity: .26, metalness: .55, roughness: .18 }),
    accent: new THREE.MeshStandardMaterial({ color: skinColor(skin), emissive: skinColor(skin), emissiveIntensity: .9, roughness: .27 }),
    team: new THREE.MeshStandardMaterial({ color: TEAM_COLOR[team], emissive: TEAM_COLOR[team], emissiveIntensity: .8, roughness: .34 }),
    insignia: new THREE.MeshBasicMaterial({ map: labelTexture(team), side: THREE.DoubleSide, toneMapped: false }),
  };
  const ownedMaterials = Object.values(mats);
  const part = (parent, geo, mat, xyz, scale) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...xyz);
    mesh.scale.set(...scale);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    parent.add(mesh);
    return mesh;
  };
  const b = (parent, mat, pos, scale) => part(parent, CUBE, mats[mat], pos, scale);
  const sp = (parent, mat, pos, scale) => part(parent, SPHERE, mats[mat], pos, scale);
  // Helmet / visored front (front is -Z); tilt JUST the helmet with the user's HMD.
  sp(helmet, 'plates', [0, .015, 0], [.208, .225, .205]);
  b(helmet, 'visor', [0, .035, -.197], [.322, .114, .039]);
  b(helmet, 'accent', [0, .108, -.217], [.25, .014, .028]);
  b(helmet, 'edge', [0, -.074, -.184], [.245, .085, .066]);
  b(helmet, 'suit', [0, -.155, -.067], [.13, .11, .15]);
  for (const side of [-1, 1]) {
    b(helmet, 'edge', [side * .19, .03, -.03], [.048, .2, .18]);
    b(helmet, 'team', [side * .221, .025, -.07], [.012, .058, .09]);
    b(helmet, 'plates', [side * .085, -.134, -.173], [.068, .06, .05]);
  }

  // Rib armour and ATU chest emblem.
  b(torso, 'suit', [0, -.6, 0], [.36, .62, .24]);
  b(torso, 'plates', [0, -.46, -.152], [.39, .27, .12]);
  b(torso, 'plates', [0, -.72, -.14], [.325, .19, .085]);
  b(torso, 'edge', [0, -.555, -.222], [.325, .019, .023]);
  b(torso, 'accent', [0, -.718, -.185], [.16, .022, .022]);
  b(torso, 'suit', [0, -.93, 0], [.34, .13, .22]);
  b(torso, 'plates', [0, -.945, -.134], [.34, .12, .075]);
  b(torso, 'team', [0, -.47, -.218], [.09, .06, .012]);
  // Label texture is shared between every soldier in the same team.
  const insignia = part(torso, PANEL, mats.insignia, [0, -.475, -.226], [.18, .091, 1]);

  const leftArm = new THREE.Group(), rightArm = new THREE.Group();
  const leftLeg = new THREE.Group(), rightLeg = new THREE.Group();
  for (const side of [-1, 1]) {
    const arm = side < 0 ? leftArm : rightArm;
    const leg = side < 0 ? leftLeg : rightLeg;
    arm.position.set(side * .24, -.4, 0);
    leg.position.set(side * .13, -1.01, 0);
    torso.add(arm, leg);
    sp(arm, 'plates', [side * .045, -.008, 0], [.145, .13, .132]);
    b(arm, 'team', [side * .135, -.025, -.027], [.014, .08, .12]);
    part(arm, CYLINDER, mats.suit, [side * .075, -.25, .005], [.093, .36, .091]);
    b(arm, 'plates', [side * .08, -.32, -.064], [.107, .2, .061]);
    b(arm, 'accent', [side * .078, -.33, -.099], [.043, .04, .014]);
    sp(arm, 'suit', [side * .08, -.49, .015], [.099, .11, .095]);
    // Grooved thigh, knee, shin, boot.
    part(leg, CYLINDER, mats.plates, [0, -.21, 0], [.12, .44, .125]);
    b(leg, 'edge', [0, -.43, -.11], [.21, .16, .085]);
    b(leg, 'team', [0, -.43, -.158], [.086, .025, .015]);
    part(leg, CYLINDER, mats.suit, [0, -.64, .015], [.095, .31, .105]);
    b(leg, 'plates', [0, -.65, -.093], [.153, .26, .06]);
    b(leg, 'plates', [0, -.845, -.09], [.20, .13, .30]);
  }
  let hitTime = 0;
  let walking = 0;
  let lastHealth = 100;

  function setStyle(nextSkin, nextTeam) {
    nextSkin = skinId(nextSkin);
    nextTeam = nextTeam === 'bravo' ? 'bravo' : 'alpha';
    const skinDef = SKINS[nextSkin];
    mats.plates.color.setHex(skinDef.metal);
    mats.visor.emissive.setHex(skinDef.color);
    mats.accent.color.setHex(skinDef.color);
    mats.accent.emissive.setHex(skinDef.color);
    mats.team.color.setHex(TEAM_COLOR[nextTeam]);
    mats.team.emissive.setHex(TEAM_COLOR[nextTeam]);
    mats.insignia.map = labelTexture(nextTeam);
    mats.insignia.needsUpdate = true;
  }
  function setHealth(health, alive = true, shield = false) {
    if (health < lastHealth && alive) hitTime = .25;
    lastHealth = health;
    root.visible = alive;
    mats.team.emissiveIntensity = shield ? 1.8 : .8;
  }
  function animate(dt, yaw, pitch, speed = 0) {
    dt = Math.max(0, Math.min(.06, dt));
    root.rotation.y = yaw;
    helmet.rotation.x += (THREE.MathUtils.clamp(pitch, -.9, .8) - helmet.rotation.x) * Math.min(1, dt * 12);
    // Grounded body, slight controlled stride rather than full-body head rotation.
    const stride = Math.min(1, speed / 3.2);
    walking += dt * (4 + speed * 1.6);
    leftLeg.rotation.x = Math.sin(walking) * .35 * stride;
    rightLeg.rotation.x = -leftLeg.rotation.x;
    leftArm.rotation.x = -leftLeg.rotation.x * .6;
    rightArm.rotation.x = -rightLeg.rotation.x * .6;
    if (hitTime > 0) hitTime = Math.max(0, hitTime - dt);
    mats.accent.emissiveIntensity = .9 + hitTime * 4;
  }
  function dispose() {
    for (const material of ownedMaterials) material.dispose();
    // CUBE, SPHERE, CYLINDER, PANEL and insignia textures are shared and retained.
  }
  setStyle(skin, team);
  return { group: root, setStyle, setHealth, animate, dispose, materials: ownedMaterials };
}
