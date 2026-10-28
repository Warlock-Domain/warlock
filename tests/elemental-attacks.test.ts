import { describe, expect, it } from 'vitest';
import { BASIC_ATTACK, DT } from '../src/shared/constants.ts';
import { ELEMENTS } from '../src/shared/elemental-spheres.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { encodeSnap, decodeSnap } from '../src/shared/snapshot.ts';
import { parseServerMessage } from '../src/client/net-message.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

const setup = () => {
  const w = world([[0, 0], [4, 0]], noSpells(), [], () => .5);
  w.pillars = []; w.runes = []; w.shrinkAt = 1000;
  w.wizards.forEach(z => z.regen = 0);
  return w;
};
const attack = { id: 'p0', kind: 'basic' as const, at: v(4, 0) };
describe('Elemental sphere basic attacks', () => {
  it.each(ELEMENTS)('replaces a ranged attack with one %s sphere dealing 30 base damage and no knockback', element => {
    const w = setup(), z = w.wizards[0];
    z.spheres = [{ element, until: 30 }];
    run(w, .4 + DT, [attack]);
    expect(z.spheres).toHaveLength(0);
    expect(w.projectiles[0]).toMatchObject({ kind: 'basic', element, stats: { dmg: 30, knock: 0 } });
    const snap = encodeSnap(w, 'p0', 1, []);
    expect(parseServerMessage(snap)).not.toBeNull();
    expect(decodeSnap(snap, ['p0', 'p1']).projectiles[0].element).toBe(element);
    run(w, .8);
    expect(w.wizards[1].hp).toBe(970);
    expect(w.wizards[1].vel).toEqual(v(0, 0));
  });
  it('uses the oldest living sphere once and preserves the remaining bonuses', () => {
    const w = setup(), z = w.wizards[0];
    z.spheres = [{ element: 'void', until: .1 }, { element: 'water', until: 10 }, { element: 'fire', until: 20 }];
    run(w, .4 + DT, [attack]);
    expect(w.projectiles[0]).toMatchObject({ element: 'water', stats: { dmg: 31.5, speed: BASIC_ATTACK.speed } });
    expect(z.spheres).toEqual([{ element: 'fire', until: 20 }]);
  });
  it('preserves spheres on cancelled windup, cooldown rejection and melee', () => {
    for (const action of ['stop', 'cooldown', 'melee']) {
      const w = setup(), z = w.wizards[0];
      z.spheres = [{ element: 'earth', until: 30 }];
      if (action === 'cooldown') z.basicReadyAt = 10;
      if (action === 'melee') w.wizards[1].pos = v(1, 0);
      stepWorld(w, [{ ...attack, at: action === 'melee' ? v(1, 0) : attack.at }], () => .5);
      if (action === 'stop') stepWorld(w, [{ id: z.id, kind: 'stop' }], () => .5);
      run(w, .5);
      expect(z.spheres).toHaveLength(1);
      expect(w.projectiles).toHaveLength(0);
    }
  });
  it('falls back to the normal projectile without a sphere', () => {
    const w = setup(); run(w, 1, [attack]);
    expect(w.wizards[1].hp).toBe(1000 - BASIC_ATTACK.dmg);
  });
  it('rejects malformed or unrelated sphere projectile metadata', () => {
    const w = setup(); run(w, .4 + DT, [attack]);
    const snap = encodeSnap(w, 'p0', 1, []), id = w.projectiles[0].id;
    for (const pe of [[id], [id, 5], [id, -.1], [999999, 0], [id, 0, id, 1]]) {
      expect(parseServerMessage({ ...snap, pe })).toBeNull();
    }
  });
});
