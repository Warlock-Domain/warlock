// Sombra: bot que imita o jogador (decisão do Fernando, 18/10). O perfil soma o jeito de jogar das últimas rodadas (match.ts, Stat)
// e cada métrica vira a força de uma parte do bot, comparada com o que os bots fazem em cada dificuldade (REF).
import { skillAt, type BotSkill } from '../shared/bots.ts';
import type { Stat } from '../shared/match.ts';
import { store } from './store.ts';
import { isRecord, isSavedNumber } from './saved-data.ts';
import { DELAY } from './interp.ts';

export const PROFILE_KEY = 'warlock:perfil';
// somas com decaimento (fired e landed só da Bola de fogo; alive em s); n = rodadas jogadas; rtt = média móvel da latência (s)
export type Profile = {
  n: number; fired: number; landed: number; alive: number; threats: number; struck: number; shieldable: number; shielded: number;
  reactSum: number; reactN: number; nearSum: number; nearN: number; rtt: number;
};
export function readProfile(value: unknown): Profile | null {
  if (!isRecord(value)) return null;
  const { n, fired, landed, alive, threats, struck, shieldable, shielded, reactSum, reactN, nearSum, nearN, rtt } = value;
  if (!isSavedNumber(n) || !Number.isSafeInteger(n) || n >= Number.MAX_SAFE_INTEGER || !isSavedNumber(fired) || !isSavedNumber(landed)
    || !isSavedNumber(alive) || !isSavedNumber(threats) || !isSavedNumber(struck) || !isSavedNumber(shieldable) || !isSavedNumber(shielded)
    || !isSavedNumber(reactSum) || !isSavedNumber(reactN) || !isSavedNumber(nearSum) || !isSavedNumber(nearN) || !isSavedNumber(rtt)) return null;
  return { n, fired, landed, alive, threats, struck, shieldable, shielded, reactSum, reactN, nearSum, nearN, rtt };
}
export const savedProfile = () => readProfile(store.json(PROFILE_KEY));
const SUMS = ['alive', 'threats', 'struck', 'shieldable', 'shielded', 'reactSum', 'reactN', 'nearSum', 'nearN'] as const;
const DECAY = 0.9; // cada rodada vale 90% da seguinte: pesa a forma recente

export function addRound(p: Profile | null, s: Stat, rttSec: number): Profile {
  const old = (k: keyof Profile) => (p ? p[k] * DECAY : 0);
  return {
    ...(Object.fromEntries(SUMS.map((k) => [k, old(k) + s[k]])) as Pick<Profile, (typeof SUMS)[number]>),
    n: (p?.n ?? 0) + 1,
    fired: old('fired') + (s.fired.fireball ?? 0),
    landed: old('landed') + (s.landed.fireball ?? 0),
    rtt: p ? p.rtt * DECAY + rttSec * (1 - DECAY) : rttSec,
  };
}

// bots por dificuldade [Fácil, Normal, Difícil] contra bots Normal, medido por scripts/style-ref.ts (semente 1, 400 rodadas do modo
// Rodadas cada, 19/10). A distância do inimigo saiu (5,42 / 5,24 / 5,36 m: não sobe nem desce com a dificuldade), então range fica no Normal
type Metric = 'aim' | 'react' | 'dodge' | 'shield' | 'rate';
export const REF: Record<Metric, [number, number, number]> = {
  aim: [0.24, 0.3, 0.35], // Bola de fogo acertada por lançada
  react: [0.39, 0.35, 0.22], // reação média a um tiro (s)
  dodge: [0.49, 0.51, 0.55], // 1 − atingido por ameaça
  shield: [0.01, 0.07, 0.2], // Escudo usado por Escudo pronto
  rate: [6.35, 8, 8.85], // Bolas de fogo por minuto vivo
};
// que parte do bot cada métrica decide; o resto fica no Normal
const USES: Record<Metric, (keyof BotSkill)[]> = { aim: ['aim'], react: ['delay'], dodge: ['dodge'], shield: ['shield'], rate: ['cast', 'waitMin', 'waitMax'] };
// o humano reage atrasado pela latência, pela interpolação e por um quadro (≈ 0,083 s)
const LAG = DELAY + 1 / 60;

// inversa por trechos: −1 = Fácil, 0 = Normal, 1 = Difícil (métrica crescente ou decrescente; trecho sem largura = Normal)
export function kOf(x: number, [easy, normal, hard]: readonly [number, number, number]): number {
  const toward = (to: number) => (to === normal ? 0 : Math.max(0, Math.min(1, (x - normal) / (to - normal))));
  const up = toward(hard);
  const down = toward(easy);
  return up >= down ? up : -down;
}

// força da sombra; null até ter 3 rodadas e 20 Bolas de fogo. Métrica sem dado (nunca teve Escudo pronto, nenhuma ameaça) fica de fora
export function toSkill(p: Profile | null): Partial<BotSkill> | null {
  if (!p || p.n < 3 || p.fired < 20) return null;
  const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
  const react = ratio(p.reactSum, p.reactN);
  const seen: Record<Metric, number | null> = {
    aim: ratio(p.landed, p.fired),
    react: react === null ? null : react - p.rtt - LAG,
    dodge: p.threats > 0 ? 1 - p.struck / p.threats : null,
    shield: ratio(p.shielded, p.shieldable),
    rate: ratio(p.fired * 60, p.alive),
  };
  const out: Partial<BotSkill> = {};
  for (const m of Object.keys(USES) as Metric[]) {
    const x = seen[m];
    if (x === null) continue;
    const s = skillAt(kOf(x, REF[m]));
    for (const k of USES[m]) out[k] = Math.round(s[k] * 100) / 100;
  }
  return out;
}
