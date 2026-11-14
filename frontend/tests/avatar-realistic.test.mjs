import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const name of ['dog','cat','puppy','kitten','sphynx-cat'])test(`${name} real asset is a complete GLB with embedded textures and CC0 provenance`,()=>{
 const b=readFileSync(new URL(`../public/models/realistic/${name}.glb`,import.meta.url));
 assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(8),b.length);
 const j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
 assert.ok(j.meshes.length>0);assert.ok(j.images.length>=3);assert.ok(j.images.every(i=>i.bufferView!==undefined));
 assert.ok(readFileSync(new URL(`../public/models/realistic/LICENSE-${name}.txt`,import.meta.url),'utf8').includes('CC0'));
});

test('real breed selections are unique downloaded files and never cross species',async()=>{
 const {REAL_MODELS,realModelFor}=await import('../src/real-model-catalog.ts');
 assert.equal(new Set(REAL_MODELS.map(m=>m.slug)).size,REAL_MODELS.length);
 assert.equal(realModelFor('bernese','dog').slug,'puppy');
 assert.equal(realModelFor('sphynx','cat').slug,'sphynx-cat');
 assert.equal(realModelFor('bernese','cat').species,'cat');
 for(const model of REAL_MODELS){
  assert.ok(model.guide.length>=3);
  assert.ok(model.guide.flat().every(Number.isFinite));
  assert.ok(model.armU>0&&model.armU<1);
 }
});
