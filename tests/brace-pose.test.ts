import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTERS } from '../src/shared/characters.ts';
import { loadModel as load } from './glb.ts';
import { createBraceClip } from '../src/client/brace-pose.ts';
import { createAttackClip } from '../src/client/attack-pose.ts';

describe('Hold ground with a hand on the floor', () => {
  it.each(CHARACTERS.map((c) => c.id))('builds the pose without changing the asset: %s', async (id) => {
    const src = await load(id), idle = src.clips.find((c) => c.name === 'Idle')!;
    const before = src.scene.getObjectByName('hips')!.position.clone();
    const clip = createBraceClip(src.scene, idle);
    expect(clip).toBeTruthy();
    const pose = cloneSkinned(src.scene), mixer = new THREE.AnimationMixer(pose);
    mixer.clipAction(clip!).play(); mixer.update(0);
    pose.updateMatrixWorld(true);
    const point = (name: string) => pose.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name))!.getWorldPosition(new THREE.Vector3());
    const floor = Math.min(point('foot.l').y, point('foot.r').y);
    expect(point('hand.l').y - floor).toBeLessThan(.09);
    expect(point('hand.l').y - floor).toBeGreaterThan(-.03);
    expect(point('hand.r').y).toBeGreaterThan(point('hand.l').y + .1);
    const idlePose = cloneSkinned(src.scene), idleMixer = new THREE.AnimationMixer(idlePose);
    idleMixer.clipAction(idle).play(); idleMixer.update(0); idlePose.updateMatrixWorld(true);
    const idleHead = idlePose.getObjectByName('head')!.getWorldQuaternion(new THREE.Quaternion());
    const head = pose.getObjectByName('head')!.getWorldQuaternion(new THREE.Quaternion());
    const forwardHead = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -.2).multiply(idleHead);
    expect(head.angleTo(forwardHead)).toBeLessThan(.01); // eyes higher than at rest, without raising the body
    const idleSpine = idlePose.getObjectByName('spine')!.getWorldQuaternion(new THREE.Quaternion());
    const spine = pose.getObjectByName('spine')!.getWorldQuaternion(new THREE.Quaternion());
    expect(spine.angleTo(idleSpine)).toBeCloseTo(.75);
    idleMixer.stopAllAction(); idleMixer.uncacheRoot(idlePose);
    expect(src.scene.getObjectByName('hips')!.position).toEqual(before);
    const shoot = src.clips.find((c) => c.name === 'Spellcast_Shoot')!, originalTimes = [...shoot.tracks[0].times];
    const invoke = createAttackClip(shoot);
    expect(invoke.duration).toBe(.4);
    expect(Math.max(...invoke.tracks.flatMap((track) => [...track.times]))).toBeCloseTo(.4);
    expect([...shoot.tracks[0].times]).toEqual(originalTimes);
    mixer.stopAllAction(); mixer.uncacheRoot(pose);
  });
});
