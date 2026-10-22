import { describe, expect, it } from 'vitest';
import { DT, HP_MAX } from '../src/shared/constants.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { len, v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

function impact(level: number, shield: boolean, expires = 99, residual = 0) {
  const w = world([[0, 0], [4.8, 0]], { ...noSpells(), meteor: level }, [], () => 0.5);
  const target = w.wizards[1];
  target.dmgTaken = 250;
  target.kbResist = 0.2;
  stepWorld(w, [{ kind: 'cast', id: 'p0', spell: 'meteor', at: v(4, 0) }], () => 0.5);
  for (let i = 0; i < 120; i++) {
    const meteor = w.projectiles.find((p) => p.kind === 'meteor');
    if (meteor && w.t + DT >= meteor.until) {
      target.pos = v(4.8, -residual * DT); // O passo anda antes do impacto; compensa para comparar a mesma direção radial.
      target.vel = v(0, residual);
      target.shieldUntil = shield ? expires : 0;
    }
    stepWorld(w, [], () => 0.5);
    if (w.events.some((e) => e.k === 'hit' && e.src === 'meteor' && e.id === target.id)) return { w, target };
  }
  throw new Error('Meteoro não atingiu o alvo');
}

describe('Meteoro contra Escudo', () => {
  for (const level of [1, 7]) it(`bloqueia dano e mantém exatamente um terço do impulso no nível ${level}`, () => {
    const normal = impact(level, false).target;
    const blocked = impact(level, true).target;
    expect(blocked.hp).toBe(HP_MAX);
    expect(blocked.dmgTaken).toBe(250);
    expect(len(blocked.vel)).toBeCloseTo(len(normal.vel) / 3, 8);
    expect(normal.hp).toBeLessThan(HP_MAX);
  });
  it('preserva o impulso anterior perpendicular ao impacto', () => {
    const normal = impact(1, false, 99, 2).target;
    const blocked = impact(1, true, 99, 2).target;
    expect(blocked.vel.y).toBeCloseTo(normal.vel.y, 8);
    expect(blocked.vel.x).toBeCloseTo(normal.vel.x / 3, 8);
  });
  it('Escudo que expirou antes do impacto não protege', () => {
    const normal = impact(1, false).target;
    const expired = impact(1, true, 0.5).target;
    expect(expired.hp).toBe(normal.hp);
    expect(expired.vel).toEqual(normal.vel);
  });
});
