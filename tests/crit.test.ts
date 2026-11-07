import { describe, expect, it } from 'vitest';
import { itemStats, noItems, type ItemId } from '../src/shared/items.ts';
import { stepWorld, type World } from '../src/shared/sim.ts';
import { noSpells, spellLevel } from '../src/shared/spells.ts';
import { sheet } from '../src/client/sheet.ts';
import { world } from './helpers.ts';

// a four-metre duel with fixed RNG and attacker equipment; returns world and target hits
function duel(spell: 'fireball' | 'drain', items: Partial<Record<ItemId, number>>, roll: number, seconds = 2) {
  const w: World = world([[0, 0], [4, 0]], { ...noSpells(), fireball: 1, drain: 1 }, [items], () => roll);
  const hits: { t: number; dmg: number; crit?: boolean }[] = [];
  stepWorld(w, [{ id: 'p0', kind: 'cast', spell, at: w.wizards[1].pos }], () => roll);
  for (let i = 0; i < seconds * 60; i++) {
    stepWorld(w, [], () => roll);
    for (const e of w.events) if (e.k === 'hit' && e.id === 'p1' && e.dmg > 0) hits.push({ t: w.t, dmg: e.dmg, crit: e.crit });
  }
  return { w, hits };
}

describe('Critical hits', () => {
  it('items contribute critical chance, critical damage and outgoing slow duration', () => {
    expect(itemStats({ ...noItems(), lens: 3, piercing: 2, affliction: 1 })).toMatchObject({ crit: 0.05, critDmg: 0.3, afflict: 0.05 });
  });

  it('Lethal Lens rolls below its chance deal 30% more damage', () => {
    const plain = duel('fireball', {}, 0).hits[0];
    const crit = duel('fireball', { lens: 1 }, 0.04).hits[0];
    const miss = duel('fireball', { lens: 1 }, 0.06).hits[0];
    expect(plain.crit).toBeUndefined();
    expect(crit).toMatchObject({ dmg: Math.round(plain.dmg * 1.3), crit: true });
    expect(miss).toMatchObject({ dmg: plain.dmg });
    expect(miss.crit).toBeUndefined();
  });

  it('Piercing Magic adds to the Lens bonus and has no effect alone', () => {
    const plain = duel('fireball', {}, 0).hits[0];
    expect(duel('fireball', { lens: 3, piercing: 3 }, 0).hits[0].dmg).toBe(Math.round(plain.dmg * 1.6));
    expect(duel('fireball', { piercing: 3 }, 0).hits[0]).toMatchObject({ dmg: plain.dmg });
  });

  it('Affliction extends the outgoing slow by five percent', () => {
    const slowFor = (items: Partial<Record<ItemId, number>>) => {
      const { w, hits } = duel('drain', items, 0.5, 1.5);
      expect(hits.length).toBeGreaterThan(0);
      return w.wizards[1].slowUntil - hits[0].t;
    };
    expect(slowFor({ affliction: 2 })).toBeCloseTo(slowFor({}) * 1.05, 2);
  });

  it('Affliction extends Grip by five percent', () => {
    const rootedUntil = (items: Partial<Record<ItemId, number>>) => {
      const w: World = world([[0, 0], [4, 0]], { ...noSpells(), grip: 1 }, [items], () => 0.5);
      stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'grip', at: w.wizards[1].pos }], () => 0.5);
      for (let i = 0; i < 3 * 60; i++) stepWorld(w, [], () => 0.5);
      return w.wizards[1].gripUntil;
    };
    const plain = rootedUntil({});
    expect(plain).toBeGreaterThan(0);
    expect(rootedUntil({ affliction: 2 }) - plain).toBeCloseTo(spellLevel('grip', 1).duration * 0.05, 2);
  });

  it('the sheet shows critical damage only with Lethal Lens', () => {
    const has = (items: Partial<Record<ItemId, number>>) => sheet(noSpells(), { ...noItems(), ...items }).some((r) => r.label === 'Dano do crítico');
    expect(has({ piercing: 3 })).toBe(false);
    expect(has({ lens: 1, piercing: 1 })).toBe(true);
  });
});
