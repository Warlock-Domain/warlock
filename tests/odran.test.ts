import { describe, expect, it } from 'vitest';
import { ODRAN, SWEEP } from '../src/shared/bosses.ts';
import { SERVOS } from '../src/shared/campaign.ts';
import { LOOK_PARTS, decodeLook } from '../src/shared/characters.ts';
import { STAGE_ROOMS, fightOf, nightMap, parseRooms, type NightMap } from '../src/shared/levels.ts';
import { addPlayer, newMatch, startMatch, tickMatch, type Match } from '../src/shared/match.ts';
import { mulberry32 } from '../src/shared/rng.ts';
import type { SimEvent } from '../src/shared/sim.ts';
import { dist, v } from '../src/shared/vec.ts';
import { STEP_MS, run, toPlaying, world } from './helpers.ts';
import { WIZ_R } from '../src/shared/constants.ts';
import { noSpells } from '../src/shared/spells.ts';

// a night with the given humans, already playing, the first one inside Sir Odran's arena (the fight opens on the step)
function arena(humans = ['a']): { m: Match; now: number; n: NightMap; b: number; events: SimEvent[] } {
  const m = newMatch();
  for (const id of humans) addPlayer(m, id, id);
  startMatch(m, 0, 0, 'campaign', true, mulberry32(1));
  let now = toPlaying(m, 0);
  const n = nightMap(m.night!.seed, m.night!.stage), b = n.rooms.findIndex((r) => r.room.pool === 'chefe'), r = n.rooms[b];
  const events: SimEvent[] = [];
  for (const id of humans) Object.assign(wiz(m, id), { pos: v(r.x + 5, r.y + r.room.h / 2), invulnUntil: 1e9 });
  now = step(m, now, events);
  return { m, now, n, b, events };
}
const wiz = (m: Match, id: string) => m.world!.wizards.find((z) => z.id === id)!;
const odran = (m: Match) => wiz(m, m.players.find((p) => p.servo === 'odran')!.id);
function step(m: Match, now: number, events: SimEvent[], n = 1): number {
  for (let i = 0; i < n; i++) events.push(...tickMatch(m, (now += STEP_MS), [], () => 0.5));
  return now;
}
// the arena pillars (the four 2×2 stone Barricades of the layout)
const pillarsOf = (m: Match, n: NightMap, b: number) => {
  const r = n.rooms[b];
  return m.world!.pillars.filter((q) => q.kind === 'rock' && q.pos.x > r.x && q.pos.x < r.x + r.room.w && q.pos.y > r.y && q.pos.y < r.y + r.room.h);
};

describe('Sir Odran: arena', () => {
  it('the arena names its boss in the header and the fight is him, through the B', () => {
    const room = STAGE_ROOMS[0].find((r) => r.pool === 'chefe')!;
    expect(room.boss).toBe('odran');
    const { m, n, b } = arena();
    expect(fightOf(n, b, m.night!.seed, 0)).toEqual({ waves: [[{ kind: 'odran', e: 0 }]] });
    expect(() => parseRooms('sala: x   estágio: x   pool: chefe\nchefe: Ninguém   entrada: X\n\n####\nX.B#\n####\n')).toThrow(/chefe "Ninguém" desconhecido/);
  });

  it('he enters with 3000 health alone, +50% per extra Aceso, heavy and without regeneration', () => {
    for (const [humans, hp] of [[['a'], 3000], [['a', 'b'], 4500], [['a', 'b', 'c', 'd'], 7500]] as const) {
      const { m, events } = arena([...humans]);
      const z = odran(m);
      expect(z, String(humans.length)).toMatchObject({ alive: true, hp, hpMax: hp, kbResist: ODRAN.kbResist, regen: 0 });
      expect(m.players.find((p) => p.servo === 'odran')!.hpMax).toBe(hp); // a barra do navegador
      expect(events.some((e) => e.k === 'boss' && e.what === 'start')).toBe(true);
    }
    expect(SERVOS.odran.hp).toBe(3000);
  });

  it('counts only the Acesos standing when he comes in', () => {
    const m = newMatch();
    for (const id of ['a', 'b']) addPlayer(m, id, id);
    startMatch(m, 0, 0, 'campaign', true, mulberry32(1));
    let now = toPlaying(m, 0);
    const n = nightMap(m.night!.seed, m.night!.stage), r = n.rooms.find((q) => q.room.pool === 'chefe')!;
    Object.assign(wiz(m, 'a'), { pos: v(r.x + 5, r.y + r.room.h / 2), invulnUntil: 1e9 });
    Object.assign(wiz(m, 'b'), { alive: false, hp: 0 });
    now = step(m, now, []);
    expect(odran(m).hpMax).toBe(3000);
  });
});

describe('Sir Odran: charge', () => {
  it('stops and aims before charging, and the charge hits the Aceso in the way hard', () => {
    const { m, now: t0, events } = arena();
    let now = t0;
    const a = wiz(m, 'a');
    a.invulnUntil = 0;
    // Odran in the middle of the arena, the Aceso 6 m ahead, no pillar in between
    const z = odran(m);
    z.pos = v(a.pos.x + 6, a.pos.y);
    for (let i = 0; i < 60 * 4 && !events.some((e) => e.k === 'boss' && e.what === 'aim'); i++) now = step(m, now, events);
    const aim = events.find((e) => e.k === 'boss' && e.what === 'aim')!;
    expect(aim).toBeDefined();
    // still while aiming
    const at = { ...z.pos };
    now = step(m, now, events, Math.floor(ODRAN.charge.windup * 60) - 2);
    expect(dist(z.pos, at)).toBeLessThan(0.05);
    const hp = a.hp;
    now = step(m, now, events, 60);
    expect(hp - a.hp).toBeGreaterThanOrEqual(ODRAN.charge.dmg * 0.9);
  });

  it('his Sweep is his own fan with knockback and full reach: no Sand Blast cone, Blindness or Incapacitate', () => {
    const { m, now: t0, events } = arena();
    let now = t0;
    const a = wiz(m, 'a');
    a.invulnUntil = 0;
    // 5 m away: past the 3 m sand cone, inside his 7 m Sweep; the next charge pushed far away
    const z = odran(m);
    z.pos = v(a.pos.x + 5, a.pos.y);
    m.night!.boss!.next = 1e9;
    for (let i = 0; i < 60 * 4 && !events.some((e) => e.k === 'fire' && e.src === 'cluster'); i++) now = step(m, now, events);
    expect(events.filter((e) => e.k === 'fire' && e.src === 'cluster')).toHaveLength(4);
    expect(m.world!.projectiles.filter((p) => p.kind === 'cluster' && p.stats === SWEEP)).toHaveLength(4);
    const hp = a.hp;
    now = step(m, now, events, 60);
    expect(hp - a.hp).toBeGreaterThan(0);
    expect(events.some((e) => e.k === 'hit' && e.id === 'a' && e.by === z.id)).toBe(true);
    expect(events.some((e) => e.k === 'sand')).toBe(false);
    expect(a.blindUntil ?? 0).toBe(0);
    expect(a.incapacitateUntil ?? 0).toBe(0);
  });

  it('a charge into a pillar brings it down and stuns him for 3 s; the 4th pillar starts phase 2 with 2 Ashen', () => {
    const { m, n, b, now: t0, events } = arena();
    let now = t0;
    const a = wiz(m, 'a'), z = odran(m), pillars = pillarsOf(m, n, b);
    expect(pillars.length).toBe(4);
    for (const [k, q] of pillars.entries()) {
      // the Aceso behind a pillar, Odran on the other side: the charge line crosses the pillar
      Object.assign(a, { pos: v(q.pos.x, q.pos.y - 3.2), vel: v(0, 0), target: null });
      Object.assign(z, { pos: v(q.pos.x, q.pos.y + 3.2), vel: v(0, 0), target: null });
      m.night!.boss!.next = 0;
      const before = events.length;
      for (let i = 0; i < 60 * 3 && q.alive; i++) {
        now = step(m, now, events);
        a.pos = v(q.pos.x, q.pos.y - 3.2); // stays behind the pillar
      }
      expect(q.alive, `pillar ${k}`).toBe(false);
      expect(events.slice(before).some((e) => e.k === 'boss' && e.what === 'stun')).toBe(true);
      // stunned: no walking or casting for 3 s
      const at = { ...z.pos }, cd = { ...z.cd };
      now = step(m, now, events, 60 * ODRAN.stun - 10);
      // the 4th pillar brings the phase-2 Ashen, whose spells push him like any ally (Teams rule, 24/10): only check before that
      if (k < 3) expect(dist(z.pos, at), `pillar ${k}`).toBeLessThan(0.3);
      expect(z.cd).toEqual(cd);
      expect(m.night!.boss!.phase).toBe(k < 3 ? 1 : 2);
    }
    expect(events.some((e) => e.k === 'boss' && e.what === 'phase2')).toBe(true);
    const adds = m.world!.wizards.filter((q) => q.team === 1 && q.alive && q.id !== z.id);
    expect(adds.length).toBe(ODRAN.adds);
    expect(m.players.filter((p) => adds.some((q) => q.id === p.id)).every((p) => p.servo === 'ash')).toBe(true);
  });

  it('in phase 2 the charge leaves wax that slows the Acesos, not his own side', () => {
    const { m, n, b, now: t0, events } = arena();
    let now = t0;
    for (const q of pillarsOf(m, n, b)) q.alive = false;
    m.night!.boss!.phase = 2;
    const a = wiz(m, 'a'), z = odran(m);
    z.pos = v(a.pos.x + 10, a.pos.y);
    m.night!.boss!.next = 0;
    for (let i = 0; i < 60 * 3 && !m.world!.zones.length; i++) now = step(m, now, events);
    expect(m.world!.zones.length).toBeGreaterThan(0);
    expect(m.world!.zones.every((q) => q.kind === 'slow' && q.by === z.id)).toBe(true);
  });

  it('down with the adds wins the night', () => {
    const { m, now: t0, events } = arena();
    let now = t0;
    const z = odran(m);
    Object.assign(z, { hp: -1, invulnUntil: 0, lastHitBy: 'a', lastHitAt: m.world!.t });
    now = step(m, now, events, 2);
    expect(events.some((e) => e.k === 'boss' && e.what === 'down')).toBe(true);
    expect(m.night!.result).toBe('won');
  });

});

describe('Giant Sir Odran', () => {
  it('his outfit is a valid look: skeleton body with the Knight helmet, cape, sword and shield', () => {
    const look = decodeLook(SERVOS.odran.outfit);
    expect(look).not.toBe(null);
    const piece = (part: string) => LOOK_PARTS.find((p) => p.id === part)!.opts[look![LOOK_PARTS.findIndex((p) => p.id === part)]];
    expect(piece('body')?.from).toBe('skeleton_warrior');
    expect(piece('hat')?.nodes).toEqual(['Knight_Helmet']);
    expect(piece('cape')?.nodes).toEqual(['Knight_Cape']);
  });
});

describe('Sir Odran: 2.5× body', () => {
  it('he enters with the giant body; a Fireball passing 0,8 m from his centre hits him but misses a wizard', () => {
    const { m } = arena();
    expect(odran(m).r).toBeCloseTo(WIZ_R * ODRAN.size);
    for (const r of [undefined, WIZ_R * ODRAN.size]) {
      const w = world([[0, 0], [5, 0.8]], { ...noSpells(), fireball: 1 }, [], () => 0.5);
      w.wizards[1].r = r;
      const hp = w.wizards[1].hp;
      run(w, 1.5, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(10, 0) }]);
      expect(w.wizards[1].hp < hp, String(r)).toBe(r !== undefined);
    }
  });

  // bodies stay bodyR + bodyR apart (separate), so touch spells must reach the giant's edge, not a wizard's
  it.each(['windwalk', 'thrust'] as const)('%s walking into the giant body hits him', (spell) => {
    const w = world([[0, 0], [3, 0]], { ...noSpells(), [spell]: 1 }, [], () => 0.5);
    w.wizards[1].r = WIZ_R * ODRAN.size;
    const hp = w.wizards[1].hp;
    run(w, 1.5, [{ id: 'p0', kind: 'cast', spell, at: v(3, 0) }, { id: 'p0', kind: 'move', to: v(3, 0) }]);
    expect(w.wizards[1].hp).toBeLessThan(hp);
  });

  it('Link pulls the giant body to the caster and lets go on contact, not after its whole life', () => {
    const w = world([[0, 0], [5, 0]], { ...noSpells(), link: 1 }, [], () => 0.5);
    w.wizards[1].r = WIZ_R * ODRAN.size;
    run(w, 3, [{ id: 'p0', kind: 'cast', spell: 'link', at: v(5, 0) }]);
    expect(w.projectiles).toHaveLength(0);
  });

  it('a Boomerang bounces off the giant body once, taking what it takes from a wizard', () => {
    const lost = [undefined, WIZ_R * ODRAN.size].map((r) => {
      const w = world([[0, 0], [5, 0]], { ...noSpells(), boomerang: 1 }, [], () => 0.5);
      w.wizards[1].r = r;
      const hp = w.wizards[1].hp;
      run(w, 4, [{ id: 'p0', kind: 'cast', spell: 'boomerang', at: v(5, 0) }]);
      return hp - w.wizards[1].hp;
    });
    expect(lost[0]).toBeGreaterThan(0);
    expect(lost[1]).toBeLessThan(lost[0] * 1.5); // one hit each (regeneration shifts the hp by a little)
  });

  it('a Sand Blast reaches the giant body past the cone edge, where it misses a wizard', () => {
    for (const r of [undefined, WIZ_R * ODRAN.size]) {
      const w = world([[0, 0], [2, 2 / 3 + 0.6]], { ...noSpells(), cluster: 1 }, [], () => 0.5);
      w.wizards[1].r = r;
      const hp = w.wizards[1].hp;
      run(w, 1, [{ id: 'p0', kind: 'cast', spell: 'cluster', at: v(3, 0) }]);
      expect(w.wizards[1].hp < hp, String(r)).toBe(r !== undefined);
    }
  });

  it('two bodies keep the sum of their radii apart', () => {
    const w = world([[0, 0], [0.5, 0]], noSpells(), [], () => 0.5);
    w.wizards[0].r = WIZ_R * ODRAN.size;
    run(w, 0.2);
    expect(dist(w.wizards[0].pos, w.wizards[1].pos)).toBeGreaterThanOrEqual(WIZ_R * ODRAN.size + WIZ_R - 0.01);
  });
});
