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

// Run a seeded bot-only match and hash all step events using FNV-1a.
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
  // Telemetry is read-only; update this fixture only for intentional gameplay changes.
  // Prior changes include randomized chest gold, Scourge/Pact shopping, falling Barricade,
  // collision/control rules, manual bot attacks and hold-ground decisions.
  it('telemetry preserves deterministic seeded match events', () => {
    const { m, hash } = botMatch(7, 4000);
    // Intentional trajectory changes: no historical damage amplification; explicit stun/Grip blocks;
    // clean impulse recovery, general collisions, continuous Lightning and first-contact movement;
    // Meteor uses fixed 1.25 s stun without knockback.
    // 24/10: bots use the manual Attack (no spell ready, enemy within 6 m, clear line).
    // 24/10: bots hold ground (hit 0.5 to 0.9 s away so the windup finishes, no escape spell ready, not dodging on foot; keep holding while it closes in; lease 0.5 s).
    // 24/10 (issue #373): bot shopping plans include Recharge, Heal, Geyser, Closed Body and Swap.
    // Channeling joins bot shopping and changes seeded purchase/decision draws.
    expect(hash).toBe(3327942269);
    // Confirm that this same match collected real measurements.
    const sum = (k: 'threats' | 'reactN' | 'nearN') => m.players.reduce((a, p) => a + p.stats.match[k], 0);
    expect([sum('threats') > 0, sum('reactN') > 0, sum('nearN') > 0]).toEqual([true, true, true]);
  });

  it('round records include difficulty, human names and play style', () => {
    const rand = seedRandom(3);
    const m = newMatch();
    addPlayer(m, 'h', 'Ana', false, false, rand);
    startMatch(m, 0, 3, 'rounds', true, rand, { difficulty: 'hard' });
    m.players[0].connected = false; // The disconnected human is temporarily controlled by a bot.
    let now = 0;
    for (let i = 0; i < 60 * 240 && m.phase !== 'roundEnd'; i++) tickMatch(m, (now += 1000 / 60), [], rand);
    expect(m.phase).toBe('roundEnd');
    const r = roundRecord(m, now);
    expect(r.difficulty).toBe('hard');
    expect(r.players.map((p) => p.name)).toEqual(['Ana', undefined, undefined, undefined]);
    const [ana, ...bots] = r.players;
    expect(bots.reduce((a, p) => a + (p.threats ?? 0), 0)).toBeGreaterThan(0);
    expect(bots.every((p) => (p.nearN ?? 0) > 0)).toBe(true);
    // Temporary bot control must not populate the human play-style row.
    expect([ana.threats, ana.nearN]).toEqual([0, 0]);
  });

  it('styleRows groups latest human names and difficulty, excluding practice, Auto and legacy records', () => {
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
    // Legacy records without telemetry fields are excluded.
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
  }, 30_000); // Two simulated ten-minute matches take about 5.5 s on the GitHub runner.
});
