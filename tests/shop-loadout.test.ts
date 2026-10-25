import { describe, expect, it } from 'vitest';
import { loadoutSlots, moveLoadout, readLoadout, type LoadoutOrder } from '../src/client/screen-data.ts';
import { actionFor, labelOf, setPadMode, setSlotMode, setSlots } from '../src/client/keys.ts';
import { BTN, padAction } from '../src/client/gamepad.ts';
import { MAX_SPELLS, noSpells, SPELL_IDS } from '../src/shared/spells.ts';

// without Scourge (everyone gets it) so the slots stay short to read
const kit = (more: Partial<ReturnType<typeof noSpells>>) => ({ ...noSpells(), scourge: 0, ...more });

describe('equipment slots in the shop', () => {
  it('swaps occupied slots and moves to an empty key without compacting', () => {
    const p = kit({ illusion: 1 });
    const original = loadoutSlots(p);
    const moved = moveLoadout(original, 0, 5);
    expect(moved.spells).toEqual([null, 'illusion', null, null, null, 'fireball']);
    expect(original.spells[0]).toBe('fireball');
    const swapped = moveLoadout(moved, 1, 5);
    expect(swapped.spells[1]).toBe('fireball');
    expect(swapped.spells[5]).toBe('illusion');
    expect(loadoutSlots(p, swapped).spells).toEqual(swapped.spells);
  });
  it('does not move an empty slot and refuses invalid indices', () => {
    const order = loadoutSlots(kit({}));
    for (const [from, to] of [[0, 6], [6, 0], [-1, 0], [0, 1.5], [2, 3]]) expect(moveLoadout(order, from, to)).toBe(order);
  });
  it('reconciles purchases and sales without duplicating or keeping spells not bought', () => {
    const order = { spells: ['illusion', 'illusion', 'shield', null, null, 'fireball'] } as unknown as LoadoutOrder; // ids repeated on purpose
    const next = loadoutSlots(kit({ illusion: 1, teleport: 1 }), order);
    expect(next.spells).toEqual(['illusion', 'teleport', null, null, null, 'fireball']);
  });
  it('an order saved in the 8-slot layout (#217) is cut to 6; an owned spell past slot 6 takes the first empty slot', () => {
    const old = readLoadout({ spells: ['fireball', null, 'illusion', null, null, null, null, 'teleport'] });
    expect(old?.spells).toHaveLength(MAX_SPELLS);
    expect(loadoutSlots(kit({ illusion: 1, teleport: 1 }), old).spells).toEqual(['fireball', 'teleport', 'illusion', null, null, null]);
  });
  it('an order saved before 21/10 (6 spells and active items) still applies', () => {
    const old = { spells: ['fireball', null, null, null, null, 'illusion'], items: ['scourge', null, 'pact'] } as unknown as LoadoutOrder;
    expect(loadoutSlots(kit({ illusion: 1 }), old).spells).toEqual(['fireball', null, null, null, null, 'illusion']);
  });
  it('keyboard and controller use the new slot even with empty slots', () => {
    setSlotMode(true);
    setSlots([null, 'illusion', null, 'fireball', null, 'pact']);
    expect(actionFor('KeyQ')).toBeUndefined();
    expect(actionFor('KeyR')).toBe('fireball');
    expect(actionFor('KeyF')).toBe('pact');
    expect(actionFor('KeyD')).toBeUndefined();
    expect(padAction(BTN.Y)).toBe('fireball');
    expect(padAction(BTN.LB)).toBeUndefined();
    expect(padAction(BTN.RB)).toBe('pact');
    setPadMode(true);
    expect(labelOf('pact')).toBe('RB');
    setPadMode(false);
    setSlotMode(false);
  });
  it('shows the six slots even without purchases', () => {
    expect(loadoutSlots(kit({ fireball: 0 })).spells).toEqual(Array(6).fill(null));
  });
  it('follows the spell list order when there is no saved order', () => {
    const spells = { ...noSpells(), fireball: 2, illusion: 1 };
    const slots = loadoutSlots(spells);
    expect(slots.spells.filter(Boolean)).toEqual(SPELL_IDS.filter((s) => spells[s] > 0));
    expect(slots.spells.filter((s) => s === null)).toHaveLength(MAX_SPELLS - 3);
  });
});
