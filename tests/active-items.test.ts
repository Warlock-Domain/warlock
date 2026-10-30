import { describe, expect, it } from 'vitest';
import { ITEMS, ITEM_IDS, itemPrice, itemStats, noItems } from '../src/shared/items.ts';
import { noSpells, priceOf, spellCount } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

describe('Addicted Rings', () => {
  it('is a single-level item and does not consume a spell slot', () => {
    expect(itemPrice(noItems(), 'addicted_rings')).toBe(13);
    expect(itemPrice({ ...noItems(), addicted_rings: 1 }, 'addicted_rings')).toBeNull();
    expect(priceOf('recharge', 0)).toBeNull();
    const w = world([[0, 0]], noSpells(), [{ addicted_rings: 1 }], () => .5);
    expect(w.wizards[0].spells.recharge).toBe(0);
    expect(spellCount(w.wizards[0].spells)).toBe(spellCount(noSpells()));
  });

  it('requires ownership, starts its cooldown on a miss and rejects another use', () => {
    const command = { id: 'p0', kind: 'cast' as const, spell: 'recharge' as const, at: v(5, 0) };
    const missing = world([[0, 0]], noSpells(), [], () => .5);
    run(missing, .2, [command]);
    expect(missing.projectiles).toHaveLength(0);
    const w = world([[0, 0]], noSpells(), [{ addicted_rings: 1 }], () => .5);
    run(w, .2, [command]);
    expect(w.projectiles).toHaveLength(1);
    expect(w.projectiles[0].level).toBe(1);
    const ready = w.wizards[0].cd.recharge;
    expect(ready - w.t).toBeGreaterThan(23);
    run(w, .2, [command]);
    expect(w.wizards[0].cd.recharge).toBe(ready);
    expect(w.projectiles).toHaveLength(1);
  });

  it('returns after hitting an enemy, resets its cooldown and retains its streak', () => {
    const w = world([[0, 0], [3, 0]], noSpells(), [{ addicted_rings: 1 }], () => .5);
    w.wizards[1].kbResist = 1;
    run(w, 2, [{ id: 'p0', kind: 'cast', spell: 'recharge', at: v(3, 0) }]);
    expect(w.wizards[1].hp).toBeLessThan(950);
    expect(w.wizards[0].streak).toBe(1);
    expect(w.wizards[0].cd.recharge).toBeLessThanOrEqual(w.t);
  });
});

describe('Glitch Cape', () => {
  it('swaps automatically with an incoming enemy projectile and starts a fixed cooldown', () => {
    const w = world([[0, 0], [3, 0]], noSpells(), [{ glitch_cape: 1 }], () => .5);
    run(w, .8, [{ id: 'p1', kind: 'cast', spell: 'fireball', at: v(0, 0) }]);
    expect(w.wizards[0].spells.alteration).toBe(0);
    expect(w.wizards[0].pos.x).toBeGreaterThan(.5);
    expect(w.wizards[0].hp).toBe(1000);
    expect(w.wizards[0].cd.alteration - w.t).toBeGreaterThan(18);
    expect(itemPrice({ ...noItems(), glitch_cape: 1 }, 'glitch_cape')).toBeNull();
  });

  it('does not activate for allied projectiles', () => {
    const w = world([[0, 0], [3, 0]], noSpells(), [{ glitch_cape: 1 }], () => .5, false, [0, 0]);
    run(w, .8, [{ id: 'p1', kind: 'cast', spell: 'fireball', at: v(0, 0) }]);
    expect(w.wizards[0].cd.alteration).toBe(0);
  });
});

describe('Fixed equipment', () => {
  it('offers every item once, and saved higher ranks use the same base attributes', () => {
    for (const id of ITEM_IDS) {
      expect(ITEMS[id].levels, id).toHaveLength(1);
      expect(itemPrice({ ...noItems(), [id]: 1 }, id), id).toBeNull();
      expect(itemStats({ ...noItems(), [id]: 7 }), id).toEqual(itemStats({ ...noItems(), [id]: 1 }));
    }
  });
});
