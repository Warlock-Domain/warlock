// Modo Campanha (desenho em docs/superpowers/specs/2026-10-19-campanha-design.md): 1 a 4 Acesos contra o Fumo.
// Uma noite = estágios; um estágio = um mapa de salas (levels.ts) com encontros nos pontos de controle.
import { drawCards, type Card } from './ascension.ts';
import type { CharacterId } from './characters.ts';
import type { BossState } from './bosses.ts';
import { nightRand } from './rng.ts';
import { MAX_SPELLS, SPELLS, spellCount, type Level, type SpellBook, type SpellId } from './spells.ts';

// humanos no máximo; as outras vagas da sala (MAX_PLAYERS) são dos servos
// orphan: seconds the night waits when every standing Aceso belongs to a dropped player (time to reload the page)
export const CAMPAIGN = { humans: 4, slots: 4, orphan: 15 };

// servos do Fumo: magos fracos com a IA de bot (vida 200 nos esqueletos: Lucas, 20/10; o resto são números iniciais, a medir)
export const SERVO_KINDS = ['ash', 'archer', 'watcher', 'hound', 'odran'] as const;
export type ServoKind = (typeof SERVO_KINDS)[number];
// name e plural: como as salas escrevem o servo nas linhas de onda (levels/*.ts); speed: multiplica a velocidade de andar
// outfit: a look code (characters.ts) when the servant wears pieces of several models; otherwise the ready look of `look`
export const SERVOS: Record<ServoKind, { name: string; plural: string; look: CharacterId; outfit?: string; hp: number; spells: Partial<Record<SpellId, number>>; speed?: number; boss?: true }> = {
  ash: { name: 'Cinzento', plural: 'Cinzentos', look: 'skeleton_minion', hp: 200, spells: { fireball: 1 } },
  // o Raio passa por cima da mureta: atira de longe por trás da cobertura baixa
  archer: { name: 'Arqueiro de Fuligem', plural: 'Arqueiros de Fuligem', look: 'skeleton_rogue', hp: 200, spells: { lightning: 1 } },
  // arqueiro morto que sai das lápides do cemitério: Míssil teleguiado, pouca vida
  watcher: { name: 'Vigia Oco', plural: 'Vigias Ocos', look: 'skeleton_mage', hp: 150, spells: { homing: 1 } },
  // rápido e de perto: Investida (sem modelo de cão ainda; o esqueleto guerreiro faz o papel)
  hound: { name: 'Cão de Brasa', plural: 'Cães de Brasa', look: 'skeleton_warrior', hp: 250, spells: { rush: 1 }, speed: 1.4 },
  // stage 1 boss (Lucas, 20/10): health with 1 Aceso (+50% per extra Aceso, bosses.ts); Stomp = Meteor on his own feet,
  // Sweep = Sand Blast; the blind Charge is his brain (bosses.ts), not the spell. Undead knight (Lucas, 24/10): the
  // Skeleton Warrior wearing the Knight's helmet, cape, sword and shield (KayKit, CC0), drawn ODRAN.size times bigger
  odran: { name: 'Sir Odran, o Elmo Vazio', plural: 'Sir Odran, o Elmo Vazio', look: 'skeleton_warrior', outfit: '8288822', hp: 3000, spells: { meteor: 4, cluster: 3 }, speed: 0.85, boss: true },
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

// progression (Lucas, 24/10): the night plays like the shop modes, everyone starting with Fireball and Scourge; each fallen
// servant gives XP and each level is 1 card out of 3 (new spell or +1 level, the Ascension cards), picked once the room is
// clear. More Acesos bring more servants (+perAceso of each wave per extra Aceso) and split the XP, with +bonus per extra
// Aceso so nobody levels slower in a group.
// levels: total XP to reach level 2, 3, 4…; past the table each level costs the last step again. Lucas, 25/10: the 3 Ashen
// of the entrance (450 XP) already make a solo Aceso level 2 before the stronger rooms; the whole Charneca (3950 XP alone,
// 3785, 3950 and 4398 per head with 2, 3 and 4 Acesos) still meets Sir Odran at level 5 (3700 to 4999 XP)
export const NIGHT_XP = { levels: [450, 1400, 2500, 3700, 5000], perAceso: 0.5, bonus: 0.25, servo: { ash: 150, archer: 200, watcher: 200, hound: 250, odran: 0 } as Record<ServoKind, number> };
// total XP that reaches this level (1 → 0)
export function nightXpAt(level: number): number {
  const t = NIGHT_XP.levels, k = level - 2;
  if (k < 0) return 0;
  return k < t.length ? t[k] : t[t.length - 1] + (k - t.length + 1) * (t[t.length - 1] - t[t.length - 2]);
}
export function nightLevel(xp: number): number {
  let level = 1;
  while (xp >= nightXpAt(level + 1)) level++;
  return level;
}
// servant health by group size (index = Acesos - 1). Fernando, 25/10: Normal bots won 0 of 25 nights alone and in pairs
// (falling in the Moinho), 19 with 3 and 25 with 4, and the spec asks 60 to 80% for a pair. The waves stay as Lucas wrote
// them and small groups face weaker servants; 3 and 4 keep full health. Numbers from the Campaign night simulator
// (scripts/campaign-sim.ts, PR #377); these are to be measured with it before the merge
export const SERVO_HP = [0.5, 0.75, 1, 1];
export const servoHp = (hp: number, acesos: number) => Math.round(hp * SERVO_HP[Math.min(SERVO_HP.length, Math.max(1, acesos)) - 1]);
// how many servants a wave or the tombs bring with this many Acesos
export const nightCount = (n: number, acesos: number) => Math.round(n * (1 + NIGHT_XP.perAceso * (Math.max(1, acesos) - 1)));
// XP each Aceso takes from a fallen servant: split by the group, plus the group bonus
export const xpShare = (kind: ServoKind, acesos: number) => Math.round((NIGHT_XP.servo[kind] * (1 + NIGHT_XP.bonus * (Math.max(1, acesos) - 1))) / Math.max(1, acesos));
// one level's cards: up to 2 new spells and 1 upgrade, from the Ascension pools (no items: Lucas, 24/10); a full bar only upgrades
export function nightCards(p: { spells: Record<SpellId, number>; items: Parameters<typeof drawCards>[0]['items'] }, rand: () => number): Card[] {
  const up = drawCards(p, 'up', rand).slice(0, 1);
  const fresh = spellCount(p.spells) >= MAX_SPELLS ? [] : drawCards(p, 'spell', rand).slice(0, 3 - up.length);
  return [...fresh, ...up];
}

// padrão de cada estágio: ondas dos encontros, da mais fácil para a mais difícil (o mapa vem das salas, levels.ts)
// order: salas do meio sempre nesta sequência (estágio tutorial); só a direção de cada uma sai da semente
type StagePattern = { id: string; waves: [number, number]; pool: ServoKind[][]; order?: string[] };
export const STAGES: StagePattern[] = [
  {
    id: 'charneca', // Charneca Cinzenta: introdução, inimigos lentos
    waves: [2, 3],
    // tutorial (Lucas, 22/10): cada sala ensina uma coisa, nesta ordem; a semente muda só para que lado cada sala abre
    order: ['moinho-caido-01', 'ponte-dos-enforcados-01', 'vilarejo-queimado-02', 'cemiterio-dos-vigias-01'],
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
// queue: servants of the open wave still waiting for a free slot; orphan: since when only dropped players stand
// xp: night XP per Aceso; got: levels already turned into picks; owed: levels not yet picked; offer: the cards on the table (one level at a time)
export const NIGHT_RESULTS = ['won', 'lost'] as const;
export type NightResult = (typeof NIGHT_RESULTS)[number] | null;
export type Night = { seed: number; stage: number; fight: number | null; wave: number; since: number; cracked: number; done: number[]; result: NightResult; boss?: BossState; falls?: Record<string, number>; orphan?: number; queue?: { kind: ServoKind; e: number }[]; xp?: Record<string, number>; owed?: Record<string, number>; got?: Record<string, number>; offer?: Record<string, Card[]> };
