import { describe, expect, it, vi } from 'vitest';
import { sandboxVisibility, showHitDamage } from '../src/client/screen-data.ts';
import source from '../src/client/scene.ts?raw';

describe('damage numbers respect observer invisibility', () => {
  it.each([2048, 2048 | 16, 2048 | 16777216])('hides numbers for status %s', (status) => {
    expect(showHitDamage(status)).toBe(false);
  });
  it.each([0, 1024, 8388608])('preserves numbers for visible or translucent targets: %s', (status) => {
    expect(showHitDamage(status)).toBe(true);
  });
  it('follows sandbox vision without hiding the observer damage', () => {
    expect(showHitDamage(sandboxVisibility(1024, false, true, false))).toBe(false);
    expect(showHitDamage(sandboxVisibility(1024, false, true, true))).toBe(true);
    expect(showHitDamage(sandboxVisibility(1024, true, true, false))).toBe(true);
  });
  it.each(['fireball', 'lightning'])('keeps the public %s impact without hidden target numbers', (src) => {
    const branch = source.split("} else if (e.k === 'hit') {")[1].split("} else if (e.k === 'gold')")[0];
    const damage = vi.fn(), contact = vi.fn(), zap = vi.fn();
    const hit = new Function('e', 'hiddenDamageTargets', 'oneShot', 'v', 'zap', 'hitBurst', 'scorch', 'damageNumber', 'impact', 'FIRE_KINDS', branch);
    const event = { id: 'hidden', src, x: 2, y: 3, dmg: 70 };
    const fire = new Set(['fireball', 'cluster', 'meteor']);
    hit(event, ['hidden'], vi.fn(), (x: number, y: number) => ({ x, y }), zap, contact, vi.fn(), damage, vi.fn(), fire);
    expect(damage).not.toHaveBeenCalled();
    expect(src === 'lightning' ? zap : contact).toHaveBeenCalledOnce();
    hit(event, [], vi.fn(), vi.fn(), zap, contact, vi.fn(), damage, vi.fn(), fire);
    expect(damage).toHaveBeenCalledOnce();
  });
  it('keeps a zero-damage contact without flinch, camera response or scorch', () => {
    const branch = source.split("} else if (e.k === 'hit') {")[1].split("} else if (e.k === 'gold')")[0];
    const hit = new Function('e', 'hiddenDamageTargets', 'oneShot', 'v', 'zap', 'hitBurst', 'scorch', 'damageNumber', 'impact', 'FIRE_KINDS', branch);
    const pose = vi.fn(), contact = vi.fn(), scorch = vi.fn(), impact = vi.fn();
    hit({ id: 'visible', src: 'fireball', x: 2, y: 3, dmg: 0 }, [], pose, vi.fn(), vi.fn(), contact, scorch, vi.fn(), impact, new Set(['fireball']));
    expect(contact).toHaveBeenCalledOnce();
    expect(pose).not.toHaveBeenCalled();
    expect(scorch).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
  });
});
