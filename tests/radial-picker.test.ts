import { describe, expect, it } from 'vitest';
import { radialHold, radialIndex } from '../src/client/taunt-wheel.ts';
import { TAUNTS } from '../src/shared/taunts.ts';

describe('seletor radial', () => {
  it('segura a tecla e confirma somente uma vez ao soltá-la, ignorando repetição e outras teclas', () => {
    const hold = radialHold();
    expect(hold.press('KeyY')).toBe(true);
    expect(hold.press('KeyY')).toBe(false);
    expect(hold.active()).toBe(true);
    expect(hold.release('KeyQ')).toBe(false);
    expect(hold.active()).toBe(true);
    expect(hold.release('KeyY')).toBe(true);
    expect(hold.active()).toBe(false);
    expect(hold.release('KeyY')).toBe(false);
  });
  it('cancelar impede envio ao soltar e respeita um atalho remapeado', () => {
    const hold = radialHold();
    hold.press('KeyP');
    expect(hold.release('KeyY')).toBe(false);
    hold.cancel();
    expect(hold.release('KeyP')).toBe(false);
    expect(hold.press('KeyP')).toBe(true);
    expect(hold.release('KeyP')).toBe(true);
  });
  it('começa em cima e alcança todas as provocações do catálogo no sentido horário', () => {
    for (const count of [8, 10, TAUNTS.length]) {
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2;
        expect(radialIndex(Math.sin(angle), -Math.cos(angle), count)).toBe(i);
      }
    }
  });
  it('mantém o centro neutro e recusa catálogo vazio', () => {
    expect(radialIndex(0, 0, 10)).toBeNull();
    expect(radialIndex(0.1, -0.1, 10)).toBeNull();
    expect(radialIndex(1, 0, 0)).toBeNull();
  });
  it('volta ao primeiro setor ao cruzar o norte sem índices negativos', () => {
    expect(radialIndex(-0.01, -1, 10)).toBe(0);
    expect(radialIndex(0.01, -1, 10)).toBe(0);
    expect(radialIndex(-1, 0, 8)).toBe(6);
    expect(radialIndex(0, 1, 8)).toBe(4);
  });
});
