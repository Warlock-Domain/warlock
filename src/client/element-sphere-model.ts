import * as THREE from 'three';
import { ELEMENT_COLORS, ELEMENTAL_SPHERES, type Element } from '../shared/elemental-spheres.ts';

export function elementSphereModel(element: Element) {
  const group = new THREE.Group(), r = ELEMENTAL_SPHERES.radius, color = ELEMENT_COLORS[element];
  const geometry = element === 'earth' ? new THREE.IcosahedronGeometry(r, 1) : new THREE.SphereGeometry(r, 16, 12);
  const material = element === 'ki' || element === 'void'
    ? new THREE.MeshBasicMaterial({ color })
    : new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: element === 'fire' ? 0.8 : 0.12, roughness: element === 'water' ? 0.12 : 0.9, metalness: element === 'water' ? 0.15 : 0, flatShading: element === 'earth' });
  group.add(new THREE.Mesh(geometry, material));
  if (element === 'fire') {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.12, 6), material);
    flame.position.y = r + 0.03; group.add(flame);
  } else if (element === 'water') {
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: '#dff4ff' }));
    glint.position.set(-0.05, 0.08, 0.11); group.add(glint);
  } else if (element === 'ki') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.25, 0.012, 4, 24), new THREE.MeshBasicMaterial({ color }));
    ring.rotation.x = 0.6; group.add(ring);
  } else if (element === 'void') {
    group.add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.08, 16, 12), new THREE.MeshBasicMaterial({ color: '#a0a0a0', side: THREE.BackSide, transparent: true, opacity: 0.6 })));
  }
  return group;
}
