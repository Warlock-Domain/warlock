import { describe, expect, it } from 'vitest';
import { ILSE_MOMENTS, ILSE_ROOMS, ilseOn, ilseSecs, setIlse } from '../src/client/ilse.ts';
import { STAGE_ROOMS } from '../src/shared/levels.ts';

describe('Ilse: o tutorial da Charneca', () => {
  it('every room of the Charneca has its line, with the fireball key or the touch hint', () => {
    for (const r of STAGE_ROOMS[0]) {
      const line = ILSE_ROOMS[r.id];
      expect(line, r.id).toBeDefined();
      expect(line({ fireKey: 'Q', touch: false }).length, r.id).toBeGreaterThan(20);
    }
    expect(ILSE_ROOMS['charneca-entrada-01']({ fireKey: 'W', touch: false })).toContain('W');
    expect(ILSE_ROOMS['charneca-entrada-01']({ fireKey: 'W', touch: true })).toMatch(/Toque/);
    expect(ILSE_MOMENTS.fall().length).toBeGreaterThan(10);
  });

  it('each line stays long enough to read, between 5 and 12 s', () => {
    expect(ilseSecs('curta')).toBe(5);
    expect(ilseSecs('x'.repeat(120))).toBe(8);
    expect(ilseSecs('x'.repeat(900))).toBe(12);
  });

  it('the lines stay on until the Charneca is won, and can be turned back on', () => {
    expect(ilseOn()).toBe(true);
    setIlse(false);
    expect(ilseOn()).toBe(false);
    setIlse(true);
    expect(ilseOn()).toBe(true);
  });
});
