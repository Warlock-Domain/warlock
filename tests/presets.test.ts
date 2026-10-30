import { describe, expect, it } from 'vitest';
import { noItems, startItems } from '../src/shared/items.ts';
import { noSpells, priceOf } from '../src/shared/spells.ts';
import { boughtKeys, countBuys, presetQueue, readPresets, topUsed, type Preset } from '../src/client/screen-data.ts';

const preset: Preset = { spells: { fireball: 2, lightning: 1 }, items: { boots: 2 }, order: ['lightning', null, 'fireball'] };

describe('Build presets', () => {
  it('Use buys missing spells in toolbar order, followed by each missing item once', () => {
    const q = presetQueue(preset, { ...noSpells(), fireball: 1 }, noItems(), 999);
    expect(q).toEqual([{ kind: 'spell', id: 'lightning' }, { kind: 'spell', id: 'fireball' }, { kind: 'item', id: 'boots' }]);
  });

  it('Use stops at the first unaffordable purchase without skipping to a cheaper one', () => {
    const gold = priceOf('lightning', 0)!;
    expect(presetQueue(preset, { ...noSpells(), fireball: 1 }, noItems(), gold)).toEqual([{ kind: 'spell', id: 'lightning' }]);
    expect(presetQueue(preset, { ...noSpells(), fireball: 1 }, noItems(), gold - 1)).toEqual([]);
  });

  it('Use does not repurchase owned spells at or above the preset level', () => {
    expect(presetQueue(preset, { ...noSpells(), fireball: 3, lightning: 1 }, { ...noItems(), boots: 2 }, 999)).toEqual([]);
  });

  it('Use stays locked until the room confirms the requested purchases', () => {
    const spells = { ...noSpells(), fireball: 1 }, items = noItems();
    const gold = priceOf('lightning', 0)! + priceOf('fireball', 1)!; // only enough gold for the two spells, none left for Boots
    const q = presetQueue(preset, spells, items, gold);
    expect(q).toEqual([{ kind: 'spell', id: 'lightning' }, { kind: 'spell', id: 'fireball' }]);
    // only the first purchase is confirmed; the remaining purchase keeps the button locked
    expect(presetQueue(preset, { ...spells, lightning: 1 }, items, gold - priceOf('lightning', 0)!)).toEqual([{ kind: 'spell', id: 'fireball' }]);
    // both spells arrived; remaining gold cannot buy Boots, so the queue empties
    expect(presetQueue(preset, { ...spells, lightning: 1, fireball: 2 }, items, 0)).toEqual([]);
  });

  it('reads legacy or malformed saves without crashing and clears invalid slots', () => {
    expect(readPresets('lixo')).toEqual([null, null, null]);
    const saved = JSON.stringify([preset, { spells: { nada: 3 }, items: 7, order: 'x' }]);
    expect(readPresets(saved)).toEqual([{ ...preset, items: { boots: 1 } }, { spells: {}, items: {}, order: [] }, null]);
    // the empty toolbar slot stays in place so spell shortcuts do not move
    expect(readPresets(saved)[0]!.order).toEqual(['lightning', null, 'fireball']);
  });

  it('purchase counts include new spell levels but not free starts or sales', () => {
    const was = { spells: { ...noSpells(), fireball: 1 }, items: { ...noItems(), boots: 1 } };
    expect(boughtKeys({ spells: noSpells(), items: noItems() }, { spells: { ...noSpells(), fireball: 1 }, items: startItems() })).toEqual([]); // free Scourge: an item since 26/10 (#227)
    expect(boughtKeys(was, { spells: { ...noSpells(), fireball: 3, lightning: 1 }, items: noItems() })).toEqual(['spell:fireball', 'spell:fireball', 'spell:lightning']);
  });

  it('recent purchases weigh more and only the top three of each kind are returned', () => {
    let u: Record<string, number> = {};
    for (let i = 0; i < 5; i++) u = countBuys(u, ['spell:fireball']);
    for (let i = 0; i < 6; i++) u = countBuys(u, []);
    u = countBuys(u, ['spell:lightning', 'spell:lightning', 'spell:lightning', 'spell:lightning', 'spell:lightning', 'item:boots']);
    expect(topUsed(u, 'spell')).toEqual(['lightning', 'fireball']);
    expect(topUsed(u, 'item')).toEqual(['boots']);
    for (const s of ['meteor', 'homing', 'rush']) u = countBuys(u, ['spell:' + s]);
    expect(topUsed(u, 'spell')).toHaveLength(3);
  });
});
