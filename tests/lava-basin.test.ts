import { expect, test } from 'vitest';
import * as THREE from 'three';
import { lavaBasinGeometry } from '../src/client/lava-basin.ts';

function basin() {
  const mesh=new THREE.Mesh(lavaBasinGeometry(),new THREE.MeshBasicMaterial());
  mesh.rotation.x=-Math.PI/2; mesh.updateMatrixWorld(true);
  return (x:number,z:number)=>new THREE.Raycaster(new THREE.Vector3(x,10,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh).length>0;
}

test('the bounded lava still covers combat and refuge-island surroundings',()=>{
  const covered=basin(); expect(covered(0,0)).toBe(true);
  for(let i=0;i<96;i++){
    const angle=i*Math.PI*2/96;
    expect(covered(Math.cos(angle)*31,Math.sin(angle)*31),String(i)).toBe(true);
  }
});

test('there is no lava surface beyond the exterior mountains',()=>{
  const covered=basin();
  for(const [x,z]of [[-65,0],[70,0],[0,-60],[0,60]])expect(covered(x,z)).toBe(false);
});

test('the western and corner waterfalls still meet the lava basin',()=>{
  const covered=basin();
  expect(covered(-32,-4)).toBe(true);expect(covered(-31,-31)).toBe(true);expect(covered(4,36)).toBe(true);
});
