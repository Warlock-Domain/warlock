import { describe, expect, it } from 'vitest';
import { HP_MAX } from '../src/shared/constants.ts';
import type { World } from '../src/shared/sim.ts';
import { noSpells, type SpellId } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

// p0 casts; p1 is its ally (team 0) right in the way; p2 is an enemy (team 1) just behind
const ALL: Record<SpellId, number> = { ...noSpells(), lightning: 1, meteor: 1, drain: 1, swap: 1, rush: 1 };
const line = (): World => world([[0, 0], [2, 0], [4, 0]], ALL, [], () => 0.5, false, [0, 0, 1]);
const ally = 1;

describe('allies: spells on an ally only push, in Teams and in the Campaign (Fernando, 19/10 and 24/10)', () => {
  it('the fireball stops on the ally and pushes it, without damage', () => {
    const w = line();
    run(w, 2, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(6, 0) }]);
    expect(w.wizards[ally].hp).toBe(HP_MAX);
    expect(w.wizards[ally].pos.x).toBeGreaterThan(2.5);
  });

  it('allies walking into each other do not overlap', () => {
    const w = world([[0, 0], [1, 0]], noSpells(), [], () => 0.5, false, [0, 0]);
    run(w, 2, [{ id: 'p0', kind: 'move', to: v(1, 0) }]);
    expect(Math.abs(w.wizards[1].pos.x - w.wizards[0].pos.x)).toBeGreaterThan(0.6);
  });
});
