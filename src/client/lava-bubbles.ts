import * as THREE from 'three';
import type { Vec } from '../shared/vec.ts';

export function createLavaBubbles(findSpot: () => Vec | null, allowed: (p: Vec) => boolean, rand = Math.random) {
  const root = new THREE.Group();
  const domeGeometry = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const rippleGeometry = new THREE.RingGeometry(0.88, 1, 32);
  const slots = Array.from({ length: 3 }, () => {
    const node = new THREE.Group();
    const dome = new THREE.Mesh(domeGeometry, new THREE.MeshStandardMaterial({ color: '#7c260f', emissive: '#e63e08', emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.1, depthWrite: false }));
    // Keep the dome behind the floor and combat objects, like the decorative shore.
    dome.renderOrder = -2.5;
    const ripple = new THREE.Mesh(rippleGeometry, new THREE.MeshBasicMaterial({ color: '#ff8b32', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    ripple.rotation.x = -Math.PI / 2; ripple.position.y = 0.004;
    node.add(dome, ripple); node.visible = false; root.add(node);
    return { node, dome, ripple, born: -1, radius: 0, at: { x: 0, y: 0 } };
  });
  let nextAt = 0;
  return {
    root,
    update(now: number, enabled: boolean, lite: boolean, heat: number) {
      root.visible = enabled && !lite;
      if (!root.visible) {
        for (const slot of slots) { slot.born = -1; slot.node.visible = false; }
        nextAt = now + 1;
        return;
      }
      if (now >= nextAt) {
        const slot = slots.find(s => s.born < 0), at = slot ? findSpot() : null;
        nextAt = now + 1.8 + rand() * 1.8;
        if (slot && at && allowed(at)) {
          slot.born = now; slot.radius = 0.4 + rand() * 0.25; slot.at = at;
          slot.node.position.set(at.x, -0.015, at.y);
        }
      }
      for (const slot of slots) {
        if (slot.born < 0) continue;
        const phase = (now - slot.born) / 2.2;
        if (phase < 0 || phase >= 1 || !allowed(slot.at)) { slot.born = -1; slot.node.visible = false; continue; }
        slot.node.visible = true;
        const growth = Math.sin(Math.min(1, phase / 0.65) * Math.PI / 2);
        slot.dome.visible = phase < 0.65;
        slot.dome.scale.set(slot.radius * Math.max(0.05, growth), slot.radius * growth * 0.6, slot.radius * Math.max(0.05, growth));
        slot.dome.material.emissiveIntensity = 0.5 * heat;
        const pop = Math.max(0, (phase - 0.65) / 0.35);
        slot.ripple.scale.setScalar(slot.radius * (0.95 + pop * 0.85));
        slot.ripple.material.opacity = (phase < 0.65 ? growth * 0.12 : Math.sin(pop * Math.PI) * 0.4) * heat;
      }
    },
    dispose() {
      for (const slot of slots) { slot.dome.material.dispose(); slot.ripple.material.dispose(); }
      domeGeometry.dispose(); rippleGeometry.dispose(); root.removeFromParent();
    },
  };
}
