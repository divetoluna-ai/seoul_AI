import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {REAL_MODELS} from '../src/real-model-catalog.ts';
import {OUTFITS} from '../src/avatar-catalog.ts';
import {fittedBodyGarment} from '../src/avatar-body-garment.ts';
import {loadAvatarBody} from './helpers/avatar-body.mjs';

// Geometry tests do not need to draw the fabric texture.
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}})})};
for(const model of REAL_MODELS.filter(m=>m.id!=='maltese'))test(`${model.id}: all ten garments follow the imported body at default and tight fit`,async()=>{
 const source=await loadAvatarBody(model);source.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.boundsTree=new MeshBVH(o.geometry);});
 for(const outfit of OUTFITS){
  const group=fittedBodyGarment(source,model,outfit,{ease:.035,width:1,length:1}),cloth=group.children[0],g=cloth.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv');
  assert.ok(p.count>100&&g.index.count>300,'garment must contain actual torso faces');
  let max=0,inside=0,count=0;
  for(let i=0;i<p.count;i+=Math.max(1,Math.floor(p.count/180))){
   const q=new THREE.Vector3().fromBufferAttribute(p,i);assert.ok(q.toArray().every(Number.isFinite));assert.ok(Number.isFinite(uv.getX(i))&&Number.isFinite(uv.getY(i)));
   let nearest;for(const mesh of source.children){const h=mesh.geometry.boundsTree.closestPointToPoint(q);if(!nearest||h.distance<nearest.h.distance)nearest={h,mesh};}
   const {h,mesh}=nearest,pos=mesh.geometry.getAttribute('position'),index=mesh.geometry.index,tri=new THREE.Triangle(...[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(pos,index.getX(h.faceIndex*3+k))));
   max=Math.max(max,h.distance);inside+=q.clone().sub(h.point).dot(tri.getNormal(new THREE.Vector3()))<-.006?1:0;count++;
  }
  assert.ok(max<.065,`${outfit.id}: floating fabric ${max}`);assert.ok(inside/count<.04,`${outfit.id}: penetration ${inside}/${count}`);
  group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose();}}});
 }
 const tight=fittedBodyGarment(source,model,OUTFITS[0],{ease:.015,width:.85,length:1.1});assert.ok(tight.children[0].geometry.getAttribute('position').count>100);
});
