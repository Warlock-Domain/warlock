import { describe, expect, it } from 'vitest';
import { DT } from '../src/shared/constants.ts';
import { incapacitatedUntil, stepWorld } from '../src/shared/sim.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { noSpells, spellLevel } from '../src/shared/spells.ts';
import { transfusionTarget } from '../src/shared/heal-target.ts';
import { v } from '../src/shared/vec.ts';
import { world, run } from './helpers.ts';

function setup(level = 1) {
  const w = world([[0, 0], [4, 0], [5, 2]], { ...noSpells(), transfusion: level }, [], () => .5, false, [0, 0, 1]);
  w.pillars = [];
  for (const z of w.wizards) { z.regen = 0; z.cd.fireball = 10; }
  return w;
}
const start = (w: ReturnType<typeof setup>) => stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'transfusion', at: v(4, 0) }], () => .5);
describe('Mental Transfusion', () => {
  it('has the approved seven-level progression and only targets another living ally', () => {
    expect(spellLevel('transfusion', 1)).toMatchObject({ cd: 22, range: 10, scale: .2 });
    expect(spellLevel('transfusion', 7)).toMatchObject({ cd: 16, range: 16, scale: 1.4 });
    const w = setup(), caster = w.wizards[0];
    expect(transfusionTarget(w.wizards, caster, v(0, 0), 10)).toBeUndefined();
    expect(transfusionTarget(w.wizards, caster, v(5, 2), 10)).toBeUndefined();
    expect(transfusionTarget(w.wizards, caster, v(4, 0), 3)).toBeUndefined();
    expect(transfusionTarget(w.wizards, caster, v(4, 0), 10)?.id).toBe('p1');
    w.wizards[1].alive = false;
    expect(transfusionTarget(w.wizards, caster, v(4, 0), 10)).toBeUndefined();
  });
  it('invalid targets spend no cooldown and keep an existing action', () => {
    const w = setup(), caster = w.wizards[0];
    caster.target = v(2, 0);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'transfusion', at: v(0, 0) }], () => .5);
    expect(caster.cd.transfusion).toBe(0);
    expect(caster.transfusion).toBeUndefined();
    expect(caster.target).not.toBeNull();
  });
  for (const level of [1, 7]) it('accelerates ally cooldowns at level ' + level + ' while pausing all caster cooldowns', () => {
    const w = setup(level); start(w);
    const [caster, ally, enemy] = w.wizards;
    const before = [caster.cd.fireball - w.t, ally.cd.fireball - w.t, enemy.cd.fireball - w.t, caster.cd.transfusion - w.t];
    run(w, 1);
    expect(before[1] - (ally.cd.fireball - w.t)).toBeCloseTo(1 + spellLevel('transfusion', level).scale, 3);
    expect(before[0] - (caster.cd.fireball - w.t)).toBeCloseTo(0, 3);
    expect(before[2] - (enemy.cd.fireball - w.t)).toBeCloseTo(1, 3);
    expect(caster.cd.transfusion - w.t).toBeCloseTo(before[3], 3);
    expect(incapacitatedUntil(caster, w.t)).toBeGreaterThan(w.t);
    expect(caster.pos).toEqual(v(0, 0));
  });
  it('does not bypass an incapacitated ally or make cooldown timestamps negative', () => {
    const w = setup(); start(w);
    const ally = w.wizards[1];
    ally.incapacitateUntil = w.t + 2;
    const left = ally.cd.fireball - w.t;
    run(w, 1);
    expect(ally.cd.fireball - w.t).toBeCloseTo(left, 3);
    ally.incapacitateUntil = 0; ally.cd.fireball = w.t + DT / 10;
    stepWorld(w, [], () => .5);
    expect(ally.cd.fireball).toBeGreaterThanOrEqual(w.t - DT);
  });
  it('ends on range loss, death, suspension, stun, Stop or movement', () => {
    for (const how of ['range', 'death', 'suspension', 'stun', 'stop', 'move']) {
      const w = setup(); start(w);
      if (how === 'range') w.wizards[1].pos = v(11, 0);
      if (how === 'death') w.wizards[1].alive = false;
      if (how === 'suspension') w.wizards[0].geyserLeft = 2;
      if (how === 'stun') w.wizards[0].stunLeft = 2;
      stepWorld(w, how === 'stop' ? [{ id: 'p0', kind: 'stop' }] : how === 'move' ? [{ id: 'p0', kind: 'move', to: v(1, 0) }] : [], () => .5);
      expect(w.wizards[0].transfusion, how).toBeUndefined();
    }
  });
  it('round-trips a visible link through snapshots, without exposing secret ids', () => {
    const w = setup(); start(w);
    const snap = encodeSnap(w, 'p0', 0, []);
    expect(snap.mt).toEqual([1, .2, -1, 0, -1, 0]);
    expect(decodeSnap(snap, ['one', 'two', 'three']).wizards[0]).toMatchObject({ transfusionTo: 1, transfusionRate: .2 });
  });
});
