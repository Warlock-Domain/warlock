import { expect, it } from 'vitest';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

it.each([0, 1])('Swap exchanges positions with a player on team %i without dealing damage', team => {
  const w = world([[0, 0], [3, 0]], { ...noSpells(), swap: 1 }, [], () => .5, false, [0, team]);
  run(w, .5, [{ id: 'p0', kind: 'cast', spell: 'swap', at: v(3, 0) }]);
  expect(w.wizards[0].pos.x).toBeGreaterThan(2);
  expect(w.wizards[1].pos.x).toBeLessThan(1);
  expect(w.wizards.map(z => z.hp)).toEqual([1000, 1000]);
});
