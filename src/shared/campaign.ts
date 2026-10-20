// Modo Campanha (desenho em docs/superpowers/specs/2026-10-19-campanha-design.md): 1 a 4 Acesos contra o Fumo.
// Uma noite = estágios; um estágio = um mapa de salas (levels.ts) com encontros nos pontos de controle.
import type { CharacterId } from './characters.ts';
import type { BossState } from './bosses.ts';
import { nightRand } from './rng.ts';
import { SPELLS, type Level, type SpellBook, type SpellId } from './spells.ts';

// humanos no máximo; as outras vagas da sala (MAX_PLAYERS) são dos servos
export const CAMPAIGN = { humans: 4, slots: 4 };

// servos do Fumo: magos fracos com a IA de bot (vida 200 nos esqueletos: Lucas, 20/10; o resto são números iniciais, a medir)
export const SERVO_KINDS = ['ash', 'archer', 'watcher', 'hound', 'odran'] as const;
export type ServoKind = (typeof SERVO_KINDS)[number];
// name e plural: como as salas escrevem o servo nas linhas de onda (levels/*.ts); speed: multiplica a velocidade de andar
export const SERVOS: Record<ServoKind, { name: string; plural: string; look: CharacterId; hp: number; spells: Partial<Record<SpellId, number>>; speed?: number; boss?: true }> = {
  ash: { name: 'Cinzento', plural: 'Cinzentos', look: 'skeleton_minion', hp: 200, spells: { fireball: 1 } },
  // o Raio passa por cima da mureta: atira de longe por trás da cobertura baixa
  archer: { name: 'Arqueiro de Fuligem', plural: 'Arqueiros de Fuligem', look: 'skeleton_rogue', hp: 200, spells: { lightning: 1 } },
  // arqueiro morto que sai das lápides do cemitério: Míssil teleguiado, pouca vida
  watcher: { name: 'Vigia Oco', plural: 'Vigias Ocos', look: 'skeleton_mage', hp: 150, spells: { homing: 1 } },
  // rápido e de perto: Investida (sem modelo de cão ainda; o esqueleto guerreiro faz o papel)
  hound: { name: 'Cão de Brasa', plural: 'Cães de Brasa', look: 'skeleton_warrior', hp: 250, spells: { rush: 1 }, speed: 1.4 },
  // chefe do estágio 1 (Lucas, 20/10): vida com 1 Aceso (+50% por Aceso a mais, bosses.ts); Pisão = Meteoro no próprio pé,
  // Varredura = Rajada; a Investida cega é do cérebro dele (bosses.ts), não a magia. Sem modelo próprio ainda: o cavaleiro
  odran: { name: 'Sir Odran, o Elmo Vazio', plural: 'Sir Odran, o Elmo Vazio', look: 'knight', hp: 3000, spells: { meteor: 4, cluster: 3 }, speed: 0.85, boss: true },
};

// magias na Campanha: o que muda aqui vale só na Campanha (World.book); o que não está aqui segue SPELLS, inclusive
// os ajustes de balanceamento dos outros modos. Nunca mude spells.ts por causa da Campanha: mude aqui. Exemplo:
//   fireball: retune('fireball', (l) => ({ ...l, cd: 3.5 })),
// (o empurrão é o campo knock; mudar dmg não muda knock sozinho)
export const retune = (id: SpellId, f: (l: Level, i: number) => Level): Level[] => SPELLS[id].levels.map((l, i) => f({ ...l }, i)); // cópia: mexer no nível recebido não muda SPELLS
export const CAMPAIGN_BOOK: SpellBook = {};

// reacender (Lucas, 20/10): aliado a até reach m da brasa por need s (base + perFall por queda anterior na mesma sala)
// traz o Aceso de volta com hp da vida e os 2 s de invulnerável de sempre; afastar zera; na arena do chefe a brasa apaga em out s
export const EMBER = { base: 3, perFall: 1, reach: 1, hp: 0.5, out: 20 };

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
// aberto, wave = onda atual dele, since = w.t em que ele abriu, cracked = lápides que já racharam nele, done = salas com o
// encontro vencido
// boss: estado do chefe na luta aberta (bosses.ts; só existe na arena dele); falls: quedas de cada Aceso no encontro aberto
export type Night = { seed: number; stage: number; fight: number | null; wave: number; since: number; cracked: number; done: number[]; result: 'won' | 'lost' | null; boss?: BossState; falls?: Record<string, number> };
