// Partida: fases, rodadas, pontos, ouro e loja. Pura; a sala chama tickMatch a cada passo da simulação.
import { botBuy, botCmds } from './bots.ts';
import { PILLAR } from './constants.ts';
import { CHARACTERS, type CharacterId } from './characters.ts';
import { itemPrice, noItems, type ItemId } from './items.ts';
import { MASTERY_ALL_COST, MASTERY_COST, MASTERY_IDS, MASTERY_MAX, noMasteries, type MasteryId } from './masteries.ts';

// como no original, todo mundo começa com o Flagelo (além da Bola de fogo)
const startItems = (): Record<ItemId, number> => ({ ...noItems(), scourge: 1 });
import {
  COUNTDOWN_MS, DM_KILLS_TO_WIN, DM_ROUND_MS, KILL_GOLD, MAX_PLAYERS, ROUND_END_MS, ROUND_GOLD, SHOP_MS, START_GOLD, WIN_GOLD, WINS_TO_WIN,
} from './constants.ts';
import { newWorld, stepWorld, type Cmd, type SimEvent, type World } from './sim.ts';
import { MAX_SPELLS, noSpells, priceOf, spellCount, type SpellId } from './spells.ts';

// estatísticas do placar: ouro ganho, dano causado e precisão (lançadas e acertadas) por magia
export type Stat = { gold: number; dmg: number; kills: number; dmgBy: Record<string, number>; fired: Record<string, number>; landed: Record<string, number> };
export type Stats = { round: Stat; match: Stat; room: Stat };
const newStat = (): Stat => ({ gold: 0, dmg: 0, kills: 0, dmgBy: {}, fired: {}, landed: {} });
const newStats = (): Stats => ({ round: newStat(), match: newStat(), room: newStat() });
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
};

export const newMatch = (): Match => ({
  phase: 'lobby', mode: 'rounds', round: 0, phaseEnds: 0, players: [], world: null, winner: null, lastRoundWinner: null, emptyRounds: 0, steps: 0,
});

const BOT_NAMES = ['Gul’dan', 'Merlim', 'Morgana', 'Rasputin', 'Zatanna', 'Mandrake', 'Gandalfo'];

export function addPlayer(m: Match, id: string, name: string, bot = false): boolean {
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
  m.players.push({ id, name, bot, color, character, score: 0, gold: START_GOLD, spells: noSpells(), items: startItems(), masteries: noMasteries(), stats: newStats(), bought: [], ready: bot, connected: true });
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
    p.stats ??= newStats();
    p.bought ??= [];
    p.stats.round.kills ??= 0;
    for (const st of [p.stats.round, p.stats.match, p.stats.room]) st.dmgBy ??= {};
    p.stats.match.kills ??= 0;
    p.stats.room.kills ??= 0;
    p.stats.match = newStat();
    p.stats.round = newStat();
  }
  Object.assign(m, { mode, round: 0, winner: null, lastRoundWinner: null, emptyRounds: 0, steps: 0 });
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
  for (const p of m.players) {
    p.character ??= 'mage';
    p.spells = { ...noSpells(), ...p.spells }; // salas gravadas antes das magias novas
    p.items ??= noItems();
    p.masteries ??= noMasteries();
    p.stats ??= newStats();
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
  m.players = m.players.filter((q) => q !== p);
  const wz = m.world?.wizards.find((z) => z.id === id);
  if (wz) {
    wz.alive = false;
    wz.hp = 0;
    wz.respawnAt = Infinity; // no deathmatch o expulso não volta
  }
  return true;
}

// sala esquecida aberta (ninguém joga há muito tempo): encerra a partida para o laço parar
export function endIdle(m: Match) {
  const best = Math.max(0, ...m.players.map((p) => p.score));
  m.winner = best > 0 ? (m.players.find((p) => p.score === best)?.id ?? null) : null;
  m.phase = 'end';
  m.world = null;
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
  m.round++;
  for (const p of m.players) p.stats.round = newStat();
  const ids = m.players.map((p) => p.id);
  m.world = newWorld(ids, Object.fromEntries(m.players.map((p) => [p.id, p.spells])), Object.fromEntries(m.players.map((p) => [p.id, p.items])), Object.fromEntries(m.players.map((p) => [p.id, p.masteries])), PILLAR.min + Math.floor(Math.random() * (PILLAR.max - PILLAR.min + 1)), Math.random, m.mode === 'deathmatch');
  m.phase = 'countdown';
  m.phaseEnds = now + COUNTDOWN_MS;
}

function endRound(m: Match, now: number, winner: string | null) {
  const dm = m.mode === 'deathmatch';
  const p = m.players.find((q) => q.id === winner);
  // no deathmatch os pontos já vieram dos abates; aqui o vencedor é só quem fez mais abates na rodada
  if (p && !dm) {
    p.score++;
    earn(p, WIN_GOLD);
  }
  const played = new Set(m.world?.wizards.map((z) => z.id));
  for (const q of m.players) if (played.has(q.id)) earn(q, ROUND_GOLD);
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
    if (p.bot && m.steps % 10 === i % 10) all.push(...botCmds(w, p.id, rand));
  });
  // a rodada só acaba quando sobra 1: se os últimos morrerem no mesmo passo, vence quem tinha mais vida
  const before = w.wizards.filter((z) => z.alive).map((z) => ({ id: z.id, hp: z.hp }));
  stepWorld(w, all, rand);
  for (const e of w.events) {
    if (e.k === 'hit' && e.by !== e.id) {
      const p = m.players.find((q) => q.id === e.by);
      if (p) addStat(p, (s) => {
        s.dmg += e.dmg;
        s.dmgBy[e.src] = (s.dmgBy[e.src] ?? 0) + e.dmg;
      });
    } else if (e.k === 'fire' || e.k === 'land') {
      const p = m.players.find((q) => q.id === e.id);
      const bucket = e.k === 'fire' ? 'fired' : 'landed';
      if (p) addStat(p, (s) => (s[bucket][e.src] = (s[bucket][e.src] ?? 0) + 1));
    } else if (e.k === 'death' && e.by && e.by !== e.id) {
      // nas rodadas o abate não vale ponto (como no original), só ouro (zero no padrão); no deathmatch vale 1 ponto
      const killer = m.players.find((p) => p.id === e.by);
      if (killer) addStat(killer, (s) => (s.kills += 1));
      if (killer && m.mode === 'deathmatch') killer.score++;
      if (killer && KILL_GOLD) earn(killer, KILL_GOLD);
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
