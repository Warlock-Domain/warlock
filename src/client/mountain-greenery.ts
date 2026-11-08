import * as THREE from 'three';
import { roundedShrubGeometry } from './meadow-plants.ts';
import { mountainHaze } from './mountain-haze.ts';

export function mountainShrubs(rocks:THREE.Mesh[]) {
  const placements:THREE.Matrix4[]=[],pose=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),edge=new THREE.Vector3(),normal=new THREE.Vector3();
  const instance=new THREE.Matrix4(),world=new THREE.Matrix4();let ordinal=0;
  for(const rock of rocks){
    rock.updateWorldMatrix(true,false);
    const vertices=rock.geometry.getAttribute('position'),index=rock.geometry.index;
    const count=rock instanceof THREE.InstancedMesh?rock.count:1;
    for(let n=0;n<count;n++,ordinal++){
      if(ordinal%2||placements.length>=80)continue;
      world.copy(rock.matrixWorld);
      if(rock instanceof THREE.InstancedMesh){rock.getMatrixAt(n,instance);world.multiply(instance);}
      const faces:{point:THREE.Vector3;normal:THREE.Vector3}[]=[];
      for(let i=0;i<(index?.count??vertices.count);i+=3){
        a.fromBufferAttribute(vertices,index?index.getX(i):i).applyMatrix4(world);
        b.fromBufferAttribute(vertices,index?index.getX(i+1):i+1).applyMatrix4(world);
        c.fromBufferAttribute(vertices,index?index.getX(i+2):i+2).applyMatrix4(world);
        normal.subVectors(b,a).cross(edge.subVectors(c,a)).normalize();
        const point=a.clone().add(b).add(c).multiplyScalar(1/3);
        if(normal.y>.55&&point.y>3&&Math.hypot(point.x,point.z)>32)faces.push({point,normal:normal.clone()});
      }
      if(!faces.length)continue;
      const face=faces[(ordinal*13)%faces.length],size=.7+(Math.sin(ordinal*2.3)+1)*.15;
      // The root is an identity world-space batch; bury the rounded base slightly into the actual face.
      pose.position.copy(face.point).addScaledVector(face.normal,-.04);
      pose.quaternion.setFromUnitVectors(up,face.normal);pose.rotateY(ordinal*1.7);
      pose.scale.set(size,size*.9,size*.8);pose.updateMatrix();placements.push(pose.matrix.clone());
    }
  }
  const geometry=roundedShrubGeometry(),normals=geometry.getAttribute('normal'),colors:number[]=[];
  for(let i=0;i<normals.count;i++){const shade=.72+.28*Math.max(0,normals.getY(i)*.6+normals.getZ(i)*.5);colors.push(shade*.94,shade,shade*.9);}
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const material=new THREE.MeshBasicMaterial({color:'#384d35',vertexColors:true,fog:false});mountainHaze(material);
  const shrubs=new THREE.InstancedMesh(geometry,material,placements.length);shrubs.name='Mountain_Ledge_Shrubs';shrubs.renderOrder=-2.55;
  placements.forEach((matrix,i)=>shrubs.setMatrixAt(i,matrix));shrubs.instanceMatrix.needsUpdate=true;shrubs.computeBoundingSphere();
  return shrubs;
}
