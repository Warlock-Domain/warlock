import * as T from 'three';

// The rubble asset is much wider than deep; its original silhouette cannot describe a circular collider.
export function createRockFootprint(model: T.Object3D | null, radius: number, withBase = true) {
  const root = new T.Group(); root.name = 'Rock_Obstacle';
  const owned: (T.BufferGeometry | T.Material)[] = [];
  const material = new T.MeshStandardMaterial({ color: '#514638', roughness: 1, flatShading: true }); owned.push(material);
  if (withBase) {
    const geometry = new T.CylinderGeometry(radius * .97, radius, .12, 20); owned.push(geometry);
    const base = new T.Mesh(geometry, material); base.name = 'Rock_Base'; base.position.y = .06;
    base.castShadow = base.receiveShadow = true; root.add(base);
  }
  if (!model) {
    const fallback = new T.IcosahedronGeometry(radius * .85, 1); owned.push(fallback);
    const rock = new T.Mesh(fallback, material); rock.scale.y = .65; rock.position.y = radius * .55;
    rock.castShadow = rock.receiveShadow = true; root.add(rock);
    return { root, owned };
  }
  const box = new T.Box3().setFromObject(model), size = box.getSize(new T.Vector3());
  const heightScale = radius * 2 / Math.max(.01, size.x, size.z);
  model.scale.multiply(new T.Vector3(radius * 2 / Math.max(.01, size.x), heightScale, radius * 2 / Math.max(.01, size.z)));
  box.setFromObject(model);
  model.position.sub(new T.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2));
  model.name = 'Rock_Rubble'; root.add(model); root.updateMatrixWorld(true);
  const point = new T.Vector3(); let extent = 0;
  model.traverse(o => {
    if (!(o instanceof T.Mesh)) return;
    const positions = o.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld);
      extent = Math.max(extent, Math.hypot(point.x, point.z));
    }
  });
  const fit = Math.min(1, radius / Math.max(.01, extent));
  model.scale.x *= fit; model.scale.z *= fit; model.position.x *= fit; model.position.z *= fit;
  return { root, owned };
}
