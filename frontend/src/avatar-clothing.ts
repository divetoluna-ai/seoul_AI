import * as THREE from 'three';
import { fieldAt, type Anatomy } from './avatar-anatomy.ts';
import type { Outfit } from './avatar-catalog.ts';
const smooth=(t:number)=>{const v=Math.max(0,Math.min(1,t));return v*v*(3-2*v);};
export function garmentSurface(a:Anatomy,z:number,theta:number,ease=.023):THREE.Vector3 {
 const bend=smooth((z/a.bodyLength-.05)/.74);
 const centerY=a.bodyY+bend*.32;
 const angle=bend*1.32,dx=Math.cos(theta),dy=Math.sin(theta)*Math.cos(angle),dz=-Math.sin(theta)*Math.sin(angle);
 let lo=0,hi=1.25;
 for(let i=0;i<15;i++){const mid=(lo+hi)/2;if(fieldAt(a.torso,dx*mid,centerY+dy*mid,z+dz*mid)<0)lo=mid;else hi=mid;}
 const wrinkle=.0025*Math.sin(z*56+theta*4)*Math.sin(theta*9)+.0015*Math.cos(theta*31+z*9);
 const radius=hi+ease+wrinkle;
 return new THREE.Vector3(dx*radius,centerY+dy*radius,z+dz*radius);
}
export function clearBody(a:Anatomy,p:THREE.Vector3):THREE.Vector3 {
 for(let i=0;i<6;i++) {const distance=fieldAt(a.parts,p.x,p.y,p.z);if(distance>=.016)break;const e=.002;const n=new THREE.Vector3(fieldAt(a.parts,p.x+e,p.y,p.z)-fieldAt(a.parts,p.x-e,p.y,p.z),fieldAt(a.parts,p.x,p.y+e,p.z)-fieldAt(a.parts,p.x,p.y-e,p.z),fieldAt(a.parts,p.x,p.y,p.z+e)-fieldAt(a.parts,p.x,p.y,p.z-e)).normalize();p.addScaledVector(n,.017-distance);}
 return p;
}
function fabric(outfit:Outfit):THREE.MeshStandardMaterial {
 const c=document.createElement('canvas');c.width=1024;c.height=1024;const ctx=c.getContext('2d')!;
 ctx.fillStyle=outfit.color;ctx.fillRect(0,0,1024,1024);
 if(outfit.style==='stripe'){ctx.fillStyle=outfit.trim;for(let i=0;i<1024;i+=75)ctx.fillRect(0,i,1024,23);}
 ctx.globalAlpha=.07;
 for(let i=0;i<1024;i+=3){ctx.strokeStyle=i%2?'#ffffff':'#111111';ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,1024);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(1024,i);ctx.stroke();}
 if(['turtle','shirring','tank'].includes(outfit.style)){ctx.globalAlpha=.13;ctx.strokeStyle=outfit.trim;for(let x=0;x<1024;x+=12){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,1024);ctx.stroke();}}
 const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
 const normalCanvas=document.createElement('canvas');normalCanvas.width=128;normalCanvas.height=128;const nctx=normalCanvas.getContext('2d')!,pixels=nctx.createImageData(128,128);
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){const k=(y*128+x)*4;pixels.data[k]=128+Math.sin(x*Math.PI/4)*17;pixels.data[k+1]=128+Math.sin(y*Math.PI/4)*17;pixels.data[k+2]=252;pixels.data[k+3]=255;}
 nctx.putImageData(pixels,0,0);const normalMap=new THREE.CanvasTexture(normalCanvas);normalMap.wrapS=normalMap.wrapT=THREE.RepeatWrapping;normalMap.repeat.set(5,5);
 return new THREE.MeshStandardMaterial({map,normalMap,normalScale:new THREE.Vector2(.23,.23),roughness:.92,side:THREE.DoubleSide});
}
export function dressPet(a:Anatomy,outfit:Outfit):THREE.Group {
 const group=new THREE.Group();group.name=`garment-${outfit.id}`;const material=fabric(outfit);
 const short=outfit.style==='sweat'||outfit.style==='ribbon';
 const back=-a.bodyLength*(short?.52:.81),front=a.foreZ+.075;
 const zAt=(u:number,theta:number)=>{const belly=Math.max(0,-Math.sin(theta));return THREE.MathUtils.lerp(back+belly*a.bodyLength*.28,front,u);};
 const rows=64,columns=96,positions:number[]=[],uv:number[]=[],indices:number[]=[];
 const armTheta=(side:number)=>side>0?-.77:Math.PI+.77;
 const holeZ=a.foreZ-.085,holeLength=.145,holeAngle=.48;
 const nearHole=(z:number,theta:number)=>[-1,1].some(side=>{const angle=Math.atan2(Math.sin(theta-armTheta(side)),Math.cos(theta-armTheta(side)));return ((z-holeZ)/holeLength)**2+(angle/holeAngle)**2<1;});
 for(let i=0;i<=rows;i++)for(let j=0;j<=columns;j++){const u=i/rows,t=j/columns*Math.PI*2,z=zAt(u,t),p=garmentSurface(a,z,t);positions.push(p.x,p.y,p.z);uv.push(j/columns,u);}
 for(let i=0;i<rows;i++)for(let j=0;j<columns;j++){const theta=(j+.5)/columns*Math.PI*2,z=zAt((i+.5)/rows,theta);if(nearHole(z,theta))continue;const k=i*(columns+1)+j;indices.push(k,k+1,k+columns+1,k+1,k+columns+2,k+columns+1);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
 const body=new THREE.Mesh(geometry,material);body.castShadow=true;body.receiveShadow=true;group.add(body);
 const seam=(points:THREE.Vector3[],color:string,r=.005,closed=false)=>{const curve=new THREE.CatmullRomCurve3(points,closed);const o=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(64,points.length),r,6,closed),new THREE.MeshStandardMaterial({color,roughness:.95}));o.castShadow=true;group.add(o);return o;};
 for(const u of [0,.014,1])seam(Array.from({length:97},(_,j)=>garmentSurface(a,zAt(u,j/96*Math.PI*2),j/96*Math.PI*2,.027)),outfit.trim,u===.014?.0015:.007);
 for(const side of [-1,1]) {
  const opening=Array.from({length:65},(_,i)=>{const phi=i/64*Math.PI*2;return garmentSurface(a,holeZ+Math.cos(phi)*holeLength,armTheta(side)+Math.sin(phi)*holeAngle,.027);});
  const sleeves=['sweat','ribbon','turtle','shirring'].includes(outfit.style);
  if(!sleeves)seam(opening,outfit.trim,.009);
  else {
   const sleeveLength=outfit.style==='turtle'?.27:outfit.style==='shirring'?.13:.17;
   const p:number[]=[],tex:number[]=[],ix:number[]=[],sRows=12,sides=64;
   for(let i=0;i<=sRows;i++)for(let j=0;j<=sides;j++){
    const t=i/sRows,phi=j/sides*Math.PI*2,root=opening[j];
    const cuff=new THREE.Vector3(side*a.legX+Math.sin(phi)*.113,a.bodyY-.24-sleeveLength,a.foreZ+Math.cos(phi)*.119);
    const point=root.clone().lerp(cuff,smooth(t));point.x+=side*Math.sin(t*Math.PI)*.008;clearBody(a,point);
    p.push(point.x,point.y,point.z);tex.push(j/sides,t*.3);
    if(i<sRows&&j<sides){const k=i*(sides+1)+j;ix.push(k,k+1,k+sides+1,k+1,k+sides+2,k+sides+1);}
   }
   const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(tex,2));geo.setIndex(ix);geo.computeVertexNormals();const sleeve=new THREE.Mesh(geo,material.clone());sleeve.castShadow=true;group.add(sleeve);
   seam(Array.from({length:65},(_,j)=>new THREE.Vector3(p[(sRows*65+j)*3],p[(sRows*65+j)*3+1],p[(sRows*65+j)*3+2])),outfit.trim,.007);
   seam(opening,outfit.color,.003);
   if(outfit.style==='shirring') {
    const rp:number[]=[],ruv:number[]=[],ri:number[]=[];
    for(let i=0;i<=64;i++)for(let j=0;j<2;j++){const phi=i/64*Math.PI*2,point=opening[i].clone();if(j){point.x+=side*(.04+Math.sin(phi*9)*.018);point.y-=.065+Math.cos(phi*9)*.024;}rp.push(point.x,point.y,point.z);ruv.push(i/64,j);if(i<64){const k=i*2;ri.push(k,k+1,k+2,k+1,k+3,k+2);}}
    const ruffle=new THREE.BufferGeometry();ruffle.setAttribute('position',new THREE.Float32BufferAttribute(rp,3));ruffle.setAttribute('uv',new THREE.Float32BufferAttribute(ruv,2));ruffle.setIndex(ri);ruffle.computeVertexNormals();group.add(new THREE.Mesh(ruffle,new THREE.MeshStandardMaterial({color:outfit.trim,roughness:.95,side:THREE.DoubleSide,transparent:true,opacity:.78})));
   }
  }
 }
 if(outfit.style==='turtle') {
  const p:number[]=[],uv:number[]=[],ix:number[]=[];
  for(let i=0;i<=12;i++)for(let j=0;j<=96;j++){const t=i/12,theta=j/96*Math.PI*2,base=garmentSurface(a,front,theta);const centerY=a.bodyY+.29;const q=new THREE.Vector3(base.x*(1-t*.13),centerY+(base.y-centerY)*(1-t*.13)+t*.13,base.z+t*.085);p.push(q.x,q.y,q.z);uv.push(j/96,t*.15);if(i<12&&j<96){const k=i*97+j;ix.push(k,k+1,k+97,k+1,k+98,k+97);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();group.add(new THREE.Mesh(g,material.clone()));
  seam(Array.from({length:97},(_,j)=>new THREE.Vector3(...p.slice((12*97+j)*3,(12*97+j)*3+3) as [number,number,number])),outfit.trim,.009);
 }
 if(outfit.style==='stripe'||outfit.style==='ribbon') {
  const z=back*.35,base=garmentSurface(a,z,Math.PI/2,.037),color=outfit.style==='stripe'?'#f4ecdf':outfit.color;
  for(const side of [-1,1]){
   const p:number[]=[],uv:number[]=[],ix:number[]=[];
   for(let i=0;i<=30;i++)for(let j=0;j<=6;j++){const t=i/30,w=(j/6-.5)*.075;p.push(base.x+side*Math.sin(t*Math.PI)*.19,base.y+Math.sin(t*Math.PI)*.075+w*Math.sin(t*Math.PI*2),base.z+Math.sin(t*Math.PI*2)*.075+w*Math.cos(t*Math.PI*2));uv.push(t,j/6);if(i<30&&j<6){const k=i*7+j;ix.push(k,k+1,k+7,k+1,k+8,k+7);}}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();group.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:.7})));
   seam([base.clone().add(new THREE.Vector3(side*.025,.01,-.01)),base.clone().add(new THREE.Vector3(side*.05,-.01,-.12)),base.clone().add(new THREE.Vector3(side*.095,-.035,-.2))],color,.02);
  }
  const knot=new THREE.Mesh(new THREE.SphereGeometry(.035,24,16),new THREE.MeshStandardMaterial({color,roughness:.7}));knot.position.copy(base).y+=.025;group.add(knot);
 }
 if(outfit.style==='ring')for(const side of [-1,1]){
  const p=garmentSurface(a,a.foreZ-.14,Math.PI/2-side*.44,.05);const ring=new THREE.Mesh(new THREE.TorusGeometry(.045,.008,10,32),new THREE.MeshStandardMaterial({color:'#c4c6c9',metalness:.9,roughness:.2}));ring.rotation.x=Math.PI/2;ring.position.copy(p);group.add(ring);
 }
 if(!['stripe','shirring','turtle'].includes(outfit.style)){
  const c=document.createElement('canvas');c.width=512;c.height=160;const ctx=c.getContext('2d')!;ctx.fillStyle=outfit.style==='ribbon'?outfit.color:outfit.trim;ctx.fillRect(0,0,512,160);ctx.fillStyle=outfit.style==='sweat'?'#35353b':'#fffaf0';ctx.font=outfit.style==='ribbon'?'italic bold 70px Georgia':'bold 40px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(outfit.style==='ribbon'?'Adorable':'ADORABLE DOG',256,80);
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;const p:number[]=[],uv:number[]=[],ix:number[]=[];
  for(let i=0;i<=8;i++)for(let j=0;j<=20;j++){const theta=Math.PI/2+(j/20-.5)*.8,z=-.08+(i/8-.5)*.105,point=garmentSurface(a,z,theta,.03);p.push(point.x,point.y,point.z);uv.push(j/20,i/8);if(i<8&&j<20){const k=i*21+j;ix.push(k,k+1,k+21,k+1,k+22,k+21);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();group.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial({map,roughness:.9,side:THREE.DoubleSide})));
 }
 return group;
}
