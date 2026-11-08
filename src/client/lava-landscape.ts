import * as THREE from 'three';
import { mountainRockGeometry } from './mountain-rock.ts';
import { createLavaFallContact } from './lava-fall-contact.ts';
import { mountainHaze } from './mountain-haze.ts';
import { mountainTreeCrown } from './mountain-tree.ts';
import { mountainShrubs } from './mountain-greenery.ts';

const VERTEX = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const FALL = `
uniform float clock; uniform float motion; uniform float ragged; varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){
  float t=clock*motion;
  float fringe=.018+noise(vec2(vUv.y*31.,1.))* .025;
  float left=mix(fringe,.025+noise(vec2(vUv.y*23.,3.))*.06,ragged);
  float right=mix(fringe,.025+noise(vec2(vUv.y*19.,7.))*.065,ragged);
  if(vUv.x<left||vUv.x>1.-right) discard;
  vec2 p=vec2(vUv.x*6.,vUv.y*9.-t*.9);
  float melt=noise(p)*.65+noise(p*2.1)*.25+noise(p*4.3)*.1;
  float edge=smoothstep(0.,.12,vUv.x)*smoothstep(0.,.12,1.-vUv.x);
  float heat=smoothstep(.18,.82,melt);
  vec3 color=mix(vec3(.32,.018,.003),vec3(1.,.3,.018),heat);
  color=mix(color,vec3(1.,.69,.15),smoothstep(.72,.92,heat));
  gl_FragColor=vec4(color*mix(.45,1.,edge),1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createLavaRibbon(path: THREE.Vector3[], width: number, across = new THREE.Vector3(0,0,1), fallEdges = false) {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  const steps=fallEdges?12:1,rows=(path.length-1)*steps;
  for(let row=0;row<=rows;row++){
    const along=row/steps,i=Math.min(Math.floor(along),path.length-2),fraction=along-i;
    const p=path[i].clone().lerp(path[i+1],fraction),t=row/rows;
    for (const side of [-1,1]) {
      // Inward-only variation preserves the original banks and spillway clearance.
      const edge=fallEdges?.86+.085*Math.sin(t*23+side*2.7)+.055*Math.sin(t*53+side*1.3):1;
      const point=p.clone().addScaledVector(across,side*(width+along*.22)*edge);
      positions.push(point.x,point.y,point.z); uv.push(side===-1?0:1,t);
    }
    if(row){const a=(row-1)*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const material = new THREE.ShaderMaterial({vertexShader:VERTEX,fragmentShader:FALL,uniforms:{clock:{value:0},motion:{value:1},ragged:{value:fallEdges?1:0}},side:THREE.DoubleSide,depthWrite:false});
  return new THREE.Mesh(geometry,material);
}

// Distant artwork only: never contributes terrain, colliders, lights or gameplay RNG.
export function createLavaLandscape() {
  const root = new THREE.Group(); root.name = 'Arena_Distant_Landscape';
  const cliffs = new THREE.Group(); cliffs.name = 'Distant_Cliffs'; root.add(cliffs);
  const rock = new THREE.MeshBasicMaterial({ color: '#8c868d', vertexColors: true, fog: false });
  const darkRock = new THREE.MeshBasicMaterial({ color: '#6b6670', vertexColors: true, fog: false });
  for (const material of [rock, darkRock]) material.onBeforeCompile = shader => {
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 cliffAt;').replace('#include <begin_vertex>',`#include <begin_vertex>
vec4 cliffVertex=vec4(position,1.);
#ifdef USE_INSTANCING
cliffVertex=instanceMatrix*cliffVertex;
#endif
cliffAt=(modelMatrix*cliffVertex).xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 cliffAt;
float rockHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float rockNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(rockHash(i),rockHash(i+vec2(1,0)),f.x),mix(rockHash(i+vec2(0,1)),rockHash(i+vec2(1,1)),f.x),f.y);}
float rockSeam(vec2 p){
  vec2 cell=floor(p),f=fract(p);float first=8.,second=8.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 offset=vec2(float(x),float(y));
    vec2 seed=vec2(rockHash(cell+offset),rockHash(cell+offset+vec2(19.1,3.7)));
    float d=length(offset+.2+seed*.6-f);
    if(d<first){second=first;first=d;}else second=min(second,d);
  }
  return second-first;
}`)
      .replace('#include <color_fragment>',`#include <color_fragment>
float weather=rockNoise(cliffAt.xz*1.3+cliffAt.y*.12);
float layers=rockNoise(vec2(cliffAt.y*.42,(cliffAt.x+cliffAt.z)*.08));
vec3 rockFacing=abs(normalize(cross(dFdx(cliffAt),dFdy(cliffAt))));
vec2 face=rockFacing.y>max(rockFacing.x,rockFacing.z)?cliffAt.xz:(rockFacing.x>rockFacing.z?cliffAt.zy:cliffAt.xy);
float fault=rockSeam(face*.8);
float aa=max(fwidth(fault),.003);
float crack=(1.-smoothstep(.008,.022+aa,fault))*smoothstep(.5,.72,rockNoise(face*.7+vec2(2.7,6.1)));
diffuseColor.rgb*=(.58+weather*.27+layers*.15)*(1.-crack*.18);
// Fine mineral detail fades before it becomes subpixel noise at distant views.
float footprint=max(length(dFdx(face)),length(dFdy(face)));
float detail=1.-smoothstep(.035,.13,footprint);
float grain=rockNoise(face*9.)*.65+rockNoise(face*19.)*.35;
float chips=smoothstep(.74,.87,rockNoise(face*3.4+vec2(7.1,3.8)));
diffuseColor.rgb*=mix(1.,.94+grain*.12-chips*.08,detail);
float ledge=rockFacing.y;
float moss=smoothstep(.58,.77,rockNoise(cliffAt.xz*.85))
  *smoothstep(.45,.8,ledge)*smoothstep(2.5,4.5,cliffAt.y);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.035,.06,.026)*( .78+weather*.22),moss*.48);
// World height keeps the scorched seam level across scaled and instanced rocks.
float contactHeight=cliffAt.y+rockNoise(cliffAt.xz*2.1)*.16;
float contact=(1.-smoothstep(.12,.85,contactHeight))*smoothstep(-.2,-.04,cliffAt.y);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.028,.016,.012),contact*.82);`);
  };
  const bark = new THREE.MeshBasicMaterial({ color: '#342e29', fog: false });
  const leaves = new THREE.MeshBasicMaterial({ color: '#334c42', vertexColors:true, fog: false });
  for(const material of [rock,darkRock,bark,leaves])mountainHaze(material);
  const stoneGeometries=Array.from({length:4},(_,i)=>mountainRockGeometry(i));
  const crownGeometries=Array.from({length:3},(_,i)=>mountainTreeCrown(i));
  const trunkGeometry = new THREE.CylinderGeometry(.08, .14, 1, 6);
  const shrubRocks:THREE.Mesh[]=[];
  let seed = 80231;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const tree = (x: number, y: number, z: number, size: number) => {
    const trunk = new THREE.Mesh(trunkGeometry, bark); trunk.position.set(x, y + size * .65, z); trunk.scale.y = size * 1.3; cliffs.add(trunk);
    const crown=new THREE.Mesh(crownGeometries[Math.floor(Math.abs(x*13+z*17))%3],leaves);crown.name='Distant_Tree_Crown';
    crown.position.set(x,y,z);crown.scale.setScalar(size);crown.rotation.y=x*1.7+z*2.3;cliffs.add(crown);
  };
  const column = (x: number, z: number, width: number, height: number, depth: number, trees: boolean) => {
    const geometry=stoneGeometries[Math.floor(Math.abs(x*17+z*31))%stoneGeometries.length];
    const mesh = new THREE.Mesh(geometry, rand() > .4 ? rock : darkRock);
    mesh.position.set(x, height / 2 - .6, z); mesh.scale.set(width, height, depth); mesh.rotation.y = rand() * 2; cliffs.add(mesh);
    shrubRocks.push(mesh);
    if (trees) for (let i = 0; i < 3; i++) tree(x + (rand() - .5) * width * .65, height - .5, z + (rand() - .5) * depth * .6, 1.1 + rand() * 1.3);
  };
  for (let i = 0; i < 10; i++) column(-43 - rand() * 8, -28 + i * 4.8, 5 + rand() * 4, 10 + rand() * 13, 4 + rand() * 3, true);
  for (let i = 0; i < 13; i++) column(-28 + i * 7.5, -46 - rand() * 5, 5 + rand() * 3, 5 + rand() * 7, 4 + rand() * 4, i % 2 === 0);
  for (let i = 0; i < 5; i++) column(50 + rand() * 7, -21 + i * 9, 4 + rand() * 3, 4 + rand() * 6, 5, false);
  column(-40,-16,7,10,6,true);
  column(-38,-23,4,6,4,true);
  column(-38,-1,4,4,4,true);
  column(-43,-31,6,11,6,true);
  column(-40,-35,5.5,13,5,true);
  column(-36,-40,5.5,12,5,true);
  column(-32,-44,5.5,12,5,true);
  column(54,-23,6,9,6,false);
  column(51,-19,4,7,4,false);
  column(62,-42,6,10,6,false);
  column(60,-35,6,11,6,true);
  column(57,-28,6,10,6,false);
  const path = [new THREE.Vector3(-39, 10, -17), new THREE.Vector3(-36, 10, -14), new THREE.Vector3(-34, 8, -11), new THREE.Vector3(-33, 4, -7), new THREE.Vector3(-32, .04, -4)];
  const fall = createLavaRibbon(path,2.1,new THREE.Vector3(0,0,1),true); fall.name = 'Distant_Lava_Waterfall'; root.add(fall);
  const corner=createLavaRibbon([
    new THREE.Vector3(-39,12,-40),new THREE.Vector3(-36.5,12,-38),new THREE.Vector3(-35,9,-36),
    new THREE.Vector3(-33,4,-34),new THREE.Vector3(-31,.04,-31),
  ],2.2,new THREE.Vector3(1,0,-.75).normalize(),true);
  corner.name='Corner_Lava_Waterfall'; root.add(corner);
  const materials=[fall.material,corner.material];
  root.traverse(o => {
    if (o instanceof THREE.Mesh) {
      o.renderOrder = -2.8 + (o.position.z + 60) * .00001;
      o.castShadow = o.receiveShadow = false;
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) material.depthWrite = material instanceof THREE.MeshBasicMaterial;
    }
  });
  corner.renderOrder=-2.7;
  root.add(mountainShrubs(shrubRocks));
  const contacts=[createLavaFallContact(new THREE.Vector3(-32,.06,-4)),createLavaFallContact(new THREE.Vector3(-31,.06,-31),1.2)];
  for(const contact of contacts)root.add(contact.root);
  return { root, rocks:shrubRocks, cliffMaterial:rock, update(now: number, enabled: boolean, quiet: boolean) { root.visible = enabled; for(const material of materials){material.uniforms.clock.value = now; material.uniforms.motion.value = quiet ? 0 : 1;} for(const contact of contacts)contact.update(now,enabled,quiet); } };
}
