// Peças comuns do simulador de balanceamento e do torneio de compras: sorteio com semente, partida só de bots,
// ouro gasto por jogador e a vitória ajustada pelo ouro.
import { renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DT } from '../src/shared/constants.ts';
import { ITEMS, ITEM_IDS } from '../src/shared/items.ts';
import { newMatch, startMatch, tickMatch, type Match, type MatchOpts, type Player } from '../src/shared/match.ts';
import type { SimEvent } from '../src/shared/sim.ts';
import { SPELLS, SPELL_IDS } from '../src/shared/spells.ts';

// mulberry32; a partida usa Math.random direto (pilares, mundo, plano dos bots), então ele também vira o sorteio com semente
export function seedRandom(seed: number): () => number {
  let s = seed | 0;
  const rng = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = rng;
  return rng;
}


// ouro gasto no que o jogador tem (preço de cada nível; a Bola de fogo nv 1 e o Flagelo nv 1 vêm de graça)
export function spent(p: Player): number {
  let g = 0;
  for (const id of SPELL_IDS) for (let l = 0; l < p.spells[id]; l++) g += l === 0 ? SPELLS[id].cost : SPELLS[id].up[l - 1];
  for (const id of ITEM_IDS) g += Math.max(0, p.items[id] - (id === 'scourge' ? 1 : 0)) * ITEMS[id].cost;
  return g;
}
export const goldBand = (p: Player) => String(Math.floor(spent(p) / 10) * 10);
// números dos relatórios: vírgula decimal, '–' sem valor
export const f = (x: number, dec = 2) => (Number.isFinite(x) ? x.toFixed(dec).replace('.', ',') : '–');
export const pct = (x: number) => f(100 * x, 1) + '%';

// por faixa de ouro gasto: jogadores-rodada, vitórias e vitórias esperadas
type Cell = { n: number; w: number; e: number };
export type Bands = Record<string, Cell>;
export function addCell(b: Bands, band: string, won: boolean, exp: number) {
  const c = (b[band] ??= { n: 0, w: 0, e: 0 });
  c.n++;
  if (won) c.w++;
  c.e += exp;
}
// vitória ajustada: em cada faixa, vit÷esp de quem tem aquilo dividido pelo vit÷esp de todos na faixa; média das faixas pesada pelo n
export function adjusted(own: Bands | undefined, base: Bands | undefined): number {
  let sum = 0;
  let n = 0;
  for (const [band, c] of Object.entries(own ?? {})) {
    const b = base?.[band];
    if (!b?.w || !c.e) continue;
    sum += c.n * (c.w / c.e) / (b.w / b.e);
    n += c.n;
  }
  return n ? sum / n : NaN;
}

// uma partida só de bots, do começo ao fim, em tempo simulado: 2 a 8 magos, Times em 25%; onRound a cada fim de rodada.
// Devolve 'stalled' se uma rodada passou de 600 s (a partida é cortada) e 'stop' se stop() pediu para parar.
let now = 0;
export function playMatch(rng: () => number, opts: Partial<MatchOpts>, onRound: (m: Match) => void, stop: () => boolean, onEvent?: (e: SimEvent) => void): { m: Match; end: 'end' | 'stalled' | 'stop' } {
  const m = newMatch();
  const bots = 2 + Math.floor(rng() * 7);
  const mode = rng() < 0.25 ? 'teams' : 'rounds';
  startMatch(m, now, bots, mode, rng() < 0.5, rng, opts);
  while (m.phase !== 'end') {
    if (stop()) return { m, end: 'stop' };
    const was = m.phase;
    // sem humanos a loja fecha no primeiro passo; contagem e fim de rodada pulam direto para o fim da espera
    now = was === 'playing' || was === 'shop' ? now + DT * 1000 : Math.max(now + DT * 1000, m.phaseEnds);
    tickMatch(m, now, [], rng);
    if (onEvent) for (const e of m.world?.events ?? []) onEvent(e);
    if (was === 'playing' && m.phase === 'roundEnd') onRound(m);
    else if (m.phase === 'playing' && m.world!.t > 600) return { m, end: 'stalled' };
  }
  return { m, end: 'end' };
}
export const simNow = () => now;

// grava por cima de forma atômica (arquivo temporário e troca), para não deixar arquivo pela metade se o processo cair
export function writeAtomic(dir: string, files: [string, string][]) {
  for (const [name, body] of files) {
    writeFileSync(join(dir, name + '.tmp'), body);
    renameSync(join(dir, name + '.tmp'), join(dir, name));
  }
}
