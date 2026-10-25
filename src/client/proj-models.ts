// Projectile and Vine shapes: Three.js geometry and materials only, no scene state (moved out of createScene in scene.ts)
import * as THREE from 'three';
import { GEYSER_FX } from './geyser-fx.ts';
import type { ProjKind } from '../shared/sim.ts';

// Each projectile body has its own low-poly shape instead of the same light ball (Fernando's request, 17/10;
// there are no ready CC0 spell models, so they are built here from Three.js geometries)
const jitter = (g: THREE.BufferGeometry, amount: number) => {
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (1 + (Math.random() - 0.5) * amount), pos.getY(i) * (1 + (Math.random() - 0.5) * amount), pos.getZ(i) * (1 + (Math.random() - 0.5) * amount));
  g.computeVertexNormals();
  return g;
};
export const flat = (color: string, emissive: string, intensity = 0.6) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, flatShading: true, roughness: 0.5 });
export function vineModel(radius: number) {
  const group = new THREE.Group();
  const stem = flat('#3c7023', '#203f0e', .3), leafMat = flat('#8ac34b', '#335d17', .3);
  for (let i = 0; i < 6; i++) {
    const points = Array.from({ length: 13 }, (_, j) => {
      const k = j / 12, a = i * Math.PI / 3 + k * 2.5, r = radius * (1 - k * .55);
      return new THREE.Vector3(Math.cos(a) * r, k * 1.15, Math.sin(a) * r);
    });
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 20, .035, 5, false), stem));
    for (const j of [4, 9]) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(.09, 5, 3), leafMat);
      leaf.position.copy(points[j]); leaf.scale.set(.5, 1.8, 1); leaf.rotation.z = i;
      group.add(leaf);
    }
  }
  return group;
}
export const SHAPES: Partial<Record<ProjKind, () => THREE.Object3D>> = {
  fireball: () => new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(0.24, 1), 0.35), flat('#ffb347', '#ff6a00', 1.4)),
  cluster: () => new THREE.Mesh(new THREE.TetrahedronGeometry(0.2), flat('#ffe066', '#ff9a00', 1.2)),
  homing: () => {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), flat('#e7b8ff', '#9a30ff', 1.2));
    m.scale.set(0.8, 0.8, 2); // long crystal pointing where it flies
    return m;
  },
  swap: () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.2), flat('#cffffb', '#00d8c8', 1.2)));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 6, 24), flat('#00fff0', '#00b0a8', 1.4));
    ring.name = 'spin';
    g.add(ring);
    return g;
  },
  grip: () => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(.94, 1, 64), new THREE.MeshBasicMaterial({ color: '#8ed64b', side: THREE.DoubleSide, transparent: true, opacity: .8, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    return ring;
  },
  meteor: () => new THREE.Mesh(jitter(new THREE.DodecahedronGeometry(0.3, 0), 0.4), flat('#4a2c20', '#ff4a00', 0.9)),
  boomerang: () => {
    // two-armed V, extruded, spinning
    const s = new THREE.Shape();
    s.moveTo(-0.38, 0.16);
    s.lineTo(0, -0.12);
    s.lineTo(0.38, 0.16);
    s.lineTo(0.3, 0.24);
    s.lineTo(0, 0.04);
    s.lineTo(-0.3, 0.24);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: false });
    geo.center();
    const m = new THREE.Mesh(geo, flat('#8fe060', '#3a8a10', 0.7));
    m.rotation.x = -Math.PI / 2;
    const g = new THREE.Group();
    g.add(m);
    g.name = 'spin';
    return g;
  },
  gravity: () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: '#05020c' })));
    for (const tilt of [0.5, -0.9]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 32), flat('#8a6cff', '#4a20ff', 1.6));
      ring.rotation.x = tilt;
      ring.name = 'spin';
      g.add(ring);
    }
    return g;
  },
  bouncer: () => new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), flat('#7dffb8', '#10c070', 1.2)),
  drain: () => {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), flat('#c8ff9a', '#3a9a10', 1.2));
    m.scale.set(0.7, 0.7, 1.7); // green thorn pointing where it flies
    return m;
  },
  snowball: () => new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(0.42, 1), 0.15), flat('#f4fbff', '#9ad8ff', 0.35)),
  magnetize: () => {
    // U magnet: red arc with silver tips
    const g = new THREE.Group();
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 16, Math.PI), flat('#ff4a4a', '#a00000', 0.8));
    arc.rotation.x = -Math.PI / 2;
    g.add(arc);
    for (const x of [-0.2, 0.2]) {
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), flat('#e0e0e8', '#404050', 0.4));
      tip.position.set(x, 0, 0.04);
      g.add(tip);
    }
    return g;
  },
  recharge: () => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.36, 8), flat('#9ae6ff', '#1a90ff', 1.3));
    m.rotation.x = Math.PI / 2; // battery lying down, pointing forward
    return m;
  },
  link: () => new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 6, 16), flat('#bfe6ff', '#2a7aff', 1.2)),
  splitter: () => new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), flat('#a0f0ff', '#2080ff', 1.2)),
  shard: () => new THREE.Mesh(new THREE.TetrahedronGeometry(0.13), flat('#d0f4ff', '#40a0ff', 1.4)),
  geyser: () => {
    const g = new THREE.Group();
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(.65, .3, GEYSER_FX.height, 12, 1, true), new THREE.MeshBasicMaterial({ color: GEYSER_FX.color, transparent: true, opacity: .45, side: THREE.DoubleSide, depthWrite: false }));
    jet.position.y = GEYSER_FX.height / 2;
    const foam = new THREE.Mesh(new THREE.TorusGeometry(.7, .12, 6, 20), new THREE.MeshBasicMaterial({ color: GEYSER_FX.foam, transparent: true, opacity: .75, depthWrite: false }));
    foam.rotation.x = -Math.PI / 2; foam.position.y = GEYSER_FX.height;
    const pool = new THREE.Mesh(new THREE.RingGeometry(.7, 1, 32), new THREE.MeshBasicMaterial({ color: GEYSER_FX.color, transparent: true, opacity: .45, side: THREE.DoubleSide, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = .04;
    g.add(jet, foam, pool);
    return g;
  },
  warpzone: () => {
    // glass dome with a rim on the ground; radius 1 here, the real size comes from the server
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7ad8ff', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.02, 4, 48), new THREE.MeshBasicMaterial({ color: '#bfefff', transparent: true, opacity: 0.6 }));
    rim.rotation.x = -Math.PI / 2;
    g.add(rim);
    return g;
  },
};
