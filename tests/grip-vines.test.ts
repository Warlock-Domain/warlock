import { describe, expect, it } from 'vitest';
import { DT, HP_MAX } from '../src/shared/constants.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { noSpells, spellLevel } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

const mark = (spots: [number, number][] = [[0, 0], [4, 0]]) => {
  const w = world(spots, { ...noSpells(), grip: 1 }, [], () => .5);
  w.pillars = [];
  run(w, .2, [{ id: 'p0', kind: 'cast', spell: 'grip', at: v(4, 0) }]);
  return w;
};

describe('Agarrar com cipós em área', () => {
  it('marca o chão e espera 1,3 s antes de prender, sem projétil voando', () => {
    const w = mark(), p = w.projectiles.find((q) => q.kind === 'grip')!;
    expect(p.pos).toEqual(v(4, 0));
    expect(p.vel).toEqual(v(0, 0));
    expect(p.until - p.born!).toBeCloseTo(1.3, 8);
    while (w.t < p.until) {
      expect(w.wizards[1].gripUntil).toBe(0);
      stepWorld(w, [], () => .5);
    }
    stepWorld(w, [], () => .5);
    expect(w.wizards[1].gripUntil).toBeGreaterThan(w.t);
    expect(w.wizards[1].hp).toBe(HP_MAX);
    expect(w.events.some((e) => e.k === 'vines')).toBe(true);
  });

  it('prende vários inimigos na área, não o dono, aliado ou quem estiver fora', () => {
    const w = mark([[0, 0], [4, 0], [4, 1], [4, -1], [7, 0]]);
    w.wizards[0].team = w.wizards[3].team = 1;
    run(w, 1.3);
    expect(w.wizards.map((z) => z.gripUntil > w.t)).toEqual([false, true, true, false, false]);
  });

  it('permite escapar antes de os cipós nascerem e atinge quem entrar no ponto', () => {
    const w = mark([[0, 0], [4, 0], [7, 0]]);
    w.wizards[1].pos = v(7, 0);
    w.wizards[2].pos = v(4, 0);
    run(w, 1.3);
    expect(w.wizards[1].gripUntil).toBe(0);
    expect(w.wizards[2].gripUntil).toBeGreaterThan(w.t);
    expect(w.projectiles.some((p) => p.kind === 'grip')).toBe(false);
  });

  it('preserva a proteção do Escudo e da invulnerabilidade no instante da ativação', () => {
    const w = mark([[0, 0], [4, 0], [4, 1]]);
    w.wizards[1].shieldUntil = 5;
    w.wizards[2].invulnUntil = 5;
    run(w, 1.3);
    expect(w.wizards[0].gripUntil).toBe(0);
    expect(w.wizards[1].gripUntil).toBeGreaterThan(w.t); // Escudo agora reduz duração, não dá imunidade aos cipós.
    expect(w.wizards[2].gripUntil).toBe(0);
  });

  it('envia o raio e a contagem ao cliente e limita a marca ao alcance', () => {
    const w = world([[0, 0], [4, 0]], { ...noSpells(), grip: 1 }, [], () => .5);
    run(w, .2, [{ id: 'p0', kind: 'cast', spell: 'grip', at: v(99, 0) }]);
    const p = w.projectiles.find((q) => q.kind === 'grip')!;
    expect(p.pos.x).toBeCloseTo(spellLevel('grip', 1).range, 8);
    const view = decodeSnap(encodeSnap(w, 'p0', 0, []), ['p0', 'p1']).projectiles[0];
    expect(view.vel.x).toBe(1.5);
    expect(view.vel.y).toBeCloseTo(p.until - w.t, 2);
    expect(DT).toBeLessThan(view.vel.y);
  });
});
