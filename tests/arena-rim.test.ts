import { describe, expect, it } from 'vitest';
import { arenaRimGeometry } from '../src/client/arena-rim.ts';
import { ARENA_IDS, SHAPES } from '../src/shared/arena.ts';

describe('Sculpted arena rim', () => {
  for (const id of ARENA_IDS) it(`keeps ${id} rock relief inside its playable outline`, () => {
    const { stone, fissures } = arenaRimGeometry(id);
    try {
      const vertices = stone.getAttribute('position');
      expect(vertices.count).toBeGreaterThan(0);
      expect(vertices.count).toBeLessThan(10000);
      for (let i = 0; i < vertices.count; i++) {
        const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
        expect(Number.isFinite(x + y + z)).toBe(true);
        expect(SHAPES[id].sdf(x, z), `${id} vertex ${i}`).toBeLessThan(0.002);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(0.3);
      }
      expect(fissures.getAttribute('position').count).toBeLessThan(vertices.count);
      expect(stone.getAttribute('normal').count).toBe(vertices.count);
      for (let i = 0; i < vertices.count; i += 3) {
        const x = (vertices.getX(i) + vertices.getX(i + 1) + vertices.getX(i + 2)) / 3;
        const z = (vertices.getZ(i) + vertices.getZ(i + 1) + vertices.getZ(i + 2)) / 3;
        expect(SHAPES[id].sdf(x, z), `${id} face ${i / 3}`).toBeLessThan(0.002);
      }
    } finally { stone.dispose(); fissures.dispose(); }
  });
});
