import { describe, expect, it } from 'vitest';
import { noSpells } from '../src/shared/spells.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { encodeSnap, decodeSnap } from '../src/shared/snapshot.ts';
import { RICOCHET_READY_BIT } from '../src/shared/constants.ts';
import { v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

function setup() {
  const w = world([[0, 0], [3, 0], [3, 3], [6, 3]], { ...noSpells(), bouncer: 1, fireball: 1, shield: 1 }, [], () => .5);
  w.pillars = []; w.rules.chests = false; w.rules.runes = false; w.shrinkAt = 1000;
  for (const z of w.wizards) z.regen = 0;
  return w;
}
describe('Ricochet next-projectile buff', () => {
  it('arms a visible buff without firing and preserves it through non-projectile spells', () => {
    const w = setup(), z = w.wizards[0];
    run(w, .2, [{ id: z.id, kind: 'cast', spell: 'bouncer', at: v(3, 0) }]);
    expect(z.ricochetRange).toBeGreaterThan(0); expect(w.projectiles).toHaveLength(0);
    expect(decodeSnap(encodeSnap(w, z.id, 0, []), ['p0', 'p1', 'p2', 'p3']).wizards[0].status & RICOCHET_READY_BIT).toBeTruthy();
    stepWorld(w, [{ id: z.id, kind: 'cast', spell: 'shield', at: z.pos }], () => .5);
    expect(z.ricochetRange).toBeGreaterThan(0);
  });
  it('enchants the next projectile spell and repeats it toward one nearby enemy only', () => {
    const w = setup(), z = w.wizards[0], hits: string[] = [];
    run(w, .2, [{ id: z.id, kind: 'cast', spell: 'bouncer', at: v(3, 0) }]);
    for (let i = 0; i < 180; i++) {
      stepWorld(w, i === 0 ? [{ id: z.id, kind: 'cast', spell: 'fireball', at: v(3, 0) }] : [], () => .5);
      hits.push(...w.events.filter(e => e.k === 'hit' && e.src === 'fireball').map(e => 'id' in e ? e.id : ''));
    }
    expect(z.ricochetRange).toBeUndefined();
    expect(hits).toEqual(['p1', 'p2']);
  });
  it('does not duplicate a projectile that misses every enemy', () => {
    const w = setup(), z = w.wizards[0];
    run(w, .2, [{ id: z.id, kind: 'cast', spell: 'bouncer', at: v(-5, 0) }]);
    run(w, .3, [{ id: z.id, kind: 'cast', spell: 'fireball', at: v(-5, 0) }]);
    expect(z.ricochetRange).toBeUndefined();
    expect(w.projectiles.filter(p => p.kind === 'fireball')).toHaveLength(1);
  });
});
