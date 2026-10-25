// Decisões das telas sem DOM (testáveis): resultado do fim da partida, ordem da lista de salas, quem joga como bot e textos da Campanha.
import type { PublicPlayer, PublicRoom, RoomInfo } from '../shared/protocol.ts';
import type { MatchOpts } from '../shared/match.ts';
import type { WizView } from '../shared/snapshot.ts';
import { ITEMS, ITEM_IDS, itemPrice, type ItemId } from '../shared/items.ts';
import { FREE_SPELLS, MAX_SPELLS, spellMax, SPELL_IDS, isSpell, priceOf, spellCount, type SpellId } from '../shared/spells.ts';
import { isRecord, readLevels, readNumberMap } from './saved-data.ts';
import { store } from './store.ts';
import type { ServoKind } from '../shared/campaign.ts';
import { HP_MAX } from '../shared/constants.ts';
import { itemStats } from '../shared/items.ts';
import { t } from './i18n.ts';
import type { Vec } from '../shared/vec.ts';
// Pulso suave; modo reduzido fica estático.
export const electroPulse = (active: boolean, seconds: number, reduced: boolean) => active ? reduced ? .25 : .25 + .12 * Math.sin(seconds * Math.PI * 4) : 0;

// Posição própria já usa o estado recente; pose atrasada faria o mago continuar arremessado enquanto volta a andar.
// Troca o mago inteiro de propósito: direção, vida e os bits do véu/invisível ficam no mesmo instante da posição prevista.
export const renderWizardState = (interpolated: WizView, ownLatest: WizView | null): WizView =>
  ownLatest?.id === interpolated.id ? ownLatest : interpolated;

// O acerto pode denunciar a posição, mas seu número não deve identificar um alvo oculto ao observador.
export const showHitDamage = (status: number) => !(status & 2048);

// Sandbox: o servidor manda todos, e o 8388608 marca quem estaria escondido (Caminhada no vento ou véu da Ilusão).
// "Ver invisíveis (teste)" ligado só deixa esses translúcidos; desligado, esconde como numa sala normal.
export function sandboxVisibility(status: number, self: boolean, sandbox: boolean, seeInvis = false): number {
  if (!sandbox || self) return status;
  if (seeInvis) return status & (1024 | 8388608) ? status | 8388608 : status;
  // Remover o marcador de teste sem pôr 2048 revelava a Ilusão a outros humanos.
  return status & (1024 | 8388608) ? (status & ~(1024 | 8388608)) | 2048 : status;
}

// Same order as the match bar; slots not bought stay visible. `items` from orders saved before 21/10 is ignored.
// An order saved in the 8-slot layout (21/10 to 25/10, #217) is cut to MAX_SPELLS; an owned spell that fell off takes the first empty slot.
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

export function readLoadout(value: unknown): LoadoutOrder | undefined {
  if (!isRecord(value) || !Array.isArray(value.spells)) return undefined;
  return { spells: value.spells.slice(0, MAX_SPELLS).map((id: unknown) => isSpell(id) ? id : null) };
}

const ORDER_KEY = 'warlock:loadout-order';
// ordem do meu equipamento, gravada a cada mudança (#226): gravada só ao arrastar, a compra seguinte reordenava
// pela lista de magias e as teclas por posição trocavam de magia sozinhas
export function myLoadout(spells: Record<SpellId, number>) {
  const saved = readLoadout(store.json(ORDER_KEY));
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
type EndResult = 'win' | 'loss' | 'none';
export function endResult(r: Pick<PublicRoom, 'players' | 'winner' | 'winnerTeam' | 'mode' | 'goal' | 'night'>, me: string): EndResult {
  const mine = r.players.find((p) => p.id === me);
  // Campanha: todos os Acesos vencem ou perdem juntos
  if (r.night) return !mine || !r.night.result ? 'none' : r.night.result === 'won' ? 'win' : 'loss';
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
// O nome guardado continua sendo o da pessoa. O marcador só explica na tela que,
// enquanto ela caiu, o servidor está jogando no lugar dela com o bot. Servo da Campanha mostra o nome do tipo (SERVO_NAME).
export function playerName(p: Pick<PublicPlayer, 'name' | 'bot' | 'connected' | 'watch' | 'servo'>): string {
  if (p.servo) return SERVO_NAME[p.servo];
  return !p.bot && !p.connected && !p.watch ? `${p.name} (BOT)` : p.name;
}
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
const PRESET_SLOTS = 3;
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

// Contagens estragadas ou de habilidades que saíram não podem contaminar o selo dos mais usados.
export const readUsed = (value: unknown): Record<string, number> => Object.fromEntries(Object.entries(readNumberMap(value)).filter(([key]) =>
  key.startsWith('spell:') ? isSpell(key.slice(6)) : key.startsWith('item:') && ITEM_IDS.some((id) => id === key.slice(5))));

export function readShopSize(value: unknown): [string, string] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const size = (x: unknown): x is string => typeof x === 'string' && (x === '' || /^\d+(?:\.\d+)?px$/.test(x) && Number.parseFloat(x) > 0 && Number.parseFloat(x) <= Number.MAX_SAFE_INTEGER);
  return size(value[0]) && size(value[1]) ? [value[0], value[1]] : null;
}
// Salvo velho ou estragado não pode quebrar a loja: só ficam ids conhecidos com níveis suportados.
export function readPresets(raw: string | null): (Preset | null)[] {
  let list: unknown = null;
  try { list = JSON.parse(raw ?? 'null'); } catch { /* fica vazio */ }
  return Array.from({ length: PRESET_SLOTS }, (_, i) => {
    const p: unknown = Array.isArray(list) ? list[i] : null;
    if (!isRecord(p)) return null;
    // vaga vazia da barra fica no lugar (null): sem ela as magias da build mudariam de tecla
    return { spells: readLevels(p.spells, SPELL_IDS, spellMax), items: readLevels(p.items, ITEM_IDS, (id) => ITEMS[id].levels.length), order: Array.isArray(p.order) ? p.order.slice(0, MAX_SPELLS).map((s: unknown) => (isSpell(s) ? s : null)) : [] };
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
// o que eu comprei entre duas atualizações da sala: cada nível novo de magia ou item vira uma chave;
// o nível 1 grátis (Bola de fogo, Flagelo) não é compra, e vender ou desfazer (nível menor) não conta
export const boughtKeys = (was: Pick<PublicPlayer, 'spells' | 'items'>, now: Pick<PublicPlayer, 'spells' | 'items'>) => [
  ...SPELL_IDS.flatMap((x) => Array<string>(Math.max(0, now.spells[x] - Math.max(was.spells[x], FREE_SPELLS.includes(x) ? 1 : 0))).fill('spell:' + x)),
  ...ITEM_IDS.flatMap((x) => Array<string>(Math.max(0, now.items[x] - was.items[x])).fill('item:' + x)),
];
export const topUsed = (used: Record<string, number>, kind: 'spell' | 'item', n = 3) =>
  Object.entries(used).filter(([k]) => k.startsWith(kind + ':')).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k.slice(kind.length + 1));

// Campanha: nome dos servos (o servidor manda em português), nome do estágio e a linha de onde a noite está
const SERVO_NAME: Record<ServoKind, string> = { ash: t('Cinzento', 'Ashen'), archer: t('Arqueiro de Fuligem', 'Soot Archer'), watcher: t('Vigia Oco', 'Hollow Watcher'), hound: t('Cão de Brasa', 'Ember Hound'), odran: t('Sir Odran, o Elmo Vazio', 'Sir Odran, the Empty Helm') };
export const STAGE_NAME = [t('Charneca Cinzenta', 'Ashen Moor')];
// vida máxima: a do servo, ou a de sempre com os itens
export const maxHp = (p: Pick<PublicPlayer, 'hpMax' | 'items'> | undefined) => p?.hpMax ?? HP_MAX + (p ? itemStats(p.items).hp : 0);
export function nightLine(n: NonNullable<PublicRoom['night']>, playing: boolean): string {
  const where = t(`Campanha · ${STAGE_NAME[n.stage]}`, `Campaign · ${STAGE_NAME[n.stage]}`);
  return playing && n.fight !== null ? where + t(` · encontro · onda ${n.wave + 1} de ${n.waves}`, ` · encounter · wave ${n.wave + 1} of ${n.waves}`) : where;
}

// Spectator: keep the watched wizard; otherwise the living one with most HP; step (← →) walks the list and wraps
export function pickWatched<W extends { id: string; hp: number }>(alive: W[], watchId: string | null, step: number): W | undefined {
  let watched = alive.find((w) => w.id === watchId);
  if (!watched && alive.length) watched = alive.reduce((a, w) => (w.hp > a.hp ? w : a));
  if (step && watched) watched = alive[(alive.indexOf(watched) + step + alive.length) % alive.length];
  return watched;
}

// Illusion: the copy uses the owner's look but stays visible and solid and never inherits the thrown state (16).
// In the snapshot the copy projectile carries the owner index in vel.x and its facing in vel.y
export function illusionCopies<D extends { id: string; status: number }>(projectiles: { kind: string; pos: Vec; vel: Vec }[], ids: string[], drawn: D[]) {
  return projectiles.flatMap((q) => {
    const ownerId = q.kind === 'illusion' ? ids[q.vel.x] : undefined;
    const o = drawn.find((d) => d.id === ownerId);
    return o ? [{ ...o, id: ownerId + '~ilusao', pos: q.pos, facing: q.vel.y, status: o.status & ~(16 | 1024 | 2048 | 8388608), channelElapsed: undefined, channelSpell: undefined, sniperLeft: undefined, sniperAt: undefined, basicLeft: 0, moving: true, cheer: false, illusion: true, ghost: false }] : [];
  });
}
