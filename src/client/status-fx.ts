import * as THREE from 'three';
import { INCAPACITATED_BIT } from '../shared/constants.ts';

export function createStatusFx() {
  const root = new THREE.Group(), stun = new THREE.Group(), slow = new THREE.Group(), pause = new THREE.Group();
  const gold = new THREE.MeshBasicMaterial({ color: '#ffd666', depthWrite: false, side: THREE.DoubleSide });
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? 0.07 : 0.17;
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
    if (i) shape.lineTo(x, y); else shape.moveTo(x, y);
  }
  shape.closePath();
  const star = new THREE.ShapeGeometry(shape);
  for (let i = 0; i < 3; i++) {
    stun.add(new THREE.Mesh(star, gold));
  }
  const blue = new THREE.MeshBasicMaterial({ color: '#9fd0ff', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const arc = new THREE.Mesh(new THREE.RingGeometry(0.57, 0.62, 12, 1, i * Math.PI * 2 / 3, 0.8), blue);
    arc.rotation.x = -Math.PI / 2; slow.add(arc);
  }
  slow.position.y = 0.09;
  const violet = new THREE.MeshBasicMaterial({ color: '#c9a8ff', transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
  pause.add(new THREE.Mesh(new THREE.RingGeometry(0.15, 0.19, 24), violet));
  for (const x of [-0.055, 0.055]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.16), violet); bar.position.x = x; pause.add(bar);
  }
  root.add(stun, slow, pause);
  const orientation = new THREE.Quaternion();
  const side = new THREE.Vector3();
  return {
    root,
    update(status: number, visible: boolean, lift: number, now: number, lite: boolean, facing: THREE.Quaternion) {
      root.visible = visible;
      stun.visible = !!(status & 16); slow.visible = !!(status & 4); pause.visible = !!(status & INCAPACITATED_BIT);
      root.getWorldQuaternion(orientation);
      orientation.invert();
      stun.children.forEach((spark, i) => {
        const angle = i * Math.PI * 2 / 3 + (lite ? 0 : now * 2.4);
        spark.position.set(Math.cos(angle) * 0.6, 1.95 + lift, Math.sin(angle) * 0.6);
        spark.quaternion.copy(orientation).multiply(facing);
      });
      slow.rotation.y = lite ? 0 : -now * 0.35;
      pause.quaternion.copy(orientation).multiply(facing);
      // Offset beside the head so the health/name label cannot cover the clock.
      side.set(0.8, 0, 0).applyQuaternion(facing).applyQuaternion(orientation);
      pause.position.copy(side); pause.position.y += 1.7 + lift;
    },
    dispose() {
      const materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
      root.traverse(o => {
        if (o instanceof THREE.Mesh) { geometries.add(o.geometry); materials.add(o.material as THREE.Material); }
      });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      root.removeFromParent();
    },
  };
}
