import { expect, it } from 'vitest';
import { DRAIN, noSpells } from '../src/shared/spells.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { len, v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

it('passes through an allied shield, slows an enemy, then heals and hastes the ally on arrival at double speed', () => {
  const w = world([[0, 0], [2, 0], [4, 0]], { ...noSpells(), drain: 1 }, [], () => .5, false, [0, 0, 1]);
  w.pillars = []; w.rules.chests = w.rules.runes = false;
  const [, ally, enemy] = w.wizards;
  for (const z of w.wizards) { z.hp = 500; z.regen = 0; }
  ally.shieldUntil = 5;
  stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'drain', at: v(4, 0) }], () => .5);
  let incoming = 0, checkedSpeed = false, arrived = false;
  for (let i = 0; i < 180; i++) {
    const outgoing = w.projectiles.find(p => p.kind === 'drain' && !p.back);
    if (outgoing) incoming = len(outgoing.vel);
    stepWorld(w, [], () => .5);
    const returning = w.projectiles.find(p => p.kind === 'drain' && p.back);
    if (returning) { expect(len(returning.vel)).toBeCloseTo(incoming * 2); checkedSpeed = true; }
    const event = w.events.find(e => e.k === 'heal');
    if (event) {
      expect(event.id).toBe(ally.id); expect(ally.hp).toBeGreaterThan(500);
      expect(ally.haste).toBe(DRAIN.haste); expect(ally.hasteUntil).toBeGreaterThan(w.t);
      arrived = true; break;
    }
    expect(ally.hp).toBe(500); expect(ally.hasteUntil).toBe(0);
  }
  expect(checkedSpeed).toBe(true); expect(arrived).toBe(true);
  expect(enemy.hp).toBeLessThan(500); expect(enemy.slow).toBe(DRAIN.slow); expect(enemy.slowUntil).toBeGreaterThan(w.t);
});

it('never heals or hastes a directly aimed ally when no enemy was hit', () => {
  const w = world([[0, 0], [2, 0]], { ...noSpells(), drain: 1 }, [], () => .5, false, [0, 0]);
  w.pillars = []; w.rules.chests = w.rules.runes = false;
  for (const z of w.wizards) { z.hp = 500; z.regen = 0; }
  stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'drain', at: v(2, 0) }], () => .5);
  for (let i = 0; i < 180; i++) {
    stepWorld(w, [], () => .5);
    expect(w.events.some(e => e.k === 'heal')).toBe(false);
    expect(w.wizards[1].hp).toBe(500); expect(w.wizards[1].hasteUntil).toBe(0);
  }
});
