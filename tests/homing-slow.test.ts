import { describe, expect, it } from 'vitest';
import { noSpells } from '../src/shared/spells.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

describe('Homing Missile slow', () => {
  it.each(['enemy', 'ally', 'shield', 'invulnerable'])('handles %s impacts without bypassing defenses', mode => {
    const w = world([[0, 0], [3, 0]], { ...noSpells(), homing: 1 }, [], () => .5, false, mode === 'ally' ? [0, 0] : [0, 1]);
    w.pillars = []; w.rules.chests = false; w.rules.runes = false;
    const target = w.wizards[1]; target.regen = 0;
    if (mode === 'shield') target.shieldUntil = 10;
    if (mode === 'invulnerable') target.invulnUntil = 10;
    // A direct projectile also exercises friendly contact, which homing acquisition excludes.
    w.projectiles.push({ id: w.nextId++, kind: 'homing', owner: 'p0', caster: 'p0', pos: v(2, 0), vel: v(10, 0), level: 1, until: 4, target: mode === 'ally' ? null : 'p1', dmgMult: 1 });
    for (let i = 0; i < 30 && target.slowUntil === 0; i++) stepWorld(w, [], () => .5);
    if (mode === 'enemy') {
      expect(target.slow).toBeCloseTo(target.baseSpeed * .25);
      expect(target.slowUntil - w.t).toBeGreaterThan(1.9);
      expect(target.hp).toBeLessThan(target.hpMax);
    } else expect(target.slowUntil).toBe(0);
  });
});
