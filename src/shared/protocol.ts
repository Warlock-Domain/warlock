// Mensagens entre o navegador e a sala. A única validação do jogo fica aqui: formato e tamanho.
import { isCharacter, type CharacterId } from './characters.ts';
import { MAX_PLAYERS } from './constants.ts';
import { ACTIVE_ITEMS, ITEM_IDS, type ItemId } from './items.ts';
import { MASTERY_IDS, type MasteryId } from './masteries.ts';
import { votesNeeded, type Match, type Mode, type Phase, type Stats, type Vote } from './match.ts';
import type { SimEvent } from './sim.ts';
import { SPELL_IDS, type SpellId } from './spells.ts';
import { TAUNTS } from './taunts.ts';

export type ClientMsg =
  | { t: 'hello'; playerId: string; name: string }
  | { t: 'start'; bots: number; mode?: Mode }
  | { t: 'move'; x: number; y: number; seq: number }
  | { t: 'stop'; seq: number }
  | { t: 'cast'; spell: SpellId; x: number; y: number; seq: number }
  | { t: 'buy'; spell: SpellId }
  | { t: 'pick'; character: CharacterId }
  | { t: 'buyItem'; item: ItemId }
  | { t: 'buyMastery'; mastery: MasteryId | 'all' }
  | { t: 'kick'; target: string }
  | { t: 'undo'; key: string }
  | { t: 'sell'; key: string }
  | { t: 'item'; item: ItemId; x: number; y: number; seq: number }
  | { t: 'vote'; kind: Vote['kind']; target?: string }
  | { t: 'ballot'; yes: boolean }
  | { t: 'taunt'; i: number }
  | { t: 'ready' }
  | { t: 'alive' };

export type PublicPlayer = {
  id: string; name: string; bot: boolean; color: number; character: CharacterId; score: number; gold: number;
  spells: Record<SpellId, number>; items: Record<ItemId, number>; masteries: Record<MasteryId, number>; stats: Stats; bought: string[]; held: Record<string, number[]>; ready: boolean; connected: boolean;
};

export type PublicRoom = {
  id: string;
  phase: Phase;
  mode: Mode;
  round: number;
  phaseLeft: number; // ms até a fase mudar sozinha
  players: PublicPlayer[];
  ids: string[]; // ordem dos magos no estado compacto ('snap')
  winner: string | null;
  lastRoundWinner: string | null;
  // votação aberta, com ids públicos (target também, quando é expulsão); left = ms até fechar; need = SIM para passar
  vote: (Omit<Vote, 'ends'> & { left: number; need: number }) | null;
  pendingMode: Mode | null;
};

// w: 7 números por mago na ordem de room.ids: x, y, vx, vy, vida, direção, bits de estado (ver encodeSnap)
// p: 6 números por projétil: id, tipo (índice em PROJ_KINDS), x, y, vx, vy (no meteoro: raio e segundos até cair)
// cd: recarga restante das magias de quem recebe, na ordem de SPELL_IDS; icd: dos 3 itens ativos (ACTIVE_ITEMS);
// pl: 4 números por obstáculo: x, y, vida em % (0 = quebrado), tipo (índice em OBSTACLE_KINDS)
// rs: só no deathmatch, 1 número por mago na ordem de room.ids: segundos até voltar (0 = vivo)
// sp: velocidade de andar dele agora (botas, lentidão), para a previsão; ack: último seq aplicado dele
// a vida em w vai em pontos; a máxima sai dos itens do jogador (itemStats), que estão na mensagem 'room'
export type Snap = { t: 'snap'; time: number; r: number; s: number; w: number[]; p: number[]; cd: number[]; icd: number[]; sp: number; pl: number[]; rs?: number[]; ack: number; e?: SimEvent[] };

export type ErrorCode = 'not_found' | 'other_tab' | 'full' | 'bad_msg' | 'kicked';

export type ServerMsg =
  | { t: 'room'; room: PublicRoom; you: string }
  | Snap
  | { t: 'error'; code: ErrorCode; msg: string }
  | { t: 'taunt'; id: string; i: number };

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
      if (m.mode !== undefined && m.mode !== 'rounds' && m.mode !== 'deathmatch') return null;
      return Number.isInteger(m.bots) && (m.bots as number) >= 0 && (m.bots as number) < MAX_PLAYERS ? { t: 'start', bots: m.bots as number, mode: m.mode } : null;
    case 'move':
      return coord(m.x) && coord(m.y) && seq(m.seq) ? { t: 'move', x: m.x, y: m.y, seq: m.seq } : null;
    case 'stop':
      return seq(m.seq) ? { t: 'stop', seq: m.seq } : null;
    case 'cast':
      return spell(m.spell) && coord(m.x) && coord(m.y) && seq(m.seq) ? { t: 'cast', spell: m.spell, x: m.x, y: m.y, seq: m.seq } : null;
    case 'buy':
      return spell(m.spell) ? { t: 'buy', spell: m.spell } : null;
    case 'sell':
      return typeof m.key === 'string' && /^(spell|item):[a-z_]{2,20}$/.test(m.key) ? { t: 'sell', key: m.key } : null;
    case 'undo':
      return typeof m.key === 'string' && /^(spell|item|mastery):[a-z_]{2,20}$/.test(m.key) ? { t: 'undo', key: m.key } : null;
    case 'kick':
      return typeof m.target === 'string' && /^p[0-9a-z]{1,8}$/.test(m.target) ? { t: 'kick', target: m.target } : null;
    case 'vote':
      if (m.kind === 'mode') return { t: 'vote', kind: 'mode' };
      return m.kind === 'kick' && typeof m.target === 'string' && /^p[0-9a-z]{1,8}$/.test(m.target) ? { t: 'vote', kind: 'kick', target: m.target } : null;
    case 'ballot':
      return typeof m.yes === 'boolean' ? { t: 'ballot', yes: m.yes } : null;
    case 'taunt':
      return Number.isInteger(m.i) && (m.i as number) >= 0 && (m.i as number) < TAUNTS.length ? { t: 'taunt', i: m.i as number } : null;
    case 'buyMastery':
      return m.mastery === 'all' || MASTERY_IDS.includes(m.mastery as MasteryId) ? { t: 'buyMastery', mastery: m.mastery as MasteryId | 'all' } : null;
    case 'buyItem':
      return ITEM_IDS.includes(m.item as ItemId) ? { t: 'buyItem', item: m.item as ItemId } : null;
    case 'item':
      return ACTIVE_ITEMS.includes(m.item as ItemId) && coord(m.x) && coord(m.y) && seq(m.seq) ? { t: 'item', item: m.item as ItemId, x: m.x, y: m.y, seq: m.seq } : null;
    case 'pick':
      return isCharacter(m.character) ? { t: 'pick', character: m.character } : null;
    case 'ready':
    case 'alive':
      return { t: m.t };
    default:
      return null;
  }
}

// O playerId é o segredo de reconexão: para os outros só vai um apelido curto derivado dele (FNV-1a com o código
// da sala), que não dá para reverter. Assim ninguém copia o id de outro para tomar o lugar dele.
export function publicId(room: string, id: string): string {
  let h = 0x811c9dc5;
  for (const c of room + ':' + id) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return 'p' + h.toString(36);
}

export function publicRoom(id: string, m: Match, now: number): PublicRoom {
  const pub = (x: string) => publicId(id, x);
  return {
    id,
    phase: m.phase,
    mode: m.mode,
    round: m.round,
    phaseLeft: Math.max(0, m.phaseEnds - now),
    players: m.players.map(({ id, name, bot, color, character, score, gold, spells, items, masteries, stats, bought, held, ready, connected }) => ({ id: pub(id), name, bot, color, character, score, gold, spells, items, masteries, stats, bought: bought.map((b) => b.key), held: held ?? {}, ready, connected })),
    ids: m.world?.wizards.map((z) => pub(z.id)) ?? [],
    winner: m.winner && pub(m.winner),
    lastRoundWinner: m.lastRoundWinner && pub(m.lastRoundWinner),
    vote: m.vote && {
      kind: m.vote.kind,
      target: m.vote.kind === 'kick' ? pub(m.vote.target) : m.vote.target,
      by: pub(m.vote.by),
      yes: m.vote.yes.map(pub),
      no: m.vote.no.map(pub),
      left: Math.max(0, m.vote.ends - now),
      need: votesNeeded(m.players.filter((p) => !p.bot && p.connected).length),
    },
    pendingMode: m.pendingMode,
  };
}
