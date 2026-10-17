// Itens da loja, convertidos do Warlock Brawl para Dota 2 (shop.lua ITEM_DEFS e npc_items_custom.txt).
// Passivos mudam os números do mago; os 3 ativos usam as teclas 1, 2 e 3. Até MAX_ITEMS itens por jogador.
import { UNIT } from './constants.ts';

export type ItemId = 'ring' | 'cursed_ring' | 'cape' | 'armor' | 'boots' | 'watch' | 'scourge' | 'redirector' | 'pact';
export const ITEM_IDS: ItemId[] = ['ring', 'cursed_ring', 'cape', 'armor', 'boots', 'watch', 'scourge', 'redirector', 'pact'];
export const ACTIVE_ITEMS: ItemId[] = ['scourge', 'redirector', 'pact'];
export const MAX_ITEMS = 6;

// hp: vida máxima a mais; regen: vida por segundo a mais; kb: fração de empurrão a menos; speed: m/s a mais;
// debuff: fração a mais (ou a menos) na duração de lentidões e penalidades
export type ItemLevel = { hp?: number; regen?: number; kb?: number; speed?: number; debuff?: number };

type Item = { name: string; cost: number; key?: string; text: string; levels: ItemLevel[] };

export const ITEMS: Record<ItemId, Item> = {
  ring: { name: 'Anel de vida', cost: 4, text: 'Mais vida máxima.', levels: [{ hp: 10 }, { hp: 19 }, { hp: 27 }, { hp: 34 }, { hp: 40 }] },
  cursed_ring: { name: 'Anel amaldiçoado', cost: 4, text: 'Vida e menos empurrão, mas lentidões duram mais.', levels: [{ hp: 10, kb: 0.15, debuff: 0.25 }, { hp: 20, kb: 0.15, debuff: 0.3 }] },
  cape: { name: 'Capa', cost: 3, text: 'A vida volta mais rápido.', levels: [{ regen: 0.15 }, { regen: 0.25 }, { regen: 0.35 }] },
  armor: { name: 'Armadura', cost: 6, text: 'Menos empurrão.', levels: [{ kb: 0.12 }, { kb: 0.18 }, { kb: 0.22 }] },
  boots: { name: 'Botas', cost: 5, text: 'Anda mais rápido.', levels: [{ speed: 18 * UNIT }, { speed: 29 * UNIT }, { speed: 40 * UNIT }] },
  watch: { name: 'Relógio de bolso', cost: 2, text: 'Lentidões e penalidades duram menos.', levels: [{ debuff: -0.35 }, { debuff: -0.45 }] },
  scourge: { name: 'Flagelo', cost: 7, key: '1', text: 'Explode em volta depois de 0,5 s e empurra quem estiver perto.', levels: [{}, {}, {}] },
  redirector: { name: 'Redirecionador', cost: 8, key: '2', text: 'Desvia seu projétil mais perto do cursor; 8 s voando mais longe.', levels: [{}] },
  pact: { name: 'Pacto', cost: 10, key: '3', text: 'Próxima magia de dano em 5 s faz 1,5×; depois fica lento.', levels: [{}] },
};

// ativos (originais): Flagelo dano 100/110/120 de 1000 em 250 unidades, 0,9 s de preparo, recarga 3 s;
// Redirecionador recarga 24 s, +30% de empurrão por 8 s; Pacto recarga 30 s, 5 s para usar, 1,5×, lentidão de 66 por 6 s
export const SCOURGE = { dmg: [10, 11, 12], radius: 250 * UNIT, windup: 0.5, cd: 3 }; // preparo: 0,9 s no original, 0,5 s a pedido do Fernando (17/10)
// tempo de conjuração dos ativos (o do Flagelo é o preparo de 0,9 s)
export const ITEM_CAST: Partial<Record<ItemId, number>> = { scourge: SCOURGE.windup, redirector: 0.1, pact: 0.1 };
export const REDIRECTOR = { cd: 24, kbPenalty: 0.3, penaltyTime: 8, extraLife: 0.5 };
export const PACT = { cd: 30, window: 5, mult: 1.5, slow: 66 * UNIT, slowTime: 6 };

export const noItems = (): Record<ItemId, number> => Object.fromEntries(ITEM_IDS.map((i) => [i, 0])) as Record<ItemId, number>;

// preço do próximo nível (no original cada nível custa o preço do item de novo); null = no máximo ou sem espaço
export function itemPrice(items: Record<ItemId, number>, id: ItemId): number | null {
  const level = items[id];
  if (level >= ITEMS[id].levels.length) return null;
  if (level === 0 && ITEM_IDS.filter((i) => items[i] > 0).length >= MAX_ITEMS) return null;
  return ITEMS[id].cost;
}

// soma dos passivos
export function itemStats(items: Record<ItemId, number>) {
  const s = { hp: 0, regen: 0, kb: 0, speed: 0, debuff: 0 };
  for (const id of ITEM_IDS) {
    const lvl = items[id];
    if (!lvl) continue;
    const L = ITEMS[id].levels[lvl - 1];
    s.hp += L.hp ?? 0;
    s.regen += L.regen ?? 0;
    s.kb += L.kb ?? 0;
    s.speed += L.speed ?? 0;
    s.debuff += L.debuff ?? 0;
  }
  return s;
}
