import { describe, expect, it } from 'vitest';
import { BASIC_ATTACK, DT, GUARD } from '../src/shared/constants.ts';
import { parseClientMessage } from '../src/shared/protocol.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { braceResistance, bracingActive, inArc, stepWorld, type Cmd, type World } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

// Alternative versions of Attack and Hold ground (issue #402): off by default, chosen per player in the shop
const arena = (spots: [number, number][]) => {
  const w = world(spots, noSpells(), [], () => .5);
  w.pillars = []; w.runes = [];
  for (const z of w.wizards) { z.regen = 0; z.spells.fireball = 0; }
  return w;
};
const swing: Cmd = { id: 'p0', kind: 'basic', at: v(10, 0) };
// holds S like the client: the brace lease is renewed every 0.1 s
const hold = (w: World, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepWorld(w, i % 6 === 0 ? [{ id: 'p0', kind: 'brace', on: true }] : [], () => .5);
};

describe('melee arc attack', () => {
  it('hits every enemy inside the 120° arc and ignores bodies behind or out of reach', () => {
    const w = arena([[0, 0], [1.5, .5], [1.5, -.8], [-1.5, 0], [3.2, 0]]);
    w.wizards[0].arc = true;
    run(w, BASIC_ATTACK.windup + DT, [swing]);
    expect(w.wizards.map((z) => z.hp)).toEqual([1000, 1000 - BASIC_ATTACK.dmg, 1000 - BASIC_ATTACK.dmg, 1000, 1000]);
    expect(w.wizards[1].vel.x).toBeGreaterThan(0);
    expect(w.wizards[2].vel.y).toBeLessThan(0); // pushed away from the attacker, not along the swing
    expect(w.projectiles).toHaveLength(0);
    expect(w.wizards[0].basicReadyAt).toBeCloseTo(BASIC_ATTACK.windup + BASIC_ATTACK.cd, 1);
  });

  it('a body whose edge touches the arc counts; the snapshot marks the arc windup', () => {
    expect(inArc(v(0, 0), 0, v(2.3, 0), .35)).toBe(true);
    expect(inArc(v(0, 0), 0, v(2.4, 0), .35)).toBe(false);
    expect(inArc(v(0, 0), 0, v(1, 1.9), .35)).toBe(true); // just past 60°, the edge still enters
    expect(inArc(v(0, 0), 0, v(0, 1.5), .35)).toBe(false);
    const w = arena([[0, 0], [5, 5]]);
    w.wizards[0].arc = true;
    stepWorld(w, [swing], () => .5);
    const me = decodeSnap(encodeSnap(w, 'p0', 1, []), ['p0', 'p1']).wizards[0];
    expect(me.basicLeft).toBeGreaterThan(0);
    expect(me.basicArc).toBe(true);
  });

  it('does not cancel the spell the target is casting, even when the push stuns it', () => {
    for (const sliding of [0, 1.2]) {
      const w = arena([[0, 0], [1.5, 0]]);
      w.wizards[0].arc = true;
      const t = w.wizards[1];
      t.spells.fireball = 1;
      t.vel = v(sliding, 0);
      stepWorld(w, [swing], () => .5);
      t.casting = { spell: 'fireball', at: v(-5, 0), fireAt: 10 };
      run(w, BASIC_ATTACK.windup);
      expect(t.hp, `sliding ${sliding}`).toBe(1000 - BASIC_ATTACK.dmg);
      expect(t.casting?.spell, `sliding ${sliding}`).toBe('fireball');
    }
  });

  it('without the option the Attack still needs a target (today\'s version)', () => {
    const w = arena([[0, 0], [1.5, 0]]);
    stepWorld(w, [{ id: 'p0', kind: 'basic', at: v(-10, 0) }], () => .5);
    expect(w.wizards[0].basicCasting?.arc).toBeUndefined();
  });
});

describe('guard stance', () => {
  it('counts at once and its push reduction grows linearly from 0 to 90% over 2.5 s, back to 0 on release', () => {
    const w = arena([[0, 0], [5, 0]]);
    const z = w.wizards[0];
    z.guard = true;
    stepWorld(w, [{ id: 'p0', kind: 'brace', on: true }], () => .5);
    expect(bracingActive(w, z)).toBe(true);
    expect(braceResistance(w, z)).toBeLessThan(.01);
    hold(w, GUARD.ramp / 2);
    expect(braceResistance(w, z)).toBeCloseTo(GUARD.max / 2, 1);
    hold(w, GUARD.ramp / 2);
    expect(braceResistance(w, z)).toBeCloseTo(GUARD.max, 2);
    hold(w, 1);
    expect(braceResistance(w, z)).toBeCloseTo(GUARD.max, 5);
    stepWorld(w, [{ id: 'p0', kind: 'brace', on: false }], () => .5);
    expect(braceResistance(w, z)).toBe(0);
    stepWorld(w, [{ id: 'p0', kind: 'brace', on: true }], () => .5);
    expect(braceResistance(w, z)).toBeLessThan(.01);
  });

  it('freezes spell and Attack cooldowns while held and lets them run on release', () => {
    const w = arena([[0, 0], [5, 0]]);
    const z = w.wizards[0];
    z.guard = true;
    z.spells.fireball = 1;
    z.cd.fireball = w.t + 3;
    z.basicReadyAt = w.t + BASIC_ATTACK.cd;
    const left = () => [z.cd.fireball - w.t, (z.basicReadyAt ?? 0) - w.t];
    const before = left();
    hold(w, 1);
    left().forEach((x, i) => expect(x).toBeCloseTo(before[i], 1));
    stepWorld(w, [{ id: 'p0', kind: 'brace', on: false }], () => .5);
    run(w, .5);
    left().forEach((x, i) => expect(x).toBeLessThan(before[i] - .4));
  });

  it('today\'s Hold ground keeps its windup and fixed resistance', () => {
    const w = arena([[0, 0], [5, 0]]);
    const z = w.wizards[0];
    stepWorld(w, [{ id: 'p0', kind: 'brace', on: true }], () => .5);
    expect(bracingActive(w, z)).toBe(false);
    hold(w, 3);
    expect(braceResistance(w, z)).toBe(.15);
  });
});

const parse = (m: object) => parseClientMessage(JSON.stringify(m));

describe('alt message', () => {
  it('accepts only both booleans and no other key', () => {
    expect(parse({ t: 'alt', arc: true, guard: false })).toEqual({ t: 'alt', arc: true, guard: false });
    expect(parse({ t: 'alt', arc: true })).toBeNull();
    expect(parse({ t: 'alt', arc: 1, guard: false })).toBeNull();
    expect(parse({ t: 'alt', arc: true, guard: false, dmg: 99 })).toBeNull();
  });
});
