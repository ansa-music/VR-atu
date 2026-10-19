"""Academy of Mages: deterministic low-poly GLB generator.
Run with Python 3.10+, Pillow and NumPy: python generate_assets.py
No Blender required. glTF coordinates: metres, Y up, forward -Z.
"""
import io, json, math, random, struct, pathlib, zipfile
from PIL import Image, ImageDraw, ImageFont

OUT = pathlib.Path(__file__).resolve().parent
random.seed(42)
PALETTE = [(26,31,58,255),(61,64,91,255),(105,112,142,255),
 (177,131,57,255),(239,198,104,255),(21,211,229,255),
 (139,74,241,255),(255,221,108,255),(9,11,25,255),
 (196,229,255,100),(218,224,216,255),(59,92,93,255),
 (127,63,92,255),(235,246,255,255),(0,0,0,255),(97,53,35,255)]
GLOW={5,6,7,9}
def add(a,b): return tuple(x+y for x,y in zip(a,b))
def sub(a,b): return tuple(x-y for x,y in zip(a,b))
def mul(a,t): return tuple(x*t for x in a)
def dot(a,b): return sum(x*y for x,y in zip(a,b))
def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def norm(a):
 l=math.sqrt(dot(a,a)); return mul(a,1/l) if l>1e-10 else (0,1,0)

def atlas(size):
 im=Image.new('RGBA',(size,size)); p=im.load(); cell=size//4
 rng=random.Random(11)
 for y in range(size):
  for x in range(size):
   i=(y//cell)*4+x//cell; c=PALETTE[i]
   noise=rng.uniform(-.045,.045) if i not in GLOW and i!=14 else 0
   grain=.025*math.sin(x*.13+y*.07) if i not in GLOW and i!=14 else 0
   p[x,y]=tuple(max(0,min(255,int(v*(1+noise+grain)))) for v in c[:3])+(c[3],)
 bio=io.BytesIO(); im.save(bio,format='PNG',optimize=True); return bio.getvalue()

class Model:
 def __init__(self,name,size=1024,alpha=False):
  self.name=name; self.size=size; self.alpha=alpha
  self.pos=[]; self.nor=[]; self.uv=[]; self.eu=[]; self.markers={}
 def face(self,verts,c):
  for j in range(1,len(verts)-1):
   tri=[verts[0],verts[j],verts[j+1]]
   n=norm(cross(sub(tri[1],tri[0]),sub(tri[2],tri[0])))
   for k,v in enumerate(tri):
    self.pos.append(v); self.nor.append(n)
    # Triangle samples stay within a single textured palette patch.
    u,vv=[(.22,.22),(.78,.22),(.5,.78)][k]
    self.uv.append(((c%4+u)/4,(c//4+vv)/4))
    e=c if c in GLOW else 14
    self.eu.append(((e%4+u)/4,(e//4+vv)/4))
 def box(self,p,s,c):
  x,y,z=p; a,b,d=[v/2 for v in s]
  vs=[(x+i*a,y+j*b,z+k*d) for i,j,k in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
  for f in [(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4),(3,7,6,2)]: self.face([vs[i] for i in f],c)
 def rod(self,a,b,r,c,n=8,r2=None):
  r2=r if r2 is None else r2; axis=norm(sub(b,a)); u=norm(cross(axis,(0,1,0) if abs(axis[1])<.95 else (1,0,0))); v=cross(axis,u)
  rings=[]
  for p,rr in [(a,r),(b,r2)]: rings.append([add(p,add(mul(u,rr*math.cos(i*math.tau/n)),mul(v,rr*math.sin(i*math.tau/n)))) for i in range(n)])
  for i in range(n):
   j=(i+1)%n; self.face([rings[0][i],rings[0][j],rings[1][j],rings[1][i]],c)
  self.face(list(reversed(rings[0])),c); self.face(rings[1],c)
 def orb(self,p,s,c,n=10,rows=6):
  rings=[]
  for j in range(1,rows):
   a=math.pi*j/rows
   rings.append([add(p,(s[0]*math.sin(a)*math.cos(i*math.tau/n),s[1]*math.cos(a),s[2]*math.sin(a)*math.sin(i*math.tau/n))) for i in range(n)])
  for i in range(n):
   k=(i+1)%n
   self.face([add(p,(0,s[1],0)),rings[0][k],rings[0][i]],c)
   self.face([add(p,(0,-s[1],0)),rings[-1][i],rings[-1][k]],c)
  for j in range(len(rings)-1):
   for i in range(n):
    k=(i+1)%n; self.face([rings[j][i],rings[j][k],rings[j+1][k],rings[j+1][i]],c)
 def crystal(self,a,b,r,c,n=6):
  axis=sub(b,a); middle=add(a,mul(axis,.35)); axisn=norm(axis)
  u=norm(cross(axisn,(0,1,0) if abs(axisn[1])<.95 else (1,0,0))); v=cross(axisn,u)
  ring=[add(middle,add(mul(u,r*math.cos(i*math.tau/n)),mul(v,r*math.sin(i*math.tau/n)))) for i in range(n)]
  for i in range(n):
   j=(i+1)%n; self.face([a,ring[j],ring[i]],c); self.face([b,ring[i],ring[j]],c)
 def ring(self,p,r,t,c,plane='xy',n=24):
  def point(a,b):
   q=((r+t*math.cos(b))*math.cos(a),(r+t*math.cos(b))*math.sin(a),t*math.sin(b))
   return add(p,q if plane=='xy' else (q[0],q[2],q[1]) if plane=='xz' else (q[2],q[0],q[1]))
  for i in range(n):
   for j in range(4): self.face([point(i*math.tau/n,j*math.tau/4),point((i+1)*math.tau/n,j*math.tau/4),point((i+1)*math.tau/n,(j+1)*math.tau/4),point(i*math.tau/n,(j+1)*math.tau/4)],c)
 def poly(self,points,depth,c):
  # Counterclockwise XY silhouette, extruded along Z.
  a=[(x,y,z-depth/2) for x,y,z in points]; b=[(x,y,z+depth/2) for x,y,z in points]
  self.face(list(reversed(a)),c); self.face(b,c)
  for i in range(len(a)):
   j=(i+1)%len(a); self.face([a[i],a[j],b[j],b[i]],c)
 def line(self,points,r,c,n=5):
  for a,b in zip(points,points[1:]): self.rod(a,b,r,c,n)
 def rune(self,p,s,c=5):
  x,y,z=p
  for pts in [[(-.35,-.5),(0,.5),(.35,-.5)],[(-.25,-.18),(.25,-.18)],[(0,.5),(0,-.65)],[(0,-.4),(.3,-.15)]]:
   self.line([(x+a*s,y+b*s,z) for a,b in pts],s*.035,c,4)
 def export(self):
  binary=bytearray(); views=[]; acc=[]
  def append(data,target=None):
   while len(binary)%4: binary.append(0)
   off=len(binary); binary.extend(data); vv={'buffer':0,'byteOffset':off,'byteLength':len(data)}
   if target: vv['target']=target
   views.append(vv); return len(views)-1
  def attribute(data,width,typ):
   flat=[v for row in data for v in row]; view=append(struct.pack('<'+'f'*len(flat),*flat),34962)
   item={'bufferView':view,'componentType':5126,'count':len(data),'type':typ}
   if typ=='VEC3': item.update(min=[min(v[i] for v in data) for i in range(3)],max=[max(v[i] for v in data) for i in range(3)])
   acc.append(item); return len(acc)-1
  attrs={'POSITION':attribute(self.pos,3,'VEC3'),'NORMAL':attribute(self.nor,3,'VEC3'),'TEXCOORD_0':attribute(self.uv,2,'VEC2'),'TEXCOORD_1':attribute(self.eu,2,'VEC2')}
  imageview=append(atlas(self.size))
  mat={'name':self.name+'_atlas','pbrMetallicRoughness':{'baseColorTexture':{'index':0,'texCoord':0},'metallicFactor':.15,'roughnessFactor':.7},'emissiveTexture':{'index':0,'texCoord':1},'emissiveFactor':[1,1,1],'alphaMode':'BLEND' if self.alpha else 'OPAQUE','doubleSided':False}
  nodes=[{'name':self.name,'mesh':0}]
  for name,pos in self.markers.items(): nodes.append({'name':name,'translation':pos})
  if self.markers: nodes[0]['children']=list(range(1,len(nodes)))
  gltf={'asset':{'version':'2.0','generator':'ATU Academy procedural art pack 1.0','extras':{'units':'meters','up':'+Y','forward':'-Z'}},'scene':0,'scenes':[{'nodes':[0]}],'nodes':nodes,'meshes':[{'name':self.name,'primitives':[{'attributes':attrs,'material':0,'mode':4}]}],'materials':[mat],'textures':[{'source':0,'sampler':0}],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}],'images':[{'name':self.name+'_atlas','bufferView':imageview,'mimeType':'image/png'}],'accessors':acc,'bufferViews':views,'buffers':[{'byteLength':len(binary)}]}
  js=json.dumps(gltf,separators=(',',':')).encode(); js+=b' '*((-len(js))%4); binary+=b'\0'*((-len(binary))%4)
  result=struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
  path=OUT/(self.name+'.glb'); path.write_bytes(result)
  bounds=[[min(p[i] for p in self.pos),max(p[i] for p in self.pos)] for i in range(3)]
  return {'file':path.name,'triangles':len(self.pos)//3,'dimensions_m':[round(b-a,4) for a,b in bounds],'bounds_m':bounds,'texture':f'{self.size}x{self.size}','markers':self.markers,'bytes':len(result)}

def make_models():
 models=[]
 def new(name,size=1024,alpha=False):
  m=Model(name,size,alpha); models.append(m); return m
 # Weapons: grip centre is world origin and the firing/blade axis is -Z.
 m=new('wand'); m.rod((0,0,.10),(0,0,-.18),.014,0,10,r2=.009)
 for z in [.075,.055,.035,.015,-.005]: m.ring((0,0,z),.014,.002,3,n=12)
 m.rod((0,0,-.16),(0,0,-.19),.023,3,8,r2=.018)
 m.crystal((0,0,-.175),(0,0,-.25),.027,5)
 for x in [-1,1]: m.line([(x*.02,0,-.18),(x*.035,0,-.21),(x*.015,0,-.235)],.003,4)
 m.markers={'Muzzle':(0,0,-.25)}

 m=new('staff'); m.rod((0,0,.55),(0,0,-.62),.022,0,10,r2=.018)
 for z in [.50,.3,.08,-.08,-.35,-.57]: m.rod((0,0,z-.016),(0,0,z+.016),.027,3,10)
 m.crystal((0,0,.55),(0,0,.62),.03,3)
 m.crystal((0,0,-.62),(0,0,-.88),.075,5,8)
 m.ring((0,0,-.72),.12,.012,3,'xy',24)
 m.ring((0,0,-.72),.105,.008,4,'yz',20)
 for a in range(6):
  t=a*math.tau/6; m.crystal((.12*math.cos(t),0,-.72+.12*math.sin(t)),(.12*math.cos(t),.025,-.72+.12*math.sin(t)),.013,6)
 for x,y in [(-.12,0),(.12,0),(0,.12),(0,-.12)]: m.rune((x,y,-.738),.028,6)
 m.markers={'Muzzle':(0,0,-.88),'Crystal':(0,0,-.73)}

 m=new('blade',alpha=True); m.rod((0,0,.13),(0,0,-.07),.024,0,10)
 for z in [-.045,-.015,.015,.045,.075,.105]: m.ring((0,0,z),.024,.003,3,n=12)
 m.crystal((0,0,.13),(0,0,.18),.034,6)
 m.line([(-.16,0,-.09),(-.095,0,-.06),(0,0,-.09),(.095,0,-.06),(.16,0,-.09)],.018,3,6)
 # Diamond section transparent blade; opaque violet central energy filament.
 rings=[[(0,.018,-.09),(.065,0,-.14),(0,-.018,-.09),(-.065,0,-.14)],[(0,.012,-.64),(.037,0,-.64),(0,-.012,-.64),(-.037,0,-.64)]]
 for i in range(4):
  j=(i+1)%4; m.face([rings[0][i],rings[0][j],rings[1][j],rings[1][i]],9); m.face([rings[1][i],rings[1][j],(0,0,-.82)],9)
 m.crystal((0,0,-.08),(0,0,-.8),.012,6,4); m.markers={'Tip':(0,0,-.82)}

 m=new('bow');
 for sign in [-1,1]:
  pts=[(0,sign*y,z) for y,z in [(0,0),(.15,-.06),(.32,-.12),(.47,-.07),(.59,.035)]]
  for i in range(4): m.rod(pts[i],pts[i+1],.027-i*.004,0,8,r2=.023-i*.004)
  for y,z in [(.24,-.095),(.39,-.095),(.51,-.03)]:
   first=len(m.pos); m.rune((0,sign*y,0),.045,5)
   for k in range(first,len(m.pos)):
    xx,yy,zz=m.pos[k]; m.pos[k]=(zz-.025,yy,-xx+z)
    xx,yy,zz=m.nor[k]; m.nor[k]=(zz,yy,-xx)
  m.crystal((0,sign*.55,.01),(0,sign*.60,.045),.027,3)
 m.rod((0,-.09,0),(0,.09,0),.032,3,8)
 m.line([(0,-.60,.045),(0,0,.17),(0,.60,.045)],.003,7,4)
 m.markers={'String':(0,0,.17)}

 m=new('gauntlet'); m.rod((0,0,.10),(0,0,-.07),.065,1,8,r2=.055)
 m.rod((0,0,.075),(0,0,.105),.073,3,8)
 m.box((0,.025,-.035),(.118,.05,.13),2)
 for i in range(4):
  x=(i-1.5)*.029; z=-.10-(.018 if i in [1,2] else 0)
  m.rod((x,.01,z),(x,.012,z-.07),.013,2,6,r2=.01)
  m.rod((x,.012,z-.07),(x,-.018,z-.095),.01,1,6)
  m.box((x,.027,z-.012),(.02,.015,.028),3)
 m.rod((-.055,0,-.035),(-.095,-.015,-.09),.02,2,6,r2=.015)
 m.ring((0,-.053,-.025),.03,.006,3,'xz',16)
 m.crystal((0,-.05,-.025),(0,-.088,-.025),.029,5)
 m.markers={'Muzzle':(0,-.09,-.025)}

 m=new('wisp',512); m.orb((0,.19,0),(.105,.12,.085),5,12,7)
 m.crystal((0,.20,0),(.045,.40,.015),.07,6)
 m.crystal((0,.14,0),(-.055,0,.03),.06,5)
 for x in [-.038,.038]: m.orb((x,.21,-.078),(.013,.022,.009),8,8,4)
 for sign in [-1,1]: m.crystal((sign*.12,.15,0),(sign*.16,.22,.02),.018,7)

 m=new('fairy',512); m.orb((0,.232,0),(.029,.035,.025),10,10,6)
 m.crystal((0,.13,0),(0,.21,0),.029,7)
 m.poly([(-.045,.115,0),(.045,.115,0),(.019,.18,0),(-.019,.18,0)],.035,3)
 for sign in [-1,1]:
  m.rod((sign*.016,.19,0),(sign*.068,.147,-.01),.006,10,6)
  m.rod((sign*.014,.12,0),(sign*.025,.057,0),.007,10,6)
  m.poly([(sign*.018,.20,.025),(sign*.125,.285,.03),(sign*.142,.22,.035),(sign*.073,.17,.025)],.004,7)
  m.poly([(sign*.02,.17,.03),(sign*.093,.17,.035),(sign*.10,.11,.04),(sign*.04,.13,.03)],.004,4)
  m.rod((sign*.01,.26,0),(sign*.027,.30,0),.002,3,4)
  m.orb((sign*.011,.235,-.023),(.004,.006,.003),8,6,4)

 m=new('skull',512); m.orb((0,.16,0),(.115,.125,.085),10,12,7)
 m.box((0,.075,-.025),(.14,.055,.10),10)
 for x in [-.049,.049]:
  m.orb((x,.16,-.074),(.032,.034,.017),8,8,5)
  m.orb((x,.16,-.09),(.018,.022,.006),6,8,4)
 m.poly([(-.014,.11,-.088),(.014,.11,-.088),(0,.14,-.088)],.008,8)
 for i in range(6): m.box(((i-2.5)*.02,.062,-.081),(.014,.028,.014),10)
 for i in range(7):
  a=i*math.tau/7; x=.08*math.cos(a); z=.05*math.sin(a)
  m.crystal((x*.7,.21,z),(x*1.4,.34+(i%3)*.025,z*1.4),.035,6)

 def golem(m,scale,boss=False):
  def p(v): return mul(v,scale)
  def box(v,s,c): m.box(p(v),p(s),c)
  def orb(v,s,c,n=8,rows=5): m.orb(p(v),p(s),c,n,rows)
  for sign in [-1,1]:
   box((sign*.19,.12,-.045),(.29,.24,.42),1)
   orb((sign*.18,.40,0),(.15,.22,.15),2)
   orb((sign*.18,.63,0),(.14,.09,.14),0)
   orb((sign*.18,.82,0),(.18,.22,.18),1)
   orb((sign*.46,1.43,0),(.23,.20,.23),2)
   orb((sign*.57,1.18,0),(.16,.23,.16),1)
   orb((sign*.61,.94,-.025),(.19,.18,.19),2)
   box((sign*.63,.77,-.045),(.23,.22,.25),1)
   m.line([p((sign*.37,1.49,-.15)),p((sign*.51,1.38,-.18)),p((sign*.54,1.22,-.15))],.014*scale,6 if boss else 5)
  orb((0,1.22,0),(.36,.34,.22),1,10,5)
  box((0,.94,0),(.36,.18,.28),3)
  orb((0,1.73,0),(.20,.25,.18),2)
  box((0,1.73,-.167),(.27,.042,.022),8)
  for sign in [-1,1]: box((sign*.07,1.73,-.183),(.07,.023,.015),6 if boss else 5)
  m.ring(p((0,1.29,-.205)),.105*scale,.018*scale,3,n=16)
  m.rune(p((0,1.29,-.235)),.13*scale,6 if boss else 5)
  m.markers={'WeakPoint':p((0,1.29,-.25))}
  if boss:
   for sign in [-1,1]:
    for j in range(3): m.crystal(p((sign*(.33+j*.09),1.52,0)),p((sign*(.37+j*.12),1.85-j*.06,0)),.075*scale,6)
   for x in [-.13,0,.13]: m.crystal(p((x,1.90,0)),p((x*1.2,2.0,-.02)),.05*scale,3)
   m.crystal(p((0,1.27,-.22)),p((0,1.27,-.31)),.078*scale,7,8)
 m=new('guardian'); golem(m,1)
 m=new('boss'); golem(m,3,True)

 m=new('eye'); m.orb((0,.20,0),(.15,.15,.12),10,14,8)
 m.orb((0,.20,-.112),(.074,.081,.016),6,12,6)
 m.orb((0,.20,-.129),(.024,.063,.008),8,10,5)
 m.orb((-.023,.229,-.138),(.015,.017,.004),13,8,4)
 for sign in [-1,1]:
  pts=[(sign*.12,.24,.02),(sign*.26,.40,.04),(sign*.40,.31,.04),(sign*.34,.16,.04),(sign*.28,.21,.03),(sign*.23,.10,.02)]
  if sign<0: pts.reverse()
  m.poly(pts,.012,0)
  m.line([(sign*.12,.24,.008),(sign*.26,.40,.028),(sign*.40,.31,.028)],.009,3)
  m.line([(sign*.26,.40,.025),(sign*.28,.21,.02)],.005,6)

 m=new('obelisk'); m.box((0,.18,0),(1.2,.36,1.2),1)
 m.box((0,.42,0),(.95,.16,.95),3)
 bottom=[(-.4,.5,-.4),(.4,.5,-.4),(.4,.5,.4),(-.4,.5,.4)]
 top=[(-.22,5.15,-.22),(.22,5.15,-.22),(.22,5.15,.22),(-.22,5.15,.22)]
 for i in range(4):
  j=(i+1)%4; m.face([bottom[i],top[i],top[j],bottom[j]],1)
  m.face([top[i],(0,6,0),top[j]],2)
 m.face(bottom,1)
 for y in [1.05,2,2.95,3.9,4.85]:
  z=-(.4-(y-.5)/4.65*.18)-.018
  m.rune((0,y,z),.43,5)
 m.rod((0,.55,0),(0,.64,0),.59,3,4)
 m.rod((0,5,0),(0,5.1,0),.34,3,4)

 m=new('platform'); n=14
 top=[]; mid=[]; low=[]
 for i in range(n):
  a=i*math.tau/n; r=1.5*(1-.06*(i%3)/2)
  top.append((r*math.cos(a),0,r*math.sin(a)))
  mid.append((r*.94*math.cos(a),-.3-.10*(i%3),r*.94*math.sin(a)))
  low.append((r*.47*math.cos(a),-.9-.12*(i%2),r*.47*math.sin(a)))
 for i in range(n):
  j=(i+1)%n; m.face([(0,0,0),top[j],top[i]],11)
  m.face([top[i],top[j],mid[j],mid[i]],2 if i%3==0 else 1)
  m.face([mid[i],mid[j],low[j],low[i]],1 if i%2 else 0)
  m.face([low[i],low[j],(.1,-1.45,0)],0)
 m.ring((0,.009,0),1.02,.018,3,'xz',32)
 for i in range(8):
  a=i*math.tau/8; x=.8*math.cos(a); z=.8*math.sin(a)
  m.crystal((x,-.7,z),(x*.9,-1.20,z*.9),.075,5)
 for i in range(6):
  a=i*math.tau/6; x=1.22*math.cos(a); z=1.22*math.sin(a)
  m.line([(x-.055,.012,z-.06),(x,.012,z+.06),(x+.055,.012,z-.06)],.008,5)

 m=new('seal');
 # Flat emblem lies in XY, visible from -Z, with a shallow physical thickness.
 m.poly([(-2.25,-.72,0),(-2.03,-1.03,0),(0,-1.15,0),(2.03,-1.03,0),(2.25,-.72,0),(2.25,.72,0),(1.85,1.0,0),(0,1.15,0),(-1.85,1,0),(-2.25,.72,0)],.045,0)
 m.line([(-2.1,-.66,-.03),(-1.94,-.9,-.03),(0,-1.02,-.03),(1.94,-.9,-.03),(2.1,-.66,-.03),(2.1,.64,-.03),(1.78,.88,-.03),(0,1.02,-.03),(-1.78,.88,-.03),(-2.1,.64,-.03),(-2.1,-.66,-.03)],.025,3)
 # Hand-built ATU letterforms are geometry, remain legible at oblique VR angles.
 for line in [[(-1.33,-.35),(-1.06,.38),(-.79,-.35)],[(-1.22,-.06),(-.9,-.06)],[(-.47,.36),(.23,.36)],[(-.12,.36),(-.12,-.35)],[(.53,.36),(.53,-.22),(.64,-.35),(1.04,-.35),(1.15,-.22),(1.15,.36)]]:
  m.line([(x,y,-.055) for x,y in line],.045,7,6)
 m.rune((0,.69,-.05),.24,5)
 for sign in [-1,1]:
  m.poly([(sign*1.48,-.26,-.05),(sign*1.73,0,-.05),(sign*1.48,.26,-.05),(sign*1.6,0,-.05)],.02,5)
 m.line([(-.5,-.67,-.05),(0,-.80,-.05),(.5,-.67,-.05)],.025,4)

 m=new('rune-target',512); m.rod((0,.02,0),(0,.09,0),.23,1,12,r2=.20)
 m.rod((0,.09,0),(0,.55,0),.035,3,8)
 m.rod((0,.68,.03),(0,.68,-.035),.29,0,16)
 m.ring((0,.68,-.045),.265,.018,3,n=24)
 m.ring((0,.68,-.052),.21,.009,6,n=24)
 m.rune((0,.68,-.06),.25,5)
 for sign in [-1,1]: m.crystal((sign*.25,.68,0),(sign*.30,.68,0),.033,7)

 m=new('mana-crystal',512); m.crystal((0,0,0),(0,.12,0),.034,5,6)
 m.ring((0,.041,0),.035,.003,3,'xz',12)
 return models

def preview(models):
 # Orthographic triangle preview, using the exact exported geometry.
 import numpy as np
 W,H=1600,1280; im=Image.new('RGB',(W,H),(12,16,30)); d=ImageDraw.Draw(im)
 try: font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',20); small=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',15)
 except OSError: font=small=ImageFont.load_default()
 for idx,m in enumerate(models):
  col=idx%4; row=idx//4; ox=col*400; oy=row*320
  # Weapons seen from oblique top; other models from their -Z front.
  if m.name=='bow':
   def project(p):
    x,y,z=p; return (z*.95+x*.31,y*.98-x*.14,-x*.95+z*.31)
  elif idx<5:
   def project(p):
    x,y,z=p; return (x*.85-z*.52, y*.88+z*.50+x*.22, x*.45-y*.5+z*.7)
  else:
   def project(p):
    x,y,z=p; return (x*.94+z*.34,y*.94+z*.17-x*.06,-z*.94+x*.34)
  pts=[project(p) for p in m.pos]; xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
  factor=min(330/max(max(xs)-min(xs),.001),232/max(max(ys)-min(ys),.001)); cx=(max(xs)+min(xs))/2; cy=(max(ys)+min(ys))/2
  pixels=np.zeros((258,400,3),dtype=np.uint8); pixels[:]=(12,16,30)
  depth=np.full((258,400),-np.inf)
  for i in range(0,len(pts),3):
   tri=pts[i:i+3]; normal=m.nor[i]; shade=.72+.28*max(0,dot(normal,norm((-.4,.8,-.7))))
   uv=m.uv[i]; c=int(uv[1]*4)*4+int(uv[0]*4); color=PALETTE[c]
   if c in GLOW: shade=1
   rgb=tuple(int(v*shade) for v in color[:3]); xy=[(200+(p[0]-cx)*factor,130-(p[1]-cy)*factor) for p in tri]
   x0=max(0,int(min(v[0] for v in xy))); x1=min(399,int(max(v[0] for v in xy))+1)
   y0=max(0,int(min(v[1] for v in xy))); y1=min(257,int(max(v[1] for v in xy))+1)
   if x1<x0 or y1<y0: continue
   (ax,ay),(bx,by),(cxv,cyv)=xy
   den=(by-cyv)*(ax-cxv)+(cxv-bx)*(ay-cyv)
   if abs(den)<1e-9: continue
   yy,xx=np.mgrid[y0:y1+1,x0:x1+1]; xx=xx+.5; yy=yy+.5
   wa=((by-cyv)*(xx-cxv)+(cxv-bx)*(yy-cyv))/den
   wb=((cyv-ay)*(xx-cxv)+(ax-cxv)*(yy-cyv))/den; wc=1-wa-wb
   zz=wa*tri[0][2]+wb*tri[1][2]+wc*tri[2][2]
   region=depth[y0:y1+1,x0:x1+1]; mask=(wa>=0)&(wb>=0)&(wc>=0)&(zz>region)
   region[mask]=zz[mask]; pixels[y0:y1+1,x0:x1+1][mask]=rgb
  im.paste(Image.fromarray(pixels),(ox,oy))
  d.text((ox+18,oy+270),m.name,font=font,fill=(230,232,246))
  d.text((ox+18,oy+296),f'{len(m.pos)//3:,} tris  |  {m.size}px  |  1 material',font=small,fill=(139,157,184))
  d.line((ox+8,oy+319,ox+392,oy+319),fill=(34,43,65))
 im.save(OUT/'preview.png')

if __name__=='__main__':
 models=make_models(); reports=[m.export() for m in models]
 (OUT/'manifest.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf-8')
 preview(models)
 print(json.dumps([{'file':r['file'],'tris':r['triangles'],'size':r['dimensions_m']} for r in reports],indent=2))
