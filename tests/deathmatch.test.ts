import { describe, expect, it } from 'vitest';
import { ARENA_R0, DM_KILLS_TO_WIN, DM_RESPAWN, DM_ROUND_MS, DT, INVULN_TIME, SHRINK_EVERY } from '../src/shared/constants.ts';
import { addPlayer, kick, newMatch, setReady, startMatch, tickMatch, type Match, type Mode } from '../src/shared/match.ts';
import { parseClientMessage } from '../src/shared/protocol.ts';
import { encodeSnap } from '../src/shared/snapshot.ts';
import { dist, v } from '../src/shared/vec.ts';

const STEP_MS = DT * 1000;
// sorteio repetível, mas variado (com 0.5 fixo todo sorteio cairia no mesmo ponto)
const cycle = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

function game(mode: Mode, players = ['a', 'b']): Match {
  const m = newMatch();
  for (const id of players) addPlayer(m, id, id);
  startMatch(m, 0, 0, mode);
  return m;
}

function until(m: Match, now: number, cond: () => boolean, limit = 60 * 600, rand: () => number = () => 0.5): number {
  for (let i = 0; i < limit && !cond(); i++) {
    now += STEP_MS;
    tickMatch(m, now, [], rand);
  }
  return now;
}

function toPlaying(m: Match, now: number): number {
  for (const p of m.players) setReady(m, p.id);
  now = until(m, now, () => m.phase === 'countdown');
  return until(m, now, () => m.phase === 'playing');
}

const wiz = (m: Match, id: string) => m.world!.wizards.find((z) => z.id === id)!;
const kill = (m: Match, id: string, by: string | null) => {
  const wz = wiz(m, id);
  wz.hp = 0.01;
  wz.lastHitBy = by;
  wz.lastHitAt = m.world!.t;
  wz.pos = v(ARENA_R0 + 3, 0); // na lava: morre no passo seguinte
};

describe('deathmatch', () => {
  it('rounds is the default mode', () => {
    const m = newMatch();
    expect(m.mode).toBe('rounds');
    addPlayer(m, 'a', 'a');
    startMatch(m, 0, 1);
    expect(m.mode).toBe('rounds');
  });

  it('round lasts 60 s even with several alive', () => {
    const m = game('deathmatch', ['a', 'b', 'c']);
    const start = toPlaying(m, 0);
    expect(m.phaseEnds).toBeCloseTo(start + DM_ROUND_MS, 0);
    const end = until(m, start, () => m.phase !== 'playing');
    expect(m.phase).toBe('roundEnd');
    expect(end - start).toBeGreaterThanOrEqual(DM_ROUND_MS);
    expect(end - start).toBeLessThan(DM_ROUND_MS + 100);
    expect(m.world!.wizards.every((z) => z.alive)).toBe(true);
    expect(m.lastRoundWinner).toBeNull();
    expect(m.players.every((p) => p.score === 0)).toBe(true);
  });

  it('does not end when only one is left, nor shrink the arena', () => {
    const m = game('deathmatch');
    const now = toPlaying(m, 0);
    const r0 = m.world!.arenaR;
    kill(m, 'b', 'a');
    until(m, now, () => m.world!.t > SHRINK_EVERY * 3, 60 * 40);
    expect(m.phase).toBe('playing');
    expect(m.world!.arenaR).toBe(r0);
  });

  it('rounds mode still shrinks', () => {
    const m = game('rounds');
    const now = toPlaying(m, 0);
    const r0 = m.world!.arenaR;
    until(m, now, () => m.world!.t > SHRINK_EVERY + 1, 60 * 40);
    expect(m.world!.arenaR).toBeLessThan(r0);
  });

  it('dead wizard respawns after 10 s: full hp, invulnerable, away from enemies', () => {
    const m = game('deathmatch');
    const rand = cycle(0.1, 0.25, 0.9, 0.3, 0.8, 0.6);
    let now = toPlaying(m, 0);
    wiz(m, 'a').pos = v(0, 0);
    kill(m, 'b', 'a');
    now = until(m, now, () => !wiz(m, 'b').alive, 60 * 5, rand);
    const diedAt = m.world!.t;
    wiz(m, 'b').spells.fireball = 3;
    now = until(m, now, () => m.world!.t >= diedAt + DM_RESPAWN - 0.5, 60 * 11, rand);
    expect(wiz(m, 'b').alive).toBe(false);
    until(m, now, () => wiz(m, 'b').alive, 60 * 2, rand);
    const b = wiz(m, 'b');
    expect(b.alive).toBe(true);
    expect(m.world!.t - diedAt).toBeGreaterThanOrEqual(DM_RESPAWN);
    expect(m.world!.t - diedAt).toBeLessThan(DM_RESPAWN + 0.1);
    expect(b.hp).toBe(b.hpMax);
    expect(b.invulnUntil).toBeGreaterThan(m.world!.t + INVULN_TIME - 0.1);
    expect(b.vel).toEqual(v(0, 0));
    expect(b.casting).toBeNull();
    expect(b.spells.fireball).toBe(3);
    expect(Math.hypot(b.pos.x, b.pos.y)).toBeLessThan(m.world!.arenaR);
    expect(dist(b.pos, wiz(m, 'a').pos)).toBeGreaterThanOrEqual(2);
    for (const q of m.world!.pillars) expect(dist(b.pos, q.pos)).toBeGreaterThanOrEqual(2);
  });

  it('kicked wizard never comes back', () => {
    const m = game('deathmatch');
    const now = toPlaying(m, 0);
    m.players[1].connected = false;
    expect(kick(m, 'b')).toBe(true);
    until(m, now, () => m.world!.t > DM_RESPAWN + 1, 60 * 12);
    expect(wiz(m, 'b').alive).toBe(false);
  });

  it('a kill is 1 point in deathmatch, 0 in rounds; lava is no point', () => {
    const dm = game('deathmatch', ['a', 'b', 'c']);
    const now = toPlaying(dm, 0);
    kill(dm, 'b', 'a');
    kill(dm, 'c', null);
    until(dm, now, () => !wiz(dm, 'b').alive && !wiz(dm, 'c').alive);
    expect(dm.players.map((p) => p.score)).toEqual([1, 0, 0]);
    expect(dm.players[0].stats.round.kills).toBe(1);

    const rounds = game('rounds', ['a', 'b', 'c']);
    const t = toPlaying(rounds, 0);
    kill(rounds, 'b', 'a');
    until(rounds, t, () => !wiz(rounds, 'b').alive);
    expect(rounds.players.map((p) => p.score)).toEqual([0, 0, 0]);
  });

  it('round end names who has most kills', () => {
    const m = game('deathmatch');
    const now = toPlaying(m, 0);
    kill(m, 'b', 'a');
    until(m, now, () => m.phase === 'roundEnd');
    expect(m.lastRoundWinner).toBe('a');
  });

  it('match ends at DM_KILLS_TO_WIN at the end of the round; a tie plays another round', () => {
    const m = game('deathmatch');
    let now = toPlaying(m, 0);
    m.players[0].score = DM_KILLS_TO_WIN - 1;
    m.players[1].score = DM_KILLS_TO_WIN - 1;
    kill(m, 'b', 'a');
    kill(m, 'a', 'b');
    now = until(m, now, () => !wiz(m, 'a').alive && !wiz(m, 'b').alive);
    expect(m.players.map((p) => p.score)).toEqual([DM_KILLS_TO_WIN, DM_KILLS_TO_WIN]);
    expect(m.phase).toBe('playing'); // a meta só vale no fim da rodada
    now = until(m, now, () => m.phase === 'shop');
    expect(m.phase).toBe('shop'); // empatados em 15: mais uma rodada

    now = toPlaying(m, now);
    kill(m, 'b', 'a');
    until(m, now, () => m.phase === 'end');
    expect(m.phase).toBe('end');
    expect(m.winner).toBe('a');
    expect(m.players[0].score).toBe(DM_KILLS_TO_WIN + 1);
  });

  it('below the goal the next round goes through the shop', () => {
    const m = game('deathmatch');
    const now = toPlaying(m, 0);
    until(m, now, () => m.phase === 'shop');
    expect(m.round).toBe(1);
    expect(m.mode).toBe('deathmatch');
  });

  it('snapshot carries the respawn countdown only in deathmatch', () => {
    const m = game('deathmatch');
    const now = toPlaying(m, 0);
    kill(m, 'b', 'a');
    until(m, now, () => !wiz(m, 'b').alive);
    const snap = encodeSnap(m.world!, 'a', 0, []);
    expect(snap.rs![0]).toBe(0);
    expect(snap.rs![1]).toBeGreaterThan(9.9);
    const r = game('rounds');
    toPlaying(r, 0);
    expect(encodeSnap(r.world!, 'a', 0, []).rs).toBeUndefined();
  });
});

describe('protocolo do modo', () => {
  const p = (m: unknown) => parseClientMessage(JSON.stringify(m));
  it('accepts start with a mode, or without one', () => {
    expect(p({ t: 'start', bots: 3, mode: 'deathmatch' })).toEqual({ t: 'start', bots: 3, mode: 'deathmatch' });
    expect(p({ t: 'start', bots: 3, mode: 'rounds' })).toEqual({ t: 'start', bots: 3, mode: 'rounds' });
    expect(p({ t: 'start', bots: 3 })).toEqual({ t: 'start', bots: 3 });
  });
  it('rejects a bad mode', () => {
    expect(p({ t: 'start', bots: 3, mode: 'ffa' })).toBeNull();
    expect(p({ t: 'start', bots: 3, mode: 1 })).toBeNull();
    expect(p({ t: 'start', bots: 3, mode: null })).toBeNull();
  });
});
