import { describe, expect, it } from 'vitest';
import { AIM_MIN, AIM_RANGE, BTN, aimPoint, nextFocus, padAction, padName, stick, type Rect } from '../src/client/gamepad.ts';
import { labelOf, setPadMode, setSlots } from '../src/client/keys.ts';

// controle simulado: só o que o jogo lê (eixos e botões apertados)
const pad = (axes: number[], pressed: number[] = []) => ({ axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) });

describe('controle: analógico', () => {
  it('ignores the dead zone and keeps the direction outside it', () => {
    const p = pad([0.15, -0.1]);
    expect(stick(p.axes[0], p.axes[1])).toEqual({ x: 0, y: 0 });
    const s = stick(0.6, 0.8); // inclinação 1, apontando para baixo e à direita
    expect(Math.hypot(s.x, s.y)).toBeCloseTo(1);
    expect(s.y / s.x).toBeCloseTo(0.8 / 0.6);
  });

  it('applies a response curve (half tilt gives less than half)', () => {
    const half = stick(0.6, 0); // (0,6 − 0,2) / 0,8 = 0,5 → 0,5^1,6
    expect(half.x).toBeCloseTo(Math.pow(0.5, 1.6));
    expect(half.x).toBeLessThan(0.5);
    expect(stick(1.3, 0).x).toBeCloseTo(1); // eixo que passa de 1 não passa do alcance
  });

  it('aims at a distance proportional to the tilt, up to the typical range', () => {
    const me = { x: 2, y: 3 };
    expect(aimPoint(me, { x: 0, y: 0 })).toEqual(me);
    const full = aimPoint(me, { x: 0, y: -1 }); // analógico para cima = norte da tela = −y
    expect(full.x).toBeCloseTo(2);
    expect(full.y).toBeCloseTo(3 - AIM_RANGE);
    const small = aimPoint(me, { x: 0.1, y: 0 });
    expect(small.x - me.x).toBeCloseTo(AIM_MIN + (AIM_RANGE - AIM_MIN) * 0.1);
    expect(AIM_RANGE).toBeGreaterThan(6); // alcance da Bola de fogo (≈6,5 m)
  });
});

describe('controle: botões', () => {
  it('maps A B X Y LB RB to the bar slots and LT RT ↑ to the active items', () => {
    setSlots(['fireball', 'lightning', 'homing', 'shield', 'teleport', 'swap'], ['scourge', 'redirector', 'pact']);
    const p = pad([0, 0, 0, 0], [BTN.X]);
    expect(padAction(p.buttons.findIndex((b) => b.pressed))).toBe('homing');
    expect([BTN.A, BTN.B, BTN.Y, BTN.LB, BTN.RB].map(padAction)).toEqual(['fireball', 'lightning', 'shield', 'teleport', 'swap']);
    expect([BTN.LT, BTN.RT, BTN.UP].map(padAction)).toEqual(['scourge', 'redirector', 'pact']);
    expect([BTN.START, BTN.VIEW, BTN.DOWN].map(padAction)).toEqual([undefined, undefined, undefined]);
    setSlots(['fireball']);
    expect(padAction(BTN.B)).toBeUndefined(); // slot vazio não lança nada
  });

  it('shows the pad labels on the bar while the pad is in use', () => {
    setSlots(['fireball', 'homing'], ['scourge', 'redirector', 'pact']);
    setPadMode(true);
    expect([labelOf('fireball'), labelOf('homing'), labelOf('lightning'), labelOf('scourge'), labelOf('pact')]).toEqual(['A', 'B', '—', 'LT', '↑']);
    setPadMode(false);
    expect(labelOf('fireball')).toBe('Q');
  });

  it('shortens the controller name for the notice', () => {
    expect(padName('Xbox 360 Controller (XInput STANDARD GAMEPAD Vendor: 045e Product: 028e)')).toBe('Xbox 360 Controller');
    expect(padName('')).toBe('controle');
  });
});

describe('controle: foco nos menus', () => {
  // grade 3×2 de cartões (100×60, espaço de 10) e um botão Pronto à direita
  const cell = (row: number, col: number): Rect => ({ left: col * 110, top: row * 70, right: col * 110 + 100, bottom: row * 70 + 60 });
  const grid = [cell(0, 0), cell(0, 1), cell(0, 2), cell(1, 0), cell(1, 1), cell(1, 2)];
  const ready: Rect = { left: 400, top: 10, right: 520, bottom: 50 };
  const all = [...grid, ready];

  it('walks the shop grid by rows and columns', () => {
    expect(nextFocus(cell(0, 0), all, 'right')).toBe(1);
    expect(nextFocus(cell(0, 1), all, 'down')).toBe(4);
    expect(nextFocus(cell(1, 1), all, 'up')).toBe(1);
    expect(nextFocus(cell(1, 2), all, 'left')).toBe(4);
  });

  it('goes to the side panel at the end of a row and stops at the edges', () => {
    expect(nextFocus(cell(0, 2), all, 'right')).toBe(6);
    expect(nextFocus(cell(0, 0), all, 'left')).toBe(-1);
    expect(nextFocus(cell(0, 0), all, 'up')).toBe(-1);
  });
});
