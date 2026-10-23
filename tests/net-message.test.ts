import { describe, expect, it } from 'vitest';
import { newMatch, addPlayer } from '../src/shared/match.ts';
import { publicRoom } from '../src/shared/protocol.ts';
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
    expect(parseServerMessage({ ...valid, e: [{ k: 'not-an-event' }] })).toBeNull();
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
});
