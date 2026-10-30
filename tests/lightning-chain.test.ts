import { describe, expect, it } from 'vitest';
import { stepWorld, type SimEvent } from '../src/shared/sim.ts';
import { noSpells, spellLevel } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

function shoot(spots: [number, number][], level = 1, configure = (_w: ReturnType<typeof world>) => {}) {
  const w = world(spots, { ...noSpells(), lightning: level }, [], () => .5);
  w.pillars = []; w.runes = [];
  for (const z of w.wizards) z.regen = 0;
  configure(w);
  const events: SimEvent[] = [], speeds: Record<string, number> = {};
  const record = () => { events.push(...w.events); for (const e of w.events) if (e.k === 'hit') { const z = w.wizards.find(z => z.id === e.id)!; speeds[e.id] = Math.hypot(z.vel.x, z.vel.y); } };
  stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(3, 0) }], () => .5);
  record();
  for (let i = 0; i < 120; i++) { stepWorld(w, [], () => .5); record(); }
  return { w, speeds, hits: events.filter((e): e is Extract<SimEvent, { k: 'hit' }> => e.k === 'hit' && e.src === 'lightning'), events };
}
describe('Lightning chains without repeated targets', () => {
  it.each([1, 7])('damage and impulse halve per jump at level%s, including above the soft cap', (level) => {
    const { w, hits, events, speeds } = shoot([[0, 0], [2, 0], [2, 1], [3, 1], [3, 2]], level);
    const L = spellLevel('lightning', level);
    expect(hits.map((h) => h.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    for (let i = 0; i < hits.length; i++) {
      expect(hits[i].dmg).toBe(Math.round(L.dmg * .5 ** i)); // displayed damage is rounded; actual health loss is not.
      expect(1000 - w.wizards[i + 1].hp).toBeCloseTo(L.dmg * .5 ** i);
    }
    const velocities = hits.map(hit => speeds[hit.id]);
    for (let i = 1; i < velocities.length; i++) expect(velocities[i] / velocities[0]).toBeCloseTo(.5 ** i);
    expect(events.filter((e) => e.k === 'land' && e.src === 'lightning')).toHaveLength(1);
  });
  it('all jumps retain primary range without repeating targets', () => {
    const reach = spellLevel('lightning', 1).range;
    const first = reach * .9;
    const { hits } = shoot([[0, 0], [2, 0], [2, first], [2 + reach * .6, first]]);
    expect(hits.map((h) => h.id)).toEqual(['p1', 'p2', 'p3']);
  });
  it('hits more than four enemies without returning to the caster or repeating targets', () => {
    const { hits } = shoot([[0, 0], [2, 0], [2, .5], [2.5, .5], [2.5, 1], [3, 1], [3, 1.25]]);
    expect(hits).toHaveLength(6);
    expect(new Set(hits.map((h) => h.id)).size).toBe(6);
    expect(hits.some((h) => h.id === 'p0')).toBe(false);
  });
  it('a separate cast can hit the same enemies again', () => {
    const { w, hits } = shoot([[0, 0], [2, 0], [2, 1]]);
    expect(hits.map((h) => h.id)).toEqual(['p1', 'p2']);
    for (const [i, z] of w.wizards.entries()) { z.pos = [v(0, 0), v(2, 0), v(2, 1)][i]; z.vel = v(0, 0); z.stunLeft = 0; }
    w.wizards[0].cd.lightning = 0;
    const again: SimEvent[] = [];
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(3, 0) }], () => .5);
    again.push(...w.events);
    for (let i = 0; i < 120; i++) { stepWorld(w, [], () => .5); again.push(...w.events); }
    expect(again.filter((e): e is Extract<SimEvent, { k: 'hit' }> => e.k === 'hit' && e.src === 'lightning').map((h) => h.id)).toEqual(['p1', 'p2']);
  });
  it('does not jump to allies or dead units or through obstacles', () => {
    const { hits } = shoot([[0, 0], [2, 0], [2, 1], [2, 2], [4, 0]], 1, (w) => {
      w.wizards[0].team = w.wizards[2].team = 0;
      w.wizards[3].alive = false;
      w.pillars = [{ kind: 'pillar', pos: v(3, 0), hp: 1000, alive: true }];
    });
    expect(hits.map((h) => h.id)).toEqual(['p1']);
  });
  it('Shield on a jump reflects reduced power and ends the chain', () => {
    const { hits } = shoot([[0, 0], [2, 0], [2, 1], [3, 1]], 1, (w) => { w.wizards[2].shieldUntil = 5; });
    expect(hits.map((h) => h.id)).toEqual(['p1', 'p0']);
    expect(hits[1].dmg).toBeCloseTo(spellLevel('lightning', 1).dmg * .5);
  });
  it('destroys projectiles along jump segments without changing hit damage', () => {
    const { w, hits } = shoot([[0, 0], [2, 0], [2, 3]], 1, (w) => {
      w.wizards[1].kbResist = 1;
      w.projectiles.push({ id: w.nextId++, kind: 'fireball', owner: 'p2', caster: 'p2', pos: v(2, 1.5), vel: v(0, 0), level: 1, until: 20, target: null, dmgMult: 1 });
    });
    expect(w.projectiles.some((p) => p.kind === 'fireball')).toBe(false);
    expect(hits[1].dmg).toBeCloseTo(spellLevel('lightning', 1).dmg * .5);
  });
});
