import { describe, expect, it } from 'vitest';
import { botCmds } from '../src/shared/bots.ts';
import { noSpells } from '../src/shared/spells.ts';
import { world } from './helpers.ts';

// enemy Fireball `x` m away (0.7 s at 4.6 m, 0.2 s at 1.5 m); free spells on cooldown and a high roll, so the bot does not dodge on foot (0.3 would: below the Normal 0.55 dodge chance)
const threatened = (spells = noSpells(), x = 4.6) => {
  const w = world([[0, 0], [5, 0]], spells, [], () => .5);
  w.pillars = [];
  w.wizards[0].cd.fireball = w.wizards[0].cd.scourge = 99;
  w.projectiles.push({ id: 1, born: -1, kind: 'fireball', owner: 'p1', caster: 'p1', pos: { x, y: 0 }, vel: { x: -6.47, y: 0 }, level: 1, until: 9, target: null, dmgMult: 1 });
  return w;
};

describe('bots hold ground', () => {
  it('holds ground when the hit is far enough for the 0.5 s windup and no escape spell is ready', () => {
    expect(botCmds(threatened(), 'p0', () => .99)).toEqual([{ id: 'p0', kind: 'brace', on: true }]);
  });
  it('does not start holding when the windup cannot finish before the hit', () => {
    expect(botCmds(threatened(noSpells(), 1.5), 'p0', () => .99).some((c) => c.kind === 'brace')).toBe(false);
  });
  it('keeps holding while the projectile closes in, without a new dodge roll', () => {
    const w = threatened(noSpells(), 1.5);
    w.wizards[0].braceUntil = w.t + .3;
    expect(botCmds(w, 'p0', () => .3)).toEqual([{ id: 'p0', kind: 'brace', on: true }]);
  });
  it('does not hold ground with an escape spell ready', () => {
    const w = threatened({ ...noSpells(), shield: 1 });
    expect(botCmds(w, 'p0', () => .99).some((c) => c.kind === 'brace')).toBe(false);
  });
});
