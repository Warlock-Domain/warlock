import * as T from 'three';

export function createWallWear(model: T.Object3D) {
  const root = new T.Group(); root.name = 'Barricade_Wear';
  const owned: (T.BufferGeometry | T.Material)[] = [];
  const surfaces: { material: T.MeshStandardMaterial; color: T.Color; roughness: number }[] = [];
  model.traverse(o => {
    if (!(o instanceof T.Mesh)) return;
    const copy = (original: T.Material) => {
      const material = original.clone(); owned.push(material);
      if (material instanceof T.MeshStandardMaterial) surfaces.push({ material, color: material.color.clone(), roughness: material.roughness });
      return material;
    };
    o.material = Array.isArray(o.material) ? o.material.map(copy) : copy(o.material);
  });
  const box = new T.Box3().setFromObject(model), size = box.getSize(new T.Vector3());
  const ink = new T.MeshBasicMaterial({ color: '#211a15', transparent: true, opacity: .85, depthWrite: false, side: T.DoubleSide }); owned.push(ink);
  const paths = [
    [[[.28, .93], [.34, .72], [.27, .55], [.38, .31]], [[.68, .88], [.61, .63], [.72, .44]]],
    [[[.34, .72], [.49, .65], [.52, .43], [.64, .20]], [[.61, .63], [.51, .79], [.58, .98]], [[.38, .31], [.25, .18]]],
  ];
  const layers = paths.map((stage, index) => {
    const positions: number[] = [];
    // The railing has open gaps; the solid top beam is safe for surface cracks.
    for (const path of stage) {
      const points = path.map(([u, v]) => new T.Vector3(box.min.x + u * size.x, box.max.y + .012, box.min.z + v * size.z));
      const normal = new T.Vector3(0, 1, 0);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], side = b.clone().sub(a).cross(normal).normalize().multiplyScalar(index ? .012 : .009);
        const corners = [a.clone().sub(side), a.clone().add(side), b.clone().add(side), b.clone().sub(side)];
        for (const corner of [0, 1, 2, 0, 2, 3]) positions.push(...corners[corner].toArray());
      }
    }
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); owned.push(geometry);
    const mesh = new T.Mesh(geometry, ink); mesh.name = `Barricade_Cracks_${index + 1}`; mesh.visible = false; root.add(mesh); return mesh;
  });
  return {
    root, owned,
    update(percent: number) {
      const damage = 1 - Math.max(0, Math.min(100, percent)) / 100;
      root.visible = percent > 0;
      layers[0].visible = damage >= .2; layers[1].visible = damage >= .6;
      for (const surface of surfaces) {
        surface.material.color.copy(surface.color).multiplyScalar(1 - damage * .25);
        surface.material.roughness = Math.min(1, surface.roughness + damage * .12);
      }
    },
  };
}
