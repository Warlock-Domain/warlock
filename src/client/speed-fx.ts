import * as T from 'three';

const COUNT = 8;

export function createSpeedFx(texture: T.Texture) {
  const root = new T.Group(); root.name = 'Speed_Energy'; root.visible = false;
  const lanes = [4096, 4].map(bit => {
    const geometry = new T.BufferGeometry(), positions = new Float32Array(COUNT * 12), colors = new Float32Array(COUNT * 12);
    const uv: number[] = [], indices: number[] = [];
    for (let i = 0; i < COUNT; i++) { uv.push(0, 0, 1, 0, 1, 1, 0, 1); const k = i * 4; indices.push(k, k + 1, k + 2, k, k + 2, k + 3); }
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage));
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3).setUsage(T.DynamicDrawUsage));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices);
    const material = new T.MeshBasicMaterial({ map: texture, color: '#e0fff6', transparent: true, opacity: .9, vertexColors: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending });
    const mesh = new T.Mesh(geometry, material); mesh.name = bit === 4096 ? 'Speed_Up' : 'Speed_Down'; mesh.frustumCulled = false;
    root.add(mesh); return { bit, geometry, positions, colors, mesh, material };
  });
  const orientation = new T.Quaternion(), side = new T.Vector3();
  return {
    root,
    update(status: number, visible: boolean, lift: number, now: number, lite: boolean, reduced: boolean, facing: T.Quaternion) {
      root.visible = visible && !!(status & (4096 | 4));
      if (!root.visible) return;
      root.position.y = lift;
      root.getWorldQuaternion(orientation); orientation.invert();
      side.set(1, 0, 0).applyQuaternion(facing).applyQuaternion(orientation); side.y = 0; side.normalize().multiplyScalar(.032);
      for (const lane of lanes) {
        lane.mesh.visible = !!(status & lane.bit);
        if (!lane.mesh.visible) continue;
        lane.geometry.setDrawRange(0, (lite ? 4 : COUNT) * 6);
        for (let i = 0; i < COUNT; i++) {
          const phase = reduced ? (i + .5) / COUNT : (now * .85 + i / COUNT) % 1;
          const angle = i * 2.39996 + (lane.bit === 4 ? .7 : 0), radius = .46 + (i % 3) * .08;
          const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
          const y = .12 + (lane.bit === 4096 ? phase : 1 - phase) * 1.7;
          const height = .3 + (i % 3) * .07, strength = reduced ? .45 : Math.sin(phase * Math.PI);
          for (let vertex = 0; vertex < 4; vertex++) {
            const right = vertex === 1 || vertex === 2 ? 1 : -1, k = i * 12 + vertex * 3;
            lane.positions[k] = x + side.x * right; lane.positions[k + 1] = y + (vertex >= 2 ? height : 0); lane.positions[k + 2] = z + side.z * right;
            lane.colors[k] = lane.colors[k + 1] = lane.colors[k + 2] = strength;
          }
        }
        lane.geometry.attributes.position.needsUpdate = true; lane.geometry.attributes.color.needsUpdate = true;
      }
    },
    dispose() {
      root.removeFromParent(); for (const lane of lanes) { lane.geometry.dispose(); lane.material.dispose(); } root.clear();
    },
  };
}
