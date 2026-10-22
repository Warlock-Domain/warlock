// Decisões das telas sem DOM (testáveis): resultado do fim da partida e ordem da lista de salas.
import type { PublicRoom, RoomInfo } from '../shared/protocol.ts';
import { MAX_SPELLS, SPELL_IDS, type SpellId } from '../shared/spells.ts';
import { ACTIVE_ITEMS, type ItemId } from '../shared/items.ts';
import { store } from './store.ts';

// Sandbox: o servidor manda todos, e o 8388608 marca quem estaria escondido (Caminhada no vento ou véu da Ilusão).
// "Ver invisíveis (teste)" ligado só deixa esses translúcidos; desligado, esconde como numa sala normal.
export function sandboxVisibility(status: number, self: boolean, sandbox: boolean, seeInvis = false): number {
  if (!sandbox || self) return status;
  if (seeInvis) return status & (1024 | 8388608) ? status | 8388608 : status;
  // Remover o marcador de teste sem pôr 2048 revelava a Ilusão a outros humanos.
  return status & (1024 | 8388608) ? (status & ~(1024 | 8388608)) | 2048 : status;
}

const ITEM_SLOTS = 3; // itens ativos nas teclas 1 2 3 (POS_ACTIONS item1 a item3)

// Mesma ordem da barra da partida; vagas não compradas continuam visíveis.
export type LoadoutOrder = { spells: (SpellId | null)[]; items: (ItemId | null)[] };
export function loadoutSlots(spells: Record<SpellId, number>, items: Record<ItemId, number>, order?: LoadoutOrder) {
  const owned = SPELL_IDS.filter((s) => spells[s] > 0);
  const active = ACTIVE_ITEMS.filter((i) => items[i] > 0);
  const arrange = <T extends string>(ids: T[], saved: (T | null)[] | undefined, count: number) => {
    const seen = new Set<T>();
    const result = Array.from({ length: count }, (_, i) => {
      const id = Array.isArray(saved) ? saved[i] : null;
      if (!id || !ids.includes(id) || seen.has(id)) return null;
      seen.add(id);
      return id;
    });
    for (const id of ids) if (!seen.has(id)) {
      const i = result.indexOf(null);
      if (i < 0) break;
      result[i] = id;
      seen.add(id);
    }
    return result;
  };
  return { spells: arrange(owned, order?.spells, MAX_SPELLS), items: arrange(active, order?.items, ITEM_SLOTS) };
}

const ORDER_KEY = 'warlock:loadout-order';
// ordem do meu equipamento, gravada a cada mudança (#226): gravada só ao arrastar, a compra seguinte reordenava
// pela lista de magias e as teclas por posição trocavam de magia sozinhas
export function myLoadout(spells: Record<SpellId, number>, items: Record<ItemId, number>) {
  const saved = store.json<LoadoutOrder>(ORDER_KEY) ?? undefined;
  const order = loadoutSlots(spells, items, saved);
  if (JSON.stringify(order) !== JSON.stringify(saved)) saveLoadout(order);
  return order;
}
export const saveLoadout = (order: LoadoutOrder) => store.set(ORDER_KEY, JSON.stringify(order));

// Índices 0–5 são magias; 6–8 são itens. Nunca misturar os grupos.
export function moveLoadout(order: LoadoutOrder, from: number, to: number): LoadoutOrder {
  const S = MAX_SPELLS;
  if (![from, to].every((i) => Number.isInteger(i) && i >= 0 && i < S + ITEM_SLOTS) || (from < S) !== (to < S)) return order;
  const next = { spells: [...order.spells], items: [...order.items] };
  const slots = from < S ? next.spells : next.items;
  const a = from < S ? from : from - S, b = to < S ? to : to - S;
  if (!slots[a]) return order;
  [slots[a], slots[b]] = [slots[b], slots[a]];
  return next;
}

// fim da partida para quem olha: 'none' sem vencedor ou para quem só assistia
export type EndResult = 'win' | 'loss' | 'none';
export function endResult(r: Pick<PublicRoom, 'players' | 'winner' | 'winnerTeam' | 'mode' | 'goal'>, me: string): EndResult {
  const mine = r.players.find((p) => p.id === me);
  // Times fixos: vence o time; sorteados a cada rodada: todos que chegaram à meta juntos (como em winTitle)
  const champs = r.winnerTeam !== null ? r.players.filter((p) => p.team === r.winnerTeam)
    : r.mode === 'teams' && r.players.filter((p) => p.score >= r.goal).length > 1 ? r.players.filter((p) => p.score >= r.goal)
    : r.players.filter((p) => p.id === r.winner);
  if (!champs.length || !mine) return 'none';
  return champs.includes(mine) ? 'win' : 'loss';
}

// lista de salas: esperando começar primeiro, depois as que acabaram e por último as em jogo; vazias à parte
const RANK: Record<string, number> = { lobby: 0, end: 1 };
export function roomGroups(rooms: RoomInfo[]) {
  const rank = (r: RoomInfo) => RANK[r.phase] ?? 2;
  return { live: rooms.filter((r) => r.players > 0).sort((a, b) => rank(a) - rank(b)), empty: rooms.filter((r) => !r.players) };
}
