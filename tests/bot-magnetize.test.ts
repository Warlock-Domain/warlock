import { describe, expect, it } from 'vitest';
import { botCmds } from '../src/shared/bots.ts';
import { noItems } from '../src/shared/items.ts';
import { newWorld } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';

describe('bot Magnetize target selection', () => {
  it('does not choose a moving projectile that the simulation cannot redirect', () => {
    const w = newWorld(['bot', 'enemy'], { bot: { ...noSpells(), magnetize: 1 }, enemy: noSpells() }, { bot: noItems() });
    const bot = w.wizards[0];
    bot.pos = v(0, 0);
    w.wizards[1].pos = v(4, 0);
    w.projectiles.push({ id: 1, kind: 'meteor', owner: 'enemy', caster: 'enemy', pos: v(2, 0), vel: v(-1, 0), level: 1, until: 9, target: null, dmgMult: 1 });

    const commands = botCmds(w, bot.id, () => 0.5);

    expect(commands).not.toContainEqual(expect.objectContaining({ kind: 'cast', spell: 'magnetize' }));
  });
});
