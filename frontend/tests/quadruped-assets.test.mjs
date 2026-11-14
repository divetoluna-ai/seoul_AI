import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadAvatarBody} from './helpers/avatar-body.mjs';
import {REAL_MODELS} from '../src/real-model-catalog.ts';
import {rigQuadruped} from '../src/avatar-quadruped-rig.ts';
import {motionClips,createPetMotion} from '../src/avatar-motion.ts';


for(const model of REAL_MODELS.filter(m=>m.rig))test(`${model.id}: real downloaded mesh has valid weights and eight deforming animations`,async()=>{
 assert.ok(model.source?.credit.includes('CC BY'));
 const source=await loadAvatarBody(model),rig=rigQuadruped(source,model.rig);assert.doesNotThrow(()=>motionClips(rig.actor,rig.clips,rig.profile));
 const skins=[];rig.actor.traverse(o=>{if(o instanceof THREE.SkinnedMesh)skins.push(o);});assert.ok(skins.length);
 for(const mesh of skins){const weights=mesh.geometry.getAttribute('skinWeight');for(let i=0;i<weights.count;i+=37){const sum=weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i);assert.ok(Math.abs(sum-1)<1e-5);}}
 const mixer=new THREE.AnimationMixer(rig.actor),seen=new Set();
 for(const clip of rig.clips){mixer.stopAllAction();const action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.update(clip.duration*.75);rig.actor.updateMatrixWorld(true);
  let changed=false;for(const mesh of skins){mesh.skeleton.update();const pos=mesh.geometry.getAttribute('position');for(let i=0;i<pos.count;i+=101){const rest=new THREE.Vector3().fromBufferAttribute(pos,i),p=mesh.applyBoneTransform(i,rest.clone());assert.ok([p.x,p.y,p.z].every(Number.isFinite));assert.ok(p.distanceTo(rest)<model.height*1.5);changed ||= p.distanceTo(rest)>.001;}}
  if(changed)seen.add(clip.name);
 }
 for(const name of ['walk','sitDown','sitIdle','standUp','lieDown','lieIdle','getUp'])assert.ok(seen.has(name),`${name} must deform the imported geometry`);
 mixer.stopAllAction();mixer.uncacheRoot(rig.actor);
 // A planted front foot should stay still in world space during forward travel.
 const walk=rig.clips.find(c=>c.name==='walk'),foot=rig.actor.getObjectByName('pet_front_1_paw'),samples=[];
 for(const t of [.1,.2]){mixer.stopAllAction();mixer.clipAction(walk).reset().play();mixer.update(walk.duration*t);rig.actor.updateMatrixWorld(true);const p=foot.getWorldPosition(new THREE.Vector3());p.z+=rig.profile.speed*walk.duration*t;samples.push(p);}
 assert.ok(Math.abs(samples[0].z-samples[1].z)<.015,`stance foot slides: ${samples.map(p=>p.toArray())}`);mixer.stopAllAction();
 const pet=new THREE.Group();pet.position.set(.25,.025,.5);pet.add(rig.actor);let seed=27;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
 const obstacles=[{x:-1.8,z:.8,radius:.75},{x:1.5,z:-2.15,radius:1.1},{x:-2.5,z:-2.4,radius:.3},{x:1.65,z:1.3,radius:.28}];
 const motion=createPetMotion(pet,rig.actor,rig.clips,rig.profile,obstacles,random),states=new Set();
 for(let i=0;i<4000;i++){motion.update(.05);states.add(motion.state);for(const o of obstacles)assert.ok(Math.hypot(pet.position.x-o.x,pet.position.z-o.z)>rig.profile.radius+o.radius+.079);assert.ok(Math.abs(pet.position.x)<=3-rig.profile.radius&&Math.abs(pet.position.z)<=3-rig.profile.radius);}
 for(const state of ['walk','sitIdle','lieIdle'])assert.ok(states.has(state),`autonomous ${state} was unreachable`);motion.dispose();
});
