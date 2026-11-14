import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';

/** Pose-specific fit adjustments blended by the same animation as the body. */
export function garmentCorrections(actor:THREE.Group,body:THREE.SkinnedMesh,garments:THREE.SkinnedMesh[],clips:THREE.AnimationClip[]):THREE.AnimationClip[]{
 const mixer=new THREE.AnimationMixer(actor),targets=garments.map(()=>[] as THREE.Float32BufferAttribute[]);
 for(const state of ['sitIdle','lieIdle']){
  mixer.stopAllAction();const clip=clips.find(c=>c.name===state);if(!clip)throw new Error(`Missing corrective pose: ${state}`);
  mixer.clipAction(clip).reset().play();mixer.update(clip.duration*.5);actor.updateMatrixWorld(true);body.skeleton.update();
  const posed=body.geometry.clone(),positions=posed.getAttribute('position'),original=body.geometry.getAttribute('position');
  for(let i=0;i<positions.count;i++){const p=body.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(original,i));positions.setXYZ(i,p.x,p.y,p.z);}
  const tree=new MeshBVH(posed),triangle=new THREE.Triangle(),normal=new THREE.Vector3(),skin=new THREE.Matrix4(),bone=new THREE.Matrix4();
  garments.forEach((garment,index)=>{
   const base=garment.geometry.getAttribute('position'),indices=garment.geometry.getAttribute('skinIndex'),weights=garment.geometry.getAttribute('skinWeight'),delta=new Float32Array(base.count*3);garment.skeleton.update();
   for(let i=0;i<base.count;i++){
    const rest=new THREE.Vector3().fromBufferAttribute(base,i),point=garment.applyBoneTransform(i,rest.clone()),before=point.clone();
    for(let pass=0;pass<5;pass++){
     const hit=tree.closestPointToPoint(point);if(!hit||hit.distance>.12)break;const id=posed.index!;
     [triangle.a,triangle.b,triangle.c].forEach((v,k)=>v.fromBufferAttribute(positions,id.getX(hit.faceIndex*3+k)));triangle.getNormal(normal);
     if(point.clone().sub(hit.point).dot(normal)>=.018)break;point.copy(hit.point).addScaledVector(normal,.024);
    }
    if(point.distanceToSquared(before)<1e-10)continue;skin.elements.fill(0);
    for(let k=0;k<4;k++){const joint=[indices.getX(i),indices.getY(i),indices.getZ(i),indices.getW(i)][k],weight=[weights.getX(i),weights.getY(i),weights.getZ(i),weights.getW(i)][k];bone.fromArray(garment.skeleton.boneMatrices!,joint*16);for(let j=0;j<16;j++)skin.elements[j]+=bone.elements[j]*weight;}
    skin.premultiply(garment.bindMatrixInverse).multiply(garment.bindMatrix);if(Math.abs(skin.determinant())<.02)continue;
    const correction=point.applyMatrix4(skin.invert()).sub(rest);if(correction.length()>.15)correction.setLength(.15);correction.toArray(delta,i*3);
   }
   targets[index].push(new THREE.Float32BufferAttribute(delta,3));
  });posed.dispose();
 }
 mixer.stopAllAction();mixer.uncacheRoot(actor);
 garments.forEach((mesh,i)=>{mesh.name=`fitted_outfit_${i}`;mesh.geometry.morphTargetsRelative=true;mesh.geometry.morphAttributes.position=targets[i];mesh.updateMorphTargets();});
 return clips.map(original=>{
  const clip=original.clone();
  for(const mesh of garments)for(const [target,down,hold,up] of [[0,'sitDown','sitIdle','standUp'],[1,'lieDown','lieIdle','getUp']] as const){
   const values=Array.from({length:25},(_,i)=>{const t=i/24,s=t*t*(3-2*t);return clip.name===down?s:clip.name===hold?1:clip.name===up?1-s:0;});
   clip.tracks.push(new THREE.NumberKeyframeTrack(`${mesh.name}.morphTargetInfluences[${target}]`,values.map((_,i)=>i/24*clip.duration),values));
  }return clip;
 });
}
