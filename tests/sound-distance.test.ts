import { describe, expect, it } from 'vitest';
import { distanceVolume } from '../src/client/sound-distance.ts';

describe('som pela distância do personagem', () => {
  it('perto mantém intensidade, longe reduz continuamente e fora do alcance silencia', () => {
    const levels = [0, 2, 4, 8, 16, 23, 24, 100].map((x) => distanceVolume({ x: 0, y: 0 }, { x, y: 0 }));
    expect(levels.slice(0, 2)).toEqual([1, 1]);
    for (let i = 2; i < 7; i++) expect(levels[i]).toBeLessThan(levels[i - 1]);
    expect(levels.slice(-2)).toEqual([0, 0]);
  });
  it('segue a posição do jogador, com mesma resposta em qualquer direção', () => {
    const source = { x: 10, y: 0 };
    expect(distanceVolume(source, source)).toBe(1);
    expect(distanceVolume({ x: 0, y: 0 }, source)).toBeCloseTo(distanceVolume({ x: 0, y: 0 }, { x: 0, y: -10 }));
    expect(distanceVolume({ x: 9, y: 0 }, source)).toBeGreaterThan(distanceVolume({ x: 0, y: 0 }, source));
  });
  it('não inventa posição ausente e mantém modo neutro para espectador', () => {
    expect(distanceVolume(null, { x: 1, y: 1 })).toBe(.6);
    expect(distanceVolume({ x: 0, y: 0 }, null)).toBe(0);
    expect(distanceVolume({ x: NaN, y: 0 }, { x: 1, y: 1 })).toBe(0);
  });
});
