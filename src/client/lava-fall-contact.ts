import * as THREE from 'three';

const VERTEX=`varying vec2 vUv;void main(){vUv=uv;vec4 point=vec4(position,1.);
#ifdef USE_INSTANCING
point=instanceMatrix*point;
#endif
gl_Position=projectionMatrix*modelViewMatrix*point;}`;
const FRAGMENT=`
uniform float clock;uniform float motion;uniform float mist;varying vec2 vUv;
void main(){
  float t=clock*motion;
  vec2 p=(vUv-.5)*2.;
  float r=length(p);
  float alpha;vec3 color;
  if(mist>.5){
    float billow=.75+.25*sin(p.x*7.+sin(p.y*5.-t*.4));
    alpha=(1.-smoothstep(.2,1.,r))*billow*.13;
    color=vec3(.24,.19,.16);
  }else{
    float wave=pow(.5+.5*cos(r*22.-t*2.4),10.);
    alpha=wave*smoothstep(.12,.3,r)*(1.-smoothstep(.45,1.,r))*.3;
    color=vec3(.9,.23,.025);
  }
  gl_FragColor=vec4(color,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// One bounded pool per fall, outside the combat surroundings; never emits gameplay events.
export function createLavaFallContact(center: THREE.Vector3, size=1) {
  const root=new THREE.Group();root.name='Lava_Fall_Contact';root.position.copy(center);
  const material=(mist:number)=>new THREE.ShaderMaterial({vertexShader:VERTEX,fragmentShader:FRAGMENT,uniforms:{clock:{value:0},motion:{value:1},mist:{value:mist}},transparent:true,depthWrite:false,side:THREE.DoubleSide});
  const ripple=new THREE.Mesh(new THREE.CircleGeometry(1.4*size,32).rotateX(-Math.PI/2),material(0));
  ripple.name='Lava_Impact_Ripples';ripple.position.y=.025;root.add(ripple);
  const mist=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),material(1),4);
  mist.name='Lava_Impact_Vapor';root.add(mist);
  const drops=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshBasicMaterial({color:'#ff8c31',depthWrite:false,fog:false}),12);
  drops.name='Lava_Impact_Drops';root.add(drops);
  const pose=new THREE.Object3D();
  root.traverse(o=>{if(o instanceof THREE.Mesh){o.renderOrder=-2.55;o.castShadow=o.receiveShadow=false;}});
  const update=(now:number,enabled:boolean,quiet:boolean)=>{
    root.visible=enabled;if(!enabled)return;
    for(const mesh of [ripple,mist]){mesh.material.uniforms.clock.value=now;mesh.material.uniforms.motion.value=quiet?0:1;}
    const time=quiet?0:now;
    for(let i=0;i<4;i++){
      const drift=Math.sin(time*.25+i*2.1)*.12*size;
      pose.position.set(Math.sin(i*2.3)*size*.35+drift,(.65+i*.22)*size,Math.cos(i*2.3)*size*.3);
      pose.rotation.set(0,i*Math.PI/2,0);pose.scale.set(1.7*size,(1.3+i*.15)*size,1);pose.updateMatrix();mist.setMatrixAt(i,pose.matrix);
    }
    mist.instanceMatrix.needsUpdate=true;
    drops.visible=!quiet;
    if(quiet)return;
    for(let i=0;i<12;i++){
      const t=(time/(1.15+(i%3)*.17)+i*.61803398875)%1,angle=i*2.39996;
      const reach=(.55+(i%4)*.14)*size*t;
      pose.position.set(Math.cos(angle)*reach,4*(.45+(i%3)*.18)*size*t*(1-t)+.03,Math.sin(angle)*reach);
      pose.rotation.set(t*2+i,i,t*3);const scale=(.045+(i%3)*.012)*size*(1-t*t);
      pose.scale.set(scale,scale*1.6,scale);pose.updateMatrix();drops.setMatrixAt(i,pose.matrix);
    }
    drops.instanceMatrix.needsUpdate=true;
  };
  // Instance bounds cover the whole trajectory without per-frame sphere recomputation.
  for(const mesh of [mist,drops]){mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,size,0),size*2.5);}
  update(0,true,false);
  return {root,update};
}
