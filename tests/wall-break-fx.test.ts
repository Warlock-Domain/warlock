import { expect, it } from 'vitest';
import { stepWorld, type SimEvent } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { encodeSnap } from '../src/shared/snapshot.ts';
import { parseServerMessage } from '../src/client/net-message.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

function setup() {
  const w = world([[0, -3], [5, 0]], { ...noSpells(), fireball: 1, scourge: 1 }, [], () => .5);
  w.pillars = [0, -.65, .65].map(x => ({ pos: v(x, 0), kind: 'rockpillar', hp: 200, alive: true, wall: 0 }));
  w.arenaR = 10; w.rules.chests = w.rules.runes = false;
  return w;
}

it('emits one centred destruction cue only on the lethal spell hit, through the client decoder', () => {
  const w = setup(), events: SimEvent[] = [];
  for (let cast = 0; cast < 3; cast++) {
    w.wizards[0].cd.fireball = 0;
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(0, 0) }], () => .5);
    for (let i = 0; i < 60; i++) { stepWorld(w, [], () => .5); events.push(...w.events); }
    expect(events.filter(e => e.k === 'wallBreak')).toHaveLength(cast === 2 ? 1 : 0);
  }
  expect(w.pillars.every(p => !p.alive)).toBe(true);
  expect(events.filter(e => e.k === 'wallBreak')).toEqual([{ k: 'wallBreak', x: 0, y: 0, dx: 1, dy: 0 }]);
  const snap = encodeSnap(w, 'p0', 0, events), decoded = parseServerMessage(snap);
  expect(decoded?.t).toBe('snap'); if (decoded?.t !== 'snap') throw new Error('Snapshot rejected');
  expect(decoded.e).toContainEqual({ k: 'wallBreak', x: 0, y: 0, dx: 1, dy: 0 });
});

it.each(['lava', 'expiry'] as const)('does not emit a spell-destruction cue for %s', cause => {
  const w = setup();
  for (const p of w.pillars) { p.hp = 1; if (cause === 'lava') p.pos.y = 20; else p.until = 0; }
  stepWorld(w, [], () => .5);
  expect(w.pillars.every(p => !p.alive)).toBe(true);
  expect(w.events.some(e => e.k === 'wallBreak')).toBe(false);
});

it('does not duplicate the cue when an area spell hits the whole wall', () => {
  const w = setup(); for (const p of w.pillars) p.hp = 1;
  w.wizards[0].pos = v(0, -1);
  const events: SimEvent[] = [];
  stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'scourge', at: v(0, 0) }], () => .5);
  for (let i = 0; i < 60; i++) { stepWorld(w, [], () => .5); events.push(...w.events); }
  expect(events.filter(e => e.k === 'wallBreak')).toHaveLength(1);
});

it('rejects malformed cosmetic axes without rejecting the snapshot', () => {
  const w = setup();
  const decoded = parseServerMessage({ ...encodeSnap(w, 'p0', 0, []), e: [{ k: 'wallBreak', x: 0, y: 0, dx: 0, dy: 0 }] });
  expect(decoded?.t).toBe('snap'); if (decoded?.t !== 'snap') throw new Error('Snapshot rejected');
  expect(decoded.e).toEqual([]);
});
