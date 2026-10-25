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

// Rumble on heavy hits and on death; turned off in Settings, Controller tab (saved in the browser)
const RUMBLE = 'warlock:rumble';

const firstPad = () => [...(navigator.getGamepads?.() ?? [])].find((g) => g?.connected) ?? null;

// the match: who handles moving, casting and the camera (input.ts registers it when entering the room)
type PadGame = {
  enabled: () => boolean;
  me: () => Vec | null;
  move: (to: Vec) => void;
  stop: () => void;
  cast: (spell: SpellId, at: Vec) => void;
  center: () => void;
  aim: (at: Vec | null) => void;
  padRange: (aiming: SpellId | null) => void; // range circle while aiming
};

// Reuses the keyboard shortcuts the UI already listens to (scoreboard, sheet, Esc, spectator); cancelable so an open
// scoreboard keeps the arrows
const key = (type: 'keydown' | 'keyup', code: string) => dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);

// Navigable buttons of the top layer (help, pinned scoreboard or the whole screen); a shop card without an active button
// also counts, so its tip can be seen
function targets(): HTMLElement[] {
  const root = [...document.querySelectorAll('.overlay')].pop() ?? $('.tab-overlay.pinned') ?? document;
  return [...root.querySelectorAll<HTMLElement>('button, a[href], input, select, summary, .shop-item')].filter((e) =>
    !(e as HTMLButtonElement).disabled && e.checkVisibility() && (!e.classList.contains('shop-item') || !e.querySelector('button:not([disabled])')));
}

// Start is the controller's Esc (decision of 18/10, with the settings menu): closes the top layer or, with nothing open,
// toggles the settings. The shop's Ready is on A (focus starts there) and the sheet moved to L3.
const start = () => key('keydown', 'Escape');

const MOVE_AHEAD = 2; // meters ahead of the wizard: the destination moves along while the stick is tilted

// One player per browser: this object owns the first connected controller's state (mode, button edges, menu focus,
// stick memory) and the per-frame loop that startPad begins.
class Pad {
  private game: PadGame | null = null;
  private capture: ((btn: number) => void) | null = null; // the Controller tab waits for the next button to remap
  private rumbleOn = store.get(RUMBLE) !== '0';
  private padMode = false;
  private lastRect: Rect | null = null;
  private wasMoving = false;
  private lastMove = 0;
  private lastAim: Vec = { x: 0, y: -0.7 };
  private lastCast: SpellId = 'fireball'; // the range circle shows the last spell cast with the controller
  private prevAim = 0;
  private prev: boolean[] = [];
  private seen = '';
  private navDir: Dir | null = null;
  private navNext = 0;

  setGame(g: PadGame) {
    this.game = g;
  }

  setCapture(f: ((btn: number) => void) | null) {
    this.capture = f;
  }

  isRumbleOn() {
    return this.rumbleOn;
  }

  setRumble(on: boolean) {
    this.rumbleOn = on;
    store.set(RUMBLE, on ? '1' : '0');
  }

  rumble(strong: number, ms: number) {
    if (!this.rumbleOn || !this.padMode) return;
    void firstPad()?.vibrationActuator?.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: Math.min(1, strong + 0.2) }).catch(() => {});
  }

  start(toast: (msg: string) => void) {
    // a real key, click or mouse movement goes back to keyboard labels
    addEventListener('keydown', (e) => e.isTrusted && this.setMode(false), true);
    addEventListener('pointerdown', (e) => e.isTrusted && this.setMode(false), true);
    addEventListener('pointermove', (e) => e.isTrusted && (e.movementX || e.movementY) && this.setMode(false), true);
    const loop = () => {
      requestAnimationFrame(loop);
      this.tick(toast);
    };
    requestAnimationFrame(loop);
  }

  private setMode(on: boolean) {
    if (on === this.padMode) return;
    this.padMode = on;
    document.documentElement.classList.toggle('pad', on);
    setPadMode(on);
    if (!on) this.game?.aim(null);
  }

  private focus(e: HTMLElement) {
    if (!e.hasAttribute('tabindex') && e.tabIndex < 0) e.tabIndex = -1;
    e.focus();
    e.scrollIntoView({ block: 'nearest' });
    this.lastRect = e.getBoundingClientRect();
  }

  // current focus; if the screen was redrawn and focus was lost, go back to the button nearest to where it was
  private current(list: HTMLElement[]): HTMLElement | null {
    const a = document.activeElement as HTMLElement | null;
    if (a && list.includes(a)) return a;
    if (!list.length) return null;
    const at = this.lastRect;
    const pick = at
      ? list.reduce((b, e) => {
        const r = e.getBoundingClientRect(), q = b.getBoundingClientRect();
        const d = (x: Rect) => Math.hypot((x.left + x.right - at.left - at.right) / 2, (x.top + x.bottom - at.top - at.bottom) / 2);
        return d(r) < d(q) ? e : b;
      })
      : (list.find((e) => e.classList.contains('primary')) ?? list[0]);
    this.focus(pick);
    return null;
  }

  private navigate(dir: Dir) {
    const list = targets();
    const a = this.current(list);
    if (!a) return;
    // volume: left and right move the slider
    if (a instanceof HTMLInputElement && a.type === 'range' && (dir === 'left' || dir === 'right')) {
      if (dir === 'left') a.stepDown();
      else a.stepUp();
      a.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const others = list.filter((e) => e !== a);
    const i = nextFocus(a.getBoundingClientRect(), others.map((e) => e.getBoundingClientRect()), dir);
    if (i >= 0) this.focus(others[i]);
  }

  // B: closes the top layer (dialog, top panel, pinned scoreboard, sheet, open group)
  private back() {
    if ($('.dialog-overlay')) return key('keydown', 'Escape');
    const panel = $('.vol-panel:not([hidden])');
    if (panel) return (panel.hidden = true);
    if ($('.tab-overlay.pinned')) return key('keydown', 'Escape');
    if ($('.sheet-panel:not([hidden])')) return key('keydown', keyOf('sheet'));
    const open = (document.activeElement as HTMLElement | null)?.closest('details[open]') as HTMLDetailsElement | null;
    if (open) {
      open.open = false;
      this.focus(open.querySelector('summary')!);
    }
  }

  // LB/RB: switch the open scoreboard's period or jump to the previous/next shop group
  private group(step: 1 | -1) {
    if ($('.tab-overlay:not([hidden])')) return key('keydown', step > 0 ? 'ArrowRight' : 'ArrowLeft');
    const groups = [...document.querySelectorAll<HTMLElement>('.shop-group')];
    if (!groups.length) return;
    const at = groups.findIndex((g) => g.contains(document.activeElement));
    const list = targets();
    for (let i = at + step; i >= 0 && i < groups.length; i += step) {
      const first = list.find((e) => groups[i].contains(e));
      if (first) return this.focus(first);
    }
  }

  private menu(hit: (b: number) => boolean) {
    if (hit(BTN.A)) {
      const a = this.current(targets());
      if (a) {
        this.lastRect = a.getBoundingClientRect(); // the shop redraws after a purchase: focus comes back near here
        a.click();
      }
    }
    if (hit(BTN.B)) this.back();
    // X: undo this shop's purchase or sell the focused item
    if (hit(BTN.X)) {
      const card = (document.activeElement as HTMLElement | null)?.closest('.shop-item');
      if (card) ($('.undo', card) ?? $('.sell', card))?.click();
    }
    // Y: show or hide the focused item's tip
    if (hit(BTN.Y)) {
      const tip = $('.tip');
      if (tip && !tip.hidden) tip.hidden = true;
      else document.activeElement?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    }
    if (hit(BTN.LB)) this.group(-1);
    if (hit(BTN.RB)) this.group(1);
  }

  // stops walking and hides the aim while the pad is not playing (menus, taunt wheel)
  private idle() {
    if (this.wasMoving) this.game?.stop();
    this.wasMoving = false;
    this.game?.aim(null);
    this.game?.padRange(null);
  }

  private play(g: PadGame, hit: (b: number) => boolean, mv: Vec, aimS: Vec) {
    const me = g.me();
    const now = performance.now();
    const moving = !!(mv.x || mv.y);
    // at most 10 move commands per second, like dragging the right mouse button; releasing stops
    if (moving && me && now - this.lastMove > 100) {
      this.lastMove = now;
      const k = MOVE_AHEAD / Math.hypot(mv.x, mv.y);
      g.move({ x: me.x + mv.x * k, y: me.y + mv.y * k });
    } else if (!moving && this.wasMoving) g.stop();
    this.wasMoving = moving;
    // releasing the right stick keeps the aim where it was; without aiming, aim where the wizard walks
    const m = len(aimS);
    if (m > 0 && (m >= 0.5 || m >= this.prevAim)) this.lastAim = aimS;
    else if (!m && moving) this.lastAim = scale(norm(mv), 0.7);
    this.prevAim = m;
    const at = me ? aimPoint(me, this.lastAim) : null;
    g.aim(this.padMode ? at : null);
    g.padRange(this.padMode && m > 0 ? this.lastCast : null);
    // dead or only watching: D-pad left/right switch who the camera follows (with the scoreboard open, the period, as on the keyboard)
    const watching = !!$('.watching:not([hidden])');
    if (watching) {
      if (hit(BTN.LEFT)) key('keydown', 'ArrowLeft');
      if (hit(BTN.RIGHT)) key('keydown', 'ArrowRight');
    }
    // each button does what the Controller tab says (the held scoreboard lives in tick)
    for (let b = 0; b < PAD_NAMES.length; b++) {
      if (!hit(b) || (watching && (b === BTN.LEFT || b === BTN.RIGHT))) continue;
      const p = padActionAt(b);
      if (p === 'center') g.center();
      else if (p === 'sheet' || p === 'shop') key('keydown', keyOf(p)); // sheet and shop only to look: the same keyboard shortcuts
      const a = padAction(b);
      if (!a || !at) continue;
      this.lastCast = a;
      g.cast(a, me ? padTarget(a, m > 0, me, at) : at);
    }
  }

  // Taunt wheel open: A/B and the axes must not walk, use an item or cast a spell while picking a line
  private tauntWheel(panel: HTMLElement, hit: (b: number) => boolean, mv: Vec, aimS: Vec, opened: boolean) {
    this.idle();
    const buttons = [...panel.querySelectorAll<HTMLButtonElement>('.radial-stage > button:not(.radial-center)')];
    // The stick points around the wheel; the d-pad steps ±1 per press (with more than 8 taunts, 8 directions could not reach them all).
    const s = len(aimS) ? aimS : mv;
    let selected = radialIndex(s.x, s.y, buttons.length);
    if (selected === null && !opened) {
      const step = Number(hit(BTN.RIGHT) || hit(BTN.DOWN)) - Number(hit(BTN.LEFT) || hit(BTN.UP));
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (step) selected = (at < 0 ? (step > 0 ? 0 : buttons.length - 1) : at + step + buttons.length) % buttons.length;
    }
    if (selected !== null) buttons[selected]?.focus({ preventScroll: true });
    if (!opened && hit(BTN.A) && buttons.includes(document.activeElement as HTMLButtonElement)) (document.activeElement as HTMLButtonElement).click();
    if ((!opened && hit(BTN.B)) || hit(BTN.START)) panel.hidden = true;
  }

  // Outside the match the D-pad or the left stick walk between buttons: one step on press, then repeats while held
  private menuStep(down: boolean[], mv: Vec, now: number, hit: (b: number) => boolean) {
    this.idle();
    const dir: Dir | null = down[BTN.UP] ? 'up' : down[BTN.DOWN] ? 'down' : down[BTN.LEFT] ? 'left' : down[BTN.RIGHT] ? 'right'
      : Math.max(Math.abs(mv.x), Math.abs(mv.y)) < 0.4 ? null : Math.abs(mv.x) > Math.abs(mv.y) ? (mv.x > 0 ? 'right' : 'left') : mv.y > 0 ? 'down' : 'up';
    if (dir !== this.navDir) {
      this.navDir = dir;
      this.navNext = now + 350;
      if (dir) this.navigate(dir);
    } else if (dir && now >= this.navNext) {
      this.navNext = now + 120;
      this.navigate(dir);
    }
    this.menu(hit);
  }

  private tick(toast: (msg: string) => void) {
    const gp = firstPad();
    if (!gp) {
      if (this.seen) {
        this.seen = '';
        this.prev = [];
        this.setMode(false);
        toast(t('Controle desconectado', 'Controller disconnected'));
      }
      return;
    }
    if (gp.id !== this.seen) {
      this.seen = gp.id;
      toast(t(`Controle conectado: ${padName(gp.id)} · Start abre as configurações (a aba Controle troca os botões)`, `Controller connected: ${padName(gp.id)} · Start opens settings (the Controller tab remaps the buttons)`));
    }
    const down = gp.buttons.map((b) => b.pressed);
    const prev = this.prev;
    this.prev = down; // every path below reads the previous frame through `prev` and ends with this one stored
    const hit = (b: number) => !!down[b] && !prev[b];
    // held scoreboard (View/Select by default), in both modes; while capturing a button it still releases (otherwise it stayed open)
    const board = padButtonOf('board');
    if (this.capture) {
      if (prev[board] && !down[board]) key('keyup', keyOf('board'));
      const b = down.findIndex((d, i) => d && !prev[i]);
      if (b >= 0) {
        const f = this.capture;
        this.capture = null;
        f(b);
      }
      return;
    }
    const mv = stick(gp.axes[0] ?? 0, gp.axes[1] ?? 0);
    const aimS = stick(gp.axes[2] ?? 0, gp.axes[3] ?? 0);
    if (down.some(Boolean) || mv.x || mv.y || aimS.x || aimS.y) this.setMode(true);
    const tauntPanel = () => $<HTMLElement>('.radial-picker:not([hidden])');
    const tauntButton = !$('.overlay') ? $('.hud-right .vol:has(.radial-picker) > button') : null;
    const opened = !!tauntButton && !tauntPanel() && hit(padButtonOf('taunt'));
    if (opened) tauntButton!.click();
    const panel = !$('.overlay') ? tauntPanel() : null;
    if (panel) {
      this.tauntWheel(panel, hit, mv, aimS, opened);
      if (prev[board] && !down[board]) key('keyup', keyOf('board'));
      return;
    }
    if (this.game?.enabled() && !$('.overlay')) {
      this.play(this.game, hit, mv, aimS);
      this.navDir = null;
    } else this.menuStep(down, mv, performance.now(), hit);
    if (hit(BTN.START)) start();
    if (!!down[board] !== !!prev[board]) key(down[board] ? 'keydown' : 'keyup', keyOf('board'));
  }
}

const pad = new Pad();
export const setPadCapture = (f: ((btn: number) => void) | null) => pad.setCapture(f);
export const isRumbleOn = () => pad.isRumbleOn();
export const setRumble = (on: boolean) => pad.setRumble(on);
export const rumble = (strong: number, ms: number) => pad.rumble(strong, ms);
export const setPadGame = (g: PadGame) => pad.setGame(g);
export const startPad = (toast: (msg: string) => void) => pad.start(toast);
