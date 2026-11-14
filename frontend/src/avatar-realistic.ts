import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import type { StudioDesign } from './AvatarStudio';
import { OUTFITS } from './avatar-catalog';
import { realModelFor, type RealModel } from './real-model-catalog';
import { fitRealClothes } from './avatar-real-clothing';
import {clone as cloneSkeleton} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {createPetMotion} from './avatar-motion';
import {skinGarment} from './avatar-skin-transfer';
import {rigQuadruped} from './avatar-quadruped-rig';
import type {MotionProfile} from './avatar-motion';

type LoadedPet={surface:THREE.Group;actor:THREE.Group;clips:THREE.AnimationClip[];profile?:MotionProfile};
export type LivePet=THREE.Group & {motion?:ReturnType<typeof createPetMotion>};
const cache=new Map<string,Promise<LoadedPet>>();
function asset(model:RealModel):Promise<LoadedPet> {
 let pending=cache.get(model.id);if(pending)return pending;
 pending=new GLTFLoader().loadAsync(`/models/realistic/${model.slug}.glb`).then(gltf=>{
  const root=gltf.scene;root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3());
  const scale=model.height/size.y;
  const transform=new THREE.Matrix4().makeTranslation(-(box.min.x+box.max.x)/2,-box.min.y,-(box.min.z+box.max.z)/2);
  transform.premultiply(new THREE.Matrix4().makeScale(scale,scale,scale));
  // Assets are posed diagonally; align the torso axis before fitting clothing.
  transform.premultiply(new THREE.Matrix4().makeRotationY(model.yaw));
  transform.premultiply(new THREE.Matrix4().makeTranslation(model.shiftX,0,0));
  const result=new THREE.Group();
  root.traverse(o=>{if(o instanceof THREE.Mesh){const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld).applyMatrix4(transform);geometry.boundsTree=new MeshBVH(geometry);const mesh=new THREE.Mesh(geometry,o.material);mesh.raycast=acceleratedRaycast;result.add(mesh);}});
  result.updateMatrixWorld(true);
  const actor=new THREE.Group();actor.applyMatrix4(transform);actor.add(root);actor.updateMatrixWorld(true);
  if(model.rig){const rig=rigQuadruped(result,model.rig);return {surface:result,actor:rig.actor,clips:rig.clips,profile:rig.profile};}
  return {surface:result,actor,clips:gltf.animations,profile:model.motion};
 }).catch(error=>{cache.delete(model.id);throw error;});cache.set(model.id,pending);return pending;
}
export async function buildRealPet(d:StudioDesign):Promise<THREE.Group> {
 const model=realModelFor(d.breedId,d.species);
 const loaded=await asset(model),source=loaded.surface,pet:LivePet=new THREE.Group();pet.name=`realistic-${d.species}`;
 // Clone render resources; the cached original remains available for subsequent edits.
 const profile=loaded.profile;
 const actor=profile?cloneSkeleton(loaded.actor) as THREE.Group:source.clone();
 actor.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry=o.geometry.clone();o.material=(Array.isArray(o.material)?o.material:[o.material]).map(original=>{const m=original.clone();if(m instanceof THREE.MeshStandardMaterial){for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap'] as const){const texture=m[key];if(texture){m[key]=texture.clone();m[key]!.anisotropy=8;}}m.envMapIntensity=m.name.includes('eye')?1.2:.65;m.roughness=m.name.includes('eye')?.13:Math.max(.45,m.roughness);}return m;});if(o.material.length===1)o.material=o.material[0];o.castShadow=true;o.receiveShadow=true;if(o instanceof THREE.SkinnedMesh)o.frustumCulled=false;}});
 pet.add(actor);actor.updateMatrixWorld(true);
 const outfit=OUTFITS.find(o=>o.id===d.outfitId);
 if(outfit){
  const fittingSource=new THREE.Group();
  for(const object of source.children)if(object instanceof THREE.Mesh&&(!model.fitMaterial||(Array.isArray(object.material)?object.material:[object.material]).some(m=>m.name===model.fitMaterial))){const mesh=object.clone();mesh.raycast=acceleratedRaycast;fittingSource.add(mesh);}
  const clothes=fitRealClothes(fittingSource,model,outfit,{ease:d.fitEase,length:d.fitLength,width:d.fitWidth});
  if(profile){
   const bodies:THREE.SkinnedMesh[]=[];actor.traverse(o=>{if(o instanceof THREE.SkinnedMesh)bodies.push(o);});
   const body=(model.fitMaterial?bodies.filter(b=>(Array.isArray(b.material)?b.material:[b.material]).some(m=>m.name===model.fitMaterial)):bodies).sort((a,b)=>b.geometry.getAttribute('position').count-a.geometry.getAttribute('position').count)[0];
   if(!body)throw new Error('의상에 연결할 뼈대가 없습니다.');
   if(model.fitMaterial){
    const vest=clothes.children[0] as THREE.Mesh,tree=new MeshBVH(vest.geometry),curve=new THREE.CatmullRomCurve3(model.guide.map(p=>new THREE.Vector3(...p))),centers=curve.getPoints(48);
    for(const fur of bodies)if(fur!==body){const positions=fur.geometry.getAttribute('position');for(let i=0;i<positions.count;i++){
     const q=new THREE.Vector3().fromBufferAttribute(positions,i),hit=tree.closestPointToPoint(q);if(!hit||hit.distance>.1)continue;
     const center=centers.reduce((best,p)=>p.distanceToSquared(hit.point)<best.distanceToSquared(hit.point)?p:best,centers[0]);
     const outward=hit.point.clone().sub(center).normalize();if(q.clone().sub(hit.point).dot(outward)>-.012){q.copy(hit.point).addScaledVector(outward,-.012);positions.setXYZ(i,q.x,q.y,q.z);}
    }positions.needsUpdate=true;fur.geometry.computeVertexNormals();}
   }
   const inverse=body.matrixWorld.clone().invert(),parts:THREE.Mesh[]=[];clothes.traverse(o=>{if(o instanceof THREE.Mesh)parts.push(o);});
   for(const part of parts){part.updateWorldMatrix(true,false);part.geometry.applyMatrix4(part.matrixWorld).applyMatrix4(inverse);body.parent!.add(skinGarment(part.geometry,part.material,body));}
  }else pet.add(clothes);
 }

 pet.position.set(.25,.025,.5);pet.rotation.y=d.rotation*Math.PI/180;pet.scale.setScalar(d.size);
 if(profile)pet.motion=createPetMotion(pet,actor,loaded.clips,{...profile,speed:profile.speed*d.size,radius:profile.radius*d.size},d.furniture.map(f=>({x:f.x,z:f.z,radius:({bed:.75,sofa:1.1,plant:.3,bowl:.28})[f.type]})));
 return pet;
}
