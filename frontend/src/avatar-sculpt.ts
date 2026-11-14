import * as THREE from 'three';
import { fieldAt, type Anatomy } from './avatar-anatomy.ts';
const sculptCache = new Map<string, THREE.BufferGeometry>();
// A continuous signed-distance surface joins chest, neck, muzzle and limbs.
export function sculptBody(a:Anatomy):THREE.BufferGeometry {
 const cached = sculptCache.get(a.breed.id);
 if (cached) return cached.clone();
 const step=.038,xmin=-.85,ymin=-.08,zmin=-a.bodyLength- .45;
 const nx=46,ny=Math.ceil((a.headY+a.skull[1]+.2-ymin)/step)+1,nz=Math.ceil((a.noseZ+.17-zmin)/step)+1;
 const count=nx*ny*nz,values=new Float32Array(count),gradients=new Float32Array(count*3);
 const index=(x:number,y:number,z:number)=>(z*ny+y)*nx+x;
 for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)values[index(x,y,z)]=fieldAt(a.parts,xmin+x*step,ymin+y*step,zmin+z*step);
 for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++) {
  const i=index(x,y,z),k=i*3;
  gradients[k]=values[i+1]-values[i-1];gradients[k+1]=values[i+nx]-values[i-nx];gradients[k+2]=values[i+nx*ny]-values[i-nx*ny];
 }
 const positions:number[]=[],normals:number[]=[];
 const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
 const tets=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
 type Vertex={p:number[];n:number[]};
 const triangle=(a:Vertex,b:Vertex,c:Vertex)=>{
  const u=b.p.map((v,i)=>v-a.p[i]),v=c.p.map((v,i)=>v-a.p[i]);
  const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  if(cross.reduce((s,v,i)=>s+v*(a.n[i]+b.n[i]+c.n[i]),0)<0)[b,c]=[c,b];
  for(const item of [a,b,c]){positions.push(...item.p);const l=Math.hypot(...item.n)||1;normals.push(...item.n.map(v=>v/l));}
 };
 for(let z=1;z<nz-2;z++)for(let y=1;y<ny-2;y++)for(let x=1;x<nx-2;x++) {
  const ids=corners.map(c=>index(x+c[0],y+c[1],z+c[2]));
  let mask=0;ids.forEach((id,i)=>{if(values[id]<0)mask|=1<<i;});if(mask===0||mask===255)continue;
  const edge=(i:number,j:number):Vertex=>{const ia=ids[i],ib=ids[j],t=values[ia]/(values[ia]-values[ib]);return {p:[xmin+(x+corners[i][0]+(corners[j][0]-corners[i][0])*t)*step,ymin+(y+corners[i][1]+(corners[j][1]-corners[i][1])*t)*step,zmin+(z+corners[i][2]+(corners[j][2]-corners[i][2])*t)*step],n:[0,1,2].map(k=>gradients[ia*3+k]+(gradients[ib*3+k]-gradients[ia*3+k])*t)};};
  for(const tet of tets){const inside=tet.filter(i=>values[ids[i]]<0),outside=tet.filter(i=>values[ids[i]]>=0);if(inside.length===0||inside.length===4)continue;
   if(inside.length===1)triangle(edge(inside[0],outside[0]),edge(inside[0],outside[1]),edge(inside[0],outside[2]));
   else if(inside.length===3)triangle(edge(outside[0],inside[0]),edge(outside[0],inside[1]),edge(outside[0],inside[2]));
   else{const v0=edge(inside[0],outside[0]),v1=edge(inside[0],outside[1]),v2=edge(inside[1],outside[0]),v3=edge(inside[1],outside[1]);triangle(v0,v1,v2);triangle(v1,v3,v2);}
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
 if (sculptCache.size >= 5) { const oldest = sculptCache.keys().next().value!; sculptCache.get(oldest)!.dispose(); sculptCache.delete(oldest); }
 sculptCache.set(a.breed.id,geometry.clone()); return geometry;
}
