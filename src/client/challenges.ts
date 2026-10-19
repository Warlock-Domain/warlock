// Desafios curtos do treino (decisão do Fernando, 18/10): uma tarefa por partida, contada no cliente pelos eventos da rodada.
import type { BotSkill } from '../shared/bots.ts';
import { DEFAULT_OPTS, type MatchOpts } from '../shared/match.ts';
import type { BotSetup } from '../shared/protocol.ts';
import type { SimEvent } from '../shared/sim.ts';
import type { SpellId } from '../shared/spells.ts';
import { store } from './store.ts';

// bots: quantos; setup: um por bot (mesmo vazio, para a rodada sair marcada na telemetria e não somar no perfil);
// buy: o que o jogador compra sozinho na loja; survive: a meta é ficar vivo secs segundos; counts: o evento que conta para a meta
export type Challenge = { id: string; name: string; secs: number; goal: number; bots: number; opts: Partial<MatchOpts>; setup?: BotSetup[]; buy?: SpellId[]; survive?: boolean; counts?: (e: SimEvent, me: string) => boolean };
export type Run = { c: Challenge; n: number; t: number; state: 'on' | 'won' | 'lost' };

// opções completas: a sala guarda as da partida anterior, e o recorde só vale com as mesmas regras
const BASE: Partial<MatchOpts> = { ...DEFAULT_OPTS, runes: false, sudden: false, chests: false, pace: 'short' };
// bot que só anda: não lança, não emenda, não reage, não sobe escudo nem desvia
export const PASSIVE: Partial<BotSkill> = { cast: 0, combo: 0, react: 0, shield: 0, dodge: 0 };
const bots = (n: number, b: BotSetup = {}): BotSetup[] => Array.from({ length: n }, () => b);

export const CHALLENGES: Challenge[] = [
  { id: 'alvo', name: 'Alvo', secs: 60, goal: 5, bots: 3, opts: { ...BASE, difficulty: 'normal' }, setup: bots(3, { spells: { fireball: 0 }, skill: PASSIVE }),
    counts: (e, me) => e.k === 'land' && e.id === me && e.src === 'fireball' },
  { id: 'sobreviva', name: 'Sobreviva', secs: 30, goal: 30, bots: 3, opts: { ...BASE, difficulty: 'hard' }, setup: bots(3), survive: true },
  { id: 'lava', name: 'Lava', secs: 60, goal: 1, bots: 2, opts: { ...BASE, difficulty: 'normal' }, setup: bots(2, { spells: { fireball: 0 } }), buy: ['thrust'],
    counts: (e, me) => e.k === 'death' && e.by === me && e.id !== me && e.src === 'thrust' },
  { id: 'escudo', name: 'Escudo', secs: 60, goal: 3, bots: 2, opts: { ...BASE, difficulty: 'hard' }, setup: bots(2, { spells: { fireball: 1 } }), buy: ['shield'],
    counts: (e, me) => e.k === 'reflect' && e.id === me },
  { id: 'duelo', name: 'Duelo', secs: 60, goal: 1, bots: 1, opts: { ...BASE, difficulty: 'hard' }, setup: bots(1),
    counts: (e, me) => e.k === 'death' && e.id !== me },
];

// o que fazer, para a lista da sala
export const goalText = (c: Challenge) =>
  ({ alvo: `Acerte ${c.goal} Bolas de fogo em bots que só andam`, sobreviva: `Sobreviva ${c.secs} s contra ${c.bots} bots Difícil`, lava: 'Derrube 1 bot na lava com a Estocada',
    escudo: `Rebata ${c.goal} tiros com o Escudo`, duelo: 'Vença 1 bot Difícil' })[c.id] + (c.survive ? '' : ` em ${c.secs} s`);

// um passo: a minha queda perde antes de contar o resto do lote; depois a meta e o tempo
export function stepRun(r: Run, dt: number, events: SimEvent[], me: string, alive: boolean): Run {
  if (r.state !== 'on') return r;
  const t = r.t + dt;
  const n = r.n + (r.c.counts ? events.filter((e) => r.c.counts!(e, me)).length : 0);
  const state = !alive || events.some((e) => e.k === 'death' && e.id === me) ? 'lost'
    : r.c.survive ? (t >= r.c.secs ? 'won' : 'on')
    : n >= r.c.goal ? 'won' : t >= r.c.secs ? 'lost' : 'on';
  return { ...r, n, t, state };
}

// a rodada acabou antes da meta: perde, a não ser que vencê-la já cumpra a tarefa (sobreviver, ou derrubar o único bot;
// o evento da queda pode chegar depois do fim da rodada)
export const endRun = (r: Run, wonRound: boolean): Run =>
  r.state !== 'on' ? r : { ...r, state: wonRound && (r.c.survive || r.c.bots === 1) ? 'won' : 'lost' };

// recorde: Sobreviva = mais tempo vivo; os outros = vitória mais rápida
export const scoreOf = (r: Run): number | null => (r.c.survive ? Math.round(Math.min(r.t, r.c.secs) * 10) / 10 : r.state === 'won' ? Math.round(r.t * 10) / 10 : null);

// texto no lugar da dica do treino: "Alvo 3/5 · 21 s" (faltam 21 s)
export function runText(r: Run): string {
  const left = Math.max(0, Math.ceil(r.c.secs - r.t));
  if (r.state === 'won') return `${r.c.name}: desafio cumprido em ${Math.round(r.t)} s`;
  if (r.state === 'lost') return r.c.survive ? `${r.c.name}: ${Math.floor(r.t)} s vivo` : `${r.c.name}: não deu (${r.n}/${r.c.goal})`;
  return r.c.survive ? `${r.c.name} · ${left} s` : `${r.c.name} ${r.n}/${r.c.goal} · ${left} s`;
}

const KEY = 'warlock:challenges';
export const bestOf = (id: string): number | null => store.json<Record<string, number>>(KEY)?.[id] ?? null;
// more: maior é melhor; true = recorde novo (guardado)
export function saveBest(id: string, score: number, more: boolean): boolean {
  const old = bestOf(id);
  if (old !== null && (more ? score <= old : score >= old)) return false;
  store.set(KEY, JSON.stringify({ ...store.json<Record<string, number>>(KEY), [id]: score }));
  return true;
}
