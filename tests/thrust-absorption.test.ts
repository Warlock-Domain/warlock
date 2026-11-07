import { describe, expect, it } from 'vitest';
import { stepWorld } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

describe('Thrust damage-based stun', () => {
  it('ignores continuous pulls during the dash while still accumulating damage', () => {
    for (const dash of [false, true]) {
      const w = world([[0, 0], [10, 0]], noSpells(), [], () => .5);
      w.pillars = []; w.rules.runes = false; w.rules.chests = false;
      const z = w.wizards[0];
      if (dash) z.thrustUntil = 1;
      w.projectiles.push({ id: w.nextId++, kind: 'gravity', owner: 'p1', caster: 'p1', pos: v(0, 1), vel: v(0, 0), level: 1, until: 5, target: null, dmgMult: 1 });
      stepWorld(w, [], () => .5);
      if (dash) {
        expect(z.pos).toEqual(v(0, 0));
        expect(z.thrustDamage).toBeGreaterThan(0);
      } else expect(z.pos.y).toBeGreaterThan(0);
    }
  });
  for (const incoming of [false, true]) it(`hits with incoming damage=${incoming}`, () => {
    const w = world([[0, 0], [4, 0]], { ...noSpells(), thrust: 1 }, [], () => .5);
    w.wizards[1].regen = 0;
    stepWorld(w, [
      { id: 'p0', kind: 'cast', spell: 'thrust', at: v(4, 0) },
      ...(incoming ? [{ id: 'p1', kind: 'cast' as const, spell: 'fireball' as const, at: v(0, 0) }] : []),
    ], () => .5);
    let landed = false;
    for (let i = 0; i < 90 && !landed; i++) {
      stepWorld(w, [], () => .5);
      landed = w.events.some(e => e.k === 'land' && e.src === 'thrust');
    }
    expect(landed).toBe(true);
    expect(w.wizards[1].hp).toBeLessThanOrEqual(950);
    if (incoming) {
      expect(w.wizards[0].thrustDamage).toBeGreaterThan(0);
      expect(w.wizards[1].stunLeft).toBeCloseTo(w.wizards[0].thrustDamage! / 100, 1);
    } else expect(w.wizards[1].stunLeft ?? 0).toBe(0);
  });

  it('with Anima Nexus stores only the damage each body really lost', () => {
    const w = world([[-3, 0], [0, 0], [2.5, 0]], { ...noSpells(), nexus: 1, fireball: 1 }, [], () => .5, false, [0, 0, 1]);
    w.pillars = []; w.runes = []; w.rules.runes = false; w.rules.chests = false; w.shrinkAt = 1000;
    for (const z of w.wizards) z.regen = 0;
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'nexus', at: w.wizards[1].pos }], () => .5);
    const [protector, ally] = w.wizards;
    protector.thrustUntil = ally.thrustUntil = w.t + 5;
    stepWorld(w, [{ id: 'p2', kind: 'cast', spell: 'fireball', at: ally.pos }], () => .5);
    for (let i = 0; i < 120 && protector.hp === 1000; i++) stepWorld(w, [], () => .5);
    expect(ally.hp).toBe(1000);
    expect(ally.thrustDamage ?? 0).toBe(0);
    expect(protector.thrustDamage).toBeCloseTo(1000 - protector.hp);
    // burn ground goes through the environmental path: same rule
    const before = protector.thrustDamage!;
    w.zones.push({ pos: ally.pos, r: 1, kind: 'burn', until: w.t + 1 });
    for (let i = 0; i < 10; i++) stepWorld(w, [], () => .5);
    expect(ally.thrustDamage ?? 0).toBe(0);
    expect(protector.thrustDamage).toBeGreaterThan(before);
  });

  it('keeps the channeled power in the dash damage', () => {
    const damage = (charged: boolean) => {
      const w = world([[0, 0], [4, 0]], { ...noSpells(), thrust: 1, channel: 1 }, [], () => .5);
      w.pillars = []; w.wizards[1].regen = 0;
      if (charged) w.wizards[0].channel = { spell: 'thrust', since: w.t - 2 };
      stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'thrust', at: v(4, 0) }], () => .5);
      for (let i = 0; i < 90 && w.wizards[1].hp === 1000; i++) stepWorld(w, [], () => .5);
      return 1000 - w.wizards[1].hp;
    };
    expect(damage(true)).toBeGreaterThan(damage(false));
  });

  it('does not damage allies in its path', () => {
    const w = world([[0, 0], [2, 0], [4, 0]], { ...noSpells(), thrust: 1 }, [], () => .5, false, [0, 0, 1]);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'thrust', at: v(4, 0) }], () => .5);
    for (let i = 0; i < 60; i++) stepWorld(w, [], () => .5);
    expect(w.wizards[1].hp).toBe(1000);

  });
});
