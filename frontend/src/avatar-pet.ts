import * as THREE from 'three';
import type { StudioDesign } from './AvatarStudio';
import { OUTFITS } from './avatar-catalog';
import { anatomyFor } from './avatar-anatomy';
import { sculptBody } from './avatar-sculpt';
import { coatSampler, paintCoat, furStrands } from './avatar-fur';
import { dressPet } from './avatar-clothing';

export function curvedSurface(points:THREE.Vector3[],radius:(t:number)=>[number,number],segments=36,widthAxis?:THREE.Vector3):THREE.BufferGeometry {
 const curve=new THREE.CatmullRomCurve3(points),frames=curve.computeFrenetFrames(segments,false),p:number[]=[],uv:number[]=[],indices:number[]=[];
 const sides=24;
 for(let i=0;i<=segments;i++) {const t=i/segments,c=curve.getPointAt(t),r=radius(t);for(let j=0;j<=sides;j++){const tangent=curve.getTangentAt(t); const normal=widthAxis?widthAxis.clone().addScaledVector(tangent,-widthAxis.dot(tangent)).normalize():frames.normals[i]; const binormal=widthAxis?new THREE.Vector3().crossVectors(tangent,normal).normalize():frames.binormals[i]; const theta=j/sides*Math.PI*2,q=c.clone().addScaledVector(normal,Math.cos(theta)*r[0]).addScaledVector(binormal,Math.sin(theta)*r[1]);p.push(q.x,q.y,q.z);uv.push(j/sides,t);if(i<segments&&j<sides){const k=i*(sides+1)+j;indices.push(k,k+1,k+sides+1,k+1,k+sides+2,k+sides+1);}}}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
export function buildPet(d:StudioDesign):THREE.Group {
 const a=anatomyFor(d.breedId,d.species),breed=a.breed,outfit=OUTFITS.find(o=>o.id===d.outfitId);
 const sample=coatSampler(a,d.fur),pet=new THREE.Group();pet.name=`pet-${breed.id}`;pet.position.set(.25,0,.5);pet.rotation.y=d.rotation*Math.PI/180;pet.scale.setScalar(d.size);
 const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=128;const shadowCtx=shadowCanvas.getContext('2d')!;const gradient=shadowCtx.createRadialGradient(64,64,4,64,64,64);gradient.addColorStop(0,'rgba(45,39,31,.24)');gradient.addColorStop(.45,'rgba(45,39,31,.1)');gradient.addColorStop(1,'rgba(45,39,31,0)');shadowCtx.fillStyle=gradient;shadowCtx.fillRect(0,0,128,128);const shadowMap=new THREE.CanvasTexture(shadowCanvas);
 const contact=(x:number,z:number,w:number,h:number)=>{const o=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));o.rotation.x=-Math.PI/2;o.position.set(x,.026,z);pet.add(o);};
 contact(0,0,a.bodyWidth*3,a.bodyLength*2.7);for(const side of [-1,1])for(const z of [a.foreZ+.075,-a.bodyLength*.67])contact(side*a.legX,z,.35,.43);
 const furMaterial=()=>new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88});
 const addFurry=(geometry:THREE.BufferGeometry,count:number,ear=false)=>{paintCoat(geometry,sample);const surface=new THREE.Mesh(geometry,furMaterial());surface.castShadow=true;surface.receiveShadow=true;pet.add(surface);const hair=furStrands(geometry,a,sample,count,!!outfit,ear,['sweat','ribbon','turtle','shirring'].includes(outfit?.style||''));if(hair)pet.add(hair);return surface;};
 const ball=(size:number[],color:string,p:number[],material?:THREE.Material,parent=pet)=>{const o=new THREE.Mesh(new THREE.SphereGeometry(1,40,28),material||new THREE.MeshStandardMaterial({color,roughness:.65}));o.position.set(p[0],p[1],p[2]);o.scale.set(size[0],size[1],size[2]);o.castShadow=true;parent.add(o);return o;};
 const line=(points:number[][],color:string,radius=.006,parent=pet)=>{const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p as [number,number,number])));const o=new THREE.Mesh(new THREE.TubeGeometry(curve,28,radius,8,false),new THREE.MeshStandardMaterial({color,roughness:.65}));parent.add(o);return o;};
 addFurry(sculptBody(a),a.furLength>.05?56000:breed.coat==='curly'?29000:14500);
 for(const side of [-1,1]) {
  const droop=breed.ears==='floppy'||breed.ears==='folded';
  const fold=breed.ears==='folded',earRoot=[side*a.skull[0]*.78,a.headY+a.skull[1]*.56,a.headZ-.025];
  const earLength=(a.cat?.23:breed.id==='pomeranian'?.13:breed.id==='corgi'||breed.id==='chihuahua'?.29:breed.ears==='round'?.24:.29)*d.ears;
  const points=droop?[
   new THREE.Vector3(...earRoot as [number,number,number]),new THREE.Vector3(side*a.skull[0]*1.08,a.headY+a.skull[1]*.48,a.headZ-.025),new THREE.Vector3(side*a.skull[0]*1.25,a.headY+(fold?.05:-earLength*.38),a.headZ+.025),new THREE.Vector3(side*a.skull[0]*1.17,a.headY+(fold?-.02:-earLength*.83),a.headZ+.085)
  ]:[new THREE.Vector3(...earRoot as [number,number,number]),new THREE.Vector3(side*a.skull[0]*.87,a.headY+a.skull[1]*.8+earLength*.25,a.headZ-.025),new THREE.Vector3(side*a.skull[0]*.96,a.headY+a.skull[1]*.7+earLength,a.headZ-.065)];
  const geometry=curvedSurface(points,t=>droop?[.015+Math.sin(Math.PI*t)*.11,(.02+Math.sin(Math.PI*t)*.037)*(1-t*.85)]:[Math.max(.002,(1-t)*.145),Math.max(.003,(1-t)*.065)],28,new THREE.Vector3(1,0,0));
  addFurry(geometry,a.furLength>.05?3500:1700,true);
  if(!droop){const inner=geometry.clone();const positions=inner.getAttribute('position');for(let i=0;i<positions.count;i++){positions.setXYZ(i,earRoot[0]+(positions.getX(i)-earRoot[0])*.65,earRoot[1]+.025+(positions.getY(i)-earRoot[1])*.72,positions.getZ(i)+.035);}inner.computeVertexNormals();const ear=new THREE.Mesh(inner,new THREE.MeshStandardMaterial({color:breed.pattern==='points'?'#967b74':'#d3afa5',roughness:.98}));pet.add(ear);}
 }
 const tailStart=new THREE.Vector3(0,a.bodyY+.12,-a.bodyLength*.91);
 const tailPoints=breed.tail==='curl'?[
  tailStart,new THREE.Vector3(0,a.bodyY+.5,-a.bodyLength-.17),new THREE.Vector3(0,a.bodyY+.72,-a.bodyLength+.07),new THREE.Vector3(.02,a.bodyY+.47,-a.bodyLength+.29)
 ]:a.cat?[
  tailStart,new THREE.Vector3(.12,a.bodyY+.04,-a.bodyLength-.35),new THREE.Vector3(.4,a.bodyY+.25,-a.bodyLength-.66),new THREE.Vector3(.5,a.bodyY+.6,-a.bodyLength-.69)
 ]:[tailStart,new THREE.Vector3(.05,a.bodyY+.22,-a.bodyLength-.3),new THREE.Vector3(.16,a.bodyY+.36,-a.bodyLength-.6),new THREE.Vector3(.24,a.bodyY+.4,-a.bodyLength-.79)];
 const plume=breed.tail==='fluffy';
 const tail=curvedSurface(tailPoints,t=>{const r=(plume?.125:a.cat?.057:.078)*Math.pow(1-t,.65)+.004;return [r,r];});addFurry(tail,plume?6500:2200,true);
 // Layered sockets, irises, corneas and lids sit on the same continuous face.
 for(const side of [-1,1]) {
  const group=new THREE.Group();group.position.set(side*a.eyeX,a.eyeY,a.eyeZ+.005);group.rotation.y=side*.18;pet.add(group);
  const r=a.cat?.043:breed.id==='pomeranian'?.052:.046;
  ball([r*1.2,r*.98,.04],'#423730',[0,0,0],undefined,group);
  ball([r,r*.9,.043],'#211d1a',[0,0,.017],new THREE.MeshPhysicalMaterial({color:'#171514',roughness:.08,clearcoat:1,clearcoatRoughness:.03}),group);
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d')!;
  const irisColor=breed.id==='siamese'||breed.id==='ragdoll'||breed.id==='husky'?'#426e7d':a.cat?'#a1975e':'#60452e';
  ctx.fillStyle=irisColor;ctx.fillRect(0,0,256,256);for(let k=0;k<360;k++){const theta=k*Math.PI/180;ctx.strokeStyle=k%3?'#403b2e55':'#e6d5ac88';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(128+Math.cos(theta)*48,128+Math.sin(theta)*48);ctx.lineTo(128+Math.cos(theta)*126,128+Math.sin(theta)*126);ctx.stroke();}
  const irisTexture=new THREE.CanvasTexture(canvas);irisTexture.colorSpace=THREE.SRGBColorSpace;
  const iris=new THREE.Mesh(new THREE.CircleGeometry(r*.76,64),new THREE.MeshPhysicalMaterial({map:irisTexture,roughness:.19,clearcoat:1}));iris.position.z=.056;group.add(iris);
  ball([a.cat?r*.31:r*.43,r*.56,.007],'#0c0b0a',[0,0,.06],new THREE.MeshStandardMaterial({color:'#08090a',roughness:.06}),group);
  ball([.004,.006,.002],'#ffffff',[-.012,.015,.063],new THREE.MeshBasicMaterial({color:'#fff8ec'}),group);
  ball([.0025,.003,.001],'#ffffff',[.013,-.011,.063],new THREE.MeshBasicMaterial({color:'#d6e8ee'}),group);
  const lidColor=sample(side*a.eyeX,a.eyeY+.05,a.eyeZ).multiplyScalar(.45).getStyle();
  const lid=Array.from({length:35},(_,i)=>{const theta=i/34*Math.PI*2;return [Math.cos(theta)*r*1.1,Math.sin(theta)*r*.92,.017+Math.sin(theta)*.003];});line(lid,lidColor,.005,group);
  // Soft orbital ridges replace the old floating bead eyes.
  const brow=Array.from({length:12},(_,i)=>{const t=i/11*Math.PI;return [side*a.eyeX+Math.cos(t)*r*1.12,a.eyeY+Math.sin(t)*r*.95+.012,a.eyeZ-.005];});line(brow,sample(side*a.eyeX,a.eyeY+.08,a.eyeZ).getStyle(),.012);
 }
 const noseY=a.headY-.075,noseWidth=a.cat?.047:.065;
 const noseGeometry=new THREE.SphereGeometry(1,40,28),nosePositions=noseGeometry.getAttribute('position');for(let i=0;i<nosePositions.count;i++)nosePositions.setX(i,nosePositions.getX(i)*(.8+nosePositions.getY(i)*.22));noseGeometry.computeVertexNormals();
 const nose=new THREE.Mesh(noseGeometry,new THREE.MeshPhysicalMaterial({color:a.cat?'#bd8e86':'#242124',roughness:.34,clearcoat:.35}));nose.scale.set(noseWidth,a.cat?.031:.044,.038);nose.position.set(0,noseY,a.noseZ);pet.add(nose);
 for(const side of [-1,1])ball([noseWidth*.19,.009,.009],'#141111',[side*noseWidth*.49,noseY+.002,a.noseZ+.029]);
 const mouthZ=a.noseZ-.018;
 line([[0,noseY-.025,a.noseZ+.01],[0,noseY-.075,mouthZ+.05],[0,noseY-.1,mouthZ+.018]],'#614b42',.0035);
 for(const side of [-1,1])line([[0,noseY-.1,mouthZ+.018],[side*a.muzzleWidth*.43,noseY-.115,mouthZ+.005],[side*a.muzzleWidth*.78,noseY-.077,mouthZ-.045]],'#68534a',.0035);
 if(breed.id==='pomeranian'||breed.id==='samoyed'){
  ball([.065,.039,.018],'#3c2827',[0,noseY-.13,a.noseZ+.012]);
  ball([.035,.043,.014],'#d98f92',[0,noseY-.155,a.noseZ+.035],new THREE.MeshPhysicalMaterial({color:'#ce858b',roughness:.48}));
  line([[0,noseY-.147,mouthZ+.058],[0,noseY-.176,mouthZ+.055]],'#b9717a',.002);
 }
 if(a.cat)for(const side of [-1,1])for(let i=0;i<4;i++){
  const x=side*.105,y=a.headY-.115-i*.016,z=a.noseZ-.05;
  ball([.0035,.0035,.002],'#796a63',[x,y,z]);
  line([[x,y,z],[side*.24,y+(i-1.5)*.015,z+.01],[side*.43,y+(i-1.5)*.04,z-.025]],'#e3ddd1',.00135);
 }
 // Small toe grooves read as paws rather than disconnected spherical feet.
 for(const side of [-1,1])for(const back of [false,true])for(const offset of [-.032,.032]){
  const z=back?-a.bodyLength*.67:a.foreZ+.075;
  line([[side*a.legX+offset,.093,z+.152],[side*a.legX+offset,.138,z+.125]],sample(side*a.legX,.1,z).multiplyScalar(.77).getStyle(),.002);
 }
 if(d.collarEnabled){
  const band=new THREE.Mesh(new THREE.TorusGeometry(a.bodyWidth*.7,.018,12,64),new THREE.MeshStandardMaterial({color:d.collar,roughness:.65}));band.rotation.x=Math.PI/2-.18;band.position.set(0,a.bodyY+.43,a.headZ*.86);pet.add(band);
  const tag=ball([.052,.06,.009],'#c7a05e',[0,a.bodyY+.2,a.headZ+.22],new THREE.MeshStandardMaterial({color:'#d6b56e',metalness:.65,roughness:.28}));tag.rotation.x=-.1;
 }
 if(outfit)pet.add(dressPet(a,outfit));
 return pet;
}
