import { expect, test } from 'vitest';
import * as THREE from 'three';
import { chasmEdge, createLavaChasm } from '../src/client/lava-chasm.ts';

test('the cliff lip stays beyond arena and refuge-island surroundings',()=>{
  for(let x=-80;x<=80;x++) expect(chasmEdge(x)).toBeGreaterThan(33);
});

test('the lower waterfall drops over thirty metres without changing the lava level',()=>{
  const {root}=createLavaChasm(new THREE.MeshBasicMaterial());
  const fall=root.getObjectByName('Lower_Lava_Waterfall') as THREE.Mesh;
  fall.geometry.computeBoundingBox();
  expect(fall.geometry.boundingBox!.max.y).toBeCloseTo(.025);
  expect(fall.geometry.boundingBox!.min.y).toBeLessThanOrEqual(-32);
  const point=new THREE.Vector3(),positions=fall.geometry.getAttribute('position');
  for(let i=0;i<positions.count;i++){
    point.fromBufferAttribute(positions,i);expect(Math.hypot(point.x,point.z)).toBeGreaterThan(30);
  }
  expect(root.getObjectByName('Lower_Lava_Runout')).toBeTruthy();
});

test('Campaign hides the chasm and quiet mode freezes all added lava ribbons',()=>{
  const chasm=createLavaChasm(new THREE.MeshBasicMaterial());
  chasm.update(5,true,true);
  for(const name of ['Lower_Lava_Waterfall','Lower_Lava_Inlet','Lower_Lava_Runout']){
    const mesh=chasm.root.getObjectByName(name) as THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
    expect(mesh.material.uniforms.motion.value).toBe(0);
    expect(mesh.material.depthWrite).toBe(false);
  }
  chasm.update(6,false,false);expect(chasm.root.visible).toBe(false);
});
