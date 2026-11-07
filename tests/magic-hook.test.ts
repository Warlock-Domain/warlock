import { expect, it } from 'vitest';
import { stepWorld } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

it('Magic Hook heals an ally by the same tick amount it damages an enemy', () => {
  const tick = (team: number) => {
    const w = world([[0, 0], [5, 0]], { ...noSpells(), link: 1 }, [], () => .5, false, [0, team]);
    w.wizards[1].hp = 500; w.wizards[1].regen = 0;
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'link', at: v(5, 0) }], () => .5);
    for (let i = 0; i < 90; i++) stepWorld(w, [], () => .5);
    return w.wizards[1].hp;
  };
  const ally = tick(0), enemy = tick(1);
  expect(ally).toBeGreaterThan(500);
  expect(enemy).toBeLessThan(500);
  expect(ally - 500).toBeCloseTo(500 - enemy);
});
