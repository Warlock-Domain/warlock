// Mensagens entre o navegador e a sala. A única validação do jogo fica aqui: formato e tamanho.
import type { ArenaId } from './arena.ts';
import { BOT_SKILL, type BotSkill } from './bots.ts';
import { isCharacter, type CharacterId } from './characters.ts';
import { MAX_PLAYERS } from './constants.ts';
import { ACTIVE_ITEMS, ITEM_IDS, type ItemId } from './items.ts';
import { MODES, OPTION_CHOICES, goalOf, parseOpt, votesNeeded, type Match, type MatchOpts, type Mode, type Phase, type Stats, type Vote } from './match.ts';
import type { SimEvent } from './sim.ts';
import { MAX_SPELLS, MAX_SPELL_LEVEL, SPELL_IDS, noSpells, spellCount, type SpellId } from './spells.ts';
import { TAUNTS } from './taunts.ts';

// treino: magias, itens e jeito de jogar escolhidos para um bot (só vale com um humano na sala; ver startMatch)
export type BotSetup = { spells?: Partial<Record<SpellId, number>>; items?: Partial<Record<ItemId, number>>; skill?: Partial<BotSkill> };

export type ClientMsg =
  | { t: 'hello'; playerId: string; name: string }
  // shuffle: Times sorteados a cada rodada (padrão) ou fixos; opts: opções da partida; setup[i]: configuração do bot i+1 no treino
  | { t: 'start'; bots: number; mode?: Mode; shuffle?: boolean; opts?: Partial<MatchOpts>; setup?: BotSetup[] }
  | { t: 'move'; x: number; y: number; seq: number }
  | { t: 'stop'; seq: number }
  | { t: 'cast'; spell: SpellId; x: number; y: number; seq: number }
  | { t: 'buy'; spell: SpellId }
  | { t: 'pick'; character: CharacterId }
  | { t: 'buyItem'; item: ItemId }
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
  spells: Record<SpellId, number>; items: Record<ItemId, number>; stats: Stats; bought: string[]; held: Record<string, number[]>; ready: boolean; connected: boolean; team: number | null;
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
  teamShuffle: boolean;
  pendingShuffle: boolean | null;
  winnerTeam: number | null;
  opts: MatchOpts; // opções da partida
  pendingOpts: Partial<MatchOpts>; // opções votadas para a próxima rodada
  botDelta: number; // bots votados para entrar (+) ou sair (−) na próxima rodada
  goal: number; // pontos para vencer no modo atual (rodadas; abates no Deathmatch)
  arena: ArenaId | null; // formato da arena desta rodada (null sem rodada)
};

// w: 7 números por mago na ordem de room.ids: x, y, vx, vy, vida, direção, bits de estado (ver encodeSnap)
// p: 6 números por projétil: id, tipo (índice em PROJ_KINDS), x, y, vx, vy (no meteoro: raio e segundos até cair)
// cd: recarga restante das magias de quem recebe, na ordem de SPELL_IDS; icd: dos 3 itens ativos (ACTIVE_ITEMS);
// ch: montes de ouro dos baús (3 números por monte: x, y, quanto falta); lp: progresso de cada mago (0 a 1) até o próximo ouro do monte, na ordem de room.ids
// pl: 4 números por obstáculo: x, y, vida em % (0 = quebrado), tipo (índice em OBSTACLE_KINDS)
// rs: só no deathmatch, 1 número por mago na ordem de room.ids: segundos até voltar (0 = vivo)
// sp: velocidade de andar dele agora (botas, lentidão), para a previsão; ack: último seq aplicado dele
// a vida em w vai em pontos; a máxima sai dos itens do jogador (itemStats), que estão na mensagem 'room'
export type Snap = { t: 'snap'; time: number; r: number; s: number; w: number[]; p: number[]; cd: number[]; icd: number[]; sp: number; pl: number[]; rs?: number[]; ch?: number[]; lp?: number[]; ru?: number[]; ab?: number[]; zn?: number[]; il?: number[]; ack: number; e?: SimEvent[] };

// lista de salas do lobby; mode, round e bots entraram depois: salas gravadas antes não têm (o cliente aceita sem)
export type RoomInfo = { id: string; players: number; phase: string; mode?: string; round?: number; bots?: number };

type ErrorCode = 'not_found' | 'other_tab' | 'full' | 'bad_msg' | 'kicked';

export type ServerMsg =
  | { t: 'room'; room: PublicRoom; you: string }
  | Snap
  | { t: 'error'; code: ErrorCode; msg: string }
  | { t: 'taunt'; id: string; i: number };

const MAX_COORD = 30;
const MAX_MSG = 2048; // 'start' com 7 bots configurados: ~1,0 KB só com magias, ~1,7 KB com magias e itens (medido em 19/10)

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const coord = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= MAX_COORD;
const seq = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < 2 ** 31;
const spell = (x: unknown): x is SpellId => SPELL_IDS.includes(x as SpellId);
const pubId = (x: unknown): x is string => typeof x === 'string' && /^p[0-9a-z]{1,8}$/.test(x);

export function cleanName(raw: unknown): string {
  const name = String(raw ?? '').replace(/[<>]/g, '').trim().slice(0, 20);
  return name || 'Mago';
}

// opções da partida: só chaves conhecidas e só os valores da lista de cada uma
function parseOpts(x: unknown): Partial<MatchOpts> | null {
  if (!isObj(x)) return null;
  for (const [k, val] of Object.entries(x)) if (!(k in OPTION_CHOICES) || !(OPTION_CHOICES[k as keyof MatchOpts] as readonly unknown[]).includes(val)) return null;
  return x as Partial<MatchOpts>;
}

// configuração dos bots: níveis válidos (até MAX_SPELLS magias, contando a Bola de fogo que já vem) e skill dentro do que os bots
// já usam (cada chave até o maior entre Fácil, Normal e Difícil; rate pelo menos o do Fácil, para ninguém pedir 999 decisões por segundo)
const SKILL_KEYS = Object.keys(BOT_SKILL.normal) as (keyof BotSkill)[];
const level = (x: unknown, max: number) => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= max;
function parseSetup(x: unknown): BotSetup[] | null {
  if (!Array.isArray(x) || x.length > MAX_PLAYERS - 1) return null;
  const out: BotSetup[] = [];
  for (const b of x) {
    if (!isObj(b)) return null;
    const { spells, items, skill } = b;
    if (spells !== undefined && (!isObj(spells) || !Object.entries(spells).every(([k, n]) => spell(k) && level(n, MAX_SPELL_LEVEL)) || spellCount({ ...noSpells(), ...spells }) > MAX_SPELLS)) return null;
    if (items !== undefined && (!isObj(items) || !Object.entries(items).every(([k, n]) => ITEM_IDS.includes(k as ItemId) && level(n, 6)))) return null;
    if (skill !== undefined && (!isObj(skill) || !Object.entries(skill).every(([k, n]) => SKILL_KEYS.includes(k as keyof BotSkill) && typeof n === 'number' && Number.isFinite(n)))) return null;
    const clamp = (k: keyof BotSkill, n: number) => Math.min(Math.max(...Object.values(BOT_SKILL).map((s) => s[k])), Math.max(k === 'rate' ? BOT_SKILL.easy.rate : 0, n));
    out.push({
      ...(spells && { spells: spells as BotSetup['spells'] }),
      ...(items && { items: items as BotSetup['items'] }),
      ...(skill && { skill: Object.fromEntries(Object.entries(skill).map(([k, n]) => [k, clamp(k as keyof BotSkill, n as number)])) }),
    });
  }
  return out;
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
    case 'start': {
      if (m.mode !== undefined && !MODES.includes(m.mode as Mode)) return null;
      if (m.shuffle !== undefined && typeof m.shuffle !== 'boolean') return null;
      const opts = m.opts === undefined ? undefined : parseOpts(m.opts);
      if (opts === null) return null;
      const setup = m.setup === undefined ? undefined : parseSetup(m.setup);
      if (setup === null) return null;
      if (!Number.isInteger(m.bots) || (m.bots as number) < 0 || (m.bots as number) >= MAX_PLAYERS) return null;
      // sem opções nem configuração, a mensagem fica como era antes delas
      return { t: 'start', bots: m.bots as number, mode: m.mode as Mode | undefined, shuffle: m.shuffle, ...(opts && { opts }), ...(setup && { setup }) };
    }
    case 'move':
      return coord(m.x) && coord(m.y) && seq(m.seq) ? { t: 'move', x: m.x, y: m.y, seq: m.seq } : null;
    case 'stop':
      return seq(m.seq) ? { t: 'stop', seq: m.seq } : null;
    case 'cast':
      return spell(m.spell) && coord(m.x) && coord(m.y) && seq(m.seq) ? { t: 'cast', spell: m.spell, x: m.x, y: m.y, seq: m.seq } : null;
    case 'buy':
      return spell(m.spell) ? { t: 'buy', spell: m.spell } : null;
    case 'sell':
    case 'undo':
      return typeof m.key === 'string' && /^(spell|item):[a-z_]{2,20}$/.test(m.key) ? { t: m.t, key: m.key } : null;
    case 'kick':
      return pubId(m.target) ? { t: 'kick', target: m.target } : null;
    case 'vote':
      // troca de modo leva o modo alvo; a do sorteio dos times só alterna
      if (m.kind === 'mode') return MODES.includes(m.target as Mode) ? { t: 'vote', kind: 'mode', target: m.target as Mode } : null;
      if (m.kind === 'shuffle') return { t: 'vote', kind: 'shuffle' };
      if (m.kind === 'opt') return typeof m.target === 'string' && m.target.length < 30 && parseOpt(m.target) ? { t: 'vote', kind: 'opt', target: m.target } : null;
      if (m.kind === 'restart' || m.kind === 'end' || m.kind === 'addBot' || m.kind === 'removeBot' || m.kind === 'skipShop') return { t: 'vote', kind: m.kind };
      return m.kind === 'kick' && pubId(m.target) ? { t: 'vote', kind: 'kick', target: m.target } : null;
    case 'ballot':
      return typeof m.yes === 'boolean' ? { t: 'ballot', yes: m.yes } : null;
    case 'taunt':
      return Number.isInteger(m.i) && (m.i as number) >= 0 && (m.i as number) < TAUNTS.length ? { t: 'taunt', i: m.i as number } : null;
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
    players: m.players.map(({ id, name, bot, color, character, score, gold, spells, items, stats, bought, held, ready, connected, team }) => ({ id: pub(id), name, bot, color, character, score, gold, spells, items, stats, bought: bought.map((b) => b.key), held: held ?? {}, ready, connected, team: team ?? null })),
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
    teamShuffle: m.teamShuffle,
    pendingShuffle: m.pendingShuffle,
    winnerTeam: m.winnerTeam,
    opts: m.opts,
    pendingOpts: m.pendingOpts,
    botDelta: m.botDelta,
    goal: goalOf(m),
    arena: m.world?.arena ?? null,
  };
}
