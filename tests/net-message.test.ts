import { describe, expect, it, vi } from 'vitest';
import { newMatch, addPlayer } from '../src/shared/match.ts';
import { newWorld } from '../src/shared/sim.ts';
import { publicRoom } from '../src/shared/protocol.ts';
import { encodeSnap } from '../src/shared/snapshot.ts';
import { SPELL_IDS } from '../src/shared/spells.ts';
import { decodeMessage, parseLobbyMessage, parseServerMessage } from '../src/client/net-message.ts';

const snap = () => ({ t: 'snap', time: 1, r: 10, s: 0, w: [0, 0, 0, 0, 100, 0, 0], p: [], cd: Array(SPELL_IDS.length).fill(0), sp: 1, pl: [], ack: 0 });

describe('decodificação das mensagens recebidas', () => {
  it('aceita lista de salas válida e rejeita envelopes ou entradas inválidas', () => {
    expect(parseLobbyMessage({ t: 'rooms', rooms: [{ id: 'ABCD', players: 0, phase: 'lobby' }] })).toEqual({ t: 'rooms', rooms: [{ id: 'ABCD', players: 0, phase: 'lobby' }] });
    expect(parseLobbyMessage({ t: 'rooms', rooms: [{ id: 'ABCD', players: -1, phase: 'lobby' }] })).toBeNull();
    expect(parseLobbyMessage({ t: 'room', rooms: [] })).toBeNull();
  });

  it('aceita snapshots compactos sem copiar os vetores e rejeita comprimentos quebrados', () => {
    const valid = snap();
    expect(parseServerMessage(valid)).toBe(valid);
    expect(parseServerMessage({ ...valid, w: [0, 0] })).toBeNull();
    expect(parseServerMessage({ ...valid, cd: [] })).toBeNull();
    expect((parseServerMessage({ ...valid, e: [{ k: 'not-an-event' }] }) as { e?: unknown[] }).e).toEqual([]);
  });

  it('aceita snapshots produzidos pelo servidor e descarta eventos cosméticos desconhecidos', () => {
    const match = newMatch();
    addPlayer(match, 'player', 'Ana');
    addPlayer(match, 'other', 'Bia');
    const spells = Object.fromEntries(match.players.map((player) => [player.id, player.spells]));
    const items = Object.fromEntries(match.players.map((player) => [player.id, player.items]));
    const world = newWorld(['player', 'other'], spells, items, 0, () => 0.5);
    const encoded = encodeSnap(world, 'player', 7, [{ k: 'sudden' }]);
    expect(parseServerMessage(encoded)).toBe(encoded);
    const withUnknownEvent = { ...encoded, e: [...encoded.e!, { k: 'new_cosmetic' }] };
    const decoded = parseServerMessage(withUnknownEvent);
    expect(decoded).not.toBeNull();
    expect((decoded as typeof encoded).e).toEqual([{ k: 'sudden' }]);
    expect(parseServerMessage({ t: 'room', room: publicRoom('ABCD', match, 0), you: 'player' })).not.toBeNull();
  });

  it('valida o estado público da sala e mensagens pequenas', () => {
    const match = newMatch();
    addPlayer(match, 'player', 'Ana');
    const room = publicRoom('ABCD', match, 0);
    expect(parseServerMessage({ t: 'room', room, you: 'player' })).not.toBeNull();
    expect(parseServerMessage({ t: 'room', room: { ...room, players: [{ ...room.players[0], stats: null }] }, you: 'player' })).toBeNull();
    expect(parseServerMessage({ t: 'error', code: 'not_found', msg: 'missing' })).not.toBeNull();
    expect(parseServerMessage({ t: 'error', code: 'unexpected', msg: 'bad' })).toBeNull();
    expect(parseServerMessage({ t: 'taunt', id: 'p1', i: 0 })).not.toBeNull();
    expect(parseServerMessage({ t: 'other' })).toBeNull();
  });

  it('ignora JSON inválido, binário e mensagens que o canal não reconhece', () => {
    expect(decodeMessage('{bad', parseServerMessage)).toBeNull();
    expect(decodeMessage(new ArrayBuffer(2), parseServerMessage)).toBeNull();
    expect(decodeMessage('{"t":"rooms","rooms":[]}', parseServerMessage)).toBeNull();
    expect(decodeMessage('{"t":"rooms","rooms":[]}', parseLobbyMessage)).toEqual({ t: 'rooms', rooms: [] });
  });

  it('informa uma única vez por mensagem inválida através do callback do decodificador', () => {
    const onInvalid = vi.fn();
    expect(decodeMessage('{"t":"unexpected"}', parseServerMessage, onInvalid)).toBeNull();
    expect(decodeMessage('{"t":"unexpected"}', parseServerMessage, onInvalid)).toBeNull();
    expect(onInvalid).toHaveBeenCalledTimes(2); // connect limita o aviso a uma ocorrência por tipo.
    expect(onInvalid).toHaveBeenCalledWith('unexpected', 'schema validation failed');
  });
});
