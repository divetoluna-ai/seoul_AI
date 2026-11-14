import * as THREE from 'three';
import type { Anatomy } from './avatar-anatomy';
const clamp=(v:number)=>Math.min(1,Math.max(0,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
export function coatSampler(a:Anatomy,fur:string):(x:number,y:number,z:number)=>THREE.Color {
 const base=new THREE.Color(fur),accent=new THREE.Color(a.breed.accent),cream=new THREE.Color('#f5eee2');
 const pom=a.breed.id==='pomeranian';
 return (x,y,z)=>{
  let weight=0,other=accent;
  const head=smooth(a.headY-.34,a.headY-.18,y),front=smooth(a.bodyLength*.05,a.bodyLength*.65,z);
  if(a.breed.pattern==='points')weight=Math.max(head*smooth(a.headZ+.03,a.headZ+.25,z),1-smooth(.22,.4,y),z<-a.bodyLength*.9?.9:0);
  if(a.breed.pattern==='mask'||pom) {
   other=cream;
   const lowerHead=(1-smooth(a.headY-.1,a.headY+.055,y))*head;
   const blaze=(1-smooth(.045,.1,Math.abs(x)))*head*smooth(a.headZ+.15,a.headZ+.28,z);
   const chest=front*(1-smooth(a.bodyY-.1,a.bodyY+.27,y))*(1-head);
   weight=Math.max(lowerHead,blaze,chest,1-smooth(.2,.34,y));
  }
  if(a.breed.pattern==='tuxedo')weight=Math.max(head*(1-smooth(.04,.12,Math.abs(x)))*smooth(a.headZ+.1,a.headZ+.23,z),front*(1-smooth(a.bodyY+.1,a.bodyY+.4,y))*(1-head),1-smooth(.18,.28,y));
  if(a.breed.pattern==='saddle'){other=new THREE.Color('#393331');weight=(1-head)*smooth(a.bodyY,a.bodyY+.25,y)*(1-smooth(a.bodyLength*.1,a.bodyLength*.5,z));}
  if(a.breed.pattern==='tabby') {
   const waves=Math.sin(z*25+Math.sin(y*12)*1.7+Math.abs(x)*5);
   weight=smooth(.45,.9,waves)*.85*(1-head);
   if(a.breed.id==='bengal')weight=smooth(.5,.85,Math.sin(z*30)*Math.sin(y*32))*(1-head);
   const brow=Math.sin(x*48+Math.sin(y*18));weight=Math.max(weight,head*smooth(.5,.95,brow)*smooth(a.headY+.03,a.headY+.13,y)*.75);
  }
  const noise=Math.sin(x*149+y*211+z*173)*Math.sin(x*91-y*121+z*67);
  const boundary=weight>0&&weight<1?noise*.06:0;
  return base.clone().lerp(other,clamp(weight+boundary)).multiplyScalar(1+noise*.035);
 };
}
export function paintCoat(geometry:THREE.BufferGeometry,sample:ReturnType<typeof coatSampler>) {
 const p=geometry.getAttribute('position'),colors=new Float32Array(p.count*3);
 for(let i=0;i<p.count;i++){const c=sample(p.getX(i),p.getY(i),p.getZ(i));colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b;}
 geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
}
export function furStrands(geometry:THREE.BufferGeometry,a:Anatomy,sample:ReturnType<typeof coatSampler>,count:number,covered:boolean,ear=false,sleeves=false):THREE.Mesh|undefined {
 if(a.furLength===0)return;
 const source=geometry.index?geometry.toNonIndexed():geometry;
 const positions=source.getAttribute('position'),normal=source.getAttribute('normal');
 const vertices:number[]=[],normals:number[]=[],colors:number[]=[];
 let seed=23719;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const triangles=positions.count/3,root=new THREE.Vector3(),n=new THREE.Vector3(),groom=new THREE.Vector3(),across=new THREE.Vector3();
 for(let i=0;i<count;i++) {
  const tri=Math.floor(random()*triangles)*3;let u=random(),v=random();if(u+v>1){u=1-u;v=1-v;}
  root.set(0,0,0);n.set(0,0,0);
  for(let k=0;k<3;k++){const w=k===0?1-u-v:k===1?u:v;root.x+=positions.getX(tri+k)*w;root.y+=positions.getY(tri+k)*w;root.z+=positions.getZ(tri+k)*w;n.x+=normal.getX(tri+k)*w;n.y+=normal.getY(tri+k)*w;n.z+=normal.getZ(tri+k)*w;}
  n.normalize();
  if(!ear){
   // Keep the corneas, nose and lips free of fur, and groom under the garment.
   const nearEye=Math.abs(Math.abs(root.x)-a.eyeX)<.085&&Math.abs(root.y-a.eyeY)<.075&&root.z>a.eyeZ-.045;
   if(nearEye||root.z>a.noseZ-.055)continue;
   if(sleeves&&Math.abs(Math.abs(root.x)-a.legX)<.19&&Math.abs(root.z-a.foreZ)<.21&&root.y>a.bodyY-.53&&root.y<a.bodyY-.08)continue;
   const bareArm=!sleeves&&Math.abs(root.x)>a.legX*.65&&root.y<a.bodyY-.05&&Math.abs(root.z-a.foreZ)<.19;
   if(covered&&!bareArm&&root.y<a.headY-.2&&root.y>a.bodyY-.34&&root.z>-a.bodyLength*.82&&root.z<a.noseZ-.06)continue;
  }
  const head=root.y>a.headY-.25;
  let length=a.furLength*(.6+random()*.8)*(head?1:1.05);
  if(a.breed.coat==='curly')length*=.8;
  if(head&&a.breed.id==='pomeranian')length*=.7;
  if(ear)length*=.55;
  const angle=random()*Math.PI*2;
  const flow=new THREE.Vector3(head?root.x*.6:0,head?-.32:-.4,head?-.1:-.55);
  flow.addScaledVector(n,-flow.dot(n)).normalize();
  groom.copy(n).multiplyScalar(head&&a.breed.id==='pomeranian'?.85:.5).addScaledVector(flow,head&&a.breed.id==='pomeranian'?.25:.7).normalize();
  across.set(Math.sin(angle),Math.cos(angle),Math.sin(angle*1.7)).cross(groom).normalize();
  const width=a.breed.coat==='smooth'?.0007:.00095;
  const tone=sample(root.x,root.y,root.z).multiplyScalar(.88+random()*.2);
  const points:THREE.Vector3[]=[];
  for(let k=0;k<3;k++){const t=k/2;const q=root.clone().addScaledVector(groom,length*t);q.y-=length*.28*t*t;if(a.breed.coat==='curly')q.addScaledVector(across,Math.sin(t*5)*length*.25);points.push(q);}
  const add=(point:THREE.Vector3,t:number,sign:number)=>{const p=point.clone().addScaledVector(across,width*(1-t*.94)*sign);vertices.push(p.x,p.y,p.z);normals.push(n.x,n.y,n.z);const c=tone.clone().multiplyScalar(.92+t*.15);colors.push(c.r,c.g,c.b);};
  for(let k=0;k<2;k++){const t=k/2,t1=(k+1)/2;add(points[k],t,-1);add(points[k],t,1);add(points[k+1],t1,1);add(points[k],t,-1);add(points[k+1],t1,1);add(points[k+1],t1,-1);}
 }
 if(source!==geometry)source.dispose();
 const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));result.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));result.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 return new THREE.Mesh(result,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95,side:THREE.DoubleSide}));
}
