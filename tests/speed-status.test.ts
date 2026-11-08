import { expect, it } from 'vitest';
import { speedStatusBits, type World, type Wizard } from '../src/shared/sim.ts';
import { encodeSnap, decodeSnap } from '../src/shared/snapshot.ts';
import { noSpells } from '../src/shared/spells.ts';
import { CELL } from '../src/shared/arena.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

const cases: [string, (w: World, z: Wizard) => void, number][] = [
  ['ordinary boots excluded', (_w, z) => { z.items.boots = 1; }, 0],
  ['shock boots', (_w, z) => { z.shockUntil = 2; z.shockBonus = .2; }, 4096],
  ['wind boots', (_w, z) => { z.windBonus = .2; z.calmSince = -10; }, 4096],
  ['Rush bonus', (_w, z) => { z.rushUntil = 2; z.rushBonus = .3; }, 4096],
  ['Mandinga haste', (_w, z) => { z.hasteUntil = 2; z.haste = .3; }, 4096],
  ['Wind Walk', (_w, z) => { z.windUntil = 2; }, 4096],
  ['haste rune', (_w, z) => { z.rune = 'haste'; z.runeUntil = 2; }, 4096],
  ['fast round excluded', w => { w.mods = { ...w.mods, speed: 1.5 }; }, 0],
  ['direct slow', (_w, z) => { z.slowUntil = 2; z.slow = .3; }, 4],
  ['slow ground', (_w, z) => { z.zone = 1; }, 4],
  ['Electrocute', (_w, z) => { z.electroUntil = 2; }, 4],
  ['weak Closed Body', (_w, z) => { z.closedBodyWeak = true; z.closedBodyUntil = 2; }, 4],
  ['Ki passive penalty excluded', (_w, z) => { z.spheres = [{ element: 'ki', until: 2 }]; }, 0],
  ['slow round excluded', w => { w.mods = { ...w.mods, speed: .8 }; }, 0],
  ['permanent wax terrain excluded', (w, z) => { w.map = { w: 2, h: 2, cells: new Uint8Array(4).fill(CELL.wax), home: v(.5, .5) }; z.pos = v(.5, .5); }, 0],
  ['enemy Warp Zone', w => { w.projectiles.push({ id: 10, kind: 'warpzone', owner: 'p1', caster: 'p1', pos: v(0, 0), vel: v(0, 0), level: 1, until: 2, target: null, dmgMult: 1 }); }, 4],
];

it.each(cases)('reports %s through the existing snapshot bits without changing world state', (_name, apply, expected) => {
  const w = world([[0, 0], [4, 0]], noSpells(), [], () => .5, false, [0, 1]), z = w.wizards[0];
  apply(w, z); const before = JSON.stringify(w);
  expect(speedStatusBits(w, z)).toBe(expected);
  const snap = encodeSnap(w, z.id, 0, []);
  expect(decodeSnap(snap, ['p0', 'p1']).wizards[0].status & (4096 | 4)).toBe(expected);
  expect(JSON.stringify(w)).toBe(before);
});

it('keeps simultaneous modifiers visible and stops temporary cues on expiry', () => {
  const w = world([[0, 0]], noSpells()), z = w.wizards[0];
  z.hasteUntil = z.slowUntil = 2; z.haste = z.slow = .3;
  expect(speedStatusBits(w, z)).toBe(4096 | 4);
  w.t = 2; expect(speedStatusBits(w, z)).toBe(0);
  z.gripUntil = 4; expect(speedStatusBits(w, z)).toBe(0);
});
