// Modo Ascensão (desenho em docs/superpowers/specs/2026-10-19-ascensao-design.md): XP do mago, 1 entre 3 cartas por nível no
// intervalo, 9 rodadas e pontos pela ordem de queda. Toda a regra do modo mora aqui (pedido do Fernando, 19/10: "deixe o código do
// ascension mais separado pois vai mudar muita coisa da core gameplay"); match.ts só chama estas funções atrás de `m.asc`.
import { ITEM_IDS, itemPrice, type ItemId } from './items.ts';
import type { Match, Player, Stat } from './match.ts';
import { MAX_SPELLS, MAX_SPELL_LEVEL, SPELL_IDS, spellCount, spellGroup, type SpellId } from './spells.ts';

export type Card = { kind: 'spell'; id: SpellId } | { kind: 'up'; id: SpellId } | { kind: 'item'; id: ItemId };
// xp: total da partida; picks: escolhas que faltam; offer: as 3 cartas na mesa; fallen: ordem de queda da rodada
export type AscState = { xp: Record<string, number>; picks: Record<string, number>; offer: Record<string, Card[]>; fallen: string[] };

export const ASC_ROUNDS = 9;
// números iniciais, a medir no simulador (PRs de rebalanceamento depois); as magias e os itens não mudam (Fernando, 21/10)
// DMG_XP e LAVA_XP separados: o Fernando está decidindo se a lava continua contando como dano do mago (21/10)
export const DMG_XP = 1;
export const LAVA_XP = 1;
export const KILL_XP = 100;
export const ALIVE_XP = 2; // por segundo vivo
export const LEVEL_XP = 150; // subir do nível n para o n+1 custa LEVEL_XP × n
export const LAST_ALIVE_PTS = 1; // ponto a mais para o último vivo

export const newAsc = (ids: string[]): AscState => ({ xp: {}, picks: Object.fromEntries(ids.map((id) => [id, 1])), offer: {}, fallen: [] });

export function xpGain(s: Stat): number {
  const spells = Object.entries(s.dmgBy).reduce((t, [src, d]) => t + (src === 'lava' ? 0 : d), 0);
  return Math.round(DMG_XP * spells + LAVA_XP * (s.dmgBy.lava ?? 0) + KILL_XP * s.kills + ALIVE_XP * s.alive);
}

export const xpFor = (level: number) => (LEVEL_XP * level * (level - 1)) / 2;
export function levelOf(xp: number): number {
  let l = 1;
  while (xp >= xpFor(l + 1)) l++;
  return l;
}

const groupOf = (c: Card) => (c.kind === 'item' ? 'item' : spellGroup(c.id));
type Kit = Pick<Player, 'spells' | 'items'>;

// 3 cartas diferentes que o mago pode usar, de pelo menos 2 grupos (item conta como grupo), sorteadas com o rand da partida
export function drawCards(p: Kit, rand: () => number): Card[] {
  const pool: Card[] = [
    ...SPELL_IDS.filter((s) => p.spells[s] === 0).map((id): Card => ({ kind: 'spell', id })),
    ...SPELL_IDS.filter((s) => p.spells[s] > 0 && p.spells[s] < MAX_SPELL_LEVEL).map((id): Card => ({ kind: 'up', id })),
    ...ITEM_IDS.filter((i) => itemPrice(p.items, i) !== null).map((id): Card => ({ kind: 'item', id })),
  ];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out = pool.slice(0, 3);
  // as 3 do mesmo grupo: a terceira vira a primeira de outro grupo
  const other = pool.find((c) => groupOf(c) !== groupOf(out[0]));
  if (out.length === 3 && new Set(out.map(groupOf)).size === 1 && other) out[2] = other;
  return out;
}

// magia nova com a barra cheia (MAX_SPELLS) troca a `swap`, que precisa ser uma magia que o mago tem
export function applyCard(p: Kit, card: Card, swap?: SpellId): boolean {
  if (card.kind === 'item') {
    if (itemPrice(p.items, card.id) === null) return false;
    p.items[card.id]++;
    return true;
  }
  const lv = p.spells[card.id];
  if (card.kind === 'up') {
    if (lv === 0 || lv >= MAX_SPELL_LEVEL) return false;
    p.spells[card.id]++;
    return true;
  }
  if (lv > 0) return false;
  if (spellCount(p.spells) >= MAX_SPELLS) {
    if (!swap || p.spells[swap] === 0) return false;
    p.spells[swap] = 0;
  }
  p.spells[card.id] = 1;
  return true;
}

// pontos da rodada: cada um vale quantos caíram antes dele; quem caiu sem evento (expulso) conta como o primeiro;
// os vivos no fim valem todos os caídos, e o último vivo sozinho ganha LAST_ALIVE_PTS a mais
export function placePoints(played: string[], fallen: string[], alive: string[]): Record<string, number> {
  const gone = [...played.filter((id) => !fallen.includes(id) && !alive.includes(id)), ...fallen.filter((id) => played.includes(id))];
  const pts: Record<string, number> = Object.fromEntries(gone.map((id, i) => [id, i]));
  for (const id of alive) pts[id] = gone.length + (alive.length === 1 ? LAST_ALIVE_PTS : 0);
  return pts;
}

// carta automática (bot, humano desconectado ou tempo do intervalo esgotado): a primeira que entra sem troca;
// se as 3 pedem troca, a de cima no lugar da magia de nível mais baixo
function autoPick(p: Player, cards: Card[]): [number, SpellId | undefined] {
  const full = spellCount(p.spells) >= MAX_SPELLS;
  const i = cards.findIndex((c) => !(full && c.kind === 'spell'));
  const weakest = SPELL_IDS.filter((s) => p.spells[s] > 0).sort((a, b) => p.spells[a] - p.spells[b])[0];
  return i >= 0 ? [i, undefined] : [0, weakest];
}

export function pickCard(m: Match, id: string, i: number, swap?: SpellId): boolean {
  const a = m.asc;
  const p = m.players.find((q) => q.id === id);
  const card = a?.offer[id]?.[i];
  if (!a || !p || m.phase !== 'shop' || !card || !applyCard(p, card, swap)) return false;
  delete a.offer[id];
  a.picks[id] = Math.max(0, (a.picks[id] ?? 0) - 1);
  return true;
}

// a cada passo do intervalo: põe as cartas na mesa, escolhe pelos bots e por quem saiu, e no fim do tempo pela carta automática;
// humano com escolha pendente fica "não pronto" (o intervalo acaba quando todos escolheram, como o Pronto da loja)
export function ascShop(m: Match, now: number, rand: () => number) {
  const a = m.asc!;
  const late = now >= m.phaseEnds;
  for (const p of m.players) {
    while ((a.picks[p.id] ?? 0) > 0) {
      const cards = (a.offer[p.id] ??= drawCards(p, rand));
      if (!cards.length) a.picks[p.id] = 0; // nada mais a ganhar
      else if (!(p.bot || !p.connected || late) || !pickCard(m, p.id, ...autoPick(p, cards))) break;
    }
    if (!p.bot) p.ready = !a.picks[p.id];
  }
}

// fim da rodada: pontos pela queda (no placar, p.score) e XP; cada nível ganho vira uma escolha no intervalo
export function ascEndRound(m: Match, played: string[], alive: string[]) {
  const a = m.asc!;
  const pts = placePoints(played, a.fallen, alive);
  for (const p of m.players) {
    if (!played.includes(p.id)) continue;
    p.score += pts[p.id];
    const before = levelOf(a.xp[p.id] ?? 0);
    a.xp[p.id] = (a.xp[p.id] ?? 0) + xpGain(p.stats.round);
    a.picks[p.id] = (a.picks[p.id] ?? 0) + levelOf(a.xp[p.id]) - before;
  }
}

// vence a maior soma de pontos; empate pelo dano total da partida
export const ascWinner = (m: Match) => [...m.players].sort((x, y) => y.score - x.score || y.stats.match.dmg - x.stats.match.dmg)[0]?.id ?? null;

// o que a tela mostra de cada mago (PublicPlayer.asc)
export function ascOf(a: AscState, id: string) {
  const xp = a.xp[id] ?? 0;
  const level = levelOf(xp);
  return { xp, level, next: xpFor(level + 1), picks: a.picks[id] ?? 0, offer: a.offer[id] ?? [] };
}
