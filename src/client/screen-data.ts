// Decisões das telas sem DOM (testáveis): resultado do fim da partida e ordem da lista de salas.
import type { PublicRoom, RoomInfo } from '../shared/protocol.ts';

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
