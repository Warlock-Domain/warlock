// Telas em DOM: apelido, lista de salas, sala de espera, loja, barra de magias, placar e avisos.
import { ASSIST_GOLD, BOUNTY, CHEST, HP_MAX, KNOCK_HP_SCALE, KILL_GOLD, STREAK, LEADER_WIN_GOLD, RECOVERY, MAX_PLAYERS, ROUND_GOLD, TOP_DMG_GOLD, WIN_GOLD } from '../shared/constants.ts';
import { CHARACTERS, type CharacterId } from '../shared/characters.ts';
import { DEFAULT_OPTS, DM_GOALS, MODES, OPTION_CHOICES, VOTE_PHASES, sellValue, type MatchOpts, type Mode, type Vote } from '../shared/match.ts';
import type { PublicPlayer, PublicRoom } from '../shared/protocol.ts';
import { ACTIVE_ITEMS, ITEMS, ITEM_IDS, MAX_ITEMS, itemPrice, type ItemId } from '../shared/items.ts';
import { MAX_SPELLS, MAX_SPELL_LEVEL, SPELLS, SPELL_IDS, priceOf, spellCount, type SpellId } from '../shared/spells.ts';
import { ACTIONS, RESERVED, SHEET_KEY, isPadMode, isSlotMode, keyLabel, keyOf, labelOf, onKeysChange, resetKeys, setKey, setSlotMode, setSlots, type Action } from './keys.ts';
import { hideTip, itemTip, spellTip, withTip } from './tips.ts';
import { isRumbleOn, setRumble } from './gamepad.ts';
import { COLORS, TEAM_COLORS } from './scene.ts';
import { RULES, RULES_SHORT, SPELL_GROUPS, SPELL_USE } from './rules-text.ts';
import { ICON, ITEM_ICON, SOURCE_ICON, STATUS_ICONS } from './icons.ts';
import { BASE, diff, sheet, type Change, type SheetRow } from './sheet.ts';
import { TAUNTS } from '../shared/taunts.ts';

type Child = Node | string | null | undefined | false;
export function el(tag: string, props: Record<string, any> = {}, ...children: Child[]): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'style') e.setAttribute('style', v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, String(v));
  }
  for (const c of children) if (c) e.append(c);
  return e;
}

const TITLE = 'Warlock';
// tela de toque sem mouse: os textos de ajuda falam de tocar, não de clicar
const TOUCH = matchMedia('(hover: none) and (pointer: coarse)').matches;

export function askName(root: HTMLElement, current: string): Promise<string> {
  return new Promise((resolve) => {
    const input = el('input', { id: 'name', maxlength: 20, placeholder: 'Seu apelido', value: current, autocomplete: 'nickname' }) as HTMLInputElement;
    const form = el(
      'form',
      { class: 'panel', onsubmit: (e: Event) => {
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

export type RoomInfo = { id: string; players: number; phase: string; mode?: string; round?: number; bots?: number };
// o que a sala está fazendo, em palavras de quem vai entrar
const roomPhase = (r: RoomInfo) => r.phase === 'lobby' ? 'esperando começar' : r.phase === 'end' ? 'partida acabou, dá para começar outra'
  : `jogando${r.round ? ` a rodada ${r.round}` : ''} · você entra na próxima rodada`;

export function renderLobby(root: HTMLElement, name: string, rooms: RoomInfo[] | null, offline: boolean, onCreate: () => void, onRename: () => void) {
  const retry = el('button', { type: 'button', onclick: () => location.reload() }, 'Tentar de novo');
  const list =
    rooms === null && offline
      ? el('div', { class: 'lobby-error', role: 'alert' }, el('p', {}, 'Não deu para carregar as salas. Tentando de novo sozinho…'), retry)
      : rooms === null
      ? el('p', { class: 'muted' }, 'Carregando salas…')
      : rooms.length === 0
        ? el('p', { class: 'muted' }, 'Nenhuma sala aberta. Crie uma e mande o link no grupo.')
        // um cartão por sala: código e modo, quem está lá, o que está acontecendo e o Entrar
        : el('ul', { class: 'rooms' }, ...rooms.map((r) =>
            el('li', { class: 'room-card' + (r.phase === 'lobby' ? ' open' : '') },
              el('div', { class: 'room-info' },
                el('div', { class: 'room-top' }, el('span', { class: 'code' }, r.id), r.mode && r.mode in MODE_NAME ? el('span', { class: 'room-mode' }, MODE_NAME[r.mode as Mode]) : null),
                el('span', {}, r.players ? `👤 ${r.players} ${r.players === 1 ? 'pessoa' : 'pessoas'}${r.bots ? ` + 🤖 ${r.bots} ${r.bots === 1 ? 'bot' : 'bots'}` : ''}` : 'Vazia (fecha sozinha daqui a pouco)'),
                el('small', {}, roomPhase(r))),
              el('a', { class: 'button', href: '#' + r.id, 'aria-label': `Entrar na sala ${r.id}` }, 'Entrar'),
            ),
          ));
  root.replaceChildren(
    el('div', { class: 'lobby' },
      el('header', { class: 'hero' },
        el('div', {}, el('h1', {}, TITLE), el('p', {}, 'Empurre os amigos para a lava com bola de fogo, raio e companhia. O último de pé vence a rodada.')),
        el('button', { type: 'button', class: 'link', onclick: onRename }, `${name} · trocar`),
      ),
      el('div', { class: 'lobby-actions' },
        el('button', { type: 'button', class: 'primary big', onclick: onCreate }, 'Criar sala'),
        el('button', { type: 'button', onclick: showRules }, 'Como jogar'),
      ),
      el('section', {}, el('h2', {}, 'Salas abertas'), rooms !== null && offline ? el('p', { class: 'lobby-error', role: 'status' }, 'Sem conexão: a lista pode estar velha. Tentando de novo…') : null, list),
    ),
  );
}

export function showRules() {
  const overlay = el('div', { class: 'overlay rules-overlay', onclick: (e: Event) => e.target === overlay && overlay.remove() },
    el('div', { class: 'panel rules' },
      el('h1', {}, 'Como jogar'),
      ...RULES.flatMap(([title, items]) => [el('section', {}, el('h2', {}, title), el('ul', {}, ...items.map((i) => el('li', {}, i)))),
        // depois dos controles do PC: as teclas de agora (trocadas ou não) e o que cada magia faz, por grupo
        title === 'Controles no PC' ? el('section', {}, el('h2', {}, isSlotMode() ? 'Suas teclas (Q W E R D F pela ordem da barra)' : 'Suas teclas'),
          el('div', { class: 'keys-grid' }, ...ACTIONS.map((a) => el('span', {}, el('span', { class: 'key' }, keyLabel(keyOf(a))), ' ', a in SPELLS ? ICON[a as SpellId] : ITEM_ICON[a as ItemId], ' ', a in SPELLS ? SPELLS[a as SpellId].name : ITEMS[a as ItemId].name)))) : null,
        title === 'Loja' ? el('section', {}, el('h2', {}, 'Magias'), ...SPELL_GROUPS.map(([name, hint, ids]) => el('div', {}, el('h3', {}, name, ' ', el('small', {}, hint)),
          el('ul', {}, ...ids.map((s) => el('li', {}, ICON[s], ' ', el('b', {}, SPELLS[s].name), ' · ', RULES_SHORT[s])))))) : null,
        title === 'Loja' ? el('section', {}, el('h2', {}, 'Itens'), ...([['Passivos', false], ['Ativos (com tecla)', true]] as const).map(([name, active]) => el('div', {}, el('h3', {}, name),
          el('ul', {}, ...ITEM_IDS.filter((i) => !!ITEMS[i].key === active).map((i) => el('li', {}, ITEM_ICON[i], ' ', el('b', {}, ITEMS[i].name), ' · ', ITEMS[i].text)))))) : null]),
      el('button', { type: 'button', class: 'primary', onclick: () => overlay.remove() }, 'Entendi'),
    ),
  );
  document.body.append(overlay);
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
// tipo do aviso: muda a cor da borda e o ícone (style.css, #toast[data-kind])
export type ToastKind = 'info' | 'good' | 'bad' | 'gold';
export function toast(msg: string, kind: ToastKind = 'info') {
  let t = document.getElementById('toast');
  if (!t) document.body.append((t = el('div', { id: 'toast', role: 'status' })));
  t.textContent = msg;
  t.dataset.kind = kind;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t!.classList.remove('show'), 3500);
}

// 'win': faixa grande dourada com confete, para quem venceu a rodada ou a partida
export function banner(text: string, kind: '' | 'good' | 'bad' | 'win' = '') {
  document.querySelectorAll('.banner').forEach((b) => b.remove());
  const b = el('div', { class: `banner ${kind}`, role: 'status', 'aria-live': 'polite' }, text);
  if (kind === 'win') b.append(...Array.from({ length: 22 }, (_, i) => el('i', { class: 'confetti', style: `--x:${Math.round(Math.cos(i * 2.4) * (90 + (i % 5) * 40))}px;--y:${Math.round(-60 - (i % 7) * 22)}px;--r:${i * 47}deg;--d:${(i % 4) * 0.05}s` })));
  document.body.append(b);
  setTimeout(() => b.remove(), kind === 'win' ? 2600 : 1700);
}

export function screen(root: HTMLElement, title: string, text: string, button: string, onClick: () => void) {
  root.replaceChildren(el('div', { class: 'overlay' }, el('div', { class: 'panel' }, el('h1', {}, title), el('p', {}, text), el('button', { type: 'button', class: 'primary', onclick: onClick }, button))));
}

export type RoomActions = {
  start: (bots: number, mode: Mode, shuffle: boolean, opts: MatchOpts) => void;
  train: () => void; // partida de treino: 3 bots, modo Rodadas e dicas nas primeiras rodadas
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
};

const MODE_NAME: Record<Mode, string> = { rounds: 'Rodadas', deathmatch: 'Deathmatch', teams: 'Times' };
export const TEAM_NAMES = ['Azul', 'Vermelho'];
const SHUFFLE_NAME = (shuffle: boolean) => (shuffle ? 'sorteados a cada rodada' : 'fixos na partida');
// opções da partida: nome de cada uma e o texto de cada valor (a meta depende do modo)
type OptKey = keyof MatchOpts;
const OPT_KEYS = Object.keys(OPTION_CHOICES) as OptKey[];
const OPT_NAME: Record<OptKey, string> = { shop: 'Tempo de loja', pace: 'Contagem e fim de rodada', economy: 'Ouro ganho', startGold: 'Ouro inicial', goal: 'Vence com', runes: 'Runas', sudden: 'Morte súbita', chests: 'Baús de ouro' };
const n1 = (x: number) => x.toLocaleString('pt-BR');
function optText(k: OptKey, val: MatchOpts[OptKey], mode: Mode): string {
  if (k === 'shop') return (val as number) >= 120 ? '2 min' : `${val} s`;
  if (k === 'pace') return { short: 'Curto', normal: 'Normal', long: 'Longo' }[val as MatchOpts['pace']];
  if (k === 'economy') return { 0.6: 'Pouco ×0,6', 1: 'Normal', 1.6: 'Muito ×1,6', 2.5: 'Festa ×2,5' }[val as MatchOpts['economy']];
  if (k === 'goal') return mode === 'deathmatch' ? `${DM_GOALS[val as MatchOpts['goal']]} abates` : `${val} rodadas`;
  if (typeof val === 'boolean') return val ? 'Ligado' : 'Desligado';
  return String(val);
}
// resumo de uma linha (loja e votação): "Loja 30 s · Ouro ×1,6 · Vence com 5 rodadas · sem runas"
function optsLine(o: MatchOpts, mode: Mode): string {
  const off = (['runes', 'sudden', 'chests'] as const).filter((k) => !o[k]).map((k) => 'sem ' + OPT_NAME[k].toLowerCase());
  return [`Loja ${optText('shop', o.shop, mode)}`, `Ouro ×${n1(o.economy)}`, `Vence com ${optText('goal', o.goal, mode)}`, ...off].join(' · ');
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
const nameOf = (p: PublicPlayer, me: string) => p.name + (p.id === me ? ' (você)' : '') + (p.bot ? ' 🤖' : '');

// placar de estatísticas: ouro ganho, dano causado e precisão de cada magia de dano (acertos / lançamentos)
type Scope = 'round' | 'match' | 'room';
const SCOPES: [Scope, string][] = [['round', 'Rodada'], ['match', 'Partida'], ['room', 'Sala']];
const n0 = (x: number) => Math.round(x).toLocaleString('pt-BR');
// magias de utilidade: mostra quantas vezes usou (não têm "acerto"); as outras mostram precisão
const UTILITY = new Set(['teleport', 'shield', 'rush', 'pact', 'redirector', 'thrust', 'rockpillar', 'magnetize', 'alteration', 'warpzone']);
const srcIcon = (k: string) => (k === 'lava' ? SOURCE_ICON.lava : k in ICON ? ICON[k as SpellId] : k in ITEM_ICON ? ITEM_ICON[k as ItemId] : k.startsWith('choque') ? SOURCE_ICON.shock : k === 'pillar' ? SOURCE_ICON.pillar : SOURCE_ICON.unknown);
const srcName = (k: string) => (k === 'lava' ? 'lava' : k in SPELLS ? SPELLS[k as SpellId].name : k in ITEMS ? ITEMS[k as ItemId].name : k);

// placar (pedido do Fernando, 17/10; refeito em 18/10): abas Resumo e Magias, destaques com retrato e o melhor de cada coluna em dourado
type View = 'summary' | 'spells';
const VIEWS: [View, string][] = [['summary', 'Resumo'], ['spells', 'Magias']];
const portrait = (p: PublicPlayer) => el('img', { class: 'face', src: `/chars/${p.character}.webp`, alt: '', width: 32, height: 32, loading: 'lazy' });
const tabs = <T extends string>(label: string, list: [T, string][], on: T, set: (k: T) => void) =>
  el('div', { class: 'stats-tabs', role: 'tablist', 'aria-label': label }, ...list.map(([k, text]) =>
    el('button', { type: 'button', role: 'tab', 'aria-selected': String(k === on), class: k === on ? 'on' : '', onclick: () => set(k) }, text)));

function statsBoard(room: PublicRoom, me: string, scope: Scope, setScope: (s: Scope) => void, view: View, setView: (v: View) => void) {
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
  const pct = (n: number) => `${Math.round(n * 100)}%`;
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
  const who = (p: PublicPlayer) => el('span', { class: 'who' }, portrait(p), teamTag(room, p), el('span', { class: 'who-name' }, p.name, p.id === me ? el('small', {}, ' (você)') : null, p.bot ? el('small', {}, ' 🤖') : null));
  // destaques: quem foi o melhor em cada coisa (só com valor acima de zero)
  const leader = (c: (p: PublicPlayer) => number) => {
    const top = [...rows].sort((a, b) => c(b) - c(a))[0];
    return top && c(top) > 0 ? top : null;
  };
  const card = (ico: string, label: string, p: PublicPlayer | null, value: string) =>
    el('div', { class: 'stat-card' }, p ? portrait(p) : el('span', { class: 'stat-ico' }, ico), el('small', {}, ico, ' ', label), el('b', {}, p ? p.name : '–'), el('span', { class: 'stat-val' }, p ? value : ''));
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
    el('tbody', {}, ...rows.flatMap((p, i) => [teamRow(p, i, n), el('tr', { class: p.id === me ? 'me' : '' }, el('td', { class: 'player' }, who(p)), ...cells(p))]));
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
      card('💥', 'Mais dano', mostDmg, mostDmg ? n0(st(mostDmg).dmg) : ''),
      card('☠', 'Mais abates', mostKills, mostKills ? String(st(mostKills).kills) : ''),
      card('🎯', 'Mais preciso', sharp, sharp ? pct(aim(sharp)) : ''),
      card('🪙', 'Mais ouro', rich, rich ? n0(st(rich).gold) : ''),
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
  const row = (label: string, value: string, cls = '') => el('div', { class: 'gold-row ' + cls }, el('span', {}, label), el('b', {}, value));
  const g = (n: number) => Math.round(n * opts.economy);
  const rule = (n: number) => (n > 0 ? `+${g(n)}` : 'não dá ouro');
  // recolhido por padrão: o Pronto fica logo abaixo do ouro
  return el('details', { class: 'gold-info', open, ontoggle: (e: Event) => onToggle((e.target as HTMLDetailsElement).open) },
    el('summary', { class: 'gold-title' }, 'Como ganho ouro', opts.economy !== 1 ? el('small', {}, ` · ouro ×${opts.economy.toLocaleString('pt-BR')} nesta sala`) : null),
    row('Começo da partida', `+${g(opts.startGold)}`),
    row('Cada rodada que você jogou', `+${g(ROUND_GOLD)}`),
    row('Vencer a rodada', `+${g(WIN_GOLD)} (líder: +${g(LEADER_WIN_GOLD)})`),
    row('Abate', `+${g(KILL_GOLD)}`),
    row('Abater o líder', `até +${g(BOUNTY.max)} extra`),
    row('Quebra-combo (derrubar quem tem 3+ abates seguidos)', `+${g(STREAK.breakGold)}`),
    row('Atrás da média da partida', `até +${g(RECOVERY.max)} por rodada`),
    row('Mais dano na rodada', rule(TOP_DMG_GOLD), TOP_DMG_GOLD ? '' : 'muted'),
    row('Assistência (mais dano em quem morreu)', `+${g(ASSIST_GOLD)}`),
    row('Baú: em cima do ouro', opts.chests ? `+${g(1)} a cada ${CHEST.goldEvery} s` : 'desligado nesta sala', opts.chests ? '' : 'muted'),
    el('hr', {}),
    row('Ganho na última rodada', `🪙 ${p.stats.round.gold}`),
    row('Ganho na partida', `🪙 ${p.stats.match.gold}`),
    row('Ganho na sala (todas as partidas)', `🪙 ${p.stats.room.gold}`),
    el('small', { class: 'muted' }, 'Todo mundo ganha a rodada; vencer, abater e causar mais dano dão ouro extra. Desfazer (↩) devolve o ouro do que foi comprado nesta loja; Vender devolve 100% na loja em que comprou e 5% a menos por rodada com o item, até 75%.'),
  );
}

// botão de expulsar: só para bots e para quem caiu e não voltou
const kickBtn = (p: PublicPlayer, kick?: (id: string) => void) =>
  kick && (p.bot || !p.connected) ? el('button', { type: 'button', class: 'kick', title: `Expulsar ${p.name}`, 'aria-label': `Expulsar ${p.name}`, onclick: () => kick(p.id) }, '✕') : null;

// fim da partida: com times fixos vence o time; sorteados a cada rodada, todos que chegaram à meta juntos
export function winTitle(r: PublicRoom): string {
  if (r.winnerTeam !== null) return `🏆 Time ${TEAM_NAMES[r.winnerTeam]} venceu!`;
  const champs = r.mode === 'teams' ? r.players.filter((p) => p.score >= r.goal) : [];
  if (champs.length > 1) return `🏆 ${champs.map((p) => p.name).join(', ').replace(/, ([^,]*)$/, ' e $1')} venceram!`;
  return r.winner ? `🏆 ${r.players.find((p) => p.id === r.winner)?.name ?? '?'} venceu!` : 'Partida encerrada';
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
    el('span', { class: 'podium-block' }, ['🥇', '🥈', '🥉'][place - 1]));
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
  // volume: um botão abre dois controles, efeitos e música
  const slider = (kind: 'sfx' | 'music', label: string) => {
    const input = el('input', { type: 'range', id: 'vol-' + kind, min: 0, max: 100, step: 5, value: Math.round(act.volumes()[kind] * 100) }) as HTMLInputElement;
    const out = el('span', { class: 'vol-value' }, input.value + '%');
    input.addEventListener('input', () => {
      out.textContent = input.value + '%';
      act.setVolume(kind, Number(input.value) / 100);
      volBtn.textContent = act.volumes().sfx + act.volumes().music === 0 ? '🔇' : '🔊';
    });
    return el('label', { class: 'vol-row', for: 'vol-' + kind }, el('span', {}, label), input, out);
  };
  // efeitos visuais: Leve desliga tremor, hit-stop e partículas extras (PC fraco, quem enjoa); fica guardado no navegador
  const fxRow = el('div', { class: 'fx-row' }, el('small', {}, 'Efeitos visuais'), el('div', { class: 'stats-tabs', role: 'group', 'aria-label': 'Efeitos visuais' }));
  const drawFx = () => fxRow.lastElementChild!.replaceChildren(...([[false, 'Completo'], [true, 'Leve']] as const).map(([lite, label]) =>
    el('button', { type: 'button', 'aria-pressed': String(act.fxLite() === lite), class: act.fxLite() === lite ? 'on' : '', onclick: () => {
      act.setFxLite(lite);
      drawFx();
    } }, label)));
  drawFx();
  const volPanel = el('div', { class: 'vol-panel', hidden: true }, slider('sfx', 'Efeitos'), slider('music', 'Música'), fxRow);
  // teclas: clique na tecla de uma ação e aperte a nova
  const ACTION_NAME = (a: Action) => (a in SPELLS ? SPELLS[a as SpellId].name : ITEMS[a as ItemId].name);
  const ACTION_ICON = (a: Action) => (a in SPELLS ? ICON[a as SpellId] : ITEM_ICON[a as ItemId]);
  let waiting: Action | null = null;
  const keysList = el('div', { class: 'keys-list' });
  function drawKeys() {
    keysList.replaceChildren(...ACTIONS.map((a) => el('div', { class: 'keys-row' },
      el('span', {}, ACTION_ICON(a), ' ', ACTION_NAME(a)),
      el('button', { type: 'button', class: 'keycap' + (waiting === a ? ' wait' : ''), onclick: () => {
        waiting = waiting === a ? null : a;
        drawKeys();
      } }, waiting === a ? 'aperte…' : keyLabel(keyOf(a))))));
  }
  addEventListener('keydown', (e) => {
    if (!waiting) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code !== 'Escape') {
      if (RESERVED.has(e.code)) return toast('Essa tecla já tem outra função (S para, Espaço centraliza, Tab mostra o placar, Y abre as provocações, a tecla à esquerda do 1 abre a ficha).');
      setKey(waiting, e.code);
    }
    waiting = null;
    drawKeys();
  }, true);
  const slotToggle = el('input', { type: 'checkbox', id: 'slot-keys', checked: isSlotMode(), onchange: () => {
    setSlotMode(slotToggle.checked);
    drawKeys();
  } }) as HTMLInputElement;
  const keysPanel = el('div', { class: 'vol-panel keys-panel', hidden: true }, el('b', {}, 'Teclas'),
    el('label', { class: 'slot-row', for: 'slot-keys' }, slotToggle, el('span', {}, 'Q W E R D F pela ordem da barra (como no Dota)')),
    el('label', { class: 'slot-row', for: 'pad-rumble' }, el('input', { type: 'checkbox', id: 'pad-rumble', checked: isRumbleOn(), onchange: (e: Event) => setRumble((e.target as HTMLInputElement).checked) }), el('span', {}, 'Vibração do controle (golpe forte e morte)')), keysList,
    el('button', { type: 'button', onclick: () => resetKeys() }, 'Voltar ao padrão'));
  const keysBtn = el('button', { type: 'button', class: 'icon', title: 'Trocar teclas', 'aria-label': 'Trocar teclas', onclick: () => {
    keysPanel.hidden = !keysPanel.hidden;
    if (!keysPanel.hidden) drawKeys();
  } }, '⌨️');
  onKeysChange(() => {
    drawKeys();
    bar.querySelectorAll<HTMLElement>('[data-action]').forEach((k) => (k.textContent = labelOf(k.dataset.action as Action)));
    drawCenter();
  });
  const volBtn = el('button', { type: 'button', class: 'icon', title: 'Volume', 'aria-label': 'Volume', 'aria-expanded': 'false', onclick: () => {
    volPanel.hidden = !volPanel.hidden;
    volBtn.setAttribute('aria-expanded', String(!volPanel.hidden));
  } }, act.volumes().sfx + act.volumes().music === 0 ? '🔇' : '🔊');
  // votação na partida: o botão abre as opções; a faixa no topo mostra a votação aberta para todos
  const votePanel = el('div', { class: 'vol-panel', hidden: true });
  const voteBtn = el('button', { type: 'button', title: 'Trocar o modo ou expulsar alguém', 'aria-expanded': 'false', onclick: () => {
    votePanel.hidden = !votePanel.hidden;
    voteBtn.setAttribute('aria-expanded', String(!votePanel.hidden));
  } }, 'Votar');
  const voteWrap = el('div', { class: 'vol' }, voteBtn, votePanel);
  // provocações (taunts): Y abre a lista e o número escolhe (ou clique); vale na loja e no jogo
  const sendTaunt = (i: number) => {
    act.taunt(i);
    tauntPanel.hidden = true;
  };
  const tauntPanel = el('div', { class: 'vol-panel', hidden: true }, el('b', {}, 'Provocações (Y)'),
    el('div', { class: 'taunt-list' }, ...TAUNTS.map((t, i) => el('button', { type: 'button', onclick: () => sendTaunt(i) }, `${(i + 1) % 10} · ${t.text}`))));
  const sheetBtn = el('button', { type: 'button', class: 'icon', title: "Ficha do mago (tecla ')", 'aria-label': 'Ficha do mago', 'aria-expanded': 'false', onclick: () => toggleSheet() }, '📜');
  const tauntBtn = el('button', { type: 'button', class: 'icon', title: 'Provocações (Y)', 'aria-label': 'Provocações (Y)', onclick: () => (tauntPanel.hidden = !tauntPanel.hidden) }, '💬');
  addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.code === 'KeyY') {
      tauntPanel.hidden = !tauntPanel.hidden;
      e.preventDefault();
    } else if (!tauntPanel.hidden && /^(Digit|Numpad)[0-9]$/.test(e.code)) {
      const i = (Number(e.code.slice(-1)) + 9) % 10; // 1..9 e o 0 para o 10º
      if (i < TAUNTS.length) sendTaunt(i);
      // o número não pode também usar o item da mesma tecla
      e.preventDefault();
      e.stopImmediatePropagation();
    } else if (e.code === 'Escape') tauntPanel.hidden = true;
  });
  const voteBar = el('div', { class: 'vote-bar', role: 'status', hidden: true });
  const voteLeft = el('span', { class: 'muted' });
  let voteEndsAt = 0;
  // celular: sem Tab, este botão (só aparece em tela de toque) abre e fecha o placar
  const tabBtn = el('button', { type: 'button', class: 'icon tab-toggle', title: 'Placar', 'aria-label': 'Placar', hidden: true, onclick: () => pinTab(!!tabOverlay.hidden) }, '📊');
  const top = el('div', { class: 'hud-top' },
    el('button', { type: 'button', class: 'code', title: 'Copiar link da sala', onclick: () => copyLink() }, status, ' ', code, ping),
    roundEl,
    el('div', { class: 'hud-right' }, tabBtn, sheetBtn, el('div', { class: 'vol' }, tauntBtn, tauntPanel), voteWrap, el('div', { class: 'vol' }, keysBtn, keysPanel), el('div', { class: 'vol' }, volBtn, volPanel), el('button', { type: 'button', class: 'icon', title: 'Como jogar', 'aria-label': 'Como jogar', onclick: showRules }, '?')),
  );
  const center = el('div', { class: 'center' });
  const timer = el('div', { class: 'timer' });
  const respawn = el('div', { class: 'respawn' });
  const buttons = new Map<SpellId, { b: HTMLElement; cd: HTMLElement; pips: HTMLElement }>();
  let mine: PublicPlayer | undefined;
  const bar = el('div', { class: 'spellbar' }, ...SPELL_IDS.map((s) => {
    const cd = el('span', { class: 'cd' });
    const pips = el('span', { class: 'pips' });
    const b = withTip(el('button', { type: 'button', class: 'spell', 'aria-label': SPELLS[s].name, onclick: () => act.spell(s) },
      el('span', { class: 'key', 'data-action': s }, labelOf(s)), el('span', { class: 'ico' }, ICON[s]), pips, cd), () => spellTip(s, mine?.spells[s] ?? 0));
    buttons.set(s, { b, cd, pips });
    return b;
  }));
  // itens ativos (teclas 1, 2 e 3) ao lado das magias; só aparecem se comprados
  const itemButtons = new Map<ItemId, { b: HTMLElement; cd: HTMLElement }>();
  for (const i of ACTIVE_ITEMS) {
    const cd = el('span', { class: 'cd' });
    const b = withTip(el('button', { type: 'button', class: 'spell item', 'aria-label': ITEMS[i].name, onclick: () => act.useItem(i) },
      el('span', { class: 'key', 'data-action': i }, labelOf(i)), el('span', { class: 'ico' }, ITEM_ICON[i]), cd), () => itemTip(i, mine?.items[i] ?? 0));
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
    if (e.code === 'Escape' && tabOverlay.classList.contains('pinned')) return pinTab(false);
    // placar pelo Tab (pedido do Fernando, 17/10); na loja o Tab é do teclado e o placar fica no botão ao lado do Pronto
    if (e.code !== 'Tab' || !room || !TAB_PHASES.includes(room.phase) || (e.target as HTMLElement).closest?.('.center')) return;
    e.preventDefault();
    if (!e.repeat) showTab(true);
  });
  addEventListener('keyup', (e) => e.code === 'Tab' && !tabOverlay.classList.contains('pinned') && showTab(false));
  // magia escolhida pelo botão: diz o que fazer agora e como desistir (no toque não há Esc)
  let shownArmed: string | null = null;
  const armedText = el('span', {});
  const armedHint = el('div', { class: 'armed-hint', role: 'status', hidden: true }, armedText,
    el('button', { type: 'button', class: 'icon', title: 'Cancelar', 'aria-label': 'Cancelar a magia escolhida', onclick: () => {
      if (shownArmed && shownArmed in SPELLS) act.spell(shownArmed as SpellId);
      else if (shownArmed) act.useItem(shownArmed as ItemId);
    } }, '✕'));
  const barWrap = el('div', { class: 'barwrap' }, armedHint, passives, bar);
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
    const effects = STATUS_ICONS.filter(([bit]) => myStatus & bit && bit !== 1);
    sheetPanel.replaceChildren(
      el('div', { class: 'stats-head' }, el('h2', { class: 'title' }, 'Ficha do mago'), el('button', { type: 'button', class: 'icon', title: 'Fechar a ficha', 'aria-label': 'Fechar a ficha', onclick: () => toggleSheet(false) }, '✕')),
      sheetEl(sheet(mine.spells, mine.items),
        el('section', {}, el('h4', {}, 'Agora'), el('dl', {},
          el('dt', {}, 'Dano levado na rodada'), el('dd', {}, `${Math.round(taken)} · empurrão ×${(1 + (KNOCK_HP_SCALE * taken) / HP_MAX).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`), el('small', { class: 'from' }, 'Cada ponto de dano levado faz você voar mais longe até o fim da rodada (a lava conta pela metade e não entra nesta conta).'),
          el('dt', {}, 'Efeitos'), el('dd', {}, effects.length ? effects.map(([, ico, name]) => `${ico} ${name}`).join(' · ') : 'nenhum')))),
    );
  }
  function toggleSheet(open = sheetPanel.hidden) {
    sheetPanel.hidden = !open;
    sheetBtn.setAttribute('aria-expanded', String(open));
    drawSheet();
  }
  addEventListener('keydown', (e) => {
    if (e.code !== SHEET_KEY || e.repeat || e.ctrlKey || e.metaKey || (e.target as HTMLElement)?.tagName === 'INPUT' || !room || room.phase === 'lobby') return;
    e.preventDefault();
    toggleSheet();
  });
  // feed de abates no canto: quem derrubou quem e com o quê; cada linha some em 5 s
  const feed = el('ol', { class: 'feed', 'aria-live': 'polite' });
  // borda vermelha: vida baixa (fixa) e pé na lava (pulsando); fica atrás do resto da HUD
  const danger = el('div', { class: 'danger', 'aria-hidden': 'true' });
  // dica do modo treino, uma por vez
  const coach = el('div', { class: 'coach', role: 'status', hidden: true });
  // espectador: selo "Assistindo X" com setas para trocar (← → no teclado)
  const watchName = el('b', {});
  const watchBadge = el('div', { class: 'watching', role: 'status', hidden: true },
    el('button', { type: 'button', class: 'icon', title: 'Anterior (←)', 'aria-label': 'Assistir o anterior', onclick: () => act.watch(-1) }, '‹'),
    el('span', {}, 'Assistindo ', watchName, TOUCH ? null : el('small', {}, ' · ← → troca')),
    el('button', { type: 'button', class: 'icon', title: 'Próximo (→)', 'aria-label': 'Assistir o próximo', onclick: () => act.watch(1) }, '›'));
  root.replaceChildren(el('div', { class: 'hud' }, danger, top, offline, players, timer, respawn, feed, coach, watchBadge, center, voteBar, barWrap, sheetPanel, tabOverlay), el('div', { class: 'labels', id: 'labels' }));
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
  let setup = false; // fim da partida: true depois do "Voltar à sala"

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
    const startBtn = el('button', { type: 'button', class: 'primary big', onclick: () => act.start(bots, mode, shuffle, o) }, 'Começar partida');
    if (humans + bots < 2) startBtn.setAttribute('disabled', '');
    const modes: [Mode, string, string][] = [
      ['rounds', 'Rodadas', `O último vivo ganha a rodada. Vence quem fizer ${o.goal} rodadas.`],
      ['deathmatch', 'Deathmatch', `Rodadas de 60 s, quem cai volta em 10 s. Cada abate vale 1 ponto; vence quem chegar a ${DM_GOALS[o.goal]}.`],
      ['teams', 'Times', `Azul contra Vermelho. A rodada acaba quando só sobra um time, e todos dele ganham 1 ponto; vence quem fizer ${o.goal}. Magia em aliado só empurra.`],
    ];
    // Times: o grupo escolhe se os times mudam a cada rodada ou ficam até o fim
    const shufflePicker = mode !== 'teams' ? null : el('div', { class: 'stats-tabs', role: 'group', 'aria-label': 'Sorteio dos times' }, ...[true, false].map((k) =>
      el('button', { type: 'button', 'aria-pressed': String(k === shuffle), class: k === shuffle ? 'on' : '', onclick: () => {
        shuffle = k;
        drawCenter();
      } }, k ? 'Sorteados a cada rodada' : 'Fixos na partida')));
    const modePicker = el('div', { class: 'mode' },
      el('div', { class: 'stats-tabs', role: 'group', 'aria-label': 'Modo de jogo' }, ...modes.map(([k, label]) =>
        el('button', { type: 'button', 'aria-pressed': String(k === mode), class: k === mode ? 'on' : '', onclick: () => {
          mode = k;
          drawCenter();
        } }, label))),
      el('small', { class: 'muted' }, modes.find(([k]) => k === mode)![2]), shufflePicker);
    // opções da partida: uma fileira de botões por opção, como o seletor de modo; vão junto com o "Começar"
    // abertas por padrão: quem cria a sala vê as opções sem procurar (fechar fica guardado até sair da sala)
    const optsBlock = el('details', { class: 'match-opts', open: optsOpen, ontoggle: (e: Event) => (optsOpen = (e.target as HTMLDetailsElement).open) }, el('summary', {}, 'Opções da partida · ', el('small', { class: 'muted' }, optsLine(o, mode))),
      ...OPT_KEYS.map((k) => el('div', { class: 'opt-row' }, el('small', {}, OPT_NAME[k]),
        el('div', { class: 'stats-tabs', role: 'group', 'aria-label': OPT_NAME[k] }, ...(OPTION_CHOICES[k] as readonly MatchOpts[OptKey][]).map((val) =>
          el('button', { type: 'button', 'aria-pressed': String(o[k] === val), class: o[k] === val ? 'on' : '', onclick: () => {
            Object.assign(o, { [k]: val });
            drawCenter();
          } }, optText(k, val, mode)))))));
    return el('div', { class: 'card' },
      el('div', {}, el('h2', { class: 'title' }, 'Sala ' + r.id), el('p', { class: 'muted' }, 'Mande o link para os amigos entrarem. Até 8 magos.'),
        el('ul', { class: 'board' }, ...r.players.map((p) => el('li', {}, el('span', {}, teamTag(r, p), dot(p.color), ' ', nameOf(p, me), p.connected || p.bot ? '' : ' · caiu'), kickBtn(p, act.kick))))),
      // sozinho na sala: treino com 3 bots e dicas curtas nas primeiras rodadas, logo à vista
      humans === 1 && r.phase === 'lobby' ? el('button', { type: 'button', class: 'train', onclick: act.train }, '🎯 Treinar sozinho com bots', el('small', {}, '3 bots e dicas nas primeiras rodadas')) : null,
      picker(r),
      modePicker,
      optsBlock,
      el('div', { class: 'bots' }, el('span', {}, 'Bots'), el('button', { type: 'button', 'aria-label': 'Menos um bot', onclick: () => set(bots - 1) }, '−'), count, el('button', { type: 'button', 'aria-label': 'Mais um bot', onclick: () => set(bots + 1) }, '+')),
      // Começar e Convidar grudados no rodapé enquanto rola as opções
      el('div', { class: 'card-go' }, startBtn, inviteBtn()),
    );
  }

  // fim da partida: resultado e as duas saídas rápidas no topo; "Voltar à sala" mostra a sala de espera para trocar modo e opções
  function endPanel(r: PublicRoom) {
    const roomBots = r.players.filter((p) => p.bot).length;
    const humans = r.players.filter((p) => !p.bot && p.connected).length;
    const again = el('button', { type: 'button', class: 'primary big', disabled: humans + roomBots < 2, onclick: () => act.start(roomBots, r.mode, r.teamShuffle, r.opts) }, 'Jogar de novo');
    return el('div', { class: 'card' },
      el('h2', { class: 'title' }, winTitle(r)), r.winner || r.winnerTeam !== null ? null : el('p', { class: 'muted' }, 'Partida encerrada sem vencedor (empate ou ninguém fez ponto).'),
      podium(r, me),
      el('div', { class: 'end-actions' }, again, el('button', { type: 'button', class: 'big', onclick: () => {
        // a sala de espera começa com as opções da partida que acabou
        setup = true;
        mode = r.mode;
        shuffle = r.teamShuffle;
        opts = { ...r.opts };
        bots = roomBots;
        drawCenter();
        center.scrollTop = 0;
      } }, 'Voltar à sala')),
      el('small', { class: 'muted end-hint' }, `Jogar de novo repete tudo: ${MODE_NAME[r.mode]}, ${roomBots} ${roomBots === 1 ? 'bot' : 'bots'}, ${optsLine(r.opts, r.mode)}.`),
      board(r, me, act.kick), statsBoard(r, me, scope, setScope, view, setView));
  }

  // estado da loja que sobrevive ao redesenho (a sala manda o estado a cada compra de qualquer jogador)
  let goldOpen = false;
  let sheetOpen = true;
  let readyBtn: HTMLElement | null = null;
  // cartão de primeira vez na loja da rodada 0: some ao fechar ou ao apertar Pronto, e fica guardado no navegador
  const FIRST = 'warlock:firstshop';
  let firstSeen = false;
  try {
    firstSeen = localStorage.getItem(FIRST) === '1';
  } catch {
    // sem armazenamento: aparece em toda partida
  }
  const seeFirst = () => {
    firstSeen = true;
    try {
      localStorage.setItem(FIRST, '1');
    } catch {
      // só nesta aba
    }
  };
  const firstCard = () => el('div', { class: 'first-tip', role: 'note' },
    el('p', {}, el('b', {}, 'Primeira vez? '), TOUCH
      ? 'Toque no chão para andar · toque numa magia e depois no chão para lançar · compre 1 ou 2 magias e aperte Pronto.'
      : isPadMode() ? 'Analógico esquerdo anda · A atira a Bola de fogo para onde o direito mira · compre 1 ou 2 magias e aperte Start (Pronto).'
      : `Botão direito anda · ${labelOf('fireball')} atira a Bola de fogo na direção do mouse · compre 1 ou 2 magias e aperte Pronto.`),
    el('button', { type: 'button', class: 'link', onclick: () => { seeFirst(); drawCenter(); } }, 'Entendi'));
  const readyText = (ready: boolean) => `${ready ? 'Esperando os outros' : 'Pronto'} · ${Math.ceil(Math.max(0, (phaseEndsAt - performance.now()) / 1000))} s`;

  function shopPanel(r: PublicRoom) {
    const mine = r.players.find((p) => p.id === me);
    // desfazer: só o que foi comprado nesta loja (devolve o ouro)
    const undoBtn = (key: string) => (mine?.bought.includes(key) ? el('button', { type: 'button', class: 'undo', title: 'Desfazer a compra (devolve o ouro)', 'aria-label': 'Desfazer a compra', 'data-key': 'undo-' + key, onclick: () => act.undo(key) }, '↩') : null);
    if (!mine) return el('div', { class: 'card' }, el('p', {}, 'Você está assistindo. Entra na próxima partida.'));
    // vender: magia ou item inteiro; o comprado nesta loja volta inteiro, o de antes pela metade
    const sellBtn = (key: string) => {
      const value = sellValue(mine, r.round, key);
      return value > 0 ? el('button', { type: 'button', class: 'sell', title: 'Vende tudo: volta 100% na loja em que comprou e 5% a menos por rodada com ele, até 75%', 'data-key': 'sell-' + key, onclick: () => act.sell(key) }, `Vender · ${value}`) : null;
    };
    // um cartão por magia ou item: "dá para comprar" e "já tenho" à vista, e quanto falta quando o ouro não dá
    type Offer = { key: string; ico: string; name: string; hotkey: string | null; use: string; lvl: number; max: number; price: number | null; blocked: string | null; buy: () => void; tip: () => string;
      // a ficha depois de comprar mais um nível e depois de vender tudo (prévia na dica)
      bought: () => SheetRow[]; sold: () => SheetRow[] };
    const now = sheet(mine.spells, mine.items);
    const offer = (o: Offer) => {
      const open = o.price !== null && !o.blocked;
      const can = open && mine.gold >= o.price!;
      const need = open && !can ? o.price! - mine.gold : 0;
      const label = o.blocked ?? (o.lvl === 0 ? `Comprar · ${o.price}` : `Nível ${o.lvl + 1} · ${o.price}`);
      return withTip(el('div', { class: 'shop-item' + (o.lvl ? ' owned' : '') + (can ? ' can' : '') + (o.blocked && !o.lvl ? ' locked' : '') },
        el('div', { class: 'shop-title' }, el('span', { class: 'ico' }, o.ico), el('b', {}, o.name), o.hotkey !== null ? el('span', { class: 'key' }, o.hotkey) : null),
        el('small', {}, o.use),
        el('div', { class: 'shop-meta' }, el('span', { class: 'pips' }, ...Array.from({ length: o.max }, (_, n) => el('i', { class: n < o.lvl ? 'on' : '' }))),
          o.lvl ? el('small', { class: 'have' }, 'tenho') : null, need ? el('small', { class: 'need' }, `faltam ${need}`) : null),
        el('div', { class: 'buy-row' }, el('button', { type: 'button', 'data-key': o.key, disabled: !can, onclick: o.buy }, label), undoBtn(o.key.replace('-', ':')), sellBtn(o.key.replace('-', ':'))),
      ), () => {
        const sell = sellValue(mine, r.round, o.key.replace('-', ':'));
        return o.tip()
          // magia: a própria dica já mostra o nível atual → o próximo
          + (o.key.startsWith('spell') || o.blocked ? '' : previewHtml(o.lvl ? 'Se subir de nível' : 'Se comprar', diff(now, o.bought())))
          + (sell > 0 ? previewHtml('Se vender', diff(now, o.sold()), `<small>Volta ${sell} de ouro.</small>`) : '');
      });
    };
    const spellOffer = (s: SpellId) => {
      const lvl = mine.spells[s];
      const price = priceOf(s, lvl);
      const full = lvl === 0 && spellCount(mine.spells) >= MAX_SPELLS;
      return offer({ key: 'spell-' + s, ico: ICON[s], name: SPELLS[s].name, hotkey: labelOf(s), use: SPELL_USE[s], lvl, max: MAX_SPELL_LEVEL, price,
        blocked: price === null ? 'Máximo' : full ? `Limite de ${MAX_SPELLS} magias` : null, buy: () => act.buy(s), tip: () => spellTip(s, lvl),
        bought: () => sheet({ ...mine.spells, [s]: lvl + 1 }, mine.items), sold: () => sheet({ ...mine.spells, [s]: 0 }, mine.items) });
    };
    const itemOffer = (i: ItemId) => {
      const lvl = mine.items[i];
      const price = itemPrice(mine.items, i);
      return offer({ key: 'item-' + i, ico: ITEM_ICON[i], name: ITEMS[i].name, hotkey: ITEMS[i].key ? labelOf(i) : null, use: ITEMS[i].text, lvl, max: ITEMS[i].levels.length, price,
        blocked: lvl >= ITEMS[i].levels.length ? 'Máximo' : price === null ? 'Sem espaço' : null, buy: () => act.buyItem(i), tip: () => itemTip(i, lvl),
        bought: () => sheet(mine.spells, { ...mine.items, [i]: lvl + 1 }), sold: () => sheet(mine.spells, { ...mine.items, [i]: 0 }) });
    };
    const group = (title: string, hint: string, cards: HTMLElement[]) =>
      el('section', { class: 'shop-group' }, el('div', { class: 'shop-head' }, el('h3', {}, title), el('small', {}, hint)), el('div', { class: 'shop-grid' }, ...cards));
    const itemCount = `${ITEM_IDS.filter((i) => mine.items[i] > 0).length} de ${MAX_ITEMS} itens`;
    readyBtn = el('button', { type: 'button', class: 'primary big', 'data-key': 'ready', disabled: mine.ready, onclick: () => {
      if (r.round === 0) seeFirst();
      act.ready();
    } }, readyText(mine.ready));
    // duas colunas: compras à esquerda; ouro, Pronto, placar e personagem à direita (pedido do Fernando: loja mais larga)
    return el('div', { class: 'card shop' }, el('div', { class: 'shop-main' },
      el('div', { class: 'shop-head' }, el('h2', { class: 'title' }, r.round === 0 ? 'Loja' : `Loja · depois da rodada ${r.round}`), el('small', {}, `${spellCount(mine.spells)} de ${MAX_SPELLS} magias`)),
      r.round === 0 && !firstSeen ? firstCard() : null,
      ...SPELL_GROUPS.map(([title, hint, ids]) => group(title, hint, ids.map(spellOffer))),
      group('Itens passivos', itemCount, ITEM_IDS.filter((i) => !ITEMS[i].key).map(itemOffer)),
      group('Itens ativos', 'cada um com a sua tecla', ITEM_IDS.filter((i) => ITEMS[i].key).map(itemOffer)),
      ),
      el('aside', { class: 'shop-side' },
        el('span', { class: 'gold big' }, `🪙 ${mine.gold}`),
        readyBtn,
        el('button', { type: 'button', 'data-key': 'placar', onclick: () => pinTab(true) }, '📊 Placar'),
        el('details', { class: 'sheet-box', open: sheetOpen, ontoggle: (e: Event) => (sheetOpen = (e.target as HTMLDetailsElement).open) },
          el('summary', {}, 'Ficha do mago'), sheetEl(now, el('small', { class: 'muted' }, 'Passe o mouse num item para ver o que muda.'))),
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
      el('div', { class: 'stats-tabs', role: 'group', 'aria-label': 'Modo da próxima rodada' }, ...MODES.map((k) =>
        el('button', { type: 'button', 'aria-pressed': String(k === next), class: k === next ? 'on' : '', disabled: !!r.vote && k !== next, onclick: () => k !== next && act.vote('mode', k) }, MODE_NAME[k]))),
      next === 'teams' ? el('button', { type: 'button', disabled: !!r.vote, onclick: () => act.vote('shuffle') }, `Times ${SHUFFLE_NAME(r.pendingShuffle ?? r.teamShuffle)} · trocar`) : null,
      r.pendingMode ? el('small', {}, `Próxima rodada: ${MODE_NAME[r.pendingMode]} (os pontos zeram)`) : null,
      r.vote ? el('small', { class: 'muted' }, 'Votação aberta no topo da tela.') : null);
  }

  function drawVote(r: PublicRoom, prev: PublicRoom | null) {
    const v = r.vote;
    const human = !!mine && !mine.bot;
    voteWrap.hidden = !human || !VOTE_PHASES.includes(r.phase);
    const close = (f: () => void) => () => {
      votePanel.hidden = true;
      voteBtn.setAttribute('aria-expanded', 'false');
      f();
    };
    const next = r.pendingMode ?? r.mode;
    const vote = (kind: Vote['kind'], target?: string) => close(() => act.vote(kind, target));
    const btn = (label: string, kind: Vote['kind'], target?: string) => el('button', { type: 'button', disabled: !!v, onclick: vote(kind, target) }, label);
    // grupos recolhíveis para a lista não ficar enorme
    const group = (title: string, ...items: Child[]) => el('details', { class: 'vote-group' }, el('summary', {}, title), ...items);
    const nextOpts = { ...r.opts, ...r.pendingOpts };
    const bots = r.players.filter((p) => p.bot).length + r.botDelta;
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
        ...OPT_KEYS.map((k) => el('div', { class: 'opt-row' }, el('small', {}, OPT_NAME[k]),
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
    hideTip();
    center.classList.toggle('wide', r.phase === 'shop' || r.phase === 'end');
    // o painel entra animado só quando a fase muda (a loja redesenha a cada compra e não pode ficar "pulando")
    const entering = r.phase !== centerPhase;
    center.classList.toggle('enter', entering);
    centerPhase = r.phase;
    center.replaceChildren(r.phase === 'lobby' || (r.phase === 'end' && setup) ? lobbyPanel(r) : r.phase === 'end' ? endPanel(r) : r.phase === 'shop' ? shopPanel(r) : '');
    // painel novo começa do topo (o fim da partida herdava a rolagem da loja e escondia o título e o pódio)
    if (entering) center.scrollTop = 0;
    if (!online) center.querySelectorAll('button').forEach((b) => b.setAttribute('disabled', ''));
    if (focused) (center.querySelector(`[data-key="${focused}"]`) as HTMLElement | null)?.focus();
  }

  // lista do canto: pontos da partida e, ao vivo, abates e dano da rodada (somados no cliente a partir dos acertos)
  let live: Record<string, { dmg: number; kills: number; taken?: number }> = {};
  function drawPlayers() {
    if (!room) return;
    const head = el('li', { class: 'head' }, el('span', {}), el('span', {}), el('small', { title: 'Abates na rodada' }, '☠'), el('small', { title: 'Dano na rodada' }, '💥'), el('small', { title: room.mode === 'deathmatch' ? 'Pontos' : 'Vitórias' }, '🏆'));
    // modo Times: agrupada por time, com uma faixa da cor do time à esquerda
    const r = room;
    players.replaceChildren(head, ...[...r.players].sort((a, b) => byTeam(r, a, b)).map((p) =>
      el('li', { class: p.id === me ? 'me' : '', style: r.mode === 'teams' && p.team !== null ? `box-shadow:inset 3px 0 0 ${TEAM_COLORS[p.team]}` : '' }, dot(p.color), el('span', {}, nameOf(p, me)), el('span', { class: 'live' }, String(live[p.id]?.kills ?? 0)), el('span', { class: 'live' }, String(Math.round(live[p.id]?.dmg ?? 0))), el('b', {}, String(p.score))),
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
        el('span', { class: 'feed-ico', title: killer ? srcName(src) : 'lava' }, killer ? srcIcon(src) : SOURCE_ICON.lava), who(id), killer ? null : el('small', {}, 'caiu na lava'));
      feed.append(li);
      while (feed.children.length > 5) feed.firstElementChild!.remove();
      setTimeout(() => li.remove(), 5000);
    },
    watching(name: string | null) {
      watchBadge.hidden = !name;
      if (name && watchName.textContent !== name) watchName.textContent = name;
    },
    coach(text: string | null) {
      coach.hidden = !text;
      if (text && coach.textContent !== text) coach.textContent = text;
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
      roundEl.textContent = [
        r.round > 0 && r.phase !== 'lobby' ? (r.mode === 'deathmatch' ? `Deathmatch · rodada ${r.round} · ${r.goal} abates para vencer` : `${r.mode === 'teams' ? 'Times · ' : ''}Rodada ${r.round} · vence quem fizer ${r.goal}`) : '',
        r.pendingMode && r.phase !== 'end' ? `Próxima rodada: ${MODE_NAME[r.pendingMode]}` : '',
        r.pendingShuffle !== null && r.phase !== 'end' ? `Próxima rodada: times ${SHUFFLE_NAME(r.pendingShuffle)}` : '',
      ].filter(Boolean).join(' · ');
      drawPlayers();
      mine = r.players.find((p) => p.id === you);
      for (const i of ACTIVE_ITEMS) itemButtons.get(i)!.b.hidden = !mine?.items[i];
      // barra da partida: só magias e itens equipados; passivos viram selos pequenos acima dela
      passives.replaceChildren(...ITEM_IDS.filter((i) => !ITEMS[i].key && (mine?.items[i] ?? 0) > 0).map((i) =>
        withTip(el('span', { class: 'passive', tabindex: 0, 'aria-label': ITEMS[i].name }, ITEM_ICON[i], el('small', {}, String(mine!.items[i]))), () => itemTip(i, mine?.items[i] ?? 0)),
      ));
      setSlots(SPELL_IDS.filter((s) => (mine?.spells[s] ?? 0) > 0));
      for (const s of SPELL_IDS) {
        const { b, pips } = buttons.get(s)!;
        const lvl = mine?.spells[s] ?? 0;
        b.hidden = lvl === 0;
        pips.replaceChildren(...Array.from({ length: MAX_SPELL_LEVEL }, (_, n) => el('i', { class: n < lvl ? 'on' : '' })));
      }
      barWrap.hidden = r.phase === 'lobby' || r.phase === 'end' || r.phase === 'shop' || !mine;
      const tabPhase = r.phase === 'playing' || r.phase === 'countdown' || r.phase === 'roundEnd' || r.phase === 'shop';
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
    frame(cd: number[], icd: number[], armed: string | null, shrinkIn: number | null, respawnIn: number, status = 0, rttMs: number | null = null) {
      if (status !== myStatus) {
        myStatus = status;
        drawSheet();
      }
      ACTIVE_ITEMS.forEach((i, k) => {
        const { b, cd: c } = itemButtons.get(i)!;
        const left = icd[k] ?? 0;
        c.textContent = left > 0.05 ? left.toFixed(left < 1 ? 1 : 0) : '';
        cooled(b, left);
        b.classList.toggle('armed', armed === i);
      });
      SPELL_IDS.forEach((s, i) => {
        const { b, cd: c } = buttons.get(s)!;
        const left = cd[i] ?? 0;
        c.textContent = left > 0.05 ? left.toFixed(left < 1 ? 1 : 0) : '';
        cooled(b, left);
        b.classList.toggle('armed', armed === s);
      });
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
        if (armed) armedText.textContent = `${TOUCH ? 'Toque' : 'Clique'} no chão para lançar ${armed in SPELLS ? SPELLS[armed as SpellId].name : ITEMS[armed as ItemId].name}`;
      }
    },
  };
}
