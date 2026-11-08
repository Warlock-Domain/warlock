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
  const healingEvents: typeof w.events = [];
  for (let i = 0; i < 180; i++) {
    stepWorld(w, [], () => .5);
    healingEvents.push(...w.events.filter(e => e.k === 'heal'));
    const returning = w.projectiles.find(p => p.kind === 'drain' && p.back);
    if (returning) { recipient = returning.target!; payload = returning.healAmount!; }
  }
  const dealt = 1000 - w.wizards[1].hp;
  expect(dealt).toBe(56);
  expect(recipient).toBe(other ? 'p2' : 'p0');
  expect(payload).toBe(dealt);
  expect(w.wizards[other ? 2 : 0].hp).toBe(500 + dealt);
  expect(w.wizards[other ? 0 : 2].hp).toBe(500);
  const healed = w.wizards[other ? 2 : 0];
  expect(healingEvents).toHaveLength(1);
  expect(healingEvents[0]).toMatchObject({ k: 'heal', id: healed.id, amount: dealt });
});

it('does not seek or heal an ally after missing every enemy', () => {
  const w = world([[0, 0], [3, 2]], { ...noSpells(), drain: 1 }, [], () => .5, false, [0, 0]);
  w.pillars = []; w.rules.chests = w.rules.runes = false;
  for (const z of w.wizards) { z.hp = 500; z.regen = 0; }
  stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'drain', at: v(3, 0) }], () => .5);
  for (let i = 0; i < 150; i++) {
    stepWorld(w, [], () => .5);
    expect(w.projectiles.some(p => p.kind === 'drain' && p.back)).toBe(false);
    expect(w.events.some(e => e.k === 'heal')).toBe(false);
  }
  expect(w.wizards.map(z => z.hp)).toEqual([500, 500]);
  expect(w.wizards[1].hasteUntil).toBe(0);
  expect(w.projectiles.filter(p => p.kind === 'drain')).toHaveLength(0);
});

it.each([500, 990, 1000])('confirms the return recipient with actual capped healing: starting hp=%s', hp => {
  const w = world([[0, 0], [2, 0]], { ...noSpells(), drain: 1 }, [], () => .5, false, [0, 0]);
  w.pillars = []; w.rules.chests = w.rules.runes = false;
  for (const z of w.wizards) z.regen = 0;
  w.wizards[1].hp = hp;
  w.projectiles.push({ id: w.nextId++, kind: 'drain', owner: 'p0', caster: 'p0', pos: v(2, 0), vel: v(0, 0), level: 1, until: 5, target: 'p1', dmgMult: 1, back: true, healAmount: 60 });
  stepWorld(w, [], () => .5);
  expect(w.events.filter(e => e.k === 'heal')).toEqual([{ k: 'heal', id: 'p1', x: 2, y: 0, amount: Math.min(60, 1000 - hp) }]);
});

it('keeps flying straight beyond the aim point instead of seeking a nearby enemy', () => {
  const w = world([[0, 0], [3, -2], [4, 2]], { ...noSpells(), drain: 1 }, [], () => .5, false, [0, 0, 1]);
  w.pillars = []; w.rules.chests = w.rules.runes = false;
  stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'drain', at: v(3, 0) }], () => .5);
  for (let i = 0; i < 54; i++) stepWorld(w, [], () => .5);
  const p = w.projectiles.find(p => p.kind === 'drain');
  expect(p).toBeDefined(); expect(p!.turnAt).toBeUndefined();
  expect(p!.vel.x).toBeGreaterThan(0); expect(p!.vel.y).toBeCloseTo(0);
});

it.each([1, -1])('preserves a diagonal launch direction past nearby enemies: y=%s', sign => {
  const w = world([[0, 0], [4, 0]], { ...noSpells(), drain: 1 }, [], () => .5, false, [0, 1]);
  w.pillars = []; w.rules.chests = w.rules.runes = false;
  stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'drain', at: v(2, 2 * sign) }], () => .5);
  for (let i = 0; i < 54; i++) stepWorld(w, [], () => .5);
  const p = w.projectiles.find(p => p.kind === 'drain');
  expect(p).toBeDefined(); expect(p!.turnAt).toBeUndefined();
  expect(p!.vel.x).toBeGreaterThan(0); expect(p!.vel.y / p!.vel.x).toBeCloseTo(sign);
});
