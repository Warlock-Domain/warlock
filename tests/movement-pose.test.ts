import { expect, it } from 'vitest';
import * as T from 'three';
import { WIZ_SPEED } from '../src/shared/constants.ts';
import { createMovementPose } from '../src/client/movement-pose.ts';

function rig() {
  const root = new T.Group(), model = new T.Group(); root.position.set(3, 0, 4); root.rotation.y = .8; root.add(model);
  model.rotation.y = .2;
  const original = model.quaternion.clone();
  const mixer = new T.AnimationMixer(model), run = mixer.clipAction(new T.AnimationClip('Running_A', 1, []));
  return { root, model, original, run, pose: createMovementPose(model, run) };
}

it('adapts the gait to observed speed without changing actor position or facing', () => {
  const { root, model, original, run, pose } = rig();
  for (let i = 0; i < 30; i++) { pose.beforeMixer(); pose.sample(WIZ_SPEED * .02 * 1.5, .5, .02, true); pose.update(.02, true, false); }
  expect(run.getEffectiveTimeScale()).toBeCloseTo(1.5, 2);
  expect(model.quaternion.angleTo(original)).toBeGreaterThan(.03);
  expect(root.position.toArray()).toEqual([3, 0, 4]); expect(root.rotation.y).toBe(.8);
  pose.beforeMixer(); expect(model.quaternion.angleTo(original)).toBeCloseTo(0);
});

it('settles smoothly to the original pose on stopping and never accumulates tilt', () => {
  const { model, original, pose } = rig();
  for (let i = 0; i < 60; i++) { pose.beforeMixer(); pose.sample(WIZ_SPEED * .02, 0, .02, true); pose.update(.02, true, false); }
  expect(model.quaternion.angleTo(original)).toBeLessThan(.06);
  for (let i = 0; i < 30; i++) { pose.beforeMixer(); pose.sample(0, 0, .02, false); pose.update(.02, true, false); }
  expect(model.quaternion.angleTo(original)).toBeLessThan(.001);
});

it('resets on discontinuities and preserves special and reduced-motion poses', () => {
  const { model, original, run, pose } = rig();
  pose.sample(20, 1, .02, true); pose.update(.02, true, false);
  expect(model.quaternion.angleTo(original)).toBeCloseTo(0); expect(run.getEffectiveTimeScale()).toBe(1);
  pose.beforeMixer(); pose.sample(.03, 1.01, .02, true); pose.update(.02, false, false);
  expect(model.quaternion.angleTo(original)).toBeCloseTo(0);
  pose.beforeMixer(); pose.sample(.03, 1.02, .02, true); pose.update(.02, true, true);
  expect(model.quaternion.angleTo(original)).toBeCloseTo(0);
});

it('takes the short turn across angle wrap and freezes the layer during pauses', () => {
  const { model, original, pose } = rig();
  pose.sample(.02, Math.PI - .001, .02, true); pose.update(.02, true, false); pose.beforeMixer();
  pose.sample(.02, -Math.PI + .001, .02, true); pose.update(.02, true, false);
  const facing = new T.Euler().setFromQuaternion(original.clone().invert().multiply(model.quaternion));
  expect(Math.abs(facing.z)).toBeLessThan(.002);
  const paused = model.quaternion.clone(); pose.beforeMixer(); pose.update(0, true, false);
  expect(model.quaternion.angleTo(paused)).toBeCloseTo(0);
});
