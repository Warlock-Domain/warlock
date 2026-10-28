import { describe, expect, it } from 'vitest';
import { elementalBonuses, elementalLevel, type Element } from '../src/shared/elemental-spheres.ts';
import { noItems } from '../src/shared/items.ts';
import { noSpells, spellLevel } from '../src/shared/spells.ts';
import { projectileLevel, stepWorld } from '../src/shared/sim.ts';
import { encodeSnap, decodeSnap } from '../src/shared/snapshot.ts';
import { parseServerMessage } from '../src/client/net-message.ts';
import { aimOf, reachOf } from '../src/client/reach.ts';
import { run, world } from './helpers.ts';

function setup(elements: Element[]) {
  const w = world([[0, 0], [9, 0]], { ...noSpells(), fireball: 1, meteor: 1, boomerang: 1, heal: 1 }, [], () => .5);
  w.pillars = []; w.rules.runes = false; w.rules.chests = false; w.shrinkAt = 1000;
  w.wizards[0].spheres = elements.map(element => ({ element, until: 30 }));
  return w;
}
describe('Elemental modifiers agree across simulation, snapshots and aiming', () => {
  it('captures Shield radius even after Earth expires and scales Drain/Snowball previews', () => {
    const w = setup(['earth', 'earth', 'earth', 'earth', 'earth']), caster = w.wizards[0];
    caster.spells.shield = 1;
    stepWorld(w, [{ id: caster.id, kind: 'cast', spell: 'shield', at: caster.pos }], () => .5);
    run(w, .6); caster.spheres = [];
    const snap = encodeSnap(w, caster.id, 0, []);
    expect(decodeSnap(snap, ['p0', 'p1']).wizards[0].shieldR).toBeCloseTo(caster.shieldR, 2);
    expect(parseServerMessage(snap)).not.toBeNull();
    expect(parseServerMessage({ ...snap, sr: [-1, 0] })).toBeNull();
    const bonus = elementalBonuses([{ element: 'earth', left: 30 }]);
    for (const spell of ['drain', 'snowball'] as const) {
      caster.spells[spell] = 1;
      const base = aimOf(spell, caster.spells, noItems(), caster.pos, { x: 9, y: 0 });
      const boosted = aimOf(spell, caster.spells, noItems(), caster.pos, { x: 9, y: 0 }, 1, bonus);
      expect(boosted.half).toBeCloseTo(base.half);
    }
  });
  it('stacks only the matching element without a generic per-sphere damage bonus', () => {
    const base = spellLevel('fireball', 1);
    const bonus = elementalBonuses(['fire', 'fire', 'water', 'earth', 'ki'].map(element => ({ element: element as Element, left: 30 })));
    const result = elementalLevel(base, bonus);
    expect(result.dmg).toBeCloseTo(base.dmg * 1.1 * .97);
    expect(result.knock).toBeCloseTo(base.knock * .94);
    expect(result.speed).toBeCloseTo(base.speed * 1.05);
  });
  it('encodes the actual Meteor area and previews the water-adjusted range', () => {
    const w = setup(['earth', 'water']), z = w.wizards[0];
    run(w, .12, [{ id: z.id, kind: 'cast', spell: 'meteor', at: { x: 4, y: 0 } }]);
    const p = w.projectiles.find(p => p.kind === 'meteor')!;
    const bonus = elementalBonuses(z.spheres, w.t);
    const snap = encodeSnap(w, z.id, 0, []);
    expect(parseServerMessage(snap)).not.toBeNull();
    expect(decodeSnap(snap, ['p0', 'p1']).projectiles[0].vel.x).toBeCloseTo(projectileLevel(p).radius, 2);
    const aim = aimOf('meteor', z.spells, noItems(), z.pos, { x: 99, y: 0 }, 1, bonus);
    expect(aim.blastR).toBeCloseTo(projectileLevel(p).radius);
    expect(aim.blastAt?.x).toBeCloseTo(reachOf('meteor', z.spells, noItems(), 1, bonus));
    expect(reachOf('heal', z.spells, noItems(), 1, bonus)).toBeCloseTo(10.5 * .97);
  });
  it('earth no longer increases projectile size; snapshot validation still rejects invalid sizes', () => {
    const w = setup(['earth', 'earth']), z = w.wizards[0];
    run(w, .12, [{ id: z.id, kind: 'cast', spell: 'fireball', at: { x: 9, y: 0 } }]);
    z.spheres = [];
    const p = w.projectiles.find(p => p.kind === 'fireball')!;
    const snap = encodeSnap(w, z.id, 0, []);
    expect(p.size).toBe(1);
    expect(snap.ps).toBeUndefined();
    expect(decodeSnap(snap, ['p0', 'p1']).projectiles[0].size ?? 1).toBe(1);
    for (const ps of [[p.id, 10], [p.id, 1.1, p.id, 1.1], [99999, 1.1], [p.id]]) expect(parseServerMessage({ ...snap, ps })).toBeNull();
  });
  it('lengthens cooldowns by three percent per void sphere, with Incapacitate taking precedence', () => {
    const w = setup(['void', 'void']), z = w.wizards[0]; z.cd.fireball = 20;
    run(w, 1);
    expect(z.cd.fireball - w.t).toBeCloseTo(20 - 1 / 1.06, 2);
    z.incapacitateUntil = w.t + 1;
    const remaining = z.cd.fireball - w.t; run(w, .5);
    expect(z.cd.fireball - w.t).toBeCloseTo(remaining, 2);
  });
});
