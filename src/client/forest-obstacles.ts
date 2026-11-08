import * as THREE from 'three';
import { OBSTACLES, type ObstacleKind } from '../shared/constants.ts';
import { shrubLeafTexture } from './meadow-plants.ts';
import { createTrunkRoots } from './trunk-roots.ts';

// Templates own shared resources for the scene lifetime, like the cached dungeon GLBs.
export function createForestObstacles() {
  const bark = new THREE.MeshStandardMaterial({ color: '#725c43', roughness: 1, flatShading: true });
  const cut = new THREE.MeshStandardMaterial({ color: '#b49a6c', roughness: 1 });
  const gray = new THREE.MeshStandardMaterial({ color: '#65707c', roughness: 1, flatShading: true });
  const foliage = new THREE.MeshStandardMaterial({ color: '#628149', map: shrubLeafTexture(), roughness: 1 });
  const templates = new Map<ObstacleKind, THREE.Group>();
  const mesh = (root: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; root.add(m); return m;
  };
  const branch = (root: THREE.Group, points: number[][], radius: number) => {
    for (let i = 1; i < points.length; i++) {
      const a = new THREE.Vector3().fromArray(points[i - 1]), b = new THREE.Vector3().fromArray(points[i]), d = b.clone().sub(a);
      const m = mesh(root, new THREE.CylinderGeometry(radius * (1 - i / points.length) + .012, radius * (1 - (i - 1) / points.length), d.length(), 7), bark, 0, 0, 0);
      m.position.copy(a.add(b).multiplyScalar(.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    }
  };
  for (const kind of ['pillar', 'shrine', 'rock', 'tree'] as const) {
    const root = new THREE.Group(), r = OBSTACLES[kind].r;
    root.name = ({ pillar: 'Forest_Leafy_Tree', shrine: 'Forest_Cut_Stump', rock: 'Forest_Gray_Rock', tree: 'Forest_Bare_Tree' })[kind];
    if (kind === 'rock') {
      const main = mesh(root, new THREE.IcosahedronGeometry(r * .91, 0), gray, 0, .48, 0); main.scale.y = .65; main.rotation.y = .35;
      const side = mesh(root, new THREE.IcosahedronGeometry(r * .45, 0), gray, .32, .23, .18); side.scale.y = .55;
    } else if (kind === 'shrine') {
      mesh(root, new THREE.CylinderGeometry(r * .75, r * .9, .48, 11), bark, 0, .25, 0);
      const stub = mesh(root, new THREE.CylinderGeometry(.06, .1, .28, 7), bark, .28, .26, .04); stub.rotation.z = -.7;
      const top = mesh(root, new THREE.CircleGeometry(r * .74, 11), cut, 0, .495, 0); top.rotation.x = -Math.PI / 2;
      for (const scale of [.25, .48, .67]) {
        const ring = mesh(root, new THREE.RingGeometry(r * scale - .008, r * scale + .008, 24), bark, 0, .498, 0); ring.rotation.x = -Math.PI / 2;
      }
    } else {
      branch(root, [[0, .02, 0], [.04, .65, .02], [-.05, 1.18, 0], [.1, 1.72, -.03]], kind === 'pillar' ? .22 : .15);
      branch(root, [[.02, .62, 0], [-.32, 1.02, .08], [-.57, 1.39, .16], [-.48, 1.76, .2]], .095);
      branch(root, [[-.03, 1.06, 0], [.35, 1.32, -.08], [.51, 1.68, -.19]], .08);
      branch(root, [[-.3, 1.05, .08], [-.3, 1.36, -.24], [-.17, 1.58, -.4]], .055);
      if (kind === 'pillar') {
        for (const [x, y, z, scale] of [[0, 1.92, 0, .67], [-.43, 1.72, .14, .5], [.42, 1.78, -.12, .52], [-.1, 2.25, .07, .43]]) {
          const crown = mesh(root, new THREE.SphereGeometry(1, 10, 7), foliage, x, y, z); crown.scale.set(scale, scale * .7, scale * .85); crown.name = 'Forest_Tree_Foliage';
        }
      }
    }
    if (kind !== 'rock') {
      const roots = createTrunkRoots(r, bark, kind === 'shrine' ? .12 : .18, kind === 'pillar' ? .085 : .06);
      roots.name = 'Forest_Roots';
      root.add(roots);
    }
    templates.set(kind, root);
  }
  return (kind: ObstacleKind) => templates.get(kind)?.clone(true) ?? null;
}
