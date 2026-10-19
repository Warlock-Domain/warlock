// Modo Campanha (desenho em docs/superpowers/specs/2026-10-19-campanha-design.md): 1 a 4 Acesos contra o Fumo.
// Uma noite = estágios; um estágio = clareiras (rodadas) com ondas de servos, sorteadas pela semente da noite.
import type { ArenaId } from './arena.ts';
import type { CharacterId } from './characters.ts';
import { nightRand } from './rng.ts';
import type { SpellId } from './spells.ts';

// humanos no máximo; as outras vagas da sala (MAX_PLAYERS) são dos servos
export const CAMPAIGN = { humans: 4, slots: 4 };

// servos do Fumo: magos fracos com a IA de bot (números iniciais, a medir)
export const SERVO_KINDS = ['ash', 'archer'] as const;
export type ServoKind = (typeof SERVO_KINDS)[number];
export const SERVOS: Record<ServoKind, { name: string; look: CharacterId; hp: number; spells: Partial<Record<SpellId, number>> }> = {
  ash: { name: 'Cinzento', look: 'skeleton_minion', hp: 350, spells: { fireball: 1 } },
  archer: { name: 'Arqueiro oco', look: 'skeleton_rogue', hp: 300, spells: { lightning: 1 } },
};

export type Clearing = { arena: ArenaId; pillars: number; waves: ServoKind[][] };

// padrão de cada estágio (estilo Diablo 2: objetivo fixo, mapa sorteado); ondas da mais fácil para a mais difícil
type StagePattern = { id: string; clearings: [number, number]; arenas: ArenaId[]; pillars: [number, number]; waves: [number, number]; pool: ServoKind[][] };
export const STAGES: StagePattern[] = [
  {
    id: 'charneca', // Charneca Cinzenta: introdução, inimigos lentos
    clearings: [2, 3],
    arenas: ['circle', 'cross', 'ring'],
    pillars: [2, 5],
    waves: [2, 3],
    pool: [['ash', 'ash'], ['ash', 'archer'], ['ash', 'ash', 'ash'], ['archer', 'archer'], ['ash', 'ash', 'archer'], ['ash', 'archer', 'archer'], ['ash', 'ash', 'archer', 'archer']],
  },
];

const between = (rand: () => number, [a, b]: [number, number]) => a + Math.floor(rand() * (b - a + 1));

// a mesma semente gera sempre o mesmo estágio; a clareira c sorteia ondas só entre as 3 + 2c primeiras do padrão
export function generateStage(seed: number, stage: number): Clearing[] {
  const S = STAGES[stage];
  const n = between(nightRand(seed, stage, -1), S.clearings);
  return Array.from({ length: n }, (_, c) => {
    const rand = nightRand(seed, stage, c);
    const arena = S.arenas[Math.floor(rand() * S.arenas.length)];
    const pillars = between(rand, S.pillars);
    const pool = S.pool.slice(0, 3 + 2 * c);
    const waves = Array.from({ length: between(rand, S.waves) }, () => pool[Math.floor(rand() * pool.length)]);
    return { arena, pillars, waves };
  });
}

// estado da noite guardado na partida (o plano sai de generateStage, não é gravado)
export type Night = { seed: number; stage: number; clearing: number; wave: number; result: 'won' | 'lost' | null };
