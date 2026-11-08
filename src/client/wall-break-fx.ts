import * as T from 'three';

export function createWallBreakFx(dx: number, dz: number) {
  const root = new T.Group(); root.name = 'Wall_Break_Debris';
  const fragments = Array.from({ length: 10 }, (_, i) => {
    const material = new T.MeshStandardMaterial({ color: i % 2 ? '#766653' : '#51483e', roughness: 1, transparent: true, flatShading: true });
    const mesh = new T.Mesh(new T.DodecahedronGeometry(.065 + (i % 3) * .025, 0), material);
    const along = (i / 9 - .5) * 1.65, across = i % 2 ? 1 : -1;
    const x = dx * along, z = dz * along;
    root.add(mesh);
    return { mesh, material, x, z, vx: dx * along * .6 - dz * across * .9, vz: dz * along * .6 + dx * across * .9, vy: 2.1 + (i % 3) * .45 };
  });
  return {
    root,
    update(k: number) {
      const t = k * 1.1;
      for (const [i, f] of fragments.entries()) {
        f.mesh.position.set(f.x + f.vx * t, Math.max(.055, .35 + f.vy * t - 4.9 * t * t), f.z + f.vz * t);
        f.mesh.rotation.set(t * (3 + i % 3), t * (i % 2 ? 4 : -4), t * 2);
        f.material.opacity = Math.min(1, (1 - k) * 3);
      }
    },
  };
}
