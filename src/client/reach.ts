// Círculo de alcance (pedido do Fernando, 18/10: o Raio acertava 13% nas partidas reais, suspeita de lançar fora dos 8 m):
// raio em metros da magia ou item no nível atual, com o multiplicador de alcance dos itens (Elmo); 0 = não mostra.
import { PROJ_R, PROJ_SPAWN } from '../shared/constants.ts';
import { SCOURGE, isActive, itemStats, type ItemId } from '../shared/items.ts';
import { snowR } from '../shared/sim.ts';
import { RUSH, spellLevel, type SpellId } from '../shared/spells.ts';

// projéteis que saem na frente do mago e voam o alcance: o anel marca até onde a ponta chega, então inimigo que encosta
// no anel é atingido (Fernando, 20/10, issue #82; antes ficava 0,8 m curto)
const FLIES = new Set<SpellId>(['fireball', 'cluster', 'snowball', 'magnetize', 'gravity', 'bouncer', 'drain', 'recharge', 'link']);

export function reachOf(a: SpellId | ItemId, spells: Record<SpellId, number>, items: Record<ItemId, number>): number {
  if (isActive(a)) return a === 'scourge' ? SCOURGE.radius : 0; // Flagelo: o raio da explosão
  const lvl = spells[a as SpellId];
  if (!lvl) return 0;
  const L = spellLevel(a as SpellId, lvl);
  // sem alcance fixo, o raio do efeito: a bolha do Escudo e o avanço da Investida
  if (a === 'shield') return L.radius;
  if (a === 'rush') return RUSH.dash;
  if (L.range <= 0) return 0;
  const r = L.range * (1 + itemStats(items).range);
  return FLIES.has(a as SpellId) ? r + PROJ_SPAWN + (a === 'snowball' ? snowR(lvl) : PROJ_R) : r;
}

// Área de efeito no ponto mirado: Meteoro e cipós do Agarrar; 0 = não tem.
export const blastOf = (a: SpellId | ItemId, spells: Record<SpellId, number>) => ((a === 'meteor' || a === 'grip') && spells[a] ? spellLevel(a, spells[a]).radius : 0);
