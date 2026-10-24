import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPredict } from '../src/client/predict.ts';
import { DT, WIZ_R } from '../src/shared/constants.ts';
import type { Ground, NightMap } from '../src/shared/levels.ts';
import type { WizView } from '../src/shared/snapshot.ts';
import { v } from '../src/shared/vec.ts';

const snapshot = (x = 0, alive = true, vx = 0): WizView => ({ id: 'p', pos: v(x, 0), vel: v(vx, 0), hp: 1000, facing: 0, alive, shield: false, status: alive ? 1 : 0 });
afterEach(() => vi.restoreAllMocks());

describe('estado da previsão entre rodadas', () => {
  it('keeps detached public callbacks bound to the predictor state', () => {
    let ms = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => ms);
    const { frame, setMap, setRtt, rtt, setSpeed, hold, move, stop, teleported, reset } = createPredict();
    const s = snapshot();
    frame(s, 0);
    setMap(null);
    setRtt(200);
    setSpeed(1);
    hold(1);
    move(v(5, 0));
    expect(frame(s, DT)).toEqual(v(0, 0));
    ms = 2000;
    expect(frame(s, DT).x).toBeCloseTo(DT, 8);
    stop();
    expect(frame(s, DT).x).toBeCloseTo(DT, 8);
    teleported(v(.1, 0));
    expect(frame(s, 0)).toEqual(v(.1, 0));
    reset();
    expect(frame(s, 0)).toEqual(v(0, 0));
    expect(rtt()).toBeCloseTo(.12, 8);
  });

  it('isolates queued targets and RTT when another predictor resets', () => {
    let ms = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => ms);
    const first = createPredict(), second = createPredict();
    const a = snapshot(), b = snapshot();
    first.frame(a, 0);
    second.frame(b, 0);
    first.setRtt(200);
    first.hold(1);
    first.move(v(5, 0));
    second.hold(1);
    second.move(v(0, 5));
    first.reset();
    ms = 2000;
    expect(first.frame(a, DT)).toEqual(v(0, 0));
    expect(second.frame(b, DT).y).toBeGreaterThan(0);
    expect(first.rtt()).toBeCloseTo(.12, 8);
    expect(second.rtt()).toBe(.1);
  });

  it('retains terrain and room lock across reset, and updates the lock for the same map', () => {
    const map: NightMap = {
      w: 8, h: 8,
      ground: Array.from({ length: 8 }, () => Array<Ground>(8).fill('floor')),
      marks: [{ kind: 'start', x: 2, y: 2, room: 0 }],
      rooms: [],
    };
    const p = createPredict(), s = { ...snapshot(), pos: v(2, 2) };
    p.setMap(map, { x: 0, y: 0, w: 5, h: 5 });
    p.reset();
    p.frame(s, 0);
    p.setSpeed(10);
    p.move(v(7, 2));
    const locked = p.frame(s, 1);
    expect(locked.x).toBeGreaterThan(2);
    expect(locked.x).toBeLessThanOrEqual(4 - WIZ_R);

    p.setMap(map);
    p.reset();
    p.frame(s, 0);
    p.setSpeed(10);
    p.move(v(7, 2));
    expect(p.frame(s, 1).x).toBeGreaterThan(4 - WIZ_R);
  });

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
