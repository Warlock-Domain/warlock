import { expect, it } from 'vitest';
import { leadingTeam, teamScore } from '../src/client/screen-data.ts';
import type { PublicPlayer } from '../src/shared/protocol.ts';

const player = (team: number | null, score: number, watch = false, servo = false) => ({ team, score, watch, servo: servo ? 'smoke' : undefined }) as unknown as PublicPlayer;
const room = (players: PublicPlayer[], teamShuffle = false) => ({ mode: 'teams' as const, players, teamShuffle });

it('uses shared wins rather than adding wins across unequal team rosters', () => {
  const players = [player(0, 3), player(0, 3), player(1, 4)];
  expect(teamScore(players, 0)).toBe(3);
  expect(leadingTeam(room(players))).toBe(1);
});
it('does not declare a leader at zero or during a tie', () => {
  expect(leadingTeam(room([player(0, 0), player(1, 0)]))).toBeNull();
  expect(leadingTeam(room([player(0, 4), player(1, 4), player(2, 1)]))).toBeNull();
});
it('updates the unique leader across four teams', () => {
  const players = [player(0, 2), player(1, 3), player(2, 1), player(3, 5)];
  expect(leadingTeam(room(players))).toBe(3);
  players[1].score = 6;
  expect(leadingTeam(room(players))).toBe(1);
});
it('ignores spectators and Campaign servants when determining team wins', () => {
  expect(leadingTeam(room([player(0, 2), player(1, 1), player(1, 99, true), player(1, 99, false, true), player(null, 100)]))).toBe(0);
});
it('does not invent collective wins for shuffled teams or other modes', () => {
  const players = [player(0, 3), player(1, 1)];
  expect(leadingTeam(room(players, true))).toBeNull();
  expect(leadingTeam({ ...room(players), mode: 'rounds' })).toBeNull();
});
it('does not call the only assigned team a competitive leader', () => {
  expect(leadingTeam(room([player(0, 3), player(null, 1)]))).toBeNull();
});
