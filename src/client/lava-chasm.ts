import * as THREE from 'three';
import { createLavaRibbon } from './lava-landscape.ts';
import { mountainRockGeometry } from './mountain-rock.ts';
import { createLavaFallContact } from './lava-fall-contact.ts';
import { mountainHaze } from './mountain-haze.ts';
import { mountainTreeCrown } from './mountain-tree.ts';
import { mountainShrubs } from './mountain-greenery.ts';

export const chasmEdge = (x: number) => 36+Math.sin(x*.075)*1.8+Math.sin(x*.17+.4)*.65;
export const CHASM_GLSL = `float chasmEdge(float x){return 36.0+sin(x*.075)*1.8+sin(x*.17+.4)*.65;}`;

export function lowerBankCurves() {
  return [
    [[-4.6,chasmEdge(-4.6)-.25],[-24,chasmEdge(-24)+.6],[-37,chasmEdge(-37)+.4],[-43,chasmEdge(-43)-1],[-46,28],[-44,15]],
    [[12.6,chasmEdge(12.6)-.25],[30,chasmEdge(30)+.6],[45,chasmEdge(45)+.4],[51,chasmEdge(51)-1],[54,28],[52,15]],
  ].map(points=>new THREE.CatmullRomCurve3(points.map(([x,z])=>new THREE.Vector3(x,0,z))));
}

export function chasmFallPath() {
  const edge = chasmEdge(4);
  return [
    new THREE.Vector3(4,.025,edge-2),new THREE.Vector3(4,.025,edge),new THREE.Vector3(4.8,-3,edge+1.2),
    new THREE.Vector3(5.5,-12,edge+2.7),new THREE.Vector3(7,-23,edge+4.8),new THREE.Vector3(9,-32,edge+7),
  ];
}

export function createLavaChasm(stone: THREE.Material, fallPath = chasmFallPath()) {
  const root=new THREE.Group(); root.name='Arena_Distant_Chasm';
  const positions:number[]=[], indices:number[]=[];
  const columns=64, rows=6;
  for(let i=0;i<=columns;i++) {
    const x=-80+i*160/columns;
    for(let j=0;j<=rows;j++) {
      const t=j/rows;
      const rough=Math.sin(Math.PI*t);
      positions.push(x+Math.sin(i*2+j)*.8*rough,-.025-32*t+Math.sin(i*.7+j)*.6*rough,chasmEdge(x)+(5+Math.sin(i*.7)*1.3)*t+Math.sin(i*2.3+j*.4)*1.5*rough);
      if(i&&j){const a=(i-1)*(rows+1)+j-1,b=i*(rows+1)+j-1;indices.push(a,a+1,b,b,a+1,b+1);}
    }
  }
  const indexed=new THREE.BufferGeometry(); indexed.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); indexed.setIndex(indices);
  const geometry=indexed.toNonIndexed(); indexed.dispose(); geometry.computeVertexNormals();
  const normals=geometry.getAttribute('normal'),colors:number[]=[];
  for(let i=0;i<normals.count;i+=3) {
    const shade=.26+Math.max(0,normals.getX(i)*.4+normals.getY(i)*.3+normals.getZ(i)*.5)*.25;
    for(let j=0;j<3;j++)colors.push(shade*.95,shade*.97,shade);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const wall=new THREE.Mesh(geometry,stone); wall.name='Distant_Chasm_Wall'; wall.renderOrder=-2.8; root.add(wall);
  const bedGeometry=new THREE.PlaneGeometry(180,100,18,10).rotateX(-Math.PI/2);
  bedGeometry.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:bedGeometry.getAttribute('position').count*3},()=>.12),3));
  const bed=new THREE.Mesh(bedGeometry,stone); bed.name='Chasm_Valley_Floor'; bed.position.set(0,-32.3,80); bed.renderOrder=-2.95; root.add(bed);
  const edge=chasmEdge(4);
  const fall=createLavaRibbon(fallPath,3.4,new THREE.Vector3(1,0,0),true);
  const fallPositions=fall.geometry.getAttribute('position');
  for(let i=0;i<fallPositions.count;i++) fallPositions.setZ(i,fallPositions.getZ(i)+chasmEdge(fallPositions.getX(i))-edge);
  fallPositions.needsUpdate=true; fall.geometry.computeVertexNormals();
  fall.name='Lower_Lava_Waterfall'; fall.renderOrder=-2.7; root.add(fall);
  const inlet=createLavaRibbon([new THREE.Vector3(-12,.035,edge-5),new THREE.Vector3(-5,.035,edge-3.5),new THREE.Vector3(0,.035,edge-2),new THREE.Vector3(4,.035,edge)],2.2);
  const inletPositions=inlet.geometry.getAttribute('position');
  for(let i=0;i<inletPositions.count;i++) {
    const z=i<2?edge-5:inletPositions.getZ(i);
    inletPositions.setZ(i,Math.min(z,chasmEdge(inletPositions.getX(i))-.04));
  }
  inletPositions.needsUpdate=true; inlet.geometry.computeVertexNormals();
  inlet.name='Lower_Lava_Inlet'; inlet.renderOrder=-2.7; root.add(inlet);
  const runout=createLavaRibbon([new THREE.Vector3(9,-32.1,edge+7),new THREE.Vector3(25,-32.1,edge+9),new THREE.Vector3(50,-32.1,edge+12),new THREE.Vector3(80,-32.1,edge+14)],5.8);
  runout.name='Lower_Lava_Runout'; runout.renderOrder=-2.75; root.add(runout);
  const pool=new THREE.Mesh(new THREE.CircleGeometry(6,24).rotateX(-Math.PI/2),fall.material);
  pool.name='Lower_Lava_Pool'; pool.position.set(10,-32.03,edge+7.5); pool.scale.z=.65; pool.renderOrder=-2.68; root.add(pool);
  const boulderGeometry=new THREE.IcosahedronGeometry(1,0);
  boulderGeometry.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:boulderGeometry.getAttribute('position').count*3},()=>.36),3));
  const banks=new THREE.Group(); banks.name='Chasm_Lip_Banks'; root.add(banks);
  const bankPoints:{x:number;z:number}[]=[];
  for(const curve of lowerBankCurves()){
    for(const point of curve.getSpacedPoints(Math.ceil(curve.getLength()/2.6)))bankPoints.push({x:point.x,z:point.z});
  }
  const bankRocks=Array.from({length:4},(_,variant)=>{
    const count=bankPoints.filter((_,i)=>i%4===variant).length;
    const mesh=new THREE.InstancedMesh(mountainRockGeometry(variant,.75),stone,count);
    mesh.name='Chasm_Bank_Rocks'+(variant?'_'+variant:'');
    return mesh;
  });
  const treeCount=bankPoints.filter((_,i)=>i%3===1).length;
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.08,.13,1,6),new THREE.MeshBasicMaterial({color:'#392e29',fog:false}),treeCount);
  const leaves=new THREE.MeshBasicMaterial({color:'#334c42',vertexColors:true,fog:false});
  const crowns=Array.from({length:3},(_,variant)=>{
    const mesh=new THREE.InstancedMesh(mountainTreeCrown(variant),leaves,Math.ceil((treeCount-variant)/3));
    mesh.name='Chasm_Bank_Trees'+(variant?'_'+variant:'');return mesh;
  });
  mountainHaze(trunks.material);mountainHaze(leaves);
  trunks.name='Chasm_Bank_Trunks';
  const pose=new THREE.Object3D(); let treeIndex=0;
  bankPoints.forEach(({x,z},i)=>{
    const height=7+(Math.sin(i*1.3)+1)*1.7;
    pose.position.set(x,height*.5-.35,z);pose.rotation.set(.025*Math.sin(i),i*1.73,.025*Math.cos(i));pose.scale.set(3.2+.25*Math.sin(i),height,2.9+.3*Math.cos(i));pose.updateMatrix();bankRocks[i%4].setMatrixAt(Math.floor(i/4),pose.matrix);
    if(i%3!==1)return;
    const size=.8+(Math.sin(i*1.7)+1)*.3,base=height-.4;
    pose.rotation.set(0,i*1.7,0);pose.position.set(x,base+size*.5,z);pose.scale.set(1,size,1);pose.updateMatrix();trunks.setMatrixAt(treeIndex,pose.matrix);
    pose.position.set(x,base,z);pose.scale.setScalar(size);pose.updateMatrix();crowns[treeIndex%3].setMatrixAt(Math.floor(treeIndex/3),pose.matrix);
    treeIndex++;
  });
  for(const mesh of [...bankRocks,trunks,...crowns]){
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.renderOrder=-2.65;banks.add(mesh);
  }
  root.add(mountainShrubs(bankRocks));
  for(let i=0;i<28;i++){
    const x=-70+i*5.2;
    if(Math.abs(x-9)<10)continue;
    const boulder=new THREE.Mesh(boulderGeometry,stone); boulder.name='Chasm_Talus';
    boulder.position.set(x,-31.6,chasmEdge(x)+6+Math.sin(i*2.7)*1.7); boulder.scale.set(2.2+Math.sin(i)*.7,1.4+Math.cos(i)*.5,2.4); boulder.rotation.y=i*1.7;boulder.renderOrder=-2.78;root.add(boulder);
  }
  const ribbons=[fall,inlet,runout];
  const contact=createLavaFallContact(new THREE.Vector3(9,-32.01,edge+7),2);root.add(contact.root);
  return { root, rocks: bankRocks, update(now: number, enabled: boolean, quiet: boolean, showLava = true) {
    root.visible = enabled;
    pool.visible = showLava;
    for (const ribbon of ribbons) {
      ribbon.visible = showLava;
      ribbon.material.uniforms.clock.value = now;
      ribbon.material.uniforms.motion.value = !quiet && ribbon === fall ? 1 : 0;
    }
    contact.update(now, enabled && showLava, quiet);
  } };
}
