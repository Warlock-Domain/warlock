import type * as THREE from 'three';

// Anchor atmospheric depth to the arena, avoiding fog changes when inspecting or zooming.
export function mountainHaze(material: THREE.MeshBasicMaterial) {
  const previous=material.onBeforeCompile,cacheKey=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 mountainAt;')
      .replace('#include <begin_vertex>',`#include <begin_vertex>
vec4 mountainVertex=vec4(position,1.);
#ifdef USE_INSTANCING
mountainVertex=instanceMatrix*mountainVertex;
#endif
mountainAt=(modelMatrix*mountainVertex).xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 mountainAt;')
      .replace('#include <opaque_fragment>',`#include <opaque_fragment>
float distanceHaze=smoothstep(40.,76.,length(mountainAt.xz));
float upperHaze=smoothstep(.9,5.,mountainAt.y);
gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.105,.12,.145),distanceHaze*upperHaze*.35);`);
  };
  material.customProgramCacheKey=()=>cacheKey+'|mountain-haze';
}
