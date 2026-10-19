import { describe, expect, it } from 'vitest';
import { botCmds } from '../src/shared/bots.ts';
import { HP_MAX, WIN_GOLD } from '../src/shared/constants.ts';
import { addPlayer, castBallot, newMatch, resume, startMatch, startVote, tickMatch, type Match } from '../src/shared/match.ts';
import { publicRoom } from '../src/shared/protocol.ts';
import { newWorld, stepWorld } from '../src/shared/sim.ts';
import { roundRecord } from '../src/shared/telemetry.ts';
import { noSpells, type SpellId } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { STEP_MS, run, toPlaying, until, world as spotsWorld } from './helpers.ts';

// sorteio previsível que muda a cada chamada
function seeded(seed = 1) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

function game(n: number, shuffle = true, rand = seeded()): Match {
  const m = newMatch();
  for (let i = 0; i < n; i++) addPlayer(m, 'h' + i, 'Gente ' + i);
  startMatch(m, 0, 0, 'teams', shuffle, rand);
  return m;
}

// derruba todo mundo de um time de uma vez (sem crédito) e espera o fim da rodada
function wipe(m: Match, now: number, team: number, rand?: () => number): number {
  for (const z of m.world!.wizards) if (m.players.find((p) => p.id === z.id)?.team === team) z.hp = 0.01, z.pos = v(50, 0);
  return until(m, now, () => m.phase === 'roundEnd', undefined, rand);
}

const teamsOf = (m: Match) => m.players.map((p) => p.team).join('');
const sizes = (m: Match) => [0, 1].map((t) => m.players.filter((p) => p.team === t).length).sort();

describe('modo Times: sorteio', () => {
  it('splits into 2 teams of equal size (odd: one has 1 more)', () => {
    expect(sizes(game(4))).toEqual([2, 2]);
    expect(sizes(game(5))).toEqual([2, 3]);
    expect(sizes(game(2))).toEqual([1, 1]);
    const m = game(3);
    expect(sizes(m)).toEqual([1, 2]);
    expect(m.world).toBeNull();
    toPlaying(m, 0);
    // o mundo recebe o time de cada mago
    expect(m.world!.wizards.map((z) => z.team)).toEqual(m.players.map((p) => p.team));
  });

  it('shuffled every round: teams change between rounds and stay balanced', () => {
    const rand = seeded(7);
    const m = game(6, true, rand);
    let now = 0;
    const seen = new Set<string>();
    for (let r = 0; r < 6; r++) {
      now = toPlaying(m, now, rand);
      expect(sizes(m)).toEqual([3, 3]);
      seen.add(teamsOf(m));
      now = wipe(m, now, 1, rand);
      now = until(m, now, () => m.phase === 'shop' || m.phase === 'end', undefined, rand);
      if (m.phase === 'end') break;
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('fixed for the match: teams never change; a late joiner goes to the smaller team', () => {
    const rand = seeded(3);
    const m = game(3, false, rand);
    const first = teamsOf(m);
    let now = toPlaying(m, 0, rand);
    expect(teamsOf(m)).toBe(first);
    now = wipe(m, now, m.players[0].team!, rand);
    now = until(m, now, () => m.phase === 'shop', undefined, rand);
    addPlayer(m, 'late', 'Atrasado');
    const small = sizes(m)[0] === 1 ? ([0, 1].find((t) => m.players.filter((p) => p.team === t).length === 1) as number) : -1;
    now = toPlaying(m, now, rand);
    expect(m.players.slice(0, 3).map((p) => p.team).join('')).toBe(first);
    expect(m.players.find((p) => p.id === 'late')!.team).toBe(small);
    expect(sizes(m)).toEqual([2, 2]);
  });
});

describe('modo Times: rodada e partida', () => {
  it('the round ends when only one team is alive, and everyone on it scores', () => {
    const m = game(4);
    let now = toPlaying(m, 0);
    const [blue, red] = [0, 1].map((t) => m.players.filter((p) => p.team === t));
    // um vermelho cai: a rodada continua
    const z = m.world!.wizards.find((q) => q.id === red[0].id)!;
    z.hp = 0.01;
    z.pos = v(50, 0);
    now = until(m, now, () => !z.alive);
    expect(m.phase).toBe('playing');
    // um azul também morre; mesmo assim o time azul vence quando o último vermelho cai
    const b = m.world!.wizards.find((q) => q.id === blue[0].id)!;
    b.hp = 0.01;
    b.pos = v(50, 0);
    now = until(m, now, () => !b.alive);
    const goldBefore = blue.map((p) => p.stats.round.gold);
    now = wipe(m, now, 1);
    expect(m.phase).toBe('roundEnd');
    expect(blue.map((p) => p.score)).toEqual([1, 1]);
    expect(red.map((p) => p.score)).toEqual([0, 0]);
    blue.forEach((p, i) => expect(p.stats.round.gold - goldBefore[i]).toBeGreaterThanOrEqual(WIN_GOLD));
    // telemetria: modo, time e vitória do time inteiro
    const rec = roundRecord(m, now);
    expect(rec.mode).toBe('teams');
    expect(rec.players.filter((p) => p.won).map((p) => p.team)).toEqual([0, 0]);
    expect(rec.players.every((p) => p.team === 0 || p.team === 1)).toBe(true);
  });

  it('with fixed teams the champion team wins the match and goes to PublicRoom', () => {
    const m = game(4, false);
    let now = 0;
    const team = m.players[0].team!;
    for (let r = 0; m.phase !== 'end' && r < 10; r++) {
      now = toPlaying(m, now);
      now = wipe(m, now, 1 - team);
      now = until(m, now, () => m.phase === 'shop' || m.phase === 'end');
    }
    expect(m.phase).toBe('end');
    expect(m.winnerTeam).toBe(team);
    expect(publicRoom('ABCD', m, now).winnerTeam).toBe(team);
    expect(publicRoom('ABCD', m, now).players.every((p) => p.team === 0 || p.team === 1)).toBe(true);
  });
});

describe('modo Times: fogo amigo', () => {
  const kit = (): Record<SpellId, number> => ({ ...noSpells(), homing: 1, grip: 1 });
  const world = (spots: [number, number][], teams: number[]) => spotsWorld(spots, kit(), [], Math.random, false, teams);

  it('an ally hit pushes without damage and without kill credit', () => {
    const w = world([[0, 0], [2, 0], [0, 3]], [0, 0, 1]);
    const ally = w.wizards[1];
    let hits = 0;
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(2, 0) }]);
    for (let i = 0; i < 60 && ally.pos.x < 2.3; i++) {
      stepWorld(w, []);
      hits += w.events.filter((e) => e.k === 'hit' && e.id === 'p1').length;
    }
    expect(hits).toBe(1);
    expect(ally.pos.x).toBeGreaterThan(2.3);
    expect(ally.hp).toBe(HP_MAX);
    expect(ally.dmgTaken).toBe(0);
    expect(ally.lastHitBy).toBeNull();
  });

  it('an enemy hit still does damage', () => {
    const w = world([[0, 0], [2, 0]], [0, 1]);
    run(w, 1, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(2, 0) }]);
    expect(w.wizards[1].hp).toBeLessThan(HP_MAX);
    expect(w.wizards[1].lastHitBy).toBe('p0');
  });

  it('in the match: ally damage does not count and an ally push does not take the kill from the enemy', () => {
    const m = game(4);
    let now = toPlaying(m, 0);
    const blue = m.players.filter((p) => p.team === 0);
    const red = m.players.find((p) => p.team === 1)!;
    const w = m.world!;
    for (const z of w.wizards) z.invulnUntil = 0;
    const victim = w.wizards.find((z) => z.id === blue[0].id)!;
    victim.lastHitBy = red.id;
    victim.lastHitAt = w.t;
    victim.hp = 10;
    const shooter = w.wizards.find((z) => z.id === blue[1].id)!;
    shooter.pos = v(victim.pos.x - 1.5 * Math.sign(victim.pos.x || 1), victim.pos.y);
    const goldBlue = blue[1].gold;
    let hit = false;
    for (let i = 0; i < 120 && !hit; i++) {
      now += STEP_MS;
      const events = tickMatch(m, now, i === 0 ? [{ id: blue[1].id, kind: 'cast', spell: 'fireball', at: victim.pos }] : [], () => 0.5);
      hit = events.some((e) => e.k === 'hit' && e.id === victim.id && e.by === blue[1].id);
    }
    expect(hit).toBe(true);
    expect(victim.hp).toBeGreaterThan(0);
    expect(blue[1].stats.round.dmg).toBe(0);
    expect(victim.lastHitBy).toBe(red.id);
    // cai na lava logo depois: o abate (e o ouro) vão para o inimigo, não para o aliado
    victim.hp = 0.01;
    victim.pos = v(50, 0);
    until(m, now, () => !victim.alive, 10);
    expect(red.stats.round.kills).toBe(1);
    expect(blue[1].stats.round.kills).toBe(0);
    expect(blue[1].gold).toBe(goldBlue);
  });

  it('homing missile locks only on enemies', () => {
    const w = world([[0, 0], [4, 0], [-6, 0]], [0, 0, 1]);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'homing', at: v(4, 0) }]);
    for (let i = 0; i < 10 && !w.projectiles.length; i++) stepWorld(w, []);
    expect(w.projectiles[0].target).toBe('p2');
  });

  it('grip does not root an ally', () => {
    const w = world([[0, 0], [2, 0], [0, 5]], [0, 0, 1]);
    run(w, 1, [{ id: 'p0', kind: 'cast', spell: 'grip', at: v(2, 0) }]);
    expect(w.wizards[1].gripUntil).toBe(0);
  });

  it('bots aim only at enemies', () => {
    const w = newWorld(['bot', 'ally', 'enemy'], { bot: noSpells(), ally: noSpells(), enemy: noSpells() }, {}, 0, Math.random, false, { bot: 0, ally: 0, enemy: 1 });
    w.wizards[0].pos = v(0, 0);
    w.wizards[1].pos = v(3, 0);
    w.wizards[2].pos = v(-5, 0);
    const cast = botCmds(w, 'bot', () => 0.3).find((c) => c.kind === 'cast');
    expect(cast && cast.kind === 'cast' && cast.spell === 'fireball' && cast.at.x < -2).toBe(true);
  });

  it('outside Times nobody is an ally (team null)', () => {
    const w = newWorld(['a', 'b'], { a: noSpells(), b: noSpells() });
    expect(w.wizards.map((z) => z.team)).toEqual([null, null]);
    w.wizards[0].pos = v(0, 0);
    w.wizards[1].pos = v(2, 0);
    for (const z of w.wizards) z.invulnUntil = 0;
    run(w, 1, [{ id: 'a', kind: 'cast', spell: 'fireball', at: v(2, 0) }]);
    expect(w.wizards[1].hp).toBeLessThan(HP_MAX);
  });
});

describe('modo Times: votação e salas antigas', () => {
  it('a vote switches to Times on the next round and another flips the shuffle', () => {
    const m = newMatch();
    for (const id of ['a', 'b', 'c']) addPlayer(m, id, id);
    startMatch(m, 0, 0);
    expect(startVote(m, 'a', 'mode', 'rounds', 0)).toBe(false); // já é o modo atual
    expect(startVote(m, 'a', 'mode', 'teams', 0)).toBe(true);
    expect(m.vote).toMatchObject({ kind: 'mode', target: 'teams' });
    castBallot(m, 'b', true, 1);
    expect(m.pendingMode).toBe('teams');
    expect(m.players.every((p) => p.team === null)).toBe(true);
    // sorteio: alterna o que vale na próxima rodada
    expect(startVote(m, 'a', 'shuffle', '', 2)).toBe(true);
    expect(m.vote).toMatchObject({ kind: 'shuffle', target: 'match' });
    castBallot(m, 'c', true, 3);
    expect(m.pendingShuffle).toBe(false);
    expect(m.teamShuffle).toBe(true);
    toPlaying(m, 3);
    expect(m.mode).toBe('teams');
    expect(m.teamShuffle).toBe(false);
    expect(m.pendingShuffle).toBeNull();
    expect(sizes(m)).toEqual([1, 2]);
    expect(m.world!.wizards.every((z) => z.team === 0 || z.team === 1)).toBe(true);
  });

  it('voting back to the current mode only cancels the pending one', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    startMatch(m, 0, 1);
    startVote(m, 'a', 'mode', 'teams', 0);
    expect(m.pendingMode).toBe('teams');
    expect(startVote(m, 'a', 'mode', 'teams', 0)).toBe(false);
    expect(startVote(m, 'a', 'mode', 'rounds', 0)).toBe(true);
    expect(m.pendingMode).toBeNull();
  });

  it('a room saved before Times loads with the new fields', () => {
    const m = game(2) as Partial<Match> as Match;
    for (const k of ['teamShuffle', 'pendingShuffle', 'winnerTeam'] as const) delete (m as Partial<Match>)[k];
    for (const p of m.players) delete (p as { team?: number | null }).team;
    m.mode = 'rounds';
    resume(m, 0);
    expect(m.teamShuffle).toBe(true);
    expect(m.pendingShuffle).toBeNull();
    expect(m.winnerTeam).toBeNull();
    expect(m.players.every((p) => p.team === null)).toBe(true);
    expect(publicRoom('ABCD', m, 0).teamShuffle).toBe(true);
  });
});
