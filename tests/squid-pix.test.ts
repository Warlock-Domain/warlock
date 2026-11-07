import { describe, expect, it } from 'vitest';
import { DT } from '../src/shared/constants.ts';
import { CAST_POINT, GRIP, PIX, noSpells, SPELLS, spellGroup } from '../src/shared/spells.ts';
import { revive, stepWorld } from '../src/shared/sim.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { world, run } from './helpers.ts';

// p0 casts; p1 stands in the middle of the coin rain; p2 is a bystander far away
function setup() {
  const w = world([[0, 0], [4, 0], [0, 8]], { ...noSpells(), pix: 1, teleport: 1 }, [], () => .5);
  w.pillars = []; w.isles = []; w.arenaR = 40; w.shrinkAt = Infinity;
  for (const z of w.wizards) { z.regen = 0; z.hp = 500; }
  return w;
}
const rain = (w: ReturnType<typeof setup>, at = { x: 4, y: 0 }) => stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'pix', at }], () => .5);
function control(w: ReturnType<typeof setup>) {
  rain(w);
  run(w, CAST_POINT.pix + PIX.soak + 2 * DT);
}
const [p0, p1, p2] = ['p0', 'p1', 'p2'];

describe('Lula Pix / Squid Pix (issue #416)', () => {
  it('Control spell: 2.5 m rain for 3 s, 1 s inside to control, 3 s of control, cooldown 30 s minus 1 s per level, costs 14', () => {
    expect(spellGroup('pix')).toBe('control');
    expect(SPELLS.pix.name).toBe('Lula Pix');
    expect(SPELLS.pix.en).toBe('Squid Pix');
    expect(SPELLS.pix.cost).toBe(14);
    expect(SPELLS.pix.levels.map((l) => l.cd)).toEqual([30, 29, 28, 27, 26, 25, 24]);
    expect(SPELLS.pix.levels.every((l) => l.duration === 3 && l.radius === 2.5)).toBe(true);
    expect(PIX).toEqual({ rain: 3, soak: 1 });
  });

  it('controls whoever stays 1 s inside the rain, never before, and never the caster', () => {
    const w = setup();
    w.wizards[0].pos = { x: 3, y: 0 }; // the caster inside its own rain
    rain(w, { x: 4, y: 0 });
    run(w, CAST_POINT.pix + PIX.soak - .2);
    expect(w.wizards[1].puppetBy).toBeUndefined();
    run(w, .3);
    expect(w.wizards[1].puppetBy).toBe(p0);
    expect(w.wizards[1].puppetUntil! - w.t).toBeGreaterThan(2.7);
    expect(w.wizards[0].puppetBy).toBeUndefined();
    expect(w.wizards[2].puppetBy).toBeUndefined();
  });

  it('time inside is kept after leaving while the rain lasts, and allies are caught too', () => {
    const w = world([[0, 0], [4, 0], [0, 8]], { ...noSpells(), pix: 1 }, [], () => .5, false, [0, 0, 1]);
    w.pillars = []; w.isles = []; w.arenaR = 40; w.shrinkAt = Infinity;
    rain(w);
    run(w, CAST_POINT.pix + .6);
    w.wizards[1].pos = { x: 10, y: 0 };
    run(w, 1);
    expect(w.wizards[1].puppetBy).toBeUndefined();
    w.wizards[1].pos = { x: 4, y: 0 };
    run(w, .5);
    expect(w.wizards[1].puppetBy).toBe(p0);
  });

  it('the rain ends after 3 s and catches no one entering later', () => {
    const w = setup();
    w.wizards[1].pos = { x: 10, y: 0 };
    rain(w);
    run(w, CAST_POINT.pix + PIX.rain + DT);
    w.wizards[1].pos = { x: 4, y: 0 };
    run(w, 1.5);
    expect(w.wizards[1].puppetBy).toBeUndefined();
    expect(w.projectiles.some((p) => p.kind === 'pix')).toBe(false);
  });

  it('the target walks with the same offset as the caster and ignores its own commands', () => {
    const w = setup(); control(w);
    stepWorld(w, [{ id: p1, kind: 'move', to: { x: 4, y: -10 } }, { id: p0, kind: 'move', to: { x: 0, y: 5 } }]);
    expect(w.wizards[1].target).toEqual({ x: w.wizards[1].pos.x, y: 5 });
  });

  it('a copied spell aims at the same point, at your level, without touching its spells or cooldowns', () => {
    const w = setup(); control(w);
    w.wizards[1].spells.teleport = 0; // the target does not own the spell
    const before = { ...w.wizards[1].cd };
    stepWorld(w, [{ id: p0, kind: 'cast', spell: 'teleport', at: { x: 2, y: 5 } }]);
    expect(w.wizards[0].pos.y).toBeCloseTo(5, 0);
    expect(w.wizards[1].pos.y).toBeCloseTo(5, 0); // both land on the same point (then the bodies push apart)
    expect(w.wizards[1].spells.teleport).toBe(0);
    expect(w.wizards[1].cd).toEqual(before);
  });

  it('a copied cast needs your cast to go out: on cooldown, nothing comes from the target', () => {
    const w = setup(); control(w);
    w.wizards[0].cd.teleport = w.t + 10;
    stepWorld(w, [{ id: p0, kind: 'cast', spell: 'teleport', at: { x: 0, y: 5 } }]);
    expect(w.wizards[1].pos.y).toBeCloseTo(0);
  });

  it("the two fireballs converge on your point (a V); the target's hit counts for you", () => {
    const w = setup(); control(w);
    w.wizards[2].pos = { x: 4, y: -4 }; // right below the target: only its copy, flying to (4, -8), crosses it
    stepWorld(w, [{ id: p0, kind: 'cast', spell: 'fireball', at: { x: 4, y: -8 } }]);
    run(w, CAST_POINT.fireball + DT);
    const mine = w.projectiles.find((p) => p.kind === 'fireball' && p.owner === p0)!;
    const copy = w.projectiles.find((p) => p.kind === 'fireball' && p.owner === p1)!;
    expect(Math.atan2(copy.vel.y, copy.vel.x)).toBeCloseTo(-Math.PI / 2);
    expect(Math.atan2(mine.vel.y, mine.vel.x)).toBeCloseTo(Math.atan2(-8, 4));
    run(w, 1);
    expect(w.wizards[2].hp).toBeLessThan(500);
    expect(w.wizards[2].lastHitBy).toBe(p0);
    expect(w.wizards[1].hp).toBe(500);
  });

  it('standing on your point, the target uses your direction', () => {
    const w = setup(); control(w);
    stepWorld(w, [{ id: p0, kind: 'cast', spell: 'fireball', at: { ...w.wizards[1].pos } }]);
    run(w, CAST_POINT.fireball + DT);
    const copy = w.projectiles.find((p) => p.kind === 'fireball' && p.owner === p1)!;
    expect(copy.vel.x).toBeGreaterThan(0);
    expect(Math.abs(copy.vel.y)).toBeLessThan(.01);
  });

  it("the target's spells never hit you", () => {
    const w = setup(); control(w);
    w.wizards[0].pos = { x: 0, y: 0 }; w.wizards[1].pos = { x: 4, y: 0 };
    // your point is behind you: the copy flies from p1 straight through p0
    stepWorld(w, [{ id: p0, kind: 'cast', spell: 'fireball', at: { x: -4, y: 0 } }]);
    run(w, 1);
    expect(w.wizards[0].hp).toBe(500);
  });

  it('falling into the lava while controlled credits you', () => {
    const w = setup(); control(w);
    w.wizards[1].lastHitBy = p2;
    run(w, .5);
    expect(w.wizards[1].lastHitBy).toBe(p0);
  });

  it('ends after 3 s or when you die', () => {
    const w = setup(); control(w);
    w.wizards[0].alive = false;
    stepWorld(w, [{ id: p1, kind: 'move', to: { x: 10, y: 0 } }]);
    expect(w.wizards[1].target).toEqual({ x: 10, y: 0 });
    const w2 = setup(); control(w2); w2.wizards[1].pos = { x: 10, y: 0 }; run(w2, 3.1);
    stepWorld(w2, [{ id: p1, kind: 'move', to: { x: 12, y: 0 } }]);
    expect(w2.wizards[1].target).toEqual({ x: 12, y: 0 });
  });

  it('the snapshot carries the time inside and the control, but never reveals a hidden controller', () => {
    const w = setup(); rain(w); run(w, CAST_POINT.pix + .5);
    const ids = w.wizards.map((z) => z.id);
    expect(decodeSnap(encodeSnap(w, p1, 0, []), ids).wizards[1].pixSoak).toBeCloseTo(.5, 1);
    run(w, .6);
    const seen = decodeSnap(encodeSnap(w, p1, 0, []), ids).wizards[1];
    expect(seen.puppetBy).toBe(0);
    expect(seen.puppetLeft).toBeGreaterThan(2.5);
    w.wizards[0].veilUntil = w.t + 2;
    expect(decodeSnap(encodeSnap(w, p1, 0, []), ids).wizards[1].puppetBy).toBe(-1);
  });

  it('a status-only copy (Grip) never roots you', () => {
    const w = setup(); control(w);
    for (const z of w.wizards) z.spells.grip = 1;
    w.wizards[1].pos = { x: 4, y: 0 };
    // your point is your own feet: your Grip spares you, and so must the target's copy on the same point
    stepWorld(w, [{ id: p0, kind: 'cast', spell: 'grip', at: { ...w.wizards[0].pos } }]);
    run(w, CAST_POINT.grip + GRIP.delay + DT);
    expect(w.wizards[0].gripUntil).toBeLessThan(w.t);
  });

  it('a copied Homing Missile never locks on you, and coming back to life frees the target', () => {
    const w = setup(); control(w);
    w.wizards[0].spells.homing = 1; w.wizards[2].pos = { x: 30, y: 0 };
    stepWorld(w, [{ id: p0, kind: 'cast', spell: 'homing', at: { x: -4, y: 0 } }]);
    run(w, CAST_POINT.homing + DT);
    const copy = w.projectiles.find((p) => p.kind === 'homing' && p.owner === p1)!;
    expect(copy.target).not.toBe(p0);
    const w2 = setup(); control(w2);
    w2.wizards[1].alive = false;
    revive(w2, w2.wizards[1], { x: 4, y: 0 });
    expect(w2.wizards[1].puppetBy).toBeUndefined();
  });
});
