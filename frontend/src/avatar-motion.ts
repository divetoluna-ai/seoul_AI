import * as THREE from 'three';
import {roomRoute,type Point,type Obstacle} from './avatar-navigation.ts';
export const MOTION_STATES=['idle','walk','sitDown','sitIdle','standUp','lieDown','lieIdle','getUp'] as const;
export type MotionState=typeof MOTION_STATES[number];
export type MotionProfile={clips:Record<MotionState,string>;speed:number;radius:number};
export function motionClips(root:THREE.Object3D,clips:THREE.AnimationClip[],profile:MotionProfile) {
 let skinned=false;const names=new Set<string>();root.traverse(o=>{names.add(o.name);if(o instanceof THREE.SkinnedMesh)skinned=true;});
 if(!skinned)throw new Error('자동 동작에는 스킨과 뼈대가 있는 모델이 필요합니다.');
 if(!(profile.speed>0&&profile.radius>0&&profile.radius<2.5))throw new Error('이동 속도와 몸 크기를 확인해주세요.');
 const result={} as Record<MotionState,THREE.AnimationClip>;
 for(const state of MOTION_STATES) {
  const clip=clips.find(c=>c.name===profile.clips[state]);
  if(!clip||clip.duration<=0||!clip.tracks.length)throw new Error(`필수 동작이 없습니다: ${state}`);
  if(!clip.tracks.every(t=>{const binding=THREE.PropertyBinding.parseTrackName(t.name);return names.has(binding.nodeName??'');}))throw new Error(`뼈대와 맞지 않는 동작입니다: ${state}`);
  result[state]=clip;
 }
 return result;
}
/** Only accepts verified in-place clips. Sitting/lying always use transition clips. */
export function createPetMotion(pet:THREE.Group,actor:THREE.Object3D,clips:THREE.AnimationClip[],profile:MotionProfile,obstacles:Obstacle[],random= Math.random) {
 const library=motionClips(actor,clips,profile),mixer=new THREE.AnimationMixer(actor);
 let state:MotionState='idle',time=0,hold=3+random()*4,path:Point[]=[],action:THREE.AnimationAction|undefined;
 const enter=(next:MotionState)=>{
  state=next;time=0;const previous=action;action=mixer.clipAction(library[next]);action.reset();
  const oneShot=['sitDown','standUp','lieDown','getUp'].includes(next);
  action.setLoop(oneShot?THREE.LoopOnce:THREE.LoopRepeat,oneShot?1:Infinity);action.clampWhenFinished=oneShot;action.play();
  if(previous&&previous!==action)action.crossFadeFrom(previous,.25,false);
  hold=3+random()*5;
 };
 enter('idle');
 return {
  get state(){return state;},
  update(delta:number){
   const dt=Math.min(.05,Math.max(0,delta));mixer.update(dt);time+=dt;
   const transitions:Partial<Record<MotionState,MotionState>>={sitDown:'sitIdle',standUp:'idle',lieDown:'lieIdle',getUp:'idle'};
   if(transitions[state]) {if(time>=library[state].duration)enter(transitions[state]!);return;}
   if(state==='sitIdle'||state==='lieIdle'){if(time>hold)enter(state==='sitIdle'?'standUp':'getUp');return;}
   if(state==='walk') {
    const target=path[0];if(!target){enter('idle');return;}
    const dx=target.x-pet.position.x,dz=target.z-pet.position.z,distance=Math.hypot(dx,dz);
    const yaw=Math.atan2(dx,dz),angle=Math.atan2(Math.sin(yaw-pet.rotation.y),Math.cos(yaw-pet.rotation.y));
    pet.rotation.y+=THREE.MathUtils.clamp(angle,-dt*3,dt*3);
    const amount=Math.min(distance,profile.speed*dt);
    if(distance>0){pet.position.x+=dx/distance*amount;pet.position.z+=dz/distance*amount;}
    if(distance<=amount+.001)path.shift();return;
   }
   if(time<hold)return;
   const choice=random();if(choice<.22){enter('sitDown');return;}if(choice<.44){enter('lieDown');return;}
   for(let attempt=0;attempt<20;attempt++){
    const goal={x:(random()*2-1)*(3-profile.radius),z:(random()*2-1)*(3-profile.radius)};
    if(Math.hypot(goal.x-pet.position.x,goal.z-pet.position.z)<.8)continue;
    path=roomRoute(pet.position,goal,profile.radius,obstacles);if(path.length){enter('walk');return;}
   }
   time=0;
  },
  dispose(){mixer.stopAllAction();mixer.uncacheRoot(actor);}
 };
}
