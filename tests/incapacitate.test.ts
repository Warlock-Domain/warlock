import { describe, expect, it } from 'vitest';
import { DT } from '../src/shared/constants.ts';
import { applyElectrocution, stepWorld } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { encodeSnap, decodeSnap } from '../src/shared/snapshot.ts';
import { v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';
import { electroPulse } from '../src/client/screen-data.ts';

const arena = () => {
  const w = world([[0, 0], [2, 0]], { ...noSpells(), lightning: 1, teleport: 1, shield: 1 }, [], () => .5);
  w.pillars = []; w.runes = [];
  for (const z of w.wizards) z.regen = 0;
  return w;
};
describe('Incapacitar pausa recargas, não é silêncio', () => {
  it('piscar suave desaparece no fim e vira brilho estático no modo de movimento reduzido', () => {
    expect(electroPulse(false, 1, false)).toBe(0);
    expect(electroPulse(true, 0, true)).toBe(electroPulse(true, 3, true));
    expect(electroPulse(true, .125, false)).toBeGreaterThan(electroPulse(true, .375, false));
  });
  it('Raio aplica2s de efeito a cada inimigo da cadeia', () => {
    const w = arena();
    run(w, .15, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(3, 0) }]);
    expect(w.wizards[1].electroUntil! - w.t).toBeGreaterThan(1.9);
  });
  it('reduz caminhada25% e mantém as recargas congeladas, inclusive com runa de Recarga', () => {
    const w = arena(), z = w.wizards[0];
    applyElectrocution(w, z);
    z.cd.fireball = 5; z.rune = 'recharge'; z.runeUntil = 10;
    run(w, .5);
    expect(z.speed).toBeCloseTo(z.baseSpeed * .75);
    expect(z.cd.fireball - w.t).toBeCloseTo(5);
    run(w, 1.6);
    expect(z.cd.fireball - w.t).toBeLessThan(5);
    expect(z.speed).toBeCloseTo(z.baseSpeed);
  });
  it('habilidade pronta pode ser lançada e não cancela conjuração já em preparo', () => {
    const w = arena(), z = w.wizards[0];
    applyElectrocution(w, z);
    z.casting = { spell: 'fireball', at: v(4, 0), fireAt: .05 };
    run(w, .1);
    expect(z.cd.fireball).toBeGreaterThan(0);
    stepWorld(w, [{ id: z.id, kind: 'cast', spell: 'teleport', at: v(0, 2) }], () => .5);
    expect(z.pos.y).toBeGreaterThan(1);
  });
  it('Escudo reduz duração ao receber, não retroativamente; invulnerável não recebe debuff', () => {
    const w = arena(), z = w.wizards[0];
    z.shieldUntil = 5; applyElectrocution(w, z);
    expect(z.electroUntil).toBeCloseTo(1.2);
    z.electroUntil = 0; z.shieldUntil = 0; applyElectrocution(w, z);
    z.shieldUntil = 5;
    expect(z.electroUntil).toBeCloseTo(2);
    z.electroUntil = 0; z.invulnUntil = 10; applyElectrocution(w, z);
    expect(z.electroUntil).toBe(0);
  });
  it('snapshot envia Incapacitar, lentidão e efeito elétrico', () => {
    const w = arena(), z = w.wizards[0]; applyElectrocution(w, z);
    stepWorld(w, [], () => .5);
    const snap = encodeSnap(w, z.id, 1, []);
    const d = decodeSnap(snap, ['p0', 'p1']).wizards[0];
    expect(d.status & 268435456).toBeTruthy();
    expect(d.status & 536870912).toBeTruthy();
    expect(d.status & 4).toBeTruthy();
    expect(snap.sp).toBeCloseTo(Math.round(z.baseSpeed * .75 * 100) / 100);
  });
});
