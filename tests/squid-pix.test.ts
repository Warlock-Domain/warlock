import { describe, expect, it } from 'vitest';
import { DT } from '../src/shared/constants.ts';
import { CAST_POINT, GRIP, noSpells, SPELLS, spellGroup } from '../src/shared/spells.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { world, run } from './helpers.ts';

// p0 controls; p1 is the target standing on the mark; p2 is a bystander far away
function setup() {
  const w = world([[0, 0], [4, 0], [0, 8]], { ...noSpells(), pix: 1, teleport: 1 }, [], () => .5);
  w.pillars = []; w.isles = []; w.arenaR = 40; w.shrinkAt = Infinity;
  for (const z of w.wizards) { z.regen = 0; z.hp = 500; }
  return w;
}
function control(w: ReturnType<typeof setup>) {
  stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'pix', at: { x: 4, y: 0 } }], () => .5);
  run(w, CAST_POINT.pix + GRIP.delay + DT);
}
const [p0, p1, p2] = ['p0', 'p1', 'p2'];

describe('Squid Pix (issue #416)', () => {
  it('Control spell: 3 s at every level, cooldown 30 s minus 1 s per level, costs 14', () => {
    expect(spellGroup('pix')).toBe('control');
    expect(SPELLS.pix.cost).toBe(14);
    expect(SPELLS.pix.levels.map((l) => l.cd)).toEqual([30, 29, 28, 27, 26, 25, 24]);
    expect(SPELLS.pix.levels.every((l) => l.duration === 3)).toBe(true);
  });

  it('the mark controls enemies inside it after the Grip delay, not the caster or someone outside', () => {
    const w = setup(); control(w);
    expect(w.wizards[1].puppetBy).toBe(p0);
    expect(w.wizards[1].puppetUntil! - w.t).toBeGreaterThan(2.9);
    expect(w.wizards[0].puppetBy).toBeUndefined();
    expect(w.wizards[2].puppetBy).toBeUndefined();
  });

  it('the target walks with the same offset as the caster and ignores its own commands', () => {
    const w = setup(); control(w);
    stepWorld(w, [{ id: p1, kind: 'move', to: { x: 4, y: -10 } }, { id: p0, kind: 'move', to: { x: 0, y: 5 } }]);
    expect(w.wizards[1].target).toEqual({ x: w.wizards[1].pos.x, y: 5 });
  });

  it('a copied spell comes from the target body at your level without touching its spells or cooldowns', () => {
    const w = setup(); control(w);
    const before = { ...w.wizards[1].cd };
    stepWorld(w, [{ id: p0, kind: 'cast', spell: 'teleport', at: { x: 0, y: 5 } }]);
    expect(w.wizards[0].pos.y).toBeCloseTo(5, 1);
    expect(w.wizards[1].pos.y).toBeCloseTo(5, 1);
    expect(w.wizards[1].cd).toEqual(before);
  });

  it('a copied cast needs your cast to go out: on cooldown, nothing comes from the target', () => {
    const w = setup(); control(w);
    w.wizards[0].cd.teleport = w.t + 10;
    stepWorld(w, [{ id: p0, kind: 'cast', spell: 'teleport', at: { x: 0, y: 5 } }]);
    expect(w.wizards[1].pos.y).toBeCloseTo(0);
  });

  it("the target's fireball is yours: it flies past you and the hit counts for you", () => {
    const w = setup(); control(w);
    w.wizards[2].pos = { x: 4, y: -4 };
    // p1 is at (4, 0): the offset puts its copy at (4, -4), p2; your own fireball goes from (0,0) to (0,-4), away from everyone
    stepWorld(w, [{ id: p0, kind: 'cast', spell: 'fireball', at: { x: 0, y: -4 } }]);
    run(w, 1);
    expect(w.wizards[2].hp).toBeLessThan(500);
    expect(w.wizards[2].lastHitBy).toBe(p0);
    expect(w.wizards[1].hp).toBe(500);
  });

  it("the target's spells never hit you", () => {
    const w = setup(); control(w);
    w.wizards[0].pos = { x: 0, y: 0 }; w.wizards[1].pos = { x: 4, y: 0 };
    // aimed so the copy flies from p1 straight through p0
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
    const w2 = setup(); control(w2); run(w2, 3.1);
    stepWorld(w2, [{ id: p1, kind: 'move', to: { x: 10, y: 0 } }]);
    expect(w2.wizards[1].target).toEqual({ x: 10, y: 0 });
  });

  it('the snapshot ties the target to its controller, but never reveals a hidden controller', () => {
    const w = setup(); control(w);
    const ids = w.wizards.map((z) => z.id);
    const seen = decodeSnap(encodeSnap(w, p1, 0, []), ids).wizards[1];
    expect(seen.puppetBy).toBe(0);
    expect(seen.puppetLeft).toBeGreaterThan(2.5);
    w.wizards[0].windUntil = w.t + 2;
    expect(decodeSnap(encodeSnap(w, p1, 0, []), ids).wizards[1].puppetBy).toBe(-1);
  });

  it("a status-only copy (Grip) never roots you, and a copied Squid Pix gives you the new targets", () => {
    const w = setup(); control(w);
    for (const z of w.wizards) z.spells.grip = 1;
    w.wizards[2].pos = { x: 8, y: 0 };
    // your Grip lands on empty ground (-4, 0); p1's copy, with the same offset from (4, 0), lands on you (0, 0)
    stepWorld(w, [{ id: p0, kind: 'cast', spell: 'grip', at: { x: -4, y: 0 } }]);
    run(w, CAST_POINT.grip + GRIP.delay + DT);
    expect(w.wizards[0].gripUntil).toBeLessThan(w.t);
    const w2 = setup(); control(w2);
    w2.wizards[0].cd.pix = 0; w2.wizards[2].pos = { x: 8, y: 0 };
    stepWorld(w2, [{ id: p0, kind: 'cast', spell: 'pix', at: { x: 4, y: 0 } }]); // yours lands on p1 again, p1's copy on p2 (8, 0)
    run(w2, CAST_POINT.pix + GRIP.delay + DT);
    expect(w2.wizards[2].puppetBy).toBe(p0);
    expect(w2.wizards[0].puppetBy).toBeUndefined();
  });
});

