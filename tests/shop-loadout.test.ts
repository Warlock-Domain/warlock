import { describe, expect, it } from 'vitest';
import { loadoutSlots, moveLoadout } from '../src/client/screen-data.ts';
import { actionFor, labelOf, setPadMode, setSlotMode, setSlots } from '../src/client/keys.ts';
import { BTN, padAction } from '../src/client/gamepad.ts';
import { noSpells, SPELL_IDS } from '../src/shared/spells.ts';
import { ACTIVE_ITEMS, noItems } from '../src/shared/items.ts';

describe('posições de equipamento na loja', () => {
  it('troca posições ocupadas e move para uma tecla vazia sem compactar', () => {
    const p = { ...noSpells(), fireball: 1, illusion: 1 };
    const original = loadoutSlots(p, { ...noItems(), scourge: 1, pact: 1 });
    const moved = moveLoadout(original, 0, 5);
    expect(moved.spells).toEqual([null, 'illusion', null, null, null, 'fireball']);
    expect(original.spells[0]).toBe('fireball');
    const swapped = moveLoadout(moved, 1, 5);
    expect(swapped.spells[1]).toBe('fireball');
    expect(swapped.spells[5]).toBe('illusion');
    expect(loadoutSlots(p, noItems(), swapped).spells).toEqual(swapped.spells);
    expect(moveLoadout(original, 6, 8).items).toEqual([null, 'pact', 'scourge']);
  });
  it('não mistura grupos, não move vazio e recusa índices inválidos', () => {
    const order = loadoutSlots({ ...noSpells(), fireball: 1 }, noItems());
    for (const [from, to] of [[0, 6], [6, 0], [-1, 0], [0, 9], [0, 1.5], [2, 3]]) expect(moveLoadout(order, from, to)).toBe(order);
  });
  it('reconcilia compras e vendas sem duplicar ou manter habilidades não compradas', () => {
    const order = { spells: ['illusion', 'illusion', 'shield', null, null, 'fireball'], items: ['ring', 'pact', 'pact'] } as any;
    const next = loadoutSlots({ ...noSpells(), fireball: 1, illusion: 1, teleport: 1 }, { ...noItems(), pact: 1 }, order);
    expect(next.spells).toEqual(['illusion', 'teleport', null, null, null, 'fireball']);
    expect(next.items).toEqual([null, 'pact', null]);
  });
  it('teclado e controle usam a nova posição inclusive com vagas vazias', () => {
    setSlotMode(true);
    setSlots([null, 'illusion', null, null, null, 'fireball'], [null, 'pact', 'scourge']);
    expect(actionFor('KeyQ')).toBeUndefined();
    expect(actionFor('KeyF')).toBe('fireball');
    expect(actionFor('Digit2')).toBe('pact');
    expect(actionFor('Digit1')).toBeUndefined();
    expect(padAction(BTN.RB)).toBe('fireball');
    expect(padAction(BTN.LT)).toBeUndefined();
    expect(padAction(BTN.RT)).toBe('pact');
    setPadMode(true);
    expect(labelOf('pact')).toBe('RT');
    setPadMode(false);
    setSlotMode(false);
  });
  it('mostra seis magias e três itens mesmo sem compras', () => {
    const slots = loadoutSlots(noSpells(), noItems());
    expect(slots.spells).toHaveLength(6);
    expect(slots.items).toEqual([null, null, null]);
  });
  it('segue a ordem da barra e não mistura itens passivos', () => {
    const spells = { ...noSpells(), fireball: 2, illusion: 1 };
    const items = { ...noItems(), ring: 1, scourge: 1 };
    const slots = loadoutSlots(spells, items);
    expect(slots.spells.filter(Boolean)).toEqual(SPELL_IDS.filter((s) => spells[s] > 0));
    expect(slots.items.filter(Boolean)).toEqual(ACTIVE_ITEMS.filter((i) => items[i] > 0));
    expect(slots.items).not.toContain('ring');
    expect(slots.spells.filter((s) => s === null)).toHaveLength(4);
  });
});
