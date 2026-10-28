import { describe, expect, it } from 'vitest';
import { stepWorld } from '../src/shared/sim.ts';
import { noSpells, SPELLS, spellLevel, spellMax } from '../src/shared/spells.ts';
import { run, world } from './helpers.ts';
import { UNIT } from '../src/shared/constants.ts';

// p0 drops Barricade at (4,0); p1 stands on or away from that point
function drop(target: [number, number]) {
  const w = world([[0, 0], target], { ...noSpells(), rockpillar: 1 });
  stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'rockpillar', at: { x: 4, y: 0 } }], () => 0.5);
  const hits = w.events.filter((e) => e.k === 'hit');
  for (let i = 0; i < 10; i++) stepWorld(w, [], () => 0.5);
  return { w, hits };
}

describe('Barricade drop (issue #206)', () => {
  it('remains after sixty seconds without a timer and still breaks from shared damage', () => {
    const { w } = drop([8, 3]); w.shrinkAt = Infinity; w.rules.chests = false; w.rules.runes = false;
    const pieces = w.pillars;
    run(w, 60);
    expect(pieces.every(p => p.alive && p.until === undefined)).toBe(true);
    w.wizards[0].spells.fireball = 1;
    const hits = Math.ceil(pieces[0].hp / spellLevel('fireball', 1).dmg);
    for (let i = 0; i < hits; i++) {
      w.wizards[0].cd.fireball = w.t;
      run(w, 1, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: { x: 4, y: 0 } }]);
      expect(pieces.map(p => p.hp)).toEqual(pieces.map(() => pieces[0].hp));
    }
    expect(pieces.every(p => !p.alive)).toBe(true);
  });
  it('has no upgrades and retains level-one health, cooldown, range and drop damage', () => {
    const { w } = drop([8, 3]);
    expect(SPELLS.rockpillar.up).toEqual([]); expect(spellMax('rockpillar')).toBe(1);
    expect(spellLevel('rockpillar', 1)).toMatchObject({ cd: 18.2, range: 650 * UNIT, dmg: 50, duration: 0 });
    expect(spellLevel('rockpillar', 7)).toEqual(spellLevel('rockpillar', 1)); // Existing saved rooms retain valid stats without progression.
    expect(w.pillars.map(p => p.hp)).toEqual([200, 200, 200]);
  });
  it('a body under the wall takes drop damage and is pushed away', () => {
    const { w, hits } = drop([4, 0.2]);
    expect(hits).toEqual([expect.objectContaining({ id: 'p1', by: 'p0', src: 'rockpillar', dmg: spellLevel('rockpillar', 1).dmg })]);
    expect(w.wizards[1].pos.x).toBeGreaterThan(4.4); // pushed outside the wall line, which crosses the approach path
  });

  it('the wall blocks immediately and bodies away from it take no damage', () => {
    const { w, hits } = drop([8, 3]);
    expect(hits).toEqual([]);
    expect(w.pillars.filter((p) => p.kind === 'rockpillar' && p.alive)).toHaveLength(3);
  });
});
