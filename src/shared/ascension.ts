// Modo Ascensão (desenho em docs/superpowers/specs/2026-10-19-ascensao-design.md): todo intervalo dá 1 magia nova e 1 item
// (Fernando, 21/10: "1 magia nova e 1 item"), e cada nível de XP dá 1 subir magia; cada escolha é 1 entre 3 cartas.
// 9 rodadas e pontos pela ordem de queda. Toda a regra do modo mora aqui (pedido do Fernando, 19/10: "deixe o código do
// ascension mais separado pois vai mudar muita coisa da core gameplay"); match.ts só chama estas funções atrás de `m.asc`.
import { ITEM_IDS, itemPrice, type ItemId } from './items.ts';
import type { Match, Player, Stat } from './match.ts';
import { MAX_SPELLS, MAX_SPELL_LEVEL, SPELL_IDS, spellCount, spellGroup, type SpellId } from './spells.ts';

// rare: carta rara (só de subir magia): sobe 2 níveis
export type Card = { kind: 'spell'; id: SpellId } | { kind: 'up'; id: SpellId; rare?: true } | { kind: 'item'; id: ItemId };
export type Kind = Card['kind'];
// escolha de uma fileira: carta i (−1 = manter as magias, só com a barra cheia) e a magia que sai na troca
export type Choice = { i: number; swap?: SpellId };
// xp: total da partida; todo: as fileiras do intervalo, pelo tipo; offer: as cartas de cada fileira; pick: a escolha de cada fileira
// (null = falta escolher; só vale no fim do intervalo e dá para trocar até lá); fallen: ordem de queda da rodada;
// extra: XP da rodada por derrubar o líder; rerolls: novos sorteios do intervalo (quem está atrás)
export type AscState = { xp: Record<string, number>; todo: Record<string, Kind[]>; offer: Record<string, Card[][]>; pick: Record<string, (Choice | null)[]>; fallen: string[]; extra: Record<string, number>; rerolls: Record<string, number> };
// o que todo intervalo dá, além do subir magia de cada nível ganho
const EVERY_BREAK: Kind[] = ['spell', 'item'];

export const ASC_ROUNDS = 9;
// números iniciais, a medir no simulador (PRs de rebalanceamento depois); as magias e os itens não mudam (Fernando, 21/10)
// DMG_XP e LAVA_XP separados: o Fernando está decidindo se a lava continua contando como dano do mago (21/10)
export const DMG_XP = 1;
export const LAVA_XP = 1;
export const KILL_XP = 100;
export const ALIVE_XP = 2; // por segundo vivo
// cada nível custa o mesmo; 1 100 (escolha do Fernando, 21/10, pela simulação de 1 430 partidas): 1,3 subir magia por intervalo
// (com 600 eram 2,8, umas 5 cartas por intervalo)
export const LEVEL_XP = 1100;
export const LAST_ALIVE_PTS = 1; // ponto a mais para o último vivo
// recuperação (as 4 do desenho, números iniciais): derrubar o líder rende LEADER_KILL_XP por nível de diferença; abaixo da média de
// nível, +CONSOLATION do XP da rodada por nível abaixo; atrás do líder, RARE_PER_LEVEL de chance de carta rara por nível (até RARE_MAX)
// e 1 novo sorteio por intervalo; o líder leva MARK_KB a mais de empurrão por nível acima do 2º
export const LEADER_KILL_XP = 60;
export const CONSOLATION = 0.25;
export const RARE_PER_LEVEL = 0.15;
export const RARE_MAX = 0.6;
export const MARK_KB = 0.05;
// todos escolheram: o intervalo acaba em 5 s, e até lá dá para trocar (Fernando, 21/10)
export const LAST_CALL_MS = 5000;

export const newAsc = (ids: string[]): AscState => ({ xp: {}, todo: Object.fromEntries(ids.map((id) => [id, [...EVERY_BREAK]])), offer: {}, pick: {}, fallen: [], extra: {}, rerolls: {} });

// sala gravada por uma versão anterior do modo (ex.: publicação nova no meio da partida, 21/10: a sala caiu): mantém XP e pontos
// e refaz a mesa do intervalo, que mudou de formato (escolhas marcadas, uma fileira por tipo)
export function ascResume(a: AscState) {
  if (a.todo && a.pick && Object.values(a.offer ?? {}).every((rows) => rows.every(Array.isArray))) return;
  Object.assign(a, { todo: a.todo ?? {}, offer: {}, pick: {}, fallen: a.fallen ?? [], extra: a.extra ?? {}, rerolls: a.rerolls ?? {} });
}

export function xpGain(s: Stat): number {
  const spells = Object.entries(s.dmgBy).reduce((t, [src, d]) => t + (src === 'lava' ? 0 : d), 0);
  return Math.round(DMG_XP * spells + LAVA_XP * (s.dmgBy.lava ?? 0) + KILL_XP * s.kills + ALIVE_XP * s.alive);
}

export const xpFor = (level: number) => LEVEL_XP * (level - 1);
export const levelOf = (xp: number) => 1 + Math.floor(xp / LEVEL_XP);

const lv = (a: AscState, id: string) => levelOf(a.xp[id] ?? 0);
const groupOf = (c: Card) => (c.kind === 'item' ? 'item' : spellGroup(c.id));
type Kit = Pick<Player, 'spells' | 'items'>;

// até 3 cartas diferentes do tipo pedido que o mago pode usar, sorteadas com o rand da partida; magia nova de pelo menos 2 grupos;
// cada carta de subir magia vira rara com a chance `rare`
export function drawCards(p: Kit, kind: Kind, rand: () => number, rare = 0): Card[] {
  const pool: Card[] = kind === 'spell' ? SPELL_IDS.filter((s) => p.spells[s] === 0).map((id): Card => ({ kind, id }))
    : kind === 'up' ? SPELL_IDS.filter((s) => p.spells[s] > 0 && p.spells[s] < MAX_SPELL_LEVEL).map((id): Card => ({ kind, id }))
    : ITEM_IDS.filter((i) => itemPrice(p.items, i) !== null).map((id): Card => ({ kind, id }));
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

// magia nova com a barra cheia (MAX_SPELLS) troca a `swap`, que precisa ser uma magia que o mago tem; a nova herda o nível dela
// (Fernando, 21/10: "a magia q vc recebe recebe os niveis q a magia q esta sendo trocada recebeu")
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
  let level = 1;
  if (spellCount(p.spells) >= MAX_SPELLS) {
    if (!swap || p.spells[swap] === 0) return false;
    level = p.spells[swap];
    p.spells[swap] = 0;
  }
  p.spells[card.id] = level;
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
// Só cartas que entram sem troca; magia nova com a barra cheia devolve -1 (mantém as magias, ver keepSpells)
export function autoPick(p: Player, cards: Card[], how: 'top' | 'easy' | 'normal', rand: () => number): number {
  const full = spellCount(p.spells) >= MAX_SPELLS;
  const ok = cards.map((_, i) => i).filter((i) => !(full && cards[i].kind === 'spell'));
  if (!ok.length) return -1;
  if (how === 'easy') return ok[Math.floor(rand() * ok.length)];
  if (how === 'normal') {
    const has = (g: string) => SPELL_IDS.some((s) => p.spells[s] > 0 && spellGroup(s) === g);
    const want = ['defense', 'mobility'].find((g) => !has(g));
    const i = ok.find((i) => cards[i].kind !== 'item' && groupOf(cards[i]) === want);
    if (i !== undefined) return i;
  }
  return ok[0];
}

const full = (p: Kit) => spellCount(p.spells) >= MAX_SPELLS;

// escolhe (ou troca a escolha de) uma fileira; só vale no fim do intervalo (applyPicks), então dá para mudar até lá
// (Fernando, 21/10: "nao fechar os menus dps q vc escolhe"). i = −1: manter as magias, só na fileira de magia nova com a barra cheia
// (Fernando, 21/10: "troca opcional com a barra cheia"); magia nova com a barra cheia pede a `swap`, uma magia que o mago tem
export function chooseCard(m: Match, id: string, slot: number, i: number, swap?: SpellId): boolean {
  const a = m.asc;
  const p = m.players.find((q) => q.id === id);
  const row = a?.offer[id]?.[slot];
  if (!a || !p || m.phase !== 'shop' || !row || !a.pick[id]) return false;
  const card = row[i];
  const keep = i === -1 && a.todo[id][slot] === 'spell' && full(p);
  if (!keep && !card) return false;
  if (card?.kind === 'spell' && full(p) && (!swap || !p.spells[swap])) return false;
  a.pick[id][slot] = keep ? { i } : { i, ...(card?.kind === 'spell' && full(p) && { swap }) };
  return true;
}

// fim do intervalo: aplica as escolhas, e as que faltam pela escolha automática; itens e subir magia antes da magia nova,
// para a troca não tirar uma magia que ia subir nesta mesma leva sem querer
function applyPicks(m: Match, rand: () => number) {
  const a = m.asc!;
  for (const p of m.players) {
    const offer = a.offer[p.id] ?? [];
    const how = !p.bot && p.connected ? 'top' : (p.difficulty ?? m.opts.difficulty) === 'easy' ? 'easy' : 'normal';
    const order = offer.map((_, slot) => slot).sort((x, y) => Number(a.todo[p.id][x] === 'spell') - Number(a.todo[p.id][y] === 'spell'));
    for (const slot of order) {
      const c = a.pick[p.id]?.[slot] ?? { i: autoPick(p, offer[slot], how, rand) };
      if (c.i >= 0) applyCard(p, offer[slot][c.i], c.swap);
    }
    a.todo[p.id] = [];
    a.offer[p.id] = [];
    a.pick[p.id] = [];
  }
}

// novo sorteio (quem está atrás do líder, 1 por intervalo): as cartas da mesa saem e outras entram no próximo passo
export function reroll(m: Match, id: string): boolean {
  const a = m.asc;
  if (!a || m.phase !== 'shop' || !a.rerolls[id] || !a.offer[id]?.length) return false;
  a.rerolls[id]--;
  delete a.offer[id]; // as escolhas da mesa velha saem junto (ascShop sorteia as fileiras e zera as escolhas)
  return true;
}

// queda: a ordem vale pontos; derrubar o líder (maior nível, à frente de quem derrubou) rende XP extra
export function ascDeath(m: Match, victim: string, by: string | null) {
  const a = m.asc!;
  a.fallen.push(victim);
  const top = Math.max(...m.players.map((p) => lv(a, p.id)));
  if (by && by !== victim && lv(a, victim) === top && top > lv(a, by)) a.extra[by] = (a.extra[by] ?? 0) + LEADER_KILL_XP * (top - lv(a, by));
}

// líder marcado: sozinho no maior nível; above = níveis à frente do 2º (o cliente usa a mesma regra para a marca)
export function markedLeader(levels: [id: string, level: number][]): { id: string; above: number } | null {
  const [first, second] = levels.map(([, l]) => l).sort((x, y) => y - x);
  const id = levels.find(([, l]) => l === first)?.[0];
  return id && second !== undefined && first > second ? { id, above: first - second } : null;
}

// começo da rodada: o líder marcado leva mais empurrão; a simulação lê o kbResist do mago
export function ascMark(m: Match) {
  const lead = markedLeader(m.players.map((p) => [p.id, lv(m.asc!, p.id)]));
  const z = m.world?.wizards.find((q) => q.id === lead?.id);
  if (z && lead) z.kbResist -= MARK_KB * lead.above;
}

// a cada passo do intervalo: põe as fileiras na mesa (bots e quem saiu escolhem na hora); quando todo humano escolheu tudo, o
// intervalo encurta para LAST_CALL_MS; no fim do tempo aplica as escolhas (applyPicks) e a partida segue para a contagem
export function ascShop(m: Match, now: number, rand: () => number) {
  const a = m.asc!;
  const top = Math.max(...m.players.map((p) => lv(a, p.id)));
  for (const p of m.players.filter((q) => !q.watch)) { // quem só assiste não escolhe carta
    const todo = (a.todo[p.id] ??= []);
    // mesa nova a cada intervalo e depois do novo sorteio; fileira sem carta possível sai (ex.: todos os itens no máximo)
    if (a.offer[p.id]?.length !== todo.length) {
      const rare = Math.min(RARE_MAX, RARE_PER_LEVEL * (top - lv(a, p.id)));
      const rows = todo.map((k) => drawCards(p, k, rand, rare));
      a.todo[p.id] = todo.filter((_, k) => rows[k].length);
      a.offer[p.id] = rows.filter((r) => r.length);
      a.pick[p.id] = a.offer[p.id].map(() => null);
    }
    const pick = (a.pick[p.id] ??= a.offer[p.id].map(() => null));
    if (p.bot || !p.connected) {
      const how = (p.difficulty ?? m.opts.difficulty) === 'easy' ? 'easy' : 'normal';
      pick.forEach((c, slot) => (pick[slot] = c ?? { i: autoPick(p, a.offer[p.id][slot], how, rand) }));
    }
    if (!p.bot) p.ready = pick.every(Boolean);
  }
  const humans = m.players.filter((p) => !p.bot && p.connected && !p.watch);
  if (humans.every((p) => p.ready)) m.phaseEnds = Math.min(m.phaseEnds, now + LAST_CALL_MS);
  if (now >= m.phaseEnds) applyPicks(m, rand);
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
    // Febre arcana: no Ascensão (sem ouro) o efeito de rodada da Febre do ouro multiplica o XP da rodada (Fernando, 21/10: "arcane rush q da 50% mais xp")
    const rush = m.world?.mods.gold ?? 1;
    const gain = (xpGain(p.stats.round) + (a.extra[p.id] ?? 0)) * rush * (1 + CONSOLATION * Math.max(0, avg - before));
    a.xp[p.id] = (a.xp[p.id] ?? 0) + Math.round(gain);
    a.todo[p.id] = [...(a.todo[p.id] ?? []), ...EVERY_BREAK, ...Array<Kind>(lv(a, p.id) - before).fill('up')];
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
  return { xp, level, next: xpFor(level + 1), todo: a.todo[id] ?? [], offer: a.offer[id] ?? [], pick: a.pick[id] ?? [], rerolls: a.rerolls[id] ?? 0 };
}
