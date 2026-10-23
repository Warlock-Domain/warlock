// Decisões das telas sem DOM (testáveis): resultado do fim da partida, ordem da lista de salas, quem joga como bot e textos da Campanha.
import type { PublicPlayer, PublicRoom, RoomInfo } from '../shared/protocol.ts';
import type { MatchOpts } from '../shared/match.ts';
import type { WizView } from '../shared/snapshot.ts';
import { MAX_SPELLS, SPELL_IDS, type SpellId } from '../shared/spells.ts';
import { store } from './store.ts';
import type { ServoKind } from '../shared/campaign.ts';
import { HP_MAX } from '../shared/constants.ts';
import { itemStats } from '../shared/items.ts';
import { t } from './i18n.ts';

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

// Campanha: nome dos servos (o servidor manda em português), nome do estágio e a linha de onde a noite está
const SERVO_NAME: Record<ServoKind, string> = { ash: t('Cinzento', 'Ashen'), archer: t('Arqueiro de Fuligem', 'Soot Archer'), watcher: t('Vigia Oco', 'Hollow Watcher'), hound: t('Cão de Brasa', 'Ember Hound'), odran: t('Sir Odran, o Elmo Vazio', 'Sir Odran, the Empty Helm') };
export const STAGE_NAME = [t('Charneca Cinzenta', 'Ashen Moor')];
// vida máxima: a do servo, ou a de sempre com os itens
export const maxHp = (p: Pick<PublicPlayer, 'hpMax' | 'items'> | undefined) => p?.hpMax ?? HP_MAX + (p ? itemStats(p.items).hp : 0);
export function nightLine(n: NonNullable<PublicRoom['night']>, playing: boolean): string {
  const where = t(`Campanha · ${STAGE_NAME[n.stage]}`, `Campaign · ${STAGE_NAME[n.stage]}`);
  return playing && n.fight !== null ? where + t(` · encontro · onda ${n.wave + 1} de ${n.waves}`, ` · encounter · wave ${n.wave + 1} of ${n.waves}`) : where;
}
