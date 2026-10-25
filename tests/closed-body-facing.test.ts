import { describe, expect, it } from 'vitest';
import { DT } from '../src/shared/constants.ts';
import { noSpells } from '../src/shared/spells.ts';
import { bracingActive, closedBodyActive, stepWorld } from '../src/shared/sim.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { world } from './helpers.ts';

describe('Closed Body facing', () => {
  it.each([0, Math.PI / 2, -Math.PI / 3])('preserves stance facing %s despite an off-axis cursor', facing => {
    const w = world([[0, 0], [3, 0]], { ...noSpells(), closedbody: 1 });
    w.pillars = []; w.runes = []; w.isles = []; w.arenaR = 30; w.shrinkAt = Infinity;
    const z = w.wizards[0]; z.facing = facing; z.stunLeft = 0;
    const hold = () => stepWorld(w, [{ id: z.id, kind: 'brace', on: true }], () => .5);
    for (let i = 0; i < Math.ceil(.6 / DT); i++) hold();
    expect(bracingActive(w, z)).toBe(true);
    stepWorld(w, [{ id: z.id, kind: 'cast', spell: 'closedbody', at: { x: -8, y: 7 } }], () => .5);
    expect(closedBodyActive(w, z)).toBe(true);
    expect(z.facing).toBe(facing);
    expect(decodeSnap(encodeSnap(w, z.id, 0, []), ['p0', 'p1']).wizards[0].facing).toBeCloseTo(facing, 2);
    for (let i = 0; i < Math.ceil(.3 / DT); i++) hold();
    expect(z.facing).toBe(facing);
  });
});
