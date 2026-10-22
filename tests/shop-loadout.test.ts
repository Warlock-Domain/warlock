import { describe, expect, it } from 'vitest';
import { loadoutSlots, moveLoadout, type LoadoutOrder } from '../src/client/screen-data.ts';
import { actionFor, labelOf, setPadMode, setSlotMode, setSlots } from '../src/client/keys.ts';
import { BTN, padAction } from '../src/client/gamepad.ts';
import { MAX_SPELLS, noSpells, SPELL_IDS } from '../src/shared/spells.ts';

// sem o Flagelo (que todo mundo ganha) para as posições ficarem curtas de ler
const kit = (more: Partial<ReturnType<typeof noSpells>>) => ({ ...noSpells(), scourge: 0, ...more });

describe('posições de equipamento na loja', () => {
  it('troca posições ocupadas e move para uma tecla vazia sem compactar', () => {
    const p = kit({ illusion: 1 });
    const original = loadoutSlots(p);
    const moved = moveLoadout(original, 0, 7);
    expect(moved.spells).toEqual([null, 'illusion', null, null, null, null, null, 'fireball']);
    expect(original.spells[0]).toBe('fireball');
    const swapped = moveLoadout(moved, 1, 7);
    expect(swapped.spells[1]).toBe('fireball');
    expect(swapped.spells[7]).toBe('illusion');
    expect(loadoutSlots(p, swapped).spells).toEqual(swapped.spells);
  });
  it('não move vazio e recusa índices inválidos', () => {
    const order = loadoutSlots(kit({}));
    for (const [from, to] of [[0, 8], [8, 0], [-1, 0], [0, 1.5], [2, 3]]) expect(moveLoadout(order, from, to)).toBe(order);
  });
  it('reconcilia compras e vendas sem duplicar ou manter magias não compradas', () => {
    const order = { spells: ['illusion', 'illusion', 'shield', null, null, 'fireball'] } as unknown as LoadoutOrder; // ids repetidos de propósito
    const next = loadoutSlots(kit({ illusion: 1, teleport: 1 }), order);
    expect(next.spells).toEqual(['illusion', 'teleport', null, null, null, 'fireball', null, null]);
  });
  it('ordem salva antes das 8 vagas (6 magias e itens ativos) vale e ganha as 2 vagas novas vazias', () => {
    const old = { spells: ['fireball', null, null, null, null, 'illusion'], items: ['scourge', null, 'pact'] } as unknown as LoadoutOrder;
    expect(loadoutSlots(kit({ illusion: 1 }), old).spells).toEqual(['fireball', null, null, null, null, 'illusion', null, null]);
  });
  it('teclado e controle usam a nova posição inclusive com vagas vazias', () => {
    setSlotMode(true);
    setSlots([null, 'illusion', null, null, null, 'fireball', null, 'pact']);
    expect(actionFor('KeyQ')).toBeUndefined();
    expect(actionFor('KeyS')).toBe('fireball');
    expect(actionFor('KeyF')).toBe('pact');
    expect(actionFor('KeyA')).toBeUndefined();
    expect(padAction(BTN.RB)).toBe('fireball');
    expect(padAction(BTN.LT)).toBeUndefined();
    expect(padAction(BTN.RT)).toBe('pact');
    setPadMode(true);
    expect(labelOf('pact')).toBe('RT');
    setPadMode(false);
    setSlotMode(false);
  });
  it('mostra as oito vagas mesmo sem compras', () => {
    expect(loadoutSlots(kit({ fireball: 0 })).spells).toEqual(Array(MAX_SPELLS).fill(null));
  });
  it('segue a ordem da lista de magias quando não há ordem salva', () => {
    const spells = { ...noSpells(), fireball: 2, illusion: 1 };
    const slots = loadoutSlots(spells);
    expect(slots.spells.filter(Boolean)).toEqual(SPELL_IDS.filter((s) => spells[s] > 0));
    expect(slots.spells.filter((s) => s === null)).toHaveLength(MAX_SPELLS - 3);
  });
});
