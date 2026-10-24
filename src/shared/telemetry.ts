// Dados de balanceamento: um resumo por rodada (quem tinha o quê, quanto dano cada fonte causou, precisão, abates,
// quem venceu) e a soma de todas as rodadas. Guardado no objeto do lobby; leitura em /api/telemetry e, o jeito de jogar, em /api/telemetry/style.
import { economyOf, type Match, type MatchOpts, type Mode, type Stat } from './match.ts';
import { publicId } from './protocol.ts';

// jeito de jogar (match.ts watchStyle): somas e contagens da rodada
const STYLE_KEYS = ['threats', 'struck', 'shieldable', 'shielded', 'reactSum', 'reactN', 'nearSum', 'nearN'] as const;
type StyleKey = (typeof STYLE_KEYS)[number];

export type RoundRecord = {
  at: number;
  humans: number;
  mode?: Mode;
  round?: number;
  economy?: number;
  startGold?: number;
  scale?: number; // 10: vida 1000 e dano na escala do original (desde 18/10); sem o campo, vida 100 (dano ÷10)
  difficulty?: MatchOpts['difficulty']; // da partida (desde 19/10, junto com o jeito de jogar); cada bot pode ter a sua (players[].difficulty)
  setup?: true; // rodada com configuração de treino: fica fora da leitura do jeito de jogar
  players: ({
    pid?: string; // código anônimo e estável do jogador (hash do id secreto), para separar habilidade de item
    name?: string; // apelido que a pessoa escolheu (só humanos)
    bot: boolean;
    difficulty?: MatchOpts['difficulty']; // só bots: a dele (desde 19/10, dificuldade por bot)
    character: string;
    won: boolean;
    team?: number | null; // modo Times: 0 Azul, 1 Vermelho
    spells: Record<string, number>;
    items: Record<string, number>;
    dmg: number;
    dmgBy: Record<string, number>;
    fired: Record<string, number>;
    landed: Record<string, number>;
    kills: number;
    deaths?: number;
    deathBy?: Record<string, number>; // 'lava' ou a fonte do último empurrão
    alive?: number; // segundos vivo na rodada
    gold?: { start: number; end: number; earned: number; spent: number; refunded: number; recovery: number };
  } & Partial<Pick<Stat, StyleKey>>)[];
};

export type Totals = {
  rounds: number;
  sources: Record<string, { fired: number; landed: number; dmg: number }>; // por magia/item/choque
  owned: Record<string, { rounds: number; wins: number }>; // 'spell:raio', 'item:armor', 'char:knight'
  recent: RoundRecord[]; // últimas rodadas, para análise fina
};

export type ResourceSample = {
  at: number;
  session: string;
  build: string;
  mode: Mode;
  round: number;
  players: number;
  projectiles: number;
  geometries: number;
  textures: number;
  heapBytes?: number;
};

export const RESOURCE_SAMPLE_MAX = 1000;

export function addResourceSample(samples: ResourceSample[], sample: ResourceSample): ResourceSample[] {
  samples.push(sample);
  if (samples.length > RESOURCE_SAMPLE_MAX) samples.splice(0, samples.length - RESOURCE_SAMPLE_MAX);
  return samples;
}

// O limite de 200 rodadas é conferido em telemetry.test.ts com oito jogadores e payload abaixo de 2 MB.
const RECENT_MAX = 200;

export function roundRecord(m: Match, now: number): RoundRecord {
  // nos Times vence o time inteiro de quem ficou de pé
  const teams = m.mode === 'teams';
  const winTeam = teams ? (m.players.find((p) => p.id === m.lastRoundWinner)?.team ?? null) : null;
  return {
    at: now,
    humans: m.players.filter((p) => !p.bot).length,
    mode: m.mode,
    round: m.round,
    economy: m.opts.economy,
    startGold: m.opts.startGold,
    scale: 10,
    difficulty: m.opts.difficulty,
    ...(m.players.some((p) => p.setup) && { setup: true as const }),
    players: m.players.map((p) => ({
      pid: publicId('telemetria', p.id),
      name: p.bot ? undefined : p.name,
      bot: p.bot,
      ...(p.bot && { difficulty: p.difficulty ?? m.opts.difficulty }),
      character: p.character,
      won: teams ? winTeam !== null && p.team === winTeam : p.id === m.lastRoundWinner,
      team: teams ? p.team : undefined,
      spells: p.spells,
      items: p.items,
      dmg: Math.round(p.stats.round.dmg * 10) / 10,
      dmgBy: p.stats.round.dmgBy,
      fired: p.stats.round.fired,
      landed: p.stats.round.landed,
      kills: p.stats.round.kills,
      deaths: p.stats.round.deaths,
      deathBy: p.stats.round.deathBy,
      alive: Math.round(p.stats.round.alive * 10) / 10,
      gold: {
        start: economyOf(p).goldStart,
        end: p.gold,
        earned: economyOf(p).goldEarned,
        spent: economyOf(p).goldSpent,
        refunded: economyOf(p).goldRefunded,
        recovery: economyOf(p).goldRecovery,
      },
      ...Object.fromEntries(STYLE_KEYS.map((k) => [k, Math.round(p.stats.round[k] * 100) / 100])),
    })),
  };
}

export function addRecord(t: Totals, r: RoundRecord): Totals {
  t.rounds++;
  const bump = (key: string, won: boolean) => {
    const o = (t.owned[key] ??= { rounds: 0, wins: 0 });
    o.rounds++;
    if (won) o.wins++;
  };
  for (const p of r.players) {
    for (const [k, from] of [['fired', p.fired], ['landed', p.landed], ['dmg', p.dmgBy]] as const) for (const [src, n] of Object.entries(from)) (t.sources[src] ??= { fired: 0, landed: 0, dmg: 0 })[k] += n;
    for (const [s, lvl] of Object.entries(p.spells)) if (lvl) bump('spell:' + s, p.won);
    for (const [i, lvl] of Object.entries(p.items)) if (lvl) bump('item:' + i, p.won);
    bump('char:' + p.character, p.won);
  }
  t.recent.push(r);
  if (t.recent.length > RECENT_MAX) t.recent.splice(0, t.recent.length - RECENT_MAX);
  return t;
}

export const emptyTotals = (): Totals => ({ rounds: 0, sources: {}, owned: {}, recent: [] });

// uma linha por humano (pelo código anônimo, com o último apelido) e por dificuldade dos bots ('bots normal'): rodadas, ameaças,
// fração a que reagiu e em quanto tempo (média, s), fração que o atingiu, Escudo usado por Escudo pronto e distância média do inimigo (m).
// Fora: rodadas de antes da medição, com configuração de treino e bots no Automático (a força muda com o placar)
export type StyleRow = { who: string; pid?: string; rounds: number; threats: number; reacted: number | null; react: number | null; struck: number | null; shield: number | null; near: number | null };
export function styleRows(t: Totals): StyleRow[] {
  const sums = new Map<string, { who: string; pid?: string; rounds: number } & Record<StyleKey, number>>();
  for (const r of t.recent) {
    if (r.setup || !r.difficulty) continue;
    for (const p of r.players) {
      const d = p.difficulty ?? r.difficulty;
      if (p.threats === undefined || (p.bot && d === 'auto')) continue;
      const key = p.bot ? 'bots ' + d : (p.pid ?? '?');
      const s = sums.get(key) ?? sums.set(key, { who: key, pid: p.bot ? undefined : p.pid, rounds: 0, ...(Object.fromEntries(STYLE_KEYS.map((k) => [k, 0])) as Record<StyleKey, number>) }).get(key)!;
      if (p.name) s.who = p.name;
      s.rounds++;
      for (const k of STYLE_KEYS) s[k] += p[k] ?? 0;
    }
  }
  const ratio = (a: number, b: number) => (b ? Math.round((a / b) * 100) / 100 : null);
  return [...sums.values()].map((s) => ({
    who: s.who, pid: s.pid, rounds: s.rounds, threats: s.threats,
    reacted: ratio(s.reactN, s.threats), react: ratio(s.reactSum, s.reactN), struck: ratio(s.struck, s.threats), shield: ratio(s.shielded, s.shieldable), near: ratio(s.nearSum, s.nearN),
  }));
}
