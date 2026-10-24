import { describe, expect, it } from 'vitest';
import { SPELL_POOL, crossPlans, legalBuys, mutatePlan } from '../scripts/tournament-plan.ts';
import type { BotPick, BotPlan } from '../src/shared/bots.ts';
import { ITEM_IDS, MAX_ITEMS } from '../src/shared/items.ts';
import { mulberry32 } from '../src/shared/rng.ts';
import { FREE_SPELLS, MAX_SPELLS } from '../src/shared/spells.ts';

const spells: BotPick[] = SPELL_POOL.map((id) => ({ kind: 'spell', id }));
const items: BotPick[] = ITEM_IDS.map((id) => ({ kind: 'item', id }));
const check = (buys: BotPick[]) => {
  expect(buys.filter((b) => b.kind === 'spell')).toHaveLength(MAX_SPELLS - FREE_SPELLS.length);
  expect(buys.filter((b) => b.kind === 'item')).toHaveLength(MAX_ITEMS);
};

describe('limites dos planos do torneio', () => {
  it('reserva as duas magias gratuitas e permite seis itens passivos', () => {
    check(legalBuys([...spells.slice(0, 7), ...items.slice(0, 6)]));
  });
  it('remove magias gratuitas e compras repetidas sem mudar a ordem das outras', () => {
    const free: BotPick[] = FREE_SPELLS.map((id) => ({ kind: 'spell', id }));
    const input = [...free, spells[0], items[0], spells[0], items[0], spells[1]];
    expect(legalBuys(input)).toEqual([spells[0], items[0], spells[1]]);
    expect(input).toHaveLength(free.length + 5);
  });
  it('normaliza pais excedentes no cruzamento e na mutação, com sorteio reproduzível', () => {
    const rng = mulberry32(7);
    let a: BotPlan = { buys: [...spells, ...items], upgrade: 'first' };
    let b: BotPlan = { buys: [...items, ...spells].reverse(), upgrade: 'lowest' };
    for (let i = 0; i < 100; i++) {
      a = mutatePlan(a, rng);
      b = crossPlans(a, b, rng);
      for (const p of [a, b]) {
        expect(p.buys.filter((x) => x.kind === 'spell').length).toBeLessThanOrEqual(MAX_SPELLS - FREE_SPELLS.length);
        expect(p.buys.filter((x) => x.kind === 'item').length).toBeLessThanOrEqual(MAX_ITEMS);
        expect(new Set(p.buys.map((x) => `${x.kind}:${x.id}`)).size).toBe(p.buys.length);
        expect(p.buys.some((x) => x.kind === 'spell' && FREE_SPELLS.includes(x.id))).toBe(false);
      }
    }
  });
});
