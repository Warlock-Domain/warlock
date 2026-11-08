import { expect, it, vi } from 'vitest';
import { objectYaw, sceneryFor } from '../src/client/arena-scenery.ts';

it('keeps one scenery draw stable for every viewer and reconnect', () => {
  for (let round = 1; round <= 20; round++) {
    expect(sceneryFor(`room:${round}`)).toBe(sceneryFor(`ROOM:${round}`));
    expect(sceneryFor(`ROOM:${round}`)).toBe(sceneryFor(`ROOM:${round}`));
  }
});
it('draws both scenes across rooms and rounds', () => {
  expect(new Set(Array.from({ length: 50 }, (_, i) => sceneryFor(`ROOM:${i}`)))).toEqual(new Set(['dungeon', 'forest']));
  expect(new Set(Array.from({ length: 50 }, (_, i) => sceneryFor(`ROOM${i}:1`)))).toEqual(new Set(['dungeon', 'forest']));
});
it('keeps yaw stable without moving or mutating the object', () => {
  const pos = Object.freeze({ x: 2.5, y: -1.25 });
  expect(objectYaw('ROOM:2', 'rock', pos)).toBe(objectYaw('room:2', 'rock', pos));
  expect(pos).toEqual({ x: 2.5, y: -1.25 });
});
it('varies yaw by round, object kind and position within one full turn', () => {
  const angles = Array.from({ length: 40 }, (_, i) => objectYaw('ROOM:3', 'tree', { x: i, y: 1 }));
  expect(new Set(angles).size).toBe(40);
  expect(angles.every(a => a >= 0 && a < Math.PI * 2)).toBe(true);
  const pos = { x: 1, y: 1 };
  expect(objectYaw('ROOM:3', 'rock', pos)).not.toBe(objectYaw('ROOM:3', 'tree', pos));
  expect(objectYaw('ROOM:3', 'tree', pos)).not.toBe(objectYaw('ROOM:4', 'tree', pos));
});
it('never consumes shared or global randomness for cosmetic draws', () => {
  const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Game randomness consumed'); });
  try {
    expect(['forest', 'dungeon']).toContain(sceneryFor('ROOM:4'));
    expect(Number.isFinite(objectYaw('ROOM:4', 'pillar', { x: 1, y: 3 }))).toBe(true);
  } finally { random.mockRestore(); }
});
