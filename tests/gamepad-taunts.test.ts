import { afterEach, describe, expect, it, vi } from 'vitest';
import { BTN, setPadGame, startPad } from '../src/client/gamepad.ts';
import { resetPad, setPadMode } from '../src/client/keys.ts';

afterEach(() => { vi.unstubAllGlobals(); setPadMode(false); resetPad(); });

describe('provocações pelo controle', () => {
  it('abre com ←, o direcional anda de 1 em 1, o analógico aponta, A confirma e B cancela sem ações de jogo', () => {
    resetPad();
    let next: FrameRequestCallback;
    let pressed: number[] = [], axes = [0, 0, 0, 0];
    const doc = { activeElement: null as unknown, documentElement: { classList: { toggle: vi.fn() } }, querySelector: (selector: string): unknown => {
      if (selector.includes('.hud-right')) return trigger;
      if (selector.includes('.radial-picker')) return panel.hidden ? null : panel;
      return null;
    } };
    const buttons = Array.from({ length: 15 }, () => ({ focus: vi.fn(function(this: unknown) { doc.activeElement = this; }), click: vi.fn(() => { panel.hidden = true; }) }));
    const panel = { hidden: true, querySelectorAll: () => buttons };
    const trigger = { click: () => { panel.hidden = false; } };
    vi.stubGlobal('document', doc);
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { next = fn; return 1; });
    vi.stubGlobal('addEventListener', vi.fn());
    vi.stubGlobal('navigator', { getGamepads: () => [{ connected: true, id: 'Taunt pad', axes,
      buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i) })) }] });
    const move = vi.fn(), cast = vi.fn();
    setPadGame({ enabled: () => true, me: () => ({ x: 0, y: 0 }), move, stop: vi.fn(), cast, center: vi.fn(), aim: vi.fn(), padRange: vi.fn() });
    const frame = (down: number[], sticks = [0, 0, 0, 0]) => { pressed = down; axes = sticks; next!(0); };
    startPad(vi.fn());
    frame([BTN.LEFT]); expect(panel.hidden).toBe(false);
    frame([]); frame([BTN.RIGHT]); expect(doc.activeElement).toBe(buttons[0]);
    frame([]); frame([BTN.DOWN]); expect(doc.activeElement).toBe(buttons[1]);
    frame([]); frame([BTN.UP]); frame([]); frame([BTN.UP]); expect(doc.activeElement).toBe(buttons[14]);
    frame([], [0, 0, 1, 0]); expect(doc.activeElement).toBe(buttons[4]);
    frame([BTN.A]); expect(buttons[4].click).toHaveBeenCalledOnce();
    frame([]); frame([BTN.LEFT]); frame([BTN.B]); expect(panel.hidden).toBe(true);
    expect(move).not.toHaveBeenCalled(); expect(cast).not.toHaveBeenCalled();
  });
});
