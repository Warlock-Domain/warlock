import { describe, expect, it } from 'vitest';
import { createInterp } from '../src/client/interp.ts';
import { createPredict } from '../src/client/predict.ts';
import type { SnapView, WizView } from '../src/shared/snapshot.ts';
import { WIZ_SPEED } from '../src/shared/constants.ts';
import { v } from '../src/shared/vec.ts';
import { actionFor, labelOf, setSlotMode, setSlots } from '../src/client/keys.ts';

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

describe('teclas Q W E R D F', () => {
  it('in slot mode the equipped spells follow the bar order and items keep their keys', () => {
    setSlotMode(true);
    setSlots(['fireball', 'gravity', 'swap']);
    expect(actionFor('KeyQ')).toBe('fireball');
    expect(actionFor('KeyW')).toBe('gravity');
    expect(actionFor('KeyE')).toBe('swap');
    expect(actionFor('KeyR')).toBeUndefined();
    expect(actionFor('Digit1')).toBe('scourge');
    expect(labelOf('gravity')).toBe('W');
    setSlotMode(false);
    expect(actionFor('KeyW')).toBe('lightning');
  });
});
