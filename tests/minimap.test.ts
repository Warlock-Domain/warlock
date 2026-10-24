import { describe, expect, it } from 'vitest';
import { seenRooms } from '../src/client/minimap.ts';
import { nightMap } from '../src/shared/levels.ts';
import { v } from '../src/shared/vec.ts';

describe('Campanha: névoa e minimapa', () => {
  it('a room is seen once an Aceso stands in it, stays seen, and won rooms count as seen', () => {
    const n = nightMap(7, 0);
    const entry = n.rooms.findIndex((r) => r.room.pool === 'entrada');
    const r = n.rooms[entry];
    const first = seenRooms(n, [v(r.x + 3, r.y + 3)], []);
    expect(first).toEqual([entry]);
    // the Aceso walked away to nowhere: the room stays seen; a won room joins even unvisited this session
    const later = seenRooms(n, [], [5], first);
    expect(later).toEqual([entry, 5].sort((a, b) => a - b));
    expect(seenRooms(n, [v(-10, -10)], [])).toEqual([]);
  });
});
