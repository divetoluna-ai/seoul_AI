import * as THREE from 'three';
import {MOTION_STATES,type MotionState,type MotionProfile} from './avatar-motion.ts';

type V=[number,number,number];
export type QuadrupedLandmarks={hips:V;chest:V;neck:V;head:V;frontFeet:[V,V];hindFeet:[V,V];width:number;stride:number};
const vector=(v:V)=>new THREE.Vector3(...v);
const smooth=(t:number)=>t*t*(3-2*t);
/** Builds a deforming quadruped skeleton on an imported, normalized standing mesh. */
export function rigQuadruped(source:THREE.Group,landmarks:QuadrupedLandmarks){
 const actor=new THREE.Group(),bones:THREE.Bone[]=[],rest:THREE.Vector3[]=[],parents:number[]=[];
 const add=(name:string,p:THREE.Vector3,parent=-1)=>{const b=new THREE.Bone();b.name=name;b.position.copy(p);if(parent>=0){b.position.sub(rest[parent]);bones[parent].add(b);}else actor.add(b);parents.push(parent);rest.push(p.clone());bones.push(b);return bones.length-1;};
 const hip=add('pet_hips',vector(landmarks.hips)),chest=add('pet_chest',vector(landmarks.chest),hip),neck=add('pet_neck',vector(landmarks.neck),chest),head=add('pet_head',vector(landmarks.head),neck);
 const legs:{top:number;knee:number;foot:number;front:boolean;side:number;lengths:[number,number]}[]=[];
 for(const front of [true,false])for(let side=0;side<2;side++){
  const foot=vector((front?landmarks.frontFeet:landmarks.hindFeet)[side]),anchor=vector(front?landmarks.chest:landmarks.hips);anchor.x=foot.x;anchor.y-=.08;
  const knee=anchor.clone().lerp(foot,.53);knee.z+=(front?-.12:.14);
  const topId=add(`pet_${front?'front':'hind'}_${side}_upper`,anchor,front?chest:hip),kneeId=add(`pet_${front?'front':'hind'}_${side}_lower`,knee,topId),footId=add(`pet_${front?'front':'hind'}_${side}_paw`,foot,kneeId);
  legs.push({top:topId,knee:kneeId,foot:footId,front,side,lengths:[anchor.distanceTo(knee),knee.distanceTo(foot)]});
 }
 actor.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(bones);skeleton.calculateInverses();
 source.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const geometry=o.geometry.clone(),positions=geometry.getAttribute('position'),indices:number[]=[],weights:number[]=[];
  for(let i=0;i<positions.count;i++){
   const p=new THREE.Vector3().fromBufferAttribute(positions,i),influences=new Map<number,number>();
   const torsoT=THREE.MathUtils.clamp((p.z-rest[hip].z)/(rest[chest].z-rest[hip].z),0,1);
   let limb:typeof legs[number]|undefined,nearest=Infinity;
   for(const leg of legs){const anchor=rest[leg.top],d=Math.hypot((p.x-anchor.x)*1.2,(p.z-anchor.z)*.8);if(d<nearest){limb=leg;nearest=d;}}
   const legBlend=limb?THREE.MathUtils.smoothstep(rest[limb.top].y-p.y,0,.28)*(1-THREE.MathUtils.smoothstep(nearest,landmarks.width*.6,landmarks.width*1.7)):0;
   const headBlend=THREE.MathUtils.smoothstep(p.y,rest[neck].y-.08,rest[head].y-.03);
   influences.set(hip,(1-torsoT)*(1-legBlend)*(1-headBlend));influences.set(chest,torsoT*(1-legBlend)*(1-headBlend));influences.set(head,headBlend*(1-legBlend));
   if(limb&&legBlend>0){const t=THREE.MathUtils.clamp((rest[limb.top].y-p.y)/(rest[limb.top].y-rest[limb.foot].y),0,1);const lower=THREE.MathUtils.smoothstep(t,.35,.7);influences.set(limb.top,legBlend*(1-lower));influences.set(limb.knee,legBlend*lower);}
   const best=[...influences].filter(([,w])=>w>0).sort((a,b)=>b[1]-a[1]).slice(0,4),total=best.reduce((n,[,w])=>n+w,0);
   for(let k=0;k<4;k++){indices.push(best[k]?.[0]??hip);weights.push((best[k]?.[1]??0)/(total||1));}
  }
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const mesh=new THREE.SkinnedMesh(geometry,o.material);actor.add(mesh);mesh.bind(skeleton,new THREE.Matrix4());mesh.frustumCulled=false;
 });
 function pose(state:MotionState,t:number){
  let sit=0,lie=0;if(state==='sitIdle')sit=1;if(state==='lieIdle')lie=1;if(state==='sitDown')sit=smooth(t);if(state==='standUp')sit=1-smooth(t);if(state==='lieDown')lie=smooth(t);if(state==='getUp')lie=1-smooth(t);
  const world=rest.map(p=>p.clone()),rot=bones.map(()=>new THREE.Quaternion());
  world[hip].y-=sit*landmarks.hips[1]*.42+lie*landmarks.hips[1]*.65;world[hip].z-=sit*.16;
  world[chest].y-=sit*.05+lie*landmarks.chest[1]*.62;world[chest].z+=sit*.04;
  world[neck].add(world[chest].clone().sub(rest[chest]));world[head].add(world[neck].clone().sub(rest[neck]));
  const bob=state==='walk'?Math.sin(t*Math.PI*4)*.012:Math.sin(t*Math.PI*2)*.006;for(const id of [hip,chest,neck,head])world[id].y+=bob;
  for(const [id,child] of [[hip,chest],[chest,neck],[neck,head]])rot[id].setFromUnitVectors(rest[child].clone().sub(rest[id]).normalize(),world[child].clone().sub(world[id]).normalize());
  rot[head].setFromAxisAngle(new THREE.Vector3(0,1,0),Math.sin(t*Math.PI*2)*(state==='idle'?.055:.015));
  for(const leg of legs){
   const root=leg.front?chest:hip;world[leg.top].copy(rest[leg.top]).sub(rest[root]).applyQuaternion(rot[root]).add(world[root]);
   const foot=world[leg.foot];foot.z+=lie*(leg.front?.25:.14)+sit*(leg.front?0:.25);
   if(state==='walk'){const phase=(t+(leg.side===0?0:.5)+(leg.front?0:.5))%1;foot.z+=(phase<.5?-1+2*smooth(phase*2):1-4*(phase-.5))*landmarks.stride;foot.y+=phase<.5?Math.sin(phase*Math.PI*2)*.12:0;}
   const anchor=world[leg.top],direction=foot.clone().sub(anchor),distance=direction.length(),[l1,l2]=leg.lengths;
   direction.normalize();const d=THREE.MathUtils.clamp(distance,Math.abs(l1-l2)+.001,l1+l2-.001),along=(l1*l1-l2*l2+d*d)/(2*d),bend=Math.sqrt(Math.max(0,l1*l1-along*along));
   const pole=new THREE.Vector3(0,0,leg.front?-1:1);pole.addScaledVector(direction,-pole.dot(direction)).normalize();world[leg.knee].copy(anchor).addScaledVector(direction,along).addScaledVector(pole,bend);world[leg.foot].copy(anchor).addScaledVector(direction,d);
   for(const [id,child] of [[leg.top,leg.knee],[leg.knee,leg.foot]])rot[id].setFromUnitVectors(rest[child].clone().sub(rest[id]).normalize(),world[child].clone().sub(world[id]).normalize());rot[leg.foot].identity();
  }
  return {world,rot};
 }
 const clips=MOTION_STATES.map(state=>{
  const duration=state==='walk'?1.4:['idle','sitIdle','lieIdle'].includes(state)?3:1.2,times=Array.from({length:49},(_,i)=>i/48*duration),positions=bones.map(()=>[] as number[]),quaternions=bones.map(()=>[] as number[]);
  times.forEach((_,frame)=>{const {world,rot}=pose(state,frame/48);bones.forEach((_,i)=>{const parent=parents[i],q=rot[i].clone(),p=world[i].clone();if(parent>=0){const inverse=rot[parent].clone().invert();p.sub(world[parent]).applyQuaternion(inverse);q.premultiply(inverse);}positions[i].push(p.x,p.y,p.z);quaternions[i].push(q.x,q.y,q.z,q.w);});});
  return new THREE.AnimationClip(state,duration,bones.flatMap((b,i)=>[new THREE.VectorKeyframeTrack(`${b.name}.position`,times,positions[i]),new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`,times,quaternions[i])]));
 });
 const box=new THREE.Box3().setFromObject(source),radius=Math.hypot(Math.max(Math.abs(box.min.x),Math.abs(box.max.x)),Math.max(Math.abs(box.min.z),Math.abs(box.max.z)))+.05;
 const profile:MotionProfile={clips:Object.fromEntries(MOTION_STATES.map(s=>[s,s])) as MotionProfile['clips'],speed:landmarks.stride*4/1.4,radius};
 return {actor,clips,profile};
}
