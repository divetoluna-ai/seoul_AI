import * as THREE from 'three';
import {fittedBodyGarment} from './avatar-body-garment';
import type { Outfit } from './avatar-catalog';
import type {RealModel} from './real-model-catalog';
import { bodyClearance } from './avatar-surface-fit';
export function fitRealClothes(source:THREE.Group,model:RealModel,outfit:Outfit,fit:{ease:number;length:number;width:number}):THREE.Group {
 if(model.id!=='maltese')return fittedBodyGarment(source,model,outfit,fit);
 const group=new THREE.Group();
 const ease=fit.ease??.035,length=fit.length??1;
 const clearBody=bodyClearance(source);
 const guide=new THREE.CatmullRomCurve3(model.guide.map(p=>new THREE.Vector3(...p as [number,number,number])));
 const frame=(u:number)=>{
  const t=Math.max(0,Math.min(1,u));
  const center=guide.getPoint(t),tangent=guide.getTangent(t).normalize();
  const width=new THREE.Vector3(1,0,0).addScaledVector(tangent,-tangent.x).normalize();
  return {center,width,up:new THREE.Vector3().crossVectors(tangent,width).normalize()};
 };
 const ray=new THREE.Raycaster();ray.firstHitOnly=false;
 // Continue the back hem past the guide for lengths above 100% as well.
 const start=(1-length)*.8;
 const garmentFrame=(u:number)=>{
  const f=frame(u);
  if(u<0)f.center.addScaledVector(guide.getTangent(0),u*guide.getLength());
  return f;
 };
 const sections=Array.from({length:49},(_,i)=>{
  const u=THREE.MathUtils.lerp(start,1,i/48),f=garmentFrame(u);let rx=.15,ry=.15;
  for(let j=0;j<48;j++){
   const theta=j/48*Math.PI*2,direction=f.width.clone().multiplyScalar(Math.cos(theta)).addScaledVector(f.up,Math.sin(theta));
   ray.set(f.center.clone().addScaledVector(direction,1.2),direction.clone().negate());
   const hits=ray.intersectObjects(source.children,false).filter(h=>{const delta=h.point.clone().sub(f.center);return delta.dot(direction)>0&&delta.length()<.72;});
   // The nearest enclosing skin surface excludes distant tails and limbs.
   const hit=hits.sort((a,b)=>a.point.distanceToSquared(f.center)-b.point.distanceToSquared(f.center))[0];
   if(hit){const q=hit.point.clone().sub(f.center);rx=Math.max(rx,Math.abs(q.dot(f.width)));ry=Math.max(ry,Math.abs(q.dot(f.up)));}
  }
  const taper=.72+.28*Math.sin(Math.PI*.5*(1-u));
  return {rx:Math.min(rx,model.radii[0]*taper)+ease,ry:Math.min(ry,model.radii[1]*taper)+ease};
 });
 for(let pass=0;pass<3;pass++){const old=sections.map(s=>({...s}));for(let i=1;i<48;i++){sections[i].rx=(old[i-1].rx+old[i].rx*2+old[i+1].rx)/4;sections[i].ry=(old[i-1].ry+old[i].ry*2+old[i+1].ry)/4;}}
 const surface=(u:number,theta:number)=>{
  const t=Math.max(0,Math.min(1,u)),i=Math.min(47,Math.floor(t*48)),f=t*48-i;
  const rx=THREE.MathUtils.lerp(sections[i].rx,sections[i+1].rx,f)*(fit.width??1),ry=THREE.MathUtils.lerp(sections[i].ry,sections[i+1].ry,f)*(fit.width??1);
  const axes=garmentFrame(THREE.MathUtils.lerp(start,1,t));
  return clearBody(axes.center.addScaledVector(axes.width,Math.cos(theta)*rx).addScaledVector(axes.up,Math.sin(theta)*ry),ease);
 };
 // Keep the shoulder opening on the same body location when changing the hem.
 const armU=(model.armU-start)/(1-start),armAngles=[model.armAngle,Math.PI-model.armAngle];
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const ctx=canvas.getContext('2d')!;
 ctx.fillStyle=outfit.color;ctx.fillRect(0,0,512,512);if(outfit.style==='stripe'){ctx.fillStyle=outfit.trim;for(let y=0;y<512;y+=38)ctx.fillRect(0,y,512,12);}
 ctx.globalAlpha=.1;ctx.strokeStyle='#ffffff';for(let x=0;x<512;x+=3){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,512);ctx.stroke();}
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
 const mat=new THREE.MeshStandardMaterial({map,roughness:.92,side:THREE.DoubleSide});
 const p:number[]=[],uv:number[]=[],index:number[]=[],rows=36,cols=80;
 for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){const q=surface(i/rows,j/cols*Math.PI*2);p.push(q.x,q.y,q.z);uv.push(j/cols,i/rows);}
 const hasHole=(u:number,theta:number)=>armAngles.some(t=>{const angle=Math.atan2(Math.sin(theta-t),Math.cos(theta-t));return ((u-armU)/.12)**2+(angle/.48)**2<1;});
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){if(hasHole((i+.5)/rows,(j+.5)/cols*Math.PI*2))continue;const k=i*(cols+1)+j;index.push(k,k+1,k+cols+1,k+1,k+cols+2,k+cols+1);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(index);
 geometry.computeVertexNormals();const vest=new THREE.Mesh(geometry,mat);vest.castShadow=true;vest.receiveShadow=true;group.add(vest);
 const binding=(points:THREE.Vector3[],color:string,width=.006)=>{const curve=new THREE.CatmullRomCurve3(points,true);group.add(new THREE.Mesh(new THREE.TubeGeometry(curve,128,width,6,true),new THREE.MeshStandardMaterial({color,roughness:.85})));};
 for(const u of [0,1])binding(Array.from({length:80},(_,j)=>surface(u,j/80*Math.PI*2)),outfit.trim,.009);
 for(const theta of armAngles)binding(Array.from({length:64},(_,i)=>{const t=i/64*Math.PI*2;return surface(armU+Math.cos(t)*.12,theta+Math.sin(t)*.48);}),outfit.trim,.007);
 if(['sweat','ribbon','turtle','shirring'].includes(outfit.style))for(const theta of armAngles) {
  const root=Array.from({length:65},(_,i)=>{const t=i/64*Math.PI*2;return surface(armU+Math.cos(t)*.12,theta+Math.sin(t)*.48);});
  const points:number[]=[],tex:number[]=[],faces:number[]=[];
  for(let r=0;r<=8;r++)for(let j=0;j<=64;j++){
   const t=r/8,q=root[j].clone();q.y-=t*(outfit.style==='turtle'?.19:.11);q.x+=Math.sign(q.x)*Math.sin(t*Math.PI)*.012;
   clearBody(q,ease);
   points.push(q.x,q.y,q.z);tex.push(j/64,r/8*.25);if(r<8&&j<64){const k=r*65+j;faces.push(k,k+1,k+65,k+1,k+66,k+65);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(tex,2));g.setIndex(faces);g.computeVertexNormals();const mesh=new THREE.Mesh(g,mat.clone());mesh.castShadow=true;group.add(mesh);
 }
 if(['stripe','ribbon'].includes(outfit.style)){
  const q=surface(.45,Math.PI/2);for(const side of [-1,1]){const loop=new THREE.Mesh(new THREE.TorusGeometry(.07,.016,8,24,Math.PI*1.8),new THREE.MeshStandardMaterial({color:outfit.style==='stripe'?'#f5eddf':outfit.trim,roughness:.75}));loop.rotation.x=-Math.PI/2;loop.position.copy(q).add(new THREE.Vector3(side*.06,.035,0));group.add(loop);}
 }
 return group;
}
