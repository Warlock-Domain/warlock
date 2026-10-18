// Dados de balanceamento: um resumo por rodada (quem tinha o quê, quanto dano cada fonte causou, precisão, abates,
// quem venceu) e a soma de todas as rodadas. Guardado no objeto do lobby; leitura em /api/telemetry.
import type { Match, Mode } from './match.ts';
import { publicId } from './protocol.ts';

export type RoundRecord = {
  at: number;
  humans: number;
  mode?: Mode;
  scale?: number; // 10: vida 1000 e dano na escala do original (desde 18/10); sem o campo, vida 100 (dano ÷10)
  players: {
    pid?: string; // código anônimo e estável do jogador (hash do id secreto), para separar habilidade de item
    bot: boolean;
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
  }[];
};

export type Totals = {
  rounds: number;
  sources: Record<string, { fired: number; landed: number; dmg: number }>; // por magia/item/choque
  owned: Record<string, { rounds: number; wins: number }>; // 'spell:raio', 'item:armor', 'char:knight'
  recent: RoundRecord[]; // últimas rodadas, para análise fina
};

export const RECENT_MAX = 300;

export function roundRecord(m: Match, now: number): RoundRecord {
  // nos Times vence o time inteiro de quem ficou de pé
  const teams = m.mode === 'teams';
  const winTeam = teams ? (m.players.find((p) => p.id === m.lastRoundWinner)?.team ?? null) : null;
  return {
    at: now,
    humans: m.players.filter((p) => !p.bot).length,
    mode: m.mode,
    scale: 10,
    players: m.players.map((p) => ({
      pid: publicId('telemetria', p.id),
      bot: p.bot,
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
    for (const [src, n] of Object.entries(p.fired)) (t.sources[src] ??= { fired: 0, landed: 0, dmg: 0 }).fired += n;
    for (const [src, n] of Object.entries(p.landed)) (t.sources[src] ??= { fired: 0, landed: 0, dmg: 0 }).landed += n;
    for (const [src, n] of Object.entries(p.dmgBy)) (t.sources[src] ??= { fired: 0, landed: 0, dmg: 0 }).dmg += n;
    for (const [s, lvl] of Object.entries(p.spells)) if (lvl) bump('spell:' + s, p.won);
    for (const [i, lvl] of Object.entries(p.items)) if (lvl) bump('item:' + i, p.won);
    bump('char:' + p.character, p.won);
  }
  t.recent.push(r);
  if (t.recent.length > RECENT_MAX) t.recent.splice(0, t.recent.length - RECENT_MAX);
  return t;
}

export const emptyTotals = (): Totals => ({ rounds: 0, sources: {}, owned: {}, recent: [] });
