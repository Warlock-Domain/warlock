import { describe, expect, it } from 'vitest';
import { botBuy, botCmds } from '../src/shared/bots.ts';
import { ARENA_R0, COUNTDOWN_MS, DT, KILL_GOLD, ROUND_END_MS, ROUND_GOLD, SHOP_MS, START_GOLD, WIN_GOLD, WINS_TO_WIN } from '../src/shared/constants.ts';
import { SPELLS } from '../src/shared/spells.ts';
import { addPlayer, buy, endIdle, kick, newMatch, removePlayer, setCharacter, setReady, shouldRun, startMatch, tickMatch, type Match } from '../src/shared/match.ts';
import { newWorld } from '../src/shared/sim.ts';
import { noItems } from '../src/shared/items.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';

const STEP_MS = DT * 1000;

function twoPlayers(): Match {
  const m = newMatch();
  addPlayer(m, 'a', 'Ana');
  addPlayer(m, 'b', 'Bia');
  startMatch(m, 0, 0);
  return m;
}

// avança a partida em passos de simulação até a condição, com um limite de segurança
function until(m: Match, now: number, cond: () => boolean, limit = 60 * 600): number {
  for (let i = 0; i < limit && !cond(); i++) {
    now += STEP_MS;
    tickMatch(m, now, [], () => 0.5);
  }
  return now;
}

function toPlaying(m: Match, now: number): number {
  for (const p of m.players) setReady(m, p.id);
  now = until(m, now, () => m.phase === 'countdown');
  return until(m, now, () => m.phase === 'playing');
}

const kill = (m: Match, id: string, by: string | null) => {
  const wz = m.world!.wizards.find((z) => z.id === id)!;
  wz.hp = 0.01;
  wz.lastHitBy = by;
  wz.lastHitAt = m.world!.t;
  wz.pos = v(ARENA_R0 + 3, 0);
};

describe('partida', () => {
  it('needs two players to start', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    expect(startMatch(m, 0, 0)).toBe(false);
    expect(startMatch(m, 0, 2)).toBe(true);
    expect(m.players.filter((p) => p.bot).length).toBe(2);
  });

  it('last alive gets 1 point', () => {
    const m = twoPlayers();
    let now = toPlaying(m, 0);
    kill(m, 'b', null);
    now = until(m, now, () => m.phase === 'roundEnd');
    expect(m.players.find((p) => p.id === 'a')!.score).toBe(1);
    expect(m.lastRoundWinner).toBe('a');
  });

  it('kill gives no points', () => {
    const m = twoPlayers();
    addPlayer(m, 'c', 'Caio');
    const now = toPlaying(m, 0);
    kill(m, 'b', 'a');
    until(m, now, () => !m.world!.wizards[1].alive);
    expect(m.players.find((p) => p.id === 'a')!.score).toBe(0);
  });

  it('kill gives gold to the killer, with a live event over them', () => {
    const m = twoPlayers();
    addPlayer(m, 'c', 'Caio');
    let now = toPlaying(m, 0);
    const before = m.players.find((p) => p.id === 'a')!.gold;
    kill(m, 'b', 'a');
    let ev: unknown;
    for (let i = 0; i < 600 && !ev; i++) ev = tickMatch(m, (now += STEP_MS), [], () => 0.5).find((e) => e.k === 'gold');
    expect(ev).toMatchObject({ k: 'gold', id: 'a', n: KILL_GOLD });
    expect(m.players.find((p) => p.id === 'a')!.gold).toBe(before + KILL_GOLD);
  });

  it('if the last ones die together, the one with more hp wins', () => {
    const m = twoPlayers();
    const now = toPlaying(m, 0);
    kill(m, 'a', null);
    kill(m, 'b', null);
    m.world!.wizards[1].hp = 0.05;
    until(m, now, () => m.phase === 'roundEnd');
    expect(m.lastRoundWinner).toBe('b');
  });

  it('kick removes bots and dropped players, never connected people', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    startMatch(m, 0, 2);
    expect(kick(m, 'a')).toBe(false);
    expect(kick(m, 'bot-1')).toBe(true);
    expect(m.players.some((p) => p.id === 'bot-1')).toBe(false);
    addPlayer(m, 'c', 'Caio');
    removePlayer(m, 'c');
    expect(kick(m, 'c')).toBe(true);
  });

  it('idle match is closed', () => {
    const m = twoPlayers();
    toPlaying(m, 0);
    m.players[0].score = 2;
    endIdle(m);
    expect(m.phase).toBe('end');
    expect(m.winner).toBe('a');
  });

  it('first to WINS_TO_WIN rounds wins the match', () => {
    const m = twoPlayers();
    let now = 0;
    for (let r = 0; r < WINS_TO_WIN + 2; r++) {
      now = toPlaying(m, now);
      kill(m, 'b', null);
      now = until(m, now, () => m.phase === 'roundEnd');
      now = until(m, now, () => m.phase !== 'roundEnd');
      if (m.phase === 'end') break;
    }
    expect(m.phase).toBe('end');
    expect(m.winner).toBe('a');
    expect(m.players[0].score).toBe(WINS_TO_WIN);
    expect(m.round).toBe(WINS_TO_WIN);
  });

  it('buy deducts gold and caps at level 7', () => {
    const m = twoPlayers();
    m.players[0].gold = 200;
    expect(buy(m, 'a', 'lightning')).toBe(true);
    expect(m.players[0].gold).toBe(200 - SPELLS.lightning.cost);
    for (let i = 0; i < 6; i++) expect(buy(m, 'a', 'lightning')).toBe(true);
    expect(buy(m, 'a', 'lightning')).toBe(false);
    expect(m.players[0].spells.lightning).toBe(7);
    expect(m.players[0].gold).toBe(200 - SPELLS.lightning.cost - SPELLS.lightning.up.reduce((a, b) => a + b, 0));
  });

  it('cannot buy without gold or outside the shop', () => {
    const m = twoPlayers();
    m.players[0].gold = 5;
    expect(buy(m, 'a', 'shield')).toBe(false);
    m.players[0].gold = 50;
    toPlaying(m, 0);
    expect(buy(m, 'a', 'shield')).toBe(false);
  });

  it('shop ends early when all ready', () => {
    const m = twoPlayers();
    setReady(m, 'a');
    tickMatch(m, 1, []);
    expect(m.phase).toBe('shop');
    setReady(m, 'b');
    tickMatch(m, 2, []);
    expect(m.phase).toBe('countdown');
  });

  it('shop ends by time', () => {
    const m = twoPlayers();
    tickMatch(m, SHOP_MS + 1, []);
    expect(m.phase).toBe('countdown');
    tickMatch(m, SHOP_MS + COUNTDOWN_MS + 2, []);
    expect(m.phase).toBe('playing');
  });

  it('late joiner waits for next shop', () => {
    const m = twoPlayers();
    let now = toPlaying(m, 0);
    addPlayer(m, 'c', 'Caio');
    expect(m.world!.wizards.some((z) => z.id === 'c')).toBe(false);
    kill(m, 'b', null);
    now = until(m, now, () => m.phase === 'shop');
    expect(m.players.find((p) => p.id === 'c')!.gold).toBe(START_GOLD + 0);
    toPlaying(m, now);
    expect(m.world!.wizards.some((z) => z.id === 'c')).toBe(true);
  });

  it('disconnect keeps the player during the match', () => {
    const m = twoPlayers();
    removePlayer(m, 'b');
    expect(m.players.length).toBe(2);
    expect(m.players[1].connected).toBe(false);
    tickMatch(m, 1, []);
    expect(m.phase).toBe('shop'); // 'a' ainda não clicou pronto
    setReady(m, 'a');
    tickMatch(m, 2, []);
    expect(m.phase).toBe('countdown');
  });

  it('round gold is paid to everyone', () => {
    const m = twoPlayers();
    const now = toPlaying(m, 0);
    kill(m, 'b', null);
    until(m, now, () => m.phase === 'roundEnd');
    expect(m.players[0].gold).toBe(START_GOLD + ROUND_GOLD + WIN_GOLD);
    expect(m.players[1].gold).toBe(START_GOLD + ROUND_GOLD);
    expect(ROUND_END_MS).toBeGreaterThan(0);
  });

  it('character can change in lobby and shop, not during a round', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    expect(m.players[0].character).toBe('mage');
    expect(setCharacter(m, 'a', 'knight')).toBe(true);
    startMatch(m, 0, 2);
    expect(setCharacter(m, 'a', 'skeleton_mage')).toBe(true);
    const bots = m.players.filter((p) => p.bot).map((p) => p.character);
    expect(new Set(bots).size).toBe(bots.length);
    toPlaying(m, 0);
    expect(setCharacter(m, 'a', 'rogue')).toBe(false);
    expect(m.players[0].character).toBe('skeleton_mage');
  });

  it('loop stops without humans', () => {
    const m = twoPlayers();
    expect(shouldRun(m, 1)).toBe(true);
    expect(shouldRun(m, 0)).toBe(false);
    expect(shouldRun(newMatch(), 3)).toBe(false);
  });
});

describe('bots', () => {
  it('bot buys cheapest missing spell', () => {
    expect(botBuy({ gold: 11, spells: noSpells(), items: noItems() })).toEqual({ kind: 'spell', id: 'lightning' });
    // sem dinheiro para magia nova: compra armadura (6) antes de melhorar a bola de fogo (7)
    expect(botBuy({ gold: 10, spells: noSpells(), items: noItems() })).toEqual({ kind: 'item', id: 'armor' });
    expect(botBuy({ gold: 2, spells: noSpells(), items: noItems() })).toBeNull();
  });

  it('bot walks inward when near edge', () => {
    const w = newWorld(['bot', 'x'], { bot: noSpells(), x: noSpells() });
    w.wizards[0].pos = v(ARENA_R0 - 0.5, 0);
    w.wizards[0].cd.fireball = 99;
    const move = botCmds(w, 'bot', () => 0.5).find((c) => c.kind === 'move');
    expect(move && move.kind === 'move' && move.to.x < ARENA_R0 - 2).toBe(true);
  });

  it('bot casts fireball at nearest enemy', () => {
    const w = newWorld(['bot', 'near', 'far'], { bot: noSpells(), near: noSpells(), far: noSpells() });
    w.wizards[0].pos = v(0, 0);
    w.wizards[1].pos = v(4, 0);
    w.wizards[2].pos = v(-6, 0);
    const cast = botCmds(w, 'bot', () => 0.3).find((c) => c.kind === 'cast');
    expect(cast && cast.kind === 'cast' && cast.spell === 'fireball' && cast.at.x > 2).toBe(true);
  });
});
