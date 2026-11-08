import * as THREE from 'three';

export function restoreLavaDepth(lava:THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>) {
  const material=lava.material.clone();material.uniforms=lava.material.uniforms;
  material.colorWrite=false;material.depthWrite=true;material.allowOverride=false;
  const depth=new THREE.Mesh(lava.geometry,material);depth.name='Lava_Depth_Restore';depth.renderOrder=-2.01;
  // Discard scenery depth before combat, then restore the exact lava mask without repainting its color.
  depth.onBeforeRender=renderer=>renderer.clearDepth();
  lava.add(depth);
  return depth;
}
