import { describe, expect, it } from 'vitest';
import { ILSE_MOMENTS, ILSE_ROOMS, ilseNext, ilseOn, ilsePush, newIlseQueue, setIlse, type IlseCtx } from '../src/client/ilse.ts';
import { STAGE_ROOMS } from '../src/shared/levels.ts';

const PC: IlseCtx = { touch: false, fireKey: '1', scourgeKey: '2', stopKey: 'S' };

describe('Ilse: o tutorial da Charneca', () => {
  it('every room of the Charneca has its lines', () => {
    for (const r of STAGE_ROOMS[0]) {
      const lines = ILSE_ROOMS[r.id]?.(PC);
      expect(lines?.length, r.id).toBeGreaterThan(0);
      for (const l of lines!) expect(l.length, r.id).toBeGreaterThan(20);
    }
  });

  it('the entrance teaches walking, stopping, lava and the circle; the first fight teaches the spells and the slots', () => {
    const entry = ILSE_ROOMS['charneca-entrada-01'](PC);
    expect(entry[0]).toMatch(/botão direito/);
    expect(entry[1]).toContain('S');
    expect(entry.some((l) => /lava/.test(l))).toBe(true);
    expect(entry.at(-1)).toMatch(/círculo/);
    expect(entry.join(' ')).not.toMatch(/Bola de fogo/); // magias só no primeiro encontro
    const fight = ILSE_MOMENTS.fight(PC);
    expect(fight[0]).toContain('1');
    expect(fight[0]).toContain('2');
    expect(fight.some((l) => /Arraste/.test(l))).toBe(true);
    // no toque não fala de tecla para parar
    expect(ILSE_ROOMS['charneca-entrada-01']({ ...PC, touch: true }).join(' ')).not.toMatch(/aperte S/);
  });

  it('lines queue up, each subject once a night, and only the button moves to the next', () => {
    const q = newIlseQueue();
    expect(ilsePush(q, 'a', ['um', 'dois'])).toBe(true);
    expect(ilsePush(q, 'a', ['de novo'])).toBe(false);
    ilsePush(q, 'b', ['três']);
    expect(q.lines).toEqual(['um', 'dois', 'três']);
    ilseNext(q);
    expect(q.lines[0]).toBe('dois');
  });

  it('the lines stay on until the Charneca is won, and can be turned back on', () => {
    expect(ilseOn()).toBe(true);
    setIlse(false);
    expect(ilseOn()).toBe(false);
    setIlse(true);
    expect(ilseOn()).toBe(true);
  });
});
