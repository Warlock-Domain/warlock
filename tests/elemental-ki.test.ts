import { describe, expect, it } from 'vitest';
import { elementalBonuses, elementalLevel, type Element } from '../src/shared/elemental-spheres.ts';
import { noSpells, spellLevel } from '../src/shared/spells.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { encodeSnap } from '../src/shared/snapshot.ts';
import { parseServerMessage } from '../src/client/net-message.ts';
import { run, world } from './helpers.ts';

function setup(elements: Element[] = []) {
  const w = world([[0, 0], [2, 0], [8, 0]], { ...noSpells(), heal: 1, shield: 1, drain: 1, grip: 1 }, [], () => .5, false, [0, 0, 1]);
  w.pillars = []; w.runes = []; w.shrinkAt = 1000; w.rules.chests = false; w.rules.runes = false;
  for (const z of w.wizards) { z.hp = 500; z.regen = 0; }
  w.wizards[0].spheres = elements.map(element => ({ element, until: 30 }));
  return w;
}

describe('Ki sphere positive spell effects', () => {
  it('stacks healing by five percentage points, without borrowing the fire damage bonus', () => {
    const level = spellLevel('heal', 1);
    const bonus = elementalBonuses([{ element: 'ki', until: 30 }, { element: 'ki', until: 30 }, { element: 'fire', until: 30 }]);
    expect(elementalLevel(level, bonus).heal).toBeCloseTo(49.5);
    expect(elementalLevel(level, { ...bonus, ki: 0 }).heal).toBe(level.heal);
  });

  it.each([0, 1])('amplifies healing cast on self or an ally using only the caster spheres (target %s)', target => {
    const w = setup(['ki', 'ki']), [caster, ally] = w.wizards;
    ally.spheres = Array.from({ length: 5 }, () => ({ element: 'ki' as const, until: 30 }));
    stepWorld(w, [{ id: caster.id, kind: 'cast', spell: 'heal', at: w.wizards[target].pos }], () => .5);
    expect(w.wizards[target].hp).toBeCloseTo(549.5);
    expect(caster.cd.heal).toBe(20);
  });

  it('does not amplify an incoming heal just because its recipient has ki', () => {
    const w = setup(), [caster, ally] = w.wizards;
    ally.spheres = [{ element: 'ki', until: 30 }];
    stepWorld(w, [{ id: caster.id, kind: 'cast', spell: 'heal', at: ally.pos }], () => .5);
    expect(ally.hp).toBeCloseTo(545);
  });

  it('extends Shield on application, not its cooldown or a negative spell duration', () => {
    const w = setup(['ki', 'ki']), caster = w.wizards[0];
    run(w, .4, [{ id: caster.id, kind: 'cast', spell: 'shield', at: caster.pos }]);
    expect(caster.shieldUntil).toBeCloseTo(spellLevel('shield', 1).duration * 1.1);
    expect(caster.cd.shield).toBe(spellLevel('shield', 1).cd);
    const grip = spellLevel('grip', 1);
    expect(elementalLevel(grip, elementalBonuses(caster.spheres)).duration).toBe(grip.duration);
    caster.spheres = [];
    expect(caster.shieldUntil).toBeCloseTo(spellLevel('shield', 1).duration * 1.1);
  });


  it('captures outgoing Drain healing and ally haste without using recipient ki or fire damage', () => {
    const w = setup(['ki', 'ki', 'fire']), [caster, ally] = w.wizards;
    ally.spheres = Array.from({ length: 5 }, () => ({ element: 'ki' as const, until: 30 }));
    run(w, .2, [{ id: caster.id, kind: 'cast', spell: 'drain', at: ally.pos }]);
    const projectile = w.projectiles.find(p => p.kind === 'drain');
    expect(projectile).toBeDefined();
    expect(projectile!.ki).toBeCloseTo(1.1);
    caster.spheres = [];
    while (ally.hasteUntil === 0 && w.t < 2) stepWorld(w, [], () => .5);
    expect(ally.hp).toBeCloseTo(566);
    expect(ally.hasteUntil - w.t).toBeCloseTo(spellLevel('drain', 1).duration * 1.1 - 1 / 60);
  });
});
