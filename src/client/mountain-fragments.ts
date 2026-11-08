import * as THREE from 'three';
import { chasmEdge } from './lava-chasm.ts';

export function mountainFootFragments(rocks:THREE.Mesh[],stone:THREE.Material,lava:THREE.Mesh) {
  const matrices:THREE.Matrix4[]=[],pose=new THREE.Object3D(),world=new THREE.Matrix4(),instance=new THREE.Matrix4();
  const center=new THREE.Vector3(),inward=new THREE.Vector3(),side=new THREE.Vector3(),point=new THREE.Vector3();
  const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
  const probe=new THREE.Mesh(rocks[0].geometry,rocks[0].material);probe.matrixAutoUpdate=false;
  lava.updateWorldMatrix(true,false);let ordinal=0;
  for(const rock of rocks){
    rock.updateWorldMatrix(true,false);
    for(let n=0;n<(rock instanceof THREE.InstancedMesh?rock.count:1);n++,ordinal++){
      if(ordinal%3)continue;
      world.copy(rock.matrixWorld);
      if(rock instanceof THREE.InstancedMesh){rock.getMatrixAt(n,instance);world.multiply(instance);}
      center.setFromMatrixPosition(world).setY(.18);inward.set(-center.x,0,-center.z).normalize();side.set(-inward.z,0,inward.x);
      probe.geometry=rock.geometry;probe.material=rock.material;probe.matrixWorld.copy(world);
      ray.set(center.clone().addScaledVector(inward,20),inward.clone().negate());
      const foot=ray.intersectObject(probe,false)[0];if(!foot)continue;
      for(let j=0;j<4&&matrices.length<180;j++){
        point.copy(foot.point).addScaledVector(inward,.22+j*.23).addScaledVector(side,(j-1.5)*.48+Math.sin(ordinal+j)*.2);
        if(Math.hypot(point.x,point.z)<32||point.z>chasmEdge(point.x)-.3)continue;
        if(point.x>-43&&point.x<-28&&point.z>-24&&point.z<3)continue;
        if(Math.hypot(point.x+35,point.z+36)<9||point.z>27&&point.x>-5&&point.x<13)continue;
        // Only scatter on the inside lava shore, never behind the mountain-bounded map.
        ray.set(new THREE.Vector3(point.x,2,point.z),down);if(!ray.intersectObject(lava,false).length)continue;
        const size=.27+(Math.sin(ordinal*1.7+j*2.3)+1)*.18;
        pose.position.set(point.x,size*.13,point.z);pose.rotation.set(Math.sin(ordinal+j)*.2,ordinal*1.7+j*2.3,Math.cos(j)*.15);
        pose.scale.set(size,size*.55,size*(.7+.12*Math.sin(ordinal+j)));pose.updateMatrix();matrices.push(pose.matrix.clone());
      }
    }
  }
  const geometry=new THREE.IcosahedronGeometry(1,0),vertices=geometry.getAttribute('position');
  for(let i=0;i<vertices.count;i++)vertices.setX(i,vertices.getX(i)*(1+.14*Math.sin(vertices.getZ(i)*7)));
  geometry.computeVertexNormals();const normals=geometry.getAttribute('normal'),colors:number[]=[];
  for(let i=0;i<normals.count;i++){const shade=.72+.28*Math.max(0,normals.getY(i)*.6+normals.getZ(i)*.5);colors.push(shade,shade,shade);}
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const mesh=new THREE.InstancedMesh(geometry,stone,matrices.length);mesh.name='Mountain_Foot_Fragments';mesh.renderOrder=-2.52;
  matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();return mesh;
}
