import { describe, expect, it } from 'vitest';
import { assignTauntSlot, radialHold, radialIndex, tauntWheelSlots } from '../src/client/taunt-wheel.ts';
import { TAUNTS } from '../src/shared/taunts.ts';

describe('radial picker', () => {
  it('holds the key and confirms only once on release, ignoring repeats and other keys', () => {
    const hold = radialHold();
    expect(hold.press('KeyY')).toBe(true);
    expect(hold.press('KeyY')).toBe(false);
    expect(hold.active()).toBe(true);
    expect(hold.release('KeyQ')).toBe(false);
    expect(hold.active()).toBe(true);
    expect(hold.release('KeyY')).toBe(true);
    expect(hold.active()).toBe(false);
    expect(hold.release('KeyY')).toBe(false);
  });
  it('cancel blocks sending on release and respects a remapped shortcut', () => {
    const hold = radialHold();
    hold.press('KeyP');
    expect(hold.release('KeyY')).toBe(false);
    hold.cancel();
    expect(hold.release('KeyP')).toBe(false);
    expect(hold.press('KeyP')).toBe(true);
    expect(hold.release('KeyP')).toBe(true);
  });
  it('keeps eight slots and lets any catalog taunt fill them', () => {
    const slots = tauntWheelSlots(null, TAUNTS.length);
    expect(slots).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(assignTauntSlot(slots, 0, 7)).toEqual([7, 1, 2, 3, 4, 5, 6, 0]);
    const replaced = assignTauntSlot(slots, 7, 14, TAUNTS.length);
    expect(replaced).toEqual([0, 1, 2, 3, 4, 5, 6, 14]);
    expect(tauntWheelSlots(replaced, TAUNTS.length)).toEqual(replaced);
    expect(assignTauntSlot(slots, 14, 0)).toBe(slots);
    expect(assignTauntSlot(slots, 99, 2)).toBe(slots);
    expect(assignTauntSlot(slots, 1, 100, TAUNTS.length)).toBe(slots);
  });
  it('migrates the old fifteen-taunt wheel keeping its first eight picks', () => {
    const saved = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
    expect(tauntWheelSlots(saved, TAUNTS.length)).toEqual(saved.slice(0, 8));
  });
  it('recovers an invalid or smaller-catalog preference without repeats or missing indices', () => {
    const slots = tauntWheelSlots([9, 9, -1, '2', 80, 3], TAUNTS.length);
    expect(slots.slice(0, 3)).toEqual([9, 3, 0]);
    expect(slots).toHaveLength(8);
    expect(new Set(slots).size).toBe(8);
    expect(tauntWheelSlots('x', 3)).toEqual([0, 1, 2]);
    expect(tauntWheelSlots(null, 0)).toEqual([]);
    expect(tauntWheelSlots(null, 20)).toHaveLength(8);
  });
  it('starts at the top and reaches every slot clockwise', () => {
    for (const count of [8, 10, TAUNTS.length]) {
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2;
        expect(radialIndex(Math.sin(angle), -Math.cos(angle), count)).toBe(i);
      }
    }
  });
  it('keeps the centre neutral and rejects an empty catalog', () => {
    expect(radialIndex(0, 0, 10)).toBeNull();
    expect(radialIndex(0.1, -0.1, 10)).toBeNull();
    expect(radialIndex(1, 0, 0)).toBeNull();
  });
  it('wraps to the first sector across north without negative indices', () => {
    expect(radialIndex(-0.01, -1, 10)).toBe(0);
    expect(radialIndex(0.01, -1, 10)).toBe(0);
    expect(radialIndex(-1, 0, 8)).toBe(6);
    expect(radialIndex(0, 1, 8)).toBe(4);
  });
});
