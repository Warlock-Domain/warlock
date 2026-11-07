import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AimPreview } from '../src/client/aim-preview.ts';
import { aimOf } from '../src/client/reach.ts';
import { noItems } from '../src/shared/items.ts';
import { noSpells, spellLevel } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';

// the circle drawn at the aimed point: the visible mesh at that spot with the area's radius as its scale
const ringAt = (scene: THREE.Scene, x: number) => scene.children.filter((m) => m.visible && m.position.x === x && m.position.z === 0);

describe('aim preview on the ground', () => {
  it('Lula Pix and Meteor show their area circle at the aimed point; null hides it', () => {
    const scene = new THREE.Scene();
    const preview = new AimPreview(scene);
    const spells = { ...noSpells(), pix: 1, meteor: 1 };
    for (const s of ['pix', 'meteor'] as const) {
      preview.shape(aimOf(s, spells, noItems(), v(0, 0), v(3, 0)));
      const [ring] = ringAt(scene, 3);
      expect(ring?.scale.x, s).toBeCloseTo(spellLevel(s, 1).radius);
    }
    preview.shape(null);
    expect(ringAt(scene, 3)).toEqual([]);
  });

  it('range ring follows the wizard and hides with radius 0', () => {
    const scene = new THREE.Scene();
    const preview = new AimPreview(scene);
    preview.range(v(1, 2), 7);
    const ring = scene.children.find((m) => m.visible)!;
    expect([ring.position.x, ring.position.z, ring.scale.x]).toEqual([1, 2, 7]);
    preview.range(v(1, 2), 0);
    expect(scene.children.some((m) => m.visible)).toBe(false);
  });
});
