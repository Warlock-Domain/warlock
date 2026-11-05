import * as THREE from 'three';

// A single-pass rim follows skinning and temporary material effects without a duplicate body.
export function characterRim(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float characterEdge = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
      outgoingLight += vec3(0.18, 0.20, 0.24) * characterEdge;
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => 'character-rim-v1';
}

export function contactShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 3, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(0,0,0,0.42)');
  gradient.addColorStop(0.45, 'rgba(0,0,0,0.24)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
