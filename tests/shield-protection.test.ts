import { describe, expect, it } from 'vitest';
import { stepWorld, statusDuration } from '../src/shared/sim.ts';
import { noSpells, spellLevel } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

const arena = (shield: boolean) => {
  const w = world([[0, 0], [5, 0]], noSpells(), [], () => .5);
  w.pillars = []; w.wizards[0].regen = 0;
  w.wizards[0].shieldUntil = shield ? 10 : 0;
  return w;
};
const impact = (shield: boolean) => {
  const w = arena(shield);
  w.wizards[1].pos = v(-.8, 0);
  stepWorld(w, [{ id: 'p1', kind: 'cast', spell: 'scourge', at: v(0, 0) }], () => .5);
  for (let i = 0; i < 90; i++) {
    stepWorld(w, [], () => .5);
    if (w.events.some((e) => e.k === 'hit' && e.id === 'p0')) break;
  }
  return w;
};
describe('Escudo: proteção geral e duração de status', () => {
  it('impede dano de área e recebe 60% do impulso do impacto', () => {
    const normal = impact(false).wizards[0], protectedMage = impact(true).wizards[0];
    expect(normal.hp).toBeLessThan(normal.hpMax);
    expect(protectedMage.hp).toBe(protectedMage.hpMax);
    expect(protectedMage.vel.x).toBeCloseTo(normal.vel.x * .6, 8);
    expect(protectedMage.stunLeft).toBeLessThan(normal.stunLeft! * .6);
  });
  it('cipós recebidos com Escudo duram 60%, sem imunidade ao agarramento', () => {
    for (const shield of [false, true]) {
      const w = arena(shield), z = w.wizards[0];
      w.projectiles.push({ id: w.nextId++, kind: 'grip', owner: 'p1', caster: 'p1', pos: v(0, 0), vel: v(0, 0), level: 1, until: 0, target: null, dmgMult: 1 });
      stepWorld(w, [], () => .5);
      expect(z.gripUntil).toBeCloseTo(spellLevel('grip', 1).duration * (shield ? .6 : 1), 8);
    }
  });
  it('resistência é decidida ao receber: não recalcula status anteriores', () => {
    const w = arena(false), z = w.wizards[0];
    z.slowUntil = 5; z.gripUntil = 4; z.stunLeft = 3;
    expect(statusDuration(w, z, 2)).toBe(2);
    z.shieldUntil = 10;
    expect(statusDuration(w, z, 2)).toBe(1.2);
    expect([z.slowUntil, z.gripUntil, z.stunLeft]).toEqual([5, 4, 3]);
  });
  it.each(['lava', 'burn'] as const)('impede dano ambiental de %s enquanto ativo', (source) => {
    const w = arena(true), z = w.wizards[0];
    if (source === 'lava') z.pos = v(30, 0);
    else w.zones.push({ pos: z.pos, r: 2, kind: 'burn', until: 10 });
    stepWorld(w, [], () => .5);
    expect(z.hp).toBe(z.hpMax);
  });
});
