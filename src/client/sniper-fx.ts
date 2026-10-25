import * as THREE from 'three';
import type { SoundKind } from './sound.ts';

export const sniperShotSound: SoundKind = 'hitHeavy';
export const SNIPER_FX = { laser: '#ff324e', metal: '#283447', stock: '#534135', flash: '#fff2b5' };

// Original procedural barrel, scope and stock; no external reference model is copied.
export function sniperRig() {
  const rig = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({color:SNIPER_FX.metal,metalness:.65,roughness:.45});
  const stock = new THREE.MeshStandardMaterial({color:SNIPER_FX.stock,roughness:.8});
  const box = (x:number,y:number,z:number,w:number,h:number,d:number,mat:THREE.Material) => {
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z); rig.add(m); return m;
  };
  box(.18,.93,.25,.2,.22,1.0,stock);
  box(.18,.95,.9,.09,.09,1.3,metal);
  box(.18,1.13,.5,.12,.12,.5,metal);
  box(.18,.72,.22,.1,.3,.15,stock);
  const laserMat=new THREE.MeshBasicMaterial({color:SNIPER_FX.laser,transparent:true,opacity:.7,depthWrite:false});
  const laser=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,1,6),laserMat);
  laser.rotation.x=Math.PI/2; laser.name='sniper-laser'; rig.add(laser);
  const mark=new THREE.Mesh(new THREE.RingGeometry(.42,.48,32),laserMat);
  mark.rotation.x=-Math.PI/2; mark.name='sniper-reticle'; rig.add(mark);
  rig.visible=false;
  return rig;
}

export function updateSniperRig(rig: THREE.Group, distance: number, left: number) {
  const laser=rig.getObjectByName('sniper-laser')!;
  laser.position.set(.18,.9,(distance+1.4)/2); laser.scale.y=Math.max(.01,distance-1.4);
  const mark=rig.getObjectByName('sniper-reticle')!;
  mark.position.set(0,.055,distance); mark.rotation.z=(4.5-left)*1.5;
}
