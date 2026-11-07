// The 18/10 tenfold health conversion changed units only. The impulses below were measured
// on the former health100 scale; later explicit gameplay changes update their entries.
import { describe, expect, it } from 'vitest';
import { HP_MAX, UNIT, WIZ_SPEED } from '../src/shared/constants.ts';
import { newWorld, stepWorld, type World } from '../src/shared/sim.ts';
import { RUSH, SPELLS, noSpells, type SpellId } from '../src/shared/spells.ts';
import { len, v } from '../src/shared/vec.ts';

// knockback metres per second at levels one and seven, measured on the old scale
const KNOCK_BEFORE: Partial<Record<SpellId, [number, number]>> = {
  fireball: [4.529, 7.2464], lightning: [4.16668, 7.023832], homing: [3.26088 * 0.34 / 0.72, 6.05592 * 0.34 / 0.72], // 18/10 balance: Homing multiplier0.72 to0.34 and Snowball multiplier1.3.
  boomerang: [4.30255, 6.51529], thrust: [0, 0], bouncer: [0, 0], drain: [0.7764, 1.5528], snowball: [2.67858 * 1.3 / 1.15, (8.03574 * (255 * 1.3)) / (135 * 1.15)],
  recharge: [3.882, 6.5994], windwalk: [3.4938, 5.823], splitter: [1.941, 3.882],
};

// p0 at the origin casts Fireball, optionally empowered by Pact, at p1 three metres away; returns impact state and damage
function fireballHit(prepare: (w: World) => void = () => {}, pact = false) {
  const w = newWorld(['p0', 'p1'], { p0: { ...noSpells(), pact: pact ? 1 : 0 }, p1: noSpells() });
  [w.wizards[0].pos, w.wizards[1].pos] = [v(0, 0), v(3, 0)];
  for (const z of w.wizards) z.invulnUntil = 0;
  prepare(w);
  if (pact) stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'pact', at: v(0, 0) }]);
  for (let i = 0; i < 15; i++) stepWorld(w, []);
  stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) }]);
  for (let i = 0; i < 120 && !w.events.some((e) => e.k === 'hit'); i++) stepWorld(w, []);
  const hit = w.events.find((e) => e.k === 'hit');
  return { w, z: w.wizards[1], dmg: hit?.k === 'hit' ? hit.dmg : 0 };
}

describe('Tenfold health scale preserves unchanged game forces', () => {
  it('every damage spell pushes exactly as before', () => {
    for (const [id, [l1, l7]] of Object.entries(KNOCK_BEFORE) as [SpellId, [number, number]][]) {
      expect(SPELLS[id].levels[0].knock, id).toBeCloseTo(l1, 9);
      expect(SPELLS[id].levels[6].knock, id).toBeCloseTo(l7, 9);
    }
  });

  it('a fireball hit: 70 of damage (7 before) and the same push', () => {
    const { z, dmg } = fireballHit();
    expect(dmg).toBe(70);
    expect(len(z.vel)).toBeCloseTo(4.529, 9);
  });

  it.each([0, 400, 7000, 70000])('historical damage%s does not amplify knockback', (taken) => {
    const { z } = fireballHit((w) => (w.wizards[1].dmgTaken = taken));
    expect(len(z.vel)).toBeCloseTo(4.529, 9);
  });

  it.each([false, true])('one hundred hits do not increase impulse, infinite health=%s', (god) => {
    const w = newWorld(['p0', 'p1'], { p0: noSpells(), p1: noSpells() }, {}, 0, () => 0.5);
    w.pillars = [];
    w.shrinkAt = Infinity;
    const target = w.wizards[1];
    target.god = god;
    for (const z of w.wizards) z.invulnUntil = 0;
    for (let hit = 0; hit < 100; hit++) {
      w.wizards[0].pos = v(0, 0);
      w.wizards[0].cd.fireball = 0;
      target.pos = v(3, 0);
      target.vel = v(0, 0);
      target.hp = target.hpMax; // heal between ordinary hits without resetting history.
      stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: target.pos }], () => 0.5);
      for (let i = 0; i < 120 && !w.events.some((e) => e.k === 'hit'); i++) stepWorld(w, [], () => 0.5);
      expect(w.events.some((e) => e.k === 'hit'), `impacto ${hit}`).toBe(true);
      expect(len(target.vel), `impacto ${hit}`).toBeCloseTo(4.529, 9);
    }
    expect(target.dmgTaken).toBe(7000);
  });

  it('preserves knockback resistance independently of history', () => {
    const { z } = fireballHit((w) => { w.wizards[1].dmgTaken = 70000; w.wizards[1].kbResist = .35; });
    expect(len(z.vel)).toBeCloseTo(4.529 * .65, 9);
  });

  it('hitting an idle player creates no walk destination or movement after the impulse ends', () => {
    const { w, z } = fireballHit();
    expect(len(z.vel)).toBeGreaterThan(0); // the legitimate impact force remains.
    for (let i = 0; i < 600 && len(z.vel) > 0; i++) {
      expect(z.target).toBeNull();
      stepWorld(w, [], () => .5);
    }
    expect(z.vel).toEqual(v(0, 0));
    const stopped = { ...z.pos };
    for (let i = 0; i < 60; i++) stepWorld(w, [], () => .5);
    expect(z.pos).toEqual(stopped);
    expect(z.target).toBeNull();
  });

  it('a hit above the soft cap still pushes by the square root (Pact: 14 → 140 of damage)', () => {
    const { z, dmg } = fireballHit(() => {}, true);
    expect(dmg).toBe(140);
    // escala antiga: 14 de dano, teto 10, 0,647 m/s por ponto
    expect(len(z.vel)).toBeCloseTo(14 * 0.647 * (Math.sqrt(10 * 14) / 14), 9);
  });

  it('Rush turns absorbed damage into the same extra speed (35 absorbed, 3,5 before)', () => {
    const w = newWorld(['p0', 'p1'], { p0: noSpells(), p1: { ...noSpells(), rush: 1 } });
    [w.wizards[0].pos, w.wizards[1].pos] = [v(0, 0), v(4, 0)];
    for (const z of w.wizards) z.invulnUntil = 0;
    const z = w.wizards[1];
    stepWorld(w, [{ id: 'p1', kind: 'cast', spell: 'rush', at: v(4, 9) }]);
    for (let i = 0; i < 17; i++) stepWorld(w, []);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: z.pos }]);
    for (let i = 0; i < 120 && !w.events.some((e) => e.k === 'hit'); i++) stepWorld(w, []);
    stepWorld(w, []);
    // old scale: half Fireball damage times15 speed units per point, capped by Rush absorption since18/10
    expect(z.speed - WIZ_SPEED - RUSH.bonus).toBeCloseTo(Math.min(35, SPELLS.rush.levels[0].absorb) * 1.5 * UNIT, 9);
  });

  it('a second of lava adds the same share of damage taken (5% of the max life)', () => {
    const w = newWorld(['p0'], { p0: noSpells() });
    w.wizards[0].pos = v(w.arenaR + 1, 0);
    w.wizards[0].invulnUntil = 0;
    for (let i = 0; i < 60; i++) stepWorld(w, []);
    expect(w.wizards[0].dmgTaken / HP_MAX).toBeCloseTo(0.05, 6);
  });
});
