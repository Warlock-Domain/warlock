import { describe, expect, it } from 'vitest';
import { ARENA_MIN, ARENA_STEP, DT, LAVA_DPS, OBSTACLES, RUNE, SUDDEN } from '../src/shared/constants.ts';
import { addPlayer, newMatch, sandboxCmd, startMatch } from '../src/shared/match.ts';
import { parseClientMessage } from '../src/shared/protocol.ts';
import { inBlizzard, inLava, placeRune, stepWorld } from '../src/shared/sim.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { noSpells } from '../src/shared/spells.ts';
import { ABYSS, DARKNESS, HEARTH_CLEAR_RADIUS, ICE, WORLD_ENDS, type WorldEnd } from '../src/shared/world-end.ts';
import { run, toPlaying, world } from './helpers.ts';

function arena(ending: WorldEnd, teams: number[] = []) {
  const w = world([[0, 0], [0, 3], [0, -3]], noSpells(), [], () => .5, false, teams);
  w.worldEnd = ending;
  w.isles = [];
  w.shrinkAt = Infinity;
  w.rules = { runes: false, chests: false, sudden: false };
  return w;
}

describe('world endings', () => {
  it('keeps generated obstacles, chests and runes away from both hearths', () => {
    for (const ending of ['ice', 'darkness', 'lava'] as const) {
      const m = newMatch();
      addPlayer(m, 'p0', 'P0');
      expect(startMatch(m, 0, 0, 'rounds', false, () => .5, { worldEnd: ending }, [], true)).toBe(true);
      toPlaying(m, 0, () => .5);
      const blockers = m.world!.pillars.filter(p => Math.hypot(p.pos.x, p.pos.y) < HEARTH_CLEAR_RADIUS + OBSTACLES[p.kind].r);
      expect(blockers).toHaveLength(ending === 'lava' ? 1 : 0);

      const w = arena(ending);
      w.wizards.forEach((z, i) => { z.pos = { x: 2, y: i * 3 - 3 }; });
      w.rules.chests = true;
      w.chestAt = 0;
      const rolls = [.25, 0, .25, .5];
      stepWorld(w, [], () => rolls.shift() ?? .5);
      const chest = w.pillars.find(p => p.kind === 'chest')!;
      expect(Math.hypot(chest.pos.x, chest.pos.y) >= HEARTH_CLEAR_RADIUS + OBSTACLES.chest.r).toBe(ending !== 'lava');

      expect(placeRune(w, 'haste', { x: 1.6, y: 0 }, () => .5)).toBe(true);
      const rune = w.runes[0];
      expect(Math.hypot(rune.pos.x, rune.pos.y) >= HEARTH_CLEAR_RADIUS + RUNE.reach).toBe(ending !== 'lava');
    }
  });

  it('slows and damages outside the Ice arena, and stops both inside', () => {
    const w = arena('ice');
    const [z] = w.wizards;
    z.pos = { x: w.arenaR + 1, y: 0 };
    expect(inLava(w, z.pos)).toBe(false);
    expect(inBlizzard(w, z.pos)).toBe(true);
    const hp = z.hp;
    run(w, 1);
    expect(z.hp).toBeCloseTo(hp - LAVA_DPS * ICE.damageRatio);
    expect(z.speed).toBeCloseTo(z.baseSpeed * (1 - ICE.slow));
    const snap = decodeSnap(encodeSnap(w, z.id, 0, []), w.wizards.map(p => p.id));
    expect(snap.worldEnd).toBe('ice');
    expect(snap.wizards[0].status & 4).toBe(4);
    z.pos = { x: w.arenaR - .5, y: 0 };
    stepWorld(w, []);
    expect(z.speed).toBeCloseTo(z.baseSpeed);
    expect(z.hp).toBeGreaterThan(hp - LAVA_DPS * ICE.damageRatio);
  });

  it('pauses torch fuel at the light, gives two seconds to return, and never refills it', () => {
    const w = arena('darkness');
    const [z] = w.wizards;
    const outside = { x: w.arenaR + 1, y: 0 };
    z.pos = outside;
    run(w, 5);
    expect(z.torchLeft).toBeCloseTo(DARKNESS.fuel - 5);
    z.pos = { x: 0, y: 0 };
    run(w, 2);
    expect(z.torchLeft).toBeCloseTo(10);
    z.pos = outside;
    run(w, 11);
    expect(z.darkLeft).toBeCloseTo(1);
    z.pos = { x: 0, y: 0 };
    stepWorld(w, []);
    expect(z.darkLeft).toBeUndefined();
    expect(z.torchLeft).toBe(0);
    z.pos = outside;
    run(w, DARKNESS.grace - DT);
    expect(z.alive).toBe(true);
    stepWorld(w, []);
    expect(z.alive).toBe(false);
    expect(w.events).toContainEqual({ k: 'death', id: z.id, by: null, src: 'darkness' });
  });

  it('falls immediately alone, or catches the ledge and needs a continuous allied rescue', () => {
    const solo = arena('abyss');
    solo.wizards[0].pos = { x: solo.arenaR + 1, y: 0 };
    stepWorld(solo, []);
    expect(solo.wizards[0].alive).toBe(false);
    expect(solo.events).toContainEqual({ k: 'death', id: 'p0', by: null, src: 'abyss' });

    const w = arena('abyss', [0, 0, 1]);
    const [z, ally, foe] = w.wizards;
    z.pos = { x: w.arenaR + 1, y: 0 };
    stepWorld(w, []);
    expect(z.ledge?.left).toBeCloseTo(ABYSS.hang - DT);
    expect(decodeSnap(encodeSnap(w, z.id, 0, []), ['p0', 'p1', 'p2']).wizards[0].ledge?.spot.x).toBeCloseTo(z.ledge!.spot.x, 2);
    foe.pos = z.ledge!.spot;
    run(w, .5);
    expect(z.ledge?.progress).toBe(0);
    foe.pos = { x: 0, y: -3 };
    ally.pos = z.ledge!.spot;
    run(w, .7);
    expect(z.ledge?.progress).toBeCloseTo(.7);
    ally.pos = { x: 0, y: 3 };
    stepWorld(w, []);
    expect(z.ledge?.progress).toBe(0);
    ally.pos = z.ledge!.spot;
    run(w, ABYSS.rescue + DT);
    expect(z.alive).toBe(true);
    expect(z.ledge).toBeUndefined();
  });

  it('drops an unrescued wizard after 15 seconds', () => {
    const w = arena('abyss', [0, 0, 1]);
    const [z] = w.wizards;
    z.pos = { x: w.arenaR + 1, y: 0 };
    run(w, ABYSS.hang - DT);
    expect(z.alive).toBe(true);
    stepWorld(w, []);
    expect(z.alive).toBe(false);
  });

  it.each(['abyss', 'ice'] as const)('announces only the next radius %s will actually shrink to', ending => {
    const w = arena(ending);
    const snapshot = () => decodeSnap(encodeSnap(w, 'p0', 0, []), ['p0', 'p1', 'p2']);
    w.arenaR = ARENA_MIN + ARENA_STEP * .3;
    w.shrinkAt = w.t + DT;
    const next = snapshot().shrinkTo;
    expect(next).toBeCloseTo(ARENA_MIN, 2);
    w.shrinkAt = w.t;
    stepWorld(w, [], () => .5);
    expect(w.arenaR).toBe(ARENA_MIN);
    expect(snapshot().shrinkTo).toBeUndefined();

    w.dm = true;
    w.arenaR += ARENA_STEP;
    expect(snapshot().shrinkTo).toBeUndefined();
    w.shrink = true;
    expect(snapshot().shrinkTo).toBe(next);

    w.dm = false;
    w.t = SUDDEN.collapse;
    w.arenaR = ARENA_STEP / 2;
    expect(snapshot().shrinkTo).toBe(0);
    w.worldEnd = 'lava';
    expect(snapshot().shrinkTo).toBeUndefined();
  });

  it('accepts all creation choices, draws the round on the server, and changes the Sandbox theme independently', () => {
    for (const worldEnd of [...WORLD_ENDS, 'random']) {
      expect(parseClientMessage(JSON.stringify({ t: 'start', bots: 1, opts: { worldEnd } }))).not.toBeNull();
    }
    for (const [roll, ending, shape] of [[.3, 'ice', 'circle'], [.6, 'darkness', 'circle'], [.99, 'abyss', 'bridge']] as const) {
      const m = newMatch();
      addPlayer(m, 'p0', 'P0');
      addPlayer(m, 'p1', 'P1');
      expect(startMatch(m, 0, 0, 'rounds', false, () => roll, { worldEnd: 'random' })).toBe(true);
      toPlaying(m, 0, () => roll);
      expect(m.world?.worldEnd).toBe(ending);
      expect(m.world?.arena).toBe(shape);
      expect(m.world?.isles).toHaveLength(0);
    }

    const sb = newMatch();
    addPlayer(sb, 'p0', 'P0');
    expect(startMatch(sb, 0, 0, 'rounds', false, () => .5, {}, [], true)).toBe(true);
    const now = toPlaying(sb, 0, () => .5);
    const refuge = sb.world!.isles[0].pos;
    expect(sandboxCmd(sb, { op: 'arena', arena: 'ring' }, now, 'p0', () => .5)).toBe(true);
    expect(sb.world?.arena).toBe('ring');
    expect(sandboxCmd(sb, { op: 'worldEnd', worldEnd: 'ice' }, now, 'p0', () => .5)).toBe(true);
    expect(sb.world?.worldEnd).toBe('ice');
    expect(sb.world?.arena).toBe('circle');
    const previous = sb.world;
    const ice = previous!;
    expect(ice.isles).toHaveLength(0);
    expect(encodeSnap(ice, 'p0', 0, []).il).toBeUndefined();
    const wizard = ice.wizards[0];
    Object.assign(wizard, { pos: refuge, god: false, invulnUntil: 0 });
    const hp = wizard.hp;
    stepWorld(ice, [], () => .5);
    expect(inBlizzard(ice, refuge)).toBe(true);
    expect(wizard.hp).toBeCloseTo(hp - LAVA_DPS * ICE.damageRatio * DT);
    expect(sandboxCmd(sb, { op: 'scenery', scenery: 'dungeon' }, now, 'p0')).toBe(true);
    expect(sb.world).toBe(previous);
    expect(sb.sandbox?.scenery).toBe('dungeon');
    expect(parseClientMessage(JSON.stringify({ t: 'sandbox', cmd: { op: 'scenery', scenery: 'ice' } }))).toBeNull();

    expect(sandboxCmd(sb, { op: 'worldEnd', worldEnd: 'darkness' }, now, 'p0', () => .5)).toBe(true);
    const dark = sb.world!;
    expect(dark.arena).toBe('circle');
    expect(dark.isles).toHaveLength(0);
    expect(encodeSnap(dark, 'p0', 0, []).il).toBeUndefined();
    dark.wizards[0].pos = refuge;
    dark.wizards[0].god = false;
    stepWorld(dark, [], () => .5);
    expect(dark.wizards[0].torchLeft).toBeCloseTo(DARKNESS.fuel - DT);
    expect(sandboxCmd(sb, { op: 'worldEnd', worldEnd: 'abyss' }, now, 'p0', () => .5)).toBe(true);
    const abyss = sb.world!;
    expect(abyss.arena).toBe('ring');
    expect(abyss.isles).toHaveLength(0);
    expect(encodeSnap(abyss, 'p0', 0, []).il).toBeUndefined();
    const falling = abyss.wizards[0];
    Object.assign(falling, { pos: refuge, god: false, invulnUntil: 0 });
    stepWorld(abyss, [], () => .5);
    expect(abyss.events).toContainEqual({ k: 'death', id: falling.id, by: null, src: 'abyss' });

    expect(sandboxCmd(sb, { op: 'worldEnd', worldEnd: 'lava' }, now, 'p0', () => .5)).toBe(true);
    expect(sb.world?.arena).toBe('ring');
    expect(sb.world?.isles.length).toBeGreaterThan(0);
  });
});
