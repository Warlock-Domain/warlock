import { describe, expect, it } from 'vitest';
import { noSpells } from '../src/shared/spells.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { len, v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

describe('Magnetize projectile redirection', () => {
  it.each(['p0', 'p1'])('redirects the nearest moving projectile owned by %s without changing its owner or speed', owner => {
    const w = world([[-1, 0], [5, 5]], { ...noSpells(), magnetize: 1 }, [], () => .5);
    w.pillars = []; w.rules.chests = false; w.rules.runes = false;
    const near = { id: w.nextId++, kind: 'homing' as const, owner, caster: owner, pos: v(0, 0), vel: v(1, 0), level: 1, until: 5, target: 'p1', dmgMult: 1 };
    const far = { ...near, id: w.nextId++, kind: 'fireball' as const, pos: v(2, 0), vel: v(1, 0), target: null };
    w.projectiles.push(near, far);
    run(w, .25, [{ id: 'p0', kind: 'cast', spell: 'magnetize', at: v(0, 5) }]);
    expect(near.vel.y).toBeGreaterThan(.95); expect(len(near.vel)).toBeCloseTo(1);
    expect(near.owner).toBe(owner); expect(far.vel).toEqual(v(1, 0));
    expect(w.wizards[0].cd.magnetize).toBeGreaterThan(w.t);
    expect(w.projectiles.some(p => p.kind === 'magnetize')).toBe(false);
  });
  it('rejects an empty selection without spending cooldown or cancelling a windup', () => {
    const w = world([[0, 0]], { ...noSpells(), magnetize: 1 }, [], () => .5), z = w.wizards[0];
    z.casting = { spell: 'fireball', at: v(5, 0), fireAt: 2, power: 1 };
    stepWorld(w, [{ id: z.id, kind: 'cast', spell: 'magnetize', at: v(4, 0) }], () => .5);
    expect(z.cd.magnetize).toBe(0); expect(z.casting?.spell).toBe('fireball');
  });
});
