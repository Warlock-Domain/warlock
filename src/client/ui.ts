// Telas em DOM: apelido, lista de salas, sala de espera, loja, barra de magias, placar e avisos.
import { ASSIST_GOLD, BOUNTY, CHEST, HP_MAX, KNOCK_HP_SCALE, KILL_GOLD, STREAK, LEADER_WIN_GOLD, RECOVERY, MAX_PLAYERS, ROUND_GOLD, TOP_DMG_GOLD, WIN_GOLD } from '../shared/constants.ts';
import { ARENA_NAMES, type ArenaId } from '../shared/arena.ts';
import type { BotSkill } from '../shared/bots.ts';
import { CHARACTERS, type CharacterId } from '../shared/characters.ts';
import { DEFAULT_OPTS, DM_GOALS, MODES, OPTION_CHOICES, VOTE_PHASES, canSell, sellValue, type MatchOpts, type Mode, type Vote } from '../shared/match.ts';
import type { BotSetup, PublicPlayer, PublicRoom, RoomInfo } from '../shared/protocol.ts';
import { ACTIVE_ITEMS, ITEMS, ITEM_IDS, MAX_ITEMS, isActive, itemPrice, type ItemId } from '../shared/items.ts';
import { MAX_SPELLS, MAX_SPELL_LEVEL, SPELL_IDS, isSpell, priceOf, spellCount, type SpellId } from '../shared/spells.ts';
import { isPadMode, isUiKey, labelOf, onKeysChange, setSlots, typing, uiLabel, type Action, type UiAction } from './keys.ts';
import { langChoice, openSettings, setSettingsCtx } from './settings.ts';
import { hideTip, itemTip, spellTip, withTip } from './tips.ts';
import { MODE_INFO, OPT_INFO, PACE_NAME, SKILL_NAME, infoButton } from './opt-info.ts';
import { BOT_LEVEL, COLORS, TEAM_COLORS } from './scene.ts';
import { SPELL_GROUPS, SPELL_USE, groupClass, n1, pct, spellClass } from './rules-text.ts';
import { ICON, ITEM_ICON, SOURCE_ICON, STATUS_ICONS, UI_ICON, actionName, el, icon, type Child } from './icons.ts';
import { BASE, diff, sheet, type Change, type SheetRow } from './sheet.ts';
import { store } from './store.ts';
import { botSetupPanel, hasBotSetup, savedBotSetup } from './train.ts';
import { CHALLENGES, bestOf, goalText } from './challenges.ts';
import { PROFILE_KEY, toSkill, type Profile } from './mimic.ts';
import { TAUNTS } from '../shared/taunts.ts';
import { endResult, roomGroups } from './screen-data.ts';
import { LOCALE, itemName, itemText, spellName } from './i18n.ts';

const TITLE = 'Warlock';
// tela de toque sem mouse: os textos de ajuda falam de tocar, não de clicar
export const TOUCH = matchMedia('(hover: none) and (pointer: coarse)').matches;

export function askName(root: HTMLElement, current: string): Promise<string> {
  return new Promise((resolve) => {
    const input = el('input', { id: 'name', maxlength: 20, placeholder: 'Seu apelido', value: current, autocomplete: 'nickname' }) as HTMLInputElement;
    const form = el(
      'form',
      { class: 'panel', onkeydown: (e: KeyboardEvent) => {
        // trocar o apelido: Esc desiste e fica o de antes
        if (e.key !== 'Escape' || !current) return;
        e.preventDefault(); // este Esc não abre as configurações
        overlay.remove();
        resolve(current);
      }, onsubmit: (e: Event) => {
        e.preventDefault();
        const name = input.value.replace(/[<>]/g, '').trim();
        if (!name) return input.focus();
        overlay.remove();
        resolve(name);
      } },
      el('h1', {}, TITLE),
      el('label', { for: 'name' }, 'Como seus amigos te chamam?'),
      input,
      el('button', { type: 'submit', class: 'primary' }, 'Continuar'),
    );
    const overlay = el('div', { class: 'overlay' }, form);
    root.append(overlay);
    input.focus();
  });
}

// o que a sala está fazendo, em palavras de quem vai entrar
const roomPhase = (r: RoomInfo) => r.phase === 'lobby' ? 'esperando começar' : r.phase === 'end' ? 'partida acabou, dá para começar outra'
  : `jogando${r.round ? ` a rodada ${r.round}` : ''} · você entra na próxima rodada`;

export function renderLobby(root: HTMLElement, name: string, rooms: RoomInfo[] | null, offline: boolean, onCreate: () => void, onRename: () => void) {
  setSettingsCtx({ name: () => name, rename: onRename }); // no lobby: sem som nem vídeo (só existem na sala)
  const retry = el('button', { type: 'button', onclick: () => location.reload() }, 'Tentar de novo');
  // um cartão por sala: código e modo, quem está lá, o que está acontecendo e o Entrar (secundário em sala no meio da partida)
  const cards = (list: RoomInfo[]) => el('ul', { class: 'rooms' }, ...list.map((r) =>
    el('li', { class: 'room-card' + (r.phase === 'lobby' ? ' open' : '') },
      el('div', { class: 'room-info' },
        el('div', { class: 'room-top' }, el('span', { class: 'code' }, r.id), r.mode && r.mode in MODE_NAME ? el('span', { class: 'room-mode' }, MODE_NAME[r.mode as Mode]) : null),
        r.players ? el('span', {}, icon(UI_ICON.person), ` ${r.players} ${r.players === 1 ? 'pessoa' : 'pessoas'}`, r.bots ? ' + ' : null, r.bots ? icon(UI_ICON.bot) : null, r.bots ? ` ${r.bots} ${r.bots === 1 ? 'bot' : 'bots'}` : null) : el('span', {}, 'Vazia (fecha sozinha daqui a pouco)'),
        el('small', {}, roomPhase(r))),
      el('a', { class: 'button' + (r.phase === 'lobby' || r.phase === 'end' ? '' : ' secondary'), href: '#' + r.id, 'aria-label': `Entrar na sala ${r.id}` }, 'Entrar'),
    )));
  const groups = rooms && roomGroups(rooms);
  const list =
    rooms === null && offline
      ? el('div', { class: 'lobby-error', role: 'alert' }, el('p', {}, 'Não deu para carregar as salas. Tentando de novo sozinho…'), retry)
      : !groups
      ? el('p', { class: 'muted' }, 'Carregando salas…')
      : el('div', { class: 'room-groups' },
          groups.live.length ? cards(groups.live) : el('p', { class: 'muted' }, `${groups.empty.length ? 'Nenhuma sala com gente' : 'Nenhuma sala aberta'}. Crie uma e mande o link no grupo.`),
          // salas vazias recolhidas: fecham sozinhas daqui a pouco
          groups.empty.length ? el('details', { class: 'empty-rooms' }, el('summary', {}, `${groups.empty.length} ${groups.empty.length === 1 ? 'sala vazia' : 'salas vazias'}`), cards(groups.empty)) : null);
  root.replaceChildren(
    el('div', { class: 'lobby' },
      el('header', { class: 'hero' },
        el('div', {}, el('h1', {}, TITLE), el('p', {}, 'Empurre os amigos para a lava com bola de fogo, raio e companhia. O último de pé vence a rodada.')),
        el('button', { type: 'button', class: 'link', onclick: onRename }, `${name} · trocar`),
      ),
      el('div', { class: 'lobby-actions' },
        el('button', { type: 'button', class: 'primary big', onclick: onCreate }, 'Criar sala'),
        el('button', { type: 'button', onclick: showRules }, 'Como jogar'),
        el('button', { type: 'button', onclick: () => openSettings() }, icon(UI_ICON.gear), ' Configurações'),
        langChoice(),
      ),
      el('section', {}, el('h2', {}, 'Salas abertas'), rooms !== null && offline ? el('p', { class: 'lobby-error', role: 'status' }, 'Sem conexão: a lista pode estar velha. Tentando de novo…') : null, list),
    ),
  );
}

// grimório (Como jogar): módulo carregado só quando abre, para não pesar o começo do jogo
export function showRules() {
  void import('./grimoire.ts').then((m) => m.openGrimoire());
}
// atalho do grimório (F1 no padrão) em qualquer tela; com ele já aberto, nada (o Esc fecha)
addEventListener('keydown', (e) => {
  if (!isUiKey(e.code, 'rules') || e.repeat || (e.target as HTMLElement)?.tagName === 'INPUT') return;
  e.preventDefault(); // F1: não abre a ajuda do navegador
  if (!document.querySelector('.rules-overlay')) showRules();
});

let toastTimer: ReturnType<typeof setTimeout> | undefined;
// tipo do aviso: muda a cor da borda e o ícone (style.css, #toast[data-kind])
type ToastKind = 'info' | 'good' | 'bad' | 'gold';
// msg pode vir com ícones (lista de textos e nós); o de ouro ganha a moeda na frente
export function toast(msg: string | (string | Node)[], kind: ToastKind = 'info') {
  let t = document.getElementById('toast');
  if (!t) document.body.append((t = el('div', { id: 'toast', role: 'status' })));
  t.replaceChildren(...(kind === 'gold' ? [icon(UI_ICON.gold)] : []), el('span', {}, ...[msg].flat()));
  t.dataset.kind = kind;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t!.classList.remove('show'), 3500);
}

// 'win': faixa grande dourada com confete, para quem venceu a rodada ou a partida
export function banner(text: string | (string | Node)[], kind: '' | 'good' | 'bad' | 'win' = '') {
  document.querySelectorAll('.banner').forEach((b) => b.remove());
  const b = el('div', { class: `banner ${kind}`, role: 'status', 'aria-live': 'polite' }, ...[text].flat());
  if (kind === 'win') b.append(...Array.from({ length: 22 }, (_, i) => el('i', { class: 'confetti', style: `--x:${Math.round(Math.cos(i * 2.4) * (90 + (i % 5) * 40))}px;--y:${Math.round(-60 - (i % 7) * 22)}px;--r:${i * 47}deg;--d:${(i % 4) * 0.05}s` })));
  document.body.append(b);
  setTimeout(() => b.remove(), kind === 'win' ? 2600 : 1700);
}

// cortina de ~180 ms ao trocar de tela (lobby, sala e partida): cobre a troca e some sozinha, sem pegar cliques
export function curtain() {
  const c = el('div', { class: 'curtain', 'aria-hidden': 'true' });
  document.body.append(c);
  setTimeout(() => c.remove(), 300);
}

export function screen(root: HTMLElement, title: string, text: string, button: string, onClick: () => void) {
  root.replaceChildren(el('div', { class: 'overlay' }, el('div', { class: 'panel' }, el('h1', {}, title), el('p', {}, text), el('button', { type: 'button', class: 'primary', onclick: onClick }, button))));
}

type RoomActions = {
  start: (bots: number, mode: Mode, shuffle: boolean, opts: MatchOpts, again?: boolean) => void; // again: "Jogar de novo" (repete a configuração do treino)
  hover: (a: SpellId | ItemId | null) => void; // mouse em cima da magia ou item na barra (círculo de alcance)
  train: (opts: Partial<MatchOpts>, setup?: BotSetup[]) => void; // partida de treino: 3 bots, modo Rodadas e dicas nas primeiras rodadas (com a dificuldade e as magias dos bots escolhidas)
  challenge: (id: string) => void; // desafio curto do treino (challenges.ts)
  shadow: (opts: Partial<MatchOpts>, skill: Partial<BotSkill>) => void; // treino contra 1 bot que joga como você (mimic.ts)
  buy: (s: SpellId) => void;
  buyItem: (i: ItemId) => void;
  kick: (id: string) => void;
  vote: (kind: Vote['kind'], target?: string) => void;
  ballot: (yes: boolean) => void;
  undo: (key: string) => void;
  sell: (key: string) => void;
  taunt: (i: number) => void;
  useItem: (i: ItemId) => void;
  pick: (c: CharacterId) => void;
  ready: () => void;
  spell: (s: SpellId) => void;
  volumes: () => { sfx: number; music: number };
  setVolume: (kind: 'sfx' | 'music', value: number) => void;
  click: () => void;
  // Efeitos: true = Leve
  fxLite: () => boolean;
  setFxLite: (lite: boolean) => void;
  spellReady: () => void; // uma magia acabou de recarregar
  watch: (step: number) => void; // espectador: +1 próximo vivo, −1 anterior
  replay: () => void; // liga ou desliga o replay da queda
  name: () => string; // apelido atual e a troca (aba Jogador das configurações)
  rename: () => void;
};

const MODE_NAME: Record<Mode, string> = { rounds: 'Rodadas', deathmatch: 'Deathmatch', teams: 'Times' };
export const TEAM_NAMES = ['Azul', 'Vermelho'];
const SHUFFLE_NAME = (shuffle: boolean) => (shuffle ? 'sorteados a cada rodada' : 'fixos na partida');
// opções da partida: nome de cada uma e o texto de cada valor (a meta depende do modo)
type OptKey = keyof MatchOpts;
const OPT_KEYS = Object.keys(OPTION_CHOICES) as OptKey[];
const OPT_NAME: Record<OptKey, string> = { shop: 'Tempo de loja', pace: 'Contagem e fim de rodada', economy: 'Ouro ganho', startGold: 'Ouro inicial', goal: 'Vence com', runes: 'Runas', sudden: 'Morte súbita', chests: 'Baús de ouro', difficulty: 'Dificuldade dos bots', arena: 'Arena' };
function optText(k: OptKey, val: MatchOpts[OptKey], mode: Mode): string {
  if (k === 'shop') return (val as number) >= 120 ? '2 min' : `${val} s`;
  if (k === 'pace') return PACE_NAME[val as MatchOpts['pace']];
  if (k === 'economy') return { 0.6: 'Pouco ×0,6', 1: 'Normal', 1.6: 'Muito ×1,6', 2.5: 'Festa ×2,5' }[val as MatchOpts['economy']];
  if (k === 'arena') return val === 'random' ? 'Sortear' : ARENA_NAMES[val as ArenaId];
  if (k === 'difficulty') return SKILL_NAME[val as MatchOpts['difficulty']];
  if (k === 'goal') return mode === 'deathmatch' ? `${DM_GOALS[val as MatchOpts['goal']]} abates` : `${val} rodadas`;
  if (typeof val === 'boolean') return val ? 'Ligado' : 'Desligado';
  return String(val);
}
// nome da opção com o botão "i" que explica o que ela faz e cada valor
const optLabel = (k: OptKey, mode: Mode) => el('div', { class: 'opt-label' }, el('small', {}, OPT_NAME[k]), infoButton(OPT_NAME[k], () => OPT_INFO[k](mode)));
// resumo de uma linha (loja e votação): "Loja 30 s · Ouro ×1,6 · Vence com 5 rodadas · sem runas"
function optsLine(o: MatchOpts, mode: Mode): string {
  const off = (['runes', 'sudden', 'chests'] as const).filter((k) => !o[k]).map((k) => 'sem ' + OPT_NAME[k].toLowerCase());
  const bots = o.difficulty !== 'normal' ? ['bots ' + { easy: 'fáceis', hard: 'difíceis', auto: 'automáticos' }[o.difficulty]] : [];
  const arena = o.arena !== 'random' ? ['arena ' + ARENA_NAMES[o.arena]] : [];
  return [`Loja ${optText('shop', o.shop, mode)}`, `Ouro ×${n1(o.economy)}`, `Vence com ${optText('goal', o.goal, mode)}`, ...arena, ...bots, ...off].join(' · ');
}
// texto de uma votação aberta
function voteText(v: { kind: Vote['kind']; target: string }, mode: Mode, name: (id: string) => string): string {
  if (v.kind === 'mode') return 'trocar para ' + MODE_NAME[v.target as Mode];
  if (v.kind === 'shuffle') return 'times ' + SHUFFLE_NAME(v.target === 'round');
  if (v.kind === 'kick') return 'expulsar ' + name(v.target);
  if (v.kind === 'opt') {
    const [k, raw] = v.target.split(':') as [OptKey, string];
    const val = (OPTION_CHOICES[k] as readonly (string | number | boolean)[]).find((c) => String(c) === raw) as MatchOpts[OptKey];
    return `${OPT_NAME[k]}: ${optText(k, val, mode)} na próxima rodada`;
  }
  return { restart: 'reiniciar a partida (tudo zerado)', end: 'encerrar a partida agora', addBot: 'pôr um bot na próxima rodada', removeBot: 'tirar um bot na próxima rodada', skipShop: 'pular a loja' }[v.kind];
}
const dot = (color: number) => el('span', { class: 'dot', style: `background:${COLORS[color]}` });
// modo Times: quadradinho com a cor do time antes do nome; a lista fica agrupada por time
const teamTag = (room: PublicRoom, p: PublicPlayer) =>
  room.mode === 'teams' && p.team !== null ? el('span', { class: 'dot', title: 'Time ' + TEAM_NAMES[p.team], style: `background:${TEAM_COLORS[p.team]};border-radius:2px` }) : null;
const byTeam = (room: PublicRoom, a: PublicPlayer, b: PublicPlayer) => (room.mode === 'teams' ? (a.team ?? 2) - (b.team ?? 2) : 0) || b.score - a.score;
// bolinhas de nível: as primeiras lvl acesas, de max
const pipsOf = (lvl: number, max: number) => Array.from({ length: max }, (_, n) => el('i', { class: n < lvl ? 'on' : '' }));
const nameOf = (p: PublicPlayer, me: string) => el('span', {}, p.name + (p.id === me ? ' (você)' : ''), p.bot ? ' ' : null, p.bot ? icon(UI_ICON.bot) : null);

// placar de estatísticas: ouro ganho, dano causado e precisão de cada magia de dano (acertos / lançamentos)
type Scope = 'round' | 'match' | 'room';
const SCOPES: [Scope, string][] = [['round', 'Rodada'], ['match', 'Partida'], ['room', 'Sala']];
const n0 = (x: number) => Math.round(x).toLocaleString(LOCALE);
// magias de utilidade: mostra quantas vezes usou (não têm "acerto"); as outras mostram precisão
const UTILITY = new Set(['teleport', 'shield', 'rush', 'pact', 'redirector', 'thrust', 'rockpillar', 'magnetize', 'alteration', 'warpzone']);
const srcIcon = (k: string) => icon(k === 'lava' ? SOURCE_ICON.lava : k in ICON ? ICON[k as SpellId] : k in ITEM_ICON ? ITEM_ICON[k as ItemId] : k.startsWith('choque') ? SOURCE_ICON.shock : k === 'pillar' ? SOURCE_ICON.pillar : SOURCE_ICON.unknown);
const gold = (n: number) => el('span', {}, icon(UI_ICON.gold), ' ' + n);
export const srcName = (k: string) => (k === 'lava' ? 'lava' : isSpell(k) ? spellName(k) : k in ITEMS ? itemName(k as ItemId) : k);

// placar (pedido do Fernando, 17/10; refeito em 18/10): abas Resumo e Magias, destaques com retrato e o melhor de cada coluna em dourado
type View = 'summary' | 'spells';
const VIEWS: [View, string][] = [['summary', 'Resumo'], ['spells', 'Magias']];
const portrait = (p: PublicPlayer) => el('img', { class: 'face', src: `/chars/${p.character}.webp`, alt: '', width: 32, height: 32, loading: 'lazy' });
// fileira de botões com um marcado (opções da partida, modo, jeito de lançar); off: botão desligado
export const choice = <T>(label: string, items: [T, string][], on: T, pick: (v: T) => void, off?: (v: T) => boolean) => el('div', { class: 'stats-tabs', role: 'group', 'aria-label': label },
  ...items.map(([v, text]) => el('button', { type: 'button', 'aria-pressed': String(v === on), class: v === on ? 'on' : '', disabled: off?.(v), onclick: () => pick(v) }, text)));
const tabs = <T extends string>(label: string, list: [T, string][], on: T, set: (k: T) => void) =>
  el('div', { class: 'stats-tabs', role: 'tablist', 'aria-label': label }, ...list.map(([k, text]) =>
    el('button', { type: 'button', role: 'tab', 'aria-selected': String(k === on), class: k === on ? 'on' : '', onclick: () => set(k) }, text)));

// kick: só no fim da partida, onde a tabela substitui a lista de jogadores
function statsBoard(room: PublicRoom, me: string, scope: Scope, setScope: (s: Scope) => void, view: View, setView: (v: View) => void, kick?: (id: string) => void) {
  const st = (p: PublicPlayer) => p.stats[scope];
  const rows = [...room.players].sort((a, b) => byTeam(room, a, b) || st(b).dmg - st(a).dmg); // em Times, agrupado por time
  const used = [...new Set(rows.flatMap((p) => Object.keys(st(p).fired ?? {})))].sort((a, b) => Number(UTILITY.has(a)) - Number(UTILITY.has(b)));
  const shots = (p: PublicPlayer) => Object.keys(st(p).fired ?? {}).filter((k) => !UTILITY.has(k)).reduce((a, k) => a + (st(p).fired[k] ?? 0), 0);
  const aim = (p: PublicPlayer) => {
    let l = 0;
    for (const k of Object.keys(st(p).fired ?? {})) if (!UTILITY.has(k)) l += st(p).landed[k] ?? 0;
    const f = shots(p);
    return f ? l / f : -1;
  };
  const deathCause = (p: PublicPlayer) => {
    const by = Object.entries(st(p).deathBy ?? {}).sort((a, b) => b[1] - a[1])[0];
    return by ? el('span', { class: 'cause', title: `Morreu mais por: ${srcName(by[0])} (${by[1]}×)` }, srcIcon(by[0]), ' ', el('small', {}, srcName(by[0]))) : '–';
  };
  type Col = { head: string; title: string; value: (p: PublicPlayer) => number; show: (n: number) => Child; best?: 'max' | 'min' };
  const cols: Col[] = [
    { head: room.mode === 'deathmatch' ? 'Pontos' : 'Vitórias', title: 'Pontos da partida', value: (p) => p.score, show: (n) => String(n), best: 'max' },
    { head: 'Abates', title: 'Abates (cair sozinho na lava não conta)', value: (p) => st(p).kills ?? 0, show: (n) => String(n), best: 'max' },
    { head: 'Mortes', title: 'Mortes', value: (p) => st(p).deaths ?? 0, show: (n) => String(n), best: 'min' },
    { head: 'Dano', title: 'Dano causado', value: (p) => st(p).dmg, show: (n) => n0(n), best: 'max' },
    { head: 'Ouro', title: 'Ouro ganho', value: (p) => st(p).gold, show: (n) => n0(n), best: 'max' },
    { head: 'Precisão', title: 'Acertos ÷ lançamentos das magias de dano', value: aim, best: 'max',
      show: (n) => (n < 0 ? '–' : el('span', { class: 'acc' }, el('span', { class: 'acc-bar' }, el('i', { style: `width:${Math.round(n * 100)}%` })), pct(n))) },
    ...(room.mode === 'deathmatch' ? [] : [{ head: 'Tempo vivo', title: 'Segundos vivo nas rodadas', value: (p: PublicPlayer) => st(p).alive ?? 0, show: (n: number) => (n ? `${Math.round(n)} s` : '–'), best: 'max' as const }]),
  ];
  const bestOf = cols.map((c) => {
    const vals = rows.map(c.value).filter((n) => n >= 0);
    if (!c.best || !vals.length) return null;
    const b = c.best === 'max' ? Math.max(...vals) : Math.min(...vals);
    // todos iguais (ex.: ninguém morreu): sem destaque
    if (vals.every((n) => n === b)) return null;
    return c.best === 'max' && b <= 0 ? null : b;
  });
  const who = (p: PublicPlayer) => el('span', { class: 'who' }, portrait(p), teamTag(room, p), el('span', { class: 'who-name' }, p.name, p.id === me ? el('small', {}, ' (você)') : null, p.bot ? el('small', {}, ' ', icon(UI_ICON.bot)) : null));
  // destaques: quem foi o melhor em cada coisa (só com valor acima de zero)
  const leader = (c: (p: PublicPlayer) => number) => {
    const top = [...rows].sort((a, b) => c(b) - c(a))[0];
    return top && c(top) > 0 ? top : null;
  };
  const card = (ico: string, label: string, p: PublicPlayer | null, value: string) =>
    el('div', { class: 'stat-card' }, p ? portrait(p) : el('span', { class: 'stat-ico' }, icon(ico)), el('small', {}, icon(ico), ' ', label), el('b', {}, p ? p.name : '–'), el('span', { class: 'stat-val' }, p ? value : ''));
  const mostDmg = leader((p) => st(p).dmg);
  const mostKills = leader((p) => st(p).kills ?? 0);
  const sharp = leader((p) => (shots(p) >= 5 ? aim(p) : -1));
  const rich = leader((p) => st(p).gold);
  // modo Times: placar de abates dos dois times no topo e um cabeçalho por time na tabela
  const teamKills = (t: number) => rows.filter((p) => p.team === t).reduce((a, p) => a + (st(p).kills ?? 0), 0);
  const teamHead = room.mode === 'teams' && rows.some((p) => p.team !== null)
    ? el('p', { class: 'team-score' }, el('b', { style: `color:${TEAM_COLORS[0]}` }, 'Time ' + TEAM_NAMES[0]), ` ${teamKills(0)} × ${teamKills(1)} `, el('b', { style: `color:${TEAM_COLORS[1]}` }, 'Time ' + TEAM_NAMES[1]), el('small', {}, ' · abates'))
    : null;
  const teamRow = (p: PublicPlayer, i: number, n: number) =>
    room.mode === 'teams' && p.team !== null && rows[i - 1]?.team !== p.team ? el('tr', { class: 'team-row' }, el('td', { colspan: n, style: `border-left:3px solid ${TEAM_COLORS[p.team]}` }, 'Time ' + TEAM_NAMES[p.team])) : null;
  const body = (cells: (p: PublicPlayer) => HTMLElement[], n: number) =>
    el('tbody', {}, ...rows.flatMap((p, i) => [teamRow(p, i, n), el('tr', { class: p.id === me ? 'me' : '' }, el('td', { class: 'player' }, who(p), kickBtn(p, kick)), ...cells(p))]));
  const summary = () => el('table', { class: 'stats-table summary' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Jogador'), ...cols.map((c) => el('th', { class: 'num', title: c.title }, c.head)), el('th', { title: 'O que mais derrubou este jogador' }, 'Caiu mais por'))),
    body((p) => [
      ...cols.map((c, ci) => {
        const n = c.value(p);
        return el('td', { class: 'num' + (bestOf[ci] !== null && n === bestOf[ci] ? ' best' : ''), 'data-label': c.head }, c.show(n));
      }),
      el('td', { 'data-label': 'Caiu mais por' }, deathCause(p)),
    ], cols.length + 2));
  const spellCell = (p: PublicPlayer, k: string) => {
    const f = st(p).fired?.[k] ?? 0;
    if (!f) return el('td', { class: 'num none' }, '–');
    if (UTILITY.has(k)) return el('td', { class: 'num', title: `${srcName(k)}: usou ${f}×` }, el('b', {}, `${f}×`), el('small', {}, f === 1 ? 'uso' : 'usos'));
    const l = st(p).landed?.[k] ?? 0;
    const d = st(p).dmgBy?.[k] ?? 0;
    return el('td', { class: 'num', title: `${srcName(k)}: ${l} acertos em ${f} · ${n0(d)} de dano` }, el('b', {}, pct(l / f)), el('small', {}, `${n0(d)} dano`));
  };
  const spells = () => used.length === 0
    ? el('p', { class: 'muted' }, 'Ninguém lançou magia ainda.')
    : el('table', { class: 'stats-table spells' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Jogador'), ...used.map((k) => el('th', { class: 'spell-head', title: UTILITY.has(k) ? `${srcName(k)}: usos` : `${srcName(k)}: precisão e dano` }, el('span', {}, srcIcon(k)), srcName(k))))),
      body((p) => used.map((k) => spellCell(p, k)), used.length + 1));
  return el('div', { class: 'stats' },
    el('div', { class: 'stats-bar' }, tabs('Vista do placar', VIEWS, view, setView), tabs('Período', SCOPES, scope, setScope)),
    el('div', { class: 'stat-cards' },
      card(UI_ICON.dmg, 'Mais dano', mostDmg, mostDmg ? n0(st(mostDmg).dmg) : ''),
      card(UI_ICON.kills, 'Mais abates', mostKills, mostKills ? String(st(mostKills).kills) : ''),
      card(UI_ICON.aim, 'Mais preciso', sharp, sharp ? pct(aim(sharp)) : ''),
      card(UI_ICON.gold, 'Mais ouro', rich, rich ? n0(st(rich).gold) : ''),
    ),
    teamHead,
    el('div', { class: 'stats-wrap' }, view === 'summary' ? summary() : spells()),
    el('small', { class: 'muted' }, view === 'summary'
      ? `${scope === 'round' ? 'Ao vivo, atualiza a cada segundo. ' : ''}Dourado: o melhor da coluna. Precisão conta só as magias de dano.`
      : 'Magias de dano: precisão (acertos ÷ lançamentos) e dano causado. Utilidade: quantas vezes usou.'),
  );
}

// quadro da loja: de onde vem o ouro (regras do Warlock Brawl) e quanto você já ganhou
// os valores seguem as opções da sala: toda renda é multiplicada pela economia (shared/match.ts, earn)
function goldInfo(p: PublicPlayer, opts: MatchOpts, open: boolean, onToggle: (open: boolean) => void) {
  const row = (label: string, value: Child, cls = '') => el('div', { class: 'gold-row ' + cls }, el('span', {}, label), el('b', {}, value));
  const g = (n: number) => Math.round(n * opts.economy);
  // recolhido por padrão: o Pronto fica logo abaixo do ouro
  return el('details', { class: 'gold-info', open, ontoggle: (e: Event) => onToggle((e.target as HTMLDetailsElement).open) },
    el('summary', { class: 'gold-title' }, 'Como ganho ouro', opts.economy !== 1 ? el('small', {}, ` · ouro ×${opts.economy.toLocaleString(LOCALE)} nesta sala`) : null),
    row('Começo da partida', `+${g(opts.startGold)}`),
    row('Cada rodada que você jogou', `+${g(ROUND_GOLD)}`),
    row('Vencer a rodada', `+${g(WIN_GOLD)} (líder: +${g(LEADER_WIN_GOLD)})`),
    row('Abate', `+${g(KILL_GOLD)}`),
    row('Abater o líder', `até +${g(BOUNTY.max)} extra`),
    row('Quebra-combo (derrubar quem tem 3+ abates seguidos)', `+${g(STREAK.breakGold)}`),
    row('Atrás da média da partida', `até +${g(RECOVERY.max)} por rodada`),
    row('Mais dano na rodada', `+${g(TOP_DMG_GOLD)}`),
    row('Assistência (mais dano em quem morreu)', `+${g(ASSIST_GOLD)}`),
    row('Baú: em cima do ouro', opts.chests ? `+${g(1)} a cada ${CHEST.goldEvery} s` : 'desligado nesta sala', opts.chests ? '' : 'muted'),
    el('hr', {}),
    row('Ganho na última rodada', gold(p.stats.round.gold)),
    row('Ganho na partida', gold(p.stats.match.gold)),
    row('Ganho na sala (todas as partidas)', gold(p.stats.room.gold)),
    el('small', { class: 'muted' }, 'Todo mundo ganha a rodada; vencer, abater e causar mais dano dão ouro extra. Desfazer (↩) devolve o ouro do que foi comprado nesta loja; Vender devolve 100% na loja em que comprou e 5% a menos por rodada com o item, até 75%.'),
  );
}

// botão de expulsar: só para bots e para quem caiu e não voltou
const kickBtn = (p: PublicPlayer, kick?: (id: string) => void) =>
  kick && (p.bot || !p.connected) ? el('button', { type: 'button', class: 'kick', title: `Expulsar ${p.name}`, 'aria-label': `Expulsar ${p.name}`, onclick: () => kick(p.id) }, '✕') : null;

// fim da partida: com times fixos vence o time; sorteados a cada rodada, todos que chegaram à meta juntos
function winTitle(r: PublicRoom): Child[] {
  if (r.winnerTeam !== null) return [icon(UI_ICON.wins), ` Time ${TEAM_NAMES[r.winnerTeam]} venceu!`];
  const champs = r.mode === 'teams' ? r.players.filter((p) => p.score >= r.goal) : [];
  if (champs.length > 1) return [icon(UI_ICON.wins), ` ${champs.map((p) => p.name).join(', ').replace(/, ([^,]*)$/, ' e $1')} venceram!`];
  return r.winner ? [icon(UI_ICON.wins), ` ${r.players.find((p) => p.id === r.winner)?.name ?? '?'} venceu!`] : ['Partida encerrada'];
}

// pódio do fim da partida: 2º, 1º e 3º lado a lado, com o retrato; empate nos pontos desempata pelo dano da partida
function podium(room: PublicRoom, me: string) {
  const top = [...room.players].sort((a, b) => b.score - a.score || b.stats.match.dmg - a.stats.match.dmg).slice(0, 3);
  // ninguém pontuou (encerrada cedo): pódio de zeros não diz nada
  if (top.length < 2 || top[0].score === 0) return null;
  const unit = room.mode === 'deathmatch' ? ['ponto', 'pontos'] : ['vitória', 'vitórias'];
  const step = (p: PublicPlayer, place: number) => el('div', { class: `podium-step p${place}` + (p.id === me ? ' me' : '') },
    el('img', { class: 'podium-face', src: `/chars/${p.character}.webp`, alt: '', width: 64, height: 64 }),
    el('b', {}, p.name), el('small', {}, `${p.score} ${unit[p.score === 1 ? 0 : 1]}`),
    el('span', { class: 'podium-block', 'aria-label': `${place}º lugar` }, icon(UI_ICON.wins)));
  return el('div', { class: 'podium', 'aria-label': 'Pódio' }, step(top[1], 2), step(top[0], 1), top[2] ? step(top[2], 3) : null);
}

function board(room: PublicRoom, me: string, kick?: (id: string) => void) {
  const sorted = [...room.players].sort((a, b) => byTeam(room, a, b));
  return el('ol', { class: 'board' }, ...sorted.map((p) =>
    el('li', { class: p.id === room.winner || (room.winnerTeam !== null && p.team === room.winnerTeam) ? 'win' : '' }, el('span', {}, teamTag(room, p), dot(p.color), ' ', nameOf(p, me), p.connected || p.bot ? '' : ' · caiu'), el('span', { class: 'board-right' }, el('b', {}, room.mode === 'deathmatch' ? `${p.score} ${p.score === 1 ? 'ponto' : 'pontos'}` : `${p.score} ${p.score === 1 ? 'vitória' : 'vitórias'}`), kickBtn(p, kick))),
  ));
}

// ficha do mago: atributos com a origem de cada número, magias equipadas e itens ativos
function sheetEl(rows: SheetRow[], ...extra: Child[]) {
  const groups = [...new Set(rows.map((r) => r.group))];
  return el('div', { class: 'sheet' }, ...extra, ...groups.map((g) => el('section', {},
    el('h4', {}, g === BASE ? 'Atributos' : g),
    el('dl', {}, ...rows.filter((r) => r.group === g).flatMap((r) => [el('dt', {}, r.label), el('dd', {}, r.value), r.from ? el('small', { class: 'from' }, r.from) : null])))));
}
// prévia na dica da loja: o que muda na ficha, melhor em verde e pior em vermelho
const previewHtml = (title: string, ch: Change[], extra = '') =>
  `<div class="preview"><b>${title}</b>${ch.length ? `<table>${ch.map((c) => `<tr class="${c.worse ? 'worse' : 'better'}"><th>${c.label}</th><td>${c.before ?? '—'} → ${c.after ?? '—'}</td></tr>`).join('')}</table>` : '<small>Nada muda na ficha.</small>'}${extra}</div>`;

export function createRoomUi(root: HTMLElement, code: string, act: RoomActions) {
  let bots = 3;
  try {
    bots = Number(sessionStorage.getItem('warlock:bots') ?? 3) || 0;
  } catch {
    // armazenamento bloqueado: fica o padrão
  }
  const status = el('span', { class: 'dot off', title: 'conexão' });
  // latência (ida e volta até a sala) ao lado do ponto de conexão, só na partida
  const ping = el('small', { class: 'ping', title: 'Latência: tempo de ida e volta até a sala', hidden: true });
  let pingAt = 0;
  const roundEl = el('span', { class: 'round' });
  const players = el('ul', { class: 'players' });
  // painéis do topo: abrir um fecha os outros (pedido do Fernando, 18/10); solo(null) fecha todos (Esc, menu de configurações)
  function solo(p: HTMLElement | null) {
    if (p?.hidden) return;
    for (const [q, b] of [[votePanel, voteBtn], [tauntPanel, null], [sheetPanel, sheetBtn], [peekPanel, peekBtn], [morePanel, moreBtn]] as [HTMLElement, HTMLElement | null][]) {
      if (q === p || q.hidden) continue;
      q.hidden = true;
      b?.setAttribute('aria-expanded', 'false');
    }
  }
  // abre ou fecha um painel do topo (fecha os outros) e marca o botão dele
  function toggle(p: HTMLElement, b: HTMLElement | null, open = p.hidden) {
    p.hidden = !open;
    solo(p);
    b?.setAttribute('aria-expanded', String(open));
  }
  // teclas, volume e efeitos moraram em painéis aqui; agora são abas do menu de configurações (settings.ts) e os botões abrem a aba
  const volIcon = () => volBtn.replaceChildren(icon(act.volumes().sfx + act.volumes().music === 0 ? UI_ICON.mute : UI_ICON.sound));
  setSettingsCtx({
    name: act.name, rename: act.rename, volumes: act.volumes, fxLite: act.fxLite, setFxLite: act.setFxLite, closePanels: () => solo(null),
    setVolume: (kind, v) => {
      act.setVolume(kind, v);
      volIcon();
    },
  });
  const gearBtn = el('button', { type: 'button', class: 'icon wide-only', title: 'Configurações (Esc)', 'aria-label': 'Configurações', onclick: () => openSettings() }, icon(UI_ICON.gear));
  onKeysChange(() => {
    bar.querySelectorAll<HTMLElement>('[data-action]').forEach((k) => (k.textContent = labelOf(k.dataset.action as Action)));
    drawCenter();
    drawHints();
  });
  const volBtn = el('button', { type: 'button', class: 'icon wide-only', title: 'Som', 'aria-label': 'Som', onclick: () => openSettings('som') }, icon(act.volumes().sfx + act.volumes().music === 0 ? UI_ICON.mute : UI_ICON.sound));
  // votação na partida: o botão abre as opções; a faixa no topo mostra a votação aberta para todos
  const votePanel = el('div', { class: 'vol-panel', hidden: true });
  const voteBtn = el('button', { type: 'button', class: 'vote-btn', title: 'Votar: trocar o modo ou expulsar alguém', 'aria-label': 'Votar', 'aria-expanded': 'false', onclick: () => toggle(votePanel, voteBtn) },
    icon(UI_ICON.vote), el('span', { class: 'vote-label' }, ' Votar'));
  const voteWrap = el('div', { class: 'vol' }, voteBtn, votePanel);
  // provocações (taunts): a tecla (Y no padrão) abre a lista e o número escolhe (ou clique); vale na loja e no jogo
  const sendTaunt = (i: number) => {
    act.taunt(i);
    tauntPanel.hidden = true;
  };
  const tauntTitle = el('b', {}, 'Provocações');
  const tauntPanel = el('div', { class: 'vol-panel', hidden: true }, tauntTitle,
    el('div', { class: 'taunt-list' }, ...TAUNTS.map((t, i) => el('button', { type: 'button', onclick: () => sendTaunt(i) }, `${(i + 1) % 10} · ${t.text}`))));
  const sheetBtn = el('button', { type: 'button', class: 'icon', 'aria-label': 'Ficha do mago', 'aria-expanded': 'false', onclick: () => toggleSheet() }, icon(UI_ICON.sheet));
  const tauntBtn = el('button', { type: 'button', class: 'icon wide-only', onclick: () => toggle(tauntPanel, null) }, icon(UI_ICON.taunt));
  addEventListener('keydown', (e) => {
    if (typing(e)) return;
    if (isUiKey(e.code, 'vote') && voteBtn.checkVisibility()) {
      e.preventDefault();
      voteBtn.click();
    } else if (isUiKey(e.code, 'taunt')) {
      toggle(tauntPanel, null);
      e.preventDefault();
    } else if (!tauntPanel.hidden && /^(Digit|Numpad)[0-9]$/.test(e.code)) {
      const i = (Number(e.code.slice(-1)) + 9) % 10; // 1..9 e o 0 para o 10º
      if (i < TAUNTS.length) sendTaunt(i);
      // o número não pode também usar o item da mesma tecla
      e.preventDefault();
      e.stopImmediatePropagation();
    } else if (e.code === 'Escape' && [votePanel, tauntPanel, sheetPanel, morePanel].some((p) => !p.hidden)) {
      // fechou um painel: este Esc não abre as configurações
      e.preventDefault();
      solo(null);
    }
  });
  const voteBar = el('div', { class: 'vote-bar', role: 'status', hidden: true });
  const voteLeft = el('span', { class: 'muted' });
  let voteEndsAt = 0;
  // celular: sem Tab, este botão (só aparece em tela de toque) abre e fecha o placar
  const tabBtn = el('button', { type: 'button', class: 'icon tab-toggle', title: 'Placar', 'aria-label': 'Placar', hidden: true, onclick: () => pinTab(!!tabOverlay.hidden) }, icon(UI_ICON.board));
  // loja só para ver no meio da rodada (pedido do Fernando, 18/10): botão no topo, tecla (4 no padrão), D-pad ↓; não pausa o jogo
  const PEEK_PHASES = ['countdown', 'playing', 'roundEnd'];
  const peekPanel = el('div', { class: 'peek-shop', role: 'dialog', 'aria-label': 'Loja (só para ver)', hidden: true });
  const peekBtn = el('button', { type: 'button', class: 'icon', 'aria-expanded': 'false', hidden: true, onclick: () => togglePeek() }, icon(UI_ICON.shop));
  let deadShop = false; // caiu na rodada (Rodadas/Times): a loja do meio da rodada compra e vende
  const DRAWER = matchMedia('(min-width: 861px) and (min-height: 501px)'); // largura em que a loja de quem caiu vira gaveta (style.css, .peek-shop.drawer)
  function drawPeek() {
    if (peekPanel.hidden || !room) return;
    hideTip(peekPanel); // a atualização de 1 s não pode deixar a dica órfã
    peekPanel.replaceChildren(shopPanel(room, true));
  }
  function togglePeek(open = peekPanel.hidden) {
    open &&= !!room && PEEK_PHASES.includes(room.phase);
    toggle(peekPanel, peekBtn, open);
    peekPanel.classList.toggle('drawer', deadShop); // gaveta só para quem caiu (ver deadShopping)
    if (!open) hideTip(peekPanel);
    drawPeek();
  }
  addEventListener('keydown', (e) => {
    if (typing(e)) return;
    if (isUiKey(e.code, 'shop') && room && PEEK_PHASES.includes(room.phase)) {
      e.preventDefault();
      togglePeek();
    } else if (e.code === 'Escape' && !peekPanel.hidden) {
      e.preventDefault();
      togglePeek(false);
    }
  });
  const helpBtn = el('button', { type: 'button', class: 'icon wide-only', onclick: showRules }, icon(UI_ICON.help));
  // celular: configurações, som, provocações e ajuda moram no "⋯" (style.css, .wide-only); ficam à vista loja, placar, ficha e votar
  const morePanel = el('div', { class: 'vol-panel more-panel', hidden: true },
    el('button', { type: 'button', onclick: () => openSettings() }, icon(UI_ICON.gear), ' Configurações'),
    el('button', { type: 'button', onclick: () => openSettings('som') }, icon(UI_ICON.sound), ' Som'),
    el('button', { type: 'button', onclick: () => toggle(tauntPanel, null, true) }, icon(UI_ICON.taunt), ' Provocações'),
    el('button', { type: 'button', onclick: () => {
      toggle(morePanel, moreBtn, false);
      showRules();
    } }, icon(UI_ICON.help), ' Como jogar'));
  const moreBtn = el('button', { type: 'button', class: 'icon', title: 'Mais opções', 'aria-label': 'Mais opções', 'aria-expanded': 'false', onclick: () => toggle(morePanel, moreBtn) }, '⋯');
  // dicas (title e aria-label) com a tecla atual de cada atalho
  const HINTS: [HTMLElement, string, UiAction][] = [[peekBtn, 'Ver a loja', 'shop'], [sheetBtn, 'Ficha do mago', 'sheet'], [tauntBtn, 'Provocações', 'taunt'], [helpBtn, 'Como jogar', 'rules'], [voteBtn, 'Votar: trocar o modo ou expulsar alguém', 'vote']];
  function drawHints() {
    for (const [b, text, a] of HINTS) {
      const t = uiLabel(a) === '—' ? text : `${text} (${uiLabel(a)})`;
      b.title = t;
      b.setAttribute('aria-label', t);
    }
    tauntTitle.textContent = uiLabel('taunt') === '—' ? 'Provocações' : `Provocações (${uiLabel('taunt')})`;
  }
  drawHints();
  const top = el('div', { class: 'hud-top' },
    el('button', { type: 'button', class: 'code', title: 'Copiar link da sala', 'aria-label': `Sala ${code}: copiar link`, onclick: () => copyLink() }, status, ' ', code, ping),
    roundEl,
    el('div', { class: 'hud-right' }, peekBtn, tabBtn, sheetBtn, el('div', { class: 'vol' }, tauntBtn, tauntPanel), voteWrap, volBtn, gearBtn, helpBtn, el('div', { class: 'vol more-wrap' }, moreBtn, morePanel)),
  );
  const center = el('div', { class: 'center' });
  // a janela da loja pode ser alargada pela alça do canto (PC); o tamanho fica salvo neste navegador (pedido do Fernando, 18/10)
  const SHOP_SIZE = 'warlock:shopSize';
  new ResizeObserver(() => {
    if (!center.classList.contains('shop-open') || !center.style.width) return;
    store.set(SHOP_SIZE, JSON.stringify([center.style.width, center.style.height]));
  }).observe(center);
  const timer = el('div', { class: 'timer' });
  const respawn = el('div', { class: 'respawn' });
  const buttons = new Map<SpellId, { b: HTMLElement; cd: HTMLElement; pips: HTMLElement }>();
  let mine: PublicPlayer | undefined;
  const bar = el('div', { class: 'spellbar' }, ...SPELL_IDS.map((s) => {
    const cd = el('span', { class: 'cd' });
    const pips = el('span', { class: 'pips' });
    const b = withTip(el('button', { type: 'button', class: 'spell ' + spellClass(s), 'aria-label': spellName(s), onclick: () => act.spell(s), onpointerenter: (e: PointerEvent) => e.pointerType === 'mouse' && act.hover(s), onpointerleave: () => act.hover(null) },
      el('span', { class: 'key', 'data-action': s }, labelOf(s)), el('span', { class: 'ico' }, icon(ICON[s])), pips, cd), () => spellTip(s, mine?.spells[s] ?? 0));
    buttons.set(s, { b, cd, pips });
    return b;
  }));
  // itens ativos (teclas 1, 2 e 3) ao lado das magias; só aparecem se comprados
  const itemButtons = new Map<ItemId, { b: HTMLElement; cd: HTMLElement }>();
  for (const i of ACTIVE_ITEMS) {
    const cd = el('span', { class: 'cd' });
    const b = withTip(el('button', { type: 'button', class: 'spell item', 'aria-label': itemName(i), onclick: () => act.useItem(i), onpointerenter: (e: PointerEvent) => e.pointerType === 'mouse' && act.hover(i), onpointerleave: () => act.hover(null) },
      el('span', { class: 'key', 'data-action': i }, labelOf(i)), el('span', { class: 'ico' }, icon(ITEM_ICON[i])), cd), () => itemTip(i, mine?.items[i] ?? 0));
    b.hidden = true;
    itemButtons.set(i, { b, cd });
    bar.append(b);
  }
  const passives = el('div', { class: 'passives' });
  // segurar Tab durante a partida mostra o placar; o 📊 (toque) e o botão Placar da loja deixam aberto até fechar
  const tabOverlay = el('div', { class: 'tab-overlay', hidden: true });
  function showTab(on: boolean) {
    tabOverlay.hidden = !on || !room;
    if (tabOverlay.hidden) tabOverlay.classList.remove('pinned');
    if (on && room) tabOverlay.replaceChildren(el('div', { class: 'card' },
      el('div', { class: 'stats-head' }, el('h2', { class: 'title' }, 'Placar'),
        tabOverlay.classList.contains('pinned') ? el('button', { type: 'button', class: 'icon', title: 'Fechar o placar', 'aria-label': 'Fechar o placar', onclick: () => pinTab(false) }, '✕') : el('small', {}, '← → troca o período')),
      statsBoard(room, me, scope, setScope, view, setView)));
  }
  function pinTab(open: boolean) {
    tabOverlay.classList.toggle('pinned', open);
    showTab(open);
  }
  const TAB_PHASES = ['playing', 'countdown', 'roundEnd', 'shop'];
  addEventListener('keydown', (e) => {
    if (!tabOverlay.hidden && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
      const i = SCOPES.findIndex(([k]) => k === scope);
      setScope(SCOPES[(i + (e.code === 'ArrowLeft' ? SCOPES.length - 1 : 1)) % SCOPES.length][0]);
      e.preventDefault();
      return;
    }
    if (e.code === 'Escape' && tabOverlay.classList.contains('pinned')) {
      e.preventDefault(); // fechou o placar fixo: este Esc não abre as configurações
      return pinTab(false);
    }
    // placar pelo Tab (pedido do Fernando, 17/10; trocável), também na loja (19/10: "na hora de compra o tab não está abrindo o placar")
    if (!isUiKey(e.code, 'board') || !room || !TAB_PHASES.includes(room.phase)) return;
    e.preventDefault();
    if (!e.repeat) showTab(true);
  });
  addEventListener('keyup', (e) => isUiKey(e.code, 'board') && !tabOverlay.classList.contains('pinned') && showTab(false));
  // magia escolhida pelo botão: diz o que fazer agora e como desistir (no toque não há Esc)
  let shownArmed: string | null = null;
  const armedText = el('span', {});
  const armedHint = el('div', { class: 'armed-hint', role: 'status', hidden: true }, armedText,
    el('button', { type: 'button', class: 'icon', title: 'Cancelar', 'aria-label': 'Cancelar a magia escolhida', onclick: () => {
      if (isSpell(shownArmed)) act.spell(shownArmed);
      else if (shownArmed) act.useItem(shownArmed as ItemId);
    } }, '✕'));
  // vida grande e ouro logo acima da barra de magias (só jogando e vivo)
  const hpFill = el('i', {});
  const hpText = el('span', { class: 'hp-text' });
  const hpBar = el('div', { class: 'hpbar', role: 'img' }, hpFill, hpText);
  const goldNow = el('span', { class: 'gold' });
  const vitals = el('div', { class: 'vitals', hidden: true }, hpBar, goldNow);
  const barWrap = el('div', { class: 'barwrap' }, armedHint, vitals, passives, bar);
  // a barra some na sala, na loja e no fim (update, a cada segundo) e enquanto eu assisto morto (watching, a cada quadro): uma conta só, sem piscar
  let barOff = true;
  let watchingNow = false;
  const syncBar = () => (barWrap.hidden = barOff || watchingNow);
  // varredura da recarga: o total é o tempo restante quando a recarga começou (ou cresceu); a Recarga e a runa só encurtam
  const cdTotal = new Map<string, number>();
  const cdLeft = new Map<string, number>();
  // queda de conexão: faixa no topo (aparece depois de 1,5 s, para não piscar ao entrar) e botões da sala e da loja desligados
  let online = false;
  function setOnline(on: boolean) {
    online = on;
    status.className = 'dot ' + (on ? 'on' : 'off');
    offline.hidden = on;
  }
  const offline = el('div', { class: 'offline', role: 'alert', hidden: true }, 'Sem conexão, tentando de novo…');
  // ficha do mago na partida: tecla ' (à esquerda do 1) ou o botão 📜; no celular vira gaveta de baixo para cima
  const sheetPanel = el('div', { class: 'sheet-panel', role: 'dialog', 'aria-label': 'Ficha do mago', hidden: true });
  let myStatus = 0;
  function drawSheet() {
    if (sheetPanel.hidden || !mine) return;
    const taken = live[me]?.taken ?? 0;
    const effects = STATUS_ICONS.filter(([bit]) => myStatus & bit);
    sheetPanel.replaceChildren(
      el('div', { class: 'stats-head' }, el('h2', { class: 'title' }, 'Ficha do mago'), el('button', { type: 'button', class: 'icon', title: 'Fechar a ficha', 'aria-label': 'Fechar a ficha', onclick: () => toggleSheet(false) }, '✕')),
      sheetEl(sheet(mine.spells, mine.items),
        el('section', {}, el('h4', {}, 'Agora'), el('dl', {},
          el('dt', {}, 'Dano levado na rodada'), el('dd', {}, `${Math.round(taken)} · empurrão ×${(1 + (KNOCK_HP_SCALE * taken) / HP_MAX).toLocaleString(LOCALE, { maximumFractionDigits: 2 })}`), el('small', { class: 'from' }, 'Cada ponto de dano levado faz você voar mais longe até o fim da rodada (a lava conta pela metade e não entra nesta conta).'),
          el('dt', {}, 'Efeitos'), el('dd', {}, ...(effects.length ? effects.flatMap(([, ico, name], i) => [i ? ' · ' : '', icon(ico), ' ' + name]) : ['nenhum']))))),
    );
  }
  function toggleSheet(open = sheetPanel.hidden) {
    toggle(sheetPanel, sheetBtn, open);
    drawSheet();
  }
  addEventListener('keydown', (e) => {
    if (!isUiKey(e.code, 'sheet') || typing(e) || !room || room.phase === 'lobby') return;
    e.preventDefault();
    toggleSheet();
  });
  // feed de abates no canto: quem derrubou quem e com o quê; cada linha some em 5 s
  const feed = el('ol', { class: 'feed', 'aria-live': 'polite' });
  // borda vermelha: vida baixa (fixa) e pé na lava (pulsando); fica atrás do resto da HUD
  const danger = el('div', { class: 'danger', 'aria-hidden': 'true' });
  // dica do modo treino, uma por vez
  const coachText = el('span', {});
  const coachAgain = el('button', { type: 'button', hidden: true }, 'Repetir'); // fim do desafio
  const coachQuit = el('button', { type: 'button', hidden: true }, 'Sair do desafio');
  const coach = el('div', { class: 'coach', role: 'status', hidden: true }, icon(UI_ICON.tip), ' ', coachText, coachAgain, coachQuit);
  // espectador: selo "Assistindo X" com setas para trocar (← → no teclado)
  const watchName = el('b', {});
  const watchBadge = el('div', { class: 'watching', role: 'status', hidden: true },
    el('button', { type: 'button', class: 'icon', title: 'Anterior (←)', 'aria-label': 'Assistir o anterior', onclick: () => act.watch(-1) }, '‹'),
    el('span', {}, 'Assistindo ', watchName, TOUCH ? null : el('small', {}, ' · ← → troca')),
    el('button', { type: 'button', class: 'icon', title: 'Próximo (→)', 'aria-label': 'Assistir o próximo', onclick: () => act.watch(1) }, '›'));
  // caiu nas Rodadas ou nos Times: botão Loja pulsando no selo (no celular a loja não abre sozinha)
  const shopNudge = el('button', { type: 'button', class: 'shop-nudge', hidden: true, onclick: () => togglePeek() }, icon(UI_ICON.shop), ' Loja');
  watchBadge.append(shopNudge);
  // replay da queda: botão depois de cair; durante o replay, a faixa com quem derrubou e o botão de sair
  const replayText = el('span', {});
  const replayBtn = el('button', { type: 'button', onclick: () => act.replay() });
  const replayBar = el('div', { class: 'replay', role: 'status', hidden: true }, replayText, replayBtn);
  addEventListener('keydown', (e) => {
    if (!isUiKey(e.code, 'replay') || e.repeat || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    e.preventDefault();
    act.replay();
  });
  root.replaceChildren(el('div', { class: 'hud' }, danger, top, offline, players, timer, respawn, feed, coach, watchBadge, replayBar, center, voteBar, barWrap, sheetPanel, peekPanel, tabOverlay), el('div', { class: 'labels', id: 'labels' }));
  // clique dos botões da sala e da loja
  root.addEventListener('click', (e) => (e.target as HTMLElement).closest('button') && act.click());

  // convite: no celular abre o compartilhar do sistema (WhatsApp etc.); no PC copia o link e confirma no botão
  const SHARE = TOUCH && !!navigator.share;
  function copyLink(btn?: HTMLElement) {
    const url = location.href;
    if (SHARE) return void navigator.share({ title: TITLE, text: 'Bora jogar Warlock?', url }).catch(() => {});
    navigator.clipboard?.writeText(url).then(() => {
      toast('Link copiado. Mande no grupo!', 'good');
      if (!btn) return;
      btn.textContent = '✓ Link copiado';
      setTimeout(() => (btn.textContent = 'Copiar link da sala'), 2000);
    }, () => toast(url));
  }
  const inviteBtn = () => {
    const b: HTMLElement = el('button', { type: 'button', onclick: () => copyLink(b) }, SHARE ? 'Convidar amigos' : 'Copiar link da sala');
    return b;
  };

  let room: PublicRoom | null = null;
  let me = '';
  let scope: Scope = 'round';
  let view: View = 'summary';
  const setScope = (s: Scope) => {
    scope = s;
    drawCenter();
    if (!tabOverlay.hidden) showTab(true);
  };
  const setView = (v: View) => {
    view = v;
    drawCenter();
    if (!tabOverlay.hidden) showTab(true);
  };
  let phaseEndsAt = 0;
  let mode: Mode = 'rounds';
  let shuffle = true; // Times: sorteados a cada rodada ou fixos na partida
  let opts: MatchOpts | null = null; // opções da partida escolhidas aqui; começa com as da sala
  let optsOpen = true;
  let challengesOpen = false;
  let setup = false; // fim da partida: true depois do "Voltar à sala"
  let botCfg = savedBotSetup(); // treino: magias escolhidas para cada bot

  // grade com o retrato de cada personagem; o escolhido fica marcado
  function picker(r: PublicRoom) {
    const mine = r.players.find((p) => p.id === me);
    if (!mine) return null;
    return el('div', { class: 'picker' },
      el('span', { class: 'muted' }, 'Seu personagem'),
      el('div', { class: 'picker-grid' }, ...CHARACTERS.map((c) =>
        el('button', { type: 'button', class: 'pick' + (mine.character === c.id ? ' on' : ''), title: c.name, 'aria-pressed': mine.character === c.id ? 'true' : 'false', onclick: () => act.pick(c.id) },
          el('img', { src: `/chars/${c.id}.webp`, alt: '', width: 60, height: 80 }), el('small', {}, c.name)),
      )),
    );
  }

  // sombra: 1 bot com o jeito de jogar das suas últimas rodadas; o que não foi medido fica no Normal (por isso a dificuldade vai Normal)
  function shadowBtn(o: MatchOpts) {
    const skill = toSkill(store.json<Profile>(PROFILE_KEY));
    return el('button', { type: 'button', class: 'train', disabled: !skill, onclick: () => skill && act.shadow({ ...DEFAULT_OPTS, arena: o.arena }, skill) },
      icon(UI_ICON.person), ' Treinar contra a sua sombra', el('small', {}, skill ? '1 bot que joga como você' : 'jogue 3 rodadas para a sombra aprender'));
  }

  function lobbyPanel(r: PublicRoom) {
    const humans = r.players.filter((p) => !p.bot).length;
    const maxBots = MAX_PLAYERS - humans;
    bots = Math.min(bots, maxBots);
    const count = el('b', { class: 'count' }, String(bots));
    const set = (n: number) => {
      bots = Math.max(0, Math.min(maxBots, n));
      try {
        sessionStorage.setItem('warlock:bots', String(bots));
      } catch {
        // só nesta tela
      }
      count.textContent = String(bots);
      startBtn.toggleAttribute('disabled', humans + bots < 2);
    };
    const o = (opts ??= { ...DEFAULT_OPTS, ...r.opts });
    const startBtn = el('button', { type: 'button', class: 'primary big', disabled: humans + bots < 2, onclick: () => act.start(bots, mode, shuffle, o) }, 'Começar partida');
    const modes: [Mode, string, string][] = [
      ['rounds', 'Rodadas', `O último vivo ganha a rodada. Vence quem fizer ${o.goal} rodadas.`],
      ['deathmatch', 'Deathmatch', `Rodadas de 60 s, quem cai volta em 10 s. Cada abate vale 1 ponto; vence quem chegar a ${DM_GOALS[o.goal]}.`],
      ['teams', 'Times', `Azul contra Vermelho. A rodada acaba quando só sobra um time, e todos dele ganham 1 ponto; vence quem fizer ${o.goal}. Magia em aliado só empurra.`],
    ];
    // Times: o grupo escolhe se os times mudam a cada rodada ou ficam até o fim
    const shufflePicker = mode !== 'teams' ? null : choice('Sorteio dos times', [[true, 'Sorteados a cada rodada'], [false, 'Fixos na partida']], shuffle, (k) => ((shuffle = k), drawCenter()));
    const modePicker = el('div', { class: 'mode' },
      el('div', { class: 'opt-label' }, choice('Modo de jogo', modes.map(([k, label]): [Mode, string] => [k, label]), mode, (k) => ((mode = k), drawCenter())), infoButton('Modos de jogo', MODE_INFO)),
      el('small', { class: 'muted' }, modes.find(([k]) => k === mode)![2]), shufflePicker);
    // opções da partida: uma fileira de botões por opção, como o seletor de modo; vão junto com o "Começar"
    // abertas por padrão: quem cria a sala vê as opções sem procurar (fechar fica guardado até sair da sala)
    const optsBlock = el('details', { class: 'match-opts', open: optsOpen, ontoggle: (e: Event) => (optsOpen = (e.target as HTMLDetailsElement).open) }, el('summary', {}, 'Opções da partida · ', el('small', { class: 'muted' }, optsLine(o, mode))),
      el('div', { class: 'opt-grid' }, ...OPT_KEYS.map((k) => el('div', { class: 'opt-row' }, optLabel(k, mode),
        choice(OPT_NAME[k], (OPTION_CHOICES[k] as readonly MatchOpts[OptKey][]).map((val): [MatchOpts[OptKey], string] => [val, optText(k, val, mode)]), o[k], (val) => (Object.assign(o, { [k]: val }), drawCenter()))))));
    return el('div', { class: 'card room-wait' },
      el('div', {}, el('h2', { class: 'title' }, 'Sala ' + r.id), el('p', { class: 'muted' }, 'Mande o link para os amigos entrarem. Até 8 magos.'),
        el('ul', { class: 'board' }, ...r.players.map((p) => el('li', {}, el('span', {}, teamTag(r, p), dot(p.color), ' ', nameOf(p, me), p.connected || p.bot ? '' : ' · caiu'), kickBtn(p, act.kick))))),
      // no PC em colunas, lado a lado (Fernando, 19/10: "tá muito vertical"); no celular uma embaixo da outra
      el('div', { class: 'lobby-cols' },
        humans === 1 ? el('div', { class: 'lobby-col' },
        // sozinho na sala: treino com 3 bots e dicas curtas nas primeiras rodadas, logo à vista
        // treino com as regras-padrão (depois de um desafio a sala fica sem runas, morte súbita e baús); também depois do "Voltar à sala"
        el('button', { type: 'button', class: 'train', onclick: () => act.train({ ...DEFAULT_OPTS, difficulty: o.difficulty, arena: o.arena }, hasBotSetup(botCfg) ? botCfg : undefined) }, icon(UI_ICON.aim), ' Treinar sozinho com bots', el('small', {}, '3 bots e dicas nas primeiras rodadas')),
        botSetupPanel(3, botCfg, (s) => (botCfg = s)),
        shadowBtn(o),
        // desafios curtos (só sozinho; também depois do "Voltar à sala", para trocar de desafio): cada um com o recorde deste navegador
        el('details', { class: 'match-opts', open: challengesOpen, ontoggle: (e: Event) => (challengesOpen = (e.target as HTMLDetailsElement).open) },
          el('summary', {}, 'Desafios · ', el('small', { class: 'muted' }, 'tarefas curtas de até 90 s')),
          el('div', { class: 'bs-spells' }, ...CHALLENGES.map((c) => {
            const best = bestOf(c.id);
            return el('button', { type: 'button', class: 'train', onclick: () => act.challenge(c.id) }, c.name,
              el('small', {}, goalText(c)), el('small', { class: 'muted' }, best === null ? 'sem recorde' : `recorde: ${n1(best)} s${c.survive ? ' vivo' : ''}`));
          }))),
        ) : null,
        el('div', { class: 'lobby-col' }, picker(r),
          el('div', { class: 'bots' }, el('span', {}, 'Bots'), el('button', { type: 'button', 'aria-label': 'Menos um bot', onclick: () => set(bots - 1) }, '−'), count, el('button', { type: 'button', 'aria-label': 'Mais um bot', onclick: () => set(bots + 1) }, '+')),
        ),
        el('div', { class: 'lobby-col' }, modePicker, optsBlock),
      ),
      // Começar e Convidar grudados no rodapé enquanto rola as opções
      el('div', { class: 'card-go' }, startBtn, inviteBtn()),
    );
  }

  // "Voltar à sala" e "Sair do desafio": a sala de espera começa com as opções da partida que acabou
  function toRoom(r: PublicRoom) {
    setup = true;
    mode = r.mode;
    shuffle = r.teamShuffle;
    opts = { ...r.opts };
    bots = r.players.filter((p) => p.bot).length;
    drawCenter();
    center.scrollTop = 0;
  }

  // fim da partida: resultado e as duas saídas rápidas no topo; "Voltar à sala" mostra a sala de espera para trocar modo e opções
  function endPanel(r: PublicRoom) {
    const roomBots = r.players.filter((p) => p.bot).length;
    const humans = r.players.filter((p) => !p.bot && p.connected).length;
    const again = el('button', { type: 'button', class: 'primary big', disabled: humans + roomBots < 2, onclick: () => act.start(roomBots, r.mode, r.teamShuffle, r.opts, true) }, 'Jogar de novo');
    // cabeçalho grande: Vitória (eu ou meu time), Derrota (outro venceu) ou Fim de jogo (sem vencedor ou só assistindo)
    const res = endResult(r, me);
    const noWinner = !r.winner && r.winnerTeam === null;
    return el('div', { class: 'card' },
      el('div', { class: 'end-head' },
        el('h2', { class: 'end-title ' + res }, res === 'win' ? 'Vitória' : res === 'loss' ? 'Derrota' : 'Fim de jogo'),
        el('p', { class: 'end-winner' }, ...(noWinner ? ['Partida encerrada sem vencedor (empate ou ninguém fez ponto).'] : winTitle(r)))),
      podium(r, me),
      el('div', { class: 'end-actions' }, again, el('button', { type: 'button', class: 'big', onclick: () => {
        curtain();
        toRoom(r);
      } }, 'Voltar à sala')),
      el('small', { class: 'muted end-hint' }, `Jogar de novo repete tudo: ${MODE_NAME[r.mode]}, ${roomBots} ${roomBots === 1 ? 'bot' : 'bots'}, ${optsLine(r.opts, r.mode)}.`),
      statsBoard(r, me, scope, setScope, view, setView, act.kick));
  }

  // estado da loja que sobrevive ao redesenho (a sala manda o estado a cada compra de qualquer jogador)
  let goldOpen = false;
  let sheetOpen = true;
  let readyBtn: HTMLElement | null = null;
  // cartão de primeira vez na loja da rodada 0: some ao fechar ou ao apertar Pronto, e fica guardado no navegador
  const FIRST = 'warlock:firstshop';
  let firstSeen = store.get(FIRST) === '1';
  const seeFirst = () => {
    firstSeen = true;
    store.set(FIRST, '1');
  };
  const firstCard = () => el('div', { class: 'first-tip', role: 'note' },
    el('p', {}, el('b', {}, 'Primeira vez? '), TOUCH
      ? 'Toque no chão para andar · toque numa magia e depois no chão para lançar · compre 1 ou 2 magias e aperte Pronto.'
      : isPadMode() ? 'Analógico esquerdo anda · A atira a Bola de fogo para onde o direito mira · compre 1 ou 2 magias e aperte Start (Pronto).'
      : `Botão direito anda · ${labelOf('fireball')} atira a Bola de fogo na direção do mouse · compre 1 ou 2 magias e aperte Pronto.`),
    el('button', { type: 'button', class: 'link', onclick: () => { seeFirst(); drawCenter(); } }, 'Entendi'));
  const readyText = (ready: boolean) => `${ready ? 'Esperando os outros' : 'Pronto'} · ${Math.ceil(Math.max(0, (phaseEndsAt - performance.now()) / 1000))} s`;

  // peek: a loja só para ver no meio da rodada (sem comprar, vender nem Pronto); morto nas Rodadas e nos Times ela vale de verdade
  function shopPanel(r: PublicRoom, look = false) {
    const peek = look && !deadShop;
    const mine = r.players.find((p) => p.id === me);
    // desfazer: só o que foi comprado nesta loja (devolve o ouro)
    const undoBtn = (key: string) => (!peek && mine?.bought.includes(key) ? el('button', { type: 'button', class: 'undo', title: 'Desfazer a compra (devolve o ouro)', 'aria-label': 'Desfazer a compra', 'data-key': 'undo-' + key, onclick: () => act.undo(key) }, '↩') : null);
    if (!mine) return el('div', { class: 'card' }, el('p', {}, 'Você está assistindo. Entra na próxima partida.'));
    // vender: magia ou item inteiro; o comprado nesta loja volta inteiro, o de antes pela metade
    const sellBtn = (key: string) => {
      const value = sellValue(mine, r.round, key);
      // a Bola de fogo vende mesmo valendo 0 (o nível 1 é grátis): libera a vaga e a tecla
      const title = value > 0 ? 'Vende tudo: volta 100% na loja em que comprou e 5% a menos por rodada com ele, até 75%' : 'O nível 1 é grátis e volta 0 de ouro; vender libera a vaga de magia (compra de volta de graça)';
      return !peek && canSell(mine, r.round, key) ? el('button', { type: 'button', class: 'sell', title, 'data-key': 'sell-' + key, onclick: () => act.sell(key) }, `Vender · ${value}`) : null;
    };
    // um cartão por magia ou item: "dá para comprar" e "já tenho" à vista, e quanto falta quando o ouro não dá
    type Offer = { key: string; ico: string; name: string; hotkey: string | null; use: string; lvl: number; max: number; price: number | null; blocked: string | null; buy: () => void; tip: () => string;
      // a ficha depois de comprar mais um nível e depois de vender tudo (prévia na dica)
      bought: () => SheetRow[]; sold: () => SheetRow[] };
    const now = sheet(mine.spells, mine.items);
    const sheetBox = () => el('details', { class: 'sheet-box', open: sheetOpen, ontoggle: (e: Event) => (sheetOpen = (e.target as HTMLDetailsElement).open) },
      el('summary', {}, 'Ficha do mago'), sheetEl(now, el('small', { class: 'muted' }, 'Passe o mouse num item para ver o que muda.')));
    const offer = (o: Offer) => {
      const open = o.price !== null && !o.blocked;
      const can = open && mine.gold >= o.price!;
      const need = open && !can ? o.price! - mine.gold : 0;
      const key = o.key.replace('-', ':'); // spell:x ou item:y, como na compra
      const label = o.blocked ?? (o.lvl === 0 ? (o.price === 0 ? 'Comprar · grátis' : `Comprar · ${o.price}`) : `Nível ${o.lvl + 1} · ${o.price}`);
      // só ver: no lugar do botão, só o preço (verde se o ouro de agora dá, vermelho se não); "a compra abre entre as rodadas" fica no cabeçalho
      const price = el('span', { class: 'peek-price' + (o.blocked ? '' : can ? ' can' : ' cant') },
        ...(o.blocked ? [o.blocked] : [o.lvl ? `Nível ${o.lvl + 1} · ` : '', icon(UI_ICON.gold), o.price === 0 ? ' grátis' : ` ${o.price}`]));
      return withTip(el('div', { class: 'shop-item' + (o.key.startsWith('item') ? ' is-item' : '') + (o.lvl ? ' owned' : '') + (can && !peek ? ' can' : '') + (o.blocked && !o.lvl ? ' locked' : '') },
        el('div', { class: 'shop-title' }, el('span', { class: 'ico' }, icon(o.ico)), el('b', {}, o.name), o.hotkey !== null ? el('span', { class: 'key' }, o.hotkey) : null),
        el('small', {}, o.use),
        el('div', { class: 'shop-meta' }, el('span', { class: 'pips' }, ...pipsOf(o.lvl, o.max)),
          o.lvl ? el('small', { class: 'have' }, 'tenho') : null, need ? el('small', { class: 'need' }, `faltam ${need}`) : null),
        el('div', { class: 'buy-row' }, peek ? price : el('button', { type: 'button', 'data-key': o.key, disabled: !can, onclick: o.buy }, label), undoBtn(key), sellBtn(key)),
      ), () => {
        const sell = peek ? 0 : sellValue(mine, r.round, key);
        return o.tip() + (peek && can ? '<p class="up">Você pode comprar isto na próxima loja.</p>' : '')
          // magia: a própria dica já mostra o nível atual → o próximo
          + (o.key.startsWith('spell') || o.blocked ? '' : previewHtml(o.lvl ? 'Se subir de nível' : 'Se comprar', diff(now, o.bought())))
          + (sell > 0 ? previewHtml('Se vender', diff(now, o.sold()), `<small>Volta ${sell} de ouro.</small>`) : '');
      });
    };
    const spellOffer = (s: SpellId) => {
      const lvl = mine.spells[s];
      const price = priceOf(s, lvl);
      const full = lvl === 0 && spellCount(mine.spells) >= MAX_SPELLS;
      return offer({ key: 'spell-' + s, ico: ICON[s], name: spellName(s), hotkey: labelOf(s), use: SPELL_USE[s], lvl, max: MAX_SPELL_LEVEL, price,
        blocked: price === null ? 'Máximo' : full ? `Limite de ${MAX_SPELLS} magias` : null, buy: () => act.buy(s), tip: () => spellTip(s, lvl),
        bought: () => sheet({ ...mine.spells, [s]: lvl + 1 }, mine.items), sold: () => sheet({ ...mine.spells, [s]: 0 }, mine.items) });
    };
    const itemOffer = (i: ItemId) => {
      const lvl = mine.items[i];
      const price = itemPrice(mine.items, i);
      return offer({ key: 'item-' + i, ico: ITEM_ICON[i], name: itemName(i), hotkey: isActive(i) ? labelOf(i) : null, use: itemText(i), lvl, max: ITEMS[i].levels.length, price,
        blocked: lvl >= ITEMS[i].levels.length ? 'Máximo' : price === null ? 'Sem espaço' : null, buy: () => act.buyItem(i), tip: () => itemTip(i, lvl),
        bought: () => sheet(mine.spells, { ...mine.items, [i]: lvl + 1 }), sold: () => sheet(mine.spells, { ...mine.items, [i]: 0 }) });
    };
    const group = (title: string, hint: string, cards: HTMLElement[]) =>
      el('section', { class: 'shop-group ' + groupClass(title) }, el('div', { class: 'shop-head' }, el('h3', {}, title), el('small', {}, hint)), el('div', { class: 'shop-grid' }, ...cards));
    const itemCount = `${ITEM_IDS.filter((i) => mine.items[i] > 0).length} de ${MAX_ITEMS} itens`;
    const grid = SPELL_GROUPS.map(([title, hint, ids]) => group(title, hint, ids.map(spellOffer)));
    // itens numa coluna à esquerda, com cor própria (Fernando, 19/10: distintos das magias e loja mais horizontal)
    const items = () => el('div', { class: 'shop-items' },
      group('Itens passivos', itemCount, ITEM_IDS.filter((i): boolean => !isActive(i)).map(itemOffer)),
      group('Itens ativos', 'cada um com a sua tecla', ACTIVE_ITEMS.map(itemOffer)));
    if (look) return el('div', { class: 'card shop' }, items(), el('div', { class: 'shop-main' },
      el('div', { class: 'shop-head' }, el('h2', { class: 'title' }, deadShop ? 'Loja · você caiu: monte a build' : 'Loja · só para ver'), el('small', {}, `${spellCount(mine.spells)} de ${MAX_SPELLS} magias · ${deadShop ? 'compre e venda já; o ouro da rodada entra quando ela acabar' : 'a compra abre entre as rodadas'}`),
        el('button', { type: 'button', class: 'icon peek-close', title: `Fechar (${uiLabel('shop')} ou Esc)`, 'aria-label': 'Fechar a loja', onclick: () => togglePeek(false) }, '✕')),
      ...grid),
      el('aside', { class: 'shop-side' }, el('span', { class: 'gold big' }, gold(mine.gold)), sheetBox()));
    readyBtn = el('button', { type: 'button', class: 'primary big', 'data-key': 'ready', disabled: mine.ready, onclick: () => {
      if (r.round === 0) seeFirst();
      act.ready();
    } }, readyText(mine.ready));
    // duas colunas: compras à esquerda; ouro, Pronto, placar e personagem à direita (pedido do Fernando: loja mais larga)
    return el('div', { class: 'card shop' }, items(), el('div', { class: 'shop-main' },
      el('div', { class: 'shop-head' }, el('h2', { class: 'title' }, r.round === 0 ? 'Loja' : `Loja · depois da rodada ${r.round}`), el('small', {}, `${spellCount(mine.spells)} de ${MAX_SPELLS} magias`)),
      r.round === 0 && !firstSeen ? firstCard() : null,
      ...grid,
      ),
      el('aside', { class: 'shop-side' },
        el('span', { class: 'gold big' }, gold(mine.gold)),
        readyBtn,
        el('button', { type: 'button', 'data-key': 'placar', onclick: () => pinTab(true) }, icon(UI_ICON.board), ' Placar'),
        sheetBox(),
        goldInfo(mine, r.opts, goldOpen, (open) => (goldOpen = open)),
        nextModePicker(r),
        board(r, me, act.kick),
        picker(r),
      ),
    );
  }

  // loja: modo da próxima rodada à vista; clicar abre a votação (sozinho com bots passa na hora)
  function nextModePicker(r: PublicRoom) {
    const next = r.pendingMode ?? r.mode;
    return el('div', { class: 'mode' },
      el('small', { class: 'opts-line' }, optsLine({ ...r.opts, ...r.pendingOpts }, next)),
      el('small', { class: 'muted' }, 'Modo da próxima rodada'),
      choice('Modo da próxima rodada', MODES.map((k): [Mode, string] => [k, MODE_NAME[k]]), next, (k) => k !== next && act.vote('mode', k), (k) => !!r.vote && k !== next),
      next === 'teams' ? el('button', { type: 'button', disabled: !!r.vote, onclick: () => act.vote('shuffle') }, `Times ${SHUFFLE_NAME(r.pendingShuffle ?? r.teamShuffle)} · trocar`) : null,
      r.pendingMode ? el('small', {}, `Próxima rodada: ${MODE_NAME[r.pendingMode]} (os pontos zeram)`) : null,
      r.vote ? el('small', { class: 'muted' }, 'Votação aberta no topo da tela.') : null);
  }

  function drawVote(r: PublicRoom, prev: PublicRoom | null) {
    const v = r.vote;
    const human = !!mine && !mine.bot;
    voteWrap.hidden = !human || !VOTE_PHASES.includes(r.phase);
    const close = (f: () => void) => () => {
      toggle(votePanel, voteBtn, false);
      f();
    };
    const next = r.pendingMode ?? r.mode;
    const vote = (kind: Vote['kind'], target?: string) => close(() => act.vote(kind, target));
    const btn = (label: string, kind: Vote['kind'], target?: string) => el('button', { type: 'button', disabled: !!v, onclick: vote(kind, target) }, label);
    // grupos recolhíveis para a lista não ficar enorme
    // a sala atualiza a cada segundo: o grupo aberto e a rolagem continuam como estavam
    const opened = new Set([...votePanel.querySelectorAll<HTMLDetailsElement>('details[open] > summary')].map((x) => x.textContent));
    const scroll = votePanel.scrollTop;
    const group = (title: string, ...items: Child[]) => el('details', { class: 'vote-group', open: opened.has(title) }, el('summary', {}, title), ...items);
    const nextOpts = { ...r.opts, ...r.pendingOpts };
    const bots = r.players.filter((p) => p.bot).length + r.botDelta;
    queueMicrotask(() => (votePanel.scrollTop = scroll));
    votePanel.replaceChildren(el('b', {}, 'Votação'),
      v ? el('small', { class: 'muted' }, 'Já tem uma votação aberta.') : '',
      group('Partida',
        btn('Reiniciar a partida', 'restart'),
        btn('Encerrar agora (vence quem tem mais pontos)', 'end'),
        r.phase === 'shop' ? btn('Pular a loja', 'skipShop') : '',
        ...MODES.filter((k) => k !== next).map((k) => btn(`Trocar para ${MODE_NAME[k]}`, 'mode', k)),
        next === 'teams' ? btn(`Times ${SHUFFLE_NAME(!(r.pendingShuffle ?? r.teamShuffle))}`, 'shuffle') : ''),
      group('Regras',
        el('small', { class: 'muted' }, optsLine(nextOpts, next)),
        ...OPT_KEYS.map((k) => el('div', { class: 'opt-row' }, optLabel(k, next),
          ...(OPTION_CHOICES[k] as readonly MatchOpts[OptKey][]).filter((val) => val !== nextOpts[k]).map((val) => btn(optText(k, val, next), 'opt', `${k}:${val}`))))),
      group('Jogadores',
        r.players.length + Math.max(0, r.botDelta) < MAX_PLAYERS ? btn('Pôr um bot', 'addBot') : '',
        bots > 0 ? btn('Tirar um bot', 'removeBot') : '',
        ...r.players.filter((p) => !p.bot && p.id !== me).map((p) => btn(`Expulsar ${p.name}`, 'kick', p.id))),
      el('small', { class: 'muted' }, 'Passa com mais da metade dos jogadores. Modo, regras e bots valem na próxima rodada; o modo novo zera os pontos, o ouro fica.'));
    // fim da votação: aprovada se o que ela muda mudou
    const was = prev?.vote;
    const passed = (k: Vote['kind']) => k === 'mode' ? r.pendingMode !== prev!.pendingMode : k === 'shuffle' ? r.pendingShuffle !== prev!.pendingShuffle
      : k === 'opt' ? JSON.stringify(r.pendingOpts) !== JSON.stringify(prev!.pendingOpts) : k === 'restart' ? r.round === 0 : k === 'end' ? r.phase === 'end'
        : k === 'addBot' || k === 'removeBot' ? r.botDelta !== prev!.botDelta : k === 'skipShop' ? r.phase !== 'shop' || r.phaseLeft < 1500 : !r.players.some((p) => p.id === was!.target);
    if (was && !v) toast(passed(was.kind) ? 'Votação aprovada.' : 'Votação recusada.');
    voteBar.hidden = !v;
    if (!v) return;
    voteEndsAt = performance.now() + v.left;
    const name = (id: string) => r.players.find((p) => p.id === id)?.name ?? '?';
    const can = human && !v.yes.includes(me) && !v.no.includes(me);
    voteBar.replaceChildren(
      el('span', {}, `${name(v.by)} quer ${voteText(v, r.pendingMode ?? r.mode, name)} · SIM ${v.yes.length} / precisa ${v.need}`),
      can ? el('button', { type: 'button', class: 'primary', onclick: () => act.ballot(true) }, 'Sim') : '',
      can ? el('button', { type: 'button', onclick: () => act.ballot(false) }, 'Não') : '',
      voteLeft,
    );
  }

  // recarga terminou na partida: o botão pisca (style.css .ready-flash) e toca o "plim"
  function cooled(b: HTMLElement, left: number) {
    const was = b.classList.contains('cooling');
    b.classList.toggle('cooling', left > 0.05);
    if (!was || left > 0.05 || room?.phase !== 'playing' || b.hidden) return;
    b.classList.remove('ready-flash');
    void b.offsetWidth; // reinicia a animação
    b.classList.add('ready-flash');
    act.spellReady();
  }

  let centerPhase = '';
  function drawCenter() {
    if (!room) return;
    const r = room;
    // redesenhar a loja não pode tirar o foco de quem usa o teclado
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.key;
    hideTip(center);
    // "Voltar à sala" mostra a sala de espera: mesma largura dela, não a do fim
    center.classList.toggle('wide', r.phase === 'shop' || r.phase === 'lobby' || r.phase === 'end'); // a sala também, em colunas
    // o painel entra animado só quando a fase muda (a loja redesenha a cada compra e não pode ficar "pulando")
    const entering = r.phase !== centerPhase;
    center.classList.toggle('enter', entering);
    centerPhase = r.phase;
    center.replaceChildren(r.phase === 'lobby' || (r.phase === 'end' && setup) ? lobbyPanel(r) : r.phase === 'end' ? endPanel(r) : r.phase === 'shop' ? shopPanel(r) : '');
    const shopOpen = r.phase === 'shop';
    if (shopOpen !== center.classList.contains('shop-open')) {
      center.classList.toggle('shop-open', shopOpen);
      const size = shopOpen ? store.json<[string, string]>(SHOP_SIZE) : null;
      center.style.width = size?.[0] ?? '';
      center.style.height = size?.[1] ?? '';
    }
    // painel novo começa do topo (o fim da partida herdava a rolagem da loja e escondia o título e o pódio)
    if (entering) center.scrollTop = 0;
    if (!online) center.querySelectorAll('button').forEach((b) => b.setAttribute('disabled', ''));
    if (focused) (center.querySelector(`[data-key="${focused}"]`) as HTMLElement | null)?.focus();
  }

  // lista do canto: pontos da partida e, ao vivo, abates e dano da rodada (somados no cliente a partir dos acertos)
  let live: Record<string, { dmg: number; kills: number; taken?: number }> = {};
  function drawPlayers() {
    if (!room) return;
    const head = el('li', { class: 'head' }, el('span', {}), el('span', {}), el('small', { title: 'Abates na rodada' }, icon(UI_ICON.kills)), el('small', { title: 'Dano na rodada' }, icon(UI_ICON.dmg)), el('small', { title: room.mode === 'deathmatch' ? 'Pontos' : 'Vitórias' }, icon(UI_ICON.wins)));
    // modo Times: agrupada por time, com uma faixa da cor do time à esquerda
    const r = room;
    players.replaceChildren(head, ...[...r.players].sort((a, b) => byTeam(r, a, b)).map((p) =>
      el('li', { class: p.id === me ? 'me' : '', style: r.mode === 'teams' && p.team !== null ? `box-shadow:inset 3px 0 0 ${TEAM_COLORS[p.team]}` : '' }, dot(p.color), el('span', {}, nameOf(p, me), p.bot ? el('small', { class: 'bot-tag' }, BOT_LEVEL[r.opts.difficulty]) : null), el('span', { class: 'live' }, String(live[p.id]?.kills ?? 0)), el('span', { class: 'live' }, String(Math.round(live[p.id]?.dmg ?? 0))), el('b', {}, String(p.score))),
    ));
  }

  return {
    // abate no feed: by null = caiu sozinho na lava; destacado quando envolve você
    kill(by: string | null, id: string, src: string) {
      const who = (pid: string) => {
        const p = room?.players.find((q) => q.id === pid);
        return el('b', { style: `color:${COLORS[p?.color ?? 0]}` }, pid === me ? 'Você' : (p?.name ?? '?'));
      };
      const killer = by && by !== id ? by : null;
      const li = el('li', { class: killer === me || id === me ? 'me' : '' }, killer ? who(killer) : null,
        el('span', { class: 'feed-ico', title: killer ? srcName(src) : 'lava' }, srcIcon(killer ? src : 'lava')), who(id), killer ? null : el('small', {}, 'caiu na lava'));
      feed.append(li);
      while (feed.children.length > 5) feed.firstElementChild!.remove();
      setTimeout(() => li.remove(), 5000);
    },
    // morto nas Rodadas e nos Times: a loja passa a comprar e vender; no PC abre sozinha uma vez, como gaveta à direita (a partida fica à vista)
    deadShopping(on: boolean) {
      if (on === deadShop) return;
      deadShop = on;
      if (on) peekPanel.classList.add('drawer'); // sai ao fechar a loja (togglePeek): no fim da rodada a gaveta aberta não pula para o meio
      shopNudge.hidden = !on;
      // abre 1,5 s depois da queda: antes passa a faixa "Você caiu"
      if (on && DRAWER.matches) setTimeout(() => deadShop && peekPanel.hidden && togglePeek(true), 1500);
      drawPeek();
    },
    watching(name: string | null) {
      watchBadge.hidden = !name;
      if (watchingNow !== !!name) {
        watchingNow = !!name;
        syncBar();
      }
      if (name && watchName.textContent !== name) watchName.textContent = name;
    },
    // ready: dá para rever a queda; text: o replay está passando (quem derrubou e com o quê)
    replay(ready: boolean, text: string | null) {
      replayBar.hidden = !ready && !text;
      replayText.hidden = !text;
      if (text && replayText.textContent !== text) replayText.textContent = text;
      const k = uiLabel('replay');
      const label = text ? (TOUCH ? 'Sair' : 'Sair (Esc)') : TOUCH || k === '—' ? 'Rever a queda' : `Rever a queda (${k})`;
      if (replayBtn.textContent !== label) replayBtn.textContent = label;
    },
    // again: botão Repetir no fim de um desafio; quit: botão Sair do desafio (durante e depois dele)
    coach(text: string | null, again?: () => void, quit?: () => void) {
      // primeira loja: o cartão "Primeira vez?" já diz o que fazer; a dica do treino espera ele sair
      coach.hidden = !text || !!center.querySelector('.first-tip');
      if (text && coachText.textContent !== text) coachText.textContent = text;
      coachAgain.hidden = !again;
      coachAgain.onclick = again ?? null;
      coachQuit.hidden = !quit;
      coachQuit.onclick = quit ?? null;
    },
    // fim da partida direto na sala de espera (Sair do desafio)
    toRoom() {
      if (room) toRoom(room);
    },
    danger(low: boolean, lava: boolean) {
      danger.classList.toggle('low', low);
      danger.classList.toggle('lava', lava);
      document.body.classList.toggle('in-lava', lava);
    },
    // seta na borda da tela apontando para quem bateu (ângulo em radianos, 0 = direita, cresce para baixo)
    hitFrom(angle: number) {
      const a = el('div', { class: 'hit-arrow', 'aria-hidden': 'true', style: `left:calc(50% + ${(Math.cos(angle) * 44).toFixed(1)}vw);top:calc(50% + ${(Math.sin(angle) * 40).toFixed(1)}vh);--a:${angle.toFixed(3)}rad` });
      danger.after(a);
      setTimeout(() => a.remove(), 900);
    },
    live(stats: Record<string, { dmg: number; kills: number; taken?: number }>) {
      live = stats;
      drawPlayers();
      drawSheet();
    },
    update(r: PublicRoom, you: string, isOnline: boolean) {
      // a loja abre mostrando a rodada que acabou; o fim mostra a partida inteira
      if (room && room.phase !== r.phase) {
        scope = r.phase === 'end' ? 'match' : 'round';
        setup = false;
      }
      const prev = room;
      room = r;
      me = you;
      phaseEndsAt = performance.now() + r.phaseLeft;
      setOnline(isOnline);
      // loja só para ver: botão só durante a rodada; fecha sozinha quando a loja de verdade abre (ou a partida acaba)
      peekBtn.hidden = !PEEK_PHASES.includes(r.phase);
      if (!peekPanel.hidden && !PEEK_PHASES.includes(r.phase)) togglePeek(false);
      else drawPeek();
      roundEl.textContent = [
        // sala de espera e fim da partida: a rodada já não diz nada
        r.round > 0 && r.phase !== 'lobby' && r.phase !== 'end' ? (r.mode === 'deathmatch' ? `Deathmatch · rodada ${r.round} · ${r.goal} abates para vencer` : `${r.mode === 'teams' ? 'Times · ' : ''}Rodada ${r.round} · vence quem fizer ${r.goal}`) : '',
        r.pendingMode && r.phase !== 'end' ? `Próxima rodada: ${MODE_NAME[r.pendingMode]}` : '',
        r.pendingShuffle !== null && r.phase !== 'end' ? `Próxima rodada: times ${SHUFFLE_NAME(r.pendingShuffle)}` : '',
      ].filter(Boolean).join(' · ');
      drawPlayers();
      mine = r.players.find((p) => p.id === you);
      for (const i of ACTIVE_ITEMS) itemButtons.get(i)!.b.hidden = !mine?.items[i];
      // barra da partida: só magias e itens equipados; passivos viram selos pequenos acima dela
      // a sala manda atualização a cada segundo: recriar os selos sem mudança fecharia a dica aberta neles
      const owned = ITEM_IDS.filter((i): boolean => !isActive(i) && (mine?.items[i] ?? 0) > 0);
      const sig = owned.map((i) => i + mine!.items[i]).join();
      if (sig !== passives.dataset.sig) {
        passives.dataset.sig = sig;
        passives.replaceChildren(...owned.map((i) =>
          withTip(el('span', { class: 'passive', tabindex: 0, 'aria-label': itemName(i) }, icon(ITEM_ICON[i]), el('small', {}, String(mine!.items[i]))), () => itemTip(i, mine?.items[i] ?? 0)),
        ));
        hideTip(passives);
      }
      setSlots(SPELL_IDS.filter((s) => (mine?.spells[s] ?? 0) > 0));
      for (const s of SPELL_IDS) {
        const { b, pips } = buttons.get(s)!;
        const lvl = mine?.spells[s] ?? 0;
        b.hidden = lvl === 0;
        pips.replaceChildren(...pipsOf(lvl, MAX_SPELL_LEVEL));
      }
      barOff = r.phase === 'lobby' || r.phase === 'end' || r.phase === 'shop' || !mine;
      syncBar();
      goldNow.replaceChildren(gold(mine?.gold ?? 0));
      const tabPhase = TAB_PHASES.includes(r.phase);
      tabBtn.hidden = !tabPhase;
      if (!tabOverlay.hidden) showTab(tabPhase);
      drawVote(r, prev);
      drawCenter();
      sheetBtn.hidden = r.phase === 'lobby' || r.phase === 'end' || !mine;
      if (sheetBtn.hidden) sheetPanel.hidden = true;
      drawSheet();
    },
    setOnline(on: boolean) {
      const changed = on !== online;
      setOnline(on);
      if (changed) drawCenter();
    },
    // a cada quadro: recargas, magia escolhida e o relógio da fase
    // hp: minha vida e o máximo, só jogando e vivo (null esconde a barra grande)
    frame(cd: number[], icd: number[], armed: string | null, shrinkIn: number | null, respawnIn: number, status = 0, rttMs: number | null = null, hp: { now: number; max: number } | null = null) {
      if (status !== myStatus) {
        myStatus = status;
        drawSheet();
      }
      vitals.hidden = !hp;
      const hpLabel = hp ? `${Math.max(0, Math.ceil(hp.now))}/${hp.max}` : '';
      if (hp && hpText.textContent !== hpLabel) {
        hpText.textContent = hpLabel;
        hpBar.setAttribute('aria-label', `Vida ${hpLabel}`);
        hpFill.style.width = `${Math.max(0, Math.min(100, (hp.now / hp.max) * 100))}%`;
      }
      // recarga de cada botão (itens ativos e magias): número, varredura circular (--cd: fração que falta) e a marca da escolhida
      const tick = (a: string, { b, cd: c }: { b: HTMLElement; cd: HTMLElement }, left = 0) => {
        c.textContent = left > 0.05 ? left.toFixed(left < 1 ? 1 : 0) : '';
        if (left > (cdLeft.get(a) ?? 0) + 0.05) cdTotal.set(a, left);
        cdLeft.set(a, left);
        const frac = left > 0.05 ? Math.min(1, left / (cdTotal.get(a) ?? left)).toFixed(3) : '0';
        if (b.style.getPropertyValue('--cd') !== frac) b.style.setProperty('--cd', frac);
        cooled(b, left);
        b.classList.toggle('armed', armed === a);
      };
      ACTIVE_ITEMS.forEach((i, k) => tick(i, itemButtons.get(i)!, icd[k]));
      SPELL_IDS.forEach((s, i) => tick(s, buttons.get(s)!, cd[i]));
      if (!room) return;
      // ping: atualiza 2 vezes por segundo; verde até 80 ms, dourado até 150, vermelho acima
      if (performance.now() - pingAt > 500) {
        pingAt = performance.now();
        ping.hidden = rttMs === null || !online || !TAB_PHASES.includes(room.phase);
        if (rttMs !== null) {
          ping.textContent = `${Math.round(rttMs)} ms`;
          ping.dataset.q = rttMs < 80 ? 'good' : rttMs < 150 ? 'ok' : 'bad';
        }
      }
      const left = Math.max(0, (phaseEndsAt - performance.now()) / 1000);
      timer.textContent =
        room.phase === 'shop' ? `Rodada começa em ${Math.ceil(left)} s`
        : room.phase === 'countdown' ? String(Math.max(1, Math.ceil(left)))
        : room.phase === 'playing' && room.mode === 'deathmatch' ? `Rodada termina em ${Math.ceil(left)} s`
        : room.phase === 'playing' && shrinkIn !== null && shrinkIn > 0 ? `Arena encolhe em ${Math.ceil(shrinkIn)} s`
        : '';
      // contagem dentro do Pronto, sem redesenhar a loja
      const ready = room.phase === 'shop' && readyBtn?.isConnected ? readyText(!!mine?.ready) : null;
      if (ready !== null && readyBtn!.textContent !== ready) readyBtn!.textContent = ready;
      // últimos 5 s da loja: Pronto e relógio pulsam em vermelho
      const hurry = room.phase === 'shop' && left <= 5;
      if (readyBtn?.isConnected) readyBtn.classList.toggle('urgent', hurry && !mine?.ready);
      voteLeft.textContent = room.vote ? `${Math.max(0, Math.ceil((voteEndsAt - performance.now()) / 1000))} s` : '';
      respawn.textContent = room.phase === 'playing' && respawnIn > 0 ? `Você volta em ${Math.ceil(respawnIn)} s` : '';
      // nos últimos 3 s o aviso de encolher pulsa
      timer.className = 'timer ' + room.phase + ((room.phase === 'playing' && shrinkIn !== null && shrinkIn > 0 && shrinkIn <= 3) || hurry ? ' soon' : '');
      if (armed !== shownArmed) {
        shownArmed = armed;
        armedHint.hidden = !armed;
        if (armed) armedText.textContent = `${TOUCH ? 'Toque' : 'Clique'} no chão para lançar ${actionName(armed as Action)}`;
      }
    },
  };
}
