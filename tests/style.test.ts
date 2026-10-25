import { afterEach, describe, expect, it, vi } from 'vitest';
import { addPlayer, newMatch, startMatch, tickMatch, type Match, type MatchOpts } from '../src/shared/match.ts';
import { mulberry32 } from '../src/shared/rng.ts';
import { addRecord, emptyTotals, roundRecord, styleRows, type RoundRecord } from '../src/shared/telemetry.ts';

afterEach(() => vi.restoreAllMocks());

// the seeded rand is passed explicitly; a stray Math.random in the match path fails here instead of hiding behind the seed
function seedRandom(seed: number) {
  vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random outside the received rand'); });
  return mulberry32(seed);
}

// bot-only match with a fixed seed; returns the FNV-1a hash of every step's events
function botMatch(seed: number, steps: number, opts: Partial<MatchOpts> = {}): { m: Match; hash: number } {
  const rand = seedRandom(seed);
  const m = newMatch();
  startMatch(m, 0, 4, 'rounds', true, rand, opts);
  let now = 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < steps; i++) {
    const s = JSON.stringify(tickMatch(m, (now += 1000 / 60), [], rand));
    for (let j = 0; j < s.length; j++) hash = Math.imul(hash ^ s.charCodeAt(j), 16777619) >>> 0;
  }
  return { m, hash };
}

describe('play style', () => {
  // value recorded with the code from before the measurement (972dab7): measuring only reads, so the events do not change.
  // It changes (and is recorded again) only when gameplay changes. 20/10 (issue #80): the chest draws its pile's gold (3 to 5) when it
  // spawns, one more draw in the sequence. 21/10 (issue #217): Scourge and Pact become spells, the Redirector leaves and bot purchases change
  // 22/10 (issue #206): the Barricade falls from the sky and damages whoever is below, and bots use it
  it('measuring does not change the match: same seed, same events as before', () => {
    const { m, hash } = botMatch(7, 4000);
    // 22/10: ending the amplification by accumulated damage changes the trajectories on purpose.
    // Proposal 23/10: explicit stun/Grip locks change the bots' decisions and trajectories.
    // Proposal 23/10: a clean end of the impulse and the 50→100% recovery change trajectories.
    // Proposal 23/10: general collisions and continuous Lightning change the events on purpose.
    // 23/10: a single click cancels on the first contact, oblique included, also for bot destinations.
    // Proposal 23/10: Meteor without knockback, with a fixed 1.25 s stun.
    // 24/10: bots use the manual Attack (no spell ready, enemy within 6 m, clear line).
    // 24/10: bots hold ground (hit 0.5 to 0.9 s away so the windup finishes, no escape spell ready, not dodging on foot; keep holding while it closes in; lease 0.5 s).
    // 24/10 (issue #373): bot shopping plans include Recharge, Heal, Geyser, Closed Body and Swap.
    // 25/10 (PR #399): blasts (Meteor, clashes, pillar/shrine) and bouncing projectiles and the Splitter damage obstacles.
    // 25/10: Gravity pulls 30% less within a 2.2 m radius and Windwalk's cooldown is ×1.4 (balance batch).
    expect(hash).toBe(1637722488);
    // and it really measured in this same match
    const sum = (k: 'threats' | 'reactN' | 'nearN') => m.players.reduce((a, p) => a + p.stats.match[k], 0);
    expect([sum('threats') > 0, sum('reactN') > 0, sum('nearN') > 0]).toEqual([true, true, true]);
  });

  it('the round record carries the difficulty, the nickname (humans only) and the play style', () => {
    const rand = seedRandom(3);
    const m = newMatch();
    addPlayer(m, 'h', 'Ana', false, false, rand);
    startMatch(m, 0, 3, 'rounds', true, rand, { difficulty: 'hard' });
    m.players[0].connected = false; // the human becomes a bot until they return: the round plays on by itself
    let now = 0;
    for (let i = 0; i < 60 * 240 && m.phase !== 'roundEnd'; i++) tickMatch(m, (now += 1000 / 60), [], rand);
    expect(m.phase).toBe('roundEnd');
    const r = roundRecord(m, now);
    expect(r.difficulty).toBe('hard');
    expect(r.players.map((p) => p.name)).toEqual(['Ana', undefined, undefined, undefined]);
    const [ana, ...bots] = r.players;
    expect(bots.reduce((a, p) => a + (p.threats ?? 0), 0)).toBeGreaterThan(0);
    expect(bots.every((p) => (p.nearN ?? 0) > 0)).toBe(true);
    // played by the bot while disconnected: the bot's style does not enter that player's row
    expect([ana.threats, ana.nearN]).toEqual([0, 0]);
  });

  it('styleRows: one row per human (last nickname) and per difficulty; training, Automatic and old records left out', () => {
    const style = { threats: 10, struck: 4, shieldable: 4, shielded: 1, reactSum: 3, reactN: 6, nearSum: 50, nearN: 10 };
    const pl = (o: Partial<RoundRecord['players'][number]>): RoundRecord['players'][number] =>
      ({ bot: false, character: 'mage', won: false, spells: {}, items: {}, dmg: 0, dmgBy: {}, fired: {}, landed: {}, kills: 0, ...style, ...o });
    const rec = (o: Partial<RoundRecord>, players: RoundRecord['players']): RoundRecord => ({ at: 0, humans: 1, difficulty: 'normal', players, ...o });
    const t = emptyTotals();
    addRecord(t, rec({}, [pl({ pid: 'x1', name: 'Ana' }), pl({ bot: true, pid: 'b' })]));
    addRecord(t, rec({}, [pl({ pid: 'x1', name: 'Aninha' }), pl({ bot: true, pid: 'b' })]));
    addRecord(t, rec({ setup: true }, [pl({ pid: 'x1', name: 'Treino' })]));
    addRecord(t, rec({ difficulty: 'auto' }, [pl({ pid: 'x1', name: 'Aninha' }), pl({ bot: true, pid: 'b' })]));
    addRecord(t, rec({ difficulty: undefined }, [pl({ pid: 'x1', name: 'Velho' })]));
    const rows = styleRows(t);
    expect(rows).toEqual([
      { who: 'Aninha', pid: 'x1', rounds: 3, threats: 30, reacted: 0.6, react: 0.5, struck: 0.4, shield: 0.25, near: 5 },
      { who: 'bots normal', pid: undefined, rounds: 2, threats: 20, reacted: 0.6, react: 0.5, struck: 0.4, shield: 0.25, near: 5 },
    ]);
    // a record without the fields (from before the measurement) is left out
    addRecord(t, rec({}, [{ ...pl({ pid: 'x2' }), threats: undefined }]));
    expect(styleRows(t).length).toBe(2);
  });

  it('Hard reacts faster and to more threats than Easy', () => {
    const style = (difficulty: 'easy' | 'hard') => {
      const { m } = botMatch(11, 60 * 600, { difficulty });
      const s = (k: 'threats' | 'reactSum' | 'reactN') => m.players.reduce((a, p) => a + p.stats.match[k], 0);
      return { react: s('reactSum') / s('reactN'), reacted: s('reactN') / s('threats') };
    };
    const easy = style('easy');
    const hard = style('hard');
    expect(hard.react).toBeLessThan(easy.react);
    expect(hard.reacted).toBeGreaterThan(easy.reacted);
  }, 30_000); // two simulated 10-minute matches: ~5.5 s on the GitHub runner
});
