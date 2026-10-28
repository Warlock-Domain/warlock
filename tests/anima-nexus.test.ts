import { describe, expect, it } from 'vitest';
import { noSpells, SPELLS, spellLevel, type SpellId } from '../src/shared/spells.ts';
import { stepWorld, statusDuration } from '../src/shared/sim.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { parseServerMessage } from '../src/client/net-message.ts';
import { run, world } from './helpers.ts';

function setup(link = true) {
  const w = world([[-3, 0], [0, 0], [2.5, 0]], { ...noSpells(), nexus: 1, fireball: 1, cluster: 1 }, [], () => .5, false, [0, 0, 1]);
  w.pillars = []; w.runes = []; w.rules.runes = false; w.rules.chests = false; w.shrinkAt = 1000;
  for (const z of w.wizards) z.regen = 0;
  if (link) stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'nexus', at: w.wizards[1].pos }], () => .5);
  return w;
}
function hit(w: ReturnType<typeof setup>, spell: SpellId = 'fireball') {
  stepWorld(w, [{ id: 'p2', kind: 'cast', spell, at: w.wizards[1].pos }], () => .5);
  for (let i = 0; i < 120 && !w.events.some(e => e.k === 'hit' && e.by === 'p2'); i++) stepWorld(w, [], () => .5);
}
describe('Anima Nexus', () => {
  it('progresses only range and cooldown using approved values', () => {
    expect(SPELLS.nexus.cost).toBe(25);
    expect(spellLevel('nexus', 1)).toMatchObject({ range: 7, cd: 15 });
    expect(spellLevel('nexus', 7)).toMatchObject({ range: 13, cd: 9 });
  });
  it('protects the ally and transfers 125% of incoming damage', () => {
    const w = setup(); hit(w);
    expect(w.wizards[1].hp).toBe(1000);
    expect(w.wizards[0].hp).toBeCloseTo(1000 - spellLevel('fireball', 1).dmg * 1.25);
  });
  it('applies each participant defenses without reapplying attacker bonuses', () => {
    const w = setup(); w.wizards[1].ward = 10; w.wizards[0].ward = 3;
    hit(w);
    expect(w.wizards[0].hp).toBeCloseTo(1000 - (spellLevel('fireball', 1).dmg - 10) * 1.25 + 3);
    expect(w.wizards[1].hp).toBe(1000);
  });
  it('splits new knockback equally while the ranged basic rule remains separate', () => {
    const normal = setup(false); hit(normal);
    const linked = setup(); hit(linked);
    expect(linked.wizards[1].vel.x).toBeCloseTo(normal.wizards[1].vel.x / 2);
    expect(linked.wizards[0].vel.x).toBeCloseTo(normal.wizards[1].vel.x / 2);
  });
  it('splits new Blindness and Incapacitate durations without moving preexisting clocks', () => {
    const w = setup(); hit(w, 'cluster');
    const [caster, ally] = w.wizards, base = spellLevel('cluster', 1);
    expect(caster.blindUntil).toBeCloseTo(ally.blindUntil!);
    expect(caster.blindUntil! - w.t).toBeCloseTo(base.blind / 2, 1);
    expect(caster.incapacitateUntil).toBeCloseTo(ally.incapacitateUntil!);
    const until = caster.blindUntil; run(w, .1); expect(caster.blindUntil).toBe(until);
  });
  it('permits movement but breaks on range loss or death', () => {
    const w = setup(); stepWorld(w, [{ id: 'p0', kind: 'move', to: { x: -3, y: 1 } }], () => .5);
    expect(w.wizards[0].nexus).toBeDefined();
    w.wizards[1].pos.x = 20; stepWorld(w, [], () => .5);
    expect(w.wizards[0].nexus).toBeUndefined();
    const dead = setup(); dead.wizards[1].alive = false; stepWorld(dead, [], () => .5);
    expect(dead.wizards[0].nexus).toBeUndefined();
  });
  it('toggles off during cooldown and stun without spending another cooldown', () => {
    const w = setup(), caster = w.wizards[0], cd = caster.cd.nexus;
    caster.stunLeft = 2;
    stepWorld(w, [{ id: caster.id, kind: 'cast', spell: 'nexus', at: { x: 0, y: 0 } }], () => .5);
    expect(caster.nexus).toBeUndefined(); expect(caster.cd.nexus).toBe(cd);
  });
  it('rejects self, enemies, out-of-range targets and cycles without spending cooldown', () => {
    for (const at of [{ x: -3, y: 0 }, { x: 2.5, y: 0 }, { x: 99, y: 0 }]) {
      const w = setup(false); stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'nexus', at }], () => .5);
      expect(w.wizards[0].nexus).toBeUndefined(); expect(w.wizards[0].cd.nexus).toBe(0);
    }
    const w = setup(); stepWorld(w, [{ id: 'p1', kind: 'cast', spell: 'nexus', at: w.wizards[0].pos }], () => .5);
    expect(w.wizards[1].nexus).toBeUndefined();
  });
  it('synchronizes visible links and rejects malformed link snapshots', () => {
    const w = setup(), s = encodeSnap(w, 'p0', 0, []);
    expect(s.nx).toEqual([1, -1, -1]); expect(parseServerMessage(s)).not.toBeNull();
    expect(decodeSnap(s, ['p0', 'p1', 'p2']).wizards[0].nexusTo).toBe(1);
    expect(parseServerMessage({ ...s, nx: [99, -1, -1] })).toBeNull();
    w.wizards[0].veilUntil = 10;
    expect(encodeSnap(w, 'p2', 0, []).nx).toEqual([-1, -1, -1]);
  });
  it('keeps owner cancellation available when the protected ally is hidden', () => {
    const w = setup(); w.wizards[1].veilUntil = 10;
    expect(encodeSnap(w, 'p0', 0, []).nx?.[0]).toBe(1);
    expect(encodeSnap(w, 'p2', 0, []).nx?.[0]).toBe(-1);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'nexus', at: { x: 0, y: 0 } }]);
    expect(w.wizards[0].nexus).toBeUndefined();
  });
  it('transfers environmental loss without inventing allied lifesteal', () => {
    const w = setup(), [caster, ally] = w.wizards;
    caster.pos = { x: 0, y: 0 }; ally.pos = { x: 5, y: 0 }; w.arenaR = 3;
    w.wizards[2].pos = { x: 0, y: 0 };
    ally.hp = 900; ally.lifesteal = 1;
    const before = caster.hp;
    stepWorld(w, [], () => .5);
    expect(ally.hp).toBe(900);
    expect(caster.hp).toBeLessThan(before);
    // Burning zones use the same transfer path even on stone.
    w.arenaR = 30; w.zones.push({ kind: 'burn', pos: { ...ally.pos }, r: 1, until: w.t + 5 });
    const afterLava = caster.hp; stepWorld(w, [], () => .5);
    expect(ally.hp).toBe(900); expect(caster.hp).toBeLessThan(afterLava);
  });
  it('carries the new slow payload through a chain of protectors', () => {
    const w = setup(false), [a, b, c] = w.wizards;
    c.team = 0; a.nexus = { target: b.id, range: 7 }; b.nexus = { target: c.id, range: 7 };
    c.slow = 2; const duration = statusDuration(w, c, 4, 'slowUntil');
    expect(duration).toBe(2); expect(a.slow).toBe(2); expect(b.slow).toBe(2);
    expect(a.slowUntil - w.t).toBe(1); expect(b.slowUntil - w.t).toBe(1);
    a.slow = 0; a.slowUntil = 0; b.slow = 20; b.slowUntil = 5;
    statusDuration(w, c, 4, 'slowUntil');
    expect(a.slow).toBe(2); expect(b.slow).toBe(20);
  });
  it('shares continuous vortex displacement without adding a stun', () => {
    const w = setup(), [caster, ally] = w.wizards;
    w.zones.push({ kind: 'pull', pos: { x: 1, y: 0 }, r: 2, until: w.t + 5 });
    const start = caster.pos.x;
    stepWorld(w, [], () => .5);
    expect(caster.pos.x).toBeGreaterThan(start); expect(ally.pos.x).toBeGreaterThan(0);
    expect(caster.stunLeft ?? 0).toBe(0); expect(ally.stunLeft ?? 0).toBe(0);
  });
  it('resolves lethal environmental transfer this step without crediting the protected ally', () => {
    const w = setup(), [caster, ally] = w.wizards;
    caster.pos = { x: 0, y: 0 }; ally.pos = { x: 5, y: 0 }; w.arenaR = 3;
    caster.hp = 1; w.wizards[2].pos = { x: 0, y: 0 };
    ally.lastHitBy = 'p2'; ally.lastHitAt = -1000;
    stepWorld(w, [], () => .5);
    expect(caster.alive).toBe(false); expect(caster.hp).toBe(0);
    expect(w.events.find(e => e.k === 'death' && e.id === caster.id)).toMatchObject({ by: null });
    expect(ally.hp).toBe(1000);
  });
  it('uses the new slow rather than an expired stronger payload and cancels shared Grip dashes', () => {
    const w = setup(), [caster, ally] = w.wizards;
    caster.slow = 20; caster.slowUntil = 0; ally.slow = 2;
    statusDuration(w, ally, 4, 'slowUntil'); expect(caster.slow).toBe(2);
    caster.dashUntil = caster.thrustUntil = 10;
    statusDuration(w, ally, 4, 'gripUntil');
    expect(caster.dashUntil).toBe(0); expect(caster.thrustUntil).toBe(0);
  });
});
