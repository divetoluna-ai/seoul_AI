import * as THREE from 'three';
import type {Outfit} from './avatar-catalog.ts';
import type {RealModel} from './real-model-catalog.ts';
import {bodyClearance} from './avatar-surface-fit.ts';
export type GarmentFit={ease:number;length:number;width:number};

const domainCache=new WeakMap<THREE.BufferGeometry,Map<string,Float32Array>>();
const offsetCache=new WeakMap<THREE.BufferGeometry,Map<number,{points:Float32Array;ready:Uint8Array}>>();
type Vertex={p:THREE.Vector3;n:THREE.Vector3;uv:THREE.Vector2;d:number;fitted:THREE.Vector3};
const interpolate=(a:Vertex,b:Vertex):Vertex=>{const t=a.d/(a.d-b.d);return {p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t).normalize(),uv:a.uv.clone().lerp(b.uv,t),fitted:a.fitted.clone().lerp(b.fitted,t),d:0};};

/** Cut the garment from the imported skin, retaining its actual chest and back. */
export function fittedBodyGarment(source:THREE.Group,model:RealModel,outfit:Outfit,fit:GarmentFit):THREE.Group{
 const group=new THREE.Group(),guide=new THREE.CatmullRomCurve3((model.fitGuide??model.guide).map(p=>new THREE.Vector3(...p))),path=guide.getPoints(32),arc=guide.getLength();
 const first=path[0],last=path[32],back=guide.getTangent(0),neck=new THREE.Vector3(0,1,.35).normalize(),sleeved=['sweat','ribbon','turtle','shirring'].includes(outfit.style);
 const sleeve=sleeved?(outfit.style==='turtle'?.16:.09):0,hem=(1-fit.length)*.65+(outfit.style==='sweat'?.06:0);
 const shoulder=guide.getPoint(model.fitArmU??model.armU);
 const frame=(p:THREE.Vector3)=>{
  let distance=Infinity,u=0,c=new THREE.Vector3();
  for(let i=0;i<32;i++){const a=path[i],b=path[i+1],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,t=THREE.MathUtils.clamp(((p.x-a.x)*dx+(p.y-a.y)*dy+(p.z-a.z)*dz)/(dx*dx+dy*dy+dz*dz),0,1),x=a.x+dx*t,y=a.y+dy*t,z=a.z+dz*t,d=(p.x-x)**2+(p.y-y)**2+(p.z-z)**2;if(d<distance){distance=d;u=(i+t)/32;c.set(x,y,z);}}
  const tangent=guide.getTangent(u),width=new THREE.Vector3(1,0,0).addScaledVector(tangent,-tangent.x).normalize(),up=new THREE.Vector3().crossVectors(tangent,width).normalize(),delta=p.clone().sub(c);
  return {u,c,x:delta.dot(width),y:delta.dot(up)};
 };
 // The lateral and upper body determine torso depth; legs must not enlarge it.
 const limits=path.map((_,i)=>{
  const t=i/32,center=guide.getPoint(t),tangent=guide.getTangent(t),width=new THREE.Vector3(1,0,0).addScaledVector(tangent,-tangent.x).normalize(),up=new THREE.Vector3().crossVectors(tangent,width).normalize();
  const distances:number[]=[];
  for(const direction of [width,width.clone().negate(),up]){const ray=new THREE.Ray(center,direction);let distance=Infinity;source.traverse(o=>{if(o instanceof THREE.Mesh){const h=o.geometry.boundsTree?.raycastFirst(ray,THREE.DoubleSide,.0001,.9);if(h)distance=Math.min(distance,h.distance);}});if(Number.isFinite(distance))distances.push(distance);}
  return distances.length?Math.max(...distances):Math.max(...model.radii);
 });
 const positions:number[]=[],bodyPositions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[],lookup=new Map<string,number>(),cuts:[THREE.Vector3,THREE.Vector3][]=[];
 const clear=bodyClearance(source),gap=Math.max(.012,fit.ease+(fit.width-1)*.12);
 const emit=(v:Vertex)=>{
  const p=v.fitted,key=p.toArray().map(n=>Math.round(n*1e5)).join(',')+','+Math.round(v.uv.x*1e4)+','+Math.round(v.uv.y*1e4);
  const old=lookup.get(key);if(old!==undefined)return old;const id=positions.length/3;lookup.set(key,id);positions.push(p.x,p.y,p.z);bodyPositions.push(v.p.x,v.p.y,v.p.z);normals.push(v.n.x,v.n.y,v.n.z);uvs.push(v.uv.x,v.uv.y);return id;
 };
 source.traverse(object=>{
  if(!(object instanceof THREE.Mesh))return;const geometry=object.geometry,pos=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),index=geometry.index;
  let cached=domainCache.get(geometry);if(!cached){cached=new Map();domainCache.set(geometry,cached);}const domainKey=JSON.stringify([model.id,model.fitGuide??model.guide,model.fitArmU??model.armU,model.radii,model.fitForelegZ]);let fields=cached.get(domainKey);
  if(!fields){fields=new Float32Array(pos.count*5);for(let i=0;i<pos.count;i++){
   const p=new THREE.Vector3().fromBufferAttribute(pos,i),f=frame(p),theta=Math.atan2(f.y,f.x),bodyLimit=limits[Math.min(32,Math.round(f.u*32))],lower=Math.max(0,-Math.sin(theta)),bellyAdvance=.16*lower*lower;
   const under=Math.max(bodyLimit,model.radii[1])*1.15,front=THREE.MathUtils.smoothstep(p.z,model.fitForelegZ?.[0]??shoulder.z-.2,model.fitForelegZ?.[1]??shoulder.z+.04),floor=THREE.MathUtils.lerp(f.c.y-under,Math.max(f.c.y-under,shoulder.y-model.radii[1]*.85),front);
   fields.set([f.u,theta,p.clone().sub(first).dot(back)-bellyAdvance*arc,-p.clone().sub(last).dot(neck),p.y-floor],i*5);
  }cached.set(domainKey,fields);}
  const distances=new Float32Array(pos.count),vertices=new Array<Vertex|undefined>(pos.count);
  let offsets=offsetCache.get(geometry);if(!offsets){offsets=new Map();offsetCache.set(geometry,offsets);}let offset=offsets.get(gap);if(!offset){if(offsets.size>=3)offsets.delete(offsets.keys().next().value!);offset={points:new Float32Array(pos.count*3),ready:new Uint8Array(pos.count)};offsets.set(gap,offset);}
  for(let i=0;i<pos.count;i++)distances[i]=Math.min(fields[i*5+2]-hem*arc,fields[i*5+3]+(outfit.style==='turtle'?.065:0),fields[i*5+4]+sleeve);
  const vertex=(i:number):Vertex=>{
   if(vertices[i])return vertices[i]!;const p=new THREE.Vector3().fromBufferAttribute(pos,i),n=normal?new THREE.Vector3().fromBufferAttribute(normal,i).normalize():new THREE.Vector3(0,1,0),fitted=new THREE.Vector3();
   if(offset!.ready[i])fitted.fromArray(offset!.points,i*3);else{fitted.copy(p).addScaledVector(n,gap);for(let pass=0;pass<3;pass++)clear(fitted,gap,.25);fitted.toArray(offset!.points,i*3);offset!.ready[i]=1;}
   return vertices[i]={p,n,fitted,uv:new THREE.Vector2((fields![i*5+1]+Math.PI)/(Math.PI*2),fields![i*5]),d:distances[i]};
  };
  const count=index?index.count:pos.count;
  for(let i=0;i<count;i+=3){const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);if(ids.every(k=>distances[k]<0))continue;const tri=ids.map(vertex);
   const polygon:Vertex[]=[],edge:Vertex[]=[];
   for(let k=0;k<3;k++){const a=tri[k],b=tri[(k+1)%3];if(a.d>=0)polygon.push(a);if((a.d>=0)!==(b.d>=0)){const v=interpolate(a,b);polygon.push(v);edge.push(v);}}
   if(polygon.length>=3){const root=emit(polygon[0]);for(let k=1;k+1<polygon.length;k++)indices.push(root,emit(polygon[k]),emit(polygon[k+1]));}
   if(edge.length===2)cuts.push(edge.map(v=>v.fitted) as [THREE.Vector3,THREE.Vector3]);
  }
 });
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
 geometry.setAttribute('bodyPosition',new THREE.Float32BufferAttribute(bodyPositions,3));
 geometry.computeVertexNormals();
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const ctx=canvas.getContext('2d')!;ctx.fillStyle=outfit.color;ctx.fillRect(0,0,512,512);if(outfit.style==='stripe'){ctx.fillStyle=outfit.trim;for(let y=0;y<512;y+=38)ctx.fillRect(0,y,512,12);}ctx.globalAlpha=.08;ctx.strokeStyle='#ffffff';for(let x=0;x<512;x+=3){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,512);ctx.stroke();}
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;const cloth=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map,side:THREE.DoubleSide,roughness:.94}));cloth.castShadow=true;cloth.receiveShadow=true;group.add(cloth);
 const key=(p:THREE.Vector3)=>p.toArray().map(n=>Math.round(n*1e4)).join(','),edges=new Map<string,THREE.Vector3[]>();
 for(const [a,b] of cuts){const ak=key(a),bk=key(b);if(!edges.has(ak))edges.set(ak,[]);if(!edges.has(bk))edges.set(bk,[]);edges.get(ak)!.push(b);edges.get(bk)!.push(a);}
 const used=new Set<string>();
 for(const [a] of cuts){if(used.has(key(a)))continue;const loop=[a];let current=a;
  for(let count=0;count<10000;count++){used.add(key(current));const next=edges.get(key(current))?.find(p=>!used.has(key(p)));if(!next)break;loop.push(next);current=next;}
  if(loop.length<5)continue;const closed=loop[0].distanceTo(loop[loop.length-1])<.04;
  const sampled=new THREE.CatmullRomCurve3(loop,closed).getSpacedPoints(Math.min(64,Math.max(8,Math.floor(loop.length/3))));if(closed)sampled.pop();loop.splice(0,loop.length,...sampled);
  // A fabric binding bridges tiny scan wrinkles instead of zigzagging over them.
  for(let pass=0;pass<4;pass++){const old=loop.map(p=>p.clone());for(let i=closed?0:1;i<(closed?loop.length:loop.length-1);i++)loop[i]=old[i].clone().multiplyScalar(.5).addScaledVector(old[(i+old.length-1)%old.length],.25).addScaledVector(old[(i+1)%old.length],.25);}
  for(const p of loop)clear(p,.012,.15);
  const curve=new THREE.CatmullRomCurve3(loop,closed),binding=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.min(192,loop.length),.006,5,closed),new THREE.MeshStandardMaterial({color:outfit.trim,roughness:.9}));binding.castShadow=true;group.add(binding);
 }
 if(['stripe','ribbon'].includes(outfit.style)){
  const u=.35,q=guide.getPoint(u);q.y+=limits[Math.round(u*32)]+Math.max(.012,fit.ease)+.025;
  let nearest=0,distance=Infinity;const pos=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');for(let i=0;i<pos.count;i++){const d=(pos.getX(i)-q.x)**2+(pos.getY(i)-q.y)**2+(pos.getZ(i)-q.z)**2;if(d<distance){distance=d;nearest=i;}}
  q.fromBufferAttribute(pos,nearest).addScaledVector(new THREE.Vector3().fromBufferAttribute(normal,nearest),.015);
  for(const side of [-1,1]){const bow=new THREE.Mesh(new THREE.TorusGeometry(.055,.012,6,20,Math.PI*1.8),new THREE.MeshStandardMaterial({color:outfit.trim,roughness:.9}));bow.rotation.x=-Math.PI/2;bow.position.copy(q).add(new THREE.Vector3(side*.045,0,0));group.add(bow);}
 }
 return group;
}
