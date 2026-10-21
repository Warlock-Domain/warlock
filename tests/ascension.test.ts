import { describe, expect, it } from 'vitest';
import { ASC_ROUNDS, CONSOLATION, LEADER_KILL_XP, MARK_KB, applyCard, ascDeath, ascEndRound, autoPick, drawCards, levelOf, placePoints, pickCard, reroll, xpFor, xpGain, type Card } from '../src/shared/ascension.ts';
import { addPlayer, buy, castBallot, newMatch, resume, setReady, startMatch, startVote, tickMatch, type Match } from '../src/shared/match.ts';
import { parseClientMessage } from '../src/shared/protocol.ts';
import { STEP_MS, until } from './helpers.ts';
import { ITEM_IDS, noItems } from '../src/shared/items.ts';
import { MAX_SPELL_LEVEL, SPELL_GROUP_IDS, SPELL_IDS, noSpells, spellGroup, type SpellId } from '../src/shared/spells.ts';

// gerador com semente (o mesmo mulberry32 dos outros testes)
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const mage = (spells: Partial<Record<SpellId, number>> = {}) => ({ spells: { ...noSpells(), ...spells }, items: { ...noItems(), scourge: 1 } });
const group = (c: Card) => (c.kind === 'item' ? 'item' : spellGroup(c.id));
const stat = (o: object = {}) => ({ gold: 0, dmg: 0, kills: 0, dmgBy: {}, fired: {}, landed: {}, deaths: 0, deathBy: {}, alive: 0, threats: 0, struck: 0, shieldable: 0, shielded: 0, reactSum: 0, reactN: 0, nearSum: 0, nearN: 0, ...o });

describe('grupos de magia', () => {
  it('every spell has exactly one group', () => {
    const all = Object.values(SPELL_GROUP_IDS).flat();
    expect([...all].sort()).toEqual([...SPELL_IDS].sort());
  });
});

describe('cartas do Ascensão', () => {
  it('drawCards same seed same cards', () => {
    expect(drawCards(mage(), seeded(1))).toEqual(drawCards(mage(), seeded(1)));
  });

  it('drawCards gives 3 distinct cards from at least 2 groups', () => {
    for (let s = 0; s < 300; s++) {
      const cards = drawCards(mage(), seeded(s));
      expect(cards).toHaveLength(3);
      expect(new Set(cards.map((c) => c.kind + c.id)).size).toBe(3);
      expect(new Set(cards.map(group)).size).toBeGreaterThanOrEqual(2);
    }
  });

  it('drawCards never offers up for a spell at max level nor a new spell already owned', () => {
    const p = mage({ fireball: MAX_SPELL_LEVEL, teleport: 2 });
    for (let s = 0; s < 300; s++) {
      for (const c of drawCards(p, seeded(s))) {
        if (c.kind === 'up') expect(c.id).toBe('teleport');
        if (c.kind === 'spell') expect(['fireball', 'teleport']).not.toContain(c.id);
      }
    }
  });

  it('applyCard new spell enters at level 1', () => {
    const p = mage();
    expect(applyCard(p, { kind: 'spell', id: 'teleport' })).toBe(true);
    expect(p.spells.teleport).toBe(1);
    expect(applyCard(p, { kind: 'spell', id: 'teleport' })).toBe(false);
  });

  it('applyCard full bar needs swap', () => {
    const p = mage({ lightning: 1, homing: 1, shield: 1, teleport: 1, swap: 2 });
    expect(applyCard(p, { kind: 'spell', id: 'grip' })).toBe(false);
    expect(applyCard(p, { kind: 'spell', id: 'grip' }, 'meteor')).toBe(false);
    expect(applyCard(p, { kind: 'spell', id: 'grip' }, 'swap')).toBe(true);
    expect([p.spells.grip, p.spells.swap]).toEqual([1, 0]);
  });

  it('applyCard up raises one level', () => {
    const p = mage();
    expect(applyCard(p, { kind: 'up', id: 'fireball' })).toBe(true);
    expect(p.spells.fireball).toBe(2);
    expect(applyCard(p, { kind: 'up', id: 'teleport' })).toBe(false);
  });

  it('applyCard repeated item raises its level', () => {
    const p = mage();
    expect(applyCard(p, { kind: 'item', id: 'boots' })).toBe(true);
    expect(applyCard(p, { kind: 'item', id: 'boots' })).toBe(true);
    expect(p.items.boots).toBe(2);
    expect(ITEM_IDS).toContain('boots');
  });
});

describe('XP e pontos do Ascensão', () => {
  it('levelOf is monotonic and starts at 1', () => {
    expect(levelOf(0)).toBe(1);
    for (let xp = 0; xp < 5000; xp += 7) expect(levelOf(xp + 7)).toBeGreaterThanOrEqual(levelOf(xp));
  });

  it('xp counts spell damage, lava credit, kills and time alive', () => {
    expect(xpGain(stat())).toBe(0);
    expect(xpGain(stat({ dmgBy: { fireball: 100 } }))).toBeGreaterThan(0);
    expect(xpGain(stat({ dmgBy: { lava: 100 } }))).toBeGreaterThan(0);
    expect(xpGain(stat({ kills: 1 }))).toBeGreaterThan(0);
    expect(xpGain(stat({ alive: 30 }))).toBeGreaterThan(0);
  });

  it('placement points follow fall order, last alive gets the bonus', () => {
    expect(placePoints(['a', 'b', 'c', 'd'], ['c', 'a', 'd'], ['b'])).toEqual({ c: 0, a: 1, d: 2, b: 4 });
    // ninguém sobrou (caíram no mesmo passo): só a ordem de queda
    expect(placePoints(['a', 'b'], ['b', 'a'], [])).toEqual({ b: 0, a: 1 });
    // expulso no meio da rodada (sem evento de queda) conta como o primeiro a cair
    expect(placePoints(['a', 'b', 'c'], ['b'], ['c'])).toEqual({ a: 0, b: 1, c: 3 });
  });
});

// partida do Ascensão só de bots (ou com o humano h), com o sorteio da partida por semente
function ascMatch(seed: number, human = false): Match {
  const m = newMatch();
  if (human) addPlayer(m, 'h', 'Ana');
  startMatch(m, 0, 3, 'ascension', true, seeded(seed), { pace: 'short' });
  return m;
}
const run = (m: Match, now: number, cond: () => boolean, rand = seeded(9)) => until(m, now, cond, 60 * 60 * 60, rand);

describe('partida do Ascensão', () => {
  it('start gives fireball, scourge and one pick, no gold', () => {
    const m = ascMatch(1, true);
    const h = m.players.find((p) => p.id === 'h')!;
    expect([h.spells.fireball, h.items.scourge, h.gold, m.asc!.picks.h]).toEqual([1, 1, 0, 1]);
    // o intervalo não acaba sem a escolha dele, nem com o Pronto
    expect(setReady(m, 'h')).toBe(false);
    tickMatch(m, STEP_MS, [], seeded(2));
    expect(m.asc!.offer.h).toHaveLength(3);
    expect(m.phase).toBe('shop');
    expect(pickCard(m, 'h', 0)).toBe(true);
    tickMatch(m, 2 * STEP_MS, [], seeded(2));
    expect(m.phase).toBe('countdown');
  });

  it('shop is closed in ascension', () => {
    const m = ascMatch(1, true);
    expect(buy(m, 'h', 'teleport')).toBe(false);
    expect(m.players.find((p) => p.id === 'h')!.gold).toBe(0);
  });

  it('ascension match lasts 9 rounds and has no chests', () => {
    const m = ascMatch(3);
    let now = 0;
    let chests = 0;
    for (let r = 1; r <= ASC_ROUNDS; r++) {
      now = run(m, now, () => m.phase === 'playing');
      chests += m.world!.rules.chests ? 1 : 0;
      expect(m.round).toBe(r);
      now = run(m, now, () => m.phase === 'shop' || m.phase === 'end');
      if (r < ASC_ROUNDS) expect(m.phase).toBe('shop');
    }
    expect(m.phase).toBe('end');
    expect(chests).toBe(0);
    // pontos de colocação somados no placar; vence o maior
    const best = Math.max(...m.players.map((p) => p.score));
    expect(m.players.find((p) => p.id === m.winner)!.score).toBe(best);
    expect(best).toBeGreaterThan(0);
  });

  it('bots pick with match rand: same seed, same builds', () => {
    const builds = (m: Match) => m.players.map((p) => JSON.stringify([p.spells, p.items]));
    const a = ascMatch(5);
    const b = ascMatch(5);
    run(a, 0, () => a.phase === 'playing', seeded(4));
    run(b, 0, () => b.phase === 'playing', seeded(4));
    expect(builds(a)).toEqual(builds(b));
    expect(a.players.every((p) => Object.values(p.spells).reduce((x, y) => x + y) + Object.values(p.items).reduce((x, y) => x + y) === 3)).toBe(true);
  });

  it('shop timeout resolves pending picks', () => {
    const m = ascMatch(1, true);
    run(m, 0, () => m.phase === 'countdown');
    expect(m.asc!.picks.h).toBe(0);
    expect(Object.values(m.players[0].spells).reduce((x, y) => x + y) + Object.values(m.players[0].items).reduce((x, y) => x + y)).toBe(3);
  });

  it('resume keeps ascension state', () => {
    const m = ascMatch(3);
    const now = run(m, 0, () => m.round === 2 && m.phase === 'playing');
    const saved = JSON.parse(JSON.stringify({ ...m, world: null })) as Match;
    resume(saved, now);
    expect(saved.asc).toEqual(m.asc);
    expect(saved.phase).toBe('shop');
    run(saved, now, () => saved.phase === 'playing');
    expect(saved.round).toBe(2);
  });

  it('mode vote to and from ascension restarts match', () => {
    const m = newMatch();
    addPlayer(m, 'h', 'Ana');
    startMatch(m, 0, 2, 'rounds', true, seeded(1));
    expect(startVote(m, 'h', 'mode', 'ascension', 0)).toBe(true);
    tickMatch(m, STEP_MS, [], seeded(1));
    expect([m.mode, m.round, !!m.asc]).toEqual(['ascension', 0, true]);
    expect(startVote(m, 'h', 'mode', 'rounds', 0)).toBe(true);
    castBallot(m, 'h', true, 0);
    tickMatch(m, 2 * STEP_MS, [], seeded(1));
    expect([m.mode, !!m.asc]).toEqual(['rounds', false]);
  });

  it('card outside ascension is ignored', () => {
    const m = newMatch();
    addPlayer(m, 'h', 'Ana');
    startMatch(m, 0, 2, 'rounds', true, seeded(1));
    expect(pickCard(m, 'h', 0)).toBe(false);
  });

  it('sandbox stays out of ascension', () => {
    const m = newMatch();
    addPlayer(m, 'h', 'Ana');
    startMatch(m, 0, 0, 'ascension', true, seeded(1), {}, [], true);
    expect([m.mode, !!m.asc]).toEqual(['rounds', false]);
  });
});

describe('mensagem card', () => {
  it('card message parses and rejects bad i/swap', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'card', i: 2 }))).toEqual({ t: 'card', i: 2 });
    expect(parseClientMessage(JSON.stringify({ t: 'card', i: 0, swap: 'teleport', x: 1 }))).toEqual({ t: 'card', i: 0, swap: 'teleport' });
    for (const bad of [{ i: 3 }, { i: -1 }, { i: 1.5 }, { i: '1' }, { i: 0, swap: 'nada' }]) expect(parseClientMessage(JSON.stringify({ t: 'card', ...bad }))).toBeNull();
  });
});

describe('recuperação e bots do Ascensão', () => {
  const twoAt = (levels: number[]) => {
    const m = ascMatch(1, true);
    m.players.forEach((p, i) => (m.asc!.xp[p.id] = xpFor(levels[i] ?? 1)));
    return m;
  };

  it('killing the leader gives extra xp by level gap', () => {
    const m = twoAt([4, 1, 1, 1]);
    const [lead, a] = m.players;
    ascDeath(m, lead.id, a.id);
    expect(m.asc!.extra[a.id]).toBe(LEADER_KILL_XP * 3);
    ascDeath(m, a.id, lead.id);
    expect(m.asc!.extra[lead.id]).toBeUndefined();
  });

  it('below average gets +25% xp per level below', () => {
    const m = twoAt([3, 1, 3, 1]);
    const ids = m.players.map((p) => p.id);
    for (const p of m.players) p.stats.round = { ...p.stats.round, dmgBy: { fireball: 100 }, dmg: 100 };
    const before = ids.map((id) => m.asc!.xp[id]);
    ascEndRound(m, ids, []);
    const gain = ids.map((id, i) => m.asc!.xp[id] - before[i]);
    expect(gain[1]).toBe(Math.round(gain[0] * (1 + CONSOLATION * 1)));
  });

  it('behind the leader gets one reroll and rare cards; leader gets none', () => {
    const m = twoAt([4, 1, 4, 1]);
    const ids = m.players.map((p) => p.id);
    ascEndRound(m, ids, []);
    expect(ids.map((id) => m.asc!.rerolls[id])).toEqual([0, 1, 0, 1]);
    const rare = drawCards({ spells: { ...noSpells(), teleport: 1, swap: 1, shield: 1, grip: 1, lightning: 1 }, items: { ...noItems(), ring: 6, cape: 6 } }, seeded(3), 1);
    expect(rare.filter((c) => c.kind === 'up').every((c) => c.kind === 'up' && c.rare)).toBe(true);
    const p = mage();
    applyCard(p, { kind: 'up', id: 'fireball', rare: true });
    expect(p.spells.fireball).toBe(3);
  });

  it('reroll swaps the cards once per interval', () => {
    const m = ascMatch(1, true);
    tickMatch(m, STEP_MS, [], seeded(2));
    m.asc!.rerolls.h = 1;
    const first = m.asc!.offer.h;
    expect(reroll(m, 'h')).toBe(true);
    expect(reroll(m, 'h')).toBe(false);
    tickMatch(m, 2 * STEP_MS, [], seeded(7));
    expect(m.asc!.offer.h).not.toEqual(first);
  });

  it('marked leader takes +5% knockback per level above second', () => {
    const m = twoAt([5, 2, 3, 1]);
    const now = run(m, 0, () => m.phase === 'playing');
    const z = m.world!.wizards.find((q) => q.id === m.players[0].id)!;
    const other = m.world!.wizards.find((q) => q.id === m.players[2].id)!;
    expect(other.kbResist - z.kbResist).toBeCloseTo(MARK_KB * 2);
    expect(now).toBeGreaterThan(0);
  });

  it('easy bot picks at random; normal bot fills missing defense first', () => {
    const p = { ...ascMatch(1).players[1], spells: { ...noSpells(), teleport: 1 } };
    const cards: Card[] = [{ kind: 'item', id: 'boots' }, { kind: 'spell', id: 'lightning' }, { kind: 'spell', id: 'shield' }];
    expect(autoPick(p, cards, 'normal', seeded(1))[0]).toBe(2);
    expect(autoPick(p, cards, 'top', seeded(1))[0]).toBe(0);
    const seen = new Set(Array.from({ length: 50 }, (_, s) => autoPick(p, cards, 'easy', seeded(s))[0]));
    expect(seen.size).toBe(3);
  });
});
