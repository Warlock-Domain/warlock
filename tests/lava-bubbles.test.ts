import { describe, expect, it } from 'vitest';
import { createLavaBubbles } from '../src/client/lava-bubbles.ts';

describe('Sparse lava bubbles', () => {
  it('rejects a sampled point that is no longer lava', () => {
    const fx = createLavaBubbles(() => ({ x: 4, y: 0 }), () => false, () => 0.5);
    try { fx.update(0, true, false, 1); expect(fx.root.children.some(n => n.visible)).toBe(false); }
    finally { fx.dispose(); }
  });
  it('hides an active bubble when new ground or an island covers its location', () => {
    let allowed = true;
    const fx = createLavaBubbles(() => ({ x: 10, y: 0 }), () => allowed, () => 0.5);
    try {
      fx.update(0, true, false, 1); fx.update(0.7, true, false, 1);
      expect(fx.root.children.some(n => n.visible)).toBe(true);
      allowed = false; fx.update(0.8, true, false, 1);
      expect(fx.root.children.some(n => n.visible)).toBe(false);
    } finally { fx.dispose(); }
  });
  it('clears bubbles in lite mode and outside the arena scene', () => {
    const fx = createLavaBubbles(() => ({ x: 10, y: 0 }), () => true, () => 0.5);
    try {
      fx.update(0, true, false, 1); fx.update(0.7, true, false, 1);
      fx.update(0.8, true, true, 1); expect(fx.root.visible).toBe(false);
      expect(fx.root.children.some(n => n.visible)).toBe(false);
      fx.update(2, false, false, 1); expect(fx.root.visible).toBe(false);
    } finally { fx.dispose(); }
  });
  it('reuses a bounded pool through repeated growth and burst cycles', () => {
    const fx = createLavaBubbles(() => ({ x: 10, y: 0 }), () => true, () => 0.5);
    try {
      const nodes = [...fx.root.children];
      for (let t = 0; t < 60; t += 0.1) fx.update(t, true, false, 1);
      expect(fx.root.children).toEqual(nodes);
      expect(fx.root.children.length).toBe(3);
      fx.update(61, false, false, 1); expect(fx.root.children.some(n => n.visible)).toBe(false);
    } finally { fx.dispose(); }
  });
});
