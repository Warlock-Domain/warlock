// Decisões das telas sem DOM (testáveis): resultado do fim da partida, ordem da lista de salas e textos da Campanha.
import type { ServoKind } from '../shared/campaign.ts';
import { HP_MAX } from '../shared/constants.ts';
import { itemStats } from '../shared/items.ts';
import type { PublicPlayer, PublicRoom, RoomInfo } from '../shared/protocol.ts';
import { t } from './i18n.ts';

// fim da partida para quem olha: 'none' sem vencedor ou para quem só assistia
export type EndResult = 'win' | 'loss' | 'none';
export function endResult(r: Pick<PublicRoom, 'players' | 'winner' | 'winnerTeam' | 'mode' | 'goal' | 'night'>, me: string): EndResult {
  const mine = r.players.find((p) => p.id === me);
  // Campanha: todos os Acesos vencem ou perdem juntos
  if (r.night) return !mine || !r.night.result ? 'none' : r.night.result === 'won' ? 'win' : 'loss';
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

// Campanha: nome dos servos (o servidor manda em português), nome do estágio e a linha de onde a noite está
const SERVO_NAME: Record<ServoKind, string> = { ash: t('Cinzento', 'Ashen'), archer: t('Arqueiro oco', 'Hollow archer') };
export const STAGE_NAME = [t('Charneca Cinzenta', 'Ashen Moor')];
export const playerName = (p: Pick<PublicPlayer, 'name' | 'servo'>) => (p.servo ? SERVO_NAME[p.servo] : p.name);
// vida máxima: a do servo, ou a de sempre com os itens
export const maxHp = (p: Pick<PublicPlayer, 'hpMax' | 'items'> | undefined) => p?.hpMax ?? HP_MAX + (p ? itemStats(p.items).hp : 0);
export function nightLine(n: NonNullable<PublicRoom['night']>, playing: boolean): string {
  const where = t(`Campanha · ${STAGE_NAME[n.stage]}`, `Campaign · ${STAGE_NAME[n.stage]}`);
  return playing && n.fight !== null ? where + t(` · encontro · onda ${n.wave + 1} de ${n.waves}`, ` · encounter · wave ${n.wave + 1} of ${n.waves}`) : where;
}
