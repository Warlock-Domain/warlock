import { describe, expect, it } from 'vitest';
import { stepWorld } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

describe('Electric Arc jump timing', () => {
  it('waits 0.25 seconds between consecutive targets while preserving damage decay', () => {
    const w = world([[0, 0], [3, 0], [3, 2], [3, 4]], { ...noSpells(), lightning: 1 }, [], () => .5);
    for (const z of w.wizards) { z.regen = 0; z.kbResist = 1; }
    const hits: { time: number; damage: number; id: string }[] = [];
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(3, 0) }], () => .5);
    for (let i = 0; i < 80; i++) {
      stepWorld(w, [], () => .5);
      for (const e of w.events) if (e.k === 'hit' && e.src === 'lightning') hits.push({ time: w.t, damage: e.dmg, id: e.id });
    }
    expect(hits.map(h => h.id)).toEqual(['p1', 'p2', 'p3']);
    expect(hits[1].time - hits[0].time).toBeCloseTo(.25, 5);
    expect(hits[2].time - hits[1].time).toBeCloseTo(.25, 5);
    expect(hits[1].damage).toBe(Math.round(hits[0].damage * .5));
    expect(hits[2].damage).toBe(Math.round(hits[0].damage * .25));
  });

  it('does not hit a target that dies before its scheduled jump', () => {
    const w = world([[0, 0], [3, 0], [3, 2]], { ...noSpells(), lightning: 1 }, [], () => .5);
    for (const z of w.wizards) z.kbResist = 1;
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(3, 0) }], () => .5);
    for (let i = 0; i < 12; i++) stepWorld(w, [], () => .5);
    expect(w.lightningHops?.length).toBe(1);
    w.wizards[2].alive = false;
    for (let i = 0; i < 30; i++) stepWorld(w, [], () => .5);
    expect(w.lightningHops).toHaveLength(0);
    expect(w.wizards[2].hp).toBe(1000);
  });
});
