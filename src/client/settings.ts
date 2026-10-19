// Configurações (pedido do Fernando, 18/10): um diálogo só, aberto de qualquer tela, que junta teclas, lançamento, som, vídeo,
// controle, jogador e sobre. Abas à esquerda no PC, lista no celular. Abre pelo Esc quando nada mais está aberto (main.ts),
// pela engrenagem do topo ou pelo Start do controle; não pausa o jogo. Aba nova = um item em SECTIONS.
import { isRumbleOn, setPadCapture, setRumble } from './gamepad.ts';
import { UI_ICON, actionIcon, actionName, el, icon } from './icons.ts';
import {
  ACTIONS, CAST_MODES, PAD_ACTIONS, PAD_ACTION_NAMES, PAD_NAMES, PAD_START, RESERVED, UI_ACTIONS, UI_NAMES, getCastMode, isSlotMode, keyLabel, keyOf, padButtonName,
  onKeysChange, padActionAt, padButtonOf, resetKeys, resetPad, setCastMode, setKey, setPadButton, setSlotMode, slotSpell, whoUses, type Action, type AnyAction, type CastMode, type PadAction, type UiAction,
} from './keys.ts';
import { avatarPanel } from './avatar.ts';
import { RULES } from './rules-text.ts';
import { store } from './store.ts';
import { choice, showRules, toast } from './ui.ts';
import { LANG, setLang, spellName, t, type Lang } from './i18n.ts';

declare const __BUILD__: string;

// o que a tela atual oferece: som e vídeo só existem dentro da sala; trocar o apelido vale no lobby e na sala
type SettingsCtx = {
  name: () => string;
  rename: () => void;
  volumes?: () => { sfx: number; music: number };
  setVolume?: (kind: 'sfx' | 'music', value: number) => void;
  fxLite?: () => boolean;
  setFxLite?: (lite: boolean) => void;
  closePanels?: () => void; // um painel por vez: abrir o menu fecha os do topo
};
let ctx: SettingsCtx = { name: () => '', rename: () => {} };
export function setSettingsCtx(c: SettingsCtx) {
  ctx = c;
  if (overlay) draw();
}

const nameOf = (a: AnyAction) => (a in UI_NAMES ? UI_NAMES[a as UiAction] : actionName(a as Action));
const padActionName = (p: PadAction) => {
  const s = p.startsWith('slot') ? slotSpell(Number(p.slice(4)) - 1) : undefined;
  return s ? `${PAD_ACTION_NAMES[p]} · ${spellName(s)}` : PAD_ACTION_NAMES[p];
};

// esperando a tecla (ou o botão do controle) nova
let waiting: AnyAction | null = null;
let padWaiting: PadAction | null = null;

function bindKey(a: AnyAction, code: string) {
  if (RESERVED.has(code)) return toast(t('Esc, Enter, Espaço e as setas ← → são fixas.', 'Esc, Enter, Space and the ← → arrows are fixed.'));
  const other = whoUses(code);
  if (!setKey(a, code)) return toast(t('No modo Q W E R D F essas seis letras são das magias da barra.', 'In Q W E R D F mode these six letters belong to the spells on the bar.'));
  if (other && other !== a) toast(t(`Tecla já usada por ${nameOf(other)}: as duas trocaram (${nameOf(other)} ficou com ${keyLabel(keyOf(other))}).`, `Key already used by ${nameOf(other)}: the two swapped (${nameOf(other)} now has ${keyLabel(keyOf(other))}).`));
}
function bindPad(a: PadAction, btn: number) {
  if (btn === PAD_START) return toast(t('Start é o Esc do controle e não muda.', 'Start is the controller\'s Esc and cannot be changed.'));
  const other = padActionAt(btn);
  setPadButton(a, btn);
  if (other && other !== a) toast(t(`Botão já usado por ${PAD_ACTION_NAMES[other]}: os dois trocaram (${PAD_ACTION_NAMES[other]} ficou com ${padButtonName(padButtonOf(other))}).`, `Button already used by ${PAD_ACTION_NAMES[other]}: the two swapped (${PAD_ACTION_NAMES[other]} now has ${padButtonName(padButtonOf(other))}).`));
}
function waitPad(a: PadAction | null) {
  padWaiting = a;
  setPadCapture(a && ((btn) => {
    if (padWaiting) bindPad(padWaiting, btn);
    padWaiting = null;
    draw();
  }));
  draw();
}

const keyRow = (a: AnyAction, label: (Node | string)[]) => el('div', { class: 'keys-row' }, el('span', {}, ...label),
  el('button', { type: 'button', class: 'keycap' + (waiting === a ? ' wait' : ''), 'aria-label': t(`Tecla de ${nameOf(a)}: ${keyLabel(keyOf(a))}`, `Key for ${nameOf(a)}: ${keyLabel(keyOf(a))}`), onclick: () => {
    waiting = waiting === a ? null : a;
    draw();
  } }, waiting === a ? t('aperte…', 'press…') : keyLabel(keyOf(a))));

function keysSection(): Node[] {
  return [
    el('p', { class: 'muted' }, t('Clique na tecla de uma ação e aperte a nova. Se outra ação já usava essa tecla, as duas trocam. Fica salvo neste navegador.', 'Click an action\'s key and press the new one. If another action already used that key, the two swap. Saved in this browser.')),
    el('h3', {}, t('Magias e itens', 'Spells and items')),
    el('div', { class: 'keys-list' }, ...ACTIONS.map((a) => keyRow(a, [icon(actionIcon(a)), ' ', nameOf(a)]))),
    el('h3', {}, 'Interface'),
    el('div', { class: 'keys-list' }, ...UI_ACTIONS.map((a) => keyRow(a, [UI_NAMES[a]]))),
    el('small', { class: 'muted' }, t('Fixas: Esc cancela a magia, fecha o que estiver aberto e abre este menu; Espaço segurado arrasta a câmera e sozinho volta ao centro; ← → trocam o período do placar e quem você assiste.', 'Fixed: Esc cancels the spell, closes whatever is open and opens this menu; holding Space drags the camera and tapping it recenters; ← → switch the scoreboard period and who you are watching.')),
    el('button', { type: 'button', onclick: () => resetKeys() }, t('Voltar ao padrão', 'Reset to default')),
  ];
}

// jeito de lançar pela tecla (os três do Dota) e o modo Q W E R D F
const CAST_TEXT: Record<CastMode, [string, string]> = {
  quick: [t('Rápido', 'Quick'), t('A tecla lança na hora na direção do mouse. Passe o mouse na magia da barra para ver o alcance.', 'The key casts instantly toward the mouse. Hover a spell on the bar to see its range.')],
  release: [t('Ao soltar', 'On release'), t('Segure a tecla para ver o círculo de alcance; ao soltar, a magia sai. Esc cancela.', 'Hold the key to see the range circle; on release, the spell is cast. Esc cancels.')],
  click: [t('Com clique', 'With click'), t('A tecla escolhe a magia e mostra o alcance; o clique esquerdo lança (fora do alcance, vai até a borda). Botão direito ou Esc cancelam.', 'The key selects the spell and shows its range; left click casts (out of range, it goes to the edge). Right click or Esc cancels.')],
};
const check = (id: string, on: boolean, text: string, change: (on: boolean) => void) => el('label', { class: 'slot-row', for: id },
  el('input', { type: 'checkbox', id, checked: on, onchange: (e: Event) => change((e.target as HTMLInputElement).checked) }), el('span', {}, text));

function castSection(): Node[] {
  return [
    el('h3', {}, t('Lançar pela tecla', 'Casting with the key')),
    choice(t('Jeito de lançar', 'Casting mode'), CAST_MODES.map((k) => [k, CAST_TEXT[k][0]] as [CastMode, string]), getCastMode(), (k) => (setCastMode(k), draw())),
    el('p', { class: 'muted' }, CAST_TEXT[getCastMode()][1]),
    el('h3', {}, t('Teclas das magias', 'Spell keys')),
    check('slot-keys', isSlotMode(), t('Q W E R D F pela ordem da barra (como no Dota)', 'Q W E R D F in bar order (like in Dota)'), (on) => (setSlotMode(on), draw())),
    el('p', { class: 'muted' }, t('Ligado, as seis primeiras magias da barra usam Q W E R D F, na ordem; os itens continuam nas teclas deles.', 'When on, the first six spells on the bar use Q W E R D F, in order; items keep their own keys.')),
  ];
}

// som: lembra o volume de antes para o "Ligar o som" voltar onde estava
let beforeMute = { sfx: 1, music: 0.7 };
function soundSection(): Node[] | null {
  const { volumes, setVolume } = ctx;
  if (!volumes || !setVolume) return null;
  const slider = (kind: 'sfx' | 'music', label: string) => {
    const input = el('input', { type: 'range', id: 'vol-' + kind, min: 0, max: 100, step: 5, value: Math.round(volumes()[kind] * 100) }) as HTMLInputElement;
    const out = el('span', { class: 'vol-value' }, input.value + '%');
    input.addEventListener('input', () => {
      out.textContent = input.value + '%';
      setVolume(kind, Number(input.value) / 100);
      muteBtn.textContent = muteText();
    });
    return el('label', { class: 'vol-row', for: 'vol-' + kind }, el('span', {}, label), input, out);
  };
  const muted = () => volumes().sfx + volumes().music === 0;
  const muteText = () => (muted() ? t('Ligar o som', 'Turn sound on') : t('Silenciar tudo', 'Mute all'));
  const muteBtn = el('button', { type: 'button', onclick: () => {
    const next = muted() ? beforeMute : { sfx: 0, music: 0 };
    if (!muted()) beforeMute = { ...volumes() };
    setVolume('sfx', next.sfx);
    setVolume('music', next.music);
    draw();
  } }, muteText());
  return [slider('sfx', t('Efeitos', 'Effects')), slider('music', t('Música', 'Music')), muteBtn];
}

function videoSection(): Node[] | null {
  const { fxLite, setFxLite } = ctx;
  if (!fxLite || !setFxLite) return null;
  return [
    el('h3', {}, t('Efeitos visuais', 'Visual effects')),
    choice(t('Efeitos visuais', 'Visual effects'), [[false, t('Completo', 'Full')], [true, t('Leve', 'Light')]], fxLite(), (lite) => (setFxLite(lite), draw())),
    el('p', { class: 'muted' }, t('Leve desliga o tremor da tela, a pausa no golpe forte e as partículas extras (bom para PC fraco e para quem enjoa). Começa no Leve quando o sistema pede menos movimento.', 'Light turns off the screen shake, the hit pause on heavy blows and the extra particles (good for weak PCs and for anyone who gets motion sick). It starts on Light when the system asks for less motion.')),
  ];
}

// desenho do controle: cada botão com a linha até o nome da ação; clicar escolhe a ação daquele botão e o próximo botão
// apertado no controle (ou clicado no desenho) fica com ela. No celular só o desenho e a lista abaixo.
type PadSpot = { b: number; x: number; y: number; shape: 'round' | 'trigger' | 'bumper' | 'stick' | 'dpad' | 'pill'; side: 'l' | 'r'; row: number };
const SPOTS: PadSpot[] = [
  { b: 6, x: 270, y: 70, shape: 'trigger', side: 'l', row: 0 }, { b: 4, x: 270, y: 100, shape: 'bumper', side: 'l', row: 1 },
  { b: 8, x: 350, y: 172, shape: 'pill', side: 'l', row: 2 }, { b: 10, x: 268, y: 180, shape: 'stick', side: 'l', row: 3 },
  { b: 12, x: 322, y: 234, shape: 'dpad', side: 'l', row: 4 }, { b: 14, x: 300, y: 256, shape: 'dpad', side: 'l', row: 5 },
  { b: 15, x: 344, y: 256, shape: 'dpad', side: 'l', row: 6 }, { b: 13, x: 322, y: 278, shape: 'dpad', side: 'l', row: 7 },
  { b: 7, x: 490, y: 70, shape: 'trigger', side: 'r', row: 0 }, { b: 5, x: 490, y: 100, shape: 'bumper', side: 'r', row: 1 },
  { b: 9, x: 410, y: 172, shape: 'pill', side: 'r', row: 2 }, { b: 3, x: 492, y: 152, shape: 'round', side: 'r', row: 3 },
  { b: 1, x: 518, y: 178, shape: 'round', side: 'r', row: 4 }, { b: 2, x: 466, y: 178, shape: 'round', side: 'r', row: 5 },
  { b: 0, x: 492, y: 204, shape: 'round', side: 'r', row: 6 }, { b: 11, x: 438, y: 256, shape: 'stick', side: 'r', row: 7 },
];
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag: string, attrs: Record<string, string | number>, ...kids: (Node | string)[]) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  e.append(...kids);
  return e;
};
function padDrawing(): Element {
  const body = svg('path', { class: 'pad-body', d: 'M250 120 Q380 104 510 120 Q565 128 585 200 L608 300 Q616 346 576 350 Q546 352 526 314 L500 280 L260 280 L234 314 Q214 352 184 350 Q144 346 152 300 L175 200 Q195 128 250 120 Z' });
  const spots = SPOTS.map((s) => {
    const p = padActionAt(s.b);
    const ly = 34 + s.row * 44;
    const lx = s.side === 'l' ? 150 : 610;
    const shape = s.shape === 'trigger' ? svg('rect', { x: s.x - 34, y: s.y - 12, width: 68, height: 22, rx: 9 })
      : s.shape === 'bumper' ? svg('rect', { x: s.x - 40, y: s.y - 8, width: 80, height: 15, rx: 7 })
      : s.shape === 'stick' ? svg('circle', { cx: s.x, cy: s.y, r: 24 })
      : s.shape === 'dpad' ? svg('rect', { x: s.x - 11, y: s.y - 11, width: 22, height: 22, rx: 4 })
      : s.shape === 'pill' ? svg('rect', { x: s.x - 15, y: s.y - 8, width: 30, height: 16, rx: 8 })
      : svg('circle', { cx: s.x, cy: s.y, r: 13 });
    const sel = (padWaiting && padButtonOf(padWaiting) === s.b) || false;
    const g = svg('g', { class: 'pad-btn' + (sel ? ' wait' : '') + (p ? '' : ' free'), 'data-btn': s.b, tabindex: 0, role: 'button',
      'aria-label': `${padButtonName(s.b)}: ${p ? padActionName(p) : s.b === PAD_START ? t('Esc do controle (configurações)', 'controller Esc (settings)') : t('livre', 'free')}` },
      svg('polyline', { class: 'pad-callout pad-line', points: `${s.x},${s.y} ${s.side === 'l' ? lx + 22 : lx - 22},${ly} ${lx},${ly}` }),
      shape,
      svg('text', { class: 'pad-glyph', x: s.x, y: s.y + 4 }, PAD_NAMES[s.b].length > 2 ? '' : PAD_NAMES[s.b]),
      svg('text', { class: 'pad-callout pad-label', x: s.side === 'l' ? lx - 4 : lx + 4, y: ly + 5, 'text-anchor': s.side === 'l' ? 'end' : 'start' },
        svg('tspan', { class: 'pad-key' }, padButtonName(s.b) + ' '), sel ? t('aperte…', 'press…') : p ? padActionName(p) : s.b === PAD_START ? 'Esc / menu' : t('livre', 'free')));
    g.addEventListener('click', () => clickSpot(s.b));
    g.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && clickSpot(s.b));
    return g;
  });
  // no celular os nomes ficam na lista abaixo: o desenho corta as margens dos nomes e cresce
  const narrow = matchMedia('(max-width: 600px)').matches;
  return svg('svg', { class: 'pad-svg', viewBox: narrow ? '140 50 480 310' : '-80 0 920 380', role: 'group', 'aria-label': t('Botões do controle', 'Controller buttons') }, body, ...spots);
}
function clickSpot(b: number) {
  // esperando um botão: clicar em outro no desenho também vale (dá para trocar sem o controle na mão)
  if (padWaiting) {
    const a = padWaiting;
    waitPad(null);
    if (padButtonOf(a) !== b) bindPad(a, b);
    return draw();
  }
  const p = padActionAt(b);
  if (p) return waitPad(p);
  toast(b === PAD_START ? t('Start é o Esc do controle e não muda.', 'Start is the controller\'s Esc and cannot be changed.') : t('Esse botão está livre: escolha uma ação na lista e aperte este botão.', 'That button is free: pick an action in the list and press this button.'));
}

function padSection(): Node[] {
  return [
    check('pad-rumble', isRumbleOn(), t('Vibração do controle (golpe forte e morte)', 'Controller vibration (heavy hit and death)'), (on) => setRumble(on)),
    el('p', { class: 'muted' }, padWaiting ? t(`Aperte no controle o botão novo de ${PAD_ACTION_NAMES[padWaiting]} (ou clique nele no desenho). Esc cancela.`, `Press the new button for ${PAD_ACTION_NAMES[padWaiting]} on the controller (or click it in the drawing). Esc cancels.`)
      : t('Clique num botão do desenho ou da lista e aperte o botão novo no controle. Se outro já usava, os dois trocam. Start é o Esc do controle.', 'Click a button in the drawing or the list and press the new button on the controller. If another already used it, the two swap. Start is the controller\'s Esc.')),
    padDrawing(),
    el('div', { class: 'keys-list' }, ...PAD_ACTIONS.map((p) => el('div', { class: 'keys-row' }, el('span', {}, padActionName(p)),
      el('button', { type: 'button', class: 'keycap' + (padWaiting === p ? ' wait' : ''), onclick: () => waitPad(padWaiting === p ? null : p) },
        padWaiting === p ? t('aperte…', 'press…') : padButtonName(padButtonOf(p)))))),
    el('small', { class: 'muted' }, t('Nos menus o controle não muda: D-pad anda, A confirma, B volta, X desfaz ou vende, Y mostra a dica, LB e RB pulam grupos.', 'In menus the controller layout does not change: D-pad moves, A confirms, B goes back, X undoes or sells, Y shows the tip, LB and RB skip groups.')),
    el('button', { type: 'button', onclick: () => resetPad() }, t('Voltar ao padrão', 'Reset to default')),
  ];
}

// Idioma: Português / English; trocar recarrega a página (no meio da partida, volta para a sala pelo link)
export const langChoice = () => el('div', { class: 'keys-row' }, el('span', {}, 'Idioma / Language'),
  choice('Idioma / Language', [['pt', 'Português'], ['en', 'English']] as [Lang, string][], LANG, setLang));

function playerSection(): Node[] {
  return [
    el('div', { class: 'keys-row' }, el('span', {}, t('Apelido: ', 'Nickname: '), el('b', {}, ctx.name())), el('button', { type: 'button', onclick: () => {
      close();
      ctx.rename();
    } }, t('Trocar', 'Change'))),
    langChoice(),
  ];
}

function aboutSection(): Node[] {
  return [
    el('p', {}, el('b', {}, 'Warlock'), ` · ${t('versão', 'version')} ${typeof __BUILD__ === 'string' ? __BUILD__ : 'dev'}`),
    el('button', { type: 'button', onclick: () => {
      close();
      showRules();
    } }, icon(UI_ICON.help), ' ', t('Abrir o grimório (como jogar)', 'Open the grimoire (how to play)')),
    el('h3', {}, t('Créditos', 'Credits')),
    ...RULES.creditos.map((t) => el('p', { class: 'muted' }, t)),
  ];
}

type Section = { id: string; title: string; icon: string; render: () => Node[] | null }; // null: a aba não aparece nesta tela
const SECTIONS: Section[] = [
  { id: 'teclas', title: t('Teclas', 'Keys'), icon: UI_ICON.keys, render: keysSection },
  { id: 'lancamento', title: t('Lançamento', 'Casting'), icon: UI_ICON.aim, render: castSection },
  { id: 'som', title: t('Som', 'Sound'), icon: UI_ICON.sound, render: soundSection },
  { id: 'video', title: t('Vídeo e efeitos', 'Video & effects'), icon: UI_ICON.video, render: videoSection },
  { id: 'controle', title: t('Controle', 'Controller'), icon: UI_ICON.pad, render: padSection },
  { id: 'jogador', title: t('Jogador', 'Player'), icon: UI_ICON.person, render: playerSection },
  { id: 'personagem', title: t('Personagem', 'Character'), icon: UI_ICON.person, render: () => [avatarPanel()] },
  { id: 'sobre', title: t('Sobre', 'About'), icon: UI_ICON.info, render: aboutSection },
];

// aba Configurações do menu principal: um botão por aba deste menu (abre o menu já nela); som e vídeo só existem na sala.
// Sem chamar render(): a aba Personagem montaria a prévia 3D só para conferir
export const settingsLinks = () => el('div', { class: 'settings-links' }, ...SECTIONS.filter((s) => !(s.id === 'som' && !ctx.volumes) && !(s.id === 'video' && !ctx.fxLite)).map((s) =>
  el('button', { type: 'button', onclick: () => openSettings(s.id) }, icon(s.icon), ' ' + s.title)));

const TAB_STORE = 'warlock:settingsTab';
let tab = store.get(TAB_STORE) ?? 'teclas';
let overlay: HTMLElement | null = null;
let page = false; // celular: false mostra a lista de abas, true a aba escolhida
let ac: AbortController | null = null;

function draw() {
  if (!overlay) return;
  const shown = SECTIONS.map((s) => [s, s.render()] as const).filter(([, body]) => body);
  const [cur, body] = shown.find(([s]) => s.id === tab) ?? shown[0];
  tab = cur.id;
  const focusId = (document.activeElement as HTMLElement | null)?.id;
  overlay.firstElementChild!.replaceWith(el('div', { class: 'settings', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'settings-title', 'data-view': page ? 'page' : 'list' },
    el('header', { class: 'settings-head' },
      el('button', { type: 'button', class: 'icon settings-back', title: t('Voltar à lista', 'Back to list'), 'aria-label': t('Voltar à lista', 'Back to list'), onclick: () => ((page = false), draw()) }, '‹'),
      el('h2', { class: 'title', id: 'settings-title' }, t('Configurações', 'Settings')),
      el('button', { type: 'button', class: 'icon', title: t('Fechar (Esc)', 'Close (Esc)'), 'aria-label': t('Fechar as configurações', 'Close settings'), onclick: close }, '✕')),
    el('nav', { class: 'settings-tabs', role: 'tablist', 'aria-label': t('Seções', 'Sections') }, ...shown.map(([s]) => el('button', {
      type: 'button', role: 'tab', id: 'set-tab-' + s.id, 'aria-selected': String(s.id === tab), class: s.id === tab ? 'on' : '', onclick: () => go(s.id),
    }, icon(s.icon), el('span', {}, s.title)))),
    el('section', { class: 'settings-body', role: 'tabpanel', 'aria-labelledby': 'set-tab-' + tab }, el('h3', { class: 'settings-page-title' }, cur.title), ...body!)));
  if (focusId) document.getElementById(focusId)?.focus();
}
function go(id: string) {
  if (waiting || padWaiting) {
    waiting = null;
    waitPad(null);
  }
  tab = id;
  page = true;
  store.set(TAB_STORE, id);
  draw();
  document.getElementById('set-tab-' + id)?.focus();
}

// sem aba: no PC a última vista, no celular a lista; com aba (atalho do volume, por exemplo) já abre nela
export function openSettings(id?: string) {
  if (overlay) return id ? go(id) : undefined;
  ctx.closePanels?.();
  overlay = el('div', { class: 'overlay settings-overlay', onclick: (e: Event) => e.target === overlay && close() }, el('div', {}));
  page = !!id;
  if (id) tab = id;
  document.body.append(overlay);
  draw();
  document.getElementById('set-tab-' + tab)?.focus();
  ac = new AbortController();
  // na captura: com o menu aberto o jogo não recebe teclas (o que o navegador faz com Tab, Enter e setas continua)
  addEventListener('keydown', (e) => {
    if (e.code === 'F1') e.preventDefault(); // não abre a ajuda do navegador
    e.stopImmediatePropagation();
    if (padWaiting && e.code === 'Escape') {
      e.preventDefault();
      return waitPad(null);
    }
    if (waiting) {
      e.preventDefault();
      const a = waiting;
      waiting = null;
      if (e.code !== 'Escape') bindKey(a, e.code);
      return draw();
    }
    if (e.code === 'Escape') {
      e.preventDefault();
      close();
    }
  }, { capture: true, signal: ac.signal });
}
function close() {
  if (!overlay) return;
  waiting = null;
  if (padWaiting) waitPad(null);
  ac?.abort();
  overlay.remove();
  overlay = null;
}
onKeysChange(draw);
