import { describe, expect, it } from 'vitest';
import { DRAIN, noSpells } from '../src/shared/spells.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

describe('Mandinga speed on direct impact', () => {
  it.each([true, false])('applies allied haste or enemy slow: allied=%s', allied => {
    const w = world([[0, 0], [3, 0]], { ...noSpells(), drain: 1 }, [], () => .5, false, [0, allied ? 0 : 1]);
    w.pillars = []; w.rules.chests = false; w.rules.runes = false;
    const z = w.wizards[1]; z.hp = 500; z.regen = 0;
    w.projectiles.push({ id: w.nextId++, kind: 'drain', owner: 'p0', caster: 'p0', pos: v(2, 0), vel: v(10, 0), level: 1, until: 4, target: null, dmgMult: 1 });
    for (let i = 0; i < 20 && z.hasteUntil === 0 && z.slowUntil === 0; i++) stepWorld(w, [], () => .5);
    if (allied) { expect(z.haste).toBe(DRAIN.haste); expect(z.hasteUntil).toBeGreaterThan(w.t); expect(z.hp).toBeGreaterThan(500); }
    else { expect(z.slow).toBe(DRAIN.slow); expect(z.slowUntil).toBeGreaterThan(w.t); expect(z.hp).toBeLessThan(500); }
  });
});
