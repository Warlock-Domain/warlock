import * as THREE from 'three';

export function mountainTreeCrown(variant:number) {
  const positions:number[]=[],colors:number[]=[];
  const phase=variant*2.13,width=[.85,1.13,1][variant],height=[1.1,.95,1.03][variant];
  for(let tier=0;tier<3;tier++){
    const cone=new THREE.ConeGeometry(1,1,8,2).toNonIndexed(),vertices=cone.getAttribute('position');
    for(let i=0;i<vertices.count;i++){
      const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i),angle=Math.atan2(z,x);
      const radius=(.6-tier*.13)*width*(1+.14*Math.sin(angle*3+phase+tier)+.07*Math.cos(angle*5-phase));
      vertices.setXYZ(i,x*radius+Math.sin(phase+tier*1.7)*.065*(tier+1),(.85+tier*.4+y*(1-tier*.04))*height,z*radius+Math.cos(phase+tier)*.045);
    }
    cone.computeVertexNormals();const normals=cone.getAttribute('normal');
    for(let i=0;i<vertices.count;i++){
      positions.push(vertices.getX(i),vertices.getY(i),vertices.getZ(i));
      const shade=.7+.4*Math.max(0,normals.getX(i)*.5+normals.getY(i)*.6+normals.getZ(i)*.4);
      colors.push(shade*.94,shade,shade*.96);
    }
    cone.dispose();
  }
  const geometry=new THREE.BufferGeometry();geometry.name='Mountain_Tree_Crown_'+variant;
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
  return geometry;
}
