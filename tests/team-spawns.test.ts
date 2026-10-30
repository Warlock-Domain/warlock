import { describe, expect, it } from 'vitest';
import { ARENA_IDS, SHAPES, edgeAt } from '../src/shared/arena.ts';
import { WIZ_R } from '../src/shared/constants.ts';
import { addPlayer, newMatch, startMatch } from '../src/shared/match.ts';
import { newWorld } from '../src/shared/sim.ts';
import { dist } from '../src/shared/vec.ts';
import { toPlaying } from './helpers.ts';

describe('Grouped team spawns', () => {
  for (const arena of ARENA_IDS) for (let count = 2; count <= 8; count++) {
    it(`groups ${count} players on opposite safe sides of ${arena}`, () => {
      const m = newMatch();
      m.opts = { ...m.opts, arena };
      for (let i = 0; i < count; i++) addPlayer(m, `p${i}`, `Player ${i}`);
      startMatch(m, 0, 0, 'teams', false, () => 0.5);
      toPlaying(m, 0, () => 0.5);
      const w = m.world!;
      expect(w.wizards.map((z) => z.id)).toEqual(m.players.map((p) => p.id));
      for (const z of w.wizards) {
        expect(edgeAt(arena, w.arenaR, z.pos)).toBeGreaterThan(WIZ_R);
        expect(z.pos.x * (z.team === 0 ? 1 : -1)).toBeGreaterThan(w.arenaR / 2);
        for (const other of w.wizards) if (other !== z) {
          expect(dist(z.pos, other.pos)).toBeGreaterThan(2 * WIZ_R);
          if (z.team === other.team) expect(dist(z.pos, other.pos)).toBeLessThan(4);
          else expect(dist(z.pos, other.pos)).toBeGreaterThan(w.arenaR);
        }
        for (const pillar of w.pillars) expect(dist(z.pos, pillar.pos)).toBeGreaterThan(2);
      }
    });
  }

  it('keeps ordinary spawns when team membership is used outside Teams mode', () => {
    for (const arena of ARENA_IDS) {
      const w = newWorld(['a', 'b', 'c', 'd'], {}, {}, 0, () => 0.5, false, { a: 0, b: 0, c: 1, d: 1 }, undefined, arena);
      expect(w.wizards.map((z) => z.pos)).toEqual(w.wizards.map((_, i) => SHAPES[arena].spawn(i, 4, w.arenaR)));
    }
  });
});
