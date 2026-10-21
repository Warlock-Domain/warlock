// Modo Ascensão (desenho em docs/superpowers/specs/2026-10-19-ascensao-design.md): XP do mago, 1 entre 3 cartas por nível no
// intervalo, 9 rodadas e pontos pela ordem de queda. Toda a regra do modo mora aqui (pedido do Fernando, 19/10: "deixe o código do
// ascension mais separado pois vai mudar muita coisa da core gameplay"); match.ts só chama estas funções atrás de `m.asc`.
import { ITEM_IDS, itemPrice, type ItemId } from './items.ts';
import type { Match, Player, Stat } from './match.ts';
import { MAX_SPELLS, MAX_SPELL_LEVEL, SPELL_IDS, spellCount, spellGroup, type SpellId } from './spells.ts';

// rare: carta rara (só de subir magia): sobe 2 níveis
export type Card = { kind: 'spell'; id: SpellId } | { kind: 'up'; id: SpellId; rare?: true } | { kind: 'item'; id: ItemId };
// xp: total da partida; picks: escolhas que faltam; offer: as 3 cartas na mesa; fallen: ordem de queda da rodada;
// extra: XP da rodada por derrubar o líder; rerolls: novos sorteios do intervalo (quem está atrás do líder)
export type AscState = { xp: Record<string, number>; picks: Record<string, number>; offer: Record<string, Card[]>; fallen: string[]; extra: Record<string, number>; rerolls: Record<string, number> };

export const ASC_ROUNDS = 9;
// números iniciais, a medir no simulador (PRs de rebalanceamento depois); as magias e os itens não mudam (Fernando, 21/10)
// DMG_XP e LAVA_XP separados: o Fernando está decidindo se a lava continua contando como dano do mago (21/10)
export const DMG_XP = 1;
export const LAVA_XP = 1;
export const KILL_XP = 100;
export const ALIVE_XP = 2; // por segundo vivo
export const LEVEL_XP = 600; // cada nível custa o mesmo: o vencedor de uma rodada faz ~1 000 XP (medido em localhost, 21/10), 1 a 2 cartas
export const LAST_ALIVE_PTS = 1; // ponto a mais para o último vivo
// recuperação (as 4 do desenho, números iniciais): derrubar o líder rende LEADER_KILL_XP por nível de diferença; abaixo da média de
// nível, +CONSOLATION do XP da rodada por nível abaixo; atrás do líder, RARE_PER_LEVEL de chance de carta rara por nível (até RARE_MAX)
// e 1 novo sorteio por intervalo; o líder leva MARK_KB a mais de empurrão por nível acima do 2º
export const LEADER_KILL_XP = 60;
export const CONSOLATION = 0.25;
export const RARE_PER_LEVEL = 0.15;
export const RARE_MAX = 0.6;
export const MARK_KB = 0.05;

export const newAsc = (ids: string[]): AscState => ({ xp: {}, picks: Object.fromEntries(ids.map((id) => [id, 1])), offer: {}, fallen: [], extra: {}, rerolls: {} });

export function xpGain(s: Stat): number {
  const spells = Object.entries(s.dmgBy).reduce((t, [src, d]) => t + (src === 'lava' ? 0 : d), 0);
  return Math.round(DMG_XP * spells + LAVA_XP * (s.dmgBy.lava ?? 0) + KILL_XP * s.kills + ALIVE_XP * s.alive);
}

export const xpFor = (level: number) => LEVEL_XP * (level - 1);
export function levelOf(xp: number): number {
  let l = 1;
  while (xp >= xpFor(l + 1)) l++;
  return l;
}

const lv = (a: AscState, id: string) => levelOf(a.xp[id] ?? 0);
const groupOf = (c: Card) => (c.kind === 'item' ? 'item' : spellGroup(c.id));
type Kit = Pick<Player, 'spells' | 'items'>;

// 3 cartas diferentes que o mago pode usar, de pelo menos 2 grupos (item conta como grupo), sorteadas com o rand da partida;
// cada carta de subir magia vira rara com a chance `rare`
export function drawCards(p: Kit, rand: () => number, rare = 0): Card[] {
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
  return rare > 0 ? out.map((c) => (c.kind === 'up' && rand() < rare ? { ...c, rare: true } : c)) : out;
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
    p.spells[card.id] = Math.min(MAX_SPELL_LEVEL, lv + (card.rare ? 2 : 1));
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

// escolha automática: tempo esgotado, a de cima; bot (e humano desconectado, que o bot joga) pela dificuldade: Fácil ao acaso,
// os outros completam primeiro o grupo que falta (defesa, depois mobilidade), senão a de cima.
// Difícil pela força medida no simulador fica para o PR de rebalanceamento (a tabela sai de lá).
// Só cartas que entram sem troca; se as 3 pedem troca, a de cima no lugar da magia de nível mais baixo
export function autoPick(p: Player, cards: Card[], how: 'top' | 'easy' | 'normal', rand: () => number): [number, SpellId | undefined] {
  const full = spellCount(p.spells) >= MAX_SPELLS;
  const ok = cards.map((_, i) => i).filter((i) => !(full && cards[i].kind === 'spell'));
  const weakest = SPELL_IDS.filter((s) => p.spells[s] > 0).sort((a, b) => p.spells[a] - p.spells[b])[0];
  if (!ok.length) return [0, weakest];
  if (how === 'easy') return [ok[Math.floor(rand() * ok.length)], undefined];
  if (how === 'normal') {
    const has = (g: string) => SPELL_IDS.some((s) => p.spells[s] > 0 && spellGroup(s) === g);
    const want = ['defense', 'mobility'].find((g) => !has(g));
    const i = ok.find((i) => cards[i].kind !== 'item' && groupOf(cards[i]) === want);
    if (i !== undefined) return [i, undefined];
  }
  return [ok[0], undefined];
}

// novo sorteio (quem está atrás do líder, 1 por intervalo): as cartas da mesa saem e outras entram no próximo passo
export function reroll(m: Match, id: string): boolean {
  const a = m.asc;
  if (!a || m.phase !== 'shop' || !a.rerolls[id] || !a.offer[id]) return false;
  a.rerolls[id]--;
  delete a.offer[id];
  return true;
}

// queda: a ordem vale pontos; derrubar o líder (maior nível, à frente de quem derrubou) rende XP extra
export function ascDeath(m: Match, victim: string, by: string | null) {
  const a = m.asc!;
  a.fallen.push(victim);
  const top = Math.max(...m.players.map((p) => lv(a, p.id)));
  if (by && by !== victim && lv(a, victim) === top && top > lv(a, by)) a.extra[by] = (a.extra[by] ?? 0) + LEADER_KILL_XP * (top - lv(a, by));
}

// começo da rodada: o líder marcado (sozinho no maior nível) leva mais empurrão; a simulação lê o kbResist do mago
export function ascMark(m: Match) {
  const a = m.asc!;
  const [first, second] = m.players.map((p) => lv(a, p.id)).sort((x, y) => y - x);
  const leader = m.players.find((p) => lv(a, p.id) === first);
  const z = m.world?.wizards.find((q) => q.id === leader?.id);
  if (z && second !== undefined && first > second) z.kbResist -= MARK_KB * (first - second);
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
  const top = Math.max(...m.players.map((p) => lv(a, p.id)));
  for (const p of m.players) {
    while ((a.picks[p.id] ?? 0) > 0) {
      const cards = (a.offer[p.id] ??= drawCards(p, rand, Math.min(RARE_MAX, RARE_PER_LEVEL * (top - lv(a, p.id)))));
      const how = !p.bot && p.connected ? 'top' : (p.difficulty ?? m.opts.difficulty) === 'easy' ? 'easy' : 'normal';
      if (!cards.length) a.picks[p.id] = 0; // nada mais a ganhar
      else if (!(p.bot || !p.connected || late) || !pickCard(m, p.id, ...autoPick(p, cards, how, rand))) break;
    }
    if (!p.bot) p.ready = !a.picks[p.id];
  }
}

// fim da rodada: pontos pela queda (no placar, p.score) e XP; cada nível ganho vira uma escolha no intervalo
export function ascEndRound(m: Match, played: string[], alive: string[]) {
  const a = m.asc!;
  const pts = placePoints(played, a.fallen, alive);
  const inRound = m.players.filter((p) => played.includes(p.id));
  const avg = inRound.reduce((t, p) => t + lv(a, p.id), 0) / Math.max(1, inRound.length);
  for (const p of inRound) {
    p.score += pts[p.id];
    const before = lv(a, p.id);
    const gain = (xpGain(p.stats.round) + (a.extra[p.id] ?? 0)) * (1 + CONSOLATION * Math.max(0, avg - before));
    a.xp[p.id] = (a.xp[p.id] ?? 0) + Math.round(gain);
    a.picks[p.id] = (a.picks[p.id] ?? 0) + lv(a, p.id) - before;
  }
  a.extra = {};
  const top = Math.max(...m.players.map((p) => lv(a, p.id)));
  a.rerolls = Object.fromEntries(m.players.map((p) => [p.id, lv(a, p.id) < top ? 1 : 0]));
}

// vence a maior soma de pontos; empate pelo dano total da partida
export const ascWinner = (m: Match) => [...m.players].sort((x, y) => y.score - x.score || y.stats.match.dmg - x.stats.match.dmg)[0]?.id ?? null;

// o que a tela mostra de cada mago (PublicPlayer.asc)
export function ascOf(a: AscState, id: string) {
  const xp = a.xp[id] ?? 0;
  const level = levelOf(xp);
  return { xp, level, next: xpFor(level + 1), picks: a.picks[id] ?? 0, offer: a.offer[id] ?? [], rerolls: a.rerolls[id] ?? 0 };
}
