import * as THREE from 'three';
import { SHAPES, type ArenaId } from '../shared/arena.ts';

// The bevel stays inside the authoritative outline, including holes and concave corners.
export function arenaRimGeometry(id: ArenaId) {
  const shape = SHAPES[id], positions: number[] = [], colors: number[] = [], cracks: number[] = [];
  const strata = [new THREE.Color('#34343b'), new THREE.Color('#55545b'), new THREE.Color('#3b4049')];
  const layers = [[0.001, 0.025], [0.018, 0.25], [0.04, 0.29], [0.075, 0.005]];
  for (const loop of shape.outline) {
    const points = loop.flatMap((p, i) => {
      const q = loop[(i + 1) % loop.length], n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 0.065));
      return Array.from({ length: n }, (_, j) => ({ x: p.x + (q.x - p.x) * j / n, y: p.y + (q.y - p.y) * j / n }));
    });
    const rings = points.map((p, i) => {
      const e = 0.001, dx = shape.sdf(p.x + e, p.y) - shape.sdf(p.x - e, p.y), dz = shape.sdf(p.x, p.y + e) - shape.sdf(p.x, p.y - e);
      const length = Math.hypot(dx, dz) || 1, uneven = 0.65 + 0.35 * Math.sin(i * 1.37);
      const width = 0.7 + 0.3 * Math.sin(i * 1.91 + 0.8);
      return layers.map(([inset, height]) => new THREE.Vector3(p.x - dx / length * inset * width, height * uneven, p.y - dz / length * inset * width));
    });
    for (let i = 0; i < rings.length; i++) {
      const a = rings[i], b = rings[(i + 1) % rings.length];
      for (let layer = 0; layer < layers.length - 1; layer++) {
        const tint = strata[layer].clone().multiplyScalar(0.82 + 0.18 * Math.sin(i * 1.73 + layer));
        for (const p of [a[layer], a[layer + 1], b[layer], b[layer], a[layer + 1], b[layer + 1]]) {
          positions.push(p.x, p.y, p.z); colors.push(tint.r, tint.g, tint.b);
        }
      }
      if (Math.sin(i * 7.13) > 0.8) for (let layer = 0; layer < 3; layer++) {
        const p = a[layer], q = a[layer + 1];
        cracks.push(p.x, p.y + 0.008, p.z, q.x, q.y + 0.008, q.z);
      }
    }
  }
  const stone = new THREE.BufferGeometry();
  stone.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  stone.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  stone.computeVertexNormals();
  const fissures = new THREE.BufferGeometry();
  fissures.setAttribute('position', new THREE.Float32BufferAttribute(cracks, 3));
  return { stone, fissures };
}
