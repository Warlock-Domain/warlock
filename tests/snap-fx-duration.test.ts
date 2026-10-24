import { describe, expect, it } from 'vitest';
import { encodeSnap } from '../src/shared/snapshot.ts';
import { noSpells } from '../src/shared/spells.ts';
import { world } from './helpers.ts';

// a barra de efeitos (ui.ts) só mostra o relógio de quem vem em snap.fx
describe('snap.fx traz o prazo do Escudo e do véu da Ilusão', () => {
  it('Escudo (bit 2) e véu (bit 1024) com os segundos que faltam', () => {
    const w = world([[0, 0], [4, 0]], noSpells(), [], () => .5);
    w.wizards[0].shieldUntil = w.t + 1.5;
    w.wizards[0].veilUntil = w.t + 2;
    const fx = encodeSnap(w, 'p0', 0, []).fx!;
    expect(fx[fx.indexOf(2) + 1]).toBe(1.5);
    expect(fx[fx.indexOf(1024) + 1]).toBe(2);
  });
});
