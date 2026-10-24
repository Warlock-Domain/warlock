import { describe, expect, it } from 'vitest';
import { botCmds } from '../src/shared/bots.ts';
import { noSpells } from '../src/shared/spells.ts';
import { world } from './helpers.ts';

// enemy Fireball 0.2 s away; free spells on cooldown and a high roll, so the bot does not dodge on foot
const threatened = (spells = noSpells()) => {
  const w = world([[0, 0], [5, 0]], spells, [], () => .5);
  w.pillars = [];
  w.wizards[0].cd.fireball = w.wizards[0].cd.scourge = 99;
  w.projectiles.push({ id: 1, born: -1, kind: 'fireball', owner: 'p1', caster: 'p1', pos: { x: 1.5, y: 0 }, vel: { x: -6.47, y: 0 }, level: 1, until: 9, target: null, dmgMult: 1 });
  return w;
};

describe('bots hold ground', () => {
  it('holds ground when a projectile hits within 0.6 s and no escape spell is ready', () => {
    expect(botCmds(threatened(), 'p0', () => .99)).toEqual([{ id: 'p0', kind: 'brace', on: true }]);
  });
  it('does not hold ground with an escape spell ready', () => {
    const w = threatened({ ...noSpells(), shield: 1 });
    expect(botCmds(w, 'p0', () => .99).some((c) => c.kind === 'brace')).toBe(false);
  });
});
