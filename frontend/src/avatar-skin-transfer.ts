import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';
/** Garment positions must be in the body's local bind coordinates. */
export function skinGarment(geometry:THREE.BufferGeometry,material:THREE.Material|THREE.Material[],body:THREE.SkinnedMesh):THREE.SkinnedMesh {
 const skin=body.geometry,positions=skin.getAttribute('position'),joints=skin.getAttribute('skinIndex'),weights=skin.getAttribute('skinWeight');
 if(!joints||!weights)throw new Error('몸 모델에 스킨 가중치가 없습니다.');
 const tree=new MeshBVH(skin.clone()),attribute=geometry.getAttribute('position'),reference=geometry.getAttribute('bodyPosition')??attribute;
 const indices:number[]=[],values:number[]=[],point=new THREE.Vector3(),triangle=new THREE.Triangle(),bary=new THREE.Vector3();
 try {for(let i=0;i<attribute.count;i++){
  point.fromBufferAttribute(reference,i);const hit=tree.closestPointToPoint(point);
  if(!hit)throw new Error('의상을 몸 표면에 연결하지 못했습니다.');
  // BVH may reorder triangle indices; use its own geometry for face lookup.
  const index=tree.geometry.index,vertices=[0,1,2].map(k=>index?index.getX(hit.faceIndex*3+k):hit.faceIndex*3+k);
  [triangle.a,triangle.b,triangle.c].forEach((v,k)=>v.fromBufferAttribute(positions,vertices[k]));
  triangle.getBarycoord(hit.point,bary);const influences=new Map<number,number>();
  vertices.forEach((vertex,k)=>{const w=[bary.x,bary.y,bary.z][k];for(let slot=0;slot<4;slot++){
   const id=[joints.getX(vertex),joints.getY(vertex),joints.getZ(vertex),joints.getW(vertex)][slot];
   const value=[weights.getX(vertex),weights.getY(vertex),weights.getZ(vertex),weights.getW(vertex)][slot]*w;
   influences.set(id,(influences.get(id)??0)+value);
  }});
  const best=[...influences].filter(([,w])=>w>0).sort((a,b)=>b[1]-a[1]).slice(0,4),total=best.reduce((n,[,w])=>n+w,0);
  if(total<=0)throw new Error('몸 모델의 스킨 가중치가 유효하지 않습니다.');
  for(let k=0;k<4;k++){indices.push(best[k]?.[0]??0);values.push((best[k]?.[1]??0)/total);}
 }}finally{tree.geometry.dispose();}
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(values,4));
 const mesh=new THREE.SkinnedMesh(geometry,material);mesh.bind(body.skeleton,body.bindMatrix);mesh.position.copy(body.position);mesh.quaternion.copy(body.quaternion);mesh.scale.copy(body.scale);
 mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;return mesh;
}
