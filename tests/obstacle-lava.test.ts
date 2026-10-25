import { describe, expect, it } from 'vitest';
import { LAVA_DPS, OBSTACLES, type ObstacleKind } from '../src/shared/constants.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

// one obstacle in the lava (outside the stone) and one on the stone; wizards stay in the middle
function setup(kind: ObstacleKind) {
  const w = world([[-1, 0], [1, 0]], noSpells(), [], () => 0.5);
  const put = (x: number) => ({ pos: v(x, 4), hp: OBSTACLES[kind].hp, alive: true, kind });
  w.pillars = [put(w.arenaR + 3), put(0)];
  return w;
}

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
