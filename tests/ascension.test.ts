import { describe, expect, it } from 'vitest';
import { ASC_ROUNDS, CONSOLATION, KILL_XP, liveLevel, roundMult, LEADER_KILL_XP, MARK_KB, applyCard, setAscLobby, ascDeath, ascEndRound, autoPick, chooseCard, drawCards, LAST_CALL_MS, levelOf, placePoints, reroll, xpFor, xpGain, type Card } from '../src/shared/ascension.ts';
import { addPlayer, buy, castBallot, newMatch, removePlayer, resume, setReady, startMatch, startVote, tickMatch, type Match } from '../src/shared/match.ts';
import { parseClientMessage, publicRoom } from '../src/shared/protocol.ts';
import { gearOf } from '../src/shared/sim.ts';
import { ROUND_EFFECTS } from '../src/shared/constants.ts';
import { STEP_MS, until } from './helpers.ts';
import { ITEM_IDS, noItems, type ItemId } from '../src/shared/items.ts';
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
    expect(drawCards(mage(), 'spell', seeded(1))).toEqual(drawCards(mage(), 'spell', seeded(1)));
  });

  it('drawCards gives 3 distinct cards of the asked kind, new spells from at least 2 groups', () => {
    for (let s = 0; s < 300; s++) {
      for (const kind of ['spell', 'item'] as const) {
        const cards = drawCards(mage(), kind, seeded(s));
        expect(cards).toHaveLength(3);
        expect(cards.every((c) => c.kind === kind)).toBe(true);
        expect(new Set(cards.map((c) => c.id)).size).toBe(3);
        if (kind === 'spell') expect(new Set(cards.map(group)).size).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('drawCards never offers up for a spell at max level nor a new spell already owned', () => {
    const p = mage({ fireball: MAX_SPELL_LEVEL, teleport: 2 });
    for (let s = 0; s < 300; s++) {
      for (const c of [...drawCards(p, 'spell', seeded(s)), ...drawCards(p, 'up', seeded(s))]) {
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
    expect([p.spells.grip, p.spells.swap]).toEqual([2, 0]); // herda o nível 2 da Troca
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
  m.mode = 'ascension'; // sala criada pela opção do Ascensão no menu Jogar
  if (human) addPlayer(m, 'h', 'Ana');
  startMatch(m, 0, 3, 'ascension', true, seeded(seed), { pace: 'short' });
  return m;
}
const run = (m: Match, now: number, cond: () => boolean, rand = seeded(9)) => until(m, now, cond, 60 * 60 * 60, rand);

describe('partida do Ascensão', () => {
  it('start gives fireball, scourge, one new spell and one item to pick, no gold', () => {
    const m = ascMatch(1, true);
    const h = m.players.find((p) => p.id === 'h')!;
    expect([h.spells.fireball, h.items.scourge, h.gold]).toEqual([1, 1, 0]);
    expect(m.asc!.todo.h).toEqual(['spell', 'item']);
    // o intervalo não acaba sem as escolhas dele, nem com o Pronto
    expect(setReady(m, 'h')).toBe(false);
    tickMatch(m, STEP_MS, [], seeded(2));
    expect(m.asc!.offer.h.map((cards) => cards.length)).toEqual([3, 3]);
    const [spellRow, itemRow] = m.asc!.offer.h;
    // escolher não aplica nem fecha a fileira: dá para trocar até o fim do intervalo
    expect(chooseCard(m, 'h', 0, 0)).toBe(true);
    expect(chooseCard(m, 'h', 0, 1)).toBe(true);
    expect(m.asc!.offer.h).toEqual([spellRow, itemRow]);
    expect(h.spells[spellRow[1].id as SpellId]).toBe(0);
    tickMatch(m, 2 * STEP_MS, [], seeded(2));
    expect([m.phase, h.ready]).toEqual(['shop', false]);
    expect(chooseCard(m, 'h', 1, 2)).toBe(true);
    // todos escolheram: mais LAST_CALL_MS para trocar, e só então a escolha vale
    tickMatch(m, 3 * STEP_MS, [], seeded(2));
    expect([m.phase, h.ready, m.phaseEnds]).toEqual(['shop', true, 3 * STEP_MS + LAST_CALL_MS]);
    expect(chooseCard(m, 'h', 0, 2)).toBe(true);
    until(m, 3 * STEP_MS, () => m.phase === 'countdown');
    expect(h.spells[spellRow[1].id as SpellId]).toBe(0);
    expect(h.spells[spellRow[2].id as SpellId]).toBe(1);
    expect(h.items[itemRow[2].id as ItemId]).toBeGreaterThan(0);
  });

  it('time up without a pick: the game picks a random offered card, the same with the same seed, and tells the player (#224)', () => {
    const play = (seed: number) => {
      const m = ascMatch(1, true);
      tickMatch(m, STEP_MS, [], seeded(seed));
      const offer = m.asc!.offer.h;
      run(m, STEP_MS, () => m.phase === 'countdown', seeded(seed));
      const h = m.players.find((p) => p.id === 'h')!;
      const got = offer.map((row) => row.findIndex((c) => (c.kind === 'item' ? h.items[c.id] > 0 && c.id !== 'scourge' : h.spells[c.id] > 0)));
      return { got, auto: publicRoom('R', m, 0).players.find((p) => p.name === 'Ana')!.asc!.auto, offer, spells: { ...h.spells }, items: { ...h.items } };
    };
    const runs = Array.from({ length: 12 }, (_, s) => play(s));
    for (const r of runs) {
      expect(r.got.every((i) => i >= 0)).toBe(true); // nenhuma fileira fica sem carta
      expect(r.auto).toHaveLength(2);
      expect(r.auto).toEqual(expect.arrayContaining(r.got.map((i, row) => r.offer[row][i])));
    }
    expect(new Set(runs.map((r) => r.got[0])).size).toBeGreaterThan(1); // sorteio, não sempre a carta de cima
    const again = play(3);
    expect([again.spells, again.items]).toEqual([runs[3].spells, runs[3].items]);
  });

  it('every break gives one new spell, one item and one spell upgrade per level gained', () => {
    const m = ascMatch(1, true);
    const ids = m.players.map((p) => p.id);
    m.asc!.todo = {};
    m.players[0].stats.round = { ...m.players[0].stats.round, kills: 0, alive: 0, dmgBy: { fireball: xpFor(3) } };
    ascEndRound(m, ids, []);
    expect(m.asc!.todo.h).toEqual(['spell', 'item', 'up', 'up']);
    expect(m.asc!.todo[ids[1]]).toEqual(['spell', 'item']);
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
  }, 30_000); // 9 rodadas inteiras: com a suíte em paralelo passa dos 5 s padrão

  it('bots pick with match rand: same seed, same builds', () => {
    const builds = (m: Match) => m.players.map((p) => JSON.stringify([p.spells, p.items]));
    const a = ascMatch(5);
    const b = ascMatch(5);
    run(a, 0, () => a.phase === 'playing', seeded(4));
    run(b, 0, () => b.phase === 'playing', seeded(4));
    expect(builds(a)).toEqual(builds(b));
    expect(a.players.every((p) => Object.values(p.spells).reduce((x, y) => x + y) + Object.values(p.items).reduce((x, y) => x + y) === 4)).toBe(true);
  });

  it('shop timeout resolves pending picks', () => {
    const m = ascMatch(1, true);
    run(m, 0, () => m.phase === 'countdown');
    expect(m.asc!.todo.h).toEqual([]);
    expect(Object.values(m.players[0].spells).reduce((x, y) => x + y) + Object.values(m.players[0].items).reduce((x, y) => x + y)).toBe(4);
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

  it('the room type is fixed: a normal room never becomes ascension and an ascension room stays ascension', () => {
    const m = newMatch();
    addPlayer(m, 'h', 'Ana');
    startMatch(m, 0, 2, 'ascension', true, seeded(1));
    expect([m.mode, !!m.asc]).toEqual(['rounds', false]);
    expect(startVote(m, 'h', 'mode', 'ascension', 0)).toBe(false);
    const a = ascMatch(1, true);
    expect(startVote(a, 'h', 'mode', 'rounds', 0)).toBe(false);
    expect(a.mode).toBe('ascension');
  });

  it('card outside ascension is ignored', () => {
    const m = newMatch();
    addPlayer(m, 'h', 'Ana');
    startMatch(m, 0, 2, 'rounds', true, seeded(1));
    expect(chooseCard(m, 'h', 0, 0)).toBe(false);
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
    expect(parseClientMessage(JSON.stringify({ t: 'card', slot: 1, i: 2 }))).toEqual({ t: 'card', slot: 1, i: 2 });
    expect(parseClientMessage(JSON.stringify({ t: 'card', slot: 0, i: 0, swap: 'teleport', x: 1 }))).toEqual({ t: 'card', slot: 0, i: 0, swap: 'teleport' });
    for (const bad of [{ i: 3 }, { i: -1 }, { i: 1.5 }, { i: '1' }, { i: 0, swap: 'nada' }, { i: 0, slot: -1 }, { i: 0, slot: 'a' }]) expect(parseClientMessage(JSON.stringify({ t: 'card', slot: 0, ...bad }))).toBeNull();
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
    const rare = drawCards({ spells: { ...noSpells(), teleport: 1, swap: 1, shield: 1, grip: 1, lightning: 1 }, items: noItems() }, 'up', seeded(3), 1);
    expect(rare).toHaveLength(3);
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
    // o item da carta inicial também mexe no empurrão: a marca é o que sobra além dele
    expect(gearOf(m.players[0].items).kbResist - z.kbResist).toBeCloseTo(MARK_KB * 2);
    expect(other.kbResist).toBeCloseTo(gearOf(m.players[2].items).kbResist);
    expect(now).toBeGreaterThan(0);
  });

  it('easy bot picks at random; normal bot fills missing defense first', () => {
    const p = { ...ascMatch(1).players[1], spells: { ...noSpells(), teleport: 1 } };
    const cards: Card[] = [{ kind: 'item', id: 'boots' }, { kind: 'spell', id: 'lightning' }, { kind: 'spell', id: 'shield' }];
    expect(autoPick(p, cards, 'normal', seeded(1))).toBe(2);
    const seen = new Set(Array.from({ length: 50 }, (_, s) => autoPick(p, cards, 'easy', seeded(s))));
    expect(seen.size).toBe(3);
  });

  it('full bar: new spell row can be kept, and the automatic pick keeps instead of swapping', () => {
    const m = ascMatch(1, true);
    const h = m.players.find((q) => q.id === 'h')!;
    h.spells = { ...noSpells(), lightning: 1, homing: 1, shield: 1, teleport: 1, swap: 3 };
    expect(autoPick(h, [{ kind: 'spell', id: 'grip' }, { kind: 'spell', id: 'meteor' }], 'normal', seeded(1))).toBe(-1);
    tickMatch(m, STEP_MS, [], seeded(2));
    expect(m.asc!.todo.h).toEqual(['spell', 'item']);
    expect(chooseCard(m, 'h', 1, -1)).toBe(false); // a fileira do item não se recusa
    expect(chooseCard(m, 'h', 0, -1)).toBe(true);
    // magia nova com a barra cheia pede a que sai
    expect(chooseCard(m, 'h', 0, 0)).toBe(false);
    expect(chooseCard(m, 'h', 0, 0, 'meteor')).toBe(false);
    expect(chooseCard(m, 'h', 0, 0, 'swap')).toBe(true);
    expect(chooseCard(m, 'h', 0, -1)).toBe(true);
    expect(m.asc!.pick.h[0]).toEqual({ i: -1 });
    // tempo esgotado: mantém as magias e pega o item de cima
    const n = newMatch();
    n.mode = 'ascension';
    addPlayer(n, 'h', 'Ana');
    startMatch(n, 0, 3, 'ascension', true, seeded(1), { pace: 'short' });
    const g = n.players.find((q) => q.id === 'h')!;
    g.spells = { ...noSpells(), lightning: 1, homing: 1, shield: 1, teleport: 1, swap: 3 };
    run(n, 0, () => n.phase === 'countdown');
    expect(g.spells.swap).toBe(3);
    expect(Object.values(g.items).reduce((x, y) => x + y)).toBe(2);
  });

  it('swap with a full bar: the new spell keeps the level of the one that leaves', () => {
    const p = mage({ lightning: 1, homing: 1, shield: 1, teleport: 1, swap: 4 });
    expect(applyCard(p, { kind: 'spell', id: 'grip' }, 'swap')).toBe(true);
    expect([p.spells.grip, p.spells.swap]).toEqual([4, 0]);
  });

  it('keep message parses only with a valid slot', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'keep', slot: 0 }))).toEqual({ t: 'keep', slot: 0 });
    for (const slot of [-1, 1.5, 'a', 20]) expect(parseClientMessage(JSON.stringify({ t: 'keep', slot }))).toBeNull();
  });
});

describe('sala gravada por uma versão anterior do Ascensão', () => {
  it('resume of an older ascension state does not crash the room', () => {
    const m = ascMatch(3, true);
    run(m, 0, () => m.round === 1 && m.phase === 'playing');
    // formato da versão anterior: sem as escolhas marcadas e com a mesa de uma fileira só
    const old = JSON.parse(JSON.stringify({ ...m, world: null }));
    old.asc = { xp: old.asc.xp, picks: { h: 1 }, offer: { h: [{ kind: 'item', id: 'boots' }] }, fallen: [], extra: {}, rerolls: {} };
    resume(old, 1000);
    expect(() => {
      publicRoom('SALA', old, 1000);
      until(old, 1000, () => old.phase === 'playing');
      publicRoom('SALA', old, 2000);
    }).not.toThrow();
    expect(old.phase).toBe('playing');
  });
});

describe('Febre arcana', () => {
  it('gold rush effect gives 50% more XP in ascension', () => {
    const gainWith = (effect: 'gold' | null) => {
      const m = ascMatch(1, true);
      run(m, 0, () => m.phase === 'playing');
      m.world!.mods = { ...m.world!.mods, gold: effect ? ROUND_EFFECTS.gold.gold! : 1 };
      const ids = m.players.map((p) => p.id);
      for (const p of m.players) p.stats.round = { ...p.stats.round, dmgBy: { fireball: 400 }, dmg: 400, kills: 0, alive: 0 };
      m.players.forEach((p) => (m.asc!.xp[p.id] = 0));
      ascEndRound(m, ids, []);
      return m.asc!.xp.h;
    };
    expect(gainWith('gold')).toBe(Math.round(gainWith(null) * 1.5));
  });
});

describe('sala do Ascensão: o dono escolhe, todos veem', () => {
  // como a sala nasce no servidor (room-do.ts init)
  const ascRoom = () => Object.assign(newMatch(), { mode: 'ascension' as const, lobby: { owner: null, bots: [], opts: {} } });

  it('the first human is the owner and only the owner changes bots and options', () => {
    const m = ascRoom();
    addPlayer(m, 'bot-1', 'Bot', true);
    addPlayer(m, 'ana', 'Ana');
    addPlayer(m, 'bia', 'Bia');
    expect(m.lobby!.owner).toBe('ana');
    expect(setAscLobby(m, 'bia', ['hard'], { pace: 'short' })).toBe(false);
    expect(setAscLobby(m, 'ana', ['easy', 'hard'], { pace: 'short' })).toBe(true);
    expect(m.lobby).toEqual({ owner: 'ana', bots: ['easy', 'hard'], opts: { pace: 'short' } });
  });

  it('everyone sees the owner and the choices, the owner by public id', () => {
    const m = ascRoom();
    addPlayer(m, 'ana', 'Ana');
    setAscLobby(m, 'ana', ['casual'], { pace: 'short' });
    const r = publicRoom('ROOM', m, 0);
    expect(r.lobby).toEqual({ owner: r.players[0].id, bots: ['casual'], opts: { pace: 'short' } });
    expect(r.lobby!.owner).not.toBe('ana');
  });

  it('the owner leaving the room passes it to the next human', () => {
    const m = ascRoom();
    addPlayer(m, 'ana', 'Ana');
    addPlayer(m, 'bia', 'Bia');
    removePlayer(m, 'ana');
    expect(m.lobby!.owner).toBe('bia');
    removePlayer(m, 'bia');
    expect(m.lobby!.owner).toBe(null);
    addPlayer(m, 'cai', 'Cai');
    expect(m.lobby!.owner).toBe('cai');
  });

  it('a new owner is preferably a human who plays and is connected', () => {
    const m = ascRoom();
    addPlayer(m, 'ana', 'Ana');
    addPlayer(m, 'bia', 'Bia', false, true); // só assiste
    addPlayer(m, 'cai', 'Cai');
    removePlayer(m, 'ana');
    expect(m.lobby!.owner).toBe('cai');
  });

  it("start uses the owner's bots and options, whoever presses it", () => {
    const m = ascRoom();
    addPlayer(m, 'ana', 'Ana');
    addPlayer(m, 'bia', 'Bia');
    setAscLobby(m, 'ana', ['easy', 'hard'], { pace: 'short' });
    expect(startMatch(m, 0, 0, 'rounds', true, seeded(1), { pace: 'long' })).toBe(true);
    expect(m.mode).toBe('ascension');
    expect(m.opts.pace).toBe('short');
    expect(m.players.filter((p) => p.bot).map((p) => p.difficulty)).toEqual(['easy', 'hard']);
    expect(setAscLobby(m, 'ana', [], {})).toBe(false); // com a partida rolando, nada muda
  });

  it('lobby message only with valid difficulties and options', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'lobby', bots: ['easy'], opts: { pace: 'short' } }))).toEqual({ t: 'lobby', bots: ['easy'], opts: { pace: 'short' } });
    expect(parseClientMessage(JSON.stringify({ t: 'lobby', bots: ['god'], opts: {} }))).toBe(null);
    expect(parseClientMessage(JSON.stringify({ t: 'lobby', bots: [], opts: { pace: 'forever' } }))).toBe(null);
    expect(parseClientMessage(JSON.stringify({ t: 'lobby', bots: Array(8).fill('easy'), opts: {} }))).toBe(null);
  });

  it('ascension rooms saved before the owner get one on resume', () => {
    const m = Object.assign(newMatch(), { mode: 'ascension' as const });
    addPlayer(m, 'ana', 'Ana');
    resume(m, 0);
    expect(m.lobby?.owner).toBe('ana');
  });
});

describe('final valendo mais', () => {
  it('rounds 6 and 7 are worth 1.5x points (rounded) and rounds 8 and 9 double', () => {
    expect([1, 5, 6, 7, 8, 9].map(roundMult)).toEqual([1, 1, 1.5, 1.5, 2, 2]);
    const pointsAt = (round: number) => {
      const m = ascMatch(1, true);
      m.round = round;
      const ids = m.players.map((p) => p.id);
      m.asc!.fallen = ids.slice(0, 3);
      m.players.forEach((p) => (p.score = 0));
      ascEndRound(m, ids, [ids[3]]);
      return m.players.map((p) => p.score);
    };
    const base = pointsAt(5);
    expect(base.some((x) => x > 1)).toBe(true);
    expect(pointsAt(1)).toEqual(base);
    expect(pointsAt(6)).toEqual(base.map((x) => Math.round(x * 1.5)));
    expect(pointsAt(7)).toEqual(pointsAt(6));
    expect(pointsAt(8)).toEqual(base.map((x) => x * 2));
    expect(pointsAt(9)).toEqual(pointsAt(8));
    expect(pointsAt(6).every(Number.isInteger)).toBe(true);
  });
});

describe('barra de XP na arena', () => {
  it('live level adds the round damage, kills and seconds alive to the match XP', () => {
    expect(liveLevel(0, 0, 0, 0)).toEqual({ level: 1, total: 0, next: xpFor(2), frac: 0 });
    const r = liveLevel(xpFor(2) - 150, 30, 1, 10); // 30 de dano + 1 abate + 10 s vivo = 150 XP: fecha o nível 2
    expect([r.level, r.total, r.frac]).toEqual([2, xpFor(2), 0]);
    expect(liveLevel(0, 0, 1, 0).total).toBe(KILL_XP);
    expect(liveLevel(0, 0, 0, 0).frac).toBeLessThan(liveLevel(0, 100, 0, 0).frac);
  });
});
