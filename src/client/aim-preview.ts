// Aim preview on the ground: range ring around the wizard, the area or hit band of the armed spell, the melee arc, the target
// lock and the controller reticle. One instance per scene owns its meshes; main.ts feeds it every frame.
import * as THREE from 'three';
import { MELEE_ARC } from '../shared/constants.ts';
import { len, sub, type Vec } from '../shared/vec.ts';
import type { aimOf } from './reach.ts';
import { SNIPER_FX } from './sniper-fx.ts';

export type AimShape = ReturnType<typeof aimOf>;

const AIM_COLOR = '#ffe08a';
// simulation (x, y) → ground (x, z); kept here instead of importing scene.ts, which would make an import cycle
const w3 = (p: Vec, y = 0) => new THREE.Vector3(p.x, y, p.y);

export class AimPreview {
  // controller reticle: gold ring with a dot, drawn over everything on the ground where the right stick aims
  private readonly reticle: THREE.Mesh;
  // thin, discreet ring scaled by the range of the held or chosen spell
  private readonly rangeRing: THREE.Mesh;
  // area at the aimed point (Meteor, Grip, Lula Pix…): the same ring at the area's size
  private readonly blastRing: THREE.Mesh;
  // hit bands (Blast and Splitter fan out): straight body toward +x and a half-circle cap the size of the ball where its flight
  // ends, like LoL's preview (Fernando, 21/10); very light so the floor stays readable, rotated only in y, created on demand
  private readonly bandMat = new THREE.MeshBasicMaterial({ color: AIM_COLOR, transparent: true, opacity: 0.16, depthWrite: false });
  private readonly bandBody = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0).rotateX(-Math.PI / 2);
  private readonly bandCap = new THREE.CircleGeometry(1, 24, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2);
  private readonly bandList: THREE.Group[] = [];
  private readonly coneGeo = new THREE.BufferGeometry();
  private readonly coneMesh: THREE.Mesh;
  // melee arc swing (issue #402): MELEE_ARC.angle sector of radius 1 centred on +x, scaled by the reach and rotated only in y
  private readonly arcMesh: THREE.Mesh;
  // target lock under the wizard the armed Attack or Inelegant Solution would hit (Fernando, 26/10: the aim felt loose)
  private readonly lockMesh: THREE.Mesh;

  constructor(private readonly scene: THREE.Scene) {
    const reticleMat = new THREE.MeshBasicMaterial({ color: AIM_COLOR, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
    this.reticle = this.flat(new THREE.RingGeometry(0.45, 0.62, 40).rotateX(-Math.PI / 2), reticleMat, 10);
    this.reticle.add(new THREE.Mesh(new THREE.CircleGeometry(0.12, 16).rotateX(-Math.PI / 2), reticleMat));
    const ringMat = new THREE.MeshBasicMaterial({ color: AIM_COLOR, transparent: true, opacity: 0.45, depthWrite: false });
    this.rangeRing = this.flat(new THREE.RingGeometry(0.985, 1, 128).rotateX(-Math.PI / 2), ringMat);
    this.blastRing = this.flat(this.rangeRing.geometry, ringMat);
    this.coneGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    this.coneMesh = this.flat(this.coneGeo, new THREE.MeshBasicMaterial({ color: '#d5b474', transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    const arcHalf = (MELEE_ARC.angle / 2) * Math.PI / 180;
    this.arcMesh = this.flat(new THREE.RingGeometry(0, 1, 32, 1, -arcHalf, 2 * arcHalf).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: AIM_COLOR, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    this.arcMesh.scale.setScalar(MELEE_ARC.range);
    this.lockMesh = this.flat(new THREE.RingGeometry(0.62, 0.76, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: SNIPER_FX.laser, transparent: true, opacity: 0.9, depthWrite: false }));
  }

  private flat(geo: THREE.BufferGeometry, mat: THREE.Material, order = 9) {
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = order;
    m.visible = false;
    this.scene.add(m);
    return m;
  }

  private place(m: THREE.Object3D, at: Vec | null, y: number, r = 1) {
    m.visible = !!at && r > 0;
    if (!at || r <= 0) return;
    m.position.copy(w3(at, y));
    m.scale.setScalar(r);
  }

  // centre on the wizard and radius in metres; null (or radius 0) hides
  range(at: Vec | null, r: number) {
    this.place(this.rangeRing, at, 0.04, r);
  }

  // what the armed spell hits from aimOf, all in one place so every spell shape takes the same path; null hides it all
  shape(s: AimShape | null) {
    this.place(this.blastRing, s?.blastAt ?? null, 0.04, s?.blastR ?? 0);
    this.bands(s?.segs ?? [], s?.half ?? 0);
    this.coneMesh.visible = !!s?.cone;
    if (s?.cone) {
      const a = this.coneGeo.getAttribute('position');
      s.cone.forEach((p, i) => a.setXYZ(i, p.x, 0.04, p.y));
      a.needsUpdate = true;
      this.coneGeo.computeBoundingSphere();
    }
  }

  // band segments [from, to] with half width `half`; an empty list hides
  private bands(segs: [Vec, Vec][], half: number) {
    for (let i = this.bandList.length; i < segs.length; i++) {
      const g = new THREE.Group();
      const [body, cap] = [new THREE.Mesh(this.bandBody, this.bandMat), new THREE.Mesh(this.bandCap, this.bandMat)];
      body.renderOrder = cap.renderOrder = 9;
      g.add(body, cap);
      this.scene.add(g);
      this.bandList.push(g);
    }
    const w = Math.max(half, 0.03); // Lightning (width 0) becomes a 6 cm line so it shows
    this.bandList.forEach((g, i) => {
      const sg = segs[i];
      g.visible = !!sg;
      if (!sg) return;
      const d = sub(sg[1], sg[0]), l = Math.max(len(d) - w, 0);
      const [body, cap] = g.children;
      g.position.copy(w3(sg[0], 0.035));
      g.rotation.y = -Math.atan2(d.y, d.x);
      body.scale.set(l, 1, 2 * w);
      cap.position.x = l;
      cap.scale.set(w, 1, w);
    });
  }

  // melee arc around the wizard, turned to `facing`; null hides
  arc(at: Vec | null, facing: number) {
    this.place(this.arcMesh, at, 0.04, MELEE_ARC.range);
    this.arcMesh.rotation.y = -facing;
  }

  lockOn(at: Vec | null) {
    this.place(this.lockMesh, at, 0.05);
  }

  // the reticle pulses so it reads as a cursor, not a ground mark
  aim(at: Vec | null) {
    this.place(this.reticle, at, 0.05, 1 + 0.08 * Math.sin(performance.now() / 120));
  }
}
