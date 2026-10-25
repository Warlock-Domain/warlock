import { describe, expect, it } from 'vitest';
import { CAMPAIGN, NIGHT_XP, SERVOS, nightCount, nightLevel, roomWaves, xpShare } from '../src/shared/campaign.ts';
import { fightOf, nightMap, type NightMap } from '../src/shared/levels.ts';
import { WIZ_SPEED } from '../src/shared/constants.ts';
import { addPlayer, endIdle, setWatch, kick, newMatch, removePlayer, resume, startMatch, startVote, tickMatch, type Match } from '../src/shared/match.ts';
import { parseClientMessage, publicRoom } from '../src/shared/protocol.ts';
import { mulberry32 } from '../src/shared/rng.ts';
import { dist, v } from '../src/shared/vec.ts';
import { endResult, maxHp, nightLine, playerName } from '../src/client/screen-data.ts';
import { STEP_MS, toPlaying, until } from './helpers.ts';

// Campaign night with the given humans and a fixed seed
function night(humans = ['a'], seed = 1): Match {
  const m = newMatch();
  for (const id of humans) addPlayer(m, id, id);
  startMatch(m, 0, 0, 'campaign', true, mulberry32(seed));
  return m;
}

const mapOf = (m: Match): NightMap => nightMap(m.night!.seed, m.night!.stage);
const wiz = (m: Match, id: string) => m.world!.wizards.find((z) => z.id === id)!;
const foes = (m: Match) => m.world!.wizards.filter((z) => z.team === 1);
const step = (m: Match, now: number, n = 1) => {
  for (let i = 0; i < n; i++) tickMatch(m, (now += STEP_MS), [], () => 0.5);
  return now;
};
// center of the checkpoint of room i (between the "C" and the number)
const checkpoint = (n: NightMap, i: number) => {
  const c = n.marks.find((q) => q.room === i && q.kind === 'checkpoint')!;
  return v(c.x + 1, c.y + 0.5);
};
const inside = (n: NightMap, i: number, p: { x: number; y: number }) => {
  const r = n.rooms[i];
  return p.x > r.x && p.y > r.y && p.x < r.x + r.room.w && p.y < r.y + r.room.h;
};
const bossRoom = (n: NightMap) => n.rooms.findIndex((r) => r.room.pool === 'chefe');
// moves the human to the point and waits for the step where the encounter opens
function stepOn(m: Match, now: number, id: string, at: { x: number; y: number }): number {
  wiz(m, id).pos = v(at.x, at.y);
  return step(m, now);
}
// no lava on the map: knocks down directly, crediting `by` (dies on the next step)
const kill = (m: Match, id: string, by: string | null) => Object.assign(wiz(m, id), { hp: -1, lastHitBy: by, lastHitAt: m.world!.t });
// knocks down every living servant (credit to the first human; skips the 2 s invulnerability of whoever just entered)
function clearWave(m: Match, now: number): number {
  for (const z of foes(m)) if (z.alive) {
    z.invulnUntil = 0;
    kill(m, z.id, 'a');
  }
  return step(m, now);
}
function clearFight(m: Match, now: number): number {
  for (let i = 0; i < 10 && m.night!.fight !== null && m.phase === 'playing'; i++) now = clearWave(m, now);
  return now;
}
const fightIn = (m: Match, i: number) => fightOf(mapOf(m), i, m.night!.seed, 0);
// night (fixed seed) whose map has room `id`, and its index
function nightWith(id: string, humans = ['a']): { m: Match; i: number } {
  for (let seed = 1; ; seed++) {
    const m = night(humans, seed);
    const i = mapOf(m).rooms.findIndex((r) => r.room.id === id);
    if (i >= 0) return { m, i };
  }
}
// humans stay invulnerable while the test advances (the servants shoot)
const shelter = (m: Match) => {
  for (const z of m.world!.wizards) if (z.team === 0) z.invulnUntil = 1e9;
};

describe('Campaign: waves', () => {
  it('waves of a room come from the seed, fit the slots, and the boss arena has one more', () => {
    expect(roomWaves(42, 0, 2, 2, false)).toEqual(roomWaves(42, 0, 2, 2, false));
    for (let s = 0; s < 50; s++) {
      const w = roomWaves(s, 0, 1, 1, false), b = roomWaves(s, 0, 1, 1, true);
      expect(w.length, String(s)).toBeGreaterThanOrEqual(2);
      expect(b.length, String(s)).toBe(w.length + 1);
      for (const wave of b) expect(wave.length).toBeLessThanOrEqual(CAMPAIGN.slots);
    }
  });
});

describe('Campaign: match on the map', () => {
  it('starts with one human and the Smoke slots on team 1, without gold', () => {
    const m = night();
    expect(m.mode).toBe('campaign');
    expect(m.phase).toBe('shop');
    expect(m.night).toMatchObject({ stage: 0, fight: null, done: [], result: null });
    const slots = m.players.filter((p) => p.servo);
    expect(slots.length).toBe(CAMPAIGN.slots);
    expect(slots.every((p) => p.bot && p.team === 1)).toBe(true);
    expect(m.players.find((p) => p.id === 'a')).toMatchObject({ team: 0, gold: 0 });
  });

  it('ignores ordinary bots and refuses more than 4 humans', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'a');
    startMatch(m, 0, 3, 'campaign', true, mulberry32(1));
    expect(m.players.filter((p) => p.bot && !p.servo).length).toBe(0);
    const crowd = newMatch();
    for (const id of ['a', 'b', 'c', 'd', 'e']) addPlayer(crowd, id, id);
    expect(startMatch(crowd, 0, 0, 'campaign', true, mulberry32(1))).toBe(false);
  });

  it('the stage is the whole night map: the group at the start, the Smoke out, nothing shrinks', () => {
    const m = night(['a', 'b']);
    let now = toPlaying(m, 0);
    const n = mapOf(m), w = m.world!;
    expect([w.map!.w, w.map!.h]).toEqual([n.w, n.h]);
    const start = n.marks.find((q) => q.kind === 'start')!;
    for (const id of ['a', 'b']) expect(dist(wiz(m, id).pos, v(start.x + 0.5, start.y + 0.5))).toBeLessThan(1.5);
    expect(foes(m).some((z) => z.alive)).toBe(false);
    expect(w.pillars.length).toBeGreaterThan(0); // trees, statues and debris from the layout
    now = step(m, now, 60 * 20);
    expect(m.world!.arenaR).toBe(3);
    expect(m.phase).toBe('playing');
  });

  it('stepping on the checkpoint pulls every Aceso in, seals the room and the first wave enters at the E points', () => {
    const m = night(['a', 'b']);
    let now = toPlaying(m, 0);
    const n = mapOf(m);
    const room = n.rooms.findIndex((r) => r.room.pool === 'entrada');
    now = stepOn(m, now, 'a', checkpoint(n, room));
    expect(m.night!.fight).toBe(room);
    expect(m.world!.lock).toBeDefined();
    for (const id of ['a', 'b']) expect(inside(n, room, wiz(m, id).pos), id).toBe(true);
    const wave = fightIn(m, room).waves[0];
    const alive = foes(m).filter((z) => z.alive);
    // 2 Acesos bring half a wave more; whoever does not fit in the 4 slots waits in the queue
    const total = nightCount(wave.length, 2);
    expect(alive.length).toBe(Math.min(CAMPAIGN.slots, total));
    expect(m.night!.queue!.length).toBe(total - alive.length);
    const entries = n.marks.filter((q) => q.room === room && q.kind === 'entry').map((q) => v(q.x + 0.5, q.y + 0.5));
    for (const z of alive) {
      expect(z.hpMax).toBe(SERVOS[m.players.find((p) => p.id === z.id)!.servo!].hp);
      expect(z.regen).toBe(0); // servants do not regenerate
      expect(Math.min(...entries.map((e) => dist(e, z.pos)))).toBeLessThan(1.5);
    }
  });

  it('the mill sends 2 Cinzentos through each E, then a Soot Archer through each (the encounter Lucas wrote)', () => {
    const { m, i } = nightWith('moinho-caido-01');
    let now = toPlaying(m, 0);
    const n = mapOf(m);
    now = stepOn(m, now, 'a', checkpoint(n, i));
    shelter(m);
    const [e1, e2] = n.marks.filter((q) => q.room === i && q.kind === 'entry').map((q) => v(q.x + 0.5, q.y + 0.5));
    const kindOf = (id: string) => m.players.find((p) => p.id === id)!.servo;
    const alive = () => foes(m).filter((z) => z.alive);
    expect(alive().map((z) => kindOf(z.id))).toEqual(['ash', 'ash', 'ash', 'ash']);
    expect(alive().filter((z) => dist(z.pos, e1) < 1.5).length).toBe(2);
    expect(alive().filter((z) => dist(z.pos, e2) < 1.5).length).toBe(2);
    now = clearWave(m, now);
    expect(alive().map((z) => kindOf(z.id))).toEqual(['archer', 'archer']);
  });

  it('in the village the Ember Hound comes out of the house on the right, faster', () => {
    const { m, i } = nightWith('vilarejo-queimado-02');
    let now = toPlaying(m, 0);
    const n = mapOf(m);
    now = stepOn(m, now, 'a', checkpoint(n, i));
    const house = n.marks.filter((q) => q.room === i && q.kind === 'entry')[0];
    const hound = foes(m).find((z) => z.alive && m.players.find((p) => p.id === z.id)!.servo === 'hound')!;
    expect(dist(hound.pos, v(house.x + 0.5, house.y + 0.5))).toBeLessThan(0.01);
    expect(hound.baseSpeed).toBeCloseTo(WIZ_SPEED * SERVOS.hound.speed!, 5);
    expect(hound.hpMax).toBe(SERVOS.hound.hp);
  });

  it('in the cemetery a tombstone cracks every 10 s and lets out one more Hollow Watcher, up to 3', () => {
    const { m, i } = nightWith('cemiterio-dos-vigias-01');
    let now = toPlaying(m, 0);
    const n = mapOf(m);
    now = stepOn(m, now, 'a', checkpoint(n, i));
    shelter(m);
    const standing = () => m.world!.pillars.filter((q) => q.alive && inside(n, i, q.pos)).length;
    const before = standing();
    now = clearWave(m, now); // the first wave falls at once: the encounter goes on through the tombstones
    expect(m.night!.fight).toBe(i);
    expect(foes(m).some((z) => z.alive)).toBe(false);
    now = step(m, now, 60 * 10);
    expect(m.night!.cracked).toBe(1);
    expect(standing()).toBe(before - 1);
    const out = foes(m).find((z) => z.alive)!;
    expect(m.players.find((p) => p.id === out.id)!.servo).toBe('watcher');
    for (let k = 0; k < 4; k++) {
      now = clearWave(m, now);
      now = step(m, now, 60 * 10);
    }
    expect(m.night!.cracked).toBe(3);
    expect(standing()).toBe(before - 3);
    expect(m.night!.done).toContain(i); // the 3 tombstones cracked and the last watcher fell: room won
  });

  it('nobody leaves the sealed room', () => {
    const m = night();
    let now = toPlaying(m, 0);
    const n = mapOf(m);
    now = stepOn(m, now, 'a', checkpoint(n, 0));
    shelter(m);
    wiz(m, 'a').pos = v(n.rooms[0].x + n.rooms[0].room.w + 5, wiz(m, 'a').pos.y);
    step(m, now);
    expect(inside(n, 0, wiz(m, 'a').pos)).toBe(true);
  });

  it('next wave enters when the wave is cleared, and gives no gold', () => {
    const { m, i } = nightWith('moinho-caido-01');
    let now = toPlaying(m, 0);
    now = stepOn(m, now, 'a', checkpoint(mapOf(m), i));
    shelter(m);
    now = clearWave(m, now);
    expect(m.night!.wave).toBe(1);
    expect(foes(m).filter((z) => z.alive).length).toBe(fightIn(m, i).waves[1].length);
    expect(m.players.find((p) => p.id === 'a')!.gold).toBe(0);
    expect(m.players.find((p) => p.id === 'a')!.stats.round.kills).toBeGreaterThan(0);
  });

  it('the cleared room opens again and its checkpoint does not fire twice', () => {
    const m = night();
    let now = toPlaying(m, 0);
    const n = mapOf(m);
    now = stepOn(m, now, 'a', checkpoint(n, 0));
    shelter(m);
    now = clearFight(m, now);
    expect(m.night).toMatchObject({ fight: null, done: [0] });
    expect(m.world!.lock).toBeUndefined();
    now = stepOn(m, now, 'a', checkpoint(n, 0));
    expect(m.night!.fight).toBeNull();
  });

  it('entering the boss arena starts the last fight; winning it wins the night and drops the slots', () => {
    const m = night();
    let now = toPlaying(m, 0);
    const n = mapOf(m), b = bossRoom(n), r = n.rooms[b];
    now = stepOn(m, now, 'a', v(r.x + r.room.w / 2, r.y + r.room.h / 2));
    expect(m.night!.fight).toBe(b);
    shelter(m);
    now = clearFight(m, now);
    expect(m.phase).toBe('roundEnd');
    expect(m.night!.result).toBe('won');
    until(m, now, () => m.phase !== 'roundEnd');
    expect(m.phase).toBe('end');
    expect(m.players.some((p) => p.servo)).toBe(false);
  });

  it('nobody earns gold in the Campaign, not even the round gold paid on a fall', () => {
    const m = night(['a', 'b']);
    let now = toPlaying(m, 0);
    Object.assign(wiz(m, 'a'), { hp: -1, invulnUntil: 0 });
    now = step(m, now, 2);
    expect(m.players.filter((p) => !p.servo).map((p) => p.gold)).toEqual([0, 0]);
  });

  it('all humans down loses the night', () => {
    const m = night(['a', 'b']);
    let now = toPlaying(m, 0);
    for (const z of m.world!.wizards) z.invulnUntil = 0;
    kill(m, 'a', null);
    kill(m, 'b', null);
    now = step(m, now);
    expect(m.phase).toBe('roundEnd');
    expect(m.night!.result).toBe('lost');
    until(m, now, () => m.phase !== 'roundEnd');
    expect(m.phase).toBe('end');
  });

  it('ending the night by vote or idleness counts as lost and drops the slots', () => {
    const voted = night(['a']);
    startVote(voted, 'a', 'end', '', 0);
    expect(voted.phase).toBe('end');
    expect(voted.night!.result).toBe('lost');
    expect(voted.players.some((p) => p.servo)).toBe(false);
    const idle = night(['a']);
    endIdle(idle);
    expect(idle.night!.result).toBe('lost');
    expect(idle.players.some((p) => p.servo)).toBe(false);
  });

  it('a match after the night starts with the usual gold', () => {
    const m = night(['a', 'b']);
    endIdle(m);
    expect(m.phase).toBe('end');
    startMatch(m, 0, 1, 'rounds');
    expect(m.players.filter((p) => !p.bot).map((p) => p.gold)).toEqual([30, 30]);
  });

  it('spectators do not count for the 1 to 4 Acesos, and one who starts watching mid-night leaves the map', () => {
    const m = newMatch();
    for (const id of ['a', 'b', 'c', 'd', 'e']) addPlayer(m, id, id);
    for (const id of ['c', 'd', 'e']) setWatch(m, id, true);
    expect(startMatch(m, 0, 0, 'campaign', true, mulberry32(1))).toBe(true);
    let now = toPlaying(m, 0);
    expect(m.world!.wizards.some((z) => z.id === 'c')).toBe(false);
    // a starts watching and b falls: no Aceso is left, the night is lost
    setWatch(m, 'a', true);
    expect(m.world!.wizards.some((z) => z.id === 'a')).toBe(false);
    Object.assign(wiz(m, 'b'), { hp: -1, invulnUntil: 0 });
    now = step(m, now, 2);
    expect(m.night!.result).toBe('lost');
  });

  it('someone who joins mid-night enters the map on the Acesos side, without gold', () => {
    const m = night(['a']);
    toPlaying(m, 0);
    addPlayer(m, 'late', 'late');
    const late = m.players.find((p) => p.id === 'late')!;
    expect(late).toMatchObject({ gold: 0, team: 0 });
    const z = wiz(m, 'late');
    expect(z).toMatchObject({ alive: true, team: 0 });
    expect(dist(z.pos, m.world!.map!.home)).toBeLessThan(1.5);
  });

  it('resume mid-night goes back to the interval and keeps the rooms already won', () => {
    const m = night();
    let now = toPlaying(m, 0);
    now = stepOn(m, now, 'a', checkpoint(mapOf(m), 0));
    shelter(m);
    now = clearFight(m, now);
    const round = m.round;
    resume(m, now);
    expect(m.phase).toBe('shop');
    expect(m.round).toBe(round - 1);
    expect(m.night).toMatchObject({ done: [0], fight: null });
  });

  it('a night saved before the explorable map comes back without breaking', () => {
    const m = night();
    toPlaying(m, 0);
    const old = m.night as unknown as Record<string, unknown>;
    delete old.fight;
    delete old.done;
    resume(m, 1000);
    expect(m.night).toMatchObject({ fight: null, done: [] });
    expect(() => toPlaying(m, 1000)).not.toThrow();
  });

  it('a human who drops stays on the Acesos side', () => {
    const m = night(['a', 'b']);
    toPlaying(m, 0);
    removePlayer(m, 'b');
    const b = m.players.find((p) => p.id === 'b')!;
    expect(b.connected).toBe(false);
    expect(b.servo).toBeUndefined();
    expect(wiz(m, 'b').team).toBe(0);
  });

  it('when only dropped humans are standing, the night is lost after the grace period; reconnecting in time keeps it', () => {
    const m = night(['a', 'b']);
    let now = toPlaying(m, 0);
    wiz(m, 'a').invulnUntil = 0;
    kill(m, 'a', null);
    wiz(m, 'a').ember = { prog: 0, need: 99, since: 0 }; // nobody rekindles a
    removePlayer(m, 'b');
    now = step(m, now, 60 * (CAMPAIGN.orphan - 1));
    expect(m.night!.result).toBe(null);
    addPlayer(m, 'b', 'b'); // back in time: the countdown restarts
    now = step(m, now, 60 * 2);
    expect(m.night!.result).toBe(null);
    removePlayer(m, 'b');
    now = step(m, now, 60 * CAMPAIGN.orphan + 2);
    expect(m.phase).toBe('roundEnd');
    expect(m.night!.result).toBe('lost');
  });

  it('no mode, bot or kick votes against the Smoke; switching into the campaign is not voted', () => {
    const m = night(['a', 'b']);
    expect(startVote(m, 'a', 'mode', 'rounds', 0)).toBe(false);
    expect(startVote(m, 'a', 'addBot', '', 0)).toBe(false);
    expect(kick(m, 'fumo-1')).toBe(false);
    const r = newMatch();
    for (const id of ['a', 'b']) addPlayer(r, id, id);
    startMatch(r, 0, 0, 'rounds');
    expect(startVote(r, 'a', 'mode', 'campaign', 0)).toBe(false);
  });

  it('room shows the seed, the open fight and its waves, and the max health of the servants', () => {
    const m = night();
    let now = toPlaying(m, 0);
    expect(publicRoom('ABCD', m, 0).night).toEqual({ stage: 0, seed: m.night!.seed, fight: null, wave: 0, waves: 0, done: [], result: null, opened: [] });
    now = stepOn(m, now, 'a', checkpoint(mapOf(m), 0));
    const room = publicRoom('ABCD', m, 0);
    expect(room.night).toMatchObject({ fight: 0, wave: 0, waves: fightIn(m, 0).waves.length });
    expect(room.players.filter((p) => p.servo).every((p) => p.hpMax !== undefined)).toBe(true);
  });

  it('moving and casting anywhere on the night map passes the message check (bug: the door of the first room)', () => {
    for (let seed = 0; seed < 300; seed++) {
      const n = nightMap(seed * 7919 + 1, 0);
      for (const [x, y] of [[n.w - 0.5, n.h - 0.5], [0.5, 0.5], [n.w / 2, n.h - 0.5]]) {
        expect(parseClientMessage(JSON.stringify({ t: 'move', x, y, seq: 1 })), `${seed}: ${x},${y}`).not.toBeNull();
        expect(parseClientMessage(JSON.stringify({ t: 'cast', spell: 'fireball', x, y, seq: 1 })), `${seed}: ${x},${y}`).not.toBeNull();
      }
    }
  });

  it('start message accepts the campaign, not in the sandbox', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'start', bots: 0, mode: 'campaign' }))).toMatchObject({ mode: 'campaign' });
    const m = newMatch();
    addPlayer(m, 'a', 'a');
    expect(startMatch(m, 0, 0, 'campaign', true, Math.random, {}, [], true)).toBe(false);
  });
});

describe('Campaign: screen', () => {
  it('servants are named in the player language, people keep their nickname', () => {
    expect(playerName({ name: 'Cinzento', servo: 'ash', bot: true, connected: true })).toBe('Cinzento');
    expect(playerName({ name: 'Arqueiro de Fuligem', servo: 'archer', bot: true, connected: true })).toBe('Arqueiro de Fuligem');
    expect(playerName({ name: 'Lucas', bot: false, connected: true })).toBe('Lucas');
  });

  it('health bar uses the servant max health', () => {
    const m = night();
    let now = toPlaying(m, 0);
    now = stepOn(m, now, 'a', checkpoint(mapOf(m), 0));
    const room = publicRoom('ABCD', m, 0);
    const servo = room.players.find((p) => p.servo)!;
    expect(maxHp(servo)).toBe(SERVOS[servo.servo!].hp);
    expect(maxHp(room.players.find((p) => !p.servo))).toBe(1000);
  });

  it('night line says the stage and, during an encounter, the wave', () => {
    const n = { stage: 0, seed: 1, fight: null, wave: 0, waves: 0, done: [], result: null, opened: [] };
    expect(nightLine(n, true)).toBe('Campanha · Charneca Cinzenta');
    expect(nightLine({ ...n, fight: 2, waves: 3 }, true)).toBe('Campanha · Charneca Cinzenta · encontro · onda 1 de 3');
    expect(nightLine({ ...n, fight: 2, waves: 3 }, false)).toBe('Campanha · Charneca Cinzenta');
  });

  it('the Acesos win or lose together', () => {
    const m = night(['a', 'b']);
    m.night!.result = 'won';
    m.phase = 'end';
    const room = publicRoom('ABCD', m, 0);
    const a = room.players.find((p) => p.name === 'a')!.id;
    expect(endResult(room, a)).toBe('win');
    m.night!.result = 'lost';
    expect(endResult(publicRoom('ABCD', m, 0), a)).toBe('loss');
  });
});
