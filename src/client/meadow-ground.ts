import * as THREE from 'three';
import { edgeAt, type ArenaId } from '../shared/arena.ts';
import { cloverGeometry, roundedShrubGeometry, shrubLeafTexture } from './meadow-plants.ts';

const SPAN = 32;
const blend = (a: number, b: number, x: number) => Math.max(0, Math.min(1, (x - a) / (b - a)));
const grassAt = (x: number, z: number) => {
  const path = Math.min(Math.abs(z - 1.4 * Math.sin(x * .35)), Math.abs(x + 2.2 * Math.cos(z * .28)));
  const patch = .48 + .22 * Math.sin(x * .58 + Math.sin(z * .32)) + .18 * Math.cos(z * .75 - x * .2);
  return blend(.35, 1.1, path) * blend(.3, .62, patch);
};

// Original client-only artwork: stable layout, independent of the simulation RNG.
export function createMeadowGround() {
  let seed = 137;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2048;
  const g = canvas.getContext('2d')!;
  const base = document.createElement('canvas'); base.width = base.height = 512;
  const bg = base.getContext('2d')!, image = bg.createImageData(512, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const wx = (x / 512 - .5) * SPAN, wz = (y / 512 - .5) * SPAN;
    const k = grassAt(wx, wz), grain = (random() - .5) * 9, light = Math.sin(wx * 1.7 + Math.cos(wz)) * 4;
    const i = (y * 512 + x) * 4;
    image.data[i] = 123 * (1 - k) + 66 * k + grain + light;
    image.data[i + 1] = 94 * (1 - k) + 104 * k + grain + light;
    image.data[i + 2] = 61 * (1 - k) + 47 * k + grain + light;
    image.data[i + 3] = 255;
  }
  bg.putImageData(image, 0, 0); g.drawImage(base, 0, 0, 2048, 2048);
  const pixel = (n: number) => (n / SPAN + .5) * 2048;
  // Small blades lie in the albedo; only a sparse second layer has actual height.
  for (let i = 0; i < 18000; i++) {
    const x = random() * SPAN - SPAN / 2, z = random() * SPAN - SPAN / 2, k = grassAt(x, z);
    if (k > .4) {
      g.strokeStyle = random() > .5 ? 'rgba(144,168,80,.24)' : 'rgba(33,61,28,.3)';
      g.lineWidth = 1 + random() * 1.2; g.beginPath();
      g.moveTo(pixel(x), pixel(z)); g.lineTo(pixel(x) + (random() - .5) * 7, pixel(z) - 2 - random() * 6); g.stroke();
    } else {
      g.fillStyle = 'rgba(59,43,27,.12)'; g.fillRect(pixel(x), pixel(z), 1 + random() * 2, 1 + random() * 2);
    }
  }
  const slab = (x: number, z: number, rotation: number, glyph = false) => {
    g.save(); g.translate(pixel(x), pixel(z)); g.rotate(rotation);
    // Let the underlying soil/grass show through so decoration stays below combat cues.
    g.globalAlpha = .5;
    const w = glyph ? 46 : 27 + random() * 15, h = glyph ? 46 : 25 + random() * 14;
    g.beginPath(); g.moveTo(-w / 2 + 4, -h / 2); g.lineTo(w / 2 - 3, -h / 2 + 2);
    g.lineTo(w / 2, h / 2 - 5); g.lineTo(w / 2 - 6, h / 2); g.lineTo(-w / 2, h / 2 - 2); g.closePath();
    g.fillStyle = ['#727966', '#7b806d', '#646f60', '#858573'][Math.floor(random() * 4)]; g.fill();
    g.lineWidth = 1.4; g.strokeStyle = '#656447'; g.stroke();
    g.strokeStyle = 'rgba(190,193,151,.12)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-w / 2 + 6, -h / 2 + 3); g.lineTo(w / 2 - 4, -h / 2 + 4); g.stroke();
    if (glyph) {
      g.strokeStyle = 'rgba(43,60,46,.33)'; g.lineWidth = 1.4; g.beginPath();
      g.moveTo(-10, 10); g.lineTo(0, -12); g.lineTo(9, 7); g.lineTo(-9, 0); g.lineTo(11, -5); g.stroke();
    }
    g.restore();
  };
  for (let x = -15; x < 15; x += .52) if (random() > .28) {
    slab(x, 1.4 * Math.sin(x * .35) + (random() - .5) * .35, Math.atan(.49 * Math.cos(x * .35)) + (random() - .5) * .3);
  }
  for (let z = -15; z < 15; z += .55) if (random() > .58) {
    slab(-2.2 * Math.cos(z * .28) + (random() - .5) * .5, z, random() * .4);
  }
  for (const [x, z] of [[-4, 4], [5, -3], [3, 5], [-6, -4]]) slab(x, z, random() * .5, true);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.flipY = false;
  texture.anisotropy = 4;

  const root = new THREE.Group(); root.name = 'Arena_Meadow_Details';
  const petals: number[] = [];
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5, cx = Math.cos(a) * .48, cz = Math.sin(a) * .48;
    for (let k = 0; k < 6; k++) {
      const point = (angle: number) => [cx + Math.cos(a) * Math.cos(angle) * .55 - Math.sin(a) * Math.sin(angle) * .28, .25, cz + Math.sin(a) * Math.cos(angle) * .55 + Math.cos(a) * Math.sin(angle) * .28];
      petals.push(cx, .1, cz, ...point(k * Math.PI / 3), ...point((k + 1) * Math.PI / 3));
    }
  }
  const flower = new THREE.BufferGeometry(); flower.setAttribute('position', new THREE.Float32BufferAttribute(petals, 3)); flower.computeVertexNormals();
  const batches: { mesh: THREE.InstancedMesh; points: { x: number; z: number; pos: { x: number; y: number }; size: number; angle: number; color: THREE.Color }[]; scale: THREE.Vector3 }[] = [];
  const shrubLeaves = shrubLeafTexture();
  const add = (name: string, geometry: THREE.BufferGeometry, count: number, colors: string[], scale: THREE.Vector3, grass: boolean, near?: { x: number; z: number }[]) => {
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, side: THREE.DoubleSide, flatShading: !name.startsWith('Meadow_Shrubs') });
    if (name === 'Meadow_Shrubs') { material.map = material.bumpMap = shrubLeaves; material.bumpScale = .035; }
    const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.name = name;
    mesh.receiveShadow = true; mesh.frustumCulled = false;
    const points = [];
    for (let i = 0; i < count; i++) {
      let x = 0, z = 0;
      for (let n = 0; n < 30; n++) {
        if (near) {
          const anchor = near[Math.floor(random() * near.length)], angle = random() * Math.PI * 2, distance = .35 + random() * .55;
          x = anchor.x + Math.cos(angle) * distance; z = anchor.z + Math.sin(angle) * distance;
        } else { x = random() * 29 - 14.5; z = random() * 29 - 14.5; }
        if (!grass || grassAt(x, z) > .6) break;
      }
      points.push({ x, z, pos: { x, y: z }, size: name === 'Meadow_Shrubs' ? .55 + random() : .65 + random() * .7, angle: random() * Math.PI * 2, color: new THREE.Color(colors[Math.floor(random() * colors.length)]) });
    }
    root.add(mesh); batches.push({ mesh, points, scale });
    return points;
  };
  const shrubs = add('Meadow_Shrubs', roundedShrubGeometry(), 180, ['#4e7748', '#60854c', '#567e50'], new THREE.Vector3(.22, .24, .2), true);
  add('Meadow_Clover3', cloverGeometry(3), 140, ['#679451', '#739d5b', '#568547'], new THREE.Vector3(.095, .1, .095), true, shrubs);
  add('Meadow_Clover4', cloverGeometry(4), 100, ['#679451', '#739d5b', '#568547'], new THREE.Vector3(.095, .1, .095), true, shrubs);
  add('Meadow_Flowers', flower, 100, ['#88a0ad', '#a39bb0', '#b7aa67'], new THREE.Vector3(.07, .04, .07), true);
  add('Meadow_Pebbles', new THREE.DodecahedronGeometry(1, 0), 90, ['#7c806c', '#6b7665', '#85826f'], new THREE.Vector3(.065, .035, .045), false);
  const dummy = new THREE.Object3D(); let last = '';
  return {
    root, texture,
    update(arena: ArenaId, radius: number, visible: boolean, lite: boolean) {
      root.visible = visible;
      if (!visible) return;
      const key = `${arena}|${radius.toFixed(2)}|${lite}`;
      if (key === last) return; last = key;
      for (const { mesh, points, scale } of batches) {
        let count = 0;
        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          if (lite && i % 2 || edgeAt(arena, radius, p.pos) < .8) continue;
          dummy.position.set(p.x, mesh.name === 'Meadow_Flowers' ? .07 : .014, p.z); dummy.rotation.set(0, p.angle, 0);
          dummy.scale.copy(scale).multiplyScalar(p.size); dummy.updateMatrix(); mesh.setMatrixAt(count, dummy.matrix);
          // Compact instance colors with their transforms when the shoreline removes a sample.
          mesh.setColorAt(count, p.color);
          count++;
        }
        mesh.count = count; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    },
  };
}
