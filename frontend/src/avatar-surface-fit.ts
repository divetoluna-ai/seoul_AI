import * as THREE from 'three';

/** Imported body geometry must be baked into the same coordinates as the garment. */
export function bodyClearance(source: THREE.Group) {
 const bodies: THREE.Mesh[] = [];
 source.traverse(object => { if (object instanceof THREE.Mesh && object.geometry.boundsTree) bodies.push(object); });
 const normal = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
 const triangle = new THREE.Triangle(a, b, c);
 return (point: THREE.Vector3, clearance: number, maxDistance = .3): THREE.Vector3 => {
  let nearest: { point: THREE.Vector3; distance: number; faceIndex: number; mesh: THREE.Mesh } | undefined;
  for (const mesh of bodies) {
   const hit = mesh.geometry.boundsTree!.closestPointToPoint(point);
   if (hit && hit.distance <= maxDistance && (!nearest || hit.distance < nearest.distance)) nearest = { ...hit, mesh };
  }
  if (!nearest) return point;
  const geometry = nearest.mesh.geometry, positions = geometry.getAttribute('position'), index = geometry.index;
  const face = nearest.faceIndex * 3;
  [a, b, c].forEach((vertex, offset) => vertex.fromBufferAttribute(positions, index ? index.getX(face + offset) : face + offset));
  triangle.getNormal(normal);
  // Preserve intentional ease; only lift fabric that penetrates or touches the body.
  if (point.clone().sub(nearest.point).dot(normal) < clearance) point.copy(nearest.point).addScaledVector(normal, clearance);
  return point;
 };
}
