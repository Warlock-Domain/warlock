import { describe, expect, it } from 'vitest';
import { ARENA_R0, COUNTDOWN_MS, DM_KILLS_TO_WIN, DT, KILL_GOLD, ROUND_GOLD, SHOP_MS, START_GOLD, ASSIST_GOLD, WINS_TO_WIN } from '../src/shared/constants.ts';
import { DEFAULT_OPTS, PACE, addPlayer, castBallot, goalOf, newMatch, resume, setReady, startMatch, startVote, tickMatch, type Match, type MatchOpts } from '../src/shared/match.ts';
import { parseClientMessage } from '../src/shared/protocol.ts';
import { newWorld, stepWorld, type SimEvent } from '../src/shared/sim.ts';
import { noItems } from '../src/shared/items.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { STEP_MS } from './helpers.ts';

const half = () => 0.5;
type G = { m: Match; now: number };

// humanos 'a', 'b'... e bots; opções da partida já aplicadas
function game(humans: string[], bots = 0, opts: Partial<MatchOpts> = {}, mode: Match['mode'] = 'rounds'): G {
  const m = newMatch();
  for (const id of humans) addPlayer(m, id, id.toUpperCase());
  startMatch(m, 0, bots, mode, true, half, opts);
  return { m, now: 0 };
}
const tick = (g: G) => tickMatch(g.m, (g.now += STEP_MS), [], half);
function until(g: G, cond: () => boolean, limit = 60 * 300) {
  for (let i = 0; i < limit && !cond(); i++) tick(g);
}
function toPlaying(g: G) {
  for (const p of g.m.players) setReady(g.m, p.id);
  until(g, () => g.m.phase === 'playing');
  for (const z of g.m.world!.wizards) z.invulnUntil = 0;
}
function kill(g: G, id: string, by: string | null): SimEvent[] {
  const wz = g.m.world!.wizards.find((z) => z.id === id)!;
  Object.assign(wz, { hp: 0.01, lastHitBy: by, lastHitAt: g.m.world!.t, pos: v(ARENA_R0 * 3, 0) });
  return tick(g);
}
const goldOf = (g: G, id: string) => g.m.players.find((p) => p.id === id)!.gold;
const goldEvents = (ev: SimEvent[], id: string) => ev.filter((e) => e.k === 'gold' && e.id === id).map((e) => (e.k === 'gold' ? e.n : 0));

describe('opções da partida', () => {
  it('defaults are the usual numbers', () => {
    expect(DEFAULT_OPTS.shop * 1000).toBe(SHOP_MS);
    expect(DEFAULT_OPTS.startGold).toBe(START_GOLD);
    expect(DEFAULT_OPTS.goal).toBe(WINS_TO_WIN);
    expect(goalOf({ mode: 'deathmatch', opts: DEFAULT_OPTS })).toBe(DM_KILLS_TO_WIN);
    expect(goalOf({ mode: 'deathmatch', opts: { ...DEFAULT_OPTS, goal: 7 } })).toBe(25);
  });

  it('shop time is the chosen one, and everyone ready still ends it early', () => {
    const g = game(['a', 'b'], 0, { shop: 90 });
    expect(g.m.phaseEnds).toBe(90_000);
    setReady(g.m, 'a');
    setReady(g.m, 'b');
    tick(g);
    expect(g.m.phase).toBe('countdown');
    expect(g.m.phaseEnds - g.now).toBeCloseTo(COUNTDOWN_MS * PACE.normal, 5);
  });

  it('short pace shortens the countdown', () => {
    const g = game(['a', 'b'], 0, { pace: 'short' });
    for (const p of g.m.players) setReady(g.m, p.id);
    tick(g);
    expect(g.m.phaseEnds - g.now).toBeCloseTo(COUNTDOWN_MS * PACE.short, 5);
  });

  it('start gold is multiplied by the economy', () => {
    expect(game(['a', 'b'], 0, { startGold: 60, economy: 1.6 }).m.players[0].gold).toBe(96);
    expect(game(['a', 'b'], 0, { startGold: 100 }).m.players[0].gold).toBe(100);
  });

  it('economy multiplies kill, assist, loot, round and win gold', () => {
    const eco = 2.5;
    const g = game(['a', 'b', 'c'], 0, { economy: eco });
    toPlaying(g);
    g.m.dmgOn = { c: { b: 50 } }; // b ajudou a derrubar c
    const ev = kill(g, 'c', 'a');
    expect(goldEvents(ev, 'a')).toEqual([Math.round(KILL_GOLD * eco)]);
    expect(goldEvents(ev, 'b')).toEqual([Math.round(ASSIST_GOLD * eco)]);
    // monte de ouro: 1 de cada vez vira 3
    g.m.world!.loots = [{ pos: g.m.world!.wizards[0].pos, left: 5, until: 1e9 }];
    const before = goldOf(g, 'a');
    until(g, () => goldOf(g, 'a') > before, 200);
    expect(goldOf(g, 'a') - before).toBe(Math.round(1 * eco));
    // a vence a rodada: vitória e ouro da rodada também multiplicados (sem dano, ninguém ganha o top dano)
    const g1 = game(['a', 'b'], 0, {});
    const g2 = game(['a', 'b'], 0, { economy: eco });
    for (const x of [g1, g2]) {
      toPlaying(x);
      x.m.players.forEach((p) => (p.gold = 0));
      kill(x, 'b', null);
    }
    expect(goldOf(g2, 'a')).toBe(Math.round(ROUND_GOLD * eco) + Math.round((goldOf(g1, 'a') - ROUND_GOLD) * eco));
  });

  it('goal: with 3 rounds the match ends at 3 wins', () => {
    const g = game(['a', 'b'], 0, { goal: 3 });
    toPlaying(g);
    g.m.players.find((p) => p.id === 'a')!.score = 2;
    kill(g, 'b', null);
    until(g, () => g.m.phase !== 'roundEnd');
    expect(g.m.phase).toBe('end');
    expect(g.m.winner).toBe('a');
  });

  it('rooms saved before the options load with the defaults', () => {
    const g = game(['a', 'b']);
    const old = g.m as Partial<Match>;
    delete old.opts;
    delete old.pendingOpts;
    delete old.botDelta;
    resume(g.m, 0);
    expect(g.m.opts).toEqual(DEFAULT_OPTS);
    expect(g.m.pendingOpts).toEqual({});
    expect(g.m.botDelta).toBe(0);
  });

  it('the protocol only accepts known options and values', () => {
    const p = (m: unknown) => parseClientMessage(JSON.stringify(m));
    expect(p({ t: 'start', bots: 2, opts: { shop: 120, economy: 2.5, runes: false } })).toEqual({ t: 'start', bots: 2, mode: undefined, shuffle: undefined, opts: { shop: 120, economy: 2.5, runes: false } });
    expect(p({ t: 'start', bots: 2 })).toEqual({ t: 'start', bots: 2, mode: undefined, shuffle: undefined });
    expect(p({ t: 'start', bots: 2, opts: { shop: 15 } })).toBeNull();
    expect(p({ t: 'start', bots: 2, opts: { economy: 2 } })).toBeNull();
    expect(p({ t: 'start', bots: 2, opts: { gold: 1 } })).toBeNull();
    expect(p({ t: 'start', bots: 2, opts: 'muita' })).toBeNull();
    expect(p({ t: 'vote', kind: 'opt', target: 'shop:60' })).toEqual({ t: 'vote', kind: 'opt', target: 'shop:60' });
    expect(p({ t: 'vote', kind: 'opt', target: 'shop:61' })).toBeNull();
    expect(p({ t: 'vote', kind: 'opt', target: 'chests:false' })).toEqual({ t: 'vote', kind: 'opt', target: 'chests:false' });
    for (const kind of ['restart', 'end', 'addBot', 'removeBot', 'skipShop']) expect(p({ t: 'vote', kind })).toEqual({ t: 'vote', kind });
    expect(p({ t: 'vote', kind: 'explode' })).toBeNull();
  });
});

describe('votações novas', () => {
  it('an option vote counts from the next round (alone with bots it passes at once)', () => {
    const g = game(['a'], 2);
    expect(startVote(g.m, 'a', 'opt', 'shop:60', 0)).toBe(true);
    expect(g.m.vote).toBeNull();
    expect(g.m.pendingOpts).toEqual({ shop: 60 });
    expect(startVote(g.m, 'a', 'opt', 'shop:60', 0)).toBe(false); // já vale na próxima
    expect(startVote(g.m, 'a', 'opt', 'shop:61', 0)).toBe(false);
    expect(g.m.opts.shop).toBe(30);
    toPlaying(g);
    expect(g.m.opts.shop).toBe(60);
    expect(g.m.pendingOpts).toEqual({});
  });

  it('turning mechanics off reaches the world of the next round', () => {
    const g = game(['a'], 2);
    for (const k of ['runes', 'sudden', 'chests']) expect(startVote(g.m, 'a', 'opt', `${k}:false`, 0)).toBe(true);
    toPlaying(g);
    expect(g.m.world!.rules).toEqual({ runes: false, sudden: false, chests: false });
  });

  it('with mechanics off there are no runes, chests or sudden death', () => {
    const w = newWorld(['a', 'b'], { a: noSpells(), b: noSpells() }, { a: noItems(), b: noItems() }, 0, half, false, {}, { runes: false, sudden: false, chests: false });
    w.wizards[1].pos = v(2, 0);
    const kinds = new Set<string>();
    for (let i = 0; i < 100 / DT; i++) {
      stepWorld(w, [], half);
      for (const e of w.events) kinds.add(e.k);
    }
    expect([...kinds].filter((k) => k === 'rune' || k === 'chest' || k === 'sudden')).toEqual([]);
    expect(kinds.has('shrink')).toBe(true);
  });

  it('restart goes back to the round 1 shop with everything reset, same mode and options', () => {
    const g = game(['a'], 2, { economy: 1.6 }, 'teams');
    toPlaying(g);
    g.m.players[0].score = 3;
    g.m.players[0].spells.lightning = 2;
    expect(startVote(g.m, 'a', 'restart', '', g.now)).toBe(true);
    expect(g.m.phase).toBe('shop');
    expect(g.m.round).toBe(0);
    expect(g.m.mode).toBe('teams');
    expect(g.m.opts.economy).toBe(1.6);
    expect(g.m.players.length).toBe(3);
    const a = g.m.players.find((p) => p.id === 'a')!;
    expect([a.score, a.gold, a.spells.lightning]).toEqual([0, Math.round(START_GOLD * 1.6), 0]);
  });

  it('end now: the top scorer wins; a tie at the top has no winner', () => {
    const g = game(['a'], 2);
    toPlaying(g);
    g.m.players[1].score = 2;
    expect(startVote(g.m, 'a', 'end', '', g.now)).toBe(true);
    expect([g.m.phase, g.m.winner]).toEqual(['end', g.m.players[1].id]);
    const t = game(['a'], 2);
    t.m.players[0].score = 1;
    t.m.players[1].score = 1;
    startVote(t.m, 'a', 'end', '', 0);
    expect([t.m.phase, t.m.winner]).toEqual(['end', null]);
  });

  it('add and remove a bot take effect when the next round starts', () => {
    const g = game(['a'], 2);
    expect(startVote(g.m, 'a', 'addBot', '', 0)).toBe(true);
    expect(g.m.players.length).toBe(3);
    toPlaying(g);
    expect(g.m.players.length).toBe(4);
    expect(g.m.world!.wizards.length).toBe(4);
    const added = g.m.players[3];
    expect(added.bot).toBe(true);
    expect(new Set(g.m.players.map((p) => p.id)).size).toBe(4);
    kill(g, 'a', null);
    until(g, () => g.m.phase === 'shop', 60 * 1200); // 3 bots podem levar mais de 300 s para fechar a rodada
    expect(g.m.phase).toBe('shop');
    expect(startVote(g.m, 'a', 'removeBot', '', g.now)).toBe(true);
    toPlaying(g);
    expect(g.m.players.length).toBe(3);
  });

  it('cannot remove a bot when there is none, nor add past 8', () => {
    const g = game(['a', 'b']);
    expect(startVote(g.m, 'a', 'removeBot', '', 0)).toBe(false);
    const full = game(['a'], 7);
    expect(startVote(full.m, 'a', 'addBot', '', 0)).toBe(false);
  });

  it('skip shop closes the shop on the next step, only during the shop', () => {
    const g = game(['a', 'b']);
    expect(startVote(g.m, 'a', 'skipShop', '', 0)).toBe(true);
    expect(g.m.vote).not.toBeNull(); // 2 humanos: precisa do b
    tickMatch(g.m, 1, [], half);
    g.now = 1;
    expect(g.m.phase).toBe('shop');
    // o b aceita: a loja fecha no passo seguinte
    expect(castBallot(g.m, 'b', true, g.now)).toBe(true);
    tick(g);
    expect(g.m.phase).toBe('countdown');
    toPlaying(g);
    expect(startVote(g.m, 'a', 'skipShop', '', g.now)).toBe(false);
  });
});
