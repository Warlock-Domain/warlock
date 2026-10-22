import { describe, expect, it } from 'vitest';
import { demoStep, demoWorld } from '../src/client/demo.ts';
import { GRIP } from '../src/shared/spells.ts';

describe('prévia do Agarrar em área', () => {
  it('mostra a marca fixa, espera1,3s e mantém dois alvos presos antes do golpe que solta', () => {
    const s = demoWorld('grip');
    while (s.w.t < .8) demoStep(s);
    const mark = s.w.projectiles.find((p) => p.kind === 'grip')!;
    expect(mark).toBeTruthy();
    const point = { ...mark.pos };
    expect(mark.until - mark.born!).toBeCloseTo(GRIP.delay);
    while (s.w.t < mark.until) {
      expect(mark.pos).toEqual(point);
      expect(s.w.wizards[1].gripUntil).toBe(0);
      demoStep(s);
    }
    demoStep(s);
    expect(s.events.some((e) => e.k === 'vines')).toBe(true);
    const positions = s.w.wizards.slice(1).map((z) => ({ ...z.pos }));
    while (s.w.t < 2.8) {
      demoStep(s);
      for (const [i, z] of s.w.wizards.slice(1).entries()) {
        expect(z.gripUntil).toBeGreaterThan(s.w.t);
        expect(z.pos).toEqual(positions[i]);
      }
    }
  });

  it('mostra um alvo solto pelo golpe e outro pelo fim da duração', () => {
    const s = demoWorld('grip');
    while (s.w.t < 3.7) demoStep(s);
    const rootedY = s.w.wizards[2].pos.y;
    expect(s.w.wizards[1].gripUntil).toBeLessThanOrEqual(s.w.t);
    expect(s.w.wizards[2].gripUntil).toBeGreaterThan(s.w.t);
    while (s.w.t < 4.5) demoStep(s);
    expect(s.w.wizards[2].gripUntil).toBeLessThan(s.w.t);
    expect(s.w.wizards[2].pos.y).toBeGreaterThan(rootedY);
  });
});
