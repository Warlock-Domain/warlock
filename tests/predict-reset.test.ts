import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPredict } from '../src/client/predict.ts';
import { DT } from '../src/shared/constants.ts';
import type { WizView } from '../src/shared/snapshot.ts';
import { v } from '../src/shared/vec.ts';

const snapshot = (x = 0, alive = true, vx = 0): WizView => ({ id: 'p', pos: v(x, 0), vel: v(vx, 0), hp: 1000, facing: 0, alive, shield: false, status: alive ? 1 : 0 });
afterEach(() => vi.restoreAllMocks());

describe('estado da previsão entre rodadas', () => {
  it('descarta o destino enfileirado durante um preparo da rodada anterior', () => {
    let ms = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => ms);
    const p = createPredict(), s = snapshot();
    p.frame(s, 0);
    p.hold(1);
    p.move(v(5, 0));
    p.reset();
    ms = 2000;
    expect(p.frame(s, DT)).toEqual(v(0, 0));
    p.move(v(5, 0));
    expect(p.frame(s, DT).x).toBeGreaterThan(0);
  });

  it('aceita uma ordem nova sem esperar o preparo antigo terminar', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const p = createPredict(), s = snapshot();
    p.frame(s, 0);
    p.hold(10);
    p.reset();
    p.frame(s, 0);
    p.move(v(0, 5));
    expect(p.frame(s, DT).y).toBeGreaterThan(0);
  });

  it('reinicia a vida no novo nascimento e usa só o novo impulso', () => {
    const p = createPredict();
    p.frame(snapshot(0, true, 1), DT);
    p.frame(snapshot(5, false), DT);
    p.reset();
    const s = snapshot(10, true, .5);
    expect(p.frame(s, DT).x).toBeCloseTo(10 + .5 * DT, 8);
    expect(s.pos).toEqual(v(10, 0));
  });

  it('preserva a estimativa de rede entre rodadas', () => {
    const p = createPredict();
    p.setRtt(200);
    const rtt = p.rtt();
    p.reset();
    expect(p.rtt()).toBe(rtt);
  });
});
