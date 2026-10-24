import { describe, expect, it } from 'vitest';
import { nightProps } from '../src/client/night-decor.ts';
import { nightMap } from '../src/shared/levels.ts';

describe('Campanha: cenário', () => {
  it('props stand on floor against a wall, away from marks and openings, and the same map gives the same props', () => {
    const n = nightMap(7, 0);
    const props = nightProps(n);
    expect(props.length).toBeGreaterThan(30);
    expect(nightProps(nightMap(7, 0))).toEqual(props);
    // chests and the Sanctuary shrine stand on their own marks; the rest keeps away from marks and openings
    for (const p of props.filter((q) => !q.h && !['chest', 'chest_gold', 'shrine_candles'].includes(q.name))) {
      const x = Math.floor(p.x), y = Math.floor(p.y);
      expect(n.ground[y][x], p.name).toBe('floor');
      expect([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => n.ground[y + dy][x + dx] === 'wall'), p.name).toBe(true);
      expect(n.marks.some((m) => m.kind !== 'tree' && m.kind !== 'statue' && Math.abs(m.x - x) <= 2 && Math.abs(m.y - y) <= 2), p.name).toBe(false);
    }
    // the cemetery gets graves, the arena torches
    const inRoom = (id: string) => {
      const r = n.rooms.find((q) => q.room.id.startsWith(id))!;
      return props.filter((p) => p.x > r.x && p.y > r.y && p.x < r.x + r.room.w && p.y < r.y + r.room.h).map((p) => p.name);
    };
    expect(inRoom('cemiterio').some((name) => name.startsWith('grave'))).toBe(true);
    expect(inRoom('arena').includes('torch_lit')).toBe(true);
    // one golden chest per '$' mark while closed, plain once opened; the shrine on the candle mark
    const chests = n.marks.filter((m) => m.kind === 'chest');
    expect(props.filter((p) => p.name === 'chest_gold').length).toBe(chests.length);
    expect(nightProps(n, [0]).filter((p) => p.name === 'chest').length).toBe(1);
    expect(props.filter((p) => p.name === 'shrine_candles').length).toBe(n.marks.filter((m) => m.kind === 'candle').length);
    // torches on top of the walls stand on wall cells
    for (const p of props.filter((q) => q.h)) expect(n.ground[Math.floor(p.y)][Math.floor(p.x)]).toBe('wall');
  });
});
