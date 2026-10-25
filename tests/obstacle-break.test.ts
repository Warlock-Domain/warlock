import { describe, expect, it } from 'vitest';
import { LAVA_DPS, OBSTACLES, type ObstacleKind } from '../src/shared/constants.ts';
import { nightMap, obstaclesOf } from '../src/shared/levels.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { noSpells, spellLevel, type SpellId } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

// one obstacle in the lava (outside the stone) and one on the stone; wizards stay in the middle
function setup(kind: ObstacleKind) {
  const w = world([[-1, 0], [1, 0]], noSpells(), [], () => 0.5);
  const put = (x: number) => ({ pos: v(x, 4), hp: OBSTACLES[kind].hp, alive: true, kind });
  w.pillars = [put(w.arenaR + 3), put(0)];
  return w;
}

describe('Large rock', () => {
  it('takes damage from a Fireball outside the Campaign', () => {
    const w = world([[0, 0], [0, 6]], noSpells(), [], () => 0.5);
    w.pillars = [{ pos: v(3, 0), hp: OBSTACLES.rock.hp, alive: true, kind: 'rock' }];
    run(w, 1, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: { x: 3, y: 0 } }]);
    expect(Number.isFinite(OBSTACLES.rock.hp)).toBe(true);
    expect(w.pillars[0].hp).toBeCloseTo(OBSTACLES.rock.hp - spellLevel('fireball', 1).dmg, 5);
  });

  it('never breaks in the Campaign (room blocks and Sir Odran pillars)', () => {
    const rocks = obstaclesOf(nightMap(1, 0)).filter((q) => q.kind === 'rock');
    expect(rocks.length).toBeGreaterThan(0);
    for (const q of rocks) expect(q.hp).toBe(Infinity);
  });

  it('burns in the lava and breaks', () => {
    const w = setup('rock');
    for (let i = 0; i < 5 * 60; i++) stepWorld(w, [], () => 0.5); // 400 health at 100 per second: 4 s
    expect(w.pillars.map((p) => p.alive)).toEqual([false, true]);
  });
});

describe('Every attack hits obstacles', () => {
  // p0 casts at a tree 2.5 m away; p1 stays out of the way
  function castAt(spell: SpellId, kind: ObstacleKind = 'tree', secs = 1.5) {
    const w = world([[0, 0], [0, -6]], { ...noSpells(), [spell]: 1 }, [], () => 0.5);
    w.pillars = [{ pos: v(2.5, 0), hp: OBSTACLES[kind].hp, alive: true, kind }];
    run(w, secs, [{ id: 'p0', kind: 'cast', spell, at: { x: 2.5, y: 0 } }]);
    return w.pillars[0];
  }

  it.each(['gravity', 'bouncer', 'boomerang', 'drain', 'recharge', 'splitter'] as const)('%s damages the obstacle it bounces off', (spell) => {
    expect(castAt(spell, 'pillar').hp).toBeLessThan(OBSTACLES.pillar.hp);
  });

  it('the Meteor blast damages obstacles inside it', () => {
    expect(castAt('meteor', 'pillar', 3).hp).toBeLessThan(OBSTACLES.pillar.hp);
  });

  it('a breaking shrine blast damages the obstacles around it', () => {
    const w = world([[0, 0], [0, -6]], noSpells(), [], () => 0.5);
    w.pillars = [{ pos: v(w.arenaR + 3, 4), hp: 0.5, alive: true, kind: 'shrine' }, { pos: v(w.arenaR + 3, 5), hp: 1000, alive: true, kind: 'pillar' }];
    stepWorld(w, [], () => 0.5);
    expect(w.pillars[0].alive).toBe(false);
    expect(w.pillars[1].hp).toBeLessThan(1000 - LAVA_DPS / 60 - 1);
  });
});

describe('Obstacles in the lava', () => {
  it('a pillar in the lava loses health at the lava rate, without a hit effect every step', () => {
    const w = setup('pillar');
    const events = [];
    for (let i = 0; i < 60; i++) {
      stepWorld(w, [], () => 0.5);
      events.push(...w.events);
    }
    expect(w.pillars[0].hp).toBeCloseTo(OBSTACLES.pillar.hp - LAVA_DPS, 0);
    expect(w.pillars[1].hp).toBe(OBSTACLES.pillar.hp);
    expect(events.filter((e) => e.k === 'pillar')).toEqual([]);
  });

  it('a Barricade wall burns once per step, however many pieces are in the lava', () => {
    const w = setup('rockpillar');
    const x = w.arenaR + 3;
    w.pillars = [-0.65, 0, 0.65].map((dy) => ({ pos: v(x, 4 + dy), hp: OBSTACLES.rockpillar.hp, alive: true, kind: 'rockpillar' as const, until: 99, wall: 1 }));
    for (let i = 0; i < 60; i++) stepWorld(w, [], () => 0.5);
    for (const p of w.pillars) expect(p.hp).toBeCloseTo(OBSTACLES.rockpillar.hp - LAVA_DPS, 0);
  });

  it('breaks with the usual effect when its health runs out', () => {
    const w = setup('tree');
    const events = [];
    for (let i = 0; i < 60; i++) {
      stepWorld(w, [], () => 0.5);
      events.push(...w.events);
    }
    expect(w.pillars[0].alive).toBe(false);
    expect(w.pillars[1].alive).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ k: 'clash', combo: 'pillar' }));
  });
});
