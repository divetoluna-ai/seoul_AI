import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
export async function loadAvatarBody(model){
 const bytes=readFileSync(new URL(`../../public/models/realistic/${model.slug}.glb`,import.meta.url)),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length));
 json.materials=json.materials?.map(m=>({name:m.name}));delete json.images;delete json.textures;
 const raw=Buffer.from(JSON.stringify(json)),padding=Buffer.alloc((4-raw.length%4)%4,32),tail=bytes.subarray(20+length),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(20+raw.length+padding.length+tail.length,8);header.writeUInt32LE(raw.length+padding.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const buffer=Buffer.concat([header,raw,padding,tail]),gltf=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
 gltf.scene.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(gltf.scene),scale=model.height/(box.max.y-box.min.y),transform=new THREE.Matrix4().makeTranslation(-(box.min.x+box.max.x)/2,-box.min.y,-(box.min.z+box.max.z)/2);
 transform.premultiply(new THREE.Matrix4().makeScale(scale,scale,scale));transform.premultiply(new THREE.Matrix4().makeRotationY(model.yaw));transform.premultiply(new THREE.Matrix4().makeTranslation(model.shiftX,0,0));
 const group=new THREE.Group();gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)group.add(new THREE.Mesh(o.geometry.clone().applyMatrix4(o.matrixWorld).applyMatrix4(transform),o.material));});return group;
}
