// Círculo de alcance (pedido do Fernando, 18/10: o Raio acertava 13% nas partidas reais, suspeita de lançar fora dos 8 m):
// raio em metros da magia ou item no nível atual, com o multiplicador de alcance dos itens (Elmo); 0 = não mostra.
import { PROJ_R, PROJ_SPAWN, WIZ_R } from '../shared/constants.ts';
import { SCOURGE, isActive, itemStats, type ItemId } from '../shared/items.ts';
import { snowR, type ProjKind } from '../shared/sim.ts';
import { CLUSTER_FAN, RUSH, spellLevel, type SpellId } from '../shared/spells.ts';
import { add, clampLen, norm, scale, sub, v, type Vec } from '../shared/vec.ts';

// projéteis que saem na frente do mago e voam o alcance: o anel marca até onde a ponta chega, então inimigo que encosta
// no anel é atingido (Fernando, 20/10, issue #82; antes ficava 0,8 m curto)
const FLIES = new Set<SpellId>(['fireball', 'cluster', 'grip', 'snowball', 'magnetize', 'gravity', 'bouncer', 'drain', 'recharge', 'link']);

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

// raio da explosão no ponto mirado (Meteoro), desenhado em volta do ponto onde ele cai; 0 = não tem
export const blastOf = (a: SpellId | ItemId, spells: Record<SpellId, number>) => (a === 'meteor' && spells.meteor ? spellLevel('meteor', spells.meteor).radius : 0);

// largura do acerto na mira (pedido do Fernando, 21/10: ninguém sabia quanto o Raio e os projéteis pegam de lado):
// meia largura da faixa onde o CENTRO do inimigo é atingido, a mesma conta do firstOnSegment em sim.ts (WIZ_R + raio do projétil).
// Bumerangue (curva), Míssil (persegue) e Divisor (não acerta, só estoura) ficam sem faixa: a reta mentiria.
const HALF: Partial<Record<SpellId, number>> = { lightning: WIZ_R, ...Object.fromEntries(['fireball', 'cluster', 'grip', 'magnetize', 'bouncer', 'recharge', 'link', 'swap', 'drain'].map((s) => [s, WIZ_R + PROJ_R])) };

// faixas do mago até onde cada projétil chega e o círculo da explosão, para a mira de `from` em direção a `at`
export function aimOf(a: SpellId | ItemId, spells: Record<SpellId, number>, items: Record<ItemId, number>, from: Vec, at: Vec) {
  const reach = reachOf(a, spells, items);
  const lvl = spells[a as SpellId];
  const none = { ends: [] as Vec[], half: 0, blastAt: null as Vec | null, blastR: 0 };
  if (!reach) return none;
  const d = norm(sub(at, from));
  const tip = (r: number) => add(from, scale(d, r));
  // Meteoro: só a explosão no ponto mirado, sem passar do alcance
  if (a === 'meteor') return { ...none, blastAt: add(from, clampLen(sub(at, from), reach)), blastR: blastOf(a, spells) };
  // Drenar vira para o mago mais perto no ponto mirado: a reta só vale até ali
  if (a === 'drain') return { ...none, ends: [add(from, clampLen(sub(at, from), reach))], half: HALF.drain! };
  // a Bola de neve explode onde o voo acaba (centro dela, um raio antes da ponta), pegando o centro de quem está dentro
  if (a === 'snowball') return { ends: [tip(reach)], half: WIZ_R + snowR(lvl), blastAt: tip(reach - snowR(lvl)), blastR: spellLevel('snowball', lvl).radius };
  // a Gravidade não bate em ninguém: queima quem fica a um raio do caminho, até sumir no fim do voo
  if (a === 'gravity') {
    const r = spellLevel('gravity', lvl).radius;
    return { ends: [tip(reach)], half: r, blastAt: tip(reach - PROJ_R), blastR: r };
  }
  if (a === 'cluster') return { ...none, ends: CLUSTER_FAN.map((o) => add(from, scale(v(d.x * Math.cos(o) - d.y * Math.sin(o), d.x * Math.sin(o) + d.y * Math.cos(o)), reach))), half: HALF.cluster! };
  const half = HALF[a as SpellId];
  return half ? { ...none, ends: [tip(reach)], half } : none;
}

// "Ver hitbox (teste)" da sandbox: raio no chão de cada coisa, escolhido para que círculos que se encostam = acerto
// (firstOnSegment testa centro a centro com WIZ_R + raio do projétil). A Bola de neve usa o nível 1 (no 7 são 8 cm a mais);
// Meteoro, Zona de dobra e Gravidade não batem em mago e já mostram a própria área
export const hitR = (k: ProjKind) => (k === 'illusion' ? WIZ_R : k === 'snowball' ? snowR(1) : k === 'meteor' || k === 'warpzone' || k === 'gravity' ? 0 : PROJ_R);
