import { describe, expect, it } from 'vitest';
import { botCmds } from '../src/shared/bots.ts';
import { ELEMENTS, ELEMENT_COLORS, elementalOrbit } from '../src/shared/elemental-spheres.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { noSpells, SPELLS, spellMax } from '../src/shared/spells.ts';
import { parseServerMessage } from '../src/client/net-message.ts';
import { demoStep, demoWorld } from '../src/client/demo.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

const setup = () => {
  const w = world([[0, 0], [8, 0]], { ...noSpells(), elemental: 1 }, [], () => .5);
  w.wizards[1].spells = { ...w.wizards[1].spells, elemental: 0 };
  w.pillars = []; w.runes = []; w.shrinkAt = 1000; w.rules.chests = false; w.rules.runes = false;
  return w;
};
const summon = (w: ReturnType<typeof setup>, rand = () => .5) => stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'elemental', at: v(5, 0) }], rand);

describe('Elemental Spheres', () => {
  it('uses the approved price, cooldown, lifetime and five element colors without upgrades', () => {
    expect(SPELLS.elemental).toMatchObject({ cost: 12, up: [] });
    expect(SPELLS.elemental.levels[0]).toMatchObject({ cd: 5, duration: 30, dmg: 0, knock: 0 });
    expect(spellMax('elemental')).toBe(1);
    expect(ELEMENTS).toEqual(['fire', 'water', 'earth', 'ki', 'void']);
    expect(ELEMENT_COLORS.ki).toBe('#ffffff'); expect(ELEMENT_COLORS.void).toBe('#000000');
  });
  it('draws exactly one server-side element per accepted cast and permits repeats', () => {
    for (const [i, element] of ELEMENTS.entries()) {
      const w = setup(); let calls = 0;
      summon(w, () => { calls++; return (i + .1) / ELEMENTS.length; });
      expect(w.wizards[0].spheres).toEqual([{ element, until: 30 }]);
      expect(calls).toBe(1);
      expect(w.wizards[0].cd.elemental).toBeCloseTo(5 + (element === 'void' ? .05 / 60 : 0));
      w.t = w.wizards[0].cd.elemental; summon(w, () => (i + .1) / ELEMENTS.length);
      expect(w.wizards[0].spheres?.map(s => s.element)).toEqual([element, element]);
    }
  });
  it('does not summon on cooldown or consume randomness for a rejected request', () => {
    const w = setup(); summon(w);
    let draws = 0; summon(w, () => { draws++; return .9; });
    expect(draws).toBe(0); expect(w.wizards[0].spheres).toHaveLength(1);
  });
  it('caps at five without refreshing old lifetimes, spending cooldown or interrupting movement', () => {
    const w = setup();
    for (let i = 0; i < 5; i++) { w.t = i * 5; summon(w); }
    const z = w.wizards[0], old = structuredClone(z.spheres);
    z.target = v(0, 5); w.t = 25;
    let draws = 0; summon(w, () => { draws++; return 0; });
    expect(z.spheres).toEqual(old); expect(z.cd.elemental).toBe(25); expect(draws).toBe(0);
    expect(z.target).toEqual(v(0, 5));
    w.t = 30; summon(w, () => 0);
    expect(z.spheres).toHaveLength(5); expect(z.spheres![0].until).toBe(35);
    expect(z.spheres!.at(-1)).toEqual({ element: 'fire', until: 60 });
  });
  it('expires individually and clears on death without creating physical projectiles', () => {
    const w = setup(); summon(w); w.t = 5; summon(w);
    w.t = 30; stepWorld(w, [], () => .5);
    expect(w.wizards[0].spheres).toHaveLength(2);
    expect(w.wizards[0].spheres?.map(s => s.until)).toEqual([35, 60]); expect(w.projectiles).toHaveLength(0);
    w.wizards[0].alive = false; stepWorld(w, [], () => .5);
    expect(w.wizards[0].spheres).toBeUndefined();
  });
  it('synchronizes element and remaining duration to another player and late arrivals', () => {
    const w = setup(); summon(w, () => .9); w.t = 10;
    const snap = encodeSnap(w, 'p1', 0, []);
    expect(parseServerMessage(snap)).not.toBeNull();
    expect(decodeSnap(snap, ['a', 'b']).wizards[0].spheres).toEqual([{ element: 'void', left: 20 }]);
    w.wizards[0].veilUntil = 20;
    expect(encodeSnap(w, 'p1', 0, []).eo).toBeUndefined();
    expect(encodeSnap(w, 'p0', 0, []).eo).toEqual([0, 4, 20]);
  });
  it('rejects malformed, oversized and out-of-range sphere snapshots', () => {
    const snap = encodeSnap(setup(), 'p0', 0, []);
    for (const eo of [[0, 0], [2, 0, 1], [0, 5, 1], [0, 0, 31], [0, 0, -1], [0, .1, 2], Array(18).fill(0)]) {
      expect(parseServerMessage({ ...snap, eo }), JSON.stringify(eo)).toBeNull();
    }
  });
  it('does not let a full visual sphere set suppress the bot basic attack', () => {
    const w = setup(); w.wizards[1].pos = v(3, 0);
    w.wizards[0].cd.fireball = w.wizards[0].cd.scourge = 99;
    w.wizards[0].spheres = Array.from({ length: 5 }, () => ({ element: 'ki' as const, until: 30 }));
    expect(botCmds(w, 'p0', () => .5)).toContainEqual({ id: 'p0', kind: 'basic', at: v(3, 0), target: 'p1' });
  });
  it('uses separated orbits and the real simulation for its demo', () => {
    expect(new Set(Array.from({ length: 5 }, (_, i) => JSON.stringify(elementalOrbit(0, i, 5)))).size).toBe(5);
    const demo = demoWorld('elemental');
    while (demo.w.t < 24) demoStep(demo);
    expect(demo.w.wizards[0].spheres).toHaveLength(5);
    while (demo.w.t < 31) demoStep(demo);
    expect(demo.w.wizards[0].spheres).toHaveLength(5);
  });
});
