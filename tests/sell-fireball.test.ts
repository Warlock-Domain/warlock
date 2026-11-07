import { describe, expect, it } from 'vitest';
import { buy, canSell, newMatch, sell, sellValue, startMatch, addPlayer, undoBuy, type Match } from '../src/shared/match.ts';
import { MAX_SPELLS, SPELLS, spellCount } from '../src/shared/spells.ts';

// room with one person and one bot, already in round 1's shop
function shop(): Match {
  const m = newMatch();
  addPlayer(m, 'a', 'Ana');
  startMatch(m, 0, 1);
  return m;
}

describe('Fireball for sale (request by Fernando, 18/10)', () => {
  it('sells the free level 1 for 0 gold, goes without it and frees the slot', () => {
    const m = shop();
    const p = m.players[0];
    const gold = p.gold;
    expect(sellValue(p, m.round, 'spell:fireball')).toBe(0);
    expect(canSell(p, m.round, 'spell:fireball')).toBe(true);
    expect(sell(m, 'a', 'spell:fireball')).toBe(true);
    expect(p.spells.fireball).toBe(0);
    expect(p.gold).toBe(gold);
    expect(spellCount(p.spells)).toBe(0); // the free Scourge is an item since 26/10 (#227)
    expect(canSell(p, m.round, 'spell:fireball')).toBe(false); // nothing left to sell
    // the freed slot: 6 bought spells fit, without Fireball
    p.gold = 999;
    const others = (['lightning', 'homing', 'shield', 'teleport', 'swap', 'grip', 'meteor', 'rush'] as const);
    for (const s of others) buy(m, 'a', s);
    expect(spellCount(p.spells)).toBe(MAX_SPELLS);
    expect(p.spells.rush).toBe(0); // the 9th does not fit
  });

  it('buys it back at the normal price (level 1 is free) and the bought level sells like the others', () => {
    const m = shop();
    const p = m.players[0];
    sell(m, 'a', 'spell:fireball');
    const gold = p.gold;
    expect(SPELLS.fireball.cost).toBe(0);
    expect(buy(m, 'a', 'fireball')).toBe(true);
    expect(p.spells.fireball).toBe(1);
    expect(p.gold).toBe(gold);
    expect(undoBuy(m, 'a', 'spell:fireball')).toBe(true); // undoing the free purchase works too
    expect(p.spells.fireball).toBe(0);
    buy(m, 'a', 'fireball');
    buy(m, 'a', 'fireball'); // level 2: 7 gold
    expect(p.spells.fireball).toBe(2);
    expect(sellValue(p, m.round, 'spell:fireball')).toBe(SPELLS.fireball.up[0]);
    const before = p.gold;
    expect(sell(m, 'a', 'spell:fireball')).toBe(true);
    expect(p.gold).toBe(before + SPELLS.fireball.up[0]);
    expect(p.spells.fireball).toBe(0);
  });

  it('the bot keeps its Fireball', () => {
    const m = shop();
    const bot = m.players.find((q) => q.bot)!;
    expect(bot.spells.fireball).toBeGreaterThan(0);
  });
});
