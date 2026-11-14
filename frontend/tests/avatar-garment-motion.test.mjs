import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {REAL_MODELS} from '../src/real-model-catalog.ts';
import {OUTFITS} from '../src/avatar-catalog.ts';
import {loadAvatarBody} from './helpers/avatar-body.mjs';
import {fittedBodyGarment} from '../src/avatar-body-garment.ts';
import {skinGarment} from '../src/avatar-skin-transfer.ts';
import {rigQuadruped} from '../src/avatar-quadruped-rig.ts';
import {garmentCorrections} from '../src/avatar-garment-corrections.ts';
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}})})};
test('Golden Retriever garments follow walking, sitting and lying without large gaps or penetration',async()=>{
 const model=REAL_MODELS.find(m=>m.id==='golden-retriever'),source=await loadAvatarBody(model);source.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.boundsTree=new MeshBVH(o.geometry);});
 const rig=rigQuadruped(source,model.rig),bodies=[];rig.actor.traverse(o=>{if(o instanceof THREE.SkinnedMesh)bodies.push(o);});const body=bodies[0],mixer=new THREE.AnimationMixer(rig.actor);
 const garments=OUTFITS.map(outfit=>{const group=fittedBodyGarment(source,model,outfit,{ease:.035,width:1,length:1}),cloth=group.children[0],skinned=skinGarment(cloth.geometry,cloth.material,body);rig.actor.add(skinned);return {outfit,skinned};});
 const corrected=garmentCorrections(rig.actor,body,garments.map(g=>g.skinned),rig.clips);
 for(const state of ['walk','sitIdle','lieIdle'])for(const phase of [.25,.75]){
  mixer.stopAllAction();const clip=corrected.find(c=>c.name===state);mixer.clipAction(clip).reset().play();mixer.update(clip.duration*phase);rig.actor.updateMatrixWorld(true);body.skeleton.update();
  const posed=body.geometry.clone(),p=posed.getAttribute('position');for(let i=0;i<p.count;i++){const q=body.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(body.geometry.getAttribute('position'),i));p.setXYZ(i,q.x,q.y,q.z);}const tree=new MeshBVH(posed);
  for(const {outfit,skinned} of garments){const pos=skinned.geometry.getAttribute('position');let inside=0,count=0,max=0,details=[];
   for(let i=0;i<pos.count;i+=Math.max(1,Math.floor(pos.count/160))){const original=new THREE.Vector3().fromBufferAttribute(pos,i);skinned.geometry.morphAttributes.position.forEach((target,k)=>original.addScaledVector(new THREE.Vector3().fromBufferAttribute(target,i),skinned.morphTargetInfluences[k]));const q=skinned.applyBoneTransform(i,original),h=tree.closestPointToPoint(q),index=posed.index,tri=new THREE.Triangle(...[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,index.getX(h.faceIndex*3+k))));inside+=q.clone().sub(h.point).dot(tri.getNormal(new THREE.Vector3()))<-.006?1:0;if(q.clone().sub(h.point).dot(tri.getNormal(new THREE.Vector3()))<-.006)details.push([i,new THREE.Vector3().fromBufferAttribute(pos,i).toArray(),h.distance]);count++;max=Math.max(max,h.distance);}
   assert.ok(inside/count<.04,`${outfit.id} ${state}: penetration ${inside}/${count} ${JSON.stringify(details)}`);assert.ok(max<.075,`${outfit.id} ${state}: gap ${max}`);
  }posed.dispose();
 }
 mixer.stopAllAction();mixer.uncacheRoot(rig.actor);
});
