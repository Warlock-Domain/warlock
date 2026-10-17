// Partida: fases, rodadas, pontos, ouro e loja. Pura; a sala chama tickMatch a cada passo da simulação.
import { botBuy, botCmds } from './bots.ts';
import { PILLAR } from './constants.ts';
import { CHARACTERS, type CharacterId } from './characters.ts';
import { itemPrice, noItems, type ItemId } from './items.ts';
import { MASTERY_ALL_COST, MASTERY_COST, MASTERY_IDS, MASTERY_MAX, noMasteries, type MasteryId } from './masteries.ts';

// como no original, todo mundo começa com o Flagelo (além da Bola de fogo)
const startItems = (): Record<ItemId, number> => ({ ...noItems(), scourge: 1 });
import {
  COUNTDOWN_MS, KILL_GOLD, MAX_PLAYERS, ROUND_END_MS, ROUND_GOLD, SHOP_MS, START_GOLD, WIN_GOLD, WINS_TO_WIN,
} from './constants.ts';
import { newWorld, stepWorld, type Cmd, type SimEvent, type World } from './sim.ts';
import { noSpells, priceOf, type SpellId } from './spells.ts';

export type Phase = 'lobby' | 'shop' | 'countdown' | 'playing' | 'roundEnd' | 'end';

export type Player = {
  id: string;
  name: string;
  bot: boolean;
  color: number; // 0..7
  character: CharacterId;
  score: number; // rodadas vencidas
  gold: number;
  spells: Record<SpellId, number>;
  items: Record<ItemId, number>;
  masteries: Record<MasteryId, number>;
  ready: boolean;
  connected: boolean;
};

export type Match = {
  phase: Phase;
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
  phase: 'lobby', round: 0, phaseEnds: 0, players: [], world: null, winner: null, lastRoundWinner: null, emptyRounds: 0, steps: 0,
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
  m.players.push({ id, name, bot, color, character, score: 0, gold: START_GOLD, spells: noSpells(), items: startItems(), masteries: noMasteries(), ready: bot, connected: true });
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

export function startMatch(m: Match, now: number, bots: number): boolean {
  if (m.phase !== 'lobby' && m.phase !== 'end') return false;
  m.players = m.players.filter((p) => !p.bot && p.connected);
  for (let i = 0; m.players.length < MAX_PLAYERS && i < bots; i++) addPlayer(m, 'bot-' + (i + 1), BOT_NAMES[i % BOT_NAMES.length], true);
  if (m.players.length < 2) return false;
  for (const p of m.players) Object.assign(p, { score: 0, gold: START_GOLD, spells: noSpells(), items: startItems(), masteries: noMasteries() });
  Object.assign(m, { round: 0, winner: null, lastRoundWinner: null, emptyRounds: 0, steps: 0 });
  enterShop(m, now);
  return true;
}

export function buy(m: Match, id: string, spell: SpellId): boolean {
  const p = m.players.find((q) => q.id === id);
  if (m.phase !== 'shop' || !p) return false;
  const price = priceOf(spell, p.spells[spell]);
  if (price === null || p.gold < price) return false;
  p.gold -= price;
  p.spells[spell]++;
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
  // salas gravadas antes da escolha de personagem existir
  m.emptyRounds ??= 0;
  for (const p of m.players) {
    p.character ??= 'mage';
    p.items ??= noItems();
    p.masteries ??= noMasteries();
  }
  if (m.phase === 'countdown' || m.phase === 'playing') {
    m.round--;
    enterShop(m, now);
  } else if (m.phase === 'roundEnd') afterRound(m, now);
}

export const shouldRun =(m: Match, humansConnected: number) => humansConnected > 0 && m.phase !== 'lobby' && m.phase !== 'end';

function enterShop(m: Match, now: number) {
  m.phase = 'shop';
  m.phaseEnds = now + SHOP_MS;
  m.world = null;
  for (const p of m.players) {
    p.ready = p.bot;
    for (let b = botBuy(p); p.bot && b && (b.kind === 'spell' ? buy(m, p.id, b.id) : buyItem(m, p.id, b.id)); b = botBuy(p));
  }
}

function enterCountdown(m: Match, now: number) {
  m.round++;
  const ids = m.players.map((p) => p.id);
  m.world = newWorld(ids, Object.fromEntries(m.players.map((p) => [p.id, p.spells])), Object.fromEntries(m.players.map((p) => [p.id, p.items])), Object.fromEntries(m.players.map((p) => [p.id, p.masteries])), PILLAR.min + Math.floor(Math.random() * (PILLAR.max - PILLAR.min + 1)));
  m.phase = 'countdown';
  m.phaseEnds = now + COUNTDOWN_MS;
}

function endRound(m: Match, now: number, winner: string | null) {
  const p = m.players.find((q) => q.id === winner);
  if (p) {
    p.score++;
    p.gold += WIN_GOLD;
  }
  const played = new Set(m.world?.wizards.map((z) => z.id));
  for (const q of m.players) if (played.has(q.id)) q.gold += ROUND_GOLD;
  m.lastRoundWinner = winner;
  m.emptyRounds = winner ? 0 : m.emptyRounds + 1;
  m.phase = 'roundEnd';
  m.phaseEnds = now + ROUND_END_MS;
}

// como no original: ganha quem vencer WINS_TO_WIN rodadas primeiro
function afterRound(m: Match, now: number) {
  const champion = m.players.find((p) => p.score >= WINS_TO_WIN);
  // 3 rodadas seguidas sem ninguém sobrar: todo mundo parado, a partida acaba (e o laço da sala para)
  if (!champion && m.emptyRounds < EMPTY_ROUNDS_END) return enterShop(m, now);
  m.phase = 'end';
  m.winner = champion?.id ?? null;
  m.world = null;
}

export const EMPTY_ROUNDS_END = 3;

export function tickMatch(m: Match, now: number, cmds: Cmd[], rand: () => number = Math.random): SimEvent[] {
  if (m.phase === 'shop') {
    const humans = m.players.filter((p) => !p.bot && p.connected);
    if (now >= m.phaseEnds || humans.every((p) => p.ready)) enterCountdown(m, now);
    return [];
  }
  if (m.phase === 'countdown') {
    if (now >= m.phaseEnds) m.phase = 'playing';
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
  stepWorld(w, all);
  for (const e of w.events) {
    if (e.k !== 'death' || !e.by || e.by === e.id) continue;
    // abate não vale ponto no original, só ouro (zero no padrão)
    const killer = m.players.find((p) => p.id === e.by);
    if (killer) killer.gold += KILL_GOLD;
  }
  const alive = w.wizards.filter((z) => z.alive);
  if (alive.length <= 1) endRound(m, now, alive[0]?.id ?? null);
  return w.events;
}
