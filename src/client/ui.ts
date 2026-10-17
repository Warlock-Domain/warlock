// Telas em DOM: apelido, lista de salas, sala de espera, loja, barra de magias, placar e avisos.
import { MAX_PLAYERS, WINS_TO_WIN } from '../shared/constants.ts';
import { CHARACTERS, type CharacterId } from '../shared/characters.ts';
import type { PublicPlayer, PublicRoom } from '../shared/protocol.ts';
import { ACTIVE_ITEMS, ITEMS, ITEM_IDS, MAX_ITEMS, itemPrice, type ItemId } from '../shared/items.ts';
import { SPELLS, SPELL_IDS, priceOf, type SpellId } from '../shared/spells.ts';
import { hideTip, itemTip, spellTip, withTip } from './tips.ts';
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

export const ICON: Record<SpellId, string> = { fireball: '🔥', lightning: '⚡', homing: '🎯', shield: '🛡️', teleport: '✨' };
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
  start: (bots: number) => void;
  buy: (s: SpellId) => void;
  buyItem: (i: ItemId) => void;
  useItem: (i: ItemId) => void;
  pick: (c: CharacterId) => void;
  ready: () => void;
  spell: (s: SpellId) => void;
  toggleMute: () => boolean;
  toggleMusic: () => boolean;
  click: () => void;
  muted: () => boolean;
  musicOn: () => boolean;
};

const dot = (color: number) => el('span', { class: 'dot', style: `background:${COLORS[color]}` });
const nameOf = (p: PublicPlayer, me: string) => p.name + (p.id === me ? ' (você)' : '') + (p.bot ? ' 🤖' : '');

function board(room: PublicRoom, me: string) {
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  return el('ol', { class: 'board' }, ...sorted.map((p) =>
    el('li', { class: p.id === room.winner ? 'win' : '' }, el('span', {}, dot(p.color), ' ', nameOf(p, me), p.connected || p.bot ? '' : ' · caiu'), el('b', {}, `${p.score} ${p.score === 1 ? 'vitória' : 'vitórias'}`)),
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
  const muteBtn = el('button', { type: 'button', class: 'icon', title: 'Som', onclick: () => (muteBtn.textContent = act.toggleMute() ? '🔇' : '🔊') }, act.muted() ? '🔇' : '🔊');
  const musicBtn = el('button', { type: 'button', class: 'icon', title: 'Música', onclick: () => musicBtn.classList.toggle('off', !act.toggleMusic()) }, '🎵');
  musicBtn.classList.toggle('off', !act.musicOn());
  const top = el('div', { class: 'hud-top' },
    el('button', { type: 'button', class: 'code', title: 'Copiar link da sala', onclick: copyLink }, status, ' ', code),
    roundEl,
    el('div', { class: 'hud-right' }, musicBtn, muteBtn, el('button', { type: 'button', class: 'icon', title: 'Como jogar', onclick: showRules }, '?')),
  );
  const center = el('div', { class: 'center' });
  const timer = el('div', { class: 'timer' });
  const buttons = new Map<SpellId, { b: HTMLElement; cd: HTMLElement; pips: HTMLElement }>();
  let mine: PublicPlayer | undefined;
  const bar = el('div', { class: 'spellbar' }, ...SPELL_IDS.map((s) => {
    const cd = el('span', { class: 'cd' });
    const pips = el('span', { class: 'pips' });
    const b = withTip(el('button', { type: 'button', class: 'spell', 'aria-label': SPELLS[s].name, onclick: () => act.spell(s) },
      el('span', { class: 'key' }, SPELLS[s].key), el('span', { class: 'ico' }, ICON[s]), pips, cd), () => spellTip(s, mine?.spells[s] ?? 0));
    buttons.set(s, { b, cd, pips });
    return b;
  }));
  // itens ativos (teclas 1, 2 e 3) ao lado das magias; só aparecem se comprados
  const itemButtons = new Map<ItemId, { b: HTMLElement; cd: HTMLElement }>();
  for (const i of ACTIVE_ITEMS) {
    const cd = el('span', { class: 'cd' });
    const b = withTip(el('button', { type: 'button', class: 'spell item', 'aria-label': ITEMS[i].name, onclick: () => act.useItem(i) },
      el('span', { class: 'key' }, ITEMS[i].key!), el('span', { class: 'ico' }, ITEM_ICON[i]), cd), () => itemTip(i, mine?.items[i] ?? 0));
    b.hidden = true;
    itemButtons.set(i, { b, cd });
    bar.append(b);
  }
  root.replaceChildren(el('div', { class: 'hud' }, top, players, timer, center, bar), el('div', { class: 'labels', id: 'labels' }));
  // clique dos botões da sala e da loja
  root.addEventListener('click', (e) => (e.target as HTMLElement).closest('button') && act.click());

  function copyLink() {
    const url = location.href;
    navigator.clipboard?.writeText(url).then(() => toast('Link copiado. Mande no grupo!'), () => toast(url));
  }

  let room: PublicRoom | null = null;
  let me = '';
  let phaseEndsAt = 0;

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
    const startBtn = el('button', { type: 'button', class: 'primary big', onclick: () => act.start(bots) }, r.phase === 'end' ? 'Jogar de novo' : 'Começar partida');
    if (humans + bots < 2) startBtn.setAttribute('disabled', '');
    return el('div', { class: 'card' },
      r.phase === 'end'
        ? el('div', {}, el('h2', { class: 'title' }, r.winner ? `🏆 ${r.players.find((p) => p.id === r.winner)?.name ?? '?'} venceu!` : 'Partida encerrada'), r.winner ? null : el('p', { class: 'muted' }, 'Três rodadas seguidas sem ninguém sobrar.'), board(r, me))
        : el('div', {}, el('h2', { class: 'title' }, 'Sala ' + r.id), el('p', { class: 'muted' }, 'Mande o link para os amigos entrarem. Até 8 magos.'),
            el('ul', { class: 'board' }, ...r.players.filter((p) => !p.bot).map((p) => el('li', {}, el('span', {}, dot(p.color), ' ', nameOf(p, me)))))),
      picker(r),
      el('div', { class: 'bots' }, el('span', {}, 'Bots'), el('button', { type: 'button', onclick: () => set(bots - 1) }, '−'), count, el('button', { type: 'button', onclick: () => set(bots + 1) }, '+')),
      startBtn,
      el('button', { type: 'button', onclick: copyLink }, 'Copiar link da sala'),
    );
  }

  function shopPanel(r: PublicRoom) {
    const mine = r.players.find((p) => p.id === me);
    if (!mine) return el('div', { class: 'card' }, el('p', {}, 'Você está assistindo. Entra na próxima partida.'));
    return el('div', { class: 'card shop' },
      el('div', { class: 'shop-head' }, el('h2', { class: 'title' }, r.round === 0 ? 'Loja' : `Loja · depois da rodada ${r.round}`), el('span', { class: 'gold' }, `🪙 ${mine.gold}`)),
      el('div', { class: 'shop-grid' }, ...SPELL_IDS.map((s) => {
        const lvl = mine.spells[s];
        const price = priceOf(s, lvl);
        const label = price === null ? 'Máximo' : lvl === 0 ? `Comprar · ${price}` : `Nível ${lvl + 1} · ${price}`;
        return withTip(el('div', { class: 'shop-item' + (lvl ? ' owned' : '') },
          el('div', { class: 'shop-title' }, el('span', { class: 'ico' }, ICON[s]), el('b', {}, SPELLS[s].name), el('span', { class: 'key' }, SPELLS[s].key)),
          el('small', {}, RULES_SHORT[s]),
          el('span', { class: 'pips' }, ...[1, 2, 3].map((n) => el('i', { class: n <= lvl ? 'on' : '' }))),
          el('button', { type: 'button', 'data-key': 'spell-' + s, disabled: price === null || mine.gold < price, onclick: () => act.buy(s) }, label),
        ), () => spellTip(s, lvl));
      })),
      el('div', { class: 'shop-head' }, el('h3', {}, 'Itens'), el('small', {}, `${ITEM_IDS.filter((i) => mine.items[i] > 0).length} de ${MAX_ITEMS}`)),
      el('div', { class: 'shop-grid' }, ...ITEM_IDS.map((i) => {
        const lvl = mine.items[i];
        const max = ITEMS[i].levels.length;
        const price = itemPrice(mine.items, i);
        const label = lvl >= max ? 'Máximo' : price === null ? 'Sem espaço' : lvl === 0 ? `Comprar · ${price}` : `Nível ${lvl + 1} · ${price}`;
        return withTip(el('div', { class: 'shop-item' + (lvl ? ' owned' : '') },
          el('div', { class: 'shop-title' }, el('span', { class: 'ico' }, ITEM_ICON[i]), el('b', {}, ITEMS[i].name), ITEMS[i].key ? el('span', { class: 'key' }, ITEMS[i].key!) : null),
          el('small', {}, ITEMS[i].text),
          el('span', { class: 'pips' }, ...ITEMS[i].levels.map((_, n) => el('i', { class: n < lvl ? 'on' : '' }))),
          el('button', { type: 'button', 'data-key': 'item-' + i, disabled: price === null || mine.gold < price, onclick: () => act.buyItem(i) }, label),
        ), () => itemTip(i, lvl));
      })),
      picker(r),
      el('button', { type: 'button', class: 'primary big', disabled: mine.ready, onclick: act.ready }, mine.ready ? 'Esperando os outros…' : 'Pronto'),
      board(r, me),
    );
  }

  function drawCenter() {
    if (!room) return;
    const r = room;
    // redesenhar a loja não pode tirar o foco de quem usa o teclado
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.key;
    hideTip();
    center.replaceChildren(r.phase === 'lobby' || r.phase === 'end' ? lobbyPanel(r) : r.phase === 'shop' ? shopPanel(r) : '');
    if (focused) (center.querySelector(`[data-key="${focused}"]`) as HTMLElement | null)?.focus();
  }

  return {
    update(r: PublicRoom, you: string, online: boolean) {
      room = r;
      me = you;
      phaseEndsAt = performance.now() + r.phaseLeft;
      status.className = 'dot ' + (online ? 'on' : 'off');
      roundEl.textContent = r.round > 0 && r.phase !== 'lobby' ? `Rodada ${r.round} · vence quem fizer ${WINS_TO_WIN}` : '';
      players.replaceChildren(...[...r.players].sort((a, b) => b.score - a.score).map((p) =>
        el('li', { class: p.id === you ? 'me' : '' }, dot(p.color), el('span', {}, nameOf(p, you)), el('b', {}, String(p.score))),
      ));
      mine = r.players.find((p) => p.id === you);
      for (const i of ACTIVE_ITEMS) itemButtons.get(i)!.b.hidden = !mine?.items[i];
      for (const s of SPELL_IDS) {
        const { b, pips } = buttons.get(s)!;
        const lvl = mine?.spells[s] ?? 0;
        b.classList.toggle('locked', lvl === 0);
        pips.replaceChildren(...[1, 2, 3].map((n) => el('i', { class: n <= lvl ? 'on' : '' })));
      }
      bar.hidden = r.phase === 'lobby' || r.phase === 'end' || r.phase === 'shop' || !mine;
      drawCenter();
    },
    setOnline(on: boolean) {
      status.className = 'dot ' + (on ? 'on' : 'off');
    },
    // a cada quadro: recargas, magia escolhida e o relógio da fase
    frame(cd: number[], icd: number[], armed: string | null, shrinkIn: number | null) {
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
        : room.phase === 'playing' && shrinkIn !== null ? `A arena encolhe em ${Math.max(0, Math.ceil(shrinkIn))} s`
        : '';
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
};
