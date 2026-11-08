import * as T from 'three';
import { WIZ_SPEED } from '../shared/constants.ts';

// This layer changes only the wardrobe model, never the simulation root or its facing.
export function createMovementPose(model: T.Object3D, run?: T.AnimationAction) {
  const offset = new T.Quaternion(), angles = new T.Euler();
  let layered = false, previousFacing: number | undefined;
  let targetRate = 1, targetLean = 0, targetBank = 0;
  let rate = 1, lean = 0, bank = 0;
  const reset = () => { targetRate = rate = 1; targetLean = lean = targetBank = bank = 0; };
  return {
    sample(distance: number, facing: number, dt: number, moving: boolean, size = 1) {
      const turn = previousFacing === undefined ? 0 : Math.atan2(Math.sin(facing - previousFacing), Math.cos(facing - previousFacing));
      previousFacing = facing;
      // A gap, teleport or fresh model must not be interpreted as a running stride or a sharp turn.
      if (dt <= 0 || dt > .1 || distance > .8 * size) { reset(); return; }
      const speed = distance / (dt * size * WIZ_SPEED);
      targetRate = moving ? Math.max(.65, Math.min(1.6, speed)) : 1;
      targetLean = moving ? .055 * Math.min(1.3, speed) : 0;
      targetBank = moving ? Math.max(-.045, Math.min(.045, turn / dt * .009)) : 0;
    },
    beforeMixer() {
      if (layered) model.quaternion.multiply(offset.invert());
      layered = false;
    },
    update(dt: number, walkingPose: boolean, reduced: boolean) {
      if (!walkingPose) reset();
      const blend = 1 - Math.exp(-Math.min(.1, Math.max(0, dt)) * 14);
      rate += (targetRate - rate) * blend;
      lean += (targetLean - lean) * blend; bank += (targetBank - bank) * blend;
      run?.setEffectiveTimeScale(rate);
      if (walkingPose && !reduced) {
        angles.set(lean, 0, bank); offset.setFromEuler(angles);
        model.quaternion.multiply(offset); layered = true;
      }
    },
  };
}
