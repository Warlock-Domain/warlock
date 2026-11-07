import { describe, expect, it } from 'vitest';
import { elementalBonuses, elementalLevel } from '../src/shared/elemental-spheres.ts';
import { noSpells, spellLevel } from '../src/shared/spells.ts';
import { noItems } from '../src/shared/items.ts';
import { damageFactor, stepWorld } from '../src/shared/sim.ts';
import { reachOf } from '../src/client/reach.ts';
import { v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

function setup(count: number) {
  const w = world([[0, 0], [4, 0]], { ...noSpells(), fireball: 1, rush: 1 }, [], () => .5);
  w.pillars = []; w.runes = []; w.shrinkAt = 1000;
  w.wizards.forEach(z => z.regen = 0);
  w.wizards[0].spheres = Array.from({ length: count }, () => ({ element: 'void' as const, until: 30 }));
  return w;
}
describe('black spheres trade longer cooldowns for defenses', () => {
  it.each([1, 2, 5])('%s spheres reduce incoming damage and impulse by five percentage points each', count => {
    const base = setup(0), guarded = setup(count);
    for (const w of [base, guarded]) run(w, .7, [{ id: 'p1', kind: 'cast', spell: 'fireball', at: v(0, 0) }]);
    expect(1000 - guarded.wizards[0].hp).toBeCloseTo((1000 - base.wizards[0].hp) * (1 - .05 * count));
    expect(guarded.wizards[0].vel.x / base.wizards[0].vel.x).toBeCloseTo(1 - .05 * count);
  });
  it('leaves range unchanged in simulation and previews, preserving water bonuses', () => {
    const w = setup(2), z = w.wizards[0], bonus = elementalBonuses(z.spheres, w.t);
    bonus.water = .05;
    expect(elementalLevel(spellLevel('heal', 1), bonus).range).toBeCloseTo(10 * 1.05);
    expect(reachOf('heal', { ...z.spells, heal: 1 }, noItems(), 1, bonus)).toBeCloseTo(10 * 1.05);
    const base = setup(0);
    for (const a of [w, base]) stepWorld(a, [{ id: 'p0', kind: 'cast', spell: 'rush', at: v(10, 0) }], () => .5);
    expect(w.wizards[0].dashVel.x / base.wizards[0].dashVel.x).toBeCloseTo(1);
  });
  it('reduces lava damage and composes with Closed Body without turning immune', () => {
    const a = setup(0), b = setup(2);
    for (const w of [a, b]) { w.wizards[0].pos = v(100, 0); run(w, .1); }
    expect(1000 - b.wizards[0].hp).toBeCloseTo((1000 - a.wizards[0].hp) * .9);
    const w = setup(2), z = w.wizards[0]; z.braceUntil = 10; z.braceReadyAt = 0; z.closedBodyUntil = 10;
    expect(damageFactor(w, z)).toBeCloseTo(.09);
    z.spheres!.forEach(s => s.until = 0);
    expect(damageFactor(w, z)).toBeCloseTo(.1);
  });
  it('loses defense immediately when the black sphere is thrown', () => {
    const w = setup(1), z = w.wizards[0];
    expect(damageFactor(w, z)).toBeCloseTo(.95);
    run(w, .5, [{ id: z.id, kind: 'basic', at: v(6, 0) }]);
    expect(z.spheres).toHaveLength(0); expect(damageFactor(w, z)).toBe(1);
  });
});
