import { describe, expect, it } from 'vitest';
import { buy, canSell, newMatch, sell, sellValue, startMatch, addPlayer, undoBuy, type Match } from '../src/shared/match.ts';
import { MAX_SPELLS, SPELLS, spellCount } from '../src/shared/spells.ts';

// sala com uma pessoa e um bot, já na loja da rodada 1
function shop(): Match {
  const m = newMatch();
  addPlayer(m, 'a', 'Ana');
  startMatch(m, 0, 1);
  return m;
}

describe('Bola de fogo à venda (pedido do Fernando, 18/10)', () => {
  it('vende o nível 1 grátis por 0 de ouro, fica sem ela e libera a vaga', () => {
    const m = shop();
    const p = m.players[0];
    const gold = p.gold;
    expect(sellValue(p, m.round, 'spell:fireball')).toBe(0);
    expect(canSell(p, m.round, 'spell:fireball')).toBe(true);
    expect(sell(m, 'a', 'spell:fireball')).toBe(true);
    expect(p.spells.fireball).toBe(0);
    expect(p.gold).toBe(gold);
    expect(spellCount(p.spells)).toBe(0);
    expect(canSell(p, m.round, 'spell:fireball')).toBe(false); // nada mais para vender
    // a vaga liberada: cabem 6 magias sem a Bola de fogo
    p.gold = 999;
    const others = (['lightning', 'homing', 'shield', 'teleport', 'swap', 'grip', 'meteor'] as const);
    for (const s of others) buy(m, 'a', s);
    expect(spellCount(p.spells)).toBe(MAX_SPELLS);
    expect(p.spells.meteor).toBe(0); // a 7ª não cabe
  });

  it('compra de volta pelo preço normal (o nível 1 é grátis) e o nível comprado vende como os outros', () => {
    const m = shop();
    const p = m.players[0];
    sell(m, 'a', 'spell:fireball');
    const gold = p.gold;
    expect(SPELLS.fireball.cost).toBe(0);
    expect(buy(m, 'a', 'fireball')).toBe(true);
    expect(p.spells.fireball).toBe(1);
    expect(p.gold).toBe(gold);
    expect(undoBuy(m, 'a', 'spell:fireball')).toBe(true); // desfazer a compra grátis também vale
    expect(p.spells.fireball).toBe(0);
    buy(m, 'a', 'fireball');
    buy(m, 'a', 'fireball'); // nível 2: 7 de ouro
    expect(p.spells.fireball).toBe(2);
    expect(sellValue(p, m.round, 'spell:fireball')).toBe(SPELLS.fireball.up[0]);
    const before = p.gold;
    expect(sell(m, 'a', 'spell:fireball')).toBe(true);
    expect(p.gold).toBe(before + SPELLS.fireball.up[0]);
    expect(p.spells.fireball).toBe(0);
  });

  it('o bot continua com a Bola de fogo', () => {
    const m = shop();
    const bot = m.players.find((q) => q.bot)!;
    expect(bot.spells.fireball).toBeGreaterThan(0);
  });
});
