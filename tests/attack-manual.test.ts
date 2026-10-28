import { describe, expect, it } from 'vitest';
import { BASIC_ATTACK, DT } from '../src/shared/constants.ts';
import { parseClientMessage } from '../src/shared/protocol.ts';
import { decodeSnap, encodeSnap, publicEvents } from '../src/shared/snapshot.ts';
import { stepWorld, type Projectile } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

const arena = (distance = 3) => {
  const w = world([[0, 0], [distance, 0], [0, 4]], noSpells(), [], () => .5);
  w.pillars = []; w.runes = []; w.shrinkAt = Infinity;
  w.wizards.forEach((z) => z.regen = 0);
  return w;
};
const attack = { id: 'p0', kind: 'basic' as const, at: v(3, 0), target: 'p1' };

describe('Manual Attack windup', () => {
  it('fires toward empty ground with a six metre lifetime, ignoring optional target ids', () => {
    expect(BASIC_ATTACK.range).toBe(6);
    for (const ground of [false, true]) {
      const w = arena(6); w.wizards[2].alive = false;
      run(w, .4 + DT, [{ ...attack, at: v(-10, -10), target: ground ? undefined : 'p1' }]);
      expect(w.projectiles.some((p) => p.kind === 'basic'), String(ground)).toBe(true);
    }
    const outside = arena(6.01);
    run(outside, .5, [attack]); expect(outside.wizards[0].basicReadyAt).toBeGreaterThan(0);
    expect(outside.projectiles[0].lockOn).toBeUndefined();
  });
  it('fires only after0.4s and a single command does not repeat', () => {
    const w = arena(); stepWorld(w, [attack], () => .5);
    expect(w.projectiles).toHaveLength(0);
    expect(w.wizards[0].basicCasting?.fireAt).toBeCloseTo(.4);
    run(w, .4 - DT * 2);
    expect(w.projectiles).toHaveLength(0);
    run(w, DT * 2);
    expect(w.projectiles.filter((p) => p.kind === 'basic')).toHaveLength(1);
    expect(w.wizards[0].basicReadyAt).toBeCloseTo(.4 + BASIC_ATTACK.cd);
    run(w, 2);
    expect(w.wizards[1].hp).toBe(1000 - BASIC_ATTACK.dmg);
  });
  it('melee hits only the clicked body without a projectile', () => {
    const w = arena(1); w.wizards[2].pos = v(.9, .2);
    run(w, .4 + DT, [{ ...attack, at: v(1, 0) }]);
    expect(w.wizards[1].hp).toBe(985);
    expect(w.wizards[2].hp).toBe(1000);
    expect(w.projectiles).toHaveLength(0);
    expect(w.wizards[1].vel.x).toBeGreaterThan(0);
  });
  it('empty ground does not acquire the nearest enemy', () => {
    const w = arena(3); w.wizards[2].pos = v(0, 1);
    run(w, .4 + DT, [{ ...attack, at: v(-10, -10), target: undefined }]);
    expect(w.wizards[2].hp).toBe(1000);
    expect(w.wizards[1].hp).toBe(1000);
    expect(w.projectiles[0].vel.x).toBeLessThan(0);
    expect(w.projectiles[0].vel.y).toBeLessThan(0);
  });
  it.each(['stop', 'move', 'cast'] as const)('%s cancels before release without spending cooldown', (kind) => {
    const w = arena(); stepWorld(w, [attack], () => .5); run(w, .2);
    w.wizards[0].spells.shield = 1;
    const command = kind === 'cast' ? { id: 'p0', kind, spell: 'shield' as const, at: v(0, 0) } : kind === 'move' ? { id: 'p0', kind, to: v(-1, 0) } : { id: 'p0', kind };
    stepWorld(w, [command], () => .5); run(w, 1);
    expect(w.projectiles.some((p) => p.kind === 'basic')).toBe(false);
    expect(w.wizards[0].basicCasting).toBeFalsy();
    expect(w.wizards[0].basicReadyAt ?? 0).toBe(0);
    expect(w.wizards[1].hp).toBe(1000);
    if (kind === 'move') expect(w.wizards[0].pos.x).toBeLessThan(0);
  });
  it('Stop on the release step still cancels', () => {
    const w = arena(); stepWorld(w, [attack], () => .5); run(w, .4 - DT);
    stepWorld(w, [{ id: 'p0', kind: 'stop' }], () => .5);
    expect(w.projectiles).toHaveLength(0);
  });
  it('stun prevents and interrupts windup; Incapacitate and Grip do not block', () => {
    const w = arena(); w.wizards[0].stunLeft = 1;
    stepWorld(w, [attack], () => .5); expect(w.wizards[0].basicCasting).toBeFalsy();
    w.wizards[0].stunLeft = 0; stepWorld(w, [attack], () => .5);
    w.wizards[0].stunLeft = 1; run(w, 1);
    expect(w.wizards[1].hp).toBe(1000);
    for (const state of ['gripUntil', 'electroUntil'] as const) {
      const a = arena(1); a.wizards[0][state] = 5;
      run(a, .4 + DT, [{ ...attack, at: v(1, 0) }]); expect(a.wizards[1].hp, state).toBe(985);
    }
  });
  it('fires at the ground even when an optional target is far, dead, allied or hidden', () => {
    for (const state of ['far', 'dead', 'ally', 'hidden']) {
      const w = arena(); const z = w.wizards[1];
      if (state === 'far') z.pos = v(10, 0);
      if (state === 'dead') z.alive = false;
      if (state === 'ally') w.wizards[0].team = z.team = 1;
      if (state === 'hidden') z.veilUntil = 5;
      run(w, .6, [attack]);
      expect(w.wizards[0].basicReadyAt ?? 0, state).toBeGreaterThan(0);
      expect(w.projectiles[0]?.lockOn, state).toBeUndefined();
    }
  });
  it('a dying or escaping melee target does not redirect the pending hit', () => {
    for (const die of [false, true]) {
      const w = arena(1); stepWorld(w, [{ ...attack, at: v(1, 0) }], () => .5);
      if (die) w.wizards[1].alive = false; else w.wizards[1].pos = v(4, 0);
      run(w, .5); expect(w.wizards[0].basicReadyAt ?? 0).toBe(0);
      expect(w.wizards[2].hp).toBe(1000);
    }
  });
  it('a straight projectile hits the first body in its path instead of homing on the chosen id', () => {
    const w = arena(4); w.wizards[2].pos = v(2, 0);
    stepWorld(w, [attack], () => .5); run(w, .45);
    w.wizards[1].pos = v(4, .5); run(w, .5);
    expect(w.wizards[1].hp).toBe(1000);
    expect(w.wizards[2].hp).toBe(985);
  });
  it('Shield reflects the projectile without taking damage', () => {
    const w = arena(); w.wizards[1].shieldUntil = 5;
    run(w, 1.5, [attack]);
    expect(w.wizards[1].hp).toBe(1000); expect(w.wizards[0].hp).toBe(985);
  });
  it('Shield blocks melee damage and reduces force by the general rule', () => {
    const a = arena(1), b = arena(1); b.wizards[1].shieldUntil = 5;
    run(a, .4 + DT, [{ ...attack, at: v(1, 0) }]); run(b, .4 + DT, [{ ...attack, at: v(1, 0) }]);
    expect(b.wizards[1].hp).toBe(1000);
    expect(b.wizards[1].vel.x / a.wizards[1].vel.x).toBeCloseTo(.6);
  });
  it('an obstacle blocks the released projectile before it reaches another body', () => {
    const w = arena(); w.pillars.push({ pos: v(1.5, 0), kind: 'rock', hp: 1000, alive: true });
    run(w, 1, [attack]); expect(w.wizards[1].hp).toBe(1000);
    expect(w.wizards[0].basicReadyAt ?? 0).toBeGreaterThan(0);
  });
  it('a visible copy is a valid melee target without selecting its hidden owner', () => {
    const w = arena(1); w.wizards[1].veilUntil = 5;
    const copy: Projectile = { id: w.nextId++, kind: 'illusion', owner: 'p1', caster: 'p1', pos: v(1, 0), vel: v(0, 0), level: 1, until: 3, target: null, dmgMult: 1 };
    w.projectiles.push(copy);
    run(w, .4 + DT, [{ ...attack, at: v(1, 0), target: copy.id }]);
    expect(copy.pushVel?.x).toBeGreaterThan(0);
    expect(w.wizards[1].hp).toBe(1000);
  });
  it('synchronizes windup for new viewers without revealing invisible enemies', () => {
    const w = arena(); stepWorld(w, [attack], () => .5);
    const own = decodeSnap(encodeSnap(w, 'p0', 1, []), ['p0', 'p1', 'p2']);
    expect(own.wizards[0].basicLeft).toBeGreaterThan(.35);
    w.wizards[0].veilUntil = 5;
    const enemy = decodeSnap(encodeSnap(w, 'p1', 1, []), ['p0', 'p1', 'p2']);
    expect(enemy.wizards[0].basicLeft ?? 0).toBe(0);
    expect(publicEvents([{ k: 'attack', id: 'p0', melee: true }], (id) => 'public-' + id)[0]).toMatchObject({ id: 'public-p0' });
  });
  it('validates an optional public target or copy id without accepting arbitrary objects', () => {
    const parse = (target: unknown) => parseClientMessage(JSON.stringify({ t: 'basic', x: 0, y: 0, seq: 1, target }));
    expect(parse('p123')).toMatchObject({ target: 'p123' }); expect(parse(12)).toMatchObject({ target: 12 });
    for (const invalid of ['secret-id', -1, 1.5, {}, true, null]) expect(parse(invalid)).toBeNull();
  });
});
