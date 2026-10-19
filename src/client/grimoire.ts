// Grimório (pedido do Fernando, 18/10): o "Como jogar" virou um livro aberto com sumário, uma página por magia e por item
// e demonstração animada rodando a simulação de verdade (demo.ts). Duas páginas no PC, uma no celular; ← → ou deslizar viram.
// Carregado sob demanda pelo botão "?" (import dinâmico em ui.ts), para não pesar o começo do jogo.
import { ARENA_IDS, ARENA_NAMES, SHAPES, type ArenaId } from '../shared/arena.ts';
import { ARENA_R0, HP_MAX, RUNE_KINDS } from '../shared/constants.ts';
import { ITEMS, ITEM_IDS, type ItemId } from '../shared/items.ts';
import { SPELLS, type SpellId } from '../shared/spells.ts';
import { SCRIPTS, createDemo, type DemoId } from './demo.ts';
import { ICON, ITEM_ICON, RUNE_ICON, UI_ICON, actionIcon, actionName, icon } from './icons.ts';
import { ACTIONS, UI_ACTIONS, UI_NAMES, isPadMode, isSlotMode, labelOf, uiLabel } from './keys.ts';
import { MODE_INFO, OPT_INFO } from './opt-info.ts';
import { ITEM_DEMO, RULES, RULES_SHORT, SPELL_GROUPS, SPELL_TIPS, SPELL_USE, n1 } from './rules-text.ts';
import { COLORS } from './scene.ts';
import { store } from './store.ts';
import { itemLevels, spellLevels } from './tips.ts';
import { el } from './ui.ts';

type Page = { chapter: string; title: string; body: () => (Node | string | null)[]; demo?: DemoId };

const STORE = 'warlock:grimoire';
const html = (s: string) => Object.assign(document.createElement('div'), { className: 'g-html', innerHTML: s });
const ul = (xs: string[]) => el('ul', {}, ...xs.map((x) => el('li', {}, x)));
const LEGEND = `Dano: vida que tira (cada mago tem ${HP_MAX}). Empurrão: metros que um mago sem dano acumulado desliza (+10% a cada 100 de dano já levado). Recarga: segundos até lançar de novo. Alcance e raio em metros (a arena de 4 magos tem ${n1(ARENA_R0)} m de raio).`;
// magia fora da barra não tem tecla no modo Q W E R D F nem no controle (vale a posição na barra)
const keyText = (a: SpellId | ItemId) => labelOf(a) !== '—' ? `tecla ${labelOf(a)}` : isSlotMode() || isPadMode() ? 'tecla pela posição na barra' : 'sem tecla (escolha em Configurações > Teclas)';

// contorno da arena num canvas pequeno (página das arenas)
function arenaThumb(id: ArenaId): HTMLElement {
  const c = el('canvas', { width: 120, height: 120, 'aria-hidden': 'true' }) as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  const k = 54 / SHAPES[id].reach;
  g.setTransform(k, 0, 0, k, 60, 60);
  g.fillStyle = '#2a0c06';
  g.fillRect(-9, -9, 18, 18);
  g.beginPath();
  for (const ring of SHAPES[id].outline) ring.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
  g.fillStyle = '#4a3a30';
  g.fill('evenodd');
  g.strokeStyle = '#ff6a1a';
  g.lineWidth = 0.04;
  g.stroke();
  return el('figure', { class: 'g-arena' }, c, el('figcaption', {}, ARENA_NAMES[id]));
}

function spellPage(id: SpellId, group: string): Page {
  const sp = SPELLS[id];
  return {
    chapter: 'Magias', title: sp.name, demo: id,
    body: () => [
      el('div', { class: 'g-head' }, el('span', { class: 'g-medal' }, icon(ICON[id])),
        el('div', {}, el('h2', {}, sp.name), el('small', {}, `${group} · ${keyText(id)} · ${sp.cost ? `${sp.cost} de ouro` : 'grátis no começo'}`))),
      el('p', { class: 'g-lead' }, RULES_SHORT[id], ' ', el('i', {}, SPELL_USE[id])),
      null, // lugar da demonstração
      el('h3', {}, 'Números por nível'), html(spellLevels(id)), el('small', { class: 'g-legend' }, LEGEND),
      el('h3', {}, 'Como usar'), el('p', {}, SPELL_TIPS[id][0]),
      el('h3', {}, 'Contra o quê'), el('p', {}, SPELL_TIPS[id][1]),
    ],
  };
}

function itemPage(id: ItemId): Page {
  const it = ITEMS[id];
  return {
    chapter: 'Itens', title: it.name, demo: SCRIPTS[id] ? id : undefined,
    body: () => [
      el('div', { class: 'g-head' }, el('span', { class: 'g-medal item' }, icon(ITEM_ICON[id])),
        el('div', {}, el('h2', {}, it.name), el('small', {}, `${it.key ? `ativo · ${keyText(id)}` : 'passivo'} · ${it.cost} de ouro por nível`))),
      el('p', { class: 'g-lead' }, it.text),
      ITEM_DEMO[id] ? el('p', { class: 'muted' }, ITEM_DEMO[id]) : null,
      null,
      el('h3', {}, 'Números por nível'), html(itemLevels(id)),
    ],
  };
}

// items como função: textos que mostram as teclas e botões atuais (trocáveis), lidos a cada vez que a página abre
const text = (chapter: string, title: string, items: string[] | (() => string[]), extra: () => (Node | null)[] = () => []): Page => ({ chapter, title, body: () => [el('h2', {}, title), ul(typeof items === 'function' ? items() : items), ...extra()] });

const PAGES: Page[] = [
  // as duas primeiras páginas são o sumário (montado em toc(), que precisa do go)
  { chapter: 'Sumário', title: 'Sumário', body: () => [] },
  { chapter: 'Sumário', title: 'Magias e itens', body: () => [] },
  text('Como jogar', 'Objetivo', RULES.objetivo),
  text('Como jogar', 'Empurrão, lava e abates', RULES.empurrao),
  text('Controles', 'No PC', () => RULES.pc),
  {
    chapter: 'Controles', title: 'Suas teclas',
    body: () => [el('h2', {}, isSlotMode() ? 'Suas teclas (Q W E R D F pela ordem da barra)' : 'Suas teclas'),
      el('div', { class: 'keys-grid' }, ...ACTIONS.map((a) => el('span', {}, el('span', { class: 'key' }, labelOf(a)), ' ', icon(actionIcon(a)), ' ', actionName(a)))),
      el('h3', {}, 'Atalhos'),
      el('div', { class: 'keys-grid' }, ...UI_ACTIONS.map((a) => el('span', {}, el('span', { class: 'key' }, uiLabel(a)), ' ', UI_NAMES[a])), el('span', {}, el('span', { class: 'key' }, 'Esc'), ' Configurações')),
      el('small', {}, 'Troque em Configurações > Teclas (Esc ou a engrenagem no topo).')],
  },
  text('Controles', 'No celular', RULES.celular),
  text('Controles', 'Com controle', () => RULES.controle),
  text('Modos', 'Rodadas', RULES.rodadas, () => [html(MODE_INFO())]),
  text('Modos', 'Deathmatch', RULES.deathmatch),
  text('Modos', 'Times', RULES.times),
  text('Modos', 'Opções, votações e bots', RULES.opcoes, () => [el('h3', {}, 'Dificuldade dos bots'), html(OPT_INFO.difficulty('rounds'))]),
  text('Arenas', 'Arenas e obstáculos', RULES.arenas, () => [el('div', { class: 'g-arenas' }, ...ARENA_IDS.map(arenaThumb)), html(OPT_INFO.arena('rounds'))]),
  text('Loja e ouro', 'Loja', () => RULES.loja),
  text('Loja e ouro', 'Ouro', RULES.ouro),
  ...SPELL_GROUPS.flatMap(([group, , ids]) => ids.map((id) => spellPage(id, group))),
  ...ITEM_IDS.map(itemPage),
  text('Runas', 'Runas', RULES.runas, () => [el('ul', { class: 'g-runes' }, ...RUNE_KINDS.map((k) => el('li', {}, icon(RUNE_ICON[k]), ' ', RULES.runa[k])))]),
  { ...text('Chão dos choques', 'Chão dos choques', RULES.choques), demo: 'clash' },
  text('Dicas', 'Dicas', RULES.dicas),
  text('Dicas', 'Créditos', RULES.creditos),
];
const CHAPTERS = [...new Set(PAGES.map((p) => p.chapter))].slice(1);
const pageOf = (pred: (p: Page) => boolean) => PAGES.findIndex(pred);

export function openGrimoire() {
  document.querySelector('.rules-overlay')?.remove();
  let at = Math.min(PAGES.length - 1, Math.max(0, Number(store.get(STORE)) || 0));
  const wide = matchMedia('(min-width: 900px)');
  const ac = new AbortController();
  let live: { tick: (now: number) => void }[] = [];
  let raf = 0;

  const spread = el('div', { class: 'g-spread' });
  const where = el('span', { class: 'g-where' });
  const prev = el('button', { type: 'button', class: 'g-turn', 'aria-label': 'Página anterior', onclick: () => turn(-1) }, '‹') as HTMLButtonElement;
  const next = el('button', { type: 'button', class: 'g-turn', 'aria-label': 'Próxima página', onclick: () => turn(1) }, '›') as HTMLButtonElement;
  const closeBtn = el('button', { type: 'button', class: 'g-close icon', 'aria-label': 'Fechar', onclick: () => close() }, '✕');
  const book = el('div', { class: 'grimoire', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Grimório: como jogar' },
    el('header', { class: 'g-top' }, el('b', { class: 'g-title' }, icon(UI_ICON.help), ' Grimório'), closeBtn),
    spread,
    el('nav', { class: 'g-nav' }, prev, el('button', { type: 'button', class: 'g-toc-btn', onclick: () => go(0) }, 'Sumário'), where, next),
  );
  const overlay = el('div', { class: 'overlay rules-overlay g-overlay', onclick: (e: Event) => e.target === overlay && close() }, book);

  function close() {
    overlay.remove();
    ac.abort();
  }

  // página 1: capítulos com o número da página; página 2: atalho para cada magia (por grupo) e cada item
  function toc(i: number): (Node | string)[] {
    const link = (to: number, label: string) => el('button', { type: 'button', class: 'g-link', onclick: () => go(to) }, label, el('span', { class: 'g-pg' }, String(to + 1)));
    const chip = (to: number, ico: string, name: string) => el('button', { type: 'button', class: 'g-chip', onclick: () => go(to) }, icon(ico), ' ', name);
    if (i === 0) return [el('h2', {}, 'Sumário'), el('ol', { class: 'g-toc' }, ...CHAPTERS.map((c) => el('li', {}, link(pageOf((p) => p.chapter === c), c))))];
    return [
      el('h2', {}, 'Magias e itens'),
      ...SPELL_GROUPS.map(([g, hint, ids]) => el('div', { class: 'g-sub' }, el('small', {}, `${g} · ${hint}`),
        el('div', { class: 'g-chips' }, ...ids.map((id) => chip(pageOf((p) => p.chapter === 'Magias' && p.demo === id), ICON[id], SPELLS[id].name))))),
      el('div', { class: 'g-sub' }, el('small', {}, 'Itens'),
        el('div', { class: 'g-chips' }, ...ITEM_IDS.map((id) => chip(pageOf((p) => p.chapter === 'Itens' && p.title === ITEMS[id].name), ITEM_ICON[id], ITEMS[id].name)))),
    ];
  }

  function render(i: number): HTMLElement {
    const p = PAGES[i];
    if (!p) return el('article', { class: 'g-page blank' });
    const body = p.chapter === 'Sumário' ? toc(i) : p.body();
    if (p.demo) {
      const canvas = el('canvas', { class: 'g-demo', role: 'img', 'aria-label': `Demonstração: ${p.title}` }) as HTMLCanvasElement;
      const fig = el('figure', { class: 'g-fig' }, canvas, el('figcaption', {}, 'Simulação do jogo com os números de agora (nível 1); recomeça sozinha.'));
      const slot = body.indexOf(null);
      if (slot >= 0) body[slot] = fig;
      else body.push(fig);
      live.push(createDemo(canvas, p.demo, [COLORS[0], COLORS[1], COLORS[2]]));
    }
    return el('article', { class: 'g-page', 'aria-label': `Página ${i + 1}: ${p.title}` },
      p.chapter !== 'Sumário' ? el('small', { class: 'g-chapter' }, p.chapter) : null, ...body, el('span', { class: 'g-num' }, String(i + 1)));
  }

  function loop(now: number) {
    // fechou (✕, Esc ou o B do controle tira o overlay) ou virou para página sem demo: para
    if (!overlay.isConnected || !live.length) return void (raf = 0);
    for (const d of live) d.tick(now);
    raf = requestAnimationFrame(loop);
  }

  function show(dir: number) {
    const per = wide.matches ? 2 : 1;
    const first = at - (at % per);
    live = [];
    spread.replaceChildren(...Array.from({ length: per }, (_, k) => render(first + k)));
    spread.scrollTop = 0;
    spread.querySelectorAll('.g-page').forEach((p) => (p.scrollTop = 0));
    prev.disabled = first === 0;
    next.disabled = first + per >= PAGES.length;
    where.textContent = per === 2 && first + 1 < PAGES.length ? `${first + 1}–${first + 2} de ${PAGES.length}` : `${first + 1} de ${PAGES.length}`;
    if (dir) {
      spread.classList.remove('turn-next', 'turn-prev');
      void spread.offsetWidth; // reinicia a animação
      spread.classList.add(dir > 0 ? 'turn-next' : 'turn-prev');
    }
    store.set(STORE, String(at));
    if (live.length && !raf) raf = requestAnimationFrame(loop);
  }
  function go(i: number) {
    const to = Math.min(PAGES.length - 1, Math.max(0, i));
    const dir = Math.sign(to - at);
    at = to;
    show(dir);
  }
  function turn(step: number) {
    const per = wide.matches ? 2 : 1;
    const first = at - (at % per);
    if (first + step * per < 0 || first + step * per >= PAGES.length) return;
    go(first + step * per);
  }

  // teclas na captura: ← → não chegam ao placar nem à câmera de quem assiste
  addEventListener('keydown', (e) => {
    if (!overlay.isConnected) return ac.abort();
    const k = e.key;
    if (k === 'Escape' || e.code === 'Escape') close(); // o Start do controle manda só o code
    else if (k === 'ArrowRight' || k === 'PageDown') turn(1);
    else if (k === 'ArrowLeft' || k === 'PageUp') turn(-1);
    else if (k === 'Home') go(0);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }, { capture: true, signal: ac.signal });
  wide.addEventListener('change', () => (overlay.isConnected ? show(0) : ac.abort()), { signal: ac.signal });
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

  document.body.append(overlay);
  show(0);
  closeBtn.focus();
}
