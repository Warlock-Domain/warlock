import { describe, expect, it } from 'vitest';
import { noSpells } from '../src/shared/spells.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

function setup() {
  const w = world([[0, 0]], { ...noSpells(), elemental: 1 }, [], () => .5);
  w.pillars = []; w.rules.runes = false; w.rules.chests = false; w.shrinkAt = 1000;
  return w;
}
describe('Passive Elemental Spheres', () => {
  it('summons without commands and uses the existing five second cooldown', () => {
    const w = setup(), z = w.wizards[0];
    stepWorld(w, [], () => .1);
    expect(z.spheres).toHaveLength(1); expect(z.cd.elemental).toBeCloseTo(5);
    run(w, 4.9); expect(z.spheres).toHaveLength(1);
    run(w, .2); expect(z.spheres).toHaveLength(2);
  });
  it('preserves movement, a spell windup and concealment, ignoring manual activation', () => {
    const w = setup(), z = w.wizards[0];
    z.target = v(2, 0); z.windUntil = z.veilUntil = 10;
    z.casting = { spell: 'fireball', at: v(5, 0), fireAt: 4, power: 1 };
    stepWorld(w, [{ id: z.id, kind: 'cast', spell: 'elemental', at: v(0, 0) }], () => .1);
    expect(z.spheres).toHaveLength(1); expect(z.target).toEqual(v(2, 0));
    expect(z.casting?.spell).toBe('fireball'); expect(z.windUntil).toBe(10); expect(z.veilUntil).toBe(10);
    z.casting = null;
    stepWorld(w, [{ id: z.id, kind: 'channel', spell: 'elemental' }, { id: z.id, kind: 'move', to: v(3, 0) }], () => .1);
    expect(z.channel).toBeUndefined(); expect(z.target).toEqual(v(3, 0));
  });
  it('does not summon while dead, suspended or already transcended', () => {
    for (const state of ['dead', 'suspended', 'transcended']) {
      const w = setup(), z = w.wizards[0];
      if (state === 'dead') z.alive = false;
      if (state === 'suspended') z.geyserLeft = 1;
      if (state === 'transcended') z.transcendence = { element: 'ki', saved: 5, complete: true };
      let draws = 0; stepWorld(w, [], () => { draws++; return .1; });
      expect(z.spheres?.length ?? 0).toBe(0); expect(draws).toBe(0);
    }
  });
  it('keeps cooldown penalties and does not reroll while full', () => {
    const w = setup(), z = w.wizards[0];
    stepWorld(w, [], () => .99);
    expect(z.cd.elemental).toBeGreaterThan(5);
    z.spheres = Array.from({ length: 5 }, () => ({ element: 'fire' as const, until: 30 }));
    z.cd.elemental = w.t; let draws = 0;
    stepWorld(w, [], () => { draws++; return .1; });
    expect(draws).toBe(0); expect(z.cd.elemental).toBeLessThan(w.t);
  });
});
