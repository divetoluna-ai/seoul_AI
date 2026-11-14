import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { bodyClearance } from '../src/avatar-surface-fit.ts';

function body() {
 const group = new THREE.Group();
 const geometry = new THREE.BoxGeometry(1, 2, 3);
 geometry.boundsTree = new MeshBVH(geometry);
 group.add(new THREE.Mesh(geometry));
 return bodyClearance(group);
}
test('fabric and trim inside the body are lifted to the requested clearance on each side', () => {
 const fit = body();
 for (const [axis, half] of [['x', .5], ['y', 1], ['z', 1.5]]) {
  for (const sign of [-1, 1]) {
   const point = new THREE.Vector3(); point[axis] = sign * (half - .08);
   fit(point, .035);
   assert.ok(Math.abs(point[axis] - sign * (half + .035)) < 1e-6);
  }
 }
});
test('fitting preserves intentional ease and does not attract distant cuffs to a different body part', () => {
 const fit = body();
 for (const x of [.58, 1.2]) {
  const point = new THREE.Vector3(x, 0, 0);
  fit(point, .035); assert.equal(point.x, x);
 }
});
test('a near-skin point receives the full clearance and repeated fitting is stable', () => {
 const fit = body(), point = new THREE.Vector3(.51, 0, 0);
 fit(point, .09); assert.ok(Math.abs(point.x - .59) < 1e-6);
 const expected = point.clone(); fit(point, .09);
 assert.ok(point.distanceTo(expected) < 1e-6);
});
