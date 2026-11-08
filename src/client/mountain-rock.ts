import * as THREE from 'three';

// Shared variants retain a broad base, so the bounded lava stays hidden under the mountain chain.
export function mountainRockGeometry(variant: number, topRadius = .65) {
  const geometry=new THREE.CylinderGeometry(topRadius,1,1,9,6).toNonIndexed();
  const vertices=geometry.getAttribute('position'),phase=variant*1.91;
  for(let i=0;i<vertices.count;i++){
    const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i),t=y+.5;
    const r=Math.hypot(x,z),angle=Math.atan2(z,x),middle=Math.sin(Math.PI*t);
    const shoulder=1+middle*(.13*Math.sin(angle*3+phase)+.07*Math.cos(angle*5-phase));
    const ledge=1+middle*.09*Math.sin(t*19+phase+Math.sin(angle*2)*.8);
    const fault=1-middle*.16*Math.pow(Math.max(0,Math.cos(angle-phase)),6);
    const lean=middle*.09;
    const dx=x*shoulder*ledge*fault+lean*Math.sin(phase+1.1);
    const dz=z*shoulder*ledge*fault+lean*Math.cos(phase);
    const peak=t>.99&&r>.1?.035*(.5+.5*Math.sin(angle*3+phase)):0;
    vertices.setXYZ(i,Math.max(-1.04,Math.min(1.04,dx)),y+middle*.025*Math.sin(angle*4+phase)+peak,Math.max(-1.04,Math.min(1.04,dz)));
  }
  geometry.computeVertexNormals();
  const normals=geometry.getAttribute('normal'),colors:number[]=[];
  for(let i=0;i<vertices.count;i+=3){
    const shade=(.38+Math.max(0,normals.getX(i)*.3+normals.getY(i)*.6+normals.getZ(i)*.7)*.24)*(.97+.03*Math.sin(i*.7+phase));
    for(let j=0;j<3;j++)colors.push(shade*.95,shade*.97,shade);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  return geometry;
}
