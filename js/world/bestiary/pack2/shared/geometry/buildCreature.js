import { createFaunaBehavior } from '../runtime/behaviors.js';
import { materialSurface } from './materials.js';
/**
 * VR-atu procedural creatures, Three.js r160; no npm, no GLTF download.
 * Public API: buildCreature(THREE, def, opts) -> THREE.Group.
 * All geometry is generated at runtime, each LOD is separately budgeted.
 * Convention: meters; +Y up, +Z front. Attachments: head, WeakPoint, hand_R.
 */
const SOLID = 0xffffff;
const TRIANGLE_LIMITS = Object.freeze({ mob: [3000, 1300, 360], boss: [15000, 6000, 1400], myth: [3000, 1300, 360], fauna: [3000, 1300, 360], npc: [3000, 1300, 360] });
export const ANIMATION_NAMES = Object.freeze(['idle','walk','run','attack','hit','death']);
export const ATTACK_WINDUP = 0.48; // >= 0.4s telegraph before damage event
export function countTriangles(object) {
  let triangles = 0;
  object.traverse((node) => {
    if (!node.isMesh || !node.geometry) return;
    const geom = node.geometry;
    const n = geom.index ? geom.index.count : geom.attributes?.position?.count || 0;
    triangles += Math.floor(n / 3);
  });
  return triangles;
}
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const pick = (def, a, b) => (def.id.length % 2 ? a : b);

export function buildCreature(THREE, def, opts = {}) {
  if (!THREE?.Group || !def?.id) throw new Error('buildCreature requires Three.js and a creature definition');
  const root = new THREE.Group();
  root.name = def.id;
  const s = def.scale * (opts.scale || 1);
  const colored = new THREE.Color(def.color);
  const emissive = new THREE.Color(def.pbr.emissive);
  const metal = def.pbr.metalness;
  const dissolveUniform = {value:0};
  const materials = [];
  const sets = [];
  const worldLOD = new THREE.LOD();
  worldLOD.name = 'tri-LOD';
  root.add(worldLOD);
  const emitters = [];
  const parts = [];
  const createdGeometries = [];
  const mkMat = (base, rough = def.pbr.roughness, metallic = metal, glow = false) => {
    const family = def.shape === 'dragon' ? 'scale' : def.shape === 'golem' ? 'stone' : ['quad','horse','camel','wingedhorse','bird'].includes(def.shape) ? 'fur' : def.kind === 'npc' ? 'cloth' : def.shape === 'humanoid' ? 'cloth' : 'stone';
    const tex = materialSurface(THREE, family, opts);
    const mat = new THREE.MeshStandardMaterial({
      ...tex, color: base, roughness: rough, metalness: metallic,
      emissive: glow ? emissive : 0x000000,
      emissiveIntensity: glow ? def.pbr.emissiveIntensity : 0,
      side: THREE.FrontSide
    });
    // PBR-compatible stochastic world/local dissolution edge, no alpha blending.
    mat.userData.dissolve = 0;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uDissolve = dissolveUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vATUPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvATUPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vATUPos;\nuniform float uDissolve;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          float atuNoise = fract(sin(dot(vATUPos * 12.0, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          if (uDissolve > 0.001 && atuNoise < uDissolve) discard;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          if (uDissolve > 0.001 && abs(atuNoise - uDissolve) < 0.095)
            totalEmissiveRadiance += vec3(0.24, 0.73, 1.0);`);
      mat.userData.dissolveUniform = shader.uniforms.uDissolve;
    };
    mat.customProgramCacheKey = () => 'atu-dissolve-pbr-v1';
    materials.push(mat);
    if (glow) emitters.push(mat);
    return mat;
  };
  const main = mkMat(colored);
  const shadow = mkMat(colored.clone().multiplyScalar(0.60), .86);
  const light = mkMat(colored.clone().lerp(new THREE.Color(0xffffff), .40), .64);
  const decorative = mkMat(new THREE.Color(pick(def, '#d4aa5c', '#b2a09a')), .36, .76);
  const rune = mkMat(new THREE.Color(def.pbr.emissive), .36, .40, true);
  const pupil = mkMat(0x0b1522, .21, .15);

  function geom(type, t, x, y, z) {
    let g;
    switch (type) {
      case 'sphere': g = new THREE.SphereGeometry(1, t.slices, t.rings); break;
      case 'cone': g = new THREE.ConeGeometry(1, 1, t.slices, 1); break;
      case 'cylinder': g = new THREE.CylinderGeometry(1, 1, 1, t.slices, 1); break;
      case 'box': g = new THREE.BoxGeometry(1, 1, 1); break;
      case 'torus': g = new THREE.TorusGeometry(1, 0.12, t.torus, t.slices); break;
      default: throw new Error('Unsupported geometry: ' + type);
    }
    createdGeometries.push(g);
    const mesh = new THREE.Mesh(g, x);
    mesh.position.set(y[0],y[1],y[2]);
    mesh.scale.set(z[0],z[1],z[2]);
    mesh.castShadow = opts.shadows === true && t.idx === 0;
    mesh.receiveShadow = false;
    return mesh;
  }
  function anatomy(level) {
    const t = level === 0 ? { slices: def.kind === 'boss' ? 15 : 10, rings: def.kind === 'boss' ? 11 : 7, torus: 4, idx: 0 } :
      level === 1 ? { slices: 6, rings: 4, torus: 3, idx: 1 } :
        { slices: 4, rings: 3, torus: 3, idx: 2 };
    const g = new THREE.Group();
    const rig = { torso: new THREE.Group(), head: new THREE.Group(), arms: [], legs: [], tail: new THREE.Group(), wings: [], runes: [], spikes: [] };
    g.add(rig.torso); g.add(rig.tail);
    const add = (parent, type, mat, pos, size, rot) => {
      const ob = geom(type, t, mat, pos, size);
      if (rot) ob.rotation.set(rot[0], rot[1], rot[2]);
      parent.add(ob); return ob;
    };
    const ball = (parent, mat, p, r) => add(parent,'sphere',mat,p,r);
    const bar = (parent, mat, from, to, thick) => {
      const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
      const dir = new THREE.Vector3().subVectors(b,a);
      const mid = new THREE.Vector3().addVectors(a,b).multiplyScalar(.5);
      const ob = add(parent,'cylinder',mat,mid.toArray(),[thick,dir.length(),thick]);
      ob.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
      return ob;
    };
    const legs = (positions, length, bulky = false) => positions.forEach((p) => {
      const limb = new THREE.Group(); limb.position.set(p[0],p[1],p[2]); rig.torso.add(limb);
      ball(limb, bulky?main:shadow,[0,-length/2,0], [bulky?.20:.13,length*.58,bulky?.20:.13]);
      ball(limb, shadow,[0,-length*.90,.09],[.17,.12,.24]); rig.legs.push(limb);
    });
    const humanoid = ['humanoid','golem','winged'].includes(def.shape);
    const bird = def.shape === 'bird';
    const quad = ['quad','horse','camel','wingedhorse'].includes(def.shape);
    const insect = ['insect','spider'].includes(def.shape);
    const serpent = def.shape === 'serpent';
    const fish = def.shape === 'fish';
    const dragon = def.shape === 'dragon';
    const blob = ['blob','wisp'].includes(def.shape);
    if (humanoid) {
      ball(rig.torso, main,[0,1.30,0],[.44,.63,.29]);
      ball(rig.torso,light,[0,1.53,.13],[.36,.29,.20]);
      rig.head.position.set(0,1.90,0); rig.torso.add(rig.head);
      ball(rig.head,main,[0,0,0],[.32,.36,.30]);
      ball(rig.head,light,[-.11,.045,.273],[.063,.070,.040]);
      ball(rig.head,light,[ .11,.045,.273],[.063,.070,.040]);
      if(level < 2) {ball(rig.head,pupil,[-.11,.045,.305],[.030,.042,.020]);ball(rig.head,pupil,[.11,.045,.305],[.030,.042,.020]);}
      for(const side of [-1,1]) {
        const arm = new THREE.Group(); arm.position.set(side*.46,1.64,0); rig.torso.add(arm);
        ball(arm, main,[side*.095,-.27,0],[.17,.38,.18]);
        ball(arm,shadow,[side*.12,-.58,.04],[.14,.13,.14]); rig.arms.push(arm);
      }
      legs([[-.21,.99,0],[.21,.99,0]],.95,def.kind==='boss');
      if (level===0) {
        // Oyu-ornament silhouette: golden torus circles on chest / shoulders.
        rig.runes.push(add(rig.torso,'torus',decorative,[0,1.48,.304],[.14,.14,.07]));
        add(rig.head,'cone',decorative,[0,.40,0],[.30,.34,.30]);
        if(def.kind === 'npc') {
          ball(rig.head,shadow,[0,.34,0],[.30,.10,.30]);
          for (const side of [-1,1]) ball(rig.torso, decorative,[side*.39,1.37,.12],[.07,.26,.07]);
          if(def.id==='npc_aksakal') ball(rig.head,light,[0,-.25,.20],[.22,.34,.15]);
          if(def.id==='npc_saukele') add(rig.head,'cone',decorative,[0,.72,0],[.25,.95,.25]);
          if(def.id==='npc_merchant') ball(rig.torso,shadow,[.45,1.02,-.18],[.27,.34,.23]);
          if(def.id==='npc_baksy') bar(rig.arms[1],decorative,[.06,-.18,.20],[.06,-1.62,.20],.068);
          if(def.id==='npc_smith') { bar(rig.arms[1],shadow,[.14,-.55,.12],[.14,-1.10,.12],.09);add(rig.arms[1],'box',decorative,[.14,-1.13,.12],[.42,.17,.20]); }
        }
      }
      if (def.shape==='winged') for (const side of [-1,1]) {
        const wing = new THREE.Group(); wing.position.set(side*.42,1.49,-.24);rig.torso.add(wing);
        ball(wing,light,[side*.37,.13,-.06],[.49,.08,.28]);rig.wings.push(wing);
      }
      if (def.kind==='boss') {
        for(const side of [-1,1]) {rig.spikes.push(add(rig.head,'cone',decorative,[side*.23,.36,-.08],[.13,.38,.13],[0,0,side*-.30]));}
      }
    } else if (quad || dragon) {
      const extent = dragon ? .95 : .77;
      ball(rig.torso, main,[0,1.05,0],[.43,.40,extent]);
      ball(rig.torso,light,[0,1.12,.42],[.29,.30,.48]);
      rig.head.position.set(0,1.28,extent*.88); rig.torso.add(rig.head);
      ball(rig.head,main,[0,.08,.18],[.32,.32,.42]);
      ball(rig.head,light,[0,-.06,.50],[.24,.18,.33]);
      if (level < 2) for(const side of [-1,1]) ball(rig.head,rune,[side*.21,.19,.40],[.06,.06,.05]);
      const z = dragon ? .72 : .48;
      legs([[-.29,.92,-z],[.29,.92,-z],[-.29,.92,z],[.29,.92,z]],.89,dragon);
      rig.tail.position.set(0,1.10,-extent); rig.torso.add(rig.tail);
      const segs = level===2 ? 1 : 3;
      for (let i=0;i<segs;i++) ball(rig.tail,i===segs-1?decorative:main,[0,-.04*i,-.24-i*.24],[.19-i*.055,.19-i*.052,.36]);
      if (level<2) for(const side of [-1,1]) add(rig.head,'cone',decorative,[side*.19,.44,.02],[.12,.34,.12],[0,0,side*-.25]);
      if (def.shape==='camel') for(const hump of [-.4,.26]) ball(rig.torso,main,[0,1.48,hump],[.33,.31,.30]);
      if (dragon || def.shape==='wingedhorse') {
        for(const side of [-1,1]) {
          const wing = new THREE.Group(); wing.position.set(side*.30,1.33,-.12); rig.torso.add(wing);
          add(wing,'cone',main,[side*.58,.37,0],[.78,1.18,.11],[0,0,side*-.45]); rig.wings.push(wing);
          if(level===0) add(wing,'cone',decorative,[side*.35,.62,-.08],[.14,.72,.06],[0,0,side*.42]);
        }
      }
      if (dragon && level === 0) for (let i=0;i<4;i++) add(rig.torso,'cone',decorative,[0,1.43,-.60+i*.39],[.14,.36,.14]);
    } else if (bird) {
      ball(rig.torso,main,[0,1.23,0],[.33,.52,.40]);
      rig.head.position.set(0,1.73,.23); rig.torso.add(rig.head);
      ball(rig.head,light,[0,0,0],[.25,.24,.25]);
      add(rig.head,'cone',decorative,[0,-.08,.33],[.10,.27,.14],[Math.PI/2,0,0]);
      for(const side of [-1,1]) {
        const wing = new THREE.Group(); wing.position.set(side*.31,1.48,.0); rig.torso.add(wing);
        ball(wing,main,[side*.50,-.08,-.06],[.76,.12,.32]); rig.wings.push(wing);
        if(level<2) ball(wing,shadow,[side*1.00,-.19,-.08],[.38,.10,.21]);
      }
      for(const side of [-1,1]) bar(rig.torso,decorative,[side*.14,1.02,.05],[side*.14,.60,.19],.06);
      if (level < 2) for(const side of [-1,1]) ball(rig.head,rune,[side*.18,.035,.16],[.038,.045,.04]);
    } else if (insect) {
      ball(rig.torso,shadow,[0,.93,-.15],[.46,.38,.54]);
      ball(rig.torso,main,[0,1.05,.30],[.30,.32,.35]);
      rig.head.position.set(0,1.13,.58); rig.torso.add(rig.head);
      ball(rig.head,main,[0,0,0],[.27,.23,.25]);
      for (let i=0;i<(def.shape==='spider'?4:3);i++) for(const side of [-1,1]) {
        const leg = new THREE.Group(); leg.position.set(side*.20,.92,.08-i*.18); rig.torso.add(leg);
        bar(leg,shadow,[0,0,0],[side*.58,-.30,.15-i*.2],.068);
        rig.legs.push(leg);
      }
      if(level<2) for(const side of [-1,1]) ball(rig.head,rune,[side*.16,.045,.16],[.058,.058,.050]);
      if (def.shape==='insect') for(const side of [-1,1]) {
        const wing = new THREE.Group(); wing.position.set(side*.18,1.21,-.21); rig.torso.add(wing);
        ball(wing,light,[side*.46,.13,-.14],[.55,.05,.31]); rig.wings.push(wing);
      }
    } else if (fish) {
      ball(rig.torso,main,[0,.98,0],[.24,.25,.68]);
      rig.head.position.set(0,1.0,.52); rig.torso.add(rig.head);
      ball(rig.head,light,[0,0,.04],[.25,.22,.25]);
      rig.tail.position.set(0,.98,-.64); rig.torso.add(rig.tail);
      add(rig.tail,'cone',main,[0,0,-.25],[.45,.13,.55],[Math.PI/2,0,0]);
      for(const side of [-1,1]) add(rig.torso,'cone',light,[side*.16,.94,.08],[.27,.08,.34],[0,0,side*.48]);
    } else if (serpent) {
      for(let i=0;i<(level===2?3:6);i++) ball(rig.torso,i%2?main:shadow,[0,.55+i*.12,-.86+i*.31],[.28-i*.017,.27-i*.01,.37]);
      rig.head.position.set(0,1.34,1.03); rig.torso.add(rig.head);
      ball(rig.head,main,[0,0,0],[.32,.27,.40]);
      for(const side of [-1,1]) ball(rig.head,rune,[side*.19,.12,.25],[.04,.05,.045]);
    } else if (blob) {
      ball(rig.torso,main,[0,.87,0],[.70,.78,.58]);
      rig.head.position.set(0,1.45,.28); rig.torso.add(rig.head);
      if(level<2) for(const side of [-1,1]) ball(rig.head,rune,[side*.21,0,.28],[.085,.11,.057]);
      if(level===0) for(let i=0;i<3;i++) ball(rig.torso,i%2?rune:light,[Math.cos(i*2.2)*.46,1.20+i*.16,Math.sin(i*2.2)*.35],[.20,.16,.19]);
    }
    // Additional non-blended language-specific silhouette and glowing oyu for bosses.
    if(def.kind==='boss' && level<2) {
      rig.runes.push(add(rig.torso,'torus',rune,[0,1.72,.29],[.22,.18,.20]));
      if(level===0) {
        rig.runes.push(add(rig.torso,'torus',decorative,[0,1.72,.29],[.31,.27,.25]));
        for(const side of [-1,1]) rig.spikes.push(add(rig.torso,'cone',rune,[side*.38,1.86,.05],[.12,.30,.12],[0,0,-side*.6]));
      }
    }
    return {g,rig};
  }
  for(let level=0;level<3;level++) {
    const {g,rig} = anatomy(level);
    const triangles = countTriangles(g);
    const limit = TRIANGLE_LIMITS[def.kind][level];
    if(triangles > limit) throw new Error(`${def.id} LOD${level}: ${triangles} triangles exceed ${limit}`);
    sets.push({g, rig, triangles, limit});
    parts.push(rig);
    worldLOD.addLevel(g, (level === 0 ? 0 : level === 1 ? 13 : 30) * s);
  }
  worldLOD.scale.setScalar(s);
  // Stable mount nodes independent of LOD switches.
  const attachments = {};
  const attach = (name,x,y,z) => {
    const ob = new THREE.Group(); ob.name=name; ob.position.set(x*s,y*s,z*s);
    root.add(ob); attachments[name]=ob;
  };
  attach('head',0,1.90, .20);
  attach('WeakPoint',0,1.45,.36);
  attach('hand_R',.65,1.03,.23);
  const bounds = { radius: def.hitbox.radius*(opts.scale||1), height: def.hitbox.height*(opts.scale||1), halfExtents: [.63*s,1.125*s,1.14*s] };
  const state = { name:'idle', clock:0, duration:1, didHit:false, ended:false, dead:false, phase:0 };
  const clipDurations = Object.freeze({ idle:2.4,walk:.93,run:.62,attack:1.15,hit:.48,death:1.50 });
  const baseGlows = emitters.map(m=>m.emissiveIntensity);
  const updatePhase = hpFraction => {
    const next = def.kind === 'boss' ? (hpFraction <= .33 ? 2 : hpFraction <= .66 ? 1 : 0) : 0;
    state.phase = next;
    emitters.forEach((m,i)=> m.emissiveIntensity = baseGlows[i] * (1 + next*.9));
    root.userData.visualPhase = def.phases[next] || null;
    return next;
  };
  const setAnimation = (name) => {
    if(!ANIMATION_NAMES.includes(name)) throw new Error(`Unknown animation ${name}`);
    state.name = name; state.clock = 0; state.didHit=false; state.ended=false;
    if(name==='death') state.dead=true;
    return state;
  };
  const setDissolve = value => {
    const d = clamp01(value);
    dissolveUniform.value = d;
    materials.forEach(m=> { m.userData.dissolve = d; });
    root.visible = d < 1;
  };
  const animator = {
    state, clips:clipDurations, attackWindup:ATTACK_WINDUP,
    setAnimation, setDissolve, updatePhase,
    update(dt) {
      dt = Math.min(Math.max(dt,0),.1);
      state.clock += dt;
      const t=state.clock, a=state.name, k=clipDurations[a];
      const speed = a==='run'?1.7:a==='walk'?1:0;
      for(const rig of parts) {
        const walk=Math.sin(t*(a==='run'?13:8));
        rig.torso.position.y = (a==='idle'?.027*Math.sin(t*2.4): speed*.025*Math.abs(walk));
        rig.torso.rotation.y = a==='idle' ? .020*Math.sin(t*.8) : 0;
        rig.torso.rotation.x = a==='hit' ? -.2*Math.sin(Math.PI*Math.min(1,t/k)) : 0;
        rig.head.rotation.z = a==='idle' ? .045*Math.sin(t*1.1) : 0;
        for(let i=0;i<rig.legs.length;i++) rig.legs[i].rotation.x=speed*.42*Math.sin(t*8*speed+(i%2?Math.PI:0));
        for(let i=0;i<rig.arms.length;i++) rig.arms[i].rotation.x=speed*.38*Math.sin(t*8*speed+(i%2?0:Math.PI));
        for(let i=0;i<rig.wings.length;i++) rig.wings[i].rotation.z = .24*Math.sin(t*(a==='run'?11:6))*(i%2?-1:1);
        rig.tail.rotation.y = .12*Math.sin(t*2.7);
        if(def.kind==='boss') {
          for(const o of rig.runes) o.rotation.z = state.phase * t*.55;
          for(const o of rig.spikes) o.scale.y = o.userData.baseScaleY ? o.userData.baseScaleY*(1+state.phase*.3) : (o.userData.baseScaleY=o.scale.y)*(1+state.phase*.3);
          for(const o of rig.wings) o.scale.x=1+state.phase*.20;
        }
        if(a==='attack') {
          const windup=Math.min(1,t/ATTACK_WINDUP);
          const swing=t<ATTACK_WINDUP ? -.85*windup : 1.3*Math.sin(Math.min(1,(t-ATTACK_WINDUP)/.21)*Math.PI/2);
          rig.arms.forEach((arm,i)=>arm.rotation.x=swing*(i===1?1:.65));
          rig.head.rotation.x=t<ATTACK_WINDUP?-.15*windup:.18;
        }
        if(a==='death') {
          const f=clamp01(t/k);
          rig.torso.rotation.z = -1.15*f;
          rig.torso.position.y=-.48*f;
        }
      }
      if(attachments.hand_R && parts[0].arms[1]) {
        const angle=parts[0].arms[1].rotation.x;
        attachments.hand_R.position.set(.58*s,(1.64-.58*Math.cos(angle)-.04*Math.sin(angle))*s,(-.58*Math.sin(angle)+.04*Math.cos(angle))*s);
      }
      if(a==='attack' && !state.didHit && t>=ATTACK_WINDUP){state.didHit=true; root.dispatchEvent({type:'attack-impact', creatureId:def.id});}
      if(a==='death') setDissolve(clamp01((t-.58)/.90));
      if(t>=k && !state.ended && ['attack','hit','death'].includes(a)) {
        state.ended=true; root.dispatchEvent({type:'animation-finished',action:a});
        if(a!=='death') setAnimation('idle');
      }
      if(['walk','run','idle'].includes(a) && t>30)state.clock%=k;
    }
  };
  root.userData = {
    creatureId:def.id, def, animator, attachments, hitbox: bounds,
    lod: sets.map((a,i)=>({ level:i, triangles:a.triangles, limit:a.limit, distance:worldLOD.levels[i].distance })),
    visualPhase:def.phases?.[0]||null,
    dispose() {
      for(const geo of createdGeometries) geo.dispose();
      for(const mat of materials) mat.dispose();
    }
  };
  if(def.kind==='fauna')root.userData.behavior = createFaunaBehavior(THREE,root,def,opts);
  return root;
}
