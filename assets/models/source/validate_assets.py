"""Independent structural checks for the delivered GLB files (stdlib + Pillow)."""
import io,json,math,pathlib,struct
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parent
REQUIRED={'wand':['Muzzle'],'staff':['Muzzle','Crystal'],'blade':['Tip'],'bow':['String'],'gauntlet':['Muzzle'],'guardian':['WeakPoint'],'boss':['WeakPoint']}
WEAPONS={'wand','staff','blade','bow','gauntlet'}
ENEMIES={'wisp','fairy','skull','guardian','eye'}
NAMES=WEAPONS|ENEMIES|{'boss','obelisk','platform','seal','rune-target','mana-crystal'}
results=[]
for name in sorted(NAMES):
 raw=(ROOT/(name+'.glb')).read_bytes()
 magic,version,length=struct.unpack_from('<III',raw)
 assert (magic,version,length)==(0x46546c67,2,len(raw))
 lengthj,kind=struct.unpack_from('<II',raw,12); assert kind==0x4e4f534a
 g=json.loads(raw[20:20+lengthj]); offset=20+lengthj
 lengthb,kind=struct.unpack_from('<II',raw,offset); assert kind==0x004e4942
 binary=raw[offset+8:]; assert len(binary)==lengthb
 assert g['asset']['version']=='2.0' and len(g['materials'])==len(g['images'])==len(g['textures'])==len(g['meshes'])==1
 assert not g.get('animations') and not g.get('skins') and not g.get('extensionsRequired')
 assert all('uri' not in x for x in g['buffers']+g['images'])
 assert g['buffers'][0]['byteLength']<=len(binary)
 for view in g['bufferViews']:
  assert view.get('byteOffset',0)%4==0
  assert view.get('byteOffset',0)+view['byteLength']<=g['buffers'][0]['byteLength']
 prim=g['meshes'][0]['primitives'][0]; assert len(g['meshes'][0]['primitives'])==1 and prim['mode']==4
 def readattr(key,width):
  a=g['accessors'][prim['attributes'][key]]; v=g['bufferViews'][a['bufferView']]
  assert a['componentType']==5126 and a['count']*width*4==v['byteLength']
  vals=struct.unpack_from('<'+'f'*(a['count']*width),binary,v['byteOffset'])
  assert all(math.isfinite(x) for x in vals)
  return list(zip(*(iter(vals),)*width))
 pos=readattr('POSITION',3); normals=readattr('NORMAL',3); uv=readattr('TEXCOORD_0',2); eu=readattr('TEXCOORD_1',2)
 assert len(pos)==len(normals)==len(uv)==len(eu) and len(pos)%3==0
 assert all(abs(sum(x*x for x in n)-1)<1e-4 for n in normals)
 assert all(0<=u<=1 and 0<=v<=1 for u,v in uv+eu)
 degenerate=0
 for i in range(0,len(pos),3):
  a,b,c=pos[i:i+3]; u=[b[j]-a[j] for j in range(3)]; v=[c[j]-a[j] for j in range(3)]
  cr=(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])
  if sum(x*x for x in cr)<1e-20: degenerate+=1
 assert degenerate==0,(name,degenerate)
 tris=len(pos)//3; limit=5000 if name in WEAPONS else 3000 if name in ENEMIES else 12000 if name=='boss' else 2000
 assert tris<=limit
 nodes={n['name']:n for n in g['nodes']}
 assert all(n in nodes for n in REQUIRED.get(name,[]))
 assert nodes[name].get('translation',[0,0,0])==[0,0,0]
 assert nodes[name].get('scale',[1,1,1])==[1,1,1]
 mat=g['materials'][0]
 assert mat['pbrMetallicRoughness']['baseColorTexture']['index']==mat['emissiveTexture']['index']==0
 assert mat['emissiveTexture']['texCoord']==1
 assert mat['alphaMode']==('BLEND' if name=='blade' else 'OPAQUE')
 image=g['images'][0]; view=g['bufferViews'][image['bufferView']]
 im=Image.open(io.BytesIO(binary[view['byteOffset']:view['byteOffset']+view['byteLength']]))
 dim=512 if name in {'wisp','fairy','skull','rune-target','mana-crystal'} else 1024
 assert im.size==(dim,dim)
 results.append({'file':name+'.glb','status':'PASS','triangles':tris,'triangle_limit':limit,'bytes':len(raw),'degenerate_triangles':degenerate,'texture_px':dim,'required_nodes':REQUIRED.get(name,[])})
report={'checks':'GLB headers, embedded buffers and PNG, accessors, finite geometry, normalized normals, UVs, nondegenerate triangles, budgets, material and texture count, named nodes, no skins or animations','runtime_test':'Not tested on Meta Quest or in a WebXR runtime; this is a local structural check, not the Khronos validator.','results':results}
(ROOT/'validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(f'PASS: {len(results)} GLB files, {sum(r["triangles"] for r in results)} triangles, {sum(r["bytes"] for r in results)/1048576:.2f} MiB total')
