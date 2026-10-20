// Modo Campanha (desenho em docs/superpowers/specs/2026-10-19-campanha-design.md): 1 a 4 Acesos contra o Fumo.
// Uma noite = estágios; um estágio = um mapa de salas (levels.ts) com encontros nos pontos de controle.
import type { CharacterId } from './characters.ts';
import { nightRand } from './rng.ts';
import type { SpellId } from './spells.ts';

// humanos no máximo; as outras vagas da sala (MAX_PLAYERS) são dos servos
export const CAMPAIGN = { humans: 4, slots: 4 };

// servos do Fumo: magos fracos com a IA de bot (vida 200 nos esqueletos: Lucas, 20/10; o resto são números iniciais, a medir)
export const SERVO_KINDS = ['ash', 'archer'] as const;
export type ServoKind = (typeof SERVO_KINDS)[number];
export const SERVOS: Record<ServoKind, { name: string; look: CharacterId; hp: number; spells: Partial<Record<SpellId, number>> }> = {
  ash: { name: 'Cinzento', look: 'skeleton_minion', hp: 200, spells: { fireball: 1 } },
  archer: { name: 'Arqueiro oco', look: 'skeleton_rogue', hp: 200, spells: { lightning: 1 } },
};

// padrão de cada estágio: ondas dos encontros, da mais fácil para a mais difícil (o mapa vem das salas, levels.ts)
type StagePattern = { id: string; waves: [number, number]; pool: ServoKind[][] };
export const STAGES: StagePattern[] = [
  {
    id: 'charneca', // Charneca Cinzenta: introdução, inimigos lentos
    waves: [2, 3],
    pool: [['ash', 'ash'], ['ash', 'archer'], ['ash', 'ash', 'ash'], ['archer', 'archer'], ['ash', 'ash', 'archer'], ['ash', 'archer', 'archer'], ['ash', 'ash', 'archer', 'archer']],
  },
];

const between = (rand: () => number, [a, b]: [number, number]) => a + Math.floor(rand() * (b - a + 1));

// ondas do encontro da sala `room` (sorteadas pela noite): quanto mais fundo no caminho (depth), mais ondas difíceis entram
// no sorteio; a arena do chefe tem uma onda a mais. Até os encontros desenhados do Lucas entrarem no lugar
export function roomWaves(seed: number, stage: number, room: number, depth: number, boss: boolean): ServoKind[][] {
  const S = STAGES[stage], rand = nightRand(seed, stage, room);
  const pool = S.pool.slice(0, 3 + 2 * Math.min(depth, 2));
  return Array.from({ length: between(rand, S.waves) + (boss ? 1 : 0) }, () => pool[Math.floor(rand() * pool.length)]);
}

// estado da noite guardado na partida (o mapa sai de buildNight pela semente, não é gravado): fight = sala do encontro
// aberto, wave = onda atual dele, done = salas com o encontro vencido
export type Night = { seed: number; stage: number; fight: number | null; wave: number; done: number[]; result: 'won' | 'lost' | null };
