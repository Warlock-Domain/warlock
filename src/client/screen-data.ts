// Decisões das telas sem DOM (testáveis): resultado do fim da partida e ordem da lista de salas.
import type { PublicRoom, RoomInfo } from '../shared/protocol.ts';
import { SPELL_IDS, type SpellId } from '../shared/spells.ts';
import { ACTIVE_ITEMS, type ItemId } from '../shared/items.ts';

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
  return { spells: arrange(owned, order?.spells, 6), items: arrange(active, order?.items, 3) };
}

// Índices 0–5 são magias; 6–8 são itens. Nunca misturar os grupos.
export function moveLoadout(order: LoadoutOrder, from: number, to: number): LoadoutOrder {
  if (![from, to].every((i) => Number.isInteger(i) && i >= 0 && i < 9) || (from < 6) !== (to < 6)) return order;
  const next = { spells: [...order.spells], items: [...order.items] };
  const slots = from < 6 ? next.spells : next.items;
  const a = from < 6 ? from : from - 6, b = to < 6 ? to : to - 6;
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
