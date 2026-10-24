import { afterEach, describe, expect, it, vi } from 'vitest';
import { addPlayer, castBallot, newMatch, resume, sandboxCmd, setWatch, startMatch, startVote, tickMatch } from '../src/shared/match.ts';
import { mulberry32 } from '../src/shared/rng.ts';
import { toPlaying } from './helpers.ts';

afterEach(() => vi.restoreAllMocks());
const forbidAmbientRandom = () => vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Sorteio fora da dependência recebida'); });

describe('sorteio explícito nas transições da partida', () => {
  it('começa, passa de rodada, retoma e reinicia por votação sem sorteio global', () => {
    forbidAmbientRandom();
    const rand = mulberry32(7), m = newMatch();
    addPlayer(m, 'a', 'Ana');
    addPlayer(m, 'b', 'Bia');
    expect(startMatch(m, 0, 2, 'rounds', true, rand)).toBe(true);
    let now = toPlaying(m, 0, rand);
    m.phase = 'roundEnd';
    m.phaseEnds = now;
    tickMatch(m, now, [], rand);
    expect(m.phase).toBe('shop');
    now = toPlaying(m, now, rand);
    resume(m, now, rand);
    expect(m.phase).toBe('shop');
    expect(startVote(m, 'a', 'restart', '', now, rand)).toBe(true);
    expect(castBallot(m, 'b', true, now, rand)).toBe(true);
    expect(m.round).toBe(0);
    expect(m.vote).toBeNull();
    expect(startVote(m, 'a', 'addBot', '', now, rand)).toBe(true);
    expect(castBallot(m, 'b', true, now, rand)).toBe(true);
    toPlaying(m, now, rand);
    expect(m.players.filter((p) => p.bot)).toHaveLength(3);
  });

  it('sandbox sorteia pelo argumento ao entrar, voltar, criar bot, runa e arena', () => {
    forbidAmbientRandom();
    const rand = mulberry32(11), m = newMatch();
    addPlayer(m, 'a', 'Ana');
    expect(startMatch(m, 0, 0, 'rounds', true, rand, {}, [], true)).toBe(true);
    const now = toPlaying(m, 0, rand);
    expect(addPlayer(m, 'b', 'Bia', false, false, rand)).toBe(true);
    expect(setWatch(m, 'b', true, rand)).toBe(true);
    expect(setWatch(m, 'b', false, rand)).toBe(true);
    expect(sandboxCmd(m, { op: 'bot' }, now, 'a', rand)).toBe(true);
    expect(sandboxCmd(m, { op: 'turret', direction: 'east' }, now, 'a', rand)).toBe(true);
    sandboxCmd(m, { op: 'rune', kind: 'haste' }, now, 'a', rand);
    expect(sandboxCmd(m, { op: 'arena', arena: 'islands' }, now, 'a', rand)).toBe(true);
    expect(sandboxCmd(m, { op: 'restart' }, now, 'a', rand)).toBe(true);
  });

  it('mesma semente produz as mesmas compras e eventos com fontes globais diferentes', () => {
    const run = (ambient: number) => {
      vi.spyOn(Math, 'random').mockReturnValue(ambient);
      const rand = mulberry32(7), m = newMatch();
      startMatch(m, 0, 4, 'rounds', true, rand);
      const events = [];
      for (let i = 1; i <= 4000; i++) events.push(tickMatch(m, i * 1000 / 60, [], rand));
      return JSON.stringify({ m, events });
    };
    expect(run(0.1)).toBe(run(0.9));
  });
});
