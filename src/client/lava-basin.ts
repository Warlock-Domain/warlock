import * as THREE from 'three';
import { chasmEdge, lowerBankCurves } from './lava-chasm.ts';

// The lava ends inside the mountain bodies; the shared bank curves keep the lower outline aligned.
export function lavaBasinGeometry() {
  const [left,right]=lowerBankCurves();
  const outline:THREE.Vector3[]=[
    new THREE.Vector3(-44,0,15),new THREE.Vector3(-46,0,-28),
    new THREE.Vector3(-43,0,-31),new THREE.Vector3(-40,0,-35),new THREE.Vector3(-36,0,-40),
    new THREE.Vector3(-32,0,-44),new THREE.Vector3(-28,0,-47),new THREE.Vector3(62,0,-47),
    new THREE.Vector3(60,0,-35),new THREE.Vector3(56,0,-21),new THREE.Vector3(52,0,15),
    ...right.getSpacedPoints(36).reverse().slice(1),
  ];
  for(let i=0;i<=16;i++){
    const x=12.6-i*17.2/16;
    outline.push(new THREE.Vector3(x,0,chasmEdge(x)+.4));
  }
  outline.push(...left.getSpacedPoints(36));
  const shape=new THREE.Shape(outline.map(p=>new THREE.Vector2(p.x,-p.z)));
  const geometry=new THREE.ShapeGeometry(shape); geometry.name='Mountain_Bounded_Lava_Basin';
  return geometry;
}
