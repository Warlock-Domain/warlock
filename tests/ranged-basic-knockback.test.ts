import { expect, it } from 'vitest';
import { BASIC_ATTACK } from '../src/shared/constants.ts';
import { noSpells } from '../src/shared/spells.ts';
import { run, world } from './helpers.ts';

it('ranged basic attacks deal damage without an impulse; melee keeps its push', () => {
  const w = world([[0, 0], [4, 0]], noSpells());
  w.pillars = [];
  w.wizards[1].regen = 0;
  run(w, .45, [{ id: 'p0', kind: 'basic', at: { x: 4, y: 0 } }]);
  const p = w.projectiles.find((p) => p.kind === 'basic')!;
  expect(p.stats?.knock).toBe(0);
  run(w, .6);
  expect(w.wizards[1].hp).toBe(1000 - BASIC_ATTACK.dmg);
  expect(w.wizards[1].pos.x).toBe(4);
  expect(w.wizards[1].vel).toEqual({ x: 0, y: 0 });
  const melee = world([[0, 0], [1, 0]], noSpells());
  melee.pillars = [];
  melee.wizards[1].regen = 0;
  run(melee, .45, [{ id: 'p0', kind: 'basic', at: { x: 1, y: 0 } }]);
  expect(melee.wizards[1].hp).toBe(1000 - BASIC_ATTACK.dmg);
  expect(melee.wizards[1].vel.x).toBeGreaterThan(0);
});
