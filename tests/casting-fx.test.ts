import { expect, it, vi } from 'vitest';
import * as T from 'three';
import { createCastingFx } from '../src/client/casting-fx.ts';

function rig() {
  const model = new T.Group(), spine = new T.Bone(); spine.name = 'spine'; model.add(spine);
  for (const side of ['l', 'r']) { const hand = new T.Bone(); hand.name = `hand${side}`; spine.add(hand); }
  const texture = new T.Texture();
  const fx = createCastingFx(model, texture, 1);
  const hands: T.Sprite[] = []; model.traverse(o => { if (o instanceof T.Sprite) hands.push(o); });
  return { model, spine, texture, fx, hands };
}

it('removes the pose layer before animation sampling without accumulating rotation', () => {
  const { spine, fx } = rig(); const original = spine.quaternion.clone();
  fx.sync(true, 0, false); fx.begin('#ff0000', .1, 10);
  for (let i = 0; i < 20; i++) {
    fx.beforeMixer(); expect(spine.quaternion.angleTo(original)).toBeCloseTo(0);
    fx.afterMixer(10.05, false, false);
    expect(spine.quaternion.angleTo(original)).toBeGreaterThan(.01);
  }
  fx.dispose(); expect(spine.quaternion.angleTo(original)).toBeCloseTo(0);
});

it('keeps a cancelled preparation from producing a release and clears hidden actors', () => {
  const { fx, hands } = rig(); expect(hands).toHaveLength(2);
  fx.sync(true, 0, false); fx.begin('#ff0000', .1, 10); fx.afterMixer(10.05, true, true);
  expect(hands.every(h => h.visible)).toBe(true);
  fx.beforeMixer(); fx.afterMixer(10.11, true, true);
  expect(hands.every(h => !h.visible)).toBe(true);
  fx.release('#ff0000', 11); fx.sync(false, 0, false); fx.afterMixer(11, false, false);
  expect(hands.every(h => !h.visible)).toBe(true);
  fx.sync(true, 0, false); fx.afterMixer(11.05, false, false);
  expect(hands.every(h => !h.visible)).toBe(true); fx.dispose();
});

it('preserves special and reduced-motion poses and disposes only owned materials', () => {
  const { fx, spine, texture, hands } = rig(); const original = spine.quaternion.clone();
  const sharedDispose = vi.spyOn(texture, 'dispose'), ownedDispose = vi.spyOn(hands[0].material, 'dispose');
  fx.release('#00ff00', 10); fx.sync(true, .7, true); fx.afterMixer(10.05, false, false);
  expect(spine.quaternion.angleTo(original)).toBe(0);
  fx.sync(true, 0, false); fx.afterMixer(10.1, false, true);
  expect(spine.quaternion.angleTo(original)).toBe(0);
  fx.afterMixer(10.4, false, true); expect(hands.every(h => !h.visible)).toBe(true);
  fx.dispose(); expect(hands.every(h => !h.parent)).toBe(true);
  expect(ownedDispose).toHaveBeenCalledOnce(); expect(sharedDispose).not.toHaveBeenCalled();
});
