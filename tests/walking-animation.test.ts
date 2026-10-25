import { describe, expect, it } from 'vitest';
import { WALKING_BIT, decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

describe('animação de caminhada não confunde empurrão com comando', () => {
  it.each([0, .4, 1.4, 4.5])('sem destino, velocidade residual %s não marca caminhada', (speed) => {
    const w = world([[0, 0]], noSpells(), [], () => .5);
    w.wizards[0].vel = v(speed, 0);
    const shown = decodeSnap(encodeSnap(w, 'p0', 0, []), ['p0']).wizards[0];
    expect(shown.status & WALKING_BIT).toBe(0);
  });
  it('comando de caminhada é marcado mesmo junto de impulso fraco', () => {
    const w = world([[0, 0]], noSpells(), [], () => .5);
    const z = w.wizards[0];
    z.target = v(0, 5);
    z.vel = v(.4, 0);
    expect(encodeSnap(w, 'p0', 0, []).w[6] & WALKING_BIT).toBe(WALKING_BIT);
    z.vel = v(5, 0);
    expect(encodeSnap(w, 'p0', 0, []).w[6] & WALKING_BIT).toBe(0);
  });
  it('parado no destino, morto ou sem velocidade de caminhada não corre', () => {
    const w = world([[0, 0]], noSpells(), [], () => .5);
    const z = w.wizards[0];
    z.target = { ...z.pos };
    expect(encodeSnap(w, 'p0', 0, []).w[6] & WALKING_BIT).toBe(0);
    z.target = v(0, 5);
    z.speed = 0;
    expect(encodeSnap(w, 'p0', 0, []).w[6] & WALKING_BIT).toBe(0);
    z.speed = 1;
    z.alive = false;
    expect(encodeSnap(w, 'p0', 0, []).w[6] & WALKING_BIT).toBe(0);
  });
});
