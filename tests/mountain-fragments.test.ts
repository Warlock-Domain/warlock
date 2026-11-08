import { expect, test } from 'vitest';
import * as THREE from 'three';
import { createLavaLandscape } from '../src/client/lava-landscape.ts';
import { createLavaChasm,chasmEdge } from '../src/client/lava-chasm.ts';
import { lavaBasinGeometry } from '../src/client/lava-basin.ts';
import { mountainFootFragments } from '../src/client/mountain-fragments.ts';

test('foot fragments stay bounded on the interior lava shore and leave waterfall corridors open',()=>{
  const landscape=createLavaLandscape(),chasm=createLavaChasm(landscape.cliffMaterial);
  const lava=new THREE.Mesh(lavaBasinGeometry(),new THREE.MeshBasicMaterial());lava.rotation.x=-Math.PI/2;lava.position.y=-.02;
  const fragments=mountainFootFragments([...landscape.rocks,...chasm.rocks],landscape.cliffMaterial,lava);
  expect(fragments.count).toBeGreaterThan(10);expect(fragments.count).toBeLessThanOrEqual(180);
  const matrix=new THREE.Matrix4(),point=new THREE.Vector3(),center=new THREE.Vector3(),ray=new THREE.Raycaster();
  for(let i=0;i<fragments.count;i++){
    fragments.getMatrixAt(i,matrix);center.setFromMatrixPosition(matrix);
    ray.set(new THREE.Vector3(center.x,2,center.z),new THREE.Vector3(0,-1,0));expect(ray.intersectObject(lava,false).length).toBeGreaterThan(0);
    expect(center.z).toBeLessThan(chasmEdge(center.x)-.29);
    expect(center.z>27&&center.x>-5&&center.x<13).toBe(false);
    expect(Math.hypot(center.x+35,center.z+36)).toBeGreaterThanOrEqual(9);
    const positions=fragments.geometry.getAttribute('position');
    for(let j=0;j<positions.count;j++){point.fromBufferAttribute(positions,j).applyMatrix4(matrix);expect(Math.hypot(point.x,point.z)).toBeGreaterThan(30);}
  }
});
