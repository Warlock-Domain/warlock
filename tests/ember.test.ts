import { describe, expect, it } from 'vitest';
import { EMBER } from '../src/shared/campaign.ts';
import { HP_MAX } from '../src/shared/constants.ts';
import { nightMap } from '../src/shared/levels.ts';
import { addPlayer, newMatch, startMatch, tickMatch, type Match } from '../src/shared/match.ts';
import { mulberry32 } from '../src/shared/rng.ts';
import type { SimEvent } from '../src/shared/sim.ts';
import { encodeSnap } from '../src/shared/snapshot.ts';
import { add, v } from '../src/shared/vec.ts';
import { STEP_MS, toPlaying } from './helpers.ts';

function night(humans = ['a', 'b']): { m: Match; now: number } {
  const m = newMatch();
  for (const id of humans) addPlayer(m, id, id);
  startMatch(m, 0, 0, 'campaign', true, mulberry32(1));
  return { m, now: toPlaying(m, 0) };
}
const wiz = (m: Match, id: string) => m.world!.wizards.find((z) => z.id === id)!;
function step(m: Match, now: number, n = 1, events: SimEvent[] = []): number {
  for (let i = 0; i < n; i++) events.push(...tickMatch(m, (now += STEP_MS), [], () => 0.5));
  return now;
}
// derruba o Aceso (no mapa não há lava)
const down = (m: Match, id: string) => Object.assign(wiz(m, id), { hp: -1, invulnUntil: 0 });

describe('reacender', () => {
  it('a fallen Aceso becomes an ember; an ally next to it for 3 s brings him back with half health', () => {
    let { m, now } = night();
    const a = wiz(m, 'a'), b = wiz(m, 'b');
    b.pos = add(a.pos, v(3, 0));
    down(m, 'a');
    now = step(m, now);
    expect(a.alive).toBe(false);
    expect(a.ember).toMatchObject({ prog: 0, need: EMBER.base });
    expect(encodeSnap(m.world!, 'b', 0, []).em?.[m.world!.wizards.indexOf(a)]).toBe(0);
    // longe: nada acontece
    now = step(m, now, 60 * 4);
    expect(a.alive).toBe(false);
    // perto por 3 s
    b.pos = add(a.pos, v(0.8, 0));
    const events: SimEvent[] = [];
    now = step(m, now, 60 * EMBER.base - 5, events);
    expect(a.alive).toBe(false);
    now = step(m, now, 10, events);
    expect(a.alive).toBe(true);
    expect(a.hp).toBeCloseTo(HP_MAX * EMBER.hp, 0);
    expect(a.invulnUntil).toBeGreaterThan(m.world!.t + 1.5);
    expect(a.ember).toBeUndefined();
    expect(events.some((e) => e.k === 'ember' && e.what === 'lit' && e.id === 'a')).toBe(true);
    expect(encodeSnap(m.world!, 'b', 0, []).em).toBeUndefined();
  });

  it('falling in the lava leaves the ember on the last firm ground', () => {
    let { m, now } = night();
    const n = nightMap(m.night!.seed, m.night!.stage), lava = n.ground.flatMap((row, y) => row.map((g, x) => ({ g, x, y }))).find((c) => c.g === 'lava')!;
    const a = wiz(m, 'a');
    Object.assign(a, { pos: v(lava.x + 0.5, lava.y + 0.5), safe: v(3, 3), hp: -1, invulnUntil: 0 });
    now = step(m, now);
    expect(a.alive).toBe(false);
    expect(a.pos).toEqual(v(3, 3));
  });

  it('stepping away resets the progress', () => {
    let { m, now } = night();
    const a = wiz(m, 'a'), b = wiz(m, 'b');
    down(m, 'a');
    now = step(m, now);
    b.pos = add(a.pos, v(0.5, 0));
    now = step(m, now, 60 * 2);
    expect(a.ember!.prog).toBeGreaterThan(1.9);
    b.pos = add(a.pos, v(3, 0));
    now = step(m, now);
    expect(a.ember!.prog).toBe(0);
    b.pos = add(a.pos, v(0.5, 0));
    now = step(m, now, 60 * 2);
    expect(a.alive).toBe(false); // recomeçou do zero
  });

  it('each fall in the same encounter costs 1 s more', () => {
    let { m, now } = night();
    const a = wiz(m, 'a'), b = wiz(m, 'b');
    // abre o encontro da entrada; os servos ficam sem atirar para não derrubar ninguém por conta própria
    const n = nightMap(m.night!.seed, m.night!.stage), cp = n.marks.find((q) => q.kind === 'checkpoint')!;
    b.invulnUntil = 1e9;
    a.pos = v(cp.x + 1, cp.y + 0.5);
    now = step(m, now);
    expect(m.night!.fight).not.toBeNull();
    const calm = () => {
      for (const z of m.world!.wizards) if (z.team === 1) for (const k of Object.keys(z.cd)) z.cd[k as keyof typeof z.cd] = 1e9;
    };
    for (const k of [0, 1, 2]) {
      calm();
      down(m, 'a');
      now = step(m, now);
      expect(a.ember!.need, `queda ${k + 1}`).toBe(EMBER.base + EMBER.perFall * k);
      b.pos = add(a.pos, v(0.5, 0));
      const steps = Math.ceil(60 * a.ember!.need) + 2;
      for (let i = 0; i < steps; i++) {
        calm();
        now = step(m, now);
      }
      expect(a.alive).toBe(true);
      a.invulnUntil = 1e9;
    }
  });

  it('falls outside an encounter do not raise the cost', () => {
    let { m, now } = night();
    const a = wiz(m, 'a'), b = wiz(m, 'b');
    for (const k of [0, 1]) {
      down(m, 'a');
      now = step(m, now);
      expect(a.ember!.need, `queda ${k + 1}`).toBe(EMBER.base);
      b.pos = add(a.pos, v(0.5, 0));
      now = step(m, now, Math.ceil(60 * a.ember!.need) + 2);
    }
  });

  it('in the boss arena an ember inside goes out after 20 s; all Acesos down still loses the night', () => {
    let { m, now } = night(['a', 'b', 'c']);
    const n = nightMap(m.night!.seed, m.night!.stage), r = n.rooms.find((q) => q.room.pool === 'chefe')!;
    for (const id of ['a', 'b', 'c']) Object.assign(wiz(m, id), { pos: v(r.x + 5, r.y + 4), invulnUntil: 1e9 });
    now = step(m, now); // a luta abre e puxa todos para dentro
    const a = wiz(m, 'a'), b = wiz(m, 'b');
    for (const z of m.world!.wizards.filter((q) => q.team === 1)) z.invulnUntil = 1e9; // o chefe fica, mas não importa aqui
    down(m, 'a');
    now = step(m, now);
    b.pos = add(a.pos, v(6, 0));
    const events: SimEvent[] = [];
    now = step(m, now, 60 * (EMBER.out + 1), events);
    expect(a.ember?.out).toBe(true);
    expect(events.some((e) => e.k === 'ember' && e.what === 'out' && e.id === 'a')).toBe(true);
    // apagada: nem perto volta
    b.pos = add(a.pos, v(0.5, 0));
    now = step(m, now, 60 * 5);
    expect(a.alive).toBe(false);
    for (const id of ['b', 'c']) Object.assign(wiz(m, id), { hp: -1, invulnUntil: 0 });
    now = step(m, now, 2);
    expect(m.night!.result).toBe('lost');
  });
});
