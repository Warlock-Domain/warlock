import { describe, expect, it } from 'vitest';
import { ARENA_IDS, edgeAt } from '../src/shared/arena.ts';
import { WIZ_R } from '../src/shared/constants.ts';
import { addPlayer, castBallot, newMatch, resume, startMatch, startVote } from '../src/shared/match.ts';
import { parseClientMessage, publicRoom } from '../src/shared/protocol.ts';
import { dist } from '../src/shared/vec.ts';
import { STEP_MS, toPlaying, until } from './helpers.ts';

const game = (teams: 2 | 3 | 4, players = 8) => {
  const m = newMatch();
  for (let i = 0; i < players; i++) addPlayer(m, `p${i}`, `Player ${i}`);
  startMatch(m, 0, 0, 'teams', false, () => .5, { teams, effect: 'clear' });
  return m;
};

describe('Two to four team matches', () => {
  for (const teams of [3, 4] as const) for (let players = 2; players <= 8; players++) {
    it(`balances ${players} players across at most ${teams} nonempty teams`, () => {
      const m = game(teams, players);
      const counts = Array.from({ length: Math.min(teams, players) }, (_, team) => m.players.filter(p => p.team === team).length);
      expect(Math.min(...counts)).toBeGreaterThan(0);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      expect(new Set(m.players.map(p => p.team)).size).toBe(counts.length);
    });
  }

  for (const teams of [3, 4] as const) for (const arena of ARENA_IDS) {
    it(`keeps ${teams} allied formations safe and separated in ${arena}`, () => {
      const m = game(teams);
      m.opts = { ...m.opts, arena };
      toPlaying(m, 0, () => .5);
      const w = m.world!;
      for (const z of w.wizards) {
        expect(edgeAt(arena, w.arenaR, z.pos)).toBeGreaterThan(WIZ_R);
        for (const q of w.wizards) if (q !== z) {
          expect(dist(z.pos, q.pos)).toBeGreaterThan(2 * WIZ_R);
          if (z.team === q.team) expect(dist(z.pos, q.pos)).toBeLessThan(3);
          else expect(dist(z.pos, q.pos)).toBeGreaterThan(4);
        }
        for (const pillar of w.pillars) expect(dist(z.pos, pillar.pos)).toBeGreaterThan(2);
      }
    });
  }

  it('waits for the final surviving team, scores its allies and declares its winner', () => {
    const m = game(4);
    let now = toPlaying(m, 0, () => .5);
    for (const z of m.world!.wizards) if (z.team === 0 || z.team === 1) z.alive = false;
    now = until(m, now, () => m.world!.t > 1, 100, () => .5);
    expect(m.phase).toBe('playing');
    for (const p of m.players) if (p.team === 3) p.score = m.opts.goal - 1;
    for (const z of m.world!.wizards) if (z.team === 2) z.alive = false;
    now = until(m, now, () => m.phase === 'end', 1000, () => .5);
    expect(m.winnerTeam).toBe(3);
    expect(m.players.filter(p => p.team === 3).every(p => p.score === m.opts.goal)).toBe(true);
    expect(publicRoom('ABCD', m, now).winnerTeam).toBe(3);
  });

  it('reassigns fixed teams after a voted team-count change', () => {
    const m = game(2);
    const now = toPlaying(m, 0, () => .5);
    expect(startVote(m, 'p0', 'opt', 'teams:4', now)).toBe(true);
    for (const p of m.players.slice(1)) if (m.vote) castBallot(m, p.id, true, now);
    expect(m.pendingOpts.teams).toBe(4);
    for (const z of m.world!.wizards) if (z.team === 0) z.alive = false;
    const end = until(m, now + STEP_MS, () => m.phase === 'shop', 1000, () => .5);
    toPlaying(m, end, () => .5);
    expect(new Set(m.players.map(p => p.team)).size).toBe(4);
  });

  it('validates team counts and restores the two-team default for old rooms', () => {
    for (const teams of [2, 3, 4]) expect(parseClientMessage(JSON.stringify({ t: 'start', bots: 0, mode: 'teams', opts: { teams } }))).not.toBeNull();
    for (const teams of [0, 1, 5, 3.5, '4']) expect(parseClientMessage(JSON.stringify({ t: 'start', bots: 0, mode: 'teams', opts: { teams } }))).toBeNull();
    const m = game(2);
    delete (m.opts as { teams?: number }).teams;
    resume(m, 0);
    expect(m.opts.teams).toBe(2);
  });
});
