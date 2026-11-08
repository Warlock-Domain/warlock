import { expect, it } from 'vitest';
import * as T from 'three';
import { createRockFootprint } from '../src/client/rock-footprint.ts';
import { OBSTACLES } from '../src/shared/constants.ts';

it('fits an off-centre wide rubble asset inside the exact visible collision footprint', () => {
  const source = new T.Group(), geometry = new T.BoxGeometry(8.13, 3.5, 3.18), material = new T.MeshBasicMaterial();
  const mesh = new T.Mesh(geometry, material); mesh.position.set(1, 1.75, -.5); source.add(mesh);
  const radius = OBSTACLES.rock.r, result = createRockFootprint(source, radius);
  result.root.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(result.root);
  expect(bounds.min.x).toBeCloseTo(-radius); expect(bounds.max.x).toBeCloseTo(radius);
  expect(bounds.min.z).toBeCloseTo(-radius); expect(bounds.max.z).toBeCloseTo(radius);
  expect(bounds.min.y).toBeCloseTo(0);
  const point = new T.Vector3();
  result.root.traverse(o => {
    if (!(o instanceof T.Mesh)) return;
    const positions = o.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld);
      expect(Math.hypot(point.x, point.z)).toBeLessThanOrEqual(radius + .00001);
    }
  });
  expect(geometry.parameters.width).toBe(8.13); expect(result.owned).not.toContain(geometry); expect(result.owned).not.toContain(material);
  result.owned.forEach(r => r.dispose()); geometry.dispose(); material.dispose();
});

it('keeps the same footprint while the source model is still loading', () => {
  const radius = OBSTACLES.rock.r, result = createRockFootprint(null, radius);
  const bounds = new T.Box3().setFromObject(result.root);
  expect(bounds.max.x - bounds.min.x).toBeCloseTo(radius * 2);
  expect(bounds.max.z - bounds.min.z).toBeCloseTo(radius * 2);
  expect(bounds.min.y).toBeCloseTo(0); result.owned.forEach(r => r.dispose());
});
