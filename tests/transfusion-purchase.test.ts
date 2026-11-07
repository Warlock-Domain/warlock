import { expect, it } from 'vitest';
import { botBuy, type BotPlan } from '../src/shared/bots.ts';
import { noSpells } from '../src/shared/spells.ts';
it('never spends FFA gold on an allied-only spell but permits team purchases', () => {
  const plan: BotPlan = { buys: [{ kind: 'spell', id: 'transfusion' }], upgrade: 'first' };
  expect(botBuy({ gold: 25, team: null, spells: noSpells(), plan }, () => .5)).not.toEqual({ kind: 'spell', id: 'transfusion' });
  expect(botBuy({ gold: 25, team: 0, spells: noSpells(), plan }, () => .5)).toEqual({ kind: 'spell', id: 'transfusion' });
});
