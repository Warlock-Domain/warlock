import { describe, expect, it } from 'vitest';
import { ARENA_R0, ARENA_STEP, DT, HP_MAX, SHRINK_EVERY, WIZ_R } from '../src/shared/constants.ts';
import { SPELLS } from '../src/shared/spells.ts';
import { newWorld, stepWorld, type Cmd, type World } from '../src/shared/sim.ts';
import { noSpells, type SpellId } from '../src/shared/spells.ts';
import { dist, v } from '../src/shared/vec.ts';

const all = (): Record<SpellId, number> => ({ fireball: 1, lightning: 1, homing: 1, shield: 1, teleport: 1 });

// mundo com magos em posições escolhidas, todos com as 5 magias no nível 1
function world(spots: [number, number][]): World {
  const ids = spots.map((_, i) => 'p' + i);
  const w = newWorld(ids, Object.fromEntries(ids.map((id) => [id, all()])));
  spots.forEach(([x, y], i) => (w.wizards[i].pos = v(x, y)));
  return w;
}

function run(w: World, seconds: number, cmds: Cmd[] = []) {
  stepWorld(w, cmds);
  for (let i = 1; i < Math.round(seconds / DT); i++) stepWorld(w, []);
}

const wz = (w: World, i: number) => w.wizards[i];

describe('movimento, lava e arena', () => {
  it('walks to target and stops', () => {
    const w = world([[0, 0]]);
    run(w, 3, [{ id: 'p0', kind: 'move', to: v(3, 0) }]);
    expect(wz(w, 0).pos.x).toBeCloseTo(3, 5);
    expect(wz(w, 0).target).toBeNull();
  });

  it('cannot walk while sliding fast', () => {
    const w = world([[0, 0]]);
    wz(w, 0).vel = v(0, 6);
    stepWorld(w, [{ id: 'p0', kind: 'move', to: v(5, 0) }]);
    expect(wz(w, 0).pos.x).toBe(0);
    expect(wz(w, 0).pos.y).toBeGreaterThan(0);
  });

  it('regenerates slowly on stone', () => {
    const w = world([[0, 0]]);
    wz(w, 0).hp = 50;
    run(w, 2);
    expect(wz(w, 0).hp).toBeCloseTo(51, 1);
  });

  it('lava drains 10 hp per second', () => {
    const w = world([[ARENA_R0 + 1, 0]]);
    run(w, 1);
    expect(wz(w, 0).hp).toBeCloseTo(HP_MAX - 10, 1);
  });

  it('arena shrinks by ARENA_STEP every SHRINK_EVERY', () => {
    const w = world([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(w.arenaR).toBeCloseTo(ARENA_R0);
    run(w, SHRINK_EVERY + 0.1);
    expect(w.arenaR).toBeCloseTo(ARENA_R0 - ARENA_STEP);
    expect(w.events.length + 0).toBeGreaterThanOrEqual(0);
  });

  it('wizards do not overlap', () => {
    const w = world([[0, 0], [0.1, 0]]);
    run(w, 0.5);
    expect(dist(wz(w, 0).pos, wz(w, 1).pos)).toBeGreaterThanOrEqual(2 * WIZ_R - 0.01);
  });

  it('dead wizard does not move', () => {
    const w = world([[0, 0]]);
    wz(w, 0).alive = false;
    run(w, 1, [{ id: 'p0', kind: 'move', to: v(3, 0) }]);
    expect(wz(w, 0).pos.x).toBe(0);
  });
});

describe('magias', () => {
  it('fireball hits and pushes away from caster', () => {
    const w = world([[0, 0], [4, 0]]);
    run(w, 1.5, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(4, 0) }]);
    // a regeneração devolve um pouco da vida depois do acerto
    expect(wz(w, 1).hp).toBeGreaterThanOrEqual(HP_MAX - SPELLS.fireball.levels[0].dmg);
    expect(wz(w, 1).hp).toBeLessThan(HP_MAX - SPELLS.fireball.levels[0].dmg + 1);
    expect(wz(w, 1).pos.x).toBeGreaterThan(5);
    expect(wz(w, 1).lastHitBy).toBe('p0');
  });

  it('fireball never tunnels', () => {
    const w = world([[0, 0], [SPELLS.fireball.levels[0].range - 0.3, 0]]);
    run(w, 2, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(1, 0) }]);
    expect(wz(w, 1).hp).toBeLessThan(HP_MAX);
  });

  it('cannot cast on cooldown', () => {
    const w = world([[0, 0], [3, 0]]);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) }]);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) }]);
    expect(w.projectiles.length).toBe(1);
  });

  it('cannot cast spell not owned', () => {
    const w = newWorld(['a', 'b'], { a: noSpells(), b: noSpells() });
    stepWorld(w, [{ id: 'a', kind: 'cast', spell: 'lightning', at: v(0, 0) }]);
    expect(w.events.some((e) => e.k === 'lightning')).toBe(false);
  });

  it('lightning hits first wizard on the line within range', () => {
    const w = world([[0, 0], [2.5, 0], [3.5, 0]]);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(6, 0) }]);
    expect(wz(w, 1).hp).toBeLessThan(HP_MAX);
    expect(wz(w, 2).hp).toBe(HP_MAX);
  });

  it('lightning does not reach past its range', () => {
    const w = world([[0, 0], [8, 0]]);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(8, 0) }]);
    expect(wz(w, 1).hp).toBe(HP_MAX);
  });

  it('shield reflects fireball back to caster', () => {
    const w = world([[0, 0], [4, 0]]);
    stepWorld(w, [
      { id: 'p0', kind: 'cast', spell: 'fireball', at: v(4, 0) },
      { id: 'p1', kind: 'cast', spell: 'shield', at: v(0, 0) },
    ]);
    run(w, 1.5);
    expect(wz(w, 1).hp).toBe(HP_MAX);
    expect(wz(w, 0).hp).toBeLessThan(HP_MAX);
    expect(wz(w, 0).lastHitBy).toBe('p1');
  });

  it('shield aims the reflected fireball at where the shooter is now', () => {
    const w = world([[0, 0], [4, 0]]);
    stepWorld(w, [
      { id: 'p0', kind: 'cast', spell: 'fireball', at: v(4, 0) },
      { id: 'p1', kind: 'cast', spell: 'shield', at: v(0, 0) },
    ]);
    // quem atirou foge para o lado logo depois de lançar
    wz(w, 0).pos = v(0, 2.5);
    run(w, 2);
    expect(wz(w, 1).hp).toBe(HP_MAX);
    expect(wz(w, 0).hp).toBeLessThan(HP_MAX);
  });

  it('shield reflects lightning to caster', () => {
    const w = world([[0, 0], [3, 0]]);
    stepWorld(w, [{ id: 'p1', kind: 'cast', spell: 'shield', at: v(0, 0) }]);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(3, 0) }]);
    expect(wz(w, 1).hp).toBe(HP_MAX);
    expect(wz(w, 0).hp).toBeLessThan(HP_MAX);
  });

  it('homing locks target nearest to aim point', () => {
    const w = world([[0, 0], [5, 3], [5, -3]]);
    run(w, 4, [{ id: 'p0', kind: 'cast', spell: 'homing', at: v(5, -3.5) }]);
    expect(wz(w, 2).hp).toBeLessThan(HP_MAX);
    expect(wz(w, 1).hp).toBe(HP_MAX);
  });

  it('teleport clamps to range', () => {
    const w = world([[0, 0]]);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'teleport', at: v(20, 0) }]);
    expect(wz(w, 0).pos.x).toBeCloseTo(SPELLS.teleport.levels[0].range);
  });

  it('knockback grows as hp drops', () => {
    const fresh = world([[0, 0], [3, 0]]);
    const hurt = world([[0, 0], [3, 0]]);
    wz(hurt, 1).dmgTaken = 80;
    for (const w of [fresh, hurt]) run(w, 2.5, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) }]);
    expect(wz(hurt, 1).pos.x - 3).toBeGreaterThan((wz(fresh, 1).pos.x - 3) * 1.5);
  });

  it('death credits last hitter within 5s', () => {
    const w = world([[0, 0], [3, 0]]);
    wz(w, 1).hp = 5;
    const deaths: { id: string; by: string | null }[] = [];
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) }]);
    for (let i = 0; i < 120; i++) {
      stepWorld(w, []);
      for (const e of w.events) if (e.k === 'death') deaths.push(e);
    }
    expect(deaths).toEqual([{ k: 'death', id: 'p1', by: 'p0' }]);
    expect(wz(w, 1).alive).toBe(false);
  });

  it('lava death long after the hit has no killer', () => {
    const w = world([[ARENA_R0 + 2, 0]]);
    wz(w, 0).hp = 1;
    wz(w, 0).lastHitBy = 'x';
    wz(w, 0).lastHitAt = -10;
    run(w, 0.5);
    expect(wz(w, 0).alive).toBe(false);
  });
});

describe('choque de magias', () => {
  it('two enemy fireballs meeting explode in an area', () => {
    const w = world([[-3, 0], [3, 0], [0, 0.8]]);
    stepWorld(w, [
      { id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) },
      { id: 'p1', kind: 'cast', spell: 'fireball', at: v(-3, 0) },
    ]);
    const clashes: string[] = [];
    for (let i = 0; i < 40; i++) {
      stepWorld(w, []);
      for (const e of w.events) if (e.k === 'clash') clashes.push(e.combo);
    }
    expect(clashes).toEqual(['fire']);
    expect(w.projectiles.length).toBe(0);
    expect(wz(w, 2).hp).toBeLessThan(HP_MAX);
    expect(wz(w, 0).hp).toBe(HP_MAX);
  });

  it('fireball meeting a homing missile makes an arcane explosion', () => {
    const w = world([[-3, 0], [3, 0]]);
    stepWorld(w, [
      { id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) },
      { id: 'p1', kind: 'cast', spell: 'homing', at: v(-3, 0) },
    ]);
    const clashes: string[] = [];
    for (let i = 0; i < 60; i++) {
      stepWorld(w, []);
      for (const e of w.events) if (e.k === 'clash') clashes.push(e.combo);
    }
    expect(clashes).toEqual(['arcane']);
  });

  it('own projectiles do not collide with each other', () => {
    const w = world([[0, 0], [8, 8]]);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) }]);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'homing', at: v(3, 0) }]);
    stepWorld(w, []);
    expect(w.projectiles.length).toBe(2);
  });

  it('lightning detonates a fireball in its path', () => {
    const w = world([[0, 0], [3, 2], [2.2, 0.6]]);
    stepWorld(w, [{ id: 'p1', kind: 'cast', spell: 'fireball', at: v(-3, -2) }]);
    for (let i = 0; i < 6; i++) stepWorld(w, []);
    const fb = w.projectiles[0].pos;
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(fb.x, fb.y) }]);
    expect(w.events.some((e) => e.k === 'clash' && e.combo === 'detonate')).toBe(true);
    expect(w.projectiles.length).toBe(0);
    expect(wz(w, 2).hp).toBeLessThan(HP_MAX);
  });
});
