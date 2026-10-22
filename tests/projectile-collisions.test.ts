import { describe, expect, it } from 'vitest';
import { OBSTACLES } from '../src/shared/constants.ts';
import { newWorld, stepWorld, type Projectile } from '../src/shared/sim.ts';
import { LIGHTNING, noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';

const kinds = ['fireball', 'homing', 'cluster', 'boomerang', 'gravity', 'bouncer', 'drain', 'snowball', 'magnetize', 'recharge', 'link', 'splitter', 'shard', 'swap'] as const;
function arena() {
  const w = newWorld(['p0', 'p1'], { p0: { ...noSpells(), lightning: 1 }, p1: noSpells() }, {}, 0, () => .5);
  w.pillars = [];
  w.wizards[0].pos = v(-3, 0);
  w.wizards[1].pos = v(3, 3);
  for (const z of w.wizards) z.invulnUntil = 0;
  return w;
}
function bolt(id: number, kind: Projectile['kind'], owner: string, x: number, y = 0): Projectile {
  return { id, kind, owner, caster: owner, pos: v(x, y), vel: v(.1, 0), level: 1, until: 20, target: null, dmgMult: 1 };
}
describe('colisões gerais e limpeza do Raio', () => {
  it.each(kinds.flatMap((a, i) => kinds.slice(i).map((b) => [a, b] as const)))('%s e %s se anulam pela regra geral', (a, b) => {
    const w = arena();
    w.projectiles = [bolt(100, a, 'p0', 0), bolt(101, b, 'p1', .1)];
    stepWorld(w, [], () => .5);
    expect(w.projectiles.some((p) => p.id === 100 || p.id === 101)).toBe(false);
  });
  it.each(kinds)('Rajada e %s inimigo se destroem', (kind) => {
    const w = arena();
    w.projectiles = [bolt(100, 'cluster', 'p0', 0), bolt(101, kind, 'p1', .1)];
    stepWorld(w, [], () => .5);
    expect(w.projectiles.some((p) => p.id === 100 || p.id === 101)).toBe(false);
  });
  it('Raio limpa vários tipos em sequência, mas não efeitos persistentes ou fora da faixa', () => {
    const w = arena();
    w.projectiles = [bolt(100, 'cluster', 'p1', -1), bolt(101, 'fireball', 'p0', 0), bolt(102, 'homing', 'p1', 1),
      bolt(103, 'fireball', 'p1', 0, 2), bolt(104, 'illusion', 'p1', 2)];
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(4, 0) }], () => .5);
    for (let i = 0; i < 7; i++) stepWorld(w, [], () => .5);
    expect(w.projectiles.map((p) => p.id)).toEqual([103, 104]);
  });
  it('destruir projéteis não impede o Raio de acertar o mago depois deles', () => {
    const w = arena();
    w.wizards[1].pos = v(1.5, 0);
    w.projectiles = [bolt(100, 'cluster', 'p1', 0)];
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(4, 0) }], () => .5);
    for (let i = 0; i < 7; i++) stepWorld(w, [], () => .5);
    expect(w.projectiles).toHaveLength(0);
    expect(w.wizards[1].hp).toBeLessThan(w.wizards[1].hpMax);
  });
  it.each([false, true])('não anula projéteis do mesmo dono/aliados, aliados=%s', (allied) => {
    const w = arena();
    if (allied) for (const z of w.wizards) z.team = 0;
    w.projectiles = [bolt(100, 'cluster', 'p0', 0), bolt(101, 'fireball', allied ? 'p1' : 'p0', .1)];
    stepWorld(w, [], () => .5);
    expect(w.projectiles).toHaveLength(2);
  });
  it('obstáculo bloqueia o feixe e protege projéteis atrás dele', () => {
    const w = arena();
    w.pillars = [{ kind: 'pillar', pos: v(0, 0), hp: OBSTACLES.pillar.hp, alive: true }];
    w.projectiles = [bolt(100, 'cluster', 'p1', -1), bolt(101, 'cluster', 'p1', 1)];
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(4, 0) }], () => .5);
    for (let i = 0; i < 7; i++) stepWorld(w, [], () => .5);
    expect(w.projectiles.map((p) => p.id)).toEqual([101]);
  });
  it('explosão visual ampliada da destruição não causa dano em área', () => {
    const w = arena();
    w.wizards[1].pos = v(0, .8); // dentro do efeito visual, mas fora da faixa do Raio.
    w.projectiles = [bolt(100, 'cluster', 'p1', 0)];
    let effect = false;
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(4, 0) }], () => .5);
    for (let i = 0; i < 7; i++) {
      stepWorld(w, [], () => .5);
      effect ||= w.events.some((e) => e.k === 'clash' && e.r === LIGHTNING.destroyFxRadius);
    }
    expect(effect).toBe(true);
    expect(LIGHTNING.destroyFxRadius).toBe(.6); // escala visual pertence à cena, não ao feixe.
    expect(w.wizards[1].hp).toBe(w.wizards[1].hpMax);
    expect(w.wizards[1].vel).toEqual(v(0, 0));
  });
});
