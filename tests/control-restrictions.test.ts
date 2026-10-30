import { describe, expect, it } from 'vitest';
import { stepWorld } from '../src/shared/sim.ts';
import { DT } from '../src/shared/constants.ts';
import { SPELL_IDS, castBlocked, noSpells, spellGroup } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

describe('stun and root: authoritative restrictions', () => {
  it.each(SPELL_IDS)('stun blocks %s without spending cooldown', (spell) => {
    const w = world([[0, 0]], { ...noSpells(), [spell]: 1 }, [], () => .5);
    const z = w.wizards[0]; z.stunLeft = 1;
    stepWorld(w, [{ id: z.id, kind: 'cast', spell, at: v(3, 0) }, { id: z.id, kind: 'move', to: v(0, 5) }], () => .5);
    expect(z.cd[spell]).toBe(0);
    expect(z.casting).toBeNull();
    expect(z.pos).toEqual(v(0, 0));
  });
  it.each(SPELL_IDS)('Grip applies movement restrictions to %s', (spell) => {
    const w = world([[0, 0]], { ...noSpells(), [spell]: 1 }, [], () => .5);
    const z = w.wizards[0]; z.gripUntil = 5;
    if (spell === 'transcend') { z.spells.elemental = 1; z.lastElement = 'fire'; }
    if (spell === 'sniper') { const enemy = world([[3,0]], noSpells(), [], () => .5).wizards[0]; enemy.id='enemy'; w.wizards.push(enemy); }
    if (spell === 'closedbody') { z.braceReadyAt = 0; z.braceUntil = 1; }
    stepWorld(w, [{ id: z.id, kind: 'cast', spell, at: spell === 'heal' ? z.pos : v(3, 0) }], () => .5);
    const blocked = spellGroup(spell) === 'mobility';
    expect(castBlocked(false, true, spell)).toBe(blocked);
    expect(w.events.some((e) => e.k === 'cast')).toBe(!blocked && spell !== 'channel');
    expect(z.pos).toEqual(v(0, 0));
  });
  it('roots arriving during Fireball windup do not cancel it (only mobility is blocked)', () => {
    const spell = 'fireball';
    const w = world([[0, 0], [4, 0]], { ...noSpells(), grip: 1, fireball: 1 }, [], () => .5);
    w.pillars = [];
    run(w, .2, [{ id: 'p0', kind: 'cast', spell: 'grip', at: v(4, 0) }]);
    const p = w.projectiles.find((q) => q.kind === 'grip')!, z = w.wizards[1];
    while (w.t < p.until - DT) stepWorld(w, [], () => .5);
    stepWorld(w, [{ id: z.id, kind: 'cast', spell, at: v(8, 0) }], () => .5);
    expect(z.casting?.spell).toBe(spell);
    stepWorld(w, [], () => .5);
    expect(z.gripUntil).toBeGreaterThan(w.t);
    expect(z.casting?.spell).toBe(spell);
  });
});
