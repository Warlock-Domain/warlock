import { describe, expect, it } from 'vitest';
import { botBuy, botCmds } from '../src/shared/bots.ts';
import { ARENA_R0, COUNTDOWN_MS, DT, ROUND_END_MS, ROUND_GOLD, SHOP_MS, START_GOLD, WIN_GOLD, WINS_TO_WIN } from '../src/shared/constants.ts';
import { SPELLS } from '../src/shared/spells.ts';
import { addPlayer, buy, newMatch, removePlayer, setCharacter, setReady, shouldRun, startMatch, tickMatch, type Match } from '../src/shared/match.ts';
import { newWorld } from '../src/shared/sim.ts';
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

  it('simultaneous death ends round with no winner', () => {
    const m = twoPlayers();
    const now = toPlaying(m, 0);
    kill(m, 'a', null);
    kill(m, 'b', null);
    until(m, now, () => m.phase === 'roundEnd');
    expect(m.lastRoundWinner).toBeNull();
    expect(m.players.every((p) => p.score === 0)).toBe(true);
  });

  it('first to WINS_TO_WIN rounds wins the match', () => {
    const m = twoPlayers();
    let now = 0;
    for (let r = 0; r < WINS_TO_WIN + 2; r++) {
      now = toPlaying(m, now);
      // a primeira rodada fica sem vencedor (os dois morrem); depois só a Ana vence
      kill(m, 'b', null);
      if (r === 0) kill(m, 'a', null);
      now = until(m, now, () => m.phase === 'roundEnd');
      now = until(m, now, () => m.phase !== 'roundEnd');
      if (m.phase === 'end') break;
    }
    expect(m.phase).toBe('end');
    expect(m.winner).toBe('a');
    expect(m.players[0].score).toBe(WINS_TO_WIN);
    expect(m.round).toBe(WINS_TO_WIN + 1);
  });

  it('buy deducts gold and caps level 3', () => {
    const m = twoPlayers();
    m.players[0].gold = 100;
    expect(buy(m, 'a', 'lightning')).toBe(true);
    expect(m.players[0].gold).toBe(100 - SPELLS.lightning.cost);
    expect(buy(m, 'a', 'lightning')).toBe(true);
    expect(buy(m, 'a', 'lightning')).toBe(true);
    expect(buy(m, 'a', 'lightning')).toBe(false);
    expect(m.players[0].spells.lightning).toBe(3);
    expect(m.players[0].gold).toBe(100 - SPELLS.lightning.cost - SPELLS.lightning.up[0] - SPELLS.lightning.up[1]);
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
    expect(botBuy({ gold: 11, spells: noSpells() })).toBe('lightning');
    expect(botBuy({ gold: 10, spells: noSpells() })).toBe('fireball');
    expect(botBuy({ gold: 6, spells: noSpells() })).toBeNull();
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
