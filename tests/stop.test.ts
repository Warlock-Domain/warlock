import { describe, expect, it } from 'vitest';
import { HP_MAX } from '../src/shared/constants.ts';
import { stepWorld, type World } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

const half = () => 0.5;
const steps = (w: World, n: number) => {
  for (let i = 0; i < n; i++) stepWorld(w, [], half);
};

// S como no Dota (#144): durante o tempo de lançamento cancela a magia, que não sai nem gasta a recarga
describe('S (parar)', () => {
  it('no meio do lançamento cancela a Bola de fogo sem gastar a recarga', () => {
    const w = world([[0, 0], [3, 0]], noSpells(), [], half);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) }], half);
    expect(w.wizards[0].casting?.spell).toBe('fireball');
    stepWorld(w, [{ id: 'p0', kind: 'stop' }], half);
    expect(w.wizards[0].casting).toBeNull();
    steps(w, 60);
    expect(w.projectiles.length).toBe(0);
    expect(w.wizards[1].hp).toBe(HP_MAX);
    expect(w.wizards[0].cd.fireball).toBe(0);
    // recarga livre: lança de novo na hora
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) }], half);
    expect(w.wizards[0].casting?.spell).toBe('fireball');
  });

  it('no meio do lançamento também esquece o clique de andar guardado', () => {
    const w = world([[0, 0]], noSpells(), [], half);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) }], half);
    stepWorld(w, [{ id: 'p0', kind: 'move', to: v(0, 4) }], half);
    stepWorld(w, [{ id: 'p0', kind: 'stop' }], half);
    steps(w, 30);
    expect(w.wizards[0].target).toBeNull();
    expect(w.wizards[0].pos.y).toBeCloseTo(0);
  });

  it('sem lançamento só para de andar', () => {
    const w = world([[0, 0]], noSpells(), [], half);
    stepWorld(w, [{ id: 'p0', kind: 'move', to: v(0, 4) }], half);
    steps(w, 10);
    const y = w.wizards[0].pos.y;
    expect(y).toBeGreaterThan(0);
    stepWorld(w, [{ id: 'p0', kind: 'stop' }], half);
    steps(w, 30);
    expect(w.wizards[0].target).toBeNull();
    expect(w.wizards[0].pos.y).toBeCloseTo(y, 1);
    expect(w.wizards[0].cd.fireball).toBe(0);
  });

  it('no preparo do Flagelo cancela a explosão sem gastar a recarga', () => {
    const w = world([[0, 0], [1, 0]], noSpells(), [], half);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'scourge', at: v(0, 0) }], half);
    steps(w, 5);
    stepWorld(w, [{ id: 'p0', kind: 'stop' }], half);
    expect(w.wizards[0].casting).toBeNull();
    steps(w, 40);
    expect(w.wizards[1].hp).toBe(HP_MAX);
    expect(w.wizards[0].cd.scourge).toBe(0);
  });
});
