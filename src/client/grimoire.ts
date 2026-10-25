// Grimoire (Fernando's request, 18/10): "How to play" became an open book with a table of contents, one page per spell and item
// and an animated demo running the real simulation (demo.ts). Two pages on desktop, one on mobile; ← → or a swipe turn pages.
// Lives in the main menu's Learn tab and, inside a match, in a dialog (F1 or the "?" button). Loaded on demand
// (dynamic import in ui.ts) so it does not weigh on game startup.
import { ARENA_IDS, SHAPES, type ArenaId } from '../shared/arena.ts';
import { ARENA_R0, HP_MAX, RUNE_KINDS } from '../shared/constants.ts';
import { ITEMS, ITEM_IDS, type ItemId } from '../shared/items.ts';
import { SPELLS, type SpellId } from '../shared/spells.ts';
import { SCRIPTS, createDemo, drawStone, runDemo, type DemoId } from './demo.ts';
import { ICON, ITEM_ICON, MECHANIC_ICON, RUNE_ICON, UI_ICON, actionIcon, actionName, choice, el, icon } from './icons.ts';
import { ACTIONS, UI_ACTIONS, UI_NAMES, isPadMode, isSlotMode, isUiKey, labelOf, uiLabel } from './keys.ts';
import { MODE_INFO, OPT_INFO } from './opt-info.ts';
import { ITEM_DEMO, MECHANIC_GUIDES, NEGATIVE_GUIDES, RULES, RULES_SHORT, SPELL_GROUPS, SPELL_TIPS, SPELL_USE, groupClass, n1, type GuideId } from './rules-text.ts';
import { COLORS } from './scene.ts';
import { hideTip, itemLevels, itemTip, mechanicTip, spellLevels, spellTip, withTip } from './tips.ts';
import { dialog, norm, searchFilter } from './ui.ts';
import { arenaName, itemName, itemText, spellName, t } from './i18n.ts';

// ref: the spell, item, mechanic or status a link opens (goTo) and the Learn tab marks in the library
type Ref = SpellId | ItemId | GuideId;
type Page = { chapter: string; title: string; body: () => (Node | string | null)[]; demo?: DemoId; ref?: Ref };

const html = (s: string) => Object.assign(document.createElement('div'), { className: 'g-html', innerHTML: s });
const ul = (xs: string[]) => el('ul', {}, ...xs.map((x) => el('li', {}, x)));
const LEGEND = t(
  `Dano: vida que tira (cada mago tem ${HP_MAX}). Empurrão: deslocamento de referência sem resistência; dano histórico não amplifica a força. Recarga: segundos até lançar de novo. Alcance e raio em metros (a arena de 4 magos tem ${n1(ARENA_R0)} m de raio).`,
  `Damage: health it takes away (each wizard has ${HP_MAX}). Knockback: reference displacement without resistance; historical damage does not amplify force. Cooldown: seconds until you can cast again. Range and radius in meters (the 4-wizard arena has a ${n1(ARENA_R0)} m radius).`,
);
// capítulos: o texto mostrado também serve de chave nas comparações abaixo
const CH = {
  toc: t('Sumário', 'Contents'), spells: t('Magias', 'Spells'), items: t('Itens', 'Items'), statuses: t('Status negativos', 'Negative statuses'),
};
// a spell off the bar has no key in Q W E R D F mode nor on the controller (the bar slot decides)
const keyText = (a: SpellId) => labelOf(a) !== '—' ? t(`tecla ${labelOf(a)}`, `key ${labelOf(a)}`) : isSlotMode() || isPadMode() ? t('tecla pela posição na barra', 'key by position in the bar') : t('sem tecla (escolha em Configurações > Lançamento)', 'no key (pick one in Settings > Casting)');

// contorno da arena num canvas pequeno (página das arenas)
function arenaThumb(id: ArenaId): HTMLElement {
  const c = el('canvas', { width: 120, height: 120, 'aria-hidden': 'true' }) as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  const k = 54 / SHAPES[id].reach;
  g.setTransform(k, 0, 0, k, 60, 60);
  drawStone(g, id, 1, 0.04);
  return el('figure', { class: 'g-arena' }, c, el('figcaption', {}, arenaName(id)));
}

function spellPage(id: SpellId, group: string): Page {
  const sp = SPELLS[id];
  return {
    chapter: CH.spells, title: spellName(id), demo: id, ref: id,
    body: () => [
      el('div', { class: 'g-head' }, el('span', { class: 'g-medal' }, icon(ICON[id])),
        el('div', {}, el('h2', {}, spellName(id)), el('small', {}, `${group} · ${keyText(id)} · ${sp.cost ? t(`${sp.cost} de ouro`, `${sp.cost} gold`) : t('grátis no começo', 'free at the start')}`))),
      el('p', { class: 'g-lead' }, RULES_SHORT[id], ' ', el('i', {}, SPELL_USE[id])),
      null, // lugar da demonstração
      el('h3', {}, t('Números por nível', 'Numbers by level')), html(spellLevels(id)), el('small', { class: 'g-legend' }, LEGEND),
      el('h3', {}, t('Como usar', 'How to use')), el('p', {}, SPELL_TIPS[id][0]),
      el('h3', {}, t('Contra o quê', 'Best against')), el('p', {}, SPELL_TIPS[id][1]),
    ],
  };
}

function itemPage(id: ItemId): Page {
  const it = ITEMS[id];
  return {
    chapter: CH.items, title: itemName(id), demo: SCRIPTS[id] ? id : undefined, ref: id,
    body: () => [
      el('div', { class: 'g-head' }, el('span', { class: 'g-medal item' }, icon(ITEM_ICON[id])),
        el('div', {}, el('h2', {}, itemName(id)), el('small', {}, `${t('passivo', 'passive')} · ${t(`${it.cost} de ouro por nível`, `${it.cost} gold per level`)}`))),
      el('p', { class: 'g-lead' }, itemText(id)),
      ITEM_DEMO[id] ? el('p', { class: 'muted' }, ITEM_DEMO[id]) : null,
      null,
      el('h3', {}, t('Números por nível', 'Numbers by level')), html(itemLevels(id)),
    ],
  };
}

// items como função: textos que mostram as teclas e botões atuais (trocáveis), lidos a cada vez que a página abre
const text = (chapter: string, title: string, items: string[] | (() => string[]), extra: () => (Node | null)[] = () => []): Page => ({ chapter, title, body: () => [el('h2', {}, title), ul(typeof items === 'function' ? items() : items), ...extra()] });

const PAGES: Page[] = [
  // as duas primeiras páginas são o sumário (montado em toc(), que precisa do go)
  { chapter: CH.toc, title: CH.toc, body: () => [] },
  { chapter: CH.toc, title: t('Magias e itens', 'Spells and items'), body: () => [] },
  text(t('Como jogar', 'How to play'), t('Objetivo', 'Goal'), RULES.objetivo),
  text(t('Como jogar', 'How to play'), t('Empurrão, lava e abates', 'Knockback, lava and kills'), RULES.empurrao),
  text(t('Controles', 'Controls'), t('No PC', 'On PC'), () => RULES.pc),
  ...MECHANIC_GUIDES.map((g): Page => ({ ...text(t('Controles', 'Controls'), g.title, [g.text]), demo: g.id, ref: g.id })),
  {
    chapter: t('Controles', 'Controls'), title: t('Suas teclas', 'Your keys'),
    body: () => [el('h2', {}, isSlotMode() ? t('Suas teclas (Q W E R D F pela ordem da barra)', 'Your keys (Q W E R D F in bar order)') : t('Suas teclas', 'Your keys')),
      el('div', { class: 'keys-grid' }, ...ACTIONS.map((a) => el('span', {}, el('span', { class: 'key' }, labelOf(a)), ' ', icon(actionIcon(a)), ' ', actionName(a)))),
      el('h3', {}, t('Atalhos', 'Shortcuts')),
      el('div', { class: 'keys-grid' }, ...UI_ACTIONS.map((a) => el('span', {}, el('span', { class: 'key' }, uiLabel(a)), ' ', UI_NAMES[a])), el('span', {}, el('span', { class: 'key' }, 'Esc'), ' ', t('Configurações', 'Settings'))),
      el('small', {}, t('Troque as de magias e itens em Configurações > Lançamento e as dos atalhos em Configurações > Teclas (Esc ou a engrenagem no topo).', 'Change spell and item keys in Settings > Casting and shortcut keys in Settings > Keys (Esc or the gear at the top).'))],
  },
  text(t('Controles', 'Controls'), t('No celular', 'On mobile'), RULES.celular),
  text(t('Controles', 'Controls'), t('Com controle', 'With a controller'), () => RULES.controle),
  ...NEGATIVE_GUIDES.map((g): Page => ({ ...text(CH.statuses, g.title, [g.text]), ref: g.id })),
  text(t('Modos', 'Modes'), t('Rodadas', 'Rounds'), RULES.rodadas, () => [html(MODE_INFO())]),
  text(t('Modos', 'Modes'), 'Deathmatch', RULES.deathmatch),
  text(t('Modos', 'Modes'), t('Times', 'Teams'), RULES.times),
  text(t('Modos', 'Modes'), t('Opções, votações e bots', 'Options, votes and bots'), RULES.opcoes, () => [el('h3', {}, t('Dificuldade dos bots', 'Bot difficulty')), html(OPT_INFO.difficulty('rounds'))]),
  text('Arenas', t('Arenas e obstáculos', 'Arenas and obstacles'), RULES.arenas, () => [el('div', { class: 'g-arenas' }, ...ARENA_IDS.map(arenaThumb)), html(OPT_INFO.arena('rounds'))]),
  text(t('Loja e ouro', 'Shop and gold'), t('Loja', 'Shop'), () => RULES.loja),
  text(t('Loja e ouro', 'Shop and gold'), t('Ouro', 'Gold'), RULES.ouro),
  ...SPELL_GROUPS.flatMap(([group, , ids]) => ids.map((id) => spellPage(id, group))),
  ...ITEM_IDS.map(itemPage),
  text(t('Runas', 'Runes'), t('Runas', 'Runes'), RULES.runas, () => [el('ul', { class: 'g-runes' }, ...RUNE_KINDS.map((k) => el('li', {}, icon(RUNE_ICON[k]), ' ', RULES.runa[k])))]),
  { ...text(t('Chão dos choques', 'Clash zones'), t('Chão dos choques', 'Clash zones'), RULES.choques), demo: 'clash' },
  text(t('Dicas', 'Tips'), t('Dicas', 'Tips'), RULES.dicas),
  text(t('Dicas', 'Tips'), t('Créditos', 'Credits'), RULES.creditos),
];
const CHAPTERS = [...new Set(PAGES.map((p) => p.chapter))].slice(1);
const pageOf = (pred: (p: Page) => boolean) => PAGES.findIndex(pred);

// grimoire in a dialog, for use inside a match (in the main menu it lives in the Learn tab)
export function openGrimoire(to?: Ref) {
  document.querySelector('.grimoire-overlay')?.remove();
  const book = grimoire();
  book.goTo(to);
  dialog('grimoire', t('Grimório', 'Grimoire'), [book.root], { ico: UI_ICON.help, onKey: book.onKey, onClose: book.dispose });
}

// page of a spell, item, mechanic or status (0 = table of contents)
const pageFor = (to?: Ref) => Math.max(to ? pageOf((p) => p.ref === to) : 0, 0);

// The book as a standalone piece: the Learn tab puts it on the page and a match puts it in a dialog (openGrimoire).
// Reopening always starts at the table of contents (Fernando's decision, 24/10); explicit links via goTo open the requested page.
// side (Learn tab, Fernando's decision of 24/10): a fixed side contents replaces pages 1 and 2, which only repeated it and the library;
// onShow tells which refs are on view so the library can mark them
export function grimoire(o: { side?: boolean; onShow?: (refs: Ref[]) => void } = {}) {
  const min = o.side ? 2 : 0; // pages 1 and 2 are the contents
  let at = min;
  const wide = matchMedia('(min-width: 900px)');
  const ac = new AbortController();
  let live: object[] = []; // demos da vista atual

  const spread = el('div', { class: 'g-spread' });
  const where = el('span', { class: 'g-where', 'aria-live': 'polite' }); // screen readers hear the page change
  const prev = el('button', { type: 'button', class: 'g-turn', 'aria-label': t('Página anterior', 'Previous page'), onclick: () => turn(-1) }, '‹') as HTMLButtonElement;
  const next = el('button', { type: 'button', class: 'g-turn', 'aria-label': t('Próxima página', 'Next page'), onclick: () => turn(1) }, '›') as HTMLButtonElement;
  const nav = el('nav', { class: 'g-nav' }, prev, o.side ? null : el('button', { type: 'button', class: 'g-toc-btn', onclick: () => go(0) }, CH.toc), where, next);
  const chapterBtns = o.side ? CHAPTERS.map((c) => el('button', { type: 'button', onclick: () => {
    go(pageOf((p) => p.chapter === c));
    root.focus({ preventScroll: true }); // ← → keep turning pages after a click in the contents
  } }, c)) : [];
  const contents = o.side ? el('section', { class: 'learn-toc' }, el('h2', {}, CH.toc), el('nav', { class: 'settings-toc', 'aria-label': CH.toc }, ...chapterBtns)) : null;

  // página 1: capítulos com o número da página; página 2: atalho para cada magia (por grupo) e cada item
  function toc(i: number): (Node | string)[] {
    const link = (to: number, label: string) => el('button', { type: 'button', class: 'g-link', onclick: () => go(to) }, label, el('span', { class: 'g-pg' }, String(to + 1)));
    const chip = (to: number, ico: string, name: string) => el('button', { type: 'button', class: 'g-chip', onclick: () => go(to) }, icon(ico), ' ', name);
    if (i === 0) return [el('h2', {}, CH.toc), el('ol', { class: 'g-toc' }, ...CHAPTERS.map((c) => el('li', {}, link(pageOf((p) => p.chapter === c), c))))];
    return [
      el('h2', {}, t('Magias e itens', 'Spells and items')),
      ...SPELL_GROUPS.map(([g, hint, ids]) => el('div', { class: 'g-sub ' + groupClass(g) }, el('small', {}, `${g} · ${hint}`),
        el('div', { class: 'g-chips' }, ...ids.map((id) => chip(pageOf((p) => p.chapter === CH.spells && p.demo === id), ICON[id], spellName(id)))))),
      el('div', { class: 'g-sub' }, el('small', {}, CH.items),
        el('div', { class: 'g-chips' }, ...ITEM_IDS.map((id) => chip(pageOf((p) => p.chapter === CH.items && p.title === itemName(id)), ITEM_ICON[id], itemName(id))))),
    ];
  }

  function render(i: number): HTMLElement {
    const p = PAGES[i];
    if (!p) return el('article', { class: 'g-page blank' });
    const body = p.chapter === CH.toc ? toc(i) : p.body();
    if (p.demo) {
      const canvas = el('canvas', { class: 'g-demo', role: 'img', 'aria-label': t(`Demonstração: ${p.title}`, `Demo: ${p.title}`) }) as HTMLCanvasElement;
      const fig = el('figure', { class: 'g-fig' }, canvas, el('figcaption', {}, t('Simulação do jogo com os números de agora (nível 1); recomeça sozinha.', 'Game simulation with the current numbers (level 1); it restarts on its own.')));
      const slot = body.indexOf(null);
      if (slot >= 0) body[slot] = fig;
      else body.push(fig);
      const d = createDemo(canvas, p.demo, [COLORS[0], COLORS[1], COLORS[2]]);
      live.push(d);
      // leaves the DOM (✕, Esc or the gamepad B close the dialog) or the page turns: stops; with the Learn tab hidden it only pauses
      runDemo((now) => root.closest('[hidden]') || d.tick(now), () => root.isConnected && live.includes(d));
    }
    return el('article', { class: 'g-page', 'aria-label': t(`Página ${i + 1}: ${p.title}`, `Page ${i + 1}: ${p.title}`) },
      p.chapter !== CH.toc ? el('small', { class: 'g-chapter' }, p.chapter) : null, ...body, el('span', { class: 'g-num' }, String(i + 1)));
  }

  const view = () => { const per = wide.matches ? 2 : 1; return [per, at - (at % per)]; }; // páginas na vista e a primeira dela
  function show(dir: number) {
    const [per, first] = view();
    live = [];
    // a clicked contents link is replaced and an end button gets disabled below; either drops focus to <body>,
    // so hand it back to the book and ← → keep working in the Learn tab
    const hadFocus = root.contains(document.activeElement);
    spread.replaceChildren(...Array.from({ length: per }, (_, k) => render(first + k)));
    spread.scrollTop = 0;
    spread.querySelectorAll('.g-page').forEach((p) => (p.scrollTop = 0));
    prev.disabled = first <= min;
    next.disabled = first + per >= PAGES.length;
    // Chrome moves focus off a disabled button only on the next rendering update, so check `disabled` too
    const active = document.activeElement as HTMLButtonElement | null;
    if (hadFocus && (!root.contains(active) || active?.disabled)) root.focus({ preventScroll: true });
    const shown = PAGES.slice(first, first + per);
    chapterBtns.forEach((b, i) => {
      const on = shown.some((p) => p.chapter === CHAPTERS[i]);
      b.classList.toggle('on', on);
      b.setAttribute('aria-current', String(on));
    });
    o.onShow?.(shown.flatMap((p) => (p.ref ? [p.ref] : [])));
    where.textContent = per === 2 && first + 1 < PAGES.length ? t(`${first + 1}–${first + 2} de ${PAGES.length}`, `${first + 1}–${first + 2} of ${PAGES.length}`) : t(`${first + 1} de ${PAGES.length}`, `${first + 1} of ${PAGES.length}`);
    if (dir) {
      spread.classList.remove('turn-next', 'turn-prev');
      void spread.offsetWidth; // reinicia a animação
      spread.classList.add(dir > 0 ? 'turn-next' : 'turn-prev');
    }
  }
  function go(i: number) {
    const to = Math.min(PAGES.length - 1, Math.max(min, i));
    const dir = Math.sign(to - at);
    at = to;
    show(dir);
  }
  function turn(step: number) {
    const [per, first] = view();
    if (first + step * per < min || first + step * per >= PAGES.length) return;
    go(first + step * per);
  }

  // in the dialog, ← → never reach the scoreboard or the spectator camera (it captures every key); in the tab, they work while the book has focus
  const onKey = (e: KeyboardEvent) => {
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown') turn(1);
    else if (k === 'ArrowLeft' || k === 'PageUp') turn(-1);
    else if (k === 'Home') go(min);
    else return;
    e.preventDefault();
  };
  const root = el('div', { class: 'g-book', tabindex: -1, onkeydown: onKey }, spread, nav);
  wide.addEventListener('change', () => (root.isConnected ? show(0) : ac.abort()), { signal: ac.signal });
  // deslizar o dedo para os lados vira a página (o rolar de cima para baixo continua com o navegador)
  let start: { x: number; y: number } | null = null;
  spread.addEventListener('pointerdown', (e) => (start = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY }));
  spread.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1);
  });
  spread.addEventListener('pointercancel', () => (start = null));

  show(0);
  return { root, contents, onKey, dispose: () => ac.abort(), goTo: (to?: Ref) => go(pageFor(to)) };
}

const FIXED = t('Ações fixas', 'Fixed actions');
// "Spells and items" library (Fernando's decision, 19/10; like Dota's heroes and items library): icon grid by group,
// search by name and filter by group; hovering shows the shop tooltip and a click opens the page in the grimoire (open).
// Lives in the main menu's Learn tab and in the hotkey overlay (F2 by default)
export function library(open: (id: Ref) => void): HTMLElement {
  const tile = (id: Ref, name: string, ico: string, tip: () => string) => withTip(el('button', { type: 'button', class: 'lib-tile', 'data-name': norm(name), 'data-ref': id, onclick: () => {
    hideTip();
    open(id);
  } }, el('span', { class: 'ico' }, icon(ico)), el('small', {}, name)), tip);
  // the group's one-line purpose used to live only on the book's page 2, which the Learn tab no longer shows
  const section = (key: string, title: string, hint: string | null, cls: string, tiles: HTMLElement[]) =>
    el('section', { class: 'lib-group ' + cls, 'data-filter': key }, el('h3', {}, title, hint ? el('small', {}, hint) : null), el('div', { class: 'lib-grid' }, ...tiles));
  const items = (ids: ItemId[]) => ids.map((i) => tile(i, itemName(i), ITEM_ICON[i], () => itemTip(i, 0)));
  // Attack and Hold ground first, as on the match bar (issue #401): every wizard has them, so they come before what is bought
  const fixedTiles = MECHANIC_GUIDES.map((g) => tile(g.id, g.title, MECHANIC_ICON[g.id], () => mechanicTip(g)));
  const groups = [
    section('fixed', FIXED, null, 'lib-fixed', fixedTiles),
    ...SPELL_GROUPS.map(([g, hint, ids]) => section(g, g, hint, groupClass(g), ids.map((s) => tile(s, spellName(s), ICON[s], () => spellTip(s, 0))))),
    section('items', CH.items, null, 'lib-items', items([...ITEM_IDS])),
  ];
  let only = 'all';
  const none = el('p', { class: 'muted', hidden: true }, t('Nada com esse nome.', 'Nothing with that name.'));
  const search = el('input', { type: 'search', class: 'lib-search', placeholder: t('Buscar pelo nome', 'Search by name'), 'aria-label': t('Buscar magia ou item pelo nome', 'Search spell or item by name'),
    oninput: () => apply() }) as HTMLInputElement;
  const filters = el('div', {});
  function apply() {
    filters.replaceChildren(choice(t('Grupo', 'Group'), [['all', t('Todos', 'All')], ['fixed', FIXED], ...SPELL_GROUPS.map(([g]): [string, string] => [g, g]), ['items', CH.items]], only, (k) => ((only = k), apply())));
    searchFilter(groups, '.lib-tile', search.value, (g) => only !== 'all' && g.dataset.filter !== only, true);
    none.hidden = groups.some((g) => !g.hidden);
  }
  apply();
  return el('div', { class: 'library' }, el('div', { class: 'lib-tools' }, search, filters), none, ...groups);
}

// a mesma biblioteca por cima de qualquer tela, só para consultar (no meio da partida também); Esc ou a mesma tecla fecham
export function openLibrary() {
  if (document.querySelector('.library-box')) return;
  const body = library((id) => (close(), openGrimoire(id)));
  const { close } = dialog('library-box', t('Magias e itens', 'Spells and items'), [body], {
    onKey: (e) => isUiKey(e.code, 'library') && (e.preventDefault(), close()),
    onClose: hideTip,
  });
  if (matchMedia('(pointer: fine)').matches) body.querySelector('input')!.focus(); // no toque o teclado da tela não sobe sozinho
}
