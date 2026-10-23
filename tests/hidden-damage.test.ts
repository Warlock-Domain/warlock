import { describe, expect, it, vi } from 'vitest';
import { sandboxVisibility, showHitDamage } from '../src/client/screen-data.ts';
import source from '../src/client/scene.ts?raw';

describe('números de dano respeitam a invisibilidade do observador', () => {
  it.each([2048, 2048 | 16, 2048 | 16777216])('oculta números no estado %s', (status) => {
    expect(showHitDamage(status)).toBe(false);
  });
  it.each([0, 1024, 8388608])('preserva números de alvos visíveis ou translúcidos: %s', (status) => {
    expect(showHitDamage(status)).toBe(true);
  });
  it('segue a opção de visão da sandbox sem esconder o dano do próprio jogador', () => {
    expect(showHitDamage(sandboxVisibility(1024, false, true, false))).toBe(false);
    expect(showHitDamage(sandboxVisibility(1024, false, true, true))).toBe(true);
    expect(showHitDamage(sandboxVisibility(1024, true, true, false))).toBe(true);
  });
  it.each(['fireball', 'lightning'])('o manipulador real mantém impacto de %s, sem número no alvo oculto', (src) => {
    const branch = source.split("} else if (e.k === 'hit') {")[1].split("} else if (e.k === 'gold')")[0];
    const damage = vi.fn(), explosion = vi.fn(), zap = vi.fn();
    const hit = new Function('e', 'hiddenDamageTargets', 'oneShot', 'v', 'zap', 'explosion', 'scorch', 'damageNumber', 'impact', branch);
    const event = { id: 'hidden', src, x: 2, y: 3, dmg: 70 };
    hit(event, ['hidden'], vi.fn(), (x: number, y: number) => ({ x, y }), zap, explosion, vi.fn(), damage, vi.fn());
    expect(damage).not.toHaveBeenCalled();
    expect(src === 'lightning' ? zap : explosion).toHaveBeenCalledOnce();
    hit(event, [], vi.fn(), vi.fn(), zap, explosion, vi.fn(), damage, vi.fn());
    expect(damage).toHaveBeenCalledOnce();
  });
});
