import { expect, it } from 'vitest';
import { stepWorld } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

it.each([false, true])('Mandinga heals the nearest ally, including the caster: other ally=%s', other => {
  const w = world([[0, 0], [4, 0], [4, 2]], { ...noSpells(), drain: 1 }, [{}, { warden: 1 }], () => .5, false, [0, 1, other ? 0 : 1]);
  for (const z of w.wizards) z.regen = 0;
  w.wizards[0].hp = w.wizards[2].hp = 500;
  stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'drain', at: v(4, 0) }], () => .5);
  let recipient = '', payload = 0;
  for (let i = 0; i < 180; i++) {
    stepWorld(w, [], () => .5);
    const returning = w.projectiles.find(p => p.kind === 'drain' && p.back);
    if (returning) { recipient = returning.target!; payload = returning.healAmount!; }
  }
  const dealt = 1000 - w.wizards[1].hp;
  expect(dealt).toBe(56);
  expect(recipient).toBe(other ? 'p2' : 'p0');
  expect(payload).toBe(dealt);
  expect(w.wizards[other ? 2 : 0].hp).toBe(500 + dealt);
  expect(w.wizards[other ? 0 : 2].hp).toBe(500);
});
