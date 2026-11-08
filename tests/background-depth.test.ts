import { expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { restoreLavaDepth } from '../src/client/background-depth.ts';

test('scenery depth is cleared before combat while the live lava mask and override passes are preserved',()=>{
  const lava=new THREE.Mesh(new THREE.PlaneGeometry(10,10),new THREE.ShaderMaterial({uniforms:{heat:{value:1}}}));
  const depth=restoreLavaDepth(lava),clearDepth=vi.fn();
  expect(depth.geometry).toBe(lava.geometry);expect(depth.material.uniforms).toBe(lava.material.uniforms);
  lava.material.uniforms.heat.value=.3;expect(depth.material.uniforms.heat.value).toBe(.3);
  expect(depth.material.colorWrite).toBe(false);expect(depth.material.depthWrite).toBe(true);
  expect(depth.material.allowOverride).toBe(false);
  expect(depth.renderOrder).toBeGreaterThan(-2.55);expect(depth.renderOrder).toBeLessThan(-2);
  Reflect.apply(depth.onBeforeRender,depth,[{clearDepth}]);expect(clearDepth).toHaveBeenCalledOnce();
  lava.visible=false;let draws=0;lava.traverseVisible(()=>draws++);expect(draws).toBe(0);
});
