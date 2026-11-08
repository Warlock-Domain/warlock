import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function shrubLeafTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#a4a4a4'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 64; i++) {
    g.save(); g.translate((i % 8) * 16 + 8 + Math.sin(i * 7) * 3, Math.floor(i / 8) * 16 + 8 + Math.cos(i * 3) * 3); g.rotate(i * 1.7);
    g.beginPath(); g.ellipse(0, 0, 10, 5.5, 0, 0, Math.PI * 2);
    g.fillStyle = ['#d5d5d5', '#e4e4e4', '#c4c4c4'][i % 3]; g.fill();
    g.strokeStyle = 'rgba(55,55,55,.42)'; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.moveTo(-7, 0); g.quadraticCurveTo(0, 1, 7, 0); g.strokeStyle = 'rgba(250,250,250,.3)'; g.stroke();
    g.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.5, 1.5);
  return texture;
}

export function roundedShrubGeometry() {
  const parts = [[0, 0, 0, 1, .55, .8], [-.5, 0, .15, .7, .4, .65], [.5, 0, -.1, .65, .43, .7]].map(([x, y, z, sx, sy, sz]) =>
    new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(sx, sy, sz).translate(x, y, z));
  const geometry = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  return geometry;
}

export function cloverGeometry(leaves: 3 | 4) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(-.55, .3, -.6, .95, -.22, 1);
  shape.bezierCurveTo(-.05, 1, 0, .82, 0, .8);
  shape.bezierCurveTo(0, .82, .05, 1, .22, 1);
  shape.bezierCurveTo(.6, .95, .55, .3, 0, 0);
  const parts = Array.from({ length: leaves }, (_, i) => {
    const leaf = new THREE.ShapeGeometry(shape, 6).rotateX(-Math.PI / 2).rotateY(i * Math.PI * 2 / leaves);
    const points = leaf.getAttribute('position');
    for (let j = 0; j < points.count; j++) points.setY(j, .025 + .07 * Math.sin(Math.min(1, Math.hypot(points.getX(j), points.getZ(j))) * Math.PI));
    leaf.computeVertexNormals();
    return leaf;
  });
  const geometry = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  return geometry;
}
