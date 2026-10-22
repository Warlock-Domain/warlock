import { describe, expect, it } from 'vitest';
import { DT, STUN_SPEED } from '../src/shared/constants.ts';
import { moveWizard } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

describe('retomada limpa depois do empurrão', () => {
  it('atordoamento sem impulso não inicia recuperação pós-knockback', () => {
    const z = world([[0, 0]], noSpells(), [], () => .5).wizards[0];
    z.stunLeft = .5;
    for (let i=0; i<60; i++) moveWizard(z, DT);
    expect(z.recoveryLeft ?? 0).toBe(0);
    expect(z.vel).toEqual(v(0, 0));
  });
  it.each([[0, 10], [-10, 0]])('retoma sem residual com destino %s,%s', (x, y) => {
    const z = world([[0, 0]], noSpells(), [], () => .5).wizards[0];
    z.speed = 2;
    z.vel = v(STUN_SPEED * 1.01, 0);
    z.target = v(x, y);
    moveWizard(z, DT);
    expect(z.vel).toEqual(v(0, 0));
    const start = { ...z.pos };
    moveWizard(z, .01);
    expect(Math.hypot(z.pos.x - start.x, z.pos.y - start.y)).toBeCloseTo(.01, 8);
    expect(z.recoveryLeft).toBeCloseTo(.99, 8);
  });
  it('sobe dez pontos percentuais a cada 0,2 s e termina em um segundo', () => {
    const z = world([[0, 0]], noSpells(), [], () => .5).wizards[0];
    z.speed = 2; z.target = v(0, 100); z.recoveryLeft = 1;
    for (let i = 0; i < 5; i++) {
      const before = z.pos.y;
      moveWizard(z, .2);
      expect(z.pos.y - before).toBeCloseTo(2 * (.5 + i * .1) * .2, 8);
    }
    const before = z.pos.y;
    moveWizard(z, .1);
    expect(z.pos.y - before).toBeCloseTo(.2, 8);
  });
  it('novo impacto durante recuperação interrompe a caminhada e reinicia a retomada', () => {
    const z = world([[0, 0]], noSpells(), [], () => .5).wizards[0];
    z.target = v(0, 100); z.recoveryLeft = .3; z.vel = v(STUN_SPEED * 1.01, 0);
    moveWizard(z, DT);
    expect(z.pos.y).toBe(0);
    expect(z.recoveryLeft).toBe(1);
    expect(z.target).toEqual(v(0, 100));
  });
  it('sem comando não inventa caminhada ao acabar o impulso', () => {
    const z = world([[0, 0]], noSpells(), [], () => .5).wizards[0];
    z.vel = v(STUN_SPEED * 1.01, 0);
    moveWizard(z, DT);
    const at = { ...z.pos };
    for (let i = 0; i < 120; i++) moveWizard(z, DT);
    expect(z.pos).toEqual(at);
    expect(z.target).toBeNull();
  });
});
