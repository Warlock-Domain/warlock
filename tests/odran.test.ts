import { describe, expect, it } from 'vitest';
import { ODRAN, SWEEP } from '../src/shared/bosses.ts';
import { SERVOS } from '../src/shared/campaign.ts';
import { STAGE_ROOMS, fightOf, nightMap, parseRooms, type NightMap } from '../src/shared/levels.ts';
import { addPlayer, newMatch, startMatch, tickMatch, type Match } from '../src/shared/match.ts';
import { mulberry32 } from '../src/shared/rng.ts';
import type { SimEvent } from '../src/shared/sim.ts';
import { dist, v } from '../src/shared/vec.ts';
import { STEP_MS, toPlaying } from './helpers.ts';

// noite com os humanos dados, já jogando, com o primeiro dentro da arena do Sir Odran (a luta abre no passo)
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
// pilares da arena (as 4 Barricadas de pedra 2×2 do desenho)
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

describe('Sir Odran: investida', () => {
  it('stops and aims before charging, and the charge hits the Aceso in the way hard', () => {
    const { m, now: t0, events } = arena();
    let now = t0;
    const a = wiz(m, 'a');
    a.invulnUntil = 0;
    // o Odran no meio da arena, o Aceso a 6 m na frente, sem pilar no caminho
    const z = odran(m);
    z.pos = v(a.pos.x + 6, a.pos.y);
    for (let i = 0; i < 60 * 4 && !events.some((e) => e.k === 'boss' && e.what === 'aim'); i++) now = step(m, now, events);
    const aim = events.find((e) => e.k === 'boss' && e.what === 'aim')!;
    expect(aim).toBeDefined();
    // parado durante a mira
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
      // o Aceso atrás do pilar, o Odran do outro lado: a linha da investida passa pelo pilar
      Object.assign(a, { pos: v(q.pos.x, q.pos.y - 3.2), vel: v(0, 0), target: null });
      Object.assign(z, { pos: v(q.pos.x, q.pos.y + 3.2), vel: v(0, 0), target: null });
      m.night!.boss!.next = 0;
      const before = events.length;
      for (let i = 0; i < 60 * 3 && q.alive; i++) {
        now = step(m, now, events);
        a.pos = v(q.pos.x, q.pos.y - 3.2); // fica parado atrás do pilar
      }
      expect(q.alive, `pilar ${k}`).toBe(false);
      expect(events.slice(before).some((e) => e.k === 'boss' && e.what === 'stun')).toBe(true);
      // atordoado: não anda nem lança por 3 s
      const at = { ...z.pos }, cd = { ...z.cd };
      now = step(m, now, events, 60 * ODRAN.stun - 10);
      expect(dist(z.pos, at), `pilar ${k}`).toBeLessThan(0.3);
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
