import test from 'node:test';
import assert from 'node:assert/strict';
import { anatomyFor, fieldAt } from '../src/avatar-anatomy.ts';
import { BREEDS } from '../src/avatar-catalog.ts';

test('anatomical surfaces keep a continuous chest and neck across every supported breed',()=>{
 for(const breed of BREEDS){
  const a=anatomyFor(breed.id,breed.species);
  for(let i=0;i<=24;i++){
   const t=i/24;
   const y=a.bodyY+t*.26,z=a.bodyLength*.5+(a.headZ*.85-a.bodyLength*.5)*t;
   assert.ok(fieldAt(a.parts,0,y,z)<0,`${breed.id}: disconnected neck at ${t}`);
  }
  assert.ok(fieldAt(a.parts,0,a.headY,a.headZ)<0);
  assert.ok(Number.isFinite(fieldAt(a.parts,0,0,0)));
 }
});
test('body length, leg height and muzzle shape distinguish breeds beyond coat color',()=>{
 const corgi=anatomyFor('corgi','dog'),lab=anatomyFor('labrador','dog');
 const dachshund=anatomyFor('dachshund','dog'),pom=anatomyFor('pomeranian','dog');
 assert.ok(corgi.legHeight<lab.legHeight*.6);
 assert.ok(dachshund.bodyLength>pom.bodyLength*1.4);
 assert.ok(pom.muzzleLength<lab.muzzleLength*.65);
 assert.ok(pom.furLength>lab.furLength*3);
 assert.ok(anatomyFor('persian','cat').muzzleLength<anatomyFor('siamese','cat').muzzleLength);
});

test('garment surface clears the sculpted torso for short, long and fluffy bodies',async()=>{
 const {garmentSurface}=await import('../src/avatar-clothing.ts');
 for(const id of ['pomeranian','corgi','dachshund','labrador','pug','siamese','persian']) {
  const species=['siamese','persian'].includes(id)?'cat':'dog';
  const a=anatomyFor(id,species);
  for(let i=0;i<=12;i++)for(let j=0;j<32;j++){
   const z=-a.bodyLength*.75+i/12*a.bodyLength*.85;
   const p=garmentSurface(a,z,j/32*Math.PI*2);
   assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z));
   assert.ok(fieldAt(a.torso,p.x,p.y,p.z)>.005,`${id}: garment intersects torso at ${i}/${j}`);
  }
 }
});

test('sculpted surfaces produce finite unit normals and stay on the anatomical boundary',async()=>{
 const {sculptBody}=await import('../src/avatar-sculpt.ts');
 for(const [id,species] of [['pomeranian','dog'],['labrador','dog'],['siamese','cat']]){
  const a=anatomyFor(id,species),g=sculptBody(a);
  const p=g.getAttribute('position'),n=g.getAttribute('normal');
  assert.ok(p.count>5000);
  for(let i=0;i<p.count;i+=499){
   assert.ok(Math.abs(fieldAt(a.parts,p.getX(i),p.getY(i),p.getZ(i)))<.035);
   assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<.001);
  }
  g.dispose();
 }
});

test('sleeve fitting projects fabric clear of the shoulder and upper leg',async()=>{
 const {clearBody}=await import('../src/avatar-clothing.ts');
 const {Vector3}=await import('three');
 for(const [id,species] of [['pomeranian','dog'],['labrador','dog'],['siamese','cat'],['corgi','dog']]){
  const a=anatomyFor(id,species);
  for(const side of [-1,1])for(const offset of [-.12,-.24,-.35]){
   const p=clearBody(a,new Vector3(side*(a.legX+.07),a.bodyY+offset,a.foreZ+.06));
   assert.ok(fieldAt(a.parts,p.x,p.y,p.z)>.012,`${id}: sleeve intersects upper leg`);
  }
 }
});
