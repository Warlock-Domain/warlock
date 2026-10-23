import { describe, expect, it, vi } from 'vitest';
import source from '../src/client/scene.ts?raw';

describe('destruição visual no ponto do projétil', () => {
  it('amplia o impacto simples, sem mudar o raio recebido do servidor', () => {
    const branch = source.split("} else if (e.k === 'clash') {")[1].split('        groundMark')[0];
    const explosion=vi.fn(), shockwave=vi.fn(), event={ x: 2, y: 3, combo: 'pulse', r: .6 };
    new Function('e','v','explosion','shockwave',branch)(event, (x: number,y: number)=>({x,y}), explosion, shockwave);
    expect(explosion).toHaveBeenCalledWith({x:2,y:3});
    expect(shockwave).toHaveBeenCalledWith({x:2,y:3},1.5,'#b98cff');
    expect(event.r).toBe(.6);
  });
});
