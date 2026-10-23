import { describe, expect, it } from 'vitest';
import { createPredict } from '../src/client/predict.ts';
import { DT } from '../src/shared/constants.ts';
import { DASHING_BIT, decodeSnap, encodeSnap, type WizView } from '../src/shared/snapshot.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { noSpells, RUSH } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

const snap = (x: number, dash: boolean, vx = 0, vy = 0): WizView => ({ id: 'p0', pos: v(x, 0), vel: v(vx, vy), hp: 1000, facing: 0, alive: true, shield: false, status: 1 | (dash ? DASHING_BIT : 0) });

describe('Investida sem cauda de movimento na previsão', () => {
  it.each([30, 60, 144])('para no destino do servidor ao acabar o avanço, sem comando (%s FPS)', (fps) => {
    const w = world([[0, 0]], { ...noSpells(), rush: 1 }, [], () => .5);
    const p = createPredict();
    const view = () => decodeSnap(encodeSnap(w, 'p0', 0, []), ['p0']).wizards[0];
    let latest = view(), tick = 0;
    p.frame(latest, 0);
    for (let frame = 1; frame <= fps; frame++) {
      while ((tick + 1) * DT <= frame / fps + 1e-9) {
        stepWorld(w, tick === 0 ? [{ id: 'p0', kind: 'cast', spell: 'rush', at: v(10, 0) }] : [], () => .5);
        if (++tick % 2 === 0) latest = view();
      }
      const shown = p.frame(latest, 1 / fps);
      if (frame / fps >= .25) expect(shown).toEqual(v(3, 0));
    }
  });
  it('não apaga novo comando de caminhada recebido durante o avanço', () => {
    const p = createPredict();
    p.frame(snap(0, true, 15), 0);
    p.setSpeed(2);
    p.move(v(3, 5));
    const shown = p.frame(snap(3, false), DT);
    expect(shown.x).toBe(3);
    expect(shown.y).toBeGreaterThan(0);
  });
  it('não apaga um knockback real no término da Investida', () => {
    const p = createPredict();
    p.frame(snap(0, true, 15), 0);
    expect(p.frame(snap(3, false, 0, 5), DT)).toEqual(v(3, 0));
    expect(p.frame({ ...snap(3, false, 0, 5), pos: v(3, 1) }, DT).y).toBeGreaterThan(0);
  });
  it('servidor para sem impulso físico e sinaliza só o avanço, não todo o buff', () => {
    const w = world([[0, 0]], { ...noSpells(), rush: 1 }, [], () => .5);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'rush', at: v(10, 0) }], () => .5);
    expect(encodeSnap(w, 'p0', 0, []).w[6] & DASHING_BIT).toBe(DASHING_BIT);
    for (let i = 0; i < 30; i++) stepWorld(w, [], () => .5);
    const z = w.wizards[0], view = decodeSnap(encodeSnap(w, 'p0', 0, []), ['p0']).wizards[0];
    expect(z.pos.x).toBeCloseTo(RUSH.dash, 9);
    expect(z.target).toBeNull();
    expect(z.vel).toEqual(v(0, 0));
    expect(view.status & DASHING_BIT).toBe(0);
    expect(view.status & 256).toBe(256);
  });
});
