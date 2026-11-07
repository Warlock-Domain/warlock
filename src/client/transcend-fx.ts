import * as THREE from 'three';
import { ELEMENT_COLORS, type Element } from '../shared/elemental-spheres.ts';

export function transcendLift(left: number) {
  return left > 0 ? .85 * Math.min(1, (2.5 - left) / .35, left / .3) : 0;
}

// Original canvas sprites: concentric seals and geometric runes, without copying the reference artwork.
function sealTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d')!;
  c.translate(256, 256); c.strokeStyle = 'white'; c.lineWidth = 2;
  for (const r of [180, 188, 224, 232]) { c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke(); }
  for (let i = 0; i < 2; i++) {
    c.beginPath();
    for (let j = 0; j < 3; j++) { const a = (j * 2 / 3 + i) * Math.PI - Math.PI / 2; c.lineTo(Math.cos(a) * 178, Math.sin(a) * 178); }
    c.closePath(); c.stroke();
  }
  for (let i = 0; i < 24; i++) {
    c.save(); c.rotate(i * Math.PI / 12); c.beginPath();
    c.moveTo(-6, 197); c.lineTo(6, 211); c.lineTo(-6, 211); c.moveTo(0, 194); c.lineTo(0, 216); c.stroke(); c.restore();
  }
  return new THREE.CanvasTexture(canvas);
}

function beamTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 256;
  const c = canvas.getContext('2d')!, gradient = c.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, 'transparent'); gradient.addColorStop(.45, 'rgba(255,255,255,.2)'); gradient.addColorStop(1, 'white');
  c.fillStyle = gradient; c.fillRect(0, 0, 128, 256);
  return new THREE.CanvasTexture(canvas);
}

export function createTranscendFx(light: THREE.Texture) {
  const root = new THREE.Group(), ritual = new THREE.Group(), aura = new THREE.Group();
  root.add(ritual, aura);
  const seal = sealTexture(), beam = beamTexture();
  const material = (opacity: number, map?: THREE.Texture) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 3.5), material(.9, seal));
  disc.rotation.x = -Math.PI / 2; ritual.add(disc);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 3.8, 40, 1, true), material(.18, beam));
  column.position.y = 1.9; ritual.add(column);
  const sparks = Array.from({ length: 18 }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: light, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    ritual.add(sprite); return sprite;
  });
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.7, .025, 6, 48), material(.4));
    ring.rotation.x = Math.PI / 2; ring.position.y = .1 + i * .19; aura.add(ring);
  }
  // A neutral outline lets Void remain black while keeping its silhouette readable.
  const outline = new THREE.Mesh(new THREE.TorusGeometry(1.6, .012, 6, 64), new THREE.MeshBasicMaterial({ color: '#a0a0a0', transparent: true, opacity: .3, depthWrite: false }));
  outline.rotation.x = Math.PI / 2; ritual.add(outline);
  const auraEdge = new THREE.Mesh(new THREE.TorusGeometry(.76, .015, 6, 48), outline.material.clone());
  auraEdge.rotation.x = Math.PI / 2; root.add(auraEdge);
  return {
    root,
    update(element: Element, left: number, now: number, lite: boolean) {
      const active = left > 0, color = ELEMENT_COLORS[element];
      ritual.visible = active; aura.visible = !active;
      auraEdge.visible = !active && element === 'void';
      const fade = active ? Math.min(1, (2.5 - left) / .15, left / .2) : 1;
      disc.material.color.set(color); disc.material.opacity = .9 * fade;
      disc.rotation.z = now * .18;
      column.material.color.set(color); column.material.opacity = (lite ? .1 : .2) * fade;
      column.rotation.y = -now * .15;
      outline.material.opacity = element === 'void' ? .5 * fade : .15 * fade;
      sparks.forEach((spark, i) => {
        spark.visible = !lite || i % 3 === 0;
        const phase = (now * .65 + i / sparks.length) % 1, angle = i * 2.4 + now * .4;
        spark.position.set(Math.cos(angle) * 1.2, phase * 3.4, Math.sin(angle) * 1.2);
        spark.scale.set(.05, .24, 1); spark.material.color.set(element === 'void' ? '#a0a0a0' : color);
        spark.material.opacity = Math.sin(phase * Math.PI) * .7 * fade;
      });
      aura.children.forEach((node, i) => {
        const ring = node as THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
        ring.material.color.set(color); ring.material.opacity = .3 + .1 * Math.sin(now * 2 + i);
        ring.scale.setScalar(1 + .07 * Math.sin(now * 3 + i));
        ring.material.blending = element === 'void' ? THREE.NormalBlending : THREE.AdditiveBlending;
      });
      disc.material.blending = column.material.blending = element === 'void' ? THREE.NormalBlending : THREE.AdditiveBlending;
    },
    dispose() {
      root.traverse(node => {
        if (node instanceof THREE.Mesh) node.geometry.dispose();
        if (node instanceof THREE.Mesh || node instanceof THREE.Sprite) (node.material as THREE.Material).dispose();
      });
      seal.dispose(); beam.dispose();
    },
  };
}
