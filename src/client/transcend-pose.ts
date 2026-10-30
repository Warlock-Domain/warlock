import * as T from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Build an original suspended pose from rest, rather than reusing a curled death pose.
export function createTranscendClip(model: T.Object3D, idle: T.AnimationClip): T.AnimationClip | null {
  const pose = clone(model), mixer = new T.AnimationMixer(pose);
  mixer.clipAction(idle).play(); mixer.update(0); pose.updateMatrixWorld(true);
  const get = (name: string) => pose.getObjectByName(T.PropertyBinding.sanitizeNodeName(name));
  const turn = (bone: T.Object3D, delta: T.Quaternion) => {
    const parent = bone.parent!.getWorldQuaternion(new T.Quaternion());
    const world = bone.getWorldQuaternion(new T.Quaternion());
    bone.quaternion.copy(parent.invert().multiply(delta).multiply(world)); bone.updateWorldMatrix(false, true);
  };
  const hips = get('hips'), head = get('head');
  if (!hips || !head) { mixer.stopAllAction(); mixer.uncacheRoot(pose); return null; }
  turn(hips, new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2));
  turn(head, new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -.5));
  for (const [i, side] of ['l', 'r'].entries()) {
    const upper = get(`upperarm.${side}`), lower = get(`lowerarm.${side}`), hand = get(`hand.${side}`);
    if (!upper || !lower || !hand) continue;
    const aim = (bone: T.Object3D, end: T.Object3D, direction: T.Vector3) => {
      const current = end.getWorldPosition(new T.Vector3()).sub(bone.getWorldPosition(new T.Vector3())).normalize();
      turn(bone, new T.Quaternion().setFromUnitVectors(current, direction.normalize()));
    };
    aim(upper, lower, new T.Vector3(i ? -.18 : .18, -1, 0));
    aim(lower, hand, new T.Vector3(i ? -.08 : .08, -1, .12));
  }
  const tracks: T.KeyframeTrack[] = [];
  pose.traverse(bone => {
    if (!(bone as T.Bone).isBone) return;
    tracks.push(new T.VectorKeyframeTrack(`${bone.name}.position`, [0, 1], [...bone.position.toArray(), ...bone.position.toArray()]));
    tracks.push(new T.QuaternionKeyframeTrack(`${bone.name}.quaternion`, [0, 1], [...bone.quaternion.toArray(), ...bone.quaternion.toArray()]));
  });
  mixer.stopAllAction(); mixer.uncacheRoot(pose);
  return new T.AnimationClip('Transcend_Float', 1, tracks);
}
