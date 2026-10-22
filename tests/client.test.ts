import { describe, expect, it } from 'vitest';
import { DELAY, REPLAY_MAX, createInterp, keepLast } from '../src/client/interp.ts';
import { createPredict } from '../src/client/predict.ts';
import type { SnapView, WizView } from '../src/shared/snapshot.ts';
import { WIZ_SPEED } from '../src/shared/constants.ts';
import { v } from '../src/shared/vec.ts';
import { actionFor, labelOf, setSlotMode, setSlots } from '../src/client/keys.ts';
import { fxClock } from '../src/client/icons.ts';

const wiz = (x: number, extra: Partial<WizView> = {}): WizView => ({ id: 'a', pos: v(x, 0), vel: v(0, 0), hp: 100, facing: 0, alive: true, shield: false, status: 1, ...extra });
const snap = (time: number, x: number): SnapView => ({ time, arenaR: 11, shrinkAt: 15, wizards: [wiz(x)], projectiles: [], pillars: [], loots: [], runes: [] });

describe('interpolação', () => {
  it('draws between two server states, 66 ms in the past', () => {
    const it = createInterp();
    it.push(snap(1.0, 0), 10.0);
    it.push(snap(1.1, 1), 10.1);
    // agora = 10.116 → tempo do servidor 1.116 − 0.066 = 1.05: metade do caminho
    expect(it.sample(10.116)!.wizards[0].pos.x).toBeCloseTo(0.5, 1);
  });

  it('starts over when a new round resets the clock', () => {
    const it = createInterp();
    it.push(snap(40, 5), 10);
    it.push(snap(0, 0), 10.1);
    expect(it.latest()!.time).toBe(0);
    expect(it.sample(10.2)!.wizards[0].pos.x).toBe(0);
  });
});

describe('relógio dos efeitos', () => {
  it('shows the seconds left and the fraction of the longest time seen; renewing restarts it', () => {
    const clock = fxClock();
    expect(clock([4, 6], 4)).toEqual({ text: '6', frac: 1 });
    expect(clock([4, 3], 4)).toEqual({ text: '3', frac: 0.5 });
    expect(clock([4, 0.4], 4)).toEqual({ text: '0.4', frac: 0.4 / 6 });
    expect(clock([], 4)).toBeNull(); // acabou (ou efeito sem prazo)
    expect(clock([4, 2], 4)).toEqual({ text: '2', frac: 1 }); // renovou: novo total
    // dois relógios com os mesmos dados dão os mesmos números (barra de baixo e em cima do mago)
    const a = fxClock(), b = fxClock();
    for (const fx of [[1024, 3], [1024, 1.5], [1024, 0.2]]) expect(a(fx, 1024)).toEqual(b(fx, 1024));
  });
});

describe('replay da queda', () => {
  it('o trecho guarda 180 estados (6 s) e interpola no meio, no tempo do servidor', () => {
    expect(REPLAY_MAX).toBe(180);
    const it = createInterp(REPLAY_MAX);
    for (let i = 0; i <= 200; i++) it.push(snap(i / 30, i), i / 30);
    // o estado 0 saiu (201 entraram): pedir o começo devolve o mais antigo que ficou, o 21
    expect(it.sample(0 + DELAY)!.wizards[0].pos.x).toBe(21);
    expect(it.sample(100.5 / 30 + DELAY)!.wizards[0].pos.x).toBeCloseTo(100.5, 5);
  });

  it('o buffer da partida fica só com os últimos 6 s', () => {
    const ring: SnapView[] = [];
    for (let i = 0; i < 600; i++) keepLast(ring, snap(i / 30, 0), REPLAY_MAX);
    expect(ring.length).toBe(180);
    expect(ring[ring.length - 1].time - ring[0].time).toBeCloseTo(179 / 30, 5);
    expect(ring[0].time).toBeCloseTo(420 / 30, 5);
  });
});

describe('previsão', () => {
  it('walks immediately on click', () => {
    const p = createPredict();
    p.frame(wiz(0), 0.016);
    p.move(v(5, 0));
    expect(p.frame(wiz(0), 0.1).x).toBeCloseTo(WIZ_SPEED * 0.1, 3);
  });

  it('follows the server while being pushed', () => {
    const p = createPredict();
    p.frame(wiz(0), 0.016);
    let x = 0;
    for (let i = 0; i < 20; i++) x = p.frame(wiz(3, { vel: v(6, 0) }), 0.016).x;
    expect(x).toBeGreaterThan(2.9);
  });

  it('pulls back when far from the server', () => {
    const p = createPredict();
    p.frame(wiz(0), 0.016);
    p.teleported(v(4, 0));
    let x = 4;
    for (let i = 0; i < 40; i++) x = p.frame(wiz(0), 0.016).x;
    expect(x).toBeLessThan(1);
  });
});

describe('teclas Q W E R A S D F', () => {
  it('in slot mode the equipped spells follow the bar order', () => {
    setSlotMode(true);
    setSlots(['fireball', 'gravity', 'swap', null, 'pact']);
    expect(actionFor('KeyQ')).toBe('fireball');
    expect(actionFor('KeyW')).toBe('gravity');
    expect(actionFor('KeyE')).toBe('swap');
    expect(actionFor('KeyR')).toBeUndefined();
    expect(actionFor('KeyA')).toBe('pact');
    expect(actionFor('KeyS')).toBeUndefined();
    expect(labelOf('pact')).toBe('A');
    expect(labelOf('gravity')).toBe('W');
    setSlotMode(false);
    expect(actionFor('KeyW')).toBe('lightning');
  });
});
