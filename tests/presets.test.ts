import { describe, expect, it } from 'vitest';
import { noItems, startItems } from '../src/shared/items.ts';
import { noSpells, priceOf } from '../src/shared/spells.ts';
import { boughtKeys, countBuys, presetQueue, readPresets, topUsed, type Preset } from '../src/client/screen-data.ts';

const preset: Preset = { spells: { fireball: 2, lightning: 1 }, items: { boots: 2 }, order: ['lightning', null, 'fireball'] };

describe('build presets', () => {
  it('Use: buys what is missing, spells in bar order and then items, one level at a time', () => {
    const q = presetQueue(preset, { ...noSpells(), fireball: 1 }, noItems(), 999);
    expect(q).toEqual([{ kind: 'spell', id: 'lightning' }, { kind: 'spell', id: 'fireball' }, { kind: 'item', id: 'boots' }, { kind: 'item', id: 'boots' }]);
  });

  it('Use: stops at the first purchase the gold cannot pay, without skipping to a cheaper one', () => {
    const gold = priceOf('lightning', 0)!;
    expect(presetQueue(preset, { ...noSpells(), fireball: 1 }, noItems(), gold)).toEqual([{ kind: 'spell', id: 'lightning' }]);
    expect(presetQueue(preset, { ...noSpells(), fireball: 1 }, noItems(), gold - 1)).toEqual([]);
  });

  it('Use: what is already at the preset level (or above) is not bought again', () => {
    expect(presetQueue(preset, { ...noSpells(), fireball: 3, lightning: 1 }, { ...noItems(), boots: 2 }, 999)).toEqual([]);
  });

  it('Use locks until the room shows the build: the rebuilt queue only empties after all purchases arrive', () => {
    const spells = { ...noSpells(), fireball: 1 }, items = noItems();
    const gold = priceOf('lightning', 0)! + priceOf('fireball', 1)!; // only enough for the 2 spells, nothing left for the boots
    const q = presetQueue(preset, spells, items, gold);
    expect(q).toEqual([{ kind: 'spell', id: 'lightning' }, { kind: 'spell', id: 'fireball' }]);
    // only the first purchase arrived (redraw in between): the rebuilt queue still has the second, the button stays locked
    expect(presetQueue(preset, { ...spells, lightning: 1 }, items, gold - priceOf('lightning', 0)!)).toEqual([{ kind: 'spell', id: 'fireball' }]);
    // both arrived: the leftover gold does not pay for the boots, the rebuilt queue is empty and the button comes back
    expect(presetQueue(preset, { ...spells, lightning: 1, fireball: 2 }, items, 0)).toEqual([]);
  });

  it('reads an old or corrupted save without breaking: an invalid position becomes empty', () => {
    expect(readPresets('lixo')).toEqual([null, null, null]);
    const saved = JSON.stringify([preset, { spells: { nada: 3 }, items: 7, order: 'x' }]);
    expect(readPresets(saved)).toEqual([preset, { spells: {}, items: {}, order: [] }, null]);
    // the empty slot in the middle of the bar stays in place, so spells keep their keys
    expect(readPresets(saved)[0]!.order).toEqual(['lightning', null, 'fireball']);
  });

  it('counted purchase: each new level counts; the free level 1 and selling do not', () => {
    const was = { spells: { ...noSpells(), fireball: 1 }, items: { ...noItems(), boots: 1 } };
    expect(boughtKeys({ spells: noSpells(), items: noItems() }, { spells: { ...noSpells(), fireball: 1 }, items: startItems() })).toEqual([]); // free Scourge: an item since 26/10 (#227)
    expect(boughtKeys(was, { spells: { ...noSpells(), fireball: 3, lightning: 1 }, items: noItems() })).toEqual(['spell:fireball', 'spell:fireball', 'spell:lightning']);
  });

  it('most used: recent purchases weigh more and only the top 3 of each kind', () => {
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
