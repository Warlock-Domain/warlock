import * as T from 'three';

export function createStoneImpactFx() {
  const material = new T.MeshStandardMaterial({ color: '#b8aa96', roughness: 1, flatShading: true, transparent: true });
  const mesh = new T.InstancedMesh(new T.DodecahedronGeometry(.065, 0), material, 5);
  mesh.name = 'Stone_Impact_Chips'; mesh.frustumCulled = false;
  const pose = new T.Object3D();
  return {
    root: mesh,
    update(k: number) {
      const t = k * .55;
      for (let i = 0; i < 5; i++) {
        const angle = i * 2.4;
        pose.position.set(Math.cos(angle) * (.05 + t * .9), Math.max(.025, t * (1.7 + i * .12) - 3 * t * t), Math.sin(angle) * (.05 + t * .9));
        pose.rotation.set(t * (i + 2), t * 4, angle);
        pose.scale.setScalar(.65 + (i % 3) * .25);
        pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      material.opacity = Math.min(1, (1 - k) * 3);
    },
  };
}
