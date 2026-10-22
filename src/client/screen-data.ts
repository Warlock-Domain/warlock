// Decisões das telas sem DOM (testáveis): resultado do fim da partida, ordem da lista de salas e quem joga como bot.
import type { PublicPlayer, PublicRoom, RoomInfo } from '../shared/protocol.ts';
import type { MatchOpts } from '../shared/match.ts';
import type { WizView } from '../shared/snapshot.ts';
import { ITEM_IDS, itemPrice, type ItemId } from '../shared/items.ts';
import { MAX_SPELLS, SPELL_IDS, isSpell, priceOf, spellCount, type SpellId } from '../shared/spells.ts';
import { store } from './store.ts';

// Posição própria já usa o estado recente; pose atrasada faria o mago continuar arremessado enquanto volta a andar.
// Troca o mago inteiro de propósito: direção, vida e os bits do véu/invisível ficam no mesmo instante da posição prevista.
export const renderWizardState = (interpolated: WizView, ownLatest: WizView | null): WizView =>
  ownLatest?.id === interpolated.id ? ownLatest : interpolated;

// Sandbox: o servidor manda todos, e o 8388608 marca quem estaria escondido (Caminhada no vento ou véu da Ilusão).
// "Ver invisíveis (teste)" ligado só deixa esses translúcidos; desligado, esconde como numa sala normal.
export function sandboxVisibility(status: number, self: boolean, sandbox: boolean, seeInvis = false): number {
  if (!sandbox || self) return status;
  if (seeInvis) return status & (1024 | 8388608) ? status | 8388608 : status;
  // Remover o marcador de teste sem pôr 2048 revelava a Ilusão a outros humanos.
  return status & (1024 | 8388608) ? (status & ~(1024 | 8388608)) | 2048 : status;
}

// Mesma ordem da barra da partida; vagas não compradas continuam visíveis.
// Ordem salva antes de 21/10 (6 magias e os itens ativos): as 2 vagas novas entram vazias e `items` é ignorado.
export type LoadoutOrder = { spells: (SpellId | null)[] };
export function loadoutSlots(spells: Record<SpellId, number>, order?: LoadoutOrder) {
  const owned = SPELL_IDS.filter((s) => spells[s] > 0);
  const saved = Array.isArray(order?.spells) ? order.spells : [];
  const seen = new Set<SpellId>();
  const result = Array.from({ length: MAX_SPELLS }, (_, i) => {
    const id = saved[i];
    if (!id || !owned.includes(id) || seen.has(id)) return null;
    seen.add(id);
    return id;
  });
  for (const id of owned) if (!seen.has(id)) {
    const i = result.indexOf(null);
    if (i < 0) break;
    result[i] = id;
    seen.add(id);
  }
  return { spells: result };
}

const ORDER_KEY = 'warlock:loadout-order';
// ordem do meu equipamento, gravada a cada mudança (#226): gravada só ao arrastar, a compra seguinte reordenava
// pela lista de magias e as teclas por posição trocavam de magia sozinhas
export function myLoadout(spells: Record<SpellId, number>) {
  const saved = store.json<LoadoutOrder>(ORDER_KEY) ?? undefined;
  const order = loadoutSlots(spells, saved);
  if (JSON.stringify(order) !== JSON.stringify(saved)) saveLoadout(order);
  return order;
}
export const saveLoadout = (order: LoadoutOrder) => store.set(ORDER_KEY, JSON.stringify(order));

// troca duas vagas (0 a MAX_SPELLS − 1); vaga vazia não sai do lugar
export function moveLoadout(order: LoadoutOrder, from: number, to: number): LoadoutOrder {
  if (![from, to].every((i) => Number.isInteger(i) && i >= 0 && i < MAX_SPELLS) || !order.spells[from]) return order;
  const spells = [...order.spells];
  [spells[from], spells[to]] = [spells[to], spells[from]];
  return { spells };
}

// fim da partida para quem olha: 'none' sem vencedor ou para quem só assistia
export type EndResult = 'win' | 'loss' | 'none';
export function endResult(r: Pick<PublicRoom, 'players' | 'winner' | 'winnerTeam' | 'mode' | 'goal'>, me: string): EndResult {
  const mine = r.players.find((p) => p.id === me);
  // Times fixos: vence o time; sorteados a cada rodada: todos que chegaram à meta juntos (como em winTitle)
  const champs = r.winnerTeam !== null ? r.players.filter((p) => p.team === r.winnerTeam)
    : r.mode === 'teams' && r.players.filter((p) => p.score >= r.goal).length > 1 ? r.players.filter((p) => p.score >= r.goal)
    : r.players.filter((p) => p.id === r.winner);
  if (!champs.length || !mine) return 'none';
  return champs.includes(mine) ? 'win' : 'loss';
}

// quem joga como bot agora e com que dificuldade (issue #223): o bot da sala (a dele ou a da partida) e quem saiu no meio
// da partida, que o servidor passa a jogar com a dificuldade da partida até a pessoa voltar (match.ts, botSkill e o laço
// dos bots); quem só assiste não tem mago, então não vira bot
type Seat = Pick<PublicPlayer, 'id' | 'name' | 'bot' | 'connected' | 'difficulty' | 'watch'>;
export function botLevel(p: Seat, r: Pick<PublicRoom, 'opts'>): MatchOpts['difficulty'] | null {
  if (p.bot) return p.difficulty ?? r.opts.difficulty;
  return !p.connected && !p.watch ? r.opts.difficulty : null;
}

// quem saiu (e um bot assumiu) ou voltou entre dois estados da sala, para o aviso na tela; fora da partida quem sai
// some da lista em vez de desconectar (removePlayer), então só o meio da partida aparece aqui
export function seatChanges(prev: { players: Seat[] }, next: { players: Seat[] }): { left: Seat[]; back: Seat[] } {
  const before = new Map(prev.players.filter((p) => !p.bot).map((p) => [p.id, p.connected]));
  const humans = next.players.filter((p) => !p.bot && !p.watch && before.has(p.id));
  return { left: humans.filter((p) => before.get(p.id) && !p.connected), back: humans.filter((p) => !before.get(p.id) && p.connected) };
}

// lista de salas: esperando começar primeiro, depois as que acabaram e por último as em jogo; vazias à parte
const RANK: Record<string, number> = { lobby: 0, end: 1 };
export function roomGroups(rooms: RoomInfo[]) {
  const rank = (r: RoomInfo) => RANK[r.phase] ?? 2;
  return { live: rooms.filter((r) => r.players > 0).sort((a, b) => rank(a) - rank(b)), empty: rooms.filter((r) => !r.players) };
}

// presets de build (issue #185): magias e itens com o nível e a ordem da barra, guardados só neste navegador
export type Preset = { spells: Partial<Record<SpellId, number>>; items: Partial<Record<ItemId, number>>; order: (SpellId | null)[] };
export type Buy = { kind: 'spell'; id: SpellId } | { kind: 'item'; id: ItemId };
export const PRESET_SLOTS = 3;
export const PRESETS_KEY = 'warlock:presets';
export const USED_KEY = 'warlock:usados';

// "Usar" (decisão do Fernando, 21/10): compra sozinho, em ordem, até acabar o ouro; magias pela ordem da barra, depois itens.
// Para na primeira compra que o ouro não paga (pular para uma mais barata mudaria a build); o servidor valida cada compra de novo
export function presetQueue(p: Preset, spells: Record<SpellId, number>, items: Record<ItemId, number>, gold: number): Buy[] {
  const sp = { ...spells }, it = { ...items }, out: Buy[] = [];
  const spellOrder = [...new Set([...p.order.filter(isSpell), ...SPELL_IDS])];
  for (const id of spellOrder) {
    if (!sp[id] && spellCount(sp) >= MAX_SPELLS) continue; // barra cheia: a magia nova não cabe
    while (sp[id] < (p.spells[id] ?? 0)) {
      const price = priceOf(id, sp[id]);
      if (price === null) break;
      if (price > gold) return out;
      gold -= price;
      sp[id]++;
      out.push({ kind: 'spell', id });
    }
  }
  for (const id of ITEM_IDS) while (it[id] < (p.items[id] ?? 0)) {
    const price = itemPrice(it, id);
    if (price === null) break; // nível máximo ou sem espaço de item
    if (price > gold) return out;
    gold -= price;
    it[id]++;
    out.push({ kind: 'item', id });
  }
  return out;
}

// salvo velho ou estragado não pode quebrar a loja: só fica o que é magia ou item de verdade, com nível inteiro
const levels = <K extends string>(o: unknown, ok: (k: string) => k is K) =>
  Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([k, n]) => ok(k) && Number.isInteger(n) && (n as number) > 0)) as Partial<Record<K, number>>;
const isItem = (k: string): k is ItemId => (ITEM_IDS as readonly string[]).includes(k);
export function readPresets(raw: string | null): (Preset | null)[] {
  let list: unknown = null;
  try { list = JSON.parse(raw ?? 'null'); } catch { /* fica vazio */ }
  return Array.from({ length: PRESET_SLOTS }, (_, i) => {
    const p = Array.isArray(list) ? list[i] : null;
    if (!p || typeof p !== 'object') return null;
    return { spells: levels(p.spells, isSpell), items: levels(p.items, isItem), order: Array.isArray(p.order) ? p.order.filter(isSpell).slice(0, MAX_SPELLS) : [] };
  });
}

// mais usados: cada lote de compras primeiro desbota o que já havia (as recentes pesam mais) e soma 1 por compra;
// 0,97 por lote esquece devagar (uma partida tem umas 20 compras); o que fica abaixo de 0,05 sai para a chave não crescer sem fim
const FADE = 0.97;
export function countBuys(used: Record<string, number>, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(used)) if (n * FADE >= 0.05) out[k] = n * FADE;
  for (const k of keys) out[k] = (out[k] ?? 0) + 1;
  return out;
}
export const topUsed = (used: Record<string, number>, kind: 'spell' | 'item', n = 3) =>
  Object.entries(used).filter(([k]) => k.startsWith(kind + ':')).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k.slice(kind.length + 1));
