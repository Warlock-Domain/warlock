// Telas em DOM: apelido, lista de salas, sala de espera, loja, barra de magias, placar e avisos.
import { DM_KILLS_TO_WIN, KILL_GOLD, MAX_PLAYERS, ROUND_GOLD, START_GOLD, TOP_DMG_GOLD, WIN_GOLD, WINS_TO_WIN } from '../shared/constants.ts';
import { CHARACTERS, type CharacterId } from '../shared/characters.ts';
import { VOTE_PHASES, sellValue, type Mode } from '../shared/match.ts';
import type { PublicPlayer, PublicRoom } from '../shared/protocol.ts';
import { ACTIVE_ITEMS, ITEMS, ITEM_IDS, MAX_ITEMS, itemPrice, type ItemId } from '../shared/items.ts';
import { MASTERIES, MASTERY_ALL_COST, MASTERY_COST, MASTERY_IDS, MASTERY_MAX, type MasteryId } from '../shared/masteries.ts';
import { MAX_SPELLS, MAX_SPELL_LEVEL, SPELLS, SPELL_IDS, priceOf, spellCount, type SpellId } from '../shared/spells.ts';
import { ACTIONS, RESERVED, keyLabel, keyOf, labelOf, onKeysChange, resetKeys, setKey, type Action } from './keys.ts';
import { hideTip, itemTip, masteryTip, spellTip, withTip } from './tips.ts';
import { COLORS } from './scene.ts';
import { RULES } from './rules-text.ts';

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

export const ICON: Record<SpellId, string> = { fireball: '🔥', lightning: '⚡', homing: '🎯', shield: '🛡️', teleport: '✨', swap: '🔄', grip: '⛓️', meteor: '☄️', rush: '💨', cluster: '🔱' };
export const ITEM_ICON: Record<ItemId, string> = { ring: '💍', cursed_ring: '🧿', cape: '🧣', armor: '⛓️', boots: '👢', watch: '⏱️', scourge: '💥', redirector: '↪️', pact: '🩸' };
const TITLE = 'Warlock';

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

export type RoomInfo = { id: string; players: number; phase: string };
const PHASE: Record<string, string> = { lobby: 'esperando', end: 'fim de jogo' };

export function renderLobby(root: HTMLElement, name: string, rooms: RoomInfo[] | null, onCreate: () => void, onRename: () => void) {
  const list =
    rooms === null
      ? el('p', { class: 'muted' }, 'Carregando salas…')
      : rooms.length === 0
        ? el('p', { class: 'muted' }, 'Nenhuma sala aberta. Crie uma e mande o link no grupo.')
        : el('ul', { class: 'rooms' }, ...rooms.map((r) =>
            el('li', {},
              el('span', { class: 'code' }, r.id),
              el('span', { class: 'muted' }, `${r.players} ${r.players === 1 ? 'pessoa' : 'pessoas'} · ${PHASE[r.phase] ?? 'jogando'}`),
              el('a', { class: 'button', href: '#' + r.id }, r.phase === 'lobby' ? 'Entrar' : 'Assistir'),
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
      el('section', {}, el('h2', {}, 'Salas abertas'), list),
    ),
  );
}

export function showRules() {
  const overlay = el('div', { class: 'overlay rules-overlay', onclick: (e: Event) => e.target === overlay && overlay.remove() },
    el('div', { class: 'panel rules' },
      el('h1', {}, 'Como jogar'),
      ...RULES.map(([title, items]) => el('section', {}, el('h2', {}, title), el('ul', {}, ...items.map((i) => el('li', {}, i))))),
      el('button', { type: 'button', class: 'primary', onclick: () => overlay.remove() }, 'Entendi'),
    ),
  );
  document.body.append(overlay);
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string) {
  let t = document.getElementById('toast');
  if (!t) document.body.append((t = el('div', { id: 'toast', role: 'status' })));
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t!.classList.remove('show'), 3500);
}

export function banner(text: string, kind: '' | 'good' | 'bad' = '') {
  document.querySelectorAll('.banner').forEach((b) => b.remove());
  const b = el('div', { class: `banner ${kind}`, role: 'status', 'aria-live': 'polite' }, text);
  document.body.append(b);
  setTimeout(() => b.remove(), 1700);
}

export function screen(root: HTMLElement, title: string, text: string, button: string, onClick: () => void) {
  root.replaceChildren(el('div', { class: 'overlay' }, el('div', { class: 'panel' }, el('h1', {}, title), el('p', {}, text), el('button', { type: 'button', class: 'primary', onclick: onClick }, button))));
}

export type RoomActions = {
  start: (bots: number, mode: Mode) => void;
  buy: (s: SpellId) => void;
  buyItem: (i: ItemId) => void;
  buyMastery: (m: MasteryId | 'all') => void;
  kick: (id: string) => void;
  vote: (kind: 'mode' | 'kick', target?: string) => void;
  ballot: (yes: boolean) => void;
  undo: (key: string) => void;
  sell: (key: string) => void;
  useItem: (i: ItemId) => void;
  pick: (c: CharacterId) => void;
  ready: () => void;
  spell: (s: SpellId) => void;
  volumes: () => { sfx: number; music: number };
  setVolume: (kind: 'sfx' | 'music', value: number) => void;
  click: () => void;
};

const MODE_NAME: Record<Mode, string> = { rounds: 'Rodadas', deathmatch: 'Deathmatch' };
const dot = (color: number) => el('span', { class: 'dot', style: `background:${COLORS[color]}` });
const nameOf = (p: PublicPlayer, me: string) => p.name + (p.id === me ? ' (você)' : '') + (p.bot ? ' 🤖' : '');

// placar de estatísticas: ouro ganho, dano causado e precisão de cada magia de dano (acertos / lançamentos)
type Scope = 'round' | 'match' | 'room';
const SCOPES: [Scope, string][] = [['round', 'Rodada'], ['match', 'Partida'], ['room', 'Sala']];
const AIM: [string, string, string][] = [['fireball', '🔥', 'Bola de fogo'], ['lightning', '⚡', 'Raio'], ['homing', '🎯', 'Míssil'], ['meteor', '☄️', 'Meteoro'], ['cluster', '🔱', 'Rajada'], ['scourge', '💥', 'Flagelo']];
const n0 = (x: number) => Math.round(x).toLocaleString('pt-BR');

function statsBoard(room: PublicRoom, me: string, scope: Scope, setScope: (s: Scope) => void) {
  const rows = [...room.players].sort((a, b) => b.stats[scope].dmg - a.stats[scope].dmg);
  const aimCell = (p: PublicPlayer, k: string) => {
    const f = p.stats[scope].fired[k] ?? 0;
    const l = p.stats[scope].landed[k] ?? 0;
    return el('td', { class: 'num', title: f ? `${l} acertos em ${f} lançamentos` : 'não usou' }, f ? `${Math.round((l / f) * 100)}%` : '–', f ? el('small', {}, ` ${l}/${f}`) : null);
  };
  return el('div', { class: 'stats' },
    el('div', { class: 'stats-tabs', role: 'tablist' }, ...SCOPES.map(([k, label]) =>
      el('button', { type: 'button', role: 'tab', 'aria-selected': String(k === scope), class: k === scope ? 'on' : '', onclick: () => setScope(k) }, label))),
    el('div', { class: 'stats-wrap' }, el('table', { class: 'stats-table' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Jogador'), el('th', { class: 'num' }, room.mode === 'deathmatch' ? 'Pontos' : 'Vitórias'), el('th', { class: 'num' }, 'Abates'), el('th', { class: 'num' }, 'Ouro'), el('th', { class: 'num' }, 'Dano'), ...AIM.map(([, ico, name]) => el('th', { class: 'num', title: 'Precisão: ' + name }, ico)))),
      el('tbody', {}, ...rows.map((p) => el('tr', { class: p.id === me ? 'me' : '' },
        el('td', {}, dot(p.color), ' ', p.name), el('td', { class: 'num' }, String(p.score)), el('td', { class: 'num' }, String(p.stats[scope].kills ?? 0)),
        el('td', { class: 'num' }, n0(p.stats[scope].gold)), el('td', { class: 'num' }, n0(p.stats[scope].dmg)),
        ...AIM.map(([k]) => aimCell(p, k)),
      ))),
    )),
  );
}

// quadro da loja: de onde vem o ouro (regras do Warlock Brawl) e quanto você já ganhou
function goldInfo(p: PublicPlayer) {
  const row = (label: string, value: string, cls = '') => el('div', { class: 'gold-row ' + cls }, el('span', {}, label), el('b', {}, value));
  const rule = (n: number) => (n > 0 ? `+${n}` : 'não dá ouro');
  return el('div', { class: 'gold-info' },
    el('b', { class: 'gold-title' }, 'Como ganho ouro'),
    row('Começo da partida', `+${START_GOLD}`),
    row('Cada rodada que você jogou', `+${ROUND_GOLD}`),
    row('Vencer a rodada', rule(WIN_GOLD), WIN_GOLD ? '' : 'muted'),
    row('Abate', rule(KILL_GOLD), KILL_GOLD ? '' : 'muted'),
    row('Mais dano na rodada', rule(TOP_DMG_GOLD), TOP_DMG_GOLD ? '' : 'muted'),
    el('hr', {}),
    row('Ganho na última rodada', `🪙 ${p.stats.round.gold}`),
    row('Ganho na partida', `🪙 ${p.stats.match.gold}`),
    row('Ganho na sala (todas as partidas)', `🪙 ${p.stats.room.gold}`),
    el('small', { class: 'muted' }, 'Todo mundo ganha a rodada; vencer, abater e causar mais dano dão ouro extra. Desfazer (↩) devolve o ouro do que foi comprado nesta loja; Vender devolve o que foi comprado nesta loja inteiro e o de rodadas anteriores pela metade.'),
  );
}

// botão de expulsar: só para bots e para quem caiu e não voltou
const kickBtn = (p: PublicPlayer, kick?: (id: string) => void) =>
  kick && (p.bot || !p.connected) ? el('button', { type: 'button', class: 'kick', title: `Expulsar ${p.name}`, 'aria-label': `Expulsar ${p.name}`, onclick: () => kick(p.id) }, '✕') : null;

function board(room: PublicRoom, me: string, kick?: (id: string) => void) {
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  return el('ol', { class: 'board' }, ...sorted.map((p) =>
    el('li', { class: p.id === room.winner ? 'win' : '' }, el('span', {}, dot(p.color), ' ', nameOf(p, me), p.connected || p.bot ? '' : ' · caiu'), el('span', { class: 'board-right' }, el('b', {}, room.mode === 'deathmatch' ? `${p.score} ${p.score === 1 ? 'ponto' : 'pontos'}` : `${p.score} ${p.score === 1 ? 'vitória' : 'vitórias'}`), kickBtn(p, kick))),
  ));
}

export function createRoomUi(root: HTMLElement, code: string, act: RoomActions) {
  let bots = 3;
  try {
    bots = Number(sessionStorage.getItem('warlock:bots') ?? 3) || 0;
  } catch {
    // armazenamento bloqueado: fica o padrão
  }
  const status = el('span', { class: 'dot off', title: 'conexão' });
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
  const volPanel = el('div', { class: 'vol-panel', hidden: true }, slider('sfx', 'Efeitos'), slider('music', 'Música'));
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
      if (RESERVED.has(e.code)) return toast('Essa tecla já tem outra função (S para, Espaço centraliza, Tab mostra o placar).');
      setKey(waiting, e.code);
    }
    waiting = null;
    drawKeys();
  }, true);
  const keysPanel = el('div', { class: 'vol-panel keys-panel', hidden: true }, el('b', {}, 'Teclas'), keysList,
    el('button', { type: 'button', onclick: () => resetKeys() }, 'Voltar ao padrão'));
  const keysBtn = el('button', { type: 'button', class: 'icon', title: 'Trocar teclas', onclick: () => {
    keysPanel.hidden = !keysPanel.hidden;
    if (!keysPanel.hidden) drawKeys();
  } }, '⌨️');
  onKeysChange(() => {
    drawKeys();
    bar.querySelectorAll<HTMLElement>('[data-action]').forEach((k) => (k.textContent = labelOf(k.dataset.action as Action)));
    drawCenter();
  });
  const volBtn = el('button', { type: 'button', class: 'icon', title: 'Volume', 'aria-expanded': 'false', onclick: () => {
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
  const voteBar = el('div', { class: 'vote-bar', role: 'status', hidden: true });
  const voteLeft = el('span', { class: 'muted' });
  let voteEndsAt = 0;
  const top = el('div', { class: 'hud-top' },
    el('button', { type: 'button', class: 'code', title: 'Copiar link da sala', onclick: copyLink }, status, ' ', code),
    roundEl,
    el('div', { class: 'hud-right' }, voteWrap, el('div', { class: 'vol' }, keysBtn, keysPanel), el('div', { class: 'vol' }, volBtn, volPanel), el('button', { type: 'button', class: 'icon', title: 'Como jogar', onclick: showRules }, '?')),
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
  // segurar Tab durante a partida mostra o placar
  const tabOverlay = el('div', { class: 'tab-overlay', hidden: true });
  function showTab(on: boolean) {
    tabOverlay.hidden = !on || !room;
    if (on && room) tabOverlay.replaceChildren(el('div', { class: 'card' }, el('h2', { class: 'title' }, 'Placar'), statsBoard(room, me, scope, setScope)));
  }
  addEventListener('keydown', (e) => {
    if (e.code !== 'Tab' || !room || (room.phase !== 'playing' && room.phase !== 'countdown' && room.phase !== 'roundEnd')) return;
    e.preventDefault();
    if (!e.repeat) showTab(true);
  });
  addEventListener('keyup', (e) => e.code === 'Tab' && showTab(false));
  const barWrap = el('div', { class: 'barwrap' }, passives, bar);
  root.replaceChildren(el('div', { class: 'hud' }, top, players, timer, respawn, center, voteBar, barWrap, tabOverlay), el('div', { class: 'labels', id: 'labels' }));
  // clique dos botões da sala e da loja
  root.addEventListener('click', (e) => (e.target as HTMLElement).closest('button') && act.click());

  function copyLink() {
    const url = location.href;
    navigator.clipboard?.writeText(url).then(() => toast('Link copiado. Mande no grupo!'), () => toast(url));
  }

  let room: PublicRoom | null = null;
  let me = '';
  let scope: Scope = 'round';
  const setScope = (s: Scope) => {
    scope = s;
    drawCenter();
    if (!tabOverlay.hidden) showTab(true);
  };
  let phaseEndsAt = 0;
  let mode: Mode = 'rounds';

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
    const startBtn = el('button', { type: 'button', class: 'primary big', onclick: () => act.start(bots, mode) }, r.phase === 'end' ? 'Jogar de novo' : 'Começar partida');
    if (humans + bots < 2) startBtn.setAttribute('disabled', '');
    const modes: [Mode, string, string][] = [
      ['rounds', 'Rodadas', `O último vivo ganha a rodada. Vence quem fizer ${WINS_TO_WIN} rodadas.`],
      ['deathmatch', 'Deathmatch', `Rodadas de 60 s, quem cai volta em 10 s. Cada abate vale 1 ponto; vence quem chegar a ${DM_KILLS_TO_WIN}.`],
    ];
    const modePicker = el('div', { class: 'mode' },
      el('div', { class: 'stats-tabs', role: 'group', 'aria-label': 'Modo de jogo' }, ...modes.map(([k, label]) =>
        el('button', { type: 'button', 'aria-pressed': String(k === mode), class: k === mode ? 'on' : '', onclick: () => {
          mode = k;
          drawCenter();
        } }, label))),
      el('small', { class: 'muted' }, modes.find(([k]) => k === mode)![2]));
    return el('div', { class: 'card' },
      r.phase === 'end'
        ? el('div', {}, el('h2', { class: 'title' }, r.winner ? `🏆 ${r.players.find((p) => p.id === r.winner)?.name ?? '?'} venceu!` : 'Partida encerrada'), r.winner ? null : el('p', { class: 'muted' }, 'Ninguém jogou por um tempo e a partida foi encerrada.'), board(r, me, act.kick), statsBoard(r, me, scope, setScope))
        : el('div', {}, el('h2', { class: 'title' }, 'Sala ' + r.id), el('p', { class: 'muted' }, 'Mande o link para os amigos entrarem. Até 8 magos.'),
            el('ul', { class: 'board' }, ...r.players.map((p) => el('li', {}, el('span', {}, dot(p.color), ' ', nameOf(p, me), p.connected || p.bot ? '' : ' · caiu'), kickBtn(p, act.kick))))),
      picker(r),
      modePicker,
      el('div', { class: 'bots' }, el('span', {}, 'Bots'), el('button', { type: 'button', onclick: () => set(bots - 1) }, '−'), count, el('button', { type: 'button', onclick: () => set(bots + 1) }, '+')),
      startBtn,
      el('button', { type: 'button', onclick: copyLink }, 'Copiar link da sala'),
    );
  }

  function shopPanel(r: PublicRoom) {
    const mine = r.players.find((p) => p.id === me);
    // desfazer: só o que foi comprado nesta loja (devolve o ouro)
    const undoBtn = (key: string) => (mine?.bought.includes(key) ? el('button', { type: 'button', class: 'undo', title: 'Desfazer a compra (devolve o ouro)', 'aria-label': 'Desfazer a compra', 'data-key': 'undo-' + key, onclick: () => act.undo(key) }, '↩') : null);
    if (!mine) return el('div', { class: 'card' }, el('p', {}, 'Você está assistindo. Entra na próxima partida.'));
    // vender: magia ou item inteiro; o comprado nesta loja volta inteiro, o de antes pela metade
    const sellBtn = (key: string) => {
      const value = sellValue(mine, mine.bought, key);
      return value > 0 ? el('button', { type: 'button', class: 'sell', title: 'Vende tudo; o comprado em rodadas anteriores volta pela metade', 'data-key': 'sell-' + key, onclick: () => act.sell(key) }, `Vender · ${value}`) : null;
    };
    // duas colunas: compras à esquerda; ouro, Pronto, placar e personagem à direita (pedido do Fernando: loja mais larga)
    return el('div', { class: 'card shop' }, el('div', { class: 'shop-main' },
      el('div', { class: 'shop-head' }, el('h2', { class: 'title' }, r.round === 0 ? 'Loja' : `Loja · depois da rodada ${r.round}`), el('small', {}, `${spellCount(mine.spells)} de ${MAX_SPELLS} magias`)),
      el('div', { class: 'shop-grid' }, ...SPELL_IDS.map((s) => {
        const lvl = mine.spells[s];
        const price = priceOf(s, lvl);
        const full = lvl === 0 && spellCount(mine.spells) >= MAX_SPELLS;
        const label = price === null ? 'Máximo' : full ? `Limite de ${MAX_SPELLS} magias` : lvl === 0 ? `Comprar · ${price}` : `Nível ${lvl + 1} · ${price}`;
        return withTip(el('div', { class: 'shop-item' + (lvl ? ' owned' : '') + (full ? ' locked' : '') },
          el('div', { class: 'shop-title' }, el('span', { class: 'ico' }, ICON[s]), el('b', {}, SPELLS[s].name), el('span', { class: 'key' }, labelOf(s))),
          el('small', {}, RULES_SHORT[s]),
          el('span', { class: 'pips' }, ...Array.from({ length: MAX_SPELL_LEVEL }, (_, n) => el('i', { class: n < lvl ? 'on' : '' }))),
          el('div', { class: 'buy-row' }, el('button', { type: 'button', 'data-key': 'spell-' + s, disabled: price === null || full || mine.gold < price, onclick: () => act.buy(s) }, label), undoBtn('spell:' + s), sellBtn('spell:' + s)),
        ), () => spellTip(s, lvl));
      })),
      el('div', { class: 'shop-head' }, el('h3', {}, 'Itens'), el('small', {}, `${ITEM_IDS.filter((i) => mine.items[i] > 0).length} de ${MAX_ITEMS}`)),
      el('div', { class: 'shop-grid' }, ...ITEM_IDS.map((i) => {
        const lvl = mine.items[i];
        const max = ITEMS[i].levels.length;
        const price = itemPrice(mine.items, i);
        const label = lvl >= max ? 'Máximo' : price === null ? 'Sem espaço' : lvl === 0 ? `Comprar · ${price}` : `Nível ${lvl + 1} · ${price}`;
        return withTip(el('div', { class: 'shop-item' + (lvl ? ' owned' : '') },
          el('div', { class: 'shop-title' }, el('span', { class: 'ico' }, ITEM_ICON[i]), el('b', {}, ITEMS[i].name), ITEMS[i].key ? el('span', { class: 'key' }, labelOf(i)) : null),
          el('small', {}, ITEMS[i].text),
          el('span', { class: 'pips' }, ...ITEMS[i].levels.map((_, n) => el('i', { class: n < lvl ? 'on' : '' }))),
          el('div', { class: 'buy-row' }, el('button', { type: 'button', 'data-key': 'item-' + i, disabled: price === null || mine.gold < price, onclick: () => act.buyItem(i) }, label), undoBtn('item:' + i), sellBtn('item:' + i)),
        ), () => itemTip(i, lvl));
      })),
      el('div', { class: 'shop-head' }, el('h3', {}, 'Maestrias'), el('small', {}, `${MASTERY_COST} de ouro por nível · as três por ${MASTERY_ALL_COST}`)),
      el('div', { class: 'shop-grid' }, ...MASTERY_IDS.map((k) => {
        const lvl = mine.masteries[k];
        return withTip(el('div', { class: 'shop-item' + (lvl ? ' owned' : '') },
          el('div', { class: 'shop-title' }, el('b', {}, MASTERIES[k].name)),
          el('small', {}, MASTERIES[k].text),
          el('span', { class: 'pips' }, ...Array.from({ length: MASTERY_MAX }, (_, n) => el('i', { class: n < lvl ? 'on' : '' }))),
          el('div', { class: 'buy-row' }, el('button', { type: 'button', 'data-key': 'mastery-' + k, disabled: lvl >= MASTERY_MAX || mine.gold < MASTERY_COST, onclick: () => act.buyMastery(k) }, lvl >= MASTERY_MAX ? 'Máximo' : `Nível ${lvl + 1} · ${MASTERY_COST}`), undoBtn('mastery:' + k)),
        ), () => masteryTip(k, lvl));
      }), el('div', { class: 'shop-item' },
        el('div', { class: 'shop-title' }, el('b', {}, 'As três')),
        el('small', {}, 'Sobe Duração, Alcance e Roubo de vida um nível cada.'),
        el('div', { class: 'buy-row' }, el('button', { type: 'button', 'data-key': 'mastery-all', disabled: MASTERY_IDS.some((k) => mine.masteries[k] >= MASTERY_MAX) || mine.gold < MASTERY_ALL_COST, onclick: () => act.buyMastery('all') }, `Subir as três · ${MASTERY_ALL_COST}`), undoBtn('mastery:all')),
      )),
      el('h3', {}, 'Placar'),
      statsBoard(r, me, scope, setScope),
      ),
      el('aside', { class: 'shop-side' },
        el('span', { class: 'gold big' }, `🪙 ${mine.gold}`),
        goldInfo(mine),
        el('button', { type: 'button', class: 'primary big', disabled: mine.ready, onclick: act.ready }, mine.ready ? 'Esperando os outros…' : 'Pronto'),
        board(r, me, act.kick),
        picker(r),
      ),
    );
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
    const next: Mode = r.mode === 'rounds' ? 'deathmatch' : 'rounds';
    votePanel.replaceChildren(el('b', {}, 'Votação'),
      v ? el('small', { class: 'muted' }, 'Já tem uma votação aberta.') : '',
      r.pendingMode ? '' : el('button', { type: 'button', disabled: !!v, onclick: close(() => act.vote('mode')) }, `Trocar para ${MODE_NAME[next]}`),
      ...r.players.filter((p) => !p.bot && p.id !== me).map((p) =>
        el('button', { type: 'button', disabled: !!v, onclick: close(() => act.vote('kick', p.id)) }, `Expulsar ${p.name}`)),
      el('small', { class: 'muted' }, 'Passa com mais da metade dos jogadores. O modo novo vale na próxima rodada e zera os pontos; o ouro fica.'));
    // fim da votação: aprovada se o modo da próxima rodada mudou ou se o alvo saiu da sala
    const was = prev?.vote;
    if (was && !v) toast((was.kind === 'mode' ? r.pendingMode !== prev.pendingMode : !r.players.some((p) => p.id === was.target)) ? 'Votação aprovada.' : 'Votação recusada.');
    voteBar.hidden = !v;
    if (!v) return;
    voteEndsAt = performance.now() + v.left;
    const name = (id: string) => r.players.find((p) => p.id === id)?.name ?? '?';
    const can = human && !v.yes.includes(me) && !v.no.includes(me);
    voteBar.replaceChildren(
      el('span', {}, `${name(v.by)} quer ${v.kind === 'mode' ? 'trocar para ' + MODE_NAME[v.target as Mode] : 'expulsar ' + name(v.target)} · SIM ${v.yes.length} / precisa ${v.need}`),
      can ? el('button', { type: 'button', class: 'primary', onclick: () => act.ballot(true) }, 'Sim') : '',
      can ? el('button', { type: 'button', onclick: () => act.ballot(false) }, 'Não') : '',
      voteLeft,
    );
  }

  function drawCenter() {
    if (!room) return;
    const r = room;
    // redesenhar a loja não pode tirar o foco de quem usa o teclado
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.key;
    hideTip();
    center.classList.toggle('wide', r.phase === 'shop');
    center.replaceChildren(r.phase === 'lobby' || r.phase === 'end' ? lobbyPanel(r) : r.phase === 'shop' ? shopPanel(r) : '');
    if (focused) (center.querySelector(`[data-key="${focused}"]`) as HTMLElement | null)?.focus();
  }

  // lista do canto: pontos da partida e, ao vivo, abates e dano da rodada (somados no cliente a partir dos acertos)
  let live: Record<string, { dmg: number; kills: number }> = {};
  function drawPlayers() {
    if (!room) return;
    const head = el('li', { class: 'head' }, el('span', {}), el('span', {}), el('small', { title: 'Abates na rodada' }, '☠'), el('small', { title: 'Dano na rodada' }, '💥'), el('small', { title: room.mode === 'deathmatch' ? 'Pontos' : 'Vitórias' }, '🏆'));
    players.replaceChildren(head, ...[...room.players].sort((a, b) => b.score - a.score).map((p) =>
      el('li', { class: p.id === me ? 'me' : '' }, dot(p.color), el('span', {}, nameOf(p, me)), el('span', { class: 'live' }, String(live[p.id]?.kills ?? 0)), el('span', { class: 'live' }, String(Math.round(live[p.id]?.dmg ?? 0))), el('b', {}, String(p.score))),
    ));
  }

  return {
    live(stats: Record<string, { dmg: number; kills: number }>) {
      live = stats;
      drawPlayers();
    },
    update(r: PublicRoom, you: string, online: boolean) {
      // a loja abre mostrando a rodada que acabou; o fim mostra a partida inteira
      if (room && room.phase !== r.phase) scope = r.phase === 'end' ? 'match' : 'round';
      const prev = room;
      room = r;
      me = you;
      phaseEndsAt = performance.now() + r.phaseLeft;
      status.className = 'dot ' + (online ? 'on' : 'off');
      roundEl.textContent = [
        r.round > 0 && r.phase !== 'lobby' ? (r.mode === 'deathmatch' ? `Deathmatch · rodada ${r.round} · ${DM_KILLS_TO_WIN} abates para vencer` : `Rodada ${r.round} · vence quem fizer ${WINS_TO_WIN}`) : '',
        r.pendingMode && r.phase !== 'end' ? `Próxima rodada: ${MODE_NAME[r.pendingMode]}` : '',
      ].filter(Boolean).join(' · ');
      drawPlayers();
      mine = r.players.find((p) => p.id === you);
      for (const i of ACTIVE_ITEMS) itemButtons.get(i)!.b.hidden = !mine?.items[i];
      // barra da partida: só magias e itens equipados; passivos viram selos pequenos acima dela
      passives.replaceChildren(...ITEM_IDS.filter((i) => !ITEMS[i].key && (mine?.items[i] ?? 0) > 0).map((i) =>
        withTip(el('span', { class: 'passive', tabindex: 0, 'aria-label': ITEMS[i].name }, ITEM_ICON[i], el('small', {}, String(mine!.items[i]))), () => itemTip(i, mine?.items[i] ?? 0)),
      ));
      for (const s of SPELL_IDS) {
        const { b, pips } = buttons.get(s)!;
        const lvl = mine?.spells[s] ?? 0;
        b.hidden = lvl === 0;
        pips.replaceChildren(...Array.from({ length: MAX_SPELL_LEVEL }, (_, n) => el('i', { class: n < lvl ? 'on' : '' })));
      }
      barWrap.hidden = r.phase === 'lobby' || r.phase === 'end' || r.phase === 'shop' || !mine;
      drawVote(r, prev);
      drawCenter();
    },
    setOnline(on: boolean) {
      status.className = 'dot ' + (on ? 'on' : 'off');
    },
    // a cada quadro: recargas, magia escolhida e o relógio da fase
    frame(cd: number[], icd: number[], armed: string | null, shrinkIn: number | null, respawnIn: number) {
      ACTIVE_ITEMS.forEach((i, k) => {
        const { b, cd: c } = itemButtons.get(i)!;
        const left = icd[k] ?? 0;
        c.textContent = left > 0.05 ? left.toFixed(left < 1 ? 1 : 0) : '';
        b.classList.toggle('cooling', left > 0.05);
        b.classList.toggle('armed', armed === i);
      });
      SPELL_IDS.forEach((s, i) => {
        const { b, cd: c } = buttons.get(s)!;
        const left = cd[i] ?? 0;
        c.textContent = left > 0.05 ? left.toFixed(left < 1 ? 1 : 0) : '';
        b.classList.toggle('cooling', left > 0.05);
        b.classList.toggle('armed', armed === s);
      });
      if (!room) return;
      const left = Math.max(0, (phaseEndsAt - performance.now()) / 1000);
      timer.textContent =
        room.phase === 'shop' ? `Rodada começa em ${Math.ceil(left)} s`
        : room.phase === 'countdown' ? String(Math.max(1, Math.ceil(left)))
        : room.phase === 'playing' && room.mode === 'deathmatch' ? `Rodada termina em ${Math.ceil(left)} s`
        : '';
      voteLeft.textContent = room.vote ? `${Math.max(0, Math.ceil((voteEndsAt - performance.now()) / 1000))} s` : '';
      respawn.textContent = room.phase === 'playing' && respawnIn > 0 ? `Você volta em ${Math.ceil(respawnIn)} s` : '';
      timer.className = 'timer ' + room.phase;
    },
  };
}

const RULES_SHORT: Record<SpellId, string> = {
  fireball: 'Projétil reto. Dano e empurrão médios.',
  lightning: 'Instantâneo. Acerta o primeiro na linha.',
  homing: 'Lento, persegue o alvo mais perto da mira.',
  shield: 'Reflete fogo, míssil e raio por 1,2 s.',
  teleport: 'Salta até o cursor (alcance curto).',
  swap: 'Voa até o alcance e troca de lugar com o primeiro mago que tocar; sem ninguém, leva você ao ponto da mira.',
  grip: 'Prende o alvo no lugar e reduz o empurrão dele.',
  meteor: 'Cai em área no ponto marcado, após 1 s.',
  rush: 'Avança 3 m na direção do mouse e fica mais rápido; dano levado vira mais velocidade.',
  cluster: 'Quatro projéteis em leque, curto alcance.',
};
