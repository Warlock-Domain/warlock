// Peças comuns dos testes: avançar a partida passo a passo e montar um mundo com magos em posições escolhidas.
import { ARENA_R0, DT } from '../src/shared/constants.ts';
import { noItems, type ItemId } from '../src/shared/items.ts';
import { setReady, tickMatch, type Match } from '../src/shared/match.ts';
import { newWorld, stepWorld, type Cmd, type World } from '../src/shared/sim.ts';
import type { SpellId } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';

export const STEP_MS = DT * 1000;

// avança a partida em passos de simulação até a condição, com um limite de segurança
export function until(m: Match, now: number, cond: () => boolean, limit = 60 * 600, rand: () => number = () => 0.5): number {
  for (let i = 0; i < limit && !cond(); i++) {
    now += STEP_MS;
    tickMatch(m, now, [], rand);
  }
  return now;
}

export function toPlaying(m: Match, now: number, rand?: () => number): number {
  for (const p of m.players) setReady(m, p.id);
  now = until(m, now, () => m.phase === 'countdown', undefined, rand);
  return until(m, now, () => m.phase === 'playing', undefined, rand);
}

// joga o mago na lava quase sem vida: morre no passo seguinte, com o crédito para `by`
export const kill = (m: Match, id: string, by: string | null) => {
  const wz = m.world!.wizards.find((z) => z.id === id)!;
  wz.hp = 0.01;
  wz.lastHitBy = by;
  wz.lastHitAt = m.world!.t;
  wz.pos = v(ARENA_R0 * 3, 0);
};

// mundo com os magos p0, p1… nas posições dadas, todos com as mesmas magias (e os itens e o time de cada um), sem os 2 s
// de invulnerabilidade do começo da rodada
export function world(spots: [number, number][], spells: Record<SpellId, number>, items: Partial<Record<ItemId, number>>[] = [], rand: () => number = Math.random, dm = false, teams: number[] = []): World {
  const ids = spots.map((_, i) => 'p' + i);
  const w = newWorld(ids, Object.fromEntries(ids.map((id) => [id, spells])), Object.fromEntries(ids.map((id, i) => [id, { ...noItems(), ...items[i] }])), 0, rand, dm,
    Object.fromEntries(ids.map((id, i) => [id, teams[i]])));
  spots.forEach(([x, y], i) => (w.wizards[i].pos = v(x, y)));
  for (const z of w.wizards) z.invulnUntil = 0;
  return w;
}

// os comandos saem no primeiro passo; depois só o tempo corre
export function run(w: World, seconds: number, cmds: Cmd[] = []) {
  stepWorld(w, cmds);
  for (let i = 1; i < Math.round(seconds / DT); i++) stepWorld(w, []);
}
