import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import type { StudioDesign } from './AvatarStudio';
import { OUTFITS } from './avatar-catalog';
import { realModelFor, type RealModel } from './real-model-catalog';
import { fitRealClothes } from './avatar-real-clothing';

const cache=new Map<string,Promise<THREE.Group>>();
function asset(model:RealModel):Promise<THREE.Group> {
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
  result.updateMatrixWorld(true);return result;
 }).catch(error=>{cache.delete(model.id);throw error;});cache.set(model.id,pending);return pending;
}
export async function buildRealPet(d:StudioDesign):Promise<THREE.Group> {
 const model=realModelFor(d.breedId,d.species);
 const source=await asset(model),pet=new THREE.Group();pet.name=`realistic-${d.species}`;
 // Clone render resources; the cached original remains available for subsequent edits.
 source.traverse(o=>{if(o instanceof THREE.Mesh){const material=(Array.isArray(o.material)?o.material:[o.material]).map(original=>{const m=original.clone();if(m instanceof THREE.MeshStandardMaterial){for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap'] as const){const texture=m[key];if(texture){m[key]=texture.clone();m[key]!.anisotropy=8;}}m.envMapIntensity=.65;m.roughness=Math.max(.45,m.roughness);}return m;});const mesh=new THREE.Mesh(o.geometry.clone(),Array.isArray(o.material)?material:material[0]);mesh.castShadow=true;mesh.receiveShadow=true;pet.add(mesh);}});
 const outfit=OUTFITS.find(o=>o.id===d.outfitId);
 if(outfit)pet.add(fitRealClothes(source,model,outfit,{ease:d.fitEase,length:d.fitLength,width:d.fitWidth}));

 pet.position.set(.25,.025,.5);pet.rotation.y=d.rotation*Math.PI/180;pet.scale.setScalar(d.size);return pet;
}
