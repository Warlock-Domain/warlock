// Círculo de alcance (pedido do Fernando, 18/10: o Raio acertava 13% nas partidas reais, suspeita de lançar fora dos 8 m):
// raio em metros da magia ou item no nível atual, com o multiplicador de alcance dos itens (Elmo); 0 = não mostra.
import { ACTIVE_ITEMS, SCOURGE, itemStats, type ItemId } from '../shared/items.ts';
import { RUSH, spellLevel, type SpellId } from '../shared/spells.ts';

export function reachOf(a: SpellId | ItemId, spells: Record<SpellId, number>, items: Record<ItemId, number>): number {
  if ((ACTIVE_ITEMS as string[]).includes(a)) return a === 'scourge' ? SCOURGE.radius : 0; // Flagelo: o raio da explosão
  const lvl = spells[a as SpellId];
  if (!lvl) return 0;
  const L = spellLevel(a as SpellId, lvl);
  // sem alcance fixo, o raio do efeito: a bolha do Escudo e o avanço da Investida
  if (a === 'shield') return L.radius;
  if (a === 'rush') return RUSH.dash;
  return L.range > 0 ? L.range * (1 + itemStats(items).range) : 0;
}
