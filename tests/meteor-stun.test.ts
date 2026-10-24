import { describe, expect, it } from 'vitest';
import { stepWorld } from '../src/shared/sim.ts';
import { noSpells, spellLevel } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

describe('Meteoro com dano e atordoamento, sem empurrão', () => {
  it.each([1, 4, 7])('nível %s mantém dano, mas atordoa por 1,25 s', (level) => {
    const w = world([[0, 0], [5, 0]], noSpells(), [], () => .5), z = w.wizards[0];
    w.pillars = []; z.regen = 0;
    w.projectiles.push({ id: w.nextId++, kind: 'meteor', owner: 'p1', caster: 'p1', pos: v(0, 0), vel: v(0, 0), until: 0, level, target: null, dmgMult: 1 });
    stepWorld(w, [], () => .5);
    expect(z.hp).toBe(z.hpMax - spellLevel('meteor', level).dmg);
    expect(z.vel).toEqual(v(0, 0));
    expect(z.stunLeft).toBe(1.25);
    expect(spellLevel('meteor', level).knock).toBe(0);
    stepWorld(w, [{ id: z.id, kind: 'move', to: v(0, 5) }, { id: z.id, kind: 'cast', spell: 'scourge', at: v(5, 0) }], () => .5);
    expect(z.pos).toEqual(v(0, 0));
    expect(z.casting).toBeNull();
  });
  it('Escudo protege do dano e reduz o stun novo para 0,75 s', () => {
    const w = world([[0, 0], [5, 0]], noSpells(), [], () => .5), z = w.wizards[0];
    z.shieldUntil = 10; w.pillars = [];
    w.projectiles.push({ id: w.nextId++, kind: 'meteor', owner: 'p1', caster: 'p1', pos: v(0, 0), vel: v(0, 0), until: 0, level: 1, target: null, dmgMult: 1 });
    stepWorld(w, [], () => .5);
    expect(z.hp).toBe(z.hpMax);
    expect(z.stunLeft).toBe(.75);
    expect(z.vel).toEqual(v(0, 0));
  });
});
