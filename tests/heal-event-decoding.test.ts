import { expect, it } from 'vitest';
import { parseServerMessage } from '../src/client/net-message.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { encodeSnap, publicEvents } from '../src/shared/snapshot.ts';
import { noSpells } from '../src/shared/spells.ts';
import { world } from './helpers.ts';

it('delivers the server-confirmed healing recipient through the client decoder', () => {
  const w = world([[0, 0], [2, 0]], { ...noSpells(), heal: 1 }, [], () => .5, false, [0, 0]);
  for (const z of w.wizards) { z.hp = 500; z.regen = 0; }
  stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'heal', at: w.wizards[1].pos }], () => .5);
  const events = publicEvents(w.events, id => `public-${id}`);
  const snap = encodeSnap(w, 'p0', 0, events);
  const decoded = parseServerMessage(snap);
  expect(decoded?.t).toBe('snap');
  if (decoded?.t !== 'snap') throw new Error('Snapshot rejected');
  expect(decoded.e).toContainEqual({ k: 'heal', id: 'public-p1', x: 2, y: 0, amount: 45 });
  expect(decoded.w).toBe(snap.w);
});

it.each([undefined, null, '45', -1, NaN, Infinity])('drops malformed healing payloads while preserving the snapshot: %s', amount => {
  const w = world([[0, 0]], { ...noSpells(), heal: 1 });
  const snap = { ...encodeSnap(w, 'p0', 0, []), e: [{ k: 'heal', id: 'p0', x: 0, y: 0, amount }] };
  const decoded = parseServerMessage(snap);
  expect(decoded?.t).toBe('snap');
  if (decoded?.t !== 'snap') throw new Error('Snapshot rejected');
  expect(decoded.e).toEqual([]);
});

it('accepts a confirmed zero-amount heal for full-health target feedback', () => {
  const w = world([[0, 0]], { ...noSpells(), heal: 1 });
  const event = { k: 'heal', id: 'p0', x: 0, y: 0, amount: 0 };
  const decoded = parseServerMessage({ ...encodeSnap(w, 'p0', 0, []), e: [event] });
  expect(decoded?.t).toBe('snap');
  if (decoded?.t !== 'snap') throw new Error('Snapshot rejected');
  expect(decoded.e).toEqual([event]);
});
