import * as THREE from 'three';

type Caster = {id:string;alive:boolean;sniperLeft?:number};
// Only the caster or a spectator following them sees this; exclude centered camera and replay.
export function sniperFocusState(ownId:string,caster:Caster|null|undefined,playing:boolean,replay:boolean,shotAge=Infinity,followingId:string|null=null) {
  const active=playing && !replay && !!caster && (caster.id===ownId || caster.id===followingId) && caster.alive;
  return {left:active?Math.max(0,caster.sniperLeft ?? 0):0,shot:active && shotAge>=0?Math.max(0,1-shotAge/.24):0};
}

// Original radial edge lines keep the center and HUD transparent.
export function sniperFocusMask() {
  const material=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
    uniforms:{clock:{value:0},power:{value:0},shot:{value:0},still:{value:0},gain:{value:1}},
    vertexShader:`varying vec2 screenUV; void main(){screenUV=position.xy;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader:`varying vec2 screenUV; uniform float clock,power,shot,still,gain;
      float hash(float x){return fract(sin(x*127.1+31.7)*43758.5453);}
      void main(){
        float radius=length(screenUV);
        float edge=smoothstep(.48,.92,radius);
        float angle=(atan(screenUV.y,screenUV.x)+3.141593)/6.283186;
        float sector=floor(angle*92.);
        float offset=hash(sector);
        float center=.22+.56*offset;
        float thickness=mix(.008,.065,hash(sector+8.))*(1.+shot*.7);
        float strand=1.-smoothstep(thickness,thickness+.012,abs(fract(angle*92.)-center));
        float motion=still>.5?0.:fract(clock*1.8+offset);
        float start=.54+.38*hash(sector+4.)-.12*motion;
        float taper=smoothstep(start,start+.28,radius);
        vec3 ink=offset<.38?vec3(.015,.025,.045):offset<.7?vec3(.12,.68,.96):vec3(.93,.97,1.);
        float alpha=gain*edge*strand*taper*(.36+.3*power+.16*shot);
        gl_FragColor=vec4(ink,alpha);
      }`});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);
  mesh.frustumCulled=false;mesh.renderOrder=9999;mesh.visible=false;
  return mesh;
}
