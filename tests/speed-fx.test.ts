import { expect, it, vi } from 'vitest';
import * as T from 'three';
import { createSpeedFx } from '../src/client/speed-fx.ts';

it.each([4096, 4])('moves straight vertical lines in the correct direction for status %s', status => {
  const fx = createSpeedFx(new T.Texture()), facing = new T.Quaternion();
  fx.update(status, true, 0, .2, false, false, facing);
  const lane = fx.root.getObjectByName(status === 4096 ? 'Speed_Up' : 'Speed_Down') as T.Mesh<T.BufferGeometry>;
  const before = Array.from(lane.geometry.attributes.position.array);
  fx.update(status, true, 0, .3, false, false, facing);
  const after = lane.geometry.attributes.position.array;
  expect(after[0]).toBeCloseTo(before[0]); expect(after[2]).toBeCloseTo(before[2]);
  expect((after[1] - before[1]) * (status === 4096 ? 1 : -1)).toBeGreaterThan(0);
  expect(fx.root.visible).toBe(true); fx.update(0, true, 0, .4, false, false, facing);
  expect(fx.root.visible).toBe(false); fx.dispose();
});

it('preserves both directions, static reduced motion, lite cap and visibility', () => {
  const fx = createSpeedFx(new T.Texture()), facing = new T.Quaternion();
  fx.update(4096 | 4, true, 1.2, .2, true, true, facing);
  expect(fx.root.children.every(o => o.visible)).toBe(true); expect(fx.root.position.y).toBe(1.2);
  const lane = fx.root.children[0] as T.Mesh<T.BufferGeometry>;
  const before = Array.from(lane.geometry.attributes.position.array); expect(lane.geometry.drawRange.count).toBe(24);
  fx.update(4096 | 4, true, 1.2, .4, true, true, facing);
  expect(Array.from(lane.geometry.attributes.position.array)).toEqual(before);
  fx.update(4096 | 4, false, 0, .5, false, false, facing); expect(fx.root.visible).toBe(false); fx.dispose();
});

it('disposes owned buffers/materials without disposing the shared texture', () => {
  const texture = new T.Texture(), fx = createSpeedFx(texture), shared = vi.spyOn(texture, 'dispose');
  const lane = fx.root.children[0] as T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>;
  const geometry = vi.spyOn(lane.geometry, 'dispose'), material = vi.spyOn(lane.material, 'dispose');
  fx.dispose(); expect(geometry).toHaveBeenCalledOnce(); expect(material).toHaveBeenCalledOnce(); expect(shared).not.toHaveBeenCalled();
});
