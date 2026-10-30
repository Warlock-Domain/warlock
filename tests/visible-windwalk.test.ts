import { describe, expect, it } from 'vitest';
import { noSpells, SPELLS } from '../src/shared/spells.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { world, run } from './helpers.ts';

describe('Visible Windwalk', () => {
  it('lasts 3.6 seconds at every level and expires without contact', () => {
    for (const level of SPELLS.windwalk.levels) expect(level.duration).toBe(3.6);
    const w = world([[0, 0], [10, 0]], { ...noSpells(), windwalk: 1 }, [], () => .5);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'windwalk', at: { x: 0, y: 0 } }]);
    run(w, .1);
    expect(w.wizards[0].windUntil - w.t).toBeGreaterThan(3.4);
    run(w, 3.6);
    expect(w.wizards[0].windUntil).toBeLessThanOrEqual(w.t);
  });

  it('allows Sniper to target a running enemy while Illusion remains hidden', () => {
    for (const hidden of [false, true]) {
      const w = world([[0, 0], [10, 0]], { ...noSpells(), sniper: 1 }, [], () => .5);
      const target = w.wizards[1];
      target.windUntil = 20;
      if (hidden) target.veilUntil = 20;
      stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'sniper', at: { ...target.pos } }]);
      expect(!!w.wizards[0].casting).toBe(!hidden);
      const seen = decodeSnap(encodeSnap(w, 'p0', 0, []), ['p0', 'p1']).wizards[1];
      expect(!!(seen.status & 2048)).toBe(hidden);
    }
  });
});
