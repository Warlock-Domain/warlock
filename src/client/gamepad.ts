// Controle de Xbox/PlayStation (Gamepad API): analógico esquerdo anda, direito mira, botões lançam pela posição na barra.
// Fora da rodada (sala, loja, ajuda) o D-pad ou o analógico esquerdo andam entre os botões da tela.
// Um jogador por navegador: vale o primeiro controle conectado.
import { SPELLS, type SpellId } from '../shared/spells.ts';
import { add, len, norm, scale, type Vec } from '../shared/vec.ts';
import { t } from './i18n.ts';
import { PAD_NAMES, keyOf, padActionAt, padButtonOf, setPadMode, slotSpell } from './keys.ts';
import { store } from './store.ts';
import { radialIndex } from './taunt-wheel.ts';

// índices do mapeamento padrão (Xbox: A B X Y; PlayStation: ✕ ○ □ △ nas mesmas posições)
export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;
type Dir = 'up' | 'down' | 'left' | 'right';
export type Rect = { left: number; top: number; right: number; bottom: number };

// zona morta redonda e curva: parado não anda, e o começo do curso dá precisão na mira
export function stick(x: number, y: number, dead = 0.2, curve = 1.6): Vec {
  const m = Math.hypot(x, y);
  if (m <= dead) return { x: 0, y: 0 };
  const k = Math.pow(Math.min(1, (m - dead) / (1 - dead)), curve) / m;
  return { x: x * k, y: y * k };
}

// a câmera olha para o norte sem girar: direita do analógico = +x, para cima (eixo negativo) = −y
export const AIM_RANGE = SPELLS.fireball.levels[0].range;
export const AIM_MIN = 1;
// Heal needs a body under the aim, and the stick aim never comes closer than AIM_MIN: with the right stick released it heals yourself
export const padTarget = (action: string, aiming: boolean, me: Vec, at: Vec) => (action === 'heal' && !aiming ? me : at);
export function aimPoint(me: Vec, s: Vec, range = AIM_RANGE): Vec {
  const m = len(s);
  return m ? add(me, scale(norm(s), AIM_MIN + (range - AIM_MIN) * Math.min(1, m))) : me;
}

// magia do botão, pelo mapeamento da aba Controle (padrão: A B X Y LB RB LT RT = magias 1 a 8 da barra)
export function padAction(btn: number): SpellId | undefined {
  const p = padActionAt(btn);
  if (p?.startsWith('slot')) return slotSpell(Number(p.slice(4)) - 1);
  return undefined;
}

// a aba Controle espera um botão para trocar: o próximo apertado vai para ela e não faz mais nada
let padCapture: ((btn: number) => void) | null = null;
export const setPadCapture = (f: ((btn: number) => void) | null) => (padCapture = f);

// próximo botão na direção pedida: o mais perto, punindo o desvio para o lado (a grade da loja anda por linhas e colunas)
export function nextFocus(from: Rect, rects: Rect[], dir: Dir): number {
  const h = dir === 'left' || dir === 'right';
  const sign = dir === 'right' || dir === 'down' ? 1 : -1;
  const mid = (a: number, b: number) => (a + b) / 2;
  let best = -1;
  let bestScore = Infinity;
  rects.forEach((r, i) => {
    const [fa, fb, ra, rb] = h ? [from.left, from.right, r.left, r.right] : [from.top, from.bottom, r.top, r.bottom];
    const [pa, pb, qa, qb] = h ? [from.top, from.bottom, r.top, r.bottom] : [from.left, from.right, r.left, r.right];
    if (sign * (mid(ra, rb) - mid(fa, fb)) <= 1) return;
    const gap = Math.max(0, sign > 0 ? ra - fb : fa - rb);
    const off = qb >= pa && qa <= pb ? 0 : Math.abs(mid(qa, qb) - mid(pa, pb));
    const score = gap + off * 3;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

// nome curto do controle: "Xbox 360 Controller (XInput STANDARD GAMEPAD …)" → "Xbox 360 Controller"
export const padName = (id: string) => id.replace(/\s*\(.*$/, '').trim() || t('controle', 'controller');

// vibração ao levar golpe forte e ao morrer; desliga em Configurações, aba Controle (guardado no navegador)
const RUMBLE = 'warlock:rumble';
let rumbleOn = store.get(RUMBLE) !== '0';
export const isRumbleOn = () => rumbleOn;
export function setRumble(on: boolean) {
  rumbleOn = on;
  store.set(RUMBLE, on ? '1' : '0');
}

const firstPad = () => [...(navigator.getGamepads?.() ?? [])].find((g) => g?.connected) ?? null;

export function rumble(strong: number, ms: number) {
  if (!rumbleOn || !padMode) return;
  void firstPad()?.vibrationActuator?.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: Math.min(1, strong + 0.2) }).catch(() => {});
}

// a partida: quem cuida de andar, lançar e da câmera (input.ts registra ao entrar na sala)
type PadGame = {
  enabled: () => boolean;
  me: () => Vec | null;
  move: (to: Vec) => void;
  stop: () => void;
  cast: (spell: SpellId, at: Vec) => void;
  center: () => void;
  aim: (at: Vec | null) => void;
  padRange: (aiming: SpellId | null) => void; // círculo de alcance enquanto mira
};
let game: PadGame | null = null;
export const setPadGame = (g: PadGame) => (game = g);

let padMode = false;
function setMode(on: boolean) {
  if (on === padMode) return;
  padMode = on;
  document.documentElement.classList.toggle('pad', on);
  setPadMode(on);
  if (!on) game?.aim(null);
}

// reaproveita os atalhos de teclado que a interface já escuta (placar, ficha, Esc, espectador); cancelável para o placar aberto ficar com as setas
const key = (type: 'keydown' | 'keyup', code: string) => dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);

// botões navegáveis da camada de cima (ajuda, placar fixo ou a tela toda); cartão da loja sem botão ativo também entra, para ver a dica
function targets(): HTMLElement[] {
  const root = [...document.querySelectorAll('.overlay')].pop() ?? $('.tab-overlay.pinned') ?? document;
  return [...root.querySelectorAll<HTMLElement>('button, a[href], input, select, summary, .shop-item')].filter((e) =>
    !(e as HTMLButtonElement).disabled && e.checkVisibility() && (!e.classList.contains('shop-item') || !e.querySelector('button:not([disabled])')));
}
let lastRect: Rect | null = null;
function focus(e: HTMLElement) {
  if (!e.hasAttribute('tabindex') && e.tabIndex < 0) e.tabIndex = -1;
  e.focus();
  e.scrollIntoView({ block: 'nearest' });
  lastRect = e.getBoundingClientRect();
}
// foco atual; se a tela foi redesenhada e o foco sumiu, volta ao botão mais perto de onde estava
function current(list: HTMLElement[]): HTMLElement | null {
  const a = document.activeElement as HTMLElement | null;
  if (a && list.includes(a)) return a;
  if (!list.length) return null;
  const at = lastRect;
  const pick = at
    ? list.reduce((b, e) => {
      const r = e.getBoundingClientRect(), q = b.getBoundingClientRect();
      const d = (x: Rect) => Math.hypot((x.left + x.right - at.left - at.right) / 2, (x.top + x.bottom - at.top - at.bottom) / 2);
      return d(r) < d(q) ? e : b;
    })
    : (list.find((e) => e.classList.contains('primary')) ?? list[0]);
  focus(pick);
  return null;
}

function navigate(dir: Dir) {
  const list = targets();
  const a = current(list);
  if (!a) return;
  // volume: ← → mexem no controle deslizante
  if (a instanceof HTMLInputElement && a.type === 'range' && (dir === 'left' || dir === 'right')) {
    if (dir === 'left') a.stepDown();
    else a.stepUp();
    a.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const others = list.filter((e) => e !== a);
  const i = nextFocus(a.getBoundingClientRect(), others.map((e) => e.getBoundingClientRect()), dir);
  if (i >= 0) focus(others[i]);
}

// B: fecha a camada de cima (diálogo, painel do topo, placar fixo, ficha, grupo aberto)
function back() {
  if ($('.dialog-overlay')) return key('keydown', 'Escape');
  const panel = $('.vol-panel:not([hidden])');
  if (panel) return (panel.hidden = true);
  if ($('.tab-overlay.pinned')) return key('keydown', 'Escape');
  if ($('.sheet-panel:not([hidden])')) return key('keydown', keyOf('sheet'));
  const open = (document.activeElement as HTMLElement | null)?.closest('details[open]') as HTMLDetailsElement | null;
  if (open) {
    open.open = false;
    focus(open.querySelector('summary')!);
  }
}

// Start é o Esc do controle (decisão de 18/10, com o menu de configurações): fecha a camada de cima ou, sem nada aberto,
// abre e fecha as configurações. O Pronto da loja fica no A (o foco começa nele) e a ficha foi para o L3.
const start = () => key('keydown', 'Escape');

// LB/RB: troca o período do placar aberto ou pula para o grupo anterior/seguinte da loja
function group(step: 1 | -1) {
  if ($('.tab-overlay:not([hidden])')) return key('keydown', step > 0 ? 'ArrowRight' : 'ArrowLeft');
  const groups = [...document.querySelectorAll<HTMLElement>('.shop-group')];
  if (!groups.length) return;
  const at = groups.findIndex((g) => g.contains(document.activeElement));
  const list = targets();
  for (let i = at + step; i >= 0 && i < groups.length; i += step) {
    const first = list.find((e) => groups[i].contains(e));
    if (first) return focus(first);
  }
}

function menu(hit: (b: number) => boolean) {
  if (hit(BTN.A)) {
    const a = current(targets());
    if (a) {
      lastRect = a.getBoundingClientRect(); // a loja redesenha depois da compra: o foco volta para perto daqui
      a.click();
    }
  }
  if (hit(BTN.B)) back();
  // X: desfaz a compra desta loja ou vende o item focado
  if (hit(BTN.X)) {
    const card = (document.activeElement as HTMLElement | null)?.closest('.shop-item');
    if (card) ($('.undo', card) ?? $('.sell', card))?.click();
  }
  // Y: mostra ou esconde a dica do item focado
  if (hit(BTN.Y)) {
    const tip = $('.tip');
    if (tip && !tip.hidden) tip.hidden = true;
    else document.activeElement?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  }
  if (hit(BTN.LB)) group(-1);
  if (hit(BTN.RB)) group(1);
}

const MOVE_AHEAD = 2; // metros à frente do mago: o destino anda junto enquanto o analógico está inclinado
let wasMoving = false;
let lastMove = 0;
let lastAim: Vec = { x: 0, y: -0.7 };
let lastCast: SpellId = 'fireball'; // o círculo de alcance mostra a última magia lançada pelo controle
let prevAim = 0;

function play(g: PadGame, hit: (b: number) => boolean, mv: Vec, aimS: Vec) {
  const me = g.me();
  const now = performance.now();
  const moving = !!(mv.x || mv.y);
  // no máximo 10 comandos de andar por segundo, como o arrastar do botão direito; soltar para
  if (moving && me && now - lastMove > 100) {
    lastMove = now;
    const k = MOVE_AHEAD / Math.hypot(mv.x, mv.y);
    g.move({ x: me.x + mv.x * k, y: me.y + mv.y * k });
  } else if (!moving && wasMoving) g.stop();
  wasMoving = moving;
  // soltando o analógico direito a mira fica onde estava; sem mirar, mira para onde anda
  const m = len(aimS);
  if (m > 0 && (m >= 0.5 || m >= prevAim)) lastAim = aimS;
  else if (!m && moving) lastAim = scale(norm(mv), 0.7);
  prevAim = m;
  const at = me ? aimPoint(me, lastAim) : null;
  g.aim(padMode ? at : null);
  g.padRange(padMode && m > 0 ? lastCast : null);
  // morto ou só assistindo: ← → do D-pad trocam quem a câmera segue (com o placar aberto, trocam o período, como no teclado)
  const watching = !!$('.watching:not([hidden])');
  if (watching) {
    if (hit(BTN.LEFT)) key('keydown', 'ArrowLeft');
    if (hit(BTN.RIGHT)) key('keydown', 'ArrowRight');
  }
  // cada botão faz o que a aba Controle diz (o placar, segurado, fica no tick)
  for (let b = 0; b < PAD_NAMES.length; b++) {
    if (!hit(b) || (watching && (b === BTN.LEFT || b === BTN.RIGHT))) continue;
    const p = padActionAt(b);
    if (p === 'center') g.center();
    else if (p === 'sheet' || p === 'shop') key('keydown', keyOf(p)); // ficha e loja só para ver: os mesmos atalhos do teclado
    const a = padAction(b);
    if (!a || !at) continue;
    lastCast = a;
    g.cast(a, me ? padTarget(a, m > 0, me, at) : at);
  }
}

let prev: boolean[] = [];
let seen = '';
let navDir: Dir | null = null;
let navNext = 0;

function tick(toast: (msg: string) => void) {
  const gp = firstPad();
  if (!gp) {
    if (seen) {
      seen = '';
      prev = [];
      setMode(false);
      toast(t('Controle desconectado', 'Controller disconnected'));
    }
    return;
  }
  if (gp.id !== seen) {
    seen = gp.id;
    toast(t(`Controle conectado: ${padName(gp.id)} · Start abre as configurações (a aba Controle troca os botões)`, `Controller connected: ${padName(gp.id)} · Start opens settings (the Controller tab remaps the buttons)`));
  }
  const down = gp.buttons.map((b) => b.pressed);
  const hit = (b: number) => !!down[b] && !prev[b];
  // placar segurado (View/Select no padrão), nos dois modos; na captura de botão ele ainda solta (senão ficava aberto)
  const board = padButtonOf('board');
  if (padCapture) {
    if (prev[board] && !down[board]) key('keyup', keyOf('board'));
    const b = down.findIndex((d, i) => d && !prev[i]);
    prev = down;
    if (b >= 0) {
      const f = padCapture;
      padCapture = null;
      f(b);
    }
    return;
  }
  const mv = stick(gp.axes[0] ?? 0, gp.axes[1] ?? 0);
  const aimS = stick(gp.axes[2] ?? 0, gp.axes[3] ?? 0);
  if (down.some(Boolean) || mv.x || mv.y || aimS.x || aimS.y) setMode(true);
  const now = performance.now();
  const tauntPanel = () => $<HTMLElement>('.radial-picker:not([hidden])');
  const tauntButton = !$('.overlay') ? $('.hud-right .vol:has(.radial-picker) > button') : null;
  const openedTaunts = !!tauntButton && !tauntPanel() && hit(padButtonOf('taunt'));
  if (openedTaunts) tauntButton!.click();
  const panel = !$('.overlay') ? tauntPanel() : null;
  if (panel) {
    // Enquanto escolhe uma fala, A/B e os eixos não podem andar, usar item ou lançar magia.
    if (wasMoving) game?.stop();
    wasMoving = false;
    game?.aim(null);
    game?.padRange(null);
    const buttons = [...panel.querySelectorAll<HTMLButtonElement>('.radial-stage > button:not(.radial-center)')];
    // The stick points around the wheel; the d-pad steps ±1 per press (with more than 8 taunts, 8 directions could not reach them all).
    const s = len(aimS) ? aimS : mv;
    let selected = radialIndex(s.x, s.y, buttons.length);
    if (selected === null && !openedTaunts) {
      const step = Number(hit(BTN.RIGHT) || hit(BTN.DOWN)) - Number(hit(BTN.LEFT) || hit(BTN.UP));
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (step) selected = (at < 0 ? (step > 0 ? 0 : buttons.length - 1) : at + step + buttons.length) % buttons.length;
    }
    if (selected !== null) buttons[selected]?.focus({ preventScroll: true });
    if (!openedTaunts && hit(BTN.A) && buttons.includes(document.activeElement as HTMLButtonElement)) (document.activeElement as HTMLButtonElement).click();
    if ((!openedTaunts && hit(BTN.B)) || hit(BTN.START)) panel.hidden = true;
    if (prev[board] && !down[board]) key('keyup', keyOf('board'));
    prev = down;
    return;
  }
  if (game?.enabled() && !$('.overlay')) {
    play(game, hit, mv, aimS);
    navDir = null;
  } else {
    if (wasMoving) game?.stop();
    wasMoving = false;
    game?.aim(null);
    game?.padRange(null);
    // D-pad ou analógico esquerdo: anda já ao apertar e repete segurando
    const dir: Dir | null = down[BTN.UP] ? 'up' : down[BTN.DOWN] ? 'down' : down[BTN.LEFT] ? 'left' : down[BTN.RIGHT] ? 'right'
      : Math.max(Math.abs(mv.x), Math.abs(mv.y)) < 0.4 ? null : Math.abs(mv.x) > Math.abs(mv.y) ? (mv.x > 0 ? 'right' : 'left') : mv.y > 0 ? 'down' : 'up';
    if (dir !== navDir) {
      navDir = dir;
      navNext = now + 350;
      if (dir) navigate(dir);
    } else if (dir && now >= navNext) {
      navNext = now + 120;
      navigate(dir);
    }
    menu(hit);
  }
  if (hit(BTN.START)) start();
  if (!!down[board] !== !!prev[board]) key(down[board] ? 'keydown' : 'keyup', keyOf('board'));
  prev = down;
}

export function startPad(toast: (msg: string) => void) {
  // tecla, clique ou mouse mexendo de verdade: volta aos rótulos de teclado
  addEventListener('keydown', (e) => e.isTrusted && setMode(false), true);
  addEventListener('pointerdown', (e) => e.isTrusted && setMode(false), true);
  addEventListener('pointermove', (e) => e.isTrusted && (e.movementX || e.movementY) && setMode(false), true);
  const loop = () => {
    requestAnimationFrame(loop);
    tick(toast);
  };
  requestAnimationFrame(loop);
}
