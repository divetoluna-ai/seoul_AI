import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {roomRoute} from '../src/avatar-navigation.ts';
import {MOTION_STATES,motionClips,createPetMotion} from '../src/avatar-motion.ts';
import {skinGarment} from '../src/avatar-skin-transfer.ts';
function rig(){
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,0,0,0,1,0,0,0,0,0,0,0],4));
 geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
 const body=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial()),a=new THREE.Bone(),b=new THREE.Bone();a.name='hips';b.name='shoulder';a.add(b);body.add(a);body.bind(new THREE.Skeleton([a,b]));
 const actor=new THREE.Group();actor.add(body);actor.updateMatrixWorld(true);
 const clips=MOTION_STATES.map(name=>new THREE.AnimationClip(name,1,[new THREE.QuaternionKeyframeTrack('hips.quaternion',[0,1],[0,0,0,1,0,.1,0,.995])]));
 const profile={clips:Object.fromEntries(MOTION_STATES.map(s=>[s,s])),speed:.4,radius:.4};
 return {body,actor,clips,profile,b};
}
test('room routes preserve body clearance around furniture and room walls',()=>{
 const obstacles=[{x:0,z:0,radius:.6}],start={x:-2,z:0},goal={x:2,z:0},path=roomRoute(start,goal,.4,obstacles);assert.ok(path.length>1);
 let previous=start;for(const point of path){for(let t=0;t<=1;t+=.01){const x=previous.x+(point.x-previous.x)*t,z=previous.z+(point.z-previous.z)*t;assert.ok(Math.hypot(x,z)>1.08-1e-6);assert.ok(Math.abs(x)<=2.6&&Math.abs(z)<=2.6);}previous=point;}
 assert.deepEqual(roomRoute(start,{x:0,z:0},.4,obstacles),[]);
 assert.deepEqual(roomRoute(start,{x:3,z:0},.4,[]),[]);
});
test('static meshes and incomplete or mismatched animation libraries cannot enable movement',()=>{
 const {actor,clips,profile}=rig();assert.throws(()=>motionClips(new THREE.Group(),clips,profile),/뼈대/);
 assert.throws(()=>motionClips(actor,clips.slice(1),profile),/idle/);
 const bad=clips.map(c=>c.clone());bad[0].tracks[0].name='missing.quaternion';assert.throws(()=>motionClips(actor,bad,profile),/맞지/);
});
test('sit and lie states play entry and recovery transitions before returning to idle',()=>{
 for(const [random,entry,rest,recovery] of [[()=>0,'sitDown','sitIdle','standUp'],[()=>.3,'lieDown','lieIdle','getUp']]){
  const {actor,clips,profile}=rig(),pet=new THREE.Group();pet.add(actor);const motion=createPetMotion(pet,actor,clips,profile,[],random);
  const seen=new Set();for(let i=0;i<600;i++){motion.update(.05);seen.add(motion.state);}
  for(const state of ['idle',entry,rest,recovery])assert.ok(seen.has(state),state);assert.equal(pet.position.length(),0);motion.dispose();
 }
});
test('walking uses bounded frame steps and stops at room-safe destinations',()=>{
 const {actor,clips,profile}=rig(),pet=new THREE.Group();pet.add(actor);const motion=createPetMotion(pet,actor,clips,profile,[],()=>.75);
 let moved=false;for(let i=0;i<500;i++){const before=pet.position.clone();motion.update(i===200?60:.05);assert.ok(pet.position.distanceTo(before)<=.020001);moved ||= pet.position.length()>.1;assert.ok(Math.abs(pet.position.x)<2.6&&Math.abs(pet.position.z)<2.6);}assert.ok(moved);motion.dispose();
});
test('garment weights interpolate body triangles and follow the same animated bones',()=>{
 const {body,b}=rig(),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([.25,.25,.035],3));
 const cloth=skinGarment(geometry,new THREE.MeshBasicMaterial(),body);assert.equal(cloth.skeleton,body.skeleton);
 const weights=geometry.getAttribute('skinWeight');assert.ok(Math.abs(weights.getX(0)+weights.getY(0)-1)<1e-6);
 body.add(cloth);b.position.z=.2;body.updateMatrixWorld(true);body.skeleton.update();
 const result=cloth.applyBoneTransform(0,new THREE.Vector3(.25,.25,.035));assert.ok(Math.abs(result.z-.085)<1e-6);
});
