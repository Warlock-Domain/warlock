import { describe, expect, it } from 'vitest';
import { actionFor, keyOf, resetKeys, setKey, setSlotMode } from '../src/client/keys.ts';
import { addPlayer, buy, buyItem, newMatch, sell, startMatch, tickMatch, undoBuy } from '../src/shared/match.ts';

describe('loja só para ver no meio da rodada', () => {
  it('na contagem, na rodada e no fim da rodada nenhuma compra, venda ou desfazer passa (só entre as rodadas)', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    startMatch(m, 0, 1);
    const p = m.players[0];
    p.gold = 999;
    expect(buy(m, 'a', 'lightning')).toBe(true); // na loja vale
    let now = 0;
    for (const phase of ['countdown', 'playing'] as const) {
      while (m.phase !== phase) tickMatch(m, (now = Math.max(now + 17, m.phaseEnds)), []);
      expect([phase, buy(m, 'a', 'homing'), buyItem(m, 'a', 'armor'), sell(m, 'a', 'spell:lightning'), undoBuy(m, 'a', 'spell:lightning')]).toEqual([phase, false, false, false, false]);
    }
    m.phase = 'roundEnd';
    expect(buy(m, 'a', 'homing')).toBe(false);
    expect(p.spells.homing).toBe(0);
  });

  it('a tecla da loja (6, desde 21/10: o 4 é da magia 4) não lança nada nos dois modos; dada a uma magia, as duas trocam (a loja virou atalho trocável)', () => {
    resetKeys();
    expect(keyOf('shop')).toBe('Digit6');
    setSlotMode(false);
    expect(actionFor('Digit6')).toBeUndefined();
    setSlotMode(true);
    expect(actionFor('Digit6')).toBeUndefined();
    setSlotMode(false);
    expect(setKey('lightning', 'Digit6')).toBe(true);
    expect([keyOf('lightning'), keyOf('shop')]).toEqual(['Digit6', 'KeyW']);
    resetKeys();
  });
});

describe('quem caiu já compra (sugestão do Reinaldo, 18/10)', () => {
  it('dead in Rounds can buy and sell mid-round; alive or in Deathmatch cannot', async () => {
    const { addPlayer, buy, canShop, newMatch, startMatch, tickMatch } = await import('../src/shared/match.ts');
    const m = newMatch();
    addPlayer(m, 'a', 'A');
    addPlayer(m, 'b', 'B');
    startMatch(m, 0, 0);
    let now = 0;
    while (m.phase !== 'playing') tickMatch(m, (now = Math.max(now + 17, m.phaseEnds)), []);
    m.players[0].gold = 50;
    expect(canShop(m, 'a')).toBe(false);
    expect(buy(m, 'a', 'lightning')).toBe(false);
    m.world!.wizards.find((z) => z.id === 'a')!.alive = false;
    expect(canShop(m, 'a')).toBe(true);
    expect(buy(m, 'a', 'lightning')).toBe(true);
    expect(m.players[0].spells.lightning).toBe(1);
    m.mode = 'deathmatch';
    expect(canShop(m, 'a')).toBe(false);
  });
});
