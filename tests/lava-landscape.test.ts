import { expect, test } from 'vitest';
import * as THREE from 'three';
import { createLavaLandscape } from '../src/client/lava-landscape.ts';

test('distant landscape stays outside the reachable arena surroundings', () => {
  const { root } = createLavaLandscape(); root.updateMatrixWorld(true);
  const point = new THREE.Vector3(),instance=new THREE.Matrix4(),world=new THREE.Matrix4(); let nearest = Infinity;
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const positions = o.geometry.getAttribute('position');
    for(let n=0;n<(o instanceof THREE.InstancedMesh?o.count:1);n++){
      world.copy(o.matrixWorld);
      if(o instanceof THREE.InstancedMesh){o.getMatrixAt(n,instance);world.multiply(instance);}
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions,i).applyMatrix4(world);
        nearest = Math.min(nearest,Math.hypot(point.x,point.z));
      }
    }
  });
  expect(nearest).toBeGreaterThan(30);
});

test('landscape solids occlude one another after lava without casting gameplay shadows', () => {
  const { root } = createLavaLandscape();
  root.traverse(o => {
    if (o instanceof THREE.Group) expect(o.renderOrder).toBe(0);
    if (!(o instanceof THREE.Mesh)) return;
    expect(o.renderOrder).toBeGreaterThan(-3); expect(o.renderOrder).toBeLessThan(-2);
    for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
      if(material instanceof THREE.MeshBasicMaterial&&o.name!=='Lava_Impact_Drops'){
        expect(material.depthWrite).toBe(true);expect(material.transparent).toBe(false);expect(material.opacity).toBe(1);
      }
    }
    expect(o.castShadow).toBe(false); expect(o.receiveShadow).toBe(false);
  });
});

test('Campaign hides the scenery and quiet mode freezes the waterfall animation', () => {
  const landscape = createLavaLandscape();
  const fall = landscape.root.getObjectByName('Distant_Lava_Waterfall') as THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
  landscape.update(12,true,false); expect(fall.material.uniforms.motion.value).toBe(1);
  landscape.update(13,true,true); expect(fall.material.uniforms.motion.value).toBe(0);
  landscape.update(14,false,false); expect(landscape.root.visible).toBe(false);
});
