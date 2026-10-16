import * as THREE from 'three';
import { OBSTACLES, ARENA_HALF_X, ARENA_HALF_Z, SPAWNS } from './pvp-layout.js';

const CYAN = 0x3ec5ff;
const ORANGE = 0xff9b54;
const GOLD = 0xffd23f;

// Lightweight procedural VR map. No external textures/assets or shader compilation needed.
export function createPvpMap(scene) {
  const group = new THREE.Group();
  group.name = 'ATU BASTION | VR PvP';
  group.visible = false;
  scene.add(group);

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x252d37, roughness: 0.84, metalness: 0.17 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x222c39, roughness: 0.65, metalness: 0.48 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x8c9cac, roughness: 0.34, metalness: 0.7 });
  const cover = new THREE.MeshStandardMaterial({ color: 0x435160, roughness: 0.58, metalness: 0.48 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b1b30, roughness: 0.2, metalness: 0.78 });
  const blueLight = new THREE.MeshBasicMaterial({ color: CYAN });
  const redLight = new THREE.MeshBasicMaterial({ color: ORANGE });
  const goldLight = new THREE.MeshBasicMaterial({ color: GOLD });
  const steel = new THREE.MeshStandardMaterial({ color: 0x101a24, roughness: 0.4, metalness: 0.76 });
  const bevel = new THREE.MeshStandardMaterial({ color: 0x727f90, roughness: 0.34, metalness: 0.8 });
  const grounds = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.11, depthWrite: false, side: THREE.DoubleSide });
  const groundsB = new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.11, depthWrite: false, side: THREE.DoubleSide });

  const cube = new THREE.BoxGeometry(1, 1, 1);
  function block(x,y,z,w,h,d,mat,parent=group) {
    const mesh = new THREE.Mesh(cube, mat);
    mesh.position.set(x,y,z);
    mesh.scale.set(w,h,d);
    parent.add(mesh);
    return mesh;
  }
  const floor = block(0,-0.16,0,21.8,.3,24.0,floorMat);
  floor.receiveShadow = false;
  // raised safety edge and all-solid perimeter, never just decorative boundaries.
  for (const x of [-10.85,10.85]) block(x,2.25,0,0.5,4.5,24.1,wallMat);
  for (const z of [-11.95,11.95]) block(0,2.25,z,21.8,4.5,0.5,wallMat);

  // Wall capping and vertical line lights act as long-distance direction cues.
  for (const z of [-11.95, 11.95]) {
    block(0,4.48,z,21.8,0.09,0.5,bevel);
    for (let x = -9; x < 10; x += 3.2) block(x,2.2,z + (z>0?-.26:.26),.045,3.8,.03,z>0?blueLight:redLight);
  }
  for (const x of [-10.85,10.85]) {
    block(x,4.48,0,0.5,.09,24.1,bevel);
    for (let z=-9;z<10;z+=4) block(x+(x>0?-.26:.26),2.15,z,.03,3.7,.055,blueLight);
  }

  // Routed floor lines guide players through three ground-level lanes.
  for (const x of [-8.5, 0, 8.5]) {
    for (const side of [-1,1]) {
      block(x,0.008,side*5.1,.09,.012,4.6,x===0?goldLight:blueLight);
    }
  }
  // Central area: stripe markings make walking direction legible without a HUD.
  for (let z=-6; z<=6; z+=2) {
    for (const x of [-9.7, 9.7]) block(x,.012,z,.65,.014,.11,goldLight);
  }

  const casingByKind = { core:wallMat, pillar:wallMat, screen:wallMat, container:cover, cover:cover };
  for (const o of OBSTACLES) {
    const color = casingByKind[o.kind] || wallMat;
    const body = block(o.x,o.h/2,o.z,o.w,o.h,o.d,color);
    body.userData.pvpObstacle = true;
    // Thin panels stay inside the physics footprint: no invisible protrusions.
    const ringMat = o.z >= 0 ? blueLight : redLight;
    const t = Math.min(0.08, o.h * 0.08);
    block(o.x,o.h-t/2,o.z,o.w,t,o.d,bevel);
    block(o.x,o.h*0.48,o.z+o.d/2-0.015,o.w*0.72,.028,.03,ringMat);
    block(o.x,o.h*0.48,o.z-o.d/2+0.015,o.w*0.72,.028,.03,ringMat);
    if (o.h > 2) {
      for (const sign of [-1,1]) {
        block(o.x + sign*(o.w/2-0.04),o.h/2,o.z,.07,o.h*.65,.04,steel);
      }
    }
  }

  // Protected deployment zones: distinct team palettes, numbers and route arrows.
  const plane = new THREE.PlaneGeometry(15.8, 3.2);
  for (const [team, z, color, mat] of [
    ['alpha',9.4,CYAN,grounds], ['bravo',-9.4,ORANGE,groundsB],
  ]) {
    const zone = new THREE.Mesh(plane, mat);
    zone.rotation.x = -Math.PI/2;
    zone.position.set(0,.01,z);
    group.add(zone);
    // spawn pad rings at every possible spawn point, slightly above floor.
    const circles = new THREE.RingGeometry(.42,.48,24);
    const padMat = new THREE.MeshBasicMaterial({ color, transparent:true, opacity:.64, side:THREE.DoubleSide, depthWrite:false });
    for (const p of SPAWNS[team]) {
      const pad = new THREE.Mesh(circles, padMat);
      pad.rotation.x = -Math.PI/2;
      pad.position.set(p[0],.02,p[1]);
      group.add(pad);
    }
    const sign = createSignTexture(team === 'alpha' ? 'ATU  //  АЛЬФА' : 'ATU  //  БРАВО', color);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(4.3,.78),new THREE.MeshBasicMaterial({ map:sign, transparent:true, side:THREE.DoubleSide, toneMapped:false }));
    banner.position.set(0,2.65,z>0?11.64:-11.64);
    if(z>0)banner.rotation.y=Math.PI;
    group.add(banner);
    // Directional border markers in team colour, above head height.
    block(-9.75,2.15,z,.06,2.1,.17,z>0?blueLight:redLight);
    block(9.75,2.15,z,.06,2.1,.17,z>0?blueLight:redLight);
  }

  // Centre insignia. A unique ATU visual identity, not any copied CS map artwork.
  const centreSign = createSignTexture('ATU  BASTION',GOLD);
  for (const face of [-1,1]) {
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(2.25,.48),
      new THREE.MeshBasicMaterial({map:centreSign,transparent:true,side:THREE.DoubleSide,toneMapped:false})
    );
    flag.position.set(0,2.0,face*1.215);
    if(face===1)flag.rotation.y=Math.PI;
    group.add(flag);
  }

  // Props: inset bolts on crates, illuminated aisle numbers, hazard bands.
  for (const o of OBSTACLES) {
    if(o.kind!=='container' && o.kind!=='cover')continue;
    for(const side of [-1,1]) {
      block(o.x + side*(o.w/2-.075),o.h*.65,o.z,.04,.15,.15,trim);
    }
    block(o.x,o.h-.14,o.z,.55,.025,Math.min(.06,o.d),goldLight);
  }
  const entrySign = createSignTexture('ATU  /  01', CYAN);
  for(const x of [-8.65,8.65]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1,.28),
      new THREE.MeshBasicMaterial({map:entrySign,transparent:true,side:THREE.DoubleSide}));
    sign.position.set(x,2.75,0);
    sign.rotation.y=x>0?Math.PI/2:-Math.PI/2;
    group.add(sign);
  }

  // No flashing strobes, screen shaking, heavy postprocessing or sharp VR height changes.
  return {
    group,
    setVisible(visible) {group.visible=!!visible;},
  };
}

function createSignTexture(text,color) {
  const c=document.createElement('canvas');
  c.width=512;c.height=128;
  const ctx=c.getContext('2d');
  ctx.fillStyle='rgba(6,16,31,.88)';ctx.fillRect(0,0,512,128);
  ctx.strokeStyle='#61788b';ctx.lineWidth=6;ctx.strokeRect(5,5,502,118);
  ctx.fillStyle='#152637';ctx.fillRect(15,16,482,94);
  ctx.fillStyle='#'+new THREE.Color(color).getHexString();
  ctx.fillRect(24,25,8,78);
  ctx.font='bold 37px system-ui, sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(text,265,65);
  const texture=new THREE.CanvasTexture(c);
  texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
