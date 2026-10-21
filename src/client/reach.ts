// Círculo de alcance (pedido do Fernando, 18/10: o Raio acertava 13% nas partidas reais, suspeita de lançar fora dos 8 m):
// raio em metros da magia ou item no nível atual, com o multiplicador de alcance dos itens (Elmo); 0 = não mostra.
import { OBSTACLES, PROJ_R, PROJ_SPAWN, WALL_GAP } from '../shared/constants.ts';
import { SCOURGE, isActive, itemStats, type ItemId } from '../shared/items.ts';
import { snowR, type ProjKind } from '../shared/sim.ts';
import { CLUSTER_FAN, LIGHTNING, RUSH, SPLITTER, THRUST, spellLevel, type SpellId } from '../shared/spells.ts';
import { add, clampLen, len, norm, scale, sub, v, type Vec } from '../shared/vec.ts';

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

// Área de efeito no ponto mirado: Meteoro, cipós do Agarrar, Zona de dobra e Barricada (pedido do Fernando, 21/10, PR #169); 0 = não tem.
export function blastOf(a: SpellId | ItemId, spells: Record<SpellId, number>): number {
  if (!spells[a as SpellId]) return 0; // item ou magia não comprada
  // Barricada não tem raio: o círculo cobre a parede de 3 pedaços, que fica atravessada no ponto
  if (a === 'rockpillar') return WALL_GAP + OBSTACLES.rockpillar.r;
  return a === 'meteor' || a === 'grip' || a === 'warpzone' ? spellLevel(a, spells[a]).radius : 0;
}
