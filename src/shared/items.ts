// Itens da loja, convertidos do Warlock Brawl para Dota 2 (shop.lua ITEM_DEFS e npc_items_custom.txt).
// Equipment has fixed base attributes; Scourge and Addicted Rings are active.
import { UNIT } from './constants.ts';
import type { SpellId } from './spells.ts';

// Scourge last: a new position does not shift saved rooms and preferences
export const ITEM_IDS = ['ring', 'cursed_ring', 'cape', 'armor', 'boots', 'watch', 'vampire',
  'lava_boots', 'warden', 'helmet', 'shock_boots', 'aegis', 'wind_boots', 'lens', 'piercing', 'affliction', 'scourge', 'addicted_rings', 'glitch_cape'] as const;
export type ItemId = (typeof ITEM_IDS)[number];
export const MAX_ITEMS = 6;

// hp: vida máxima a mais; regen: vida por segundo a mais; kb: fração de empurrão a menos; speed: m/s a mais;
// debuff: fração a mais (ou a menos) na duração de lentidões e penalidades; lifesteal: fração do dano causado que volta como vida;
// lava: fração de dano da lava a menos; ward: dano a menos por golpe; range: fração a mais (ou a menos) no alcance das magias;
// crit: chance de crítico no golpe; critDmg: dano a mais no crítico, por cima do CRIT.dmg; afflict: fração a mais na duração das lentidões que você aplica
type ItemLevel = { hp?: number; regen?: number; kb?: number; speed?: number; debuff?: number; lifesteal?: number; lava?: number; ward?: number; range?: number; crit?: number; critDmg?: number; afflict?: number };

// crítico da Lente Letal: +30% de dano; a Magia Perfurante soma por cima (Lente e Perfurante no nível 3: ×1,8). Antes dos ITEMS: o texto da Lente lê daqui
export const CRIT = { dmg: 0.3 };
// magias cujas lentidões e penalidades a Runa da aflição alonga: são todos os debuffs do jogo (decisão do Fernando, 22/10; o Relógio encurta os mesmos, menos a lentidão da Bola de neve, que não passa pelo debuffMult do alvo) e os 4 pontos com afflictBy em sim.ts; magia nova que deixe lento ou preso entra aqui e lá (mudou lá, muda aqui; a dica lê esta lista)
export const AFFLICT_SPELLS: readonly SpellId[] = ['grip', 'drain', 'snowball', 'magnetize', 'pix'];

type Item = { name: string; cost: number; text: string; en: string; textEn: string; levels: ItemLevel[] };

export const ACTIVE_ITEM_SPELL: Partial<Record<ItemId, SpellId>> = { scourge: 'scourge', addicted_rings: 'recharge' };
export const ITEMS: Record<ItemId, Item> = {
  glitch_cape: { name: 'Capa de glitch', en: 'Glitch Cape', cost: 11, text: 'Passivo: troca de lugar com o primeiro projétil inimigo que se aproxima a até 0,78 m. Recarga fixa de 19 s.', textEn: 'Passive: swaps places with the first incoming enemy projectile within 0.78 m. Fixed 19 s cooldown.', levels: [{}] },
  addicted_rings: { name: 'Anéis viciados', en: 'Addicted Rings', cost: 13, text: 'Ativo: lança um projétil de 60 de dano. Ao acertar um inimigo, retorna e reinicia a própria recarga. Acertos seguidos aumentam o dano; errar encerra a sequência. Recarga fixa de 23,5 s.', textEn: 'Active: fires a projectile for 60 damage. Hitting an enemy returns it and resets its own cooldown. Consecutive hits increase damage; a miss ends the streak. Fixed 23.5 s cooldown.', levels: [{}] },
  ring: { name: 'Anel de vida', cost: 4, text: 'Mais vida máxima.', en: 'Ring of Life', textEn: 'More max health.', levels: [{ hp: 100 }, { hp: 190 }, { hp: 270 }] }, // 26/10 (#227): levels 4 and 5 (340 and 400) removed; the first 3 unchanged
  cursed_ring: { name: 'Anel amaldiçoado', cost: 4, text: 'Vida e menos empurrão, mas lentidões duram mais.', en: 'Cursed Ring', textEn: 'Health and less knockback, but slows last longer.', levels: [{ hp: 100, kb: 0.07, debuff: 0.25 }, { hp: 200, kb: 0.07, debuff: 0.3 }, { hp: 300, kb: 0.07, debuff: 0.35 }] } /* 26/10 (#227): level 3 on the same step, to be measured (1.14 in Normal on 19/10) */ /* 18/10 bots humanos: empurrão 10% → 7% (19% acima) */, // ciclo 1 (18/10): empurrão −15% → −10% (1,19×; o Warlock CE fez o mesmo)
  cape: { name: 'Capa', cost: 3, text: 'A vida volta mais rápido.', en: 'Cape', textEn: 'Health comes back faster.', levels: [{ regen: 2.2 }, { regen: 3.5 }, { regen: 4.8 }] }, // 1,5/2,5/3,5 no original; +60% em 17/10; −12% em 19/10 (1,14 a 1,16 no Normal em 3 medições)
  armor: { name: 'Armadura', cost: 6, text: 'Menos empurrão.', en: 'Armor', textEn: 'Less knockback.', levels: [{ kb: 0.12 }, { kb: 0.18 }, { kb: 0.22 }] },
  boots: { name: 'Botas', cost: 5, text: 'Anda mais rápido.', en: 'Boots', textEn: 'Move faster.', levels: [{ speed: 18 * UNIT }, { speed: 29 * UNIT }, { speed: 40 * UNIT }] },
  watch: { name: 'Relógio de bolso', cost: 2, text: 'Lentidões e penalidades duram menos.', en: 'Pocket Watch', textEn: 'Slows and penalties wear off sooner.', levels: [{ debuff: -0.35 }, { debuff: -0.45 }, { debuff: -0.5 }] }, // 26/10 (#227): level 3 with a smaller step (cheap item), Fernando's choice
  // era a maestria Roubo de vida do original (shop.lua MASTERY_GAIN: +9/8/7/6/5/4% por nível, 5 de ouro cada); virou item em 17/10
  vampire: { name: 'Roubo de vida', cost: 5, text: 'Recupera parte do dano que você causa.', en: 'Lifesteal', textEn: 'Heals you for part of the damage you deal.', levels: [0.09, 0.17, 0.24].map((lifesteal) => ({ lifesteal })) }, // 26/10 (#227): levels 4 to 6 (30, 35 and 39%) removed
  // itens novos de 18/10, do catálogo docs/itens-candidatos.md (Warlock CE); números conservadores até a simulação dizer
  lava_boots: { name: 'Botas de lava', cost: 4, text: 'A lava machuca menos.', en: 'Lava Boots', textEn: 'Lava hurts less.', levels: [{ lava: 0.18 }, { lava: 0.3 }, { lava: 0.4 }] }, // 26/10 (#227): level 3 below the 0.5 that already won 22% above fair // ciclo 2: nv 2 0,6 → 0,5; 18/10 bots humanos: 0,35/0,5 → 0,25/0,4 → 0,18/0,3 (26% e 22% acima do justo)
  // Guardião do CE: −0,1 por nível; aqui os golpes são maiores (−0,4 por nível na escala antiga de vida 100, −4 na de 1000), mas nunca corta mais que metade do golpe
  warden: { name: 'Guardião', cost: 4, text: 'Cada golpe tira um pouco menos de vida (até metade dele), mas você voa um pouco mais.', en: 'Warden', textEn: 'Each hit takes a little less health (up to half of it), but you fly a little farther.', levels: [1, 2, 3].map((n) => ({ ward: 4 * n, kb: -0.01 * n })) },
  helmet: { name: 'Elmo', cost: 5, text: 'Menos empurrão, mas suas magias alcançam menos.', en: 'Helmet', textEn: 'Less knockback, but your spells reach less far.', levels: [0.15, 0.2, 0.24].map((kb) => ({ kb, range: -0.1 })) }, // 26/10 (#227): protection grows, the range penalty stays
  shock_boots: { name: 'Botas de choque', cost: 5, text: 'Ao levar um golpe, anda mais rápido por alguns segundos (não soma com as Botas: vale a maior).', en: 'Shock Boots', textEn: 'When hit, move faster for a few seconds (does not stack with Boots: the higher one counts).', levels: [{}, {}, {}] },
  // Wind boots do catálogo (docs/itens-candidatos.md); pedido do Fernando, 18/10: item que serve a qualquer jeito de jogar
  wind_boots: { name: 'Botas de vento', cost: 7, text: 'Depois de alguns segundos sem causar nem levar dano, anda mais rápido até o próximo golpe (não soma com outras botas: vale a maior).', en: 'Wind Boots', textEn: 'After a few seconds without dealing or taking damage, move faster until the next hit (does not stack with other boots: the higher one counts).', levels: [{}, {}, {}] },
  // itens de crítico (issue #184, ideia do Reinaldo): valem para qualquer magia de dano; a Magia Perfurante só soma ao crítico da Lente
  lens: { name: 'Lente Letal', cost: 6, text: `Chance de golpe crítico em todo dano de magia, também em cada tique da Gravidade e do Elo: o crítico causa ${CRIT.dmg * 100}% a mais de dano.`, en: 'Lethal Lens', textEn: `Chance of a critical hit on all spell damage, including each tick of Gravity and Link: a critical hit deals ${CRIT.dmg * 100}% more damage.`, levels: [0.05, 0.1, 0.15].map((crit) => ({ crit })) },
  piercing: { name: 'Magia Perfurante', cost: 4, text: 'Seus golpes críticos causam ainda mais dano (sem a Lente Letal, não há crítico).', en: 'Piercing Magic', textEn: 'Your critical hits deal even more damage (without the Lethal Lens there are no critical hits).', levels: [0.3, 0.4, 0.5].map((critDmg) => ({ critDmg })) },
  affliction: { name: 'Runa da aflição', cost: 3, text: 'Todas as lentidões, prisões e penalidades que você aplica duram mais em quem você acerta.', en: 'Rune of Affliction', textEn: 'All slows, roots and penalties you apply last longer on whoever you hit.', levels: [0.05, 0.1, 0.2].map((afflict) => ({ afflict })) }, // 26/10 (#227): level 3 with a bigger step, Fernando's choice
  // consumable since cycle 4: price, health and distance did not move it off 1.20× (the extra life is the power). Since 26/10 (#227) each level is a charge:
  // a save spends 1 level, so every 7 gold still buys one save
  aegis: { name: 'Égide', cost: 7, text: 'Na lava com pouca vida, volta para a pedra. Cada nível salva você uma vez: ao salvar, perde 1 nível.', en: 'Aegis', textEn: 'In the lava with low health, sends you back to the rock. Each level saves you once: saving you costs 1 level.', levels: [{}, {}, {}] },
  // active item since 26/10 (#227, Fernando's decision): every wizard starts with level 1 for free (startItems) and it takes an item slot.
  // Inside it still fires through the spell path (SPELLS.scourge, cooldown and protocol); the level lives only here and sim.ts copies it
  scourge: { name: 'Flagelo', cost: 7, text: 'Explode em volta depois de um instante e empurra quem estiver perto.', en: 'Scourge', textEn: 'Blasts around you after a moment and knocks back anyone close.', levels: [{}, {}, {}] },
};

// Equipment has one fixed level; retain the authored base stats for every old saved rank.
export const LEGACY_ITEM_MAX = Object.fromEntries(ITEM_IDS.map(id => [id, ITEMS[id].levels.length])) as Record<ItemId, number>;
for (const item of Object.values(ITEMS)) item.levels = item.levels.slice(0, 1);

// Botas de choque: Shock boots do CE (+25 por 3 s); aqui +30 unidades (+14% do passo), contra "quem apanha não consegue fugir"
export const SHOCK_BOOTS = { speed: 30 * UNIT, secs: 3 }; // Fixed level-one duration.
// Botas de vento: Wind boots do CE (+25 com 5 s sem combate); some ao causar ou levar dano (golpe, lava ou chão de fogo)
// Fixed level-one movement bonus and calm period.
export const WIND_BOOTS = { speed: 25 * UNIT, calm: 5 };
// Égide: na lava com até 250 de vida volta para 60% do raio da arena, na mesma direção, parado; uma vez por rodada (por vida no deathmatch)
export const AEGIS = { hp: 250, back: 0.6 };


export const noItems = (): Record<ItemId, number> => Object.fromEntries(ITEM_IDS.map((i) => [i, 0])) as Record<ItemId, number>;
// Keep the free Scourge in its established first slot across HUD, settings and number keys.
export const inventoryOrder = (items: Partial<Record<ItemId, number>>): ItemId[] => [...(items.scourge ? ['scourge' as const] : []), ...ITEM_IDS.filter(id => id !== 'scourge' && (items[id] ?? 0) > 0)];
// every player's match start: the Scourge at level 1 for free (Campaign servants and the training turret use noItems)
export const startItems = (): Record<ItemId, number> => ({ ...noItems(), scourge: 1 });
// level a player casts with: the Scourge's lives in the items (26/10, #227), every other spell's in the spells
export const castLevel = (p: { spells: Record<SpellId, number>; items: Record<ItemId, number> }, s: SpellId) => (s === 'scourge' ? Math.min(1, p.items.scourge) : s === 'recharge' && p.items.addicted_rings > 0 ? 1 : p.spells[s]);

// preço do próximo nível (no original cada nível custa o preço do item de novo); null = no máximo ou sem espaço
export function itemPrice(items: Record<ItemId, number>, id: ItemId): number | null {
  const level = items[id];
  if (level >= ITEMS[id].levels.length) return null;
  if (level === 0 && ITEM_IDS.filter((i) => items[i] > 0).length >= MAX_ITEMS) return null;
  return ITEMS[id].cost;
}

// soma dos passivos
export function itemStats(items: Record<ItemId, number>) {
  const s = { hp: 0, regen: 0, kb: 0, speed: 0, debuff: 0, lifesteal: 0, lava: 0, ward: 0, range: 0, crit: 0, critDmg: 0, afflict: 0 };
  for (const id of ITEM_IDS) {
    const lvl = items[id];
    if (!lvl) continue;
    const L = ITEMS[id].levels[0];
    for (const k of Object.keys(s) as (keyof ItemLevel)[]) s[k] += L[k] ?? 0;
  }
  return s;
}
