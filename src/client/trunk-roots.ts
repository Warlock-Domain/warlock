import * as THREE from 'three';

// Cached with obstacle templates; clones share geometry and the theme's bark material.
export function createTrunkRoots(radius: number, bark: THREE.Material, height = .18, thickness = .06) {
  const root = new THREE.Group();
  for (const [angle, reach] of [[.2, .94], [1.6, .82], [3.5, .9], [5, .76]]) {
    const midAngle = angle + .16;
    const points = [
      new THREE.Vector3(Math.cos(angle) * radius * .3, height, Math.sin(angle) * radius * .3),
      new THREE.Vector3(Math.cos(midAngle) * radius * .64, .055, Math.sin(midAngle) * radius * .64),
      new THREE.Vector3(Math.cos(angle) * radius * reach, .016, Math.sin(angle) * radius * reach),
    ];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], direction = b.clone().sub(a);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(thickness * (1 - i / points.length) + .012, thickness * (1 - (i - 1) / points.length), direction.length(), 7), bark);
      mesh.position.copy(a).add(b).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
    }
  }
  return root;
}
