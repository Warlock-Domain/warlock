import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, MAX_WATCHERS } from '../src/shared/constants.ts';
import { addPlayer, buy, newMatch, playing, setReady, setWatch, startMatch, tickMatch, type Match } from '../src/shared/match.ts';
import { parseClientMessage, publicRoom } from '../src/shared/protocol.ts';
import { kill, STEP_MS, toPlaying, until } from './helpers.ts';

const inWorld = (m: Match) => m.world!.wizards.map((z) => z.id);
// joga a rodada até a próxima começar (mata os outros para 'a' vencer a atual)
function nextRound(m: Match, now: number, winner: string): number {
  for (const z of m.world!.wizards) if (z.id !== winner) kill(m, z.id, winner);
  now = until(m, now, () => m.phase === 'shop');
  return toPlaying(m, now);
}

describe('espectador', () => {
  it('entra assistindo: sem mago, não segura a loja e dá para assistir só os bots', () => {
    const m = newMatch();
    expect(addPlayer(m, 'a', 'Ana', false, true)).toBe(true);
    expect(startMatch(m, 0, 3)).toBe(true);
    expect(m.phase).toBe('shop');
    // ninguém em campo precisa apertar Pronto: a loja acaba no passo seguinte
    tickMatch(m, STEP_MS, []);
    expect(m.phase).toBe('countdown');
    expect(inWorld(m)).not.toContain('a');
    expect(inWorld(m)).toHaveLength(3);
  });

  it('virar espectador vale na próxima rodada e guarda pontos, ouro e compras; voltar também', () => {
    const m = newMatch();
    addPlayer(m, 'a', 'Ana');
    addPlayer(m, 'b', 'Bia');
    startMatch(m, 0, 1);
    m.players[0].gold = 100;
    buy(m, 'a', 'lightning');
    let now = toPlaying(m, 0);
    expect(setWatch(m, 'a', true)).toBe(true);
    expect(setWatch(m, 'a', true)).toBe(false); // já está assistindo
    // a rodada atual continua com o mago dele
    expect(inWorld(m)).toContain('a');
    now = nextRound(m, now, 'a');
    const a = m.players.find((p) => p.id === 'a')!;
    expect(inWorld(m)).not.toContain('a');
    expect([a.score, a.spells.lightning]).toEqual([1, 1]);
    const gold = a.gold;
    // assistindo não ganha ouro nem ponto
    now = nextRound(m, now, 'b');
    expect([a.score, a.gold]).toEqual([1, gold]);
    expect(setWatch(m, 'a', false)).toBe(true);
    nextRound(m, now, 'b');
    expect(inWorld(m)).toContain('a');
    expect(m.world!.wizards.find((z) => z.id === 'a')!.spells.lightning).toBe(1);
  });

  it('não ocupa vaga: com 8 magos, quem chega entra assistindo e só volta quando abrir vaga', () => {
    const m = newMatch();
    for (let i = 0; i < MAX_PLAYERS; i++) addPlayer(m, 'p' + i, 'P' + i);
    expect(addPlayer(m, 'x', 'Xis')).toBe(true);
    expect(m.players.find((p) => p.id === 'x')!.watch).toBe(true);
    expect(playing(m)).toHaveLength(MAX_PLAYERS);
    expect(setWatch(m, 'x', false)).toBe(false); // sem vaga
    expect(setWatch(m, 'p0', true)).toBe(true);
    expect(setWatch(m, 'x', false)).toBe(true);
    // a cor de quem volta não repete a de ninguém em campo
    expect(new Set(playing(m).map((p) => p.color)).size).toBe(MAX_PLAYERS);
    // espectadores têm limite próprio; bot nunca entra assistindo
    for (let i = 0; i < MAX_WATCHERS - 1; i++) addPlayer(m, 'w' + i, 'W' + i, false, true);
    expect(addPlayer(m, 'p0b', 'Mais um')).toBe(false);
    expect(addPlayer(m, 'bot-9', 'Bot', true)).toBe(false);
  });

  it('o limite de espectadores vale também com vaga de mago livre', () => {
    const m = newMatch();
    for (let i = 0; i < MAX_WATCHERS; i++) expect(addPlayer(m, 'w' + i, 'W' + i, false, true)).toBe(true);
    // pediu para assistir com os espectadores no limite: entra jogando
    expect(addPlayer(m, 'a', 'Ana', false, true)).toBe(true);
    expect(m.players.find((p) => p.id === 'a')!.watch).toBeUndefined();
    // e o botão Assistir não passa do limite
    expect(setWatch(m, 'a', true)).toBe(false);
    expect(playing(m).map((p) => p.id)).toEqual(['a']);
  });

  it('nos Times, quem assiste fica fora do sorteio e quem volta entra no time menor', () => {
    const m = newMatch();
    for (const id of ['a', 'b', 'c']) addPlayer(m, id, id);
    startMatch(m, 0, 1, 'teams', false);
    expect(setWatch(m, 'c', true)).toBe(true);
    expect(m.players.find((p) => p.id === 'c')!.team).toBeNull();
    let now = toPlaying(m, 0);
    for (const p of m.players) setReady(m, p.id);
    now = nextRound(m, now, 'a');
    expect(m.players.find((p) => p.id === 'c')!.team).toBeNull();
    setWatch(m, 'c', false);
    nextRound(m, now, 'a');
    const sizes = [0, 1].map((t) => playing(m).filter((p) => p.team === t).length);
    expect(sizes.sort()).toEqual([2, 2]);
  });

  it('a mensagem é validada e a sala mostra quem assiste', () => {
    const p = (o: unknown) => parseClientMessage(JSON.stringify(o));
    expect(p({ t: 'watch', on: true })).toEqual({ t: 'watch', on: true });
    expect(p({ t: 'hello', playerId: 'abcdefgh', name: 'Ana', watch: true })).toEqual({ t: 'hello', playerId: 'abcdefgh', name: 'Ana', watch: true });
    expect(p({ t: 'hello', playerId: 'abcdefgh', name: 'Ana', watch: false })).toEqual({ t: 'hello', playerId: 'abcdefgh', name: 'Ana' });
    for (const bad of [{ t: 'watch' }, { t: 'watch', on: 'sim' }, { t: 'hello', playerId: 'abcdefgh', name: 'Ana', watch: 1 }]) expect(p(bad)).toBeNull();
    const m = newMatch();
    addPlayer(m, 'a', 'Ana', false, true);
    addPlayer(m, 'b', 'Bia');
    expect(publicRoom('ROOM', m, 0).players.map((q) => q.watch)).toEqual([true, undefined]);
  });
});
