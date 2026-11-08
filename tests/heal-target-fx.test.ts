import { expect, it, vi } from 'vitest';
import * as T from 'three';
import { createHealTargetFx } from '../src/client/heal-target-fx.ts';

it('follows the target body and disappears after the confirmed healing interval', () => {
  const target = new T.Group(), texture = new T.Texture(), fx = createHealTargetFx(texture);
  target.add(fx.root); fx.update(11.5, 10.2, true, false);
  expect(fx.root.visible).toBe(true);
  target.position.set(4, 0, 7); fx.root.position.y = 1.2; target.updateMatrixWorld(true);
  expect(fx.root.getWorldPosition(new T.Vector3()).toArray()).toEqual([4, 1.2, 7]);
  fx.update(11.5, 11.5, true, false); expect(fx.root.visible).toBe(false); fx.dispose();
});

it('hides for unavailable targets and keeps a static low-motion cue', () => {
  const fx = createHealTargetFx(new T.Texture());
  fx.update(11.5, 10, false, false); expect(fx.root.visible).toBe(false);
  fx.update(11.5, 10, true, true); expect(fx.root.visible).toBe(true);
  const positions = fx.root.children.map(o => o.position.toArray());
  expect(fx.root.children.slice(3).every(o => !o.visible)).toBe(true);
  fx.update(11.5, 10.8, true, true);
  expect(fx.root.children.map(o => o.position.toArray())).toEqual(positions); fx.dispose();
});

it('disposes owned resources without disposing the shared particle texture', () => {
  const texture = new T.Texture(), fx = createHealTargetFx(texture), parent = new T.Group(); parent.add(fx.root);
  const shared = vi.spyOn(texture, 'dispose');
  const ring = fx.root.children[0] as T.Mesh<T.TorusGeometry, T.MeshBasicMaterial>;
  const geometry = vi.spyOn(ring.geometry, 'dispose'), material = vi.spyOn(ring.material, 'dispose');
  fx.dispose(); expect(fx.root.parent).toBeNull(); expect(fx.root.children).toHaveLength(0);
  expect(geometry).toHaveBeenCalledOnce(); expect(material).toHaveBeenCalledOnce(); expect(shared).not.toHaveBeenCalled();
});
