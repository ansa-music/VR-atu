/** Quest-friendly tiled PBR detail. Procedural 256px diffuse variation/bump;
    textures generated once per material family, never fetched over network. */
const cache = new WeakMap();
const fnv = s => {let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
export function materialSurface(THREE, family, opts={}) {
  if(opts.proceduralTextures===false || typeof document==='undefined' || !document.createElement) return {};
  let map=cache.get(THREE); if(!map){map=new Map();cache.set(THREE,map);}
  if(map.has(family))return map.get(family);
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)return {};
  const img=ctx.createImageData(256,256), d=img.data;
  let seed=fnv(family);
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const mineral=family==='stone'||family==='scale'||family==='metal';
  const grain=family==='wood'||family==='cloth'||family==='fur';
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const i=(y*256+x)*4;
    let v=225+22*(rand()-.5);
    if(grain)v+=12*Math.sin(x*.13+Math.sin(y*.05)) + 6*Math.cos(y*.3);
    if(mineral)v+=12*Math.sin(x*.12+y*.05)+7*Math.sin((x-y)*.27);
    if(family==='scale')v+=19*Math.cos(Math.hypot((x%24)-12,(y%21)-10)*.36);
    if(family==='cloth' && x%64 < 2 && y%64 < 2)v-=30;
    if(family==='fur' && ((x+Math.round(y*.6))%19)<2)v-=16;
    d[i]=v;d[i+1]=v;d[i+2]=v;d[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  // Fine geometry scale is maintained at source-model, no huge maps.
  const diffuse=new THREE.CanvasTexture(canvas);
  diffuse.wrapS=diffuse.wrapT=THREE.RepeatWrapping;
  diffuse.repeat.set(2,2);diffuse.colorSpace=THREE.SRGBColorSpace;
  diffuse.anisotropy=2;
  const bump=diffuse.clone(); bump.colorSpace=THREE.NoColorSpace; bump.needsUpdate=true;
  const result={map:diffuse,bumpMap:bump,bumpScale: family==='fur'?.025:family==='stone'?.075:.039};
  map.set(family,result);return result;
}
