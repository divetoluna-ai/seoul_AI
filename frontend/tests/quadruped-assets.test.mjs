import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {REAL_MODELS} from '../src/real-model-catalog.ts';
import {rigQuadruped} from '../src/avatar-quadruped-rig.ts';
import {motionClips,createPetMotion} from '../src/avatar-motion.ts';

async function body(model){
 const bytes=readFileSync(new URL(`../public/models/realistic/${model.slug}.glb`,import.meta.url)),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length));
 json.materials=json.materials?.map(m=>({name:m.name}));delete json.images;delete json.textures;
 const raw=Buffer.from(JSON.stringify(json)),padding=Buffer.alloc((4-raw.length%4)%4,32),tail=bytes.subarray(20+length),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(20+raw.length+padding.length+tail.length,8);header.writeUInt32LE(raw.length+padding.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const buffer=Buffer.concat([header,raw,padding,tail]),gltf=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
 gltf.scene.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(gltf.scene),scale=model.height/(box.max.y-box.min.y),transform=new THREE.Matrix4().makeTranslation(-(box.min.x+box.max.x)/2,-box.min.y,-(box.min.z+box.max.z)/2);
 transform.premultiply(new THREE.Matrix4().makeScale(scale,scale,scale));transform.premultiply(new THREE.Matrix4().makeRotationY(model.yaw));transform.premultiply(new THREE.Matrix4().makeTranslation(model.shiftX,0,0));
 const group=new THREE.Group();gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)group.add(new THREE.Mesh(o.geometry.clone().applyMatrix4(o.matrixWorld).applyMatrix4(transform),o.material));});return group;
}
for(const model of REAL_MODELS.filter(m=>m.rig))test(`${model.id}: real downloaded mesh has valid weights and eight deforming animations`,async()=>{
 assert.ok(model.source?.credit.includes('CC BY'));
 const source=await body(model),rig=rigQuadruped(source,model.rig);assert.doesNotThrow(()=>motionClips(rig.actor,rig.clips,rig.profile));
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
