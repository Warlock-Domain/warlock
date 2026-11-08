import { expect, test } from 'vitest';
import * as THREE from 'three';
import { createLavaFallContact } from '../src/client/lava-fall-contact.ts';

test('fall contact particles remain bounded and outside the combat surroundings',()=>{
  const effect=createLavaFallContact(new THREE.Vector3(-32,.06,-4));
  const drops=effect.root.getObjectByName('Lava_Impact_Drops') as THREE.InstancedMesh;
  const matrix=new THREE.Matrix4(),point=new THREE.Vector3();
  for(let frame=0;frame<120;frame++){
    effect.update(frame/17,true,false);effect.root.updateMatrixWorld(true);
    for(let i=0;i<drops.count;i++){
      drops.getMatrixAt(i,matrix);
      const positions=drops.geometry.getAttribute('position');
      for(let j=0;j<positions.count;j++){
        point.fromBufferAttribute(positions,j).applyMatrix4(matrix);
        expect(Math.hypot(point.x,point.z)).toBeLessThan(1.5);
        expect(point.y).toBeGreaterThan(-.1);expect(point.y).toBeLessThan(1.6);
        point.applyMatrix4(drops.matrixWorld);
        expect(Math.hypot(point.x,point.z)).toBeGreaterThan(30);
      }
    }
  }
});

test('quiet mode freezes vapor and ripples, hides droplets and respects scenery visibility',()=>{
  const effect=createLavaFallContact(new THREE.Vector3(-32,.06,-4));
  const vapor=effect.root.getObjectByName('Lava_Impact_Vapor') as THREE.InstancedMesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
  const ripples=effect.root.getObjectByName('Lava_Impact_Ripples') as THREE.Mesh<THREE.CircleGeometry,THREE.ShaderMaterial>;
  effect.update(10,true,true);const matrices=Array.from(vapor.instanceMatrix.array);
  effect.update(12,true,true);
  expect(Array.from(vapor.instanceMatrix.array)).toEqual(matrices);
  expect(vapor.material.uniforms.motion.value).toBe(0);expect(ripples.material.uniforms.motion.value).toBe(0);
  expect(effect.root.getObjectByName('Lava_Impact_Drops')!.visible).toBe(false);
  effect.update(13,false,false);expect(effect.root.visible).toBe(false);
  effect.update(14,true,false);expect(effect.root.visible).toBe(true);
  expect(effect.root.getObjectByName('Lava_Impact_Drops')!.visible).toBe(true);
});
