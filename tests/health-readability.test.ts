import { expect, it } from 'vitest';
import { healthRelation, obstacleHpUntil } from '../src/client/screen-data.ts';

it('marks self and current teammates as allies while separating opposing teams', () => {
  const viewer = { id: 'a', team: 0 };
  expect(healthRelation(viewer, viewer, true)).toBe('ally');
  expect(healthRelation({ id: 'b', team: 0 }, viewer, true)).toBe('ally');
  for (const team of [1, 2, 3, null]) expect(healthRelation({ id: 'b', team }, viewer, true)).toBe('enemy');
  viewer.team = 2;
  expect(healthRelation({ id: 'b', team: 2 }, viewer, true)).toBe('ally');
  expect(healthRelation({ id: 'b', team: 0 }, viewer, true)).toBe('enemy');
});

it('does not treat null teams or FFA participants as allies', () => {
  const viewer = { id: 'a', team: null };
  expect(healthRelation(viewer, viewer, false)).toBe('ally');
  expect(healthRelation({ id: 'b', team: null }, viewer, false)).toBe('enemy');
  expect(healthRelation({ id: 'b', team: 0 }, { ...viewer, team: 0 }, false)).toBe('enemy');
});

it('does not invent an allegiance for spectators or missing viewers', () => {
  expect(healthRelation({ id: 'b', team: 1 }, undefined, true)).toBe('neutral');
  expect(healthRelation({ id: 'b', team: 1 }, { id: 'a', team: 1, watch: true }, true)).toBe('neutral');
});

it('shows object HP for three seconds from the latest damage only', () => {
  const until = obstacleHpUntil(100, 80, 0, 10);
  expect(until).toBe(13);
  expect(obstacleHpUntil(80, 80, until, 12)).toBe(13);
  expect(obstacleHpUntil(80, 60, until, 12.5)).toBe(15.5);
  expect(obstacleHpUntil(60, 70, until, 12)).toBe(13);
});

it('does not show object HP for initial damaged baselines, respawns or destruction', () => {
  expect(obstacleHpUntil(undefined, 60, 0, 10)).toBe(0);
  expect(obstacleHpUntil(0, 100, 13, 11)).toBe(0);
  expect(obstacleHpUntil(80, 100, 13, 11)).toBe(0);
  expect(obstacleHpUntil(80, 0, 13, 11)).toBe(0);
});
