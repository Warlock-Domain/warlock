import { describe, expect, it } from 'vitest';
import { RESERVED, SHOP_KEY, actionFor, setKey, setSlotMode } from '../src/client/keys.ts';
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

  it('a tecla da loja (4) não é de magia nem item e não pode virar atalho, nos dois modos de teclas', () => {
    expect(RESERVED.has(SHOP_KEY)).toBe(true);
    expect(setKey('lightning', SHOP_KEY)).toBe(false);
    setSlotMode(false);
    expect(actionFor(SHOP_KEY)).toBeUndefined();
    setSlotMode(true);
    expect(actionFor(SHOP_KEY)).toBeUndefined();
    setSlotMode(false);
  });
});
