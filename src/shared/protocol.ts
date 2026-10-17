// Mensagens entre o navegador e a sala. A única validação do jogo fica aqui: formato e tamanho.
import { MAX_PLAYERS } from './constants.ts';
import type { Match, Phase } from './match.ts';
import type { SimEvent } from './sim.ts';
import { SPELL_IDS, type SpellId } from './spells.ts';

export type ClientMsg =
  | { t: 'hello'; playerId: string; name: string }
  | { t: 'start'; bots: number }
  | { t: 'move'; x: number; y: number; seq: number }
  | { t: 'stop'; seq: number }
  | { t: 'cast'; spell: SpellId; x: number; y: number; seq: number }
  | { t: 'buy'; spell: SpellId }
  | { t: 'ready' }
  | { t: 'alive' };

export type PublicPlayer = {
  id: string; name: string; bot: boolean; color: number; score: number; gold: number;
  spells: Record<SpellId, number>; ready: boolean; connected: boolean;
};

export type PublicRoom = {
  id: string;
  phase: Phase;
  round: number;
  phaseLeft: number; // ms até a fase mudar sozinha
  players: PublicPlayer[];
  ids: string[]; // ordem dos magos no estado compacto ('snap')
  winner: string | null;
  lastRoundWinner: string | null;
  contenders: string[] | null;
};

// w: 7 números por mago na ordem de room.ids: x, y, vx, vy, vida, direção, bits (1 vivo, 2 escudo)
// p: 6 números por projétil: id, tipo (0 fogo, 1 míssil), x, y, vx, vy
// cd: recarga restante das 5 magias de quem recebe, na ordem de SPELL_IDS; ack: último seq aplicado dele
export type Snap = { t: 'snap'; time: number; r: number; s: number; w: number[]; p: number[]; cd: number[]; ack: number; e?: SimEvent[] };

export type ErrorCode = 'not_found' | 'other_tab' | 'full' | 'bad_msg';

export type ServerMsg =
  | { t: 'room'; room: PublicRoom; you: string }
  | Snap
  | { t: 'error'; code: ErrorCode; msg: string };

export const MAX_COORD = 30;
const MAX_MSG = 1024;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const coord = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= MAX_COORD;
const seq = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < 2 ** 31;
const spell = (x: unknown): x is SpellId => SPELL_IDS.includes(x as SpellId);

export function cleanName(raw: unknown): string {
  const name = String(raw ?? '').replace(/[<>]/g, '').trim().slice(0, 20);
  return name || 'Mago';
}

export function parseClientMessage(raw: string): ClientMsg | null {
  if (raw.length > MAX_MSG) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(m)) return null;
  switch (m.t) {
    case 'hello':
      if (typeof m.playerId !== 'string' || !/^[\w-]{8,64}$/.test(m.playerId)) return null;
      return { t: 'hello', playerId: m.playerId, name: cleanName(m.name) };
    case 'start':
      return Number.isInteger(m.bots) && (m.bots as number) >= 0 && (m.bots as number) < MAX_PLAYERS ? { t: 'start', bots: m.bots as number } : null;
    case 'move':
      return coord(m.x) && coord(m.y) && seq(m.seq) ? { t: 'move', x: m.x, y: m.y, seq: m.seq } : null;
    case 'stop':
      return seq(m.seq) ? { t: 'stop', seq: m.seq } : null;
    case 'cast':
      return spell(m.spell) && coord(m.x) && coord(m.y) && seq(m.seq) ? { t: 'cast', spell: m.spell, x: m.x, y: m.y, seq: m.seq } : null;
    case 'buy':
      return spell(m.spell) ? { t: 'buy', spell: m.spell } : null;
    case 'ready':
    case 'alive':
      return { t: m.t };
    default:
      return null;
  }
}

export function publicRoom(id: string, m: Match, now: number): PublicRoom {
  return {
    id,
    phase: m.phase,
    round: m.round,
    phaseLeft: Math.max(0, m.phaseEnds - now),
    players: m.players.map(({ id, name, bot, color, score, gold, spells, ready, connected }) => ({ id, name, bot, color, score, gold, spells, ready, connected })),
    ids: m.world?.wizards.map((z) => z.id) ?? [],
    winner: m.winner,
    lastRoundWinner: m.lastRoundWinner,
    contenders: m.contenders,
  };
}
