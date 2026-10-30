import { expect, it } from 'vitest';
import { addPlayer, newMatch, startMatch, tickMatch, nightPick, resume } from '../src/shared/match.ts';
import { nightCards } from '../src/shared/campaign.ts';
import { nightMap } from '../src/shared/levels.ts';
import { mulberry32 } from '../src/shared/rng.ts';
import { toPlaying, STEP_MS } from './helpers.ts';

it('keeps a pending Campaign upgrade accessible before transport and preserves it on reload', () => {
  const m = newMatch(); m.mode = 'campaign';
  addPlayer(m, 'a', 'Reader'); addPlayer(m, 'b', 'Mover');
  startMatch(m, 0, 0, 'campaign', true, mulberry32(7));
  let now = toPlaying(m, 0, mulberry32(2));
  const p = m.players.find(p => p.id === 'a')!;
  for (const id of ['shield', 'teleport', 'grip', 'meteor', 'windwalk'] as const) p.spells[id] = 1;
  expect(nightCards(p, mulberry32(8)).some(c => c.kind === 'spell')).toBe(false);
  m.night!.offer = { a: [{ kind: 'up', id: 'fireball' }] }; m.night!.owed = { a: 1 };
  const map = nightMap(m.night!.seed, m.night!.stage);
  const mark = map.marks.find(c => c.kind === 'checkpoint' && c.room === 0)!;
  m.world!.wizards.find(z => z.id === 'b')!.pos = { x: mark.x + 1, y: mark.y + .5 };
  tickMatch(m, now += STEP_MS, [], () => .5);
  expect(m.night!.fight).toBeNull();
  expect(m.night!.owed.a).toBe(1);
  // Persistence retains the pending choice while the party is waiting at the checkpoint.
  const restored = JSON.parse(JSON.stringify(m)) as typeof m;
  resume(restored, now, () => .5);
  expect(restored.night!.offer?.a).toEqual([{ kind: 'up', id: 'fireball' }]);
  toPlaying(restored, now, () => .5);
  expect(nightPick(restored, 'a', 0)).toBe(true);
  const before = m.players.find(p => p.id === 'a')!.spells.fireball;
  expect(nightPick(m, 'a', 0)).toBe(true);
  tickMatch(m, now += STEP_MS, [], () => .5);
  expect(m.night!.fight).not.toBeNull();
  for (let i = 0; i < 1200 && m.night!.fight !== null; i++) {
    for (const z of m.world!.wizards) {
      if (z.team === 1) { z.alive = false; z.hp = 0; }
      else { z.hp = z.hpMax; z.invulnUntil = m.world!.t + 10; }
    }
    tickMatch(m, now += STEP_MS, [], () => .5);
  }
  expect(m.night!.fight).toBeNull();
  expect(m.players.find(p => p.id === 'a')!.spells.fireball).toBe(before + 1);
  expect(m.night!.offer?.a).toBeUndefined();
  expect(nightPick(m, 'a', 0)).toBe(false);
});
