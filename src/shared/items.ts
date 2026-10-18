// Itens da loja, convertidos do Warlock Brawl para Dota 2 (shop.lua ITEM_DEFS e npc_items_custom.txt).
// Passivos mudam os números do mago; os 3 ativos usam as teclas 1, 2 e 3. Até MAX_ITEMS itens por jogador.
import { UNIT } from './constants.ts';

export type ItemId = 'ring' | 'cursed_ring' | 'cape' | 'armor' | 'boots' | 'watch' | 'vampire' | 'scourge' | 'redirector' | 'pact'
  | 'lava_boots' | 'warden' | 'helmet' | 'shock_boots' | 'aegis' | 'wind_boots';
export const ITEM_IDS: ItemId[] = ['ring', 'cursed_ring', 'cape', 'armor', 'boots', 'watch', 'vampire', 'scourge', 'redirector', 'pact',
  'lava_boots', 'warden', 'helmet', 'shock_boots', 'aegis', 'wind_boots'];
export const ACTIVE_ITEMS: ItemId[] = ['scourge', 'redirector', 'pact'];
export const MAX_ITEMS = 6;

// hp: vida máxima a mais; regen: vida por segundo a mais; kb: fração de empurrão a menos; speed: m/s a mais;
// debuff: fração a mais (ou a menos) na duração de lentidões e penalidades; lifesteal: fração do dano causado que volta como vida;
// lava: fração de dano da lava a menos; ward: dano a menos por golpe; range: fração a mais (ou a menos) no alcance das magias
export type ItemLevel = { hp?: number; regen?: number; kb?: number; speed?: number; debuff?: number; lifesteal?: number; lava?: number; ward?: number; range?: number };

type Item = { name: string; cost: number; key?: string; text: string; levels: ItemLevel[] };

export const ITEMS: Record<ItemId, Item> = {
  ring: { name: 'Anel de vida', cost: 4, text: 'Mais vida máxima.', levels: [{ hp: 100 }, { hp: 190 }, { hp: 270 }, { hp: 340 }, { hp: 400 }] },
  cursed_ring: { name: 'Anel amaldiçoado', cost: 4, text: 'Vida e menos empurrão, mas lentidões duram mais.', levels: [{ hp: 100, kb: 0.1, debuff: 0.25 }, { hp: 200, kb: 0.1, debuff: 0.3 }] }, // ciclo 1 (18/10): empurrão −15% → −10% (1,19×; o Warlock CE fez o mesmo)
  cape: { name: 'Capa', cost: 3, text: 'A vida volta mais rápido.', levels: [{ regen: 2.5 }, { regen: 4 }, { regen: 5.5 }] }, // 1,5/2,5/3,5 no original; +60% em 17/10
  armor: { name: 'Armadura', cost: 6, text: 'Menos empurrão.', levels: [{ kb: 0.12 }, { kb: 0.18 }, { kb: 0.22 }] },
  boots: { name: 'Botas', cost: 5, text: 'Anda mais rápido.', levels: [{ speed: 18 * UNIT }, { speed: 29 * UNIT }, { speed: 40 * UNIT }] },
  watch: { name: 'Relógio de bolso', cost: 2, text: 'Lentidões e penalidades duram menos.', levels: [{ debuff: -0.35 }, { debuff: -0.45 }] },
  // era a maestria Roubo de vida do original (shop.lua MASTERY_GAIN: +9/8/7/6/5/4% por nível, 5 de ouro cada); virou item em 17/10
  vampire: { name: 'Roubo de vida', cost: 5, text: 'Recupera parte do dano que você causa.', levels: [0.09, 0.17, 0.24, 0.3, 0.35, 0.39].map((lifesteal) => ({ lifesteal })) },
  scourge: { name: 'Flagelo', cost: 7, key: '1', text: 'Explode em volta depois de 0,5 s e empurra quem estiver perto.', levels: [{}, {}, {}] },
  redirector: { name: 'Redirecionador', cost: 8, key: '2', text: 'Desvia todos os seus projéteis voando para o cursor.', levels: [{}] },
  pact: { name: 'Pacto', cost: 10, key: '3', text: 'Próxima magia de dano em 5 s faz 2× de dano e empurrão.', levels: [{}] },
  // itens novos de 18/10, do catálogo docs/itens-candidatos.md (Warlock CE); números conservadores até a simulação dizer
  lava_boots: { name: 'Botas de lava', cost: 4, text: 'A lava machuca menos.', levels: [{ lava: 0.35 }, { lava: 0.5 }] }, // ciclo 2: nv 2 0,6 → 0,5 (1,35× no nv 2)
  // Guardião do CE: −0,1 por nível; aqui os golpes são maiores (−0,4 por nível na escala antiga de vida 100, −4 na de 1000), mas nunca corta mais que metade do golpe
  warden: { name: 'Guardião', cost: 4, text: 'Cada golpe tira um pouco menos de vida (até metade dele), mas você voa um pouco mais.', levels: [1, 2, 3].map((n) => ({ ward: 4 * n, kb: -0.01 * n })) },
  helmet: { name: 'Elmo', cost: 5, text: 'Menos empurrão, mas suas magias alcançam menos.', levels: [{ kb: 0.15, range: -0.1 }] },
  shock_boots: { name: 'Botas de choque', cost: 5, text: 'Ao levar um golpe, anda mais rápido por 3 s (não soma com as Botas: vale a maior).', levels: [{}] },
  // consumível desde o ciclo 4: preço, vida e distância não a tiravam de 1,20× (a vida extra é o poder); some ao salvar
  // Wind boots do catálogo (docs/itens-candidatos.md); pedido do Fernando, 18/10: item que serve a qualquer jeito de jogar
  wind_boots: { name: 'Botas de vento', cost: 7, text: 'Depois de 5 s sem causar nem levar dano, anda mais rápido até o próximo golpe (não soma com outras botas: vale a maior).', levels: [{}] },
  aegis: { name: 'Égide', cost: 7, text: 'Na lava com pouca vida, volta para a pedra. Quebra ao salvar você (compre de novo).', levels: [{}] },
};

// Botas de choque: Shock boots do CE (+25 por 3 s); aqui +30 unidades (+14% do passo), contra "quem apanha não consegue fugir"
export const SHOCK_BOOTS = { speed: 30 * UNIT, secs: 3 };
// Botas de vento: Wind boots do CE (+25 com 5 s sem combate); some ao causar ou levar dano (golpe, lava ou chão de fogo)
export const WIND_BOOTS = { speed: 25 * UNIT, calm: 5 };
// Égide: na lava com até 250 de vida volta para 60% do raio da arena, na mesma direção, parado; uma vez por rodada (por vida no deathmatch)
export const AEGIS = { hp: 250, back: 0.6 };

// ativos (originais): Flagelo dano 100/110/120 de 1000 em 250 unidades, 0,9 s de preparo, recarga 3 s;
// Redirecionador recarga 24 s, +30% de empurrão por 8 s; Pacto no original: recarga 30 s, 5 s para usar, 1,5×, lentidão de 66 por 6 s
// dano 100/110/120 no original; 100/130/160 no balanceamento de 17/10 (quase ninguém evoluía: nível médio 1,01)
// 17/10 (pedido do Fernando): área 250 → 325 e dano 100/130/160 → 80/100/120
export const SCOURGE = { dmg: [80, 100, 120], radius: 325 * UNIT, windup: 0.5, cd: 5 }; // recarga 3 s no original; 5 s no balanceamento de 17/10 // preparo: 0,9 s no original, 0,5 s a pedido do Fernando (17/10)
// tempo de conjuração dos ativos (o do Flagelo é o preparo de 0,9 s)
export const ITEM_CAST: Partial<Record<ItemId, number>> = { scourge: SCOURGE.windup, redirector: 0.1, pact: 0.1 };
// consertado em 18/10 (pedido do Fernando): sem a penalidade de +30% de empurrão por 8 s, recarga 24 → 12 s, desvia todos e não gasta sem projétil
export const REDIRECTOR = { cd: 12, extraLife: 0.5 };
// balanceamento de 17/10 (5 rodadas com ele, 0 vitórias): 2×, sem lentidão, recarga 20 s
export const PACT = { cd: 20, window: 5, mult: 2 };

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
  const s = { hp: 0, regen: 0, kb: 0, speed: 0, debuff: 0, lifesteal: 0, lava: 0, ward: 0, range: 0 };
  for (const id of ITEM_IDS) {
    const lvl = items[id];
    if (!lvl) continue;
    const L = ITEMS[id].levels[lvl - 1];
    s.hp += L.hp ?? 0;
    s.regen += L.regen ?? 0;
    s.kb += L.kb ?? 0;
    s.speed += L.speed ?? 0;
    s.debuff += L.debuff ?? 0;
    s.lifesteal += L.lifesteal ?? 0;
    s.lava += L.lava ?? 0;
    s.ward += L.ward ?? 0;
    s.range += L.range ?? 0;
  }
  return s;
}
