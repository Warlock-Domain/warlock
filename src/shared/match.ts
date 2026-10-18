// Partida: fases, rodadas, pontos, ouro e loja. Pura; a sala chama tickMatch a cada passo da simulação.
import { botBuy, botCmds } from './bots.ts';
import { PILLAR } from './constants.ts';
import { CHARACTERS, type CharacterId } from './characters.ts';
import { ITEMS, ITEM_IDS, itemPrice, noItems, type ItemId } from './items.ts';
import { MASTERY_ALL_COST, MASTERY_COST, MASTERY_IDS, MASTERY_MAX, noMasteries, type MasteryId } from './masteries.ts';

// como no original, todo mundo começa com o Flagelo (além da Bola de fogo)
const startItems = (): Record<ItemId, number> => ({ ...noItems(), scourge: 1 });
import {
  ASSIST_GOLD, ASSIST_MIN_DMG, BOUNTY, COUNTDOWN_MS, LEADER_WIN_GOLD, RECOVERY, DM_KILLS_TO_WIN, DM_ROUND_MS, KILL_GOLD, MAX_PLAYERS, ROUND_END_MS, ROUND_GOLD, SELL_DECAY, SELL_FLOOR, SHOP_MS, START_GOLD, TOP_DMG_GOLD, VOTE_MS, WIN_GOLD, WINS_TO_WIN,
} from './constants.ts';
import { newWorld, stepWorld, type Cmd, type SimEvent, type World } from './sim.ts';
import { MAX_SPELLS, SPELL_IDS, noSpells, priceOf, spellCount, type SpellId } from './spells.ts';

// estatísticas do placar: ouro ganho, dano causado e precisão (lançadas e acertadas) por magia
export type Stat = { gold: number; dmg: number; kills: number; dmgBy: Record<string, number>; fired: Record<string, number>; landed: Record<string, number>; deaths: number; deathBy: Record<string, number>; alive: number };
export type Stats = { round: Stat; match: Stat; room: Stat };
const newStat = (): Stat => ({ gold: 0, dmg: 0, kills: 0, dmgBy: {}, fired: {}, landed: {}, deaths: 0, deathBy: {}, alive: 0 }); // alive: segundos vivo
const newStats = (): Stats => ({ round: newStat(), match: newStat(), room: newStat() });
// salas gravadas antes de um campo existir (ex.: a precisão): sem isso a soma quebrava o passo inteiro e os efeitos daquele instante sumiam
const fillStats = (s?: Partial<Record<keyof Stats, Partial<Stat>>>): Stats => ({ round: { ...newStat(), ...s?.round }, match: { ...newStat(), ...s?.match }, room: { ...newStat(), ...s?.room } });
function addStat(p: Player, f: (s: Stat) => void) {
  f(p.stats.round);
  f(p.stats.match);
  f(p.stats.room);
}
function earn(p: Player, gold: number) {
  p.gold += gold;
  addStat(p, (s) => (s.gold += gold));
}

// rounds: último vivo ganha a rodada; deathmatch: rodadas de 60 s, quem morre volta e cada abate vale 1 ponto
export type Mode = 'rounds' | 'deathmatch';
export type Phase = 'lobby' | 'shop' | 'countdown' | 'playing' | 'roundEnd' | 'end';
// votação na partida: trocar o modo (target = modo novo) ou expulsar um humano (target = id dele)
export type Vote = { kind: 'mode' | 'kick'; target: string; by: string; yes: string[]; no: string[]; ends: number };

export type Player = {
  id: string;
  name: string;
  bot: boolean;
  color: number; // 0..7
  character: CharacterId;
  score: number; // rodadas vencidas (deathmatch: abates)
  gold: number;
  spells: Record<SpellId, number>;
  items: Record<ItemId, number>;
  masteries: Record<MasteryId, number>;
  stats: Stats;
  // compras feitas nesta loja (mais recente por último), para poder desfazer e trocar
  bought: { key: string; price: number }[];
  held: Record<string, number[]>; // rodada em que cada nível comprado (magia/item) entrou, para o valor de venda
  ready: boolean;
  connected: boolean;
};

export type Match = {
  phase: Phase;
  mode: Mode;
  round: number;
  phaseEnds: number;
  players: Player[];
  world: World | null;
  winner: string | null;
  lastRoundWinner: string | null;
  emptyRounds: number; // rodadas seguidas sem vencedor
  steps: number;
  vote: Vote | null;
  dmgOn?: Record<string, Record<string, number>>; // dano de cada atacante em cada vítima desde que ela entrou viva (para a assistência)
  pendingMode: Mode | null; // modo votado: vale quando a próxima rodada começar
  banned: string[]; // expulsos por votação não voltam a esta sala
};

export const newMatch = (): Match => ({
  phase: 'lobby', mode: 'rounds', round: 0, phaseEnds: 0, players: [], world: null, winner: null, lastRoundWinner: null, emptyRounds: 0, steps: 0, vote: null, pendingMode: null, banned: [],
});

const BOT_NAMES = ['Gul’dan', 'Merlim', 'Morgana', 'Rasputin', 'Zatanna', 'Mandrake', 'Gandalfo'];

export function addPlayer(m: Match, id: string, name: string, bot = false): boolean {
  if (m.banned.includes(id)) return false;
  const known = m.players.find((p) => p.id === id);
  if (known) {
    known.name = name;
    known.connected = true;
    return true;
  }
  if (m.players.length >= MAX_PLAYERS) return false;
  const used = new Set(m.players.map((p) => p.color));
  const color = [0, 1, 2, 3, 4, 5, 6, 7].find((c) => !used.has(c)) ?? 0;
  // bots ganham um personagem diferente cada um, na ordem da lista (sem sorteio, para os testes)
  const character = bot ? CHARACTERS[(m.players.length + 1) % CHARACTERS.length].id : 'mage';
  m.players.push({ id, name, bot, color, character, score: 0, gold: START_GOLD, spells: noSpells(), items: startItems(), masteries: noMasteries(), stats: newStats(), bought: [], held: {}, ready: bot, connected: true });
  return true;
}

// no lobby e no fim sai da lista; no meio da partida o mago fica parado esperando a pessoa voltar
export function removePlayer(m: Match, id: string) {
  if (m.phase === 'lobby' || m.phase === 'end') m.players = m.players.filter((p) => p.id !== id);
  else {
    const p = m.players.find((q) => q.id === id);
    if (p) p.connected = false;
  }
}

export function startMatch(m: Match, now: number, bots: number, mode: Mode = 'rounds'): boolean {
  if (m.phase !== 'lobby' && m.phase !== 'end') return false;
  m.players = m.players.filter((p) => !p.bot && p.connected);
  for (let i = 0; m.players.length < MAX_PLAYERS && i < bots; i++) addPlayer(m, 'bot-' + (i + 1), BOT_NAMES[i % BOT_NAMES.length], true);
  if (m.players.length < 2) return false;
  for (const p of m.players) {
    Object.assign(p, { score: 0, gold: START_GOLD, spells: noSpells(), items: startItems(), masteries: noMasteries() });
    p.stats = fillStats(p.stats);
    p.bought ??= [];
    p.held = {};
    p.stats.match = newStat();
    p.stats.round = newStat();
  }
  Object.assign(m, { mode, round: 0, winner: null, lastRoundWinner: null, emptyRounds: 0, steps: 0, vote: null, pendingMode: null });
  enterShop(m, now);
  return true;
}

export function buy(m: Match, id: string, spell: SpellId): boolean {
  const p = m.players.find((q) => q.id === id);
  if (m.phase !== 'shop' || !p) return false;
  const price = priceOf(spell, p.spells[spell]);
  if (price === null || p.gold < price) return false;
  if (p.spells[spell] === 0 && spellCount(p.spells) >= MAX_SPELLS) return false;
  p.gold -= price;
  p.spells[spell]++;
  p.bought.push({ key: 'spell:' + spell, price });
  (p.held['spell:' + spell] ??= []).push(m.round);
  return true;
}

// troca de personagem fora da rodada (sala, loja ou fim), para o boneco não mudar no meio da luta
export function setCharacter(m: Match, id: string, character: CharacterId): boolean {
  const p = m.players.find((q) => q.id === id);
  if (!p || p.character === character || !['lobby', 'shop', 'end'].includes(m.phase)) return false;
  p.character = character;
  return true;
}

export function buyItem(m: Match, id: string, item: ItemId): boolean {
  const p = m.players.find((q) => q.id === id);
  if (m.phase !== 'shop' || !p) return false;
  const price = itemPrice(p.items, item);
  if (price === null || p.gold < price) return false;
  p.gold -= price;
  p.items[item]++;
  p.bought.push({ key: 'item:' + item, price });
  (p.held['item:' + item] ??= []).push(m.round);
  return true;
}

// uma maestria (5 de ouro) ou as três de uma vez (13); máximo 6 níveis cada
export function buyMastery(m: Match, id: string, which: MasteryId | 'all'): boolean {
  const p = m.players.find((q) => q.id === id);
  if (m.phase !== 'shop' || !p) return false;
  const targets = which === 'all' ? MASTERY_IDS : [which];
  const cost = which === 'all' ? MASTERY_ALL_COST : MASTERY_COST;
  if (p.gold < cost || targets.some((t) => p.masteries[t] >= MASTERY_MAX)) return false;
  p.gold -= cost;
  for (const t of targets) p.masteries[t]++;
  p.bought.push({ key: 'mastery:' + which, price: cost });
  return true;
}

// desfaz a compra mais recente daquele tipo feita nesta loja: devolve o ouro e baixa o nível
export function undoBuy(m: Match, id: string, key: string): boolean {
  const p = m.players.find((q) => q.id === id);
  if (m.phase !== 'shop' || !p) return false;
  const i = p.bought.map((b) => b.key).lastIndexOf(key);
  if (i < 0) return false;
  const [kind, what] = key.split(':');
  if (kind === 'spell') p.spells[what as SpellId]--;
  else if (kind === 'item') p.items[what as ItemId]--;
  else for (const t of what === 'all' ? MASTERY_IDS : [what as MasteryId]) p.masteries[t]--;
  p.gold += p.bought[i].price;
  p.bought.splice(i, 1);
  p.held[key]?.pop();
  return true;
}

// quanto volta ao vender a magia/item inteiro ('spell:<id>' ou 'item:<id>'): cada nível volta 100% na loja em que foi comprado
// e perde 5% por rodada que a pessoa ficou com ele, até 75%; o nível inicial grátis não se vende. Nível sem registro (sala antiga) conta desde a rodada 0
export const sellRate = (rounds: number) => Math.max(SELL_FLOOR, 1 - SELL_DECAY * Math.max(0, rounds));
export function sellValue(p: { spells: Record<SpellId, number>; items: Record<ItemId, number>; held?: Record<string, number[]> }, round: number, key: string): number {
  const [kind, what] = key.split(':');
  const spell = kind === 'spell';
  if (!spell && kind !== 'item') return 0; // maestria não se vende
  if (!(spell ? (SPELL_IDS as string[]) : (ITEM_IDS as string[])).includes(what)) return 0;
  const now = spell ? p.spells[what as SpellId] : p.items[what as ItemId];
  const first = spell ? noSpells()[what as SpellId] : startItems()[what as ItemId];
  if (now <= first) return 0;
  const when = p.held?.[key] ?? [];
  let total = 0;
  for (let l = first; l < now; l++) {
    const price = (spell ? priceOf(what as SpellId, l) : ITEMS[what as ItemId].cost) ?? 0;
    const k = when.length - (now - l); // os níveis mais novos estão no fim da lista
    total += price * sellRate(round - (k >= 0 ? when[k] : 0));
  }
  return Math.floor(total + 1e-9);
}

// vende a magia ou o item inteiro (todos os níveis, volta ao nível inicial); não é ganho de ouro, então fora das estatísticas
export function sell(m: Match, id: string, key: string): boolean {
  const p = m.players.find((q) => q.id === id);
  if (m.phase !== 'shop' || !p) return false;
  const value = sellValue(p, m.round, key);
  if (value === 0) return false;
  const [kind, what] = key.split(':');
  if (kind === 'spell') p.spells[what as SpellId] = noSpells()[what as SpellId];
  else p.items[what as ItemId] = startItems()[what as ItemId];
  p.gold += value;
  p.bought = p.bought.filter((b) => b.key !== key);
  delete p.held[key];
  return true;
}

export function setReady(m: Match, id: string): boolean {
  const p = m.players.find((q) => q.id === id);
  if (m.phase !== 'shop' || !p || p.ready) return false;
  p.ready = true;
  return true;
}

// a sala reiniciou (o mundo da rodada só vive na memória): repete a rodada a partir da loja
export function resume(m: Match, now: number) {
  // salas gravadas antes da escolha de personagem e do deathmatch existirem
  m.emptyRounds ??= 0;
  m.mode ??= 'rounds';
  m.banned ??= []; // salas gravadas antes da votação
  m.pendingMode ??= null;
  m.vote = null; // o prazo de uma votação gravada já passou
  for (const p of m.players) {
    p.character ??= 'mage';
    p.spells = { ...noSpells(), ...p.spells }; // salas gravadas antes das magias novas
    p.items ??= noItems();
    p.masteries ??= noMasteries();
    p.held ??= {}; // salas gravadas antes da venda por rodada
    p.stats = fillStats(p.stats);
  }
  if (m.phase === 'countdown' || m.phase === 'playing') {
    m.round--;
    enterShop(m, now);
  } else if (m.phase === 'roundEnd') afterRound(m, now);
}

// expulsa um bot ou alguém que caiu e não voltou (gente conectada não pode ser expulsa por outro)
export function kick(m: Match, id: string): boolean {
  const p = m.players.find((q) => q.id === id);
  if (!p || (!p.bot && p.connected)) return false;
  drop(m, id);
  return true;
}

// tira da partida e mata o mago, se a rodada estiver rolando
function drop(m: Match, id: string) {
  m.players = m.players.filter((q) => q.id !== id);
  const wz = m.world?.wizards.find((z) => z.id === id);
  if (wz) {
    wz.alive = false;
    wz.hp = 0;
    wz.respawnAt = Infinity; // no deathmatch o expulso não volta
  }
}

export const VOTE_PHASES: Phase[] = ['shop', 'countdown', 'playing', 'roundEnd'];
// só humanos conectados votam; passa com mais da metade deles
const voters = (m: Match) => m.players.filter((p) => !p.bot && p.connected).map((p) => p.id);
export const votesNeeded = (humans: number) => Math.floor(humans / 2) + 1;

// abre uma votação (uma por vez, só com a partida rolando); quem abre já conta como SIM
export function startVote(m: Match, id: string, kind: Vote['kind'], target: string, now: number): boolean {
  if (m.vote || !VOTE_PHASES.includes(m.phase) || !voters(m).includes(id)) return false;
  if (kind === 'kick') {
    const t = m.players.find((p) => p.id === target);
    if (!t || t.bot || t.id === id) return false; // bot já tem o ✕ direto
  } else {
    target = m.mode === 'rounds' ? 'deathmatch' : 'rounds';
    if (m.pendingMode === target) return false;
  }
  m.vote = { kind, target, by: id, yes: [id], no: [], ends: now + VOTE_MS };
  settleVote(m, now);
  return true;
}

export function castBallot(m: Match, id: string, yes: boolean, now: number): boolean {
  const v = m.vote;
  if (!v || !voters(m).includes(id) || v.yes.includes(id) || v.no.includes(id)) return false;
  (yes ? v.yes : v.no).push(id);
  settleVote(m, now);
  return true;
}

// fecha a votação: passa com maioria; falha se os NÃO a tornam impossível, se o prazo acabou ou se a partida acabou
function settleVote(m: Match, now: number) {
  const v = m.vote;
  if (!v) return;
  const who = voters(m);
  const need = votesNeeded(who.length);
  const yes = v.yes.filter((id) => who.includes(id)).length;
  const no = v.no.filter((id) => who.includes(id)).length;
  if (!VOTE_PHASES.includes(m.phase) || now >= v.ends || who.length - no < need) m.vote = null;
  else if (yes >= need) {
    m.vote = null;
    if (v.kind === 'mode') m.pendingMode = v.target as Mode;
    else {
      drop(m, v.target);
      m.banned.push(v.target);
    }
  }
}

// sala esquecida aberta (ninguém joga há muito tempo): encerra a partida para o laço parar
export function endIdle(m: Match) {
  const best = Math.max(0, ...m.players.map((p) => p.score));
  m.winner = best > 0 ? (m.players.find((p) => p.score === best)?.id ?? null) : null;
  m.phase = 'end';
  m.world = null;
  m.vote = null;
}

export const shouldRun = (m: Match, humansConnected: number) => humansConnected > 0 && m.phase !== 'lobby' && m.phase !== 'end';

function enterShop(m: Match, now: number) {
  m.phase = 'shop';
  for (const p of m.players) p.bought = [];
  m.phaseEnds = now + SHOP_MS;
  m.world = null;
  for (const p of m.players) {
    p.ready = p.bot;
    for (let b = botBuy(p); p.bot && b && (b.kind === 'spell' ? buy(m, p.id, b.id) : buyItem(m, p.id, b.id)); b = botBuy(p));
  }
}

function enterCountdown(m: Match, now: number) {
  m.dmgOn = {};
  // troca de modo votada: antes de criar o mundo (que depende do modo); os pontos zeram porque as metas são outras
  if (m.pendingMode) {
    m.mode = m.pendingMode;
    m.pendingMode = null;
    m.emptyRounds = 0;
    for (const p of m.players) p.score = 0;
  }
  m.round++;
  for (const p of m.players) p.stats.round = newStat();
  const ids = m.players.map((p) => p.id);
  m.world = newWorld(ids, Object.fromEntries(m.players.map((p) => [p.id, p.spells])), Object.fromEntries(m.players.map((p) => [p.id, p.items])), Object.fromEntries(m.players.map((p) => [p.id, p.masteries])), PILLAR.min + Math.floor(Math.random() * (PILLAR.max - PILLAR.min + 1)), Math.random, m.mode === 'deathmatch');
  m.phase = 'countdown';
  m.phaseEnds = now + COUNTDOWN_MS;
}

// prêmio de fim de rodada: soma o ouro e sobe o "+N" em cima do mago (o mundo ainda existe até a loja)
function bonus(m: Match, p: Player, gold: number) {
  if (gold <= 0) return;
  earn(p, gold);
  const z = m.world?.wizards.find((q) => q.id === p.id);
  if (z) m.world!.events.push({ k: 'gold', id: p.id, n: gold, x: z.pos.x, y: z.pos.y });
}

function endRound(m: Match, now: number, winner: string | null) {
  const dm = m.mode === 'deathmatch';
  const p = m.players.find((q) => q.id === winner);
  // no deathmatch os pontos já vieram dos abates; aqui o vencedor é só quem fez mais abates na rodada
  if (p && !dm) {
    // quem já liderava sozinho o placar ganha menos pela vitória (freia a bola de neve)
    const leader = m.players.every((q) => q === p || q.score < p.score) && p.score > 0;
    p.score++;
    bonus(m, p, leader ? LEADER_WIN_GOLD : WIN_GOLD);
  }
  const played = new Set(m.world?.wizards.map((z) => z.id));
  // quem sobreviveu ficou vivo a rodada inteira
  for (const z of m.world?.wizards ?? []) {
    const q = m.players.find((p) => p.id === z.id);
    if (q && z.alive && !dm) addStat(q, (s) => (s.alive += m.world!.t));
  }
  const top = Math.max(0, ...m.players.filter((q) => played.has(q.id)).map((q) => q.stats.round.dmg));
  for (const q of m.players) if (top > 0 && played.has(q.id) && q.stats.round.dmg === top) bonus(m, q, TOP_DMG_GOLD);
  for (const q of m.players) if (played.has(q.id)) earn(q, ROUND_GOLD);
  // recuperação: quem ganhou menos ouro na partida que a média recebe metade da diferença
  const inRound = m.players.filter((q) => played.has(q.id));
  const avg = inRound.reduce((sum, q) => sum + q.stats.match.gold, 0) / Math.max(1, inRound.length);
  for (const q of inRound) bonus(m, q, Math.min(RECOVERY.max, Math.floor((avg - q.stats.match.gold) * RECOVERY.share)));
  m.lastRoundWinner = winner;
  m.emptyRounds = winner || dm ? 0 : m.emptyRounds + 1;
  m.phase = 'roundEnd';
  m.phaseEnds = now + ROUND_END_MS;
}

// como no original: ganha quem vencer WINS_TO_WIN rodadas primeiro
function afterRound(m: Match, now: number) {
  if (m.mode === 'deathmatch') {
    // a meta só vale no fim da rodada (a rodada sempre dura os 60 s); empate no topo joga mais uma rodada
    const best = Math.max(...m.players.map((p) => p.score));
    const top = m.players.filter((p) => p.score === best);
    if (best < DM_KILLS_TO_WIN || top.length > 1) return enterShop(m, now);
    m.phase = 'end';
    m.winner = top[0].id;
    m.world = null;
    return;
  }
  const champion = m.players.find((p) => p.score >= WINS_TO_WIN);
  // 3 rodadas seguidas sem ninguém sobrar: todo mundo parado, a partida acaba (e o laço da sala para)
  if (!champion && m.emptyRounds < EMPTY_ROUNDS_END) return enterShop(m, now);
  m.phase = 'end';
  m.winner = champion?.id ?? null;
  m.world = null;
}

export const EMPTY_ROUNDS_END = 3;

// quem fez mais abates na rodada; empate ou zero abates = ninguém
function topKiller(m: Match): string | null {
  const best = Math.max(...m.players.map((p) => p.stats.round.kills));
  const top = m.players.filter((p) => p.stats.round.kills === best);
  return best > 0 && top.length === 1 ? top[0].id : null;
}

export function tickMatch(m: Match, now: number, cmds: Cmd[], rand: () => number = Math.random): SimEvent[] {
  const events = stepMatch(m, now, cmds, rand);
  settleVote(m, now); // prazo, quem caiu e o fim da partida também fecham a votação
  return events;
}

function stepMatch(m: Match, now: number, cmds: Cmd[], rand: () => number): SimEvent[] {
  if (m.phase === 'shop') {
    const humans = m.players.filter((p) => !p.bot && p.connected);
    if (now >= m.phaseEnds || humans.every((p) => p.ready)) enterCountdown(m, now);
    return [];
  }
  if (m.phase === 'countdown') {
    if (now >= m.phaseEnds) {
      m.phase = 'playing';
      if (m.mode === 'deathmatch') m.phaseEnds = now + DM_ROUND_MS;
    }
    return [];
  }
  if (m.phase === 'roundEnd') {
    if (now >= m.phaseEnds) afterRound(m, now);
    return [];
  }
  if (m.phase !== 'playing' || !m.world) return [];

  const w = m.world;
  m.steps++;
  const all = [...cmds];
  m.players.forEach((p, i) => {
    // quem caiu vira bot até voltar, como no original (gamesetup.lua: bot assume o desconectado)
    if ((p.bot || !p.connected) && m.steps % 10 === i % 10) all.push(...botCmds(w, p.id, rand));
  });
  // a rodada só acaba quando sobra 1: se os últimos morrerem no mesmo passo, vence quem tinha mais vida
  const before = w.wizards.filter((z) => z.alive).map((z) => ({ id: z.id, hp: z.hp }));
  stepWorld(w, all, rand);
  for (const e of w.events) {
    if (e.k === 'hit' && e.by !== e.id) {
      const on = ((m.dmgOn ??= {})[e.id] ??= {});
      on[e.by] = (on[e.by] ?? 0) + e.dmg;
      const p = m.players.find((q) => q.id === e.by);
      if (p) addStat(p, (s) => {
        s.dmg += e.dmg;
        s.dmgBy[e.src] = (s.dmgBy[e.src] ?? 0) + e.dmg;
      });
    } else if (e.k === 'fire' || e.k === 'land') {
      const p = m.players.find((q) => q.id === e.id);
      const bucket = e.k === 'fire' ? 'fired' : 'landed';
      if (p) addStat(p, (s) => (s[bucket][e.src] = (s[bucket][e.src] ?? 0) + 1));
    } else if (e.k === 'death') {
      // causa da morte e tempo vivo, para os dados de balanceamento
      const dead = m.players.find((p) => p.id === e.id);
      if (dead) addStat(dead, (s) => {
        s.deaths++;
        s.deathBy[e.src] = (s.deathBy[e.src] ?? 0) + 1;
        if (!w.dm) s.alive += w.t; // no deathmatch volta e morre várias vezes: tempo vivo só nas rodadas
      });
    }
    if (e.k === 'loot') {
      const p = m.players.find((q) => q.id === e.id);
      if (p) {
        earn(p, 1);
        const z = w.wizards.find((q) => q.id === p.id);
        w.events.push({ k: 'gold', id: p.id, n: 1, x: z?.pos.x ?? e.x, y: z?.pos.y ?? e.y });
      }
    }
    if (e.k === 'death') {
      // assistência: quem mais bateu na vítima, sem ser quem matou, ganha um pouco de ouro
      const on = m.dmgOn?.[e.id] ?? {};
      const [helper, dmg] = Object.entries(on).filter(([id]) => id !== e.by && id !== e.id).sort((a, b) => b[1] - a[1])[0] ?? [];
      const hp = helper && dmg >= ASSIST_MIN_DMG ? m.players.find((q) => q.id === helper) : undefined;
      const hz = hp && w.wizards.find((z) => z.id === hp.id);
      if (hp) {
        earn(hp, ASSIST_GOLD);
        if (hz) w.events.push({ k: 'gold', id: hp.id, n: ASSIST_GOLD, x: hz.pos.x, y: hz.pos.y });
      }
      if (m.dmgOn) delete m.dmgOn[e.id];
    }
    if (e.k === 'death' && e.by && e.by !== e.id) {
      // nas rodadas o abate não vale ponto (como no original), só ouro; no deathmatch vale 1 ponto
      const killer = m.players.find((p) => p.id === e.by);
      if (killer) addStat(killer, (s) => (s.kills += 1));
      if (killer && m.mode === 'deathmatch') killer.score++;
      // cabeça do líder: abater quem lidera o placar vale mais, conforme a vantagem dele sobre a média
      const victim = m.players.find((q) => q.id === e.id);
      const avgScore = m.players.reduce((sum, q) => sum + q.score, 0) / m.players.length;
      const top = Math.max(...m.players.map((q) => q.score));
      const head = victim && m.mode === 'rounds' && victim.score === top ? Math.min(BOUNTY.max, Math.round(BOUNTY.perWin * (victim.score - avgScore))) : 0;
      const prize = KILL_GOLD + Math.max(0, head);
      if (killer && prize) {
        earn(killer, prize);
        const kz = w.wizards.find((z) => z.id === killer.id);
        if (kz) w.events.push({ k: 'gold', id: killer.id, n: prize, x: kz.pos.x, y: kz.pos.y });
      }
    }
  }
  if (m.mode === 'deathmatch') {
    if (now >= m.phaseEnds) endRound(m, now, topKiller(m));
    return w.events;
  }
  const alive = w.wizards.filter((z) => z.alive);
  if (alive.length === 1) endRound(m, now, alive[0].id);
  else if (alive.length === 0) endRound(m, now, before.sort((a, b) => b.hp - a.hp)[0]?.id ?? null);
  return w.events;
}
