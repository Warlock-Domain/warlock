import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPredict } from '../src/client/predict.ts';
import { DT } from '../src/shared/constants.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { decodeSnap, encodeSnap, type WizView } from '../src/shared/snapshot.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

afterEach(() => vi.restoreAllMocks());
const setup = (range = 3) => {
  const w = world([[0, 0], [range, 0]], noSpells(), [], () => .5);
  w.pillars = []; w.runes = []; w.shrinkAt = Infinity;
  const p = createPredict();
  const snap = (): WizView => decodeSnap(encodeSnap(w, 'p0', 0, []), ['p0', 'p1']).wizards[0];
  p.frame(snap(), 0); p.move(v(5, 0));
  stepWorld(w, [{ id: 'p0', kind: 'move', to: v(5, 0) }], () => .5);
  return { w, p, snap };
};

describe('authoritative Attack movement', () => {
  it.each(['far', 'dead', 'hidden', 'ally', 'cooldown', 'wall'])('keeps walking after a rejected %s attack', (reason) => {
    const { w, p, snap } = setup(reason === 'far' ? 10 : 3);
    if (reason === 'dead') w.wizards[1].alive = false;
    if (reason === 'hidden') w.wizards[1].veilUntil = 5;
    if (reason === 'ally') w.wizards.forEach(z => z.team = 1);
    if (reason === 'cooldown') w.wizards[0].basicReadyAt = 5;
    if (reason === 'wall') w.pillars.push({ pos: v(1.5, 0), kind: 'rock', hp: 400, alive: true });
    stepWorld(w, [{ id: 'p0', kind: 'basic', at: v(3, 0), target: 'p1' }], () => .5);
    expect(w.wizards[0].basicCasting).toBeUndefined();
    for (let i = 0; i < 8; i++) { stepWorld(w, [], () => .5); p.frame(snap(), DT); }
    expect(p.frame(snap(), 0).x).toBeCloseTo(w.wizards[0].pos.x, 1);
    expect(w.wizards[0].target).not.toBeNull();
  });

  it.each([false, true])('stops for a confirmed attack, including melee arc=%s', (arc) => {
    const { w, p, snap } = setup();
    w.wizards[0].arc = arc;
    // The local wizard keeps walking for 200 ms while the confirmation travels.
    const pre = snap();
    for (let i = 0; i < 12; i++) p.frame(pre, DT);
    stepWorld(w, [{ id: 'p0', kind: 'basic', at: v(3, 0) }], () => .5);
    expect(snap().basicLeft).toBeGreaterThan(0);
    const stopped = w.wizards[0].pos.x;
    expect(p.frame(snap(), 0).x - snap().pos.x).toBeGreaterThan(.1);
    // The confirmed windup pulls it back to the server position.
    for (let i = 0; i < 20; i++) { stepWorld(w, [], () => .5); p.frame(snap(), DT); }
    expect(w.wizards[0].pos.x).toBeCloseTo(stopped, 8);
    expect(p.frame(snap(), 0).x).toBeCloseTo(snap().pos.x, 3);
  });

  it.each([50, 150, 300])('preserves newer movement across a %s ms delayed confirmation', (latency) => {
    let ms = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => ms);
    const { w, p, snap } = setup();
    stepWorld(w, [{ id: 'p0', kind: 'basic', at: v(3, 0) }], () => .5);
    const delayed = snap();
    p.frame(delayed, 0);
    p.move(v(-5, 0));
    ms += latency;
    const before = p.frame(delayed, 0).x;
    // A newer snapshot can still precede the acknowledgement of the cancelling move.
    expect(p.frame({ ...delayed }, DT, true).x).toBeLessThan(before);
    stepWorld(w, [{ id: 'p0', kind: 'move', to: v(-5, 0) }], () => .5);
    const after = p.frame(snap(), DT).x;
    expect(p.frame(snap(), DT).x).toBeLessThan(after);
  });

  it.each(['stop', 'cast'] as const)('does not let a delayed Attack override a newer %s', (kind) => {
    let ms = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => ms);
    const { w, p, snap } = setup();
    stepWorld(w, [{ id: 'p0', kind: 'basic', at: v(3, 0) }], () => .5);
    const delayed = snap();
    p.frame(delayed, 0);
    p.stop();
    if (kind === 'cast') p.hold(1);
    p.move(v(-5, 0));
    const before = p.frame(delayed, 0).x;
    const late = { ...delayed };
    p.frame(late, DT, true);
    if (kind === 'cast') {
      expect(p.frame(late, DT, true).x).toBe(before);
      ms = 1100;
    }
    expect(p.frame(late, DT, true).x).toBeLessThan(before);
  });

  it('does not replay a confirmed windup on every render frame', () => {
    const { w, p, snap } = setup();
    stepWorld(w, [{ id: 'p0', kind: 'basic', at: v(3, 0) }], () => .5);
    const s = snap();
    p.frame(s, 0);
    p.move(v(-5, 0));
    // The move raises attackCancelSeq in main.ts, so frames before its acknowledgement pass basicCancelled.
    expect(p.frame(s, DT, true).x).toBeLessThan(0);
  });
});
