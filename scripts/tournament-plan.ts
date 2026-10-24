import type { BotPick, BotPlan } from '../src/shared/bots.ts';
import { ITEM_IDS, MAX_ITEMS } from '../src/shared/items.ts';
import { FREE_SPELLS, MAX_SPELLS, SPELL_IDS } from '../src/shared/spells.ts';

export const SPELL_POOL = SPELL_IDS.filter((s) => !FREE_SPELLS.includes(s));
const POOL: BotPick[] = [...SPELL_POOL.map((id): BotPick => ({ kind: 'spell', id })), ...ITEM_IDS.map((id): BotPick => ({ kind: 'item', id }))];
const key = (b: BotPick) => b.kind + ':' + b.id;
const pick = <T>(a: readonly T[], rand: () => number) => a[Math.floor(rand() * a.length)];

// O plano só contém compras: desconta todas as magias gratuitas; os itens não têm vaga gratuita reservada.
export function legalBuys(buys: readonly BotPick[]): BotPick[] {
  const seen = new Set<string>();
  let spells = 0, items = 0;
  return buys.filter((b) => {
    if (seen.has(key(b)) || (b.kind === 'spell' && FREE_SPELLS.includes(b.id))) return false;
    if (b.kind === 'spell' ? spells >= MAX_SPELLS - FREE_SPELLS.length : items >= MAX_ITEMS) return false;
    seen.add(key(b));
    if (b.kind === 'spell') spells++;
    else items++;
    return true;
  });
}

export function mutatePlan(p: BotPlan, rand: () => number): BotPlan {
  const buys = legalBuys(p.buys);
  const fresh = POOL.filter((b) => !buys.some((x) => key(x) === key(b)));
  const r = rand();
  if (r < .45 && buys.length) buys[Math.floor(rand() * buys.length)] = pick(fresh, rand);
  else if (r < .85) buys.splice(Math.floor(rand() * (buys.length + 1)), 0, pick(fresh, rand));
  else if (buys.length > 1) buys.splice(Math.floor(rand() * buys.length), 1);
  const upgrade = rand() < .1 ? pick(['lowest', 'first', 'random'] as const, rand) : p.upgrade;
  return { buys: legalBuys(buys), upgrade };
}

export function crossPlans(a: BotPlan, b: BotPlan, rand: () => number): BotPlan {
  const head = a.buys.slice(0, 1 + Math.floor(rand() * a.buys.length));
  const tail = b.buys.slice(Math.floor(rand() * b.buys.length));
  return { buys: legalBuys([...head, ...tail]), upgrade: rand() < .5 ? a.upgrade : b.upgrade };
}
