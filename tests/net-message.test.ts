import { describe, expect, it, vi } from 'vitest';
import { newMatch, addPlayer, startMatch, type Mode } from '../src/shared/match.ts';
import { newWorld } from '../src/shared/sim.ts';
import { publicRoom } from '../src/shared/protocol.ts';
import { encodeSnap } from '../src/shared/snapshot.ts';
import { SPELL_IDS } from '../src/shared/spells.ts';
import { decodeMessage, parseLobbyMessage, parseServerMessage } from '../src/client/net-message.ts';

const snap = () => ({ t: 'snap', time: 1, r: 10, s: 0, w: [0, 0, 0, 0, 100, 0, 0], p: [], cd: Array(SPELL_IDS.length).fill(0), sp: 1, pl: [], ack: 0 });

describe('decoding received messages', () => {
  it('accepts a valid room list and rejects invalid envelopes or entries', () => {
    expect(parseLobbyMessage({ t: 'rooms', rooms: [{ id: 'ABCD', players: 0, phase: 'lobby' }] })).toEqual({ t: 'rooms', rooms: [{ id: 'ABCD', players: 0, phase: 'lobby' }] });
    expect(parseLobbyMessage({ t: 'rooms', rooms: [{ id: 'ABCD', players: -1, phase: 'lobby' }] })).toBeNull();
    expect(parseLobbyMessage({ t: 'room', rooms: [] })).toBeNull();
  });

  it('accepts compact snapshots without copying the arrays and rejects broken lengths', () => {
    const valid = snap();
    expect(parseServerMessage(valid)).toBe(valid);
    expect(parseServerMessage({ ...valid, w: [0, 0] })).toBeNull();
    expect(parseServerMessage({ ...valid, cd: [] })).toBeNull();
    expect(parseServerMessage({ ...valid, st: [null] })).toBeNull();
    expect(parseServerMessage({ ...valid, kr: [] })).toBeNull();
    expect((parseServerMessage({ ...valid, e: [{ k: 'not-an-event' }] }) as { e?: unknown[] }).e).toEqual([]);
  });

  it('accepts server-produced snapshots and drops unknown cosmetic events', () => {
    const match = newMatch();
    addPlayer(match, 'player', 'Ana');
    addPlayer(match, 'other', 'Bia');
    const spells = Object.fromEntries(match.players.map((player) => [player.id, player.spells]));
    const items = Object.fromEntries(match.players.map((player) => [player.id, player.items]));
    const world = newWorld(['player', 'other'], spells, items, 0, () => 0.5);
    world.t = 1;
    world.dm = true;
    world.wizards[0].stunLeft = 1;
    world.wizards[0].rushUntil = 5;
    world.wizards[0].rushLeft = 12;
    world.wizards[0].invulnUntil = 5;
    world.wizards[1].recoveryLeft = 3;
    world.loots.push({ pos: { x: 1, y: 2 }, left: 4, until: 5 });
    world.runes.push({ pos: { x: 2, y: 3 }, kind: 'haste' });
    world.zones.push({ pos: { x: 3, y: 4 }, r: 2, kind: 'slow', until: 5 });
    const encoded = encodeSnap(world, 'player', 7, [{ k: 'sudden' }]);
    expect(encoded.ch).toHaveLength(3);
    expect(encoded.ru).toHaveLength(3);
    expect(encoded.zn).toHaveLength(5);
    expect(encoded.il?.length).toBeGreaterThan(0);
    expect(encoded.rs).toHaveLength(2);
    expect(encoded.kr).toHaveLength(2);
    expect(encoded.ab).toHaveLength(2);
    expect(encoded.fx?.length).toBeGreaterThan(0);
    expect(parseServerMessage(encoded)).toBe(encoded);
    const withUnknownEvent = { ...encoded, e: [...encoded.e!, { k: 'new_cosmetic' }] };
    const decoded = parseServerMessage(withUnknownEvent);
    expect(decoded).not.toBeNull();
    expect((decoded as typeof encoded).e).toEqual([{ k: 'sudden' }]);
    expect(parseServerMessage({ t: 'room', room: publicRoom('ABCD', match, 0), you: 'player' })).not.toBeNull();
  });

  it('accepts a real publicRoom of the five modes, the sandbox and a room with a vote', () => {
    const modes: Mode[] = ['rounds', 'deathmatch', 'teams', 'ascension', 'campaign'];
    for (const mode of modes) {
      const match = newMatch();
      match.mode = mode; // Ascension and Campaign only start in a room of their type
      addPlayer(match, 'player', 'Ana', false, false, () => 0.5);
      addPlayer(match, 'other', 'Bia', false, false, () => 0.5);
      expect(startMatch(match, 0, 0, mode, true, () => 0.5), mode).toBe(true);
      if (mode === 'rounds') match.vote = { kind: 'restart', target: '', by: 'player', yes: ['player'], no: [], ends: 1000 };
      expect(parseServerMessage({ t: 'room', room: publicRoom(`R${mode}`, match, 0), you: 'player' }), mode).not.toBeNull();
    }

    const sandbox = newMatch();
    addPlayer(sandbox, 'player', 'Ana');
    addPlayer(sandbox, 'other', 'Bia');
    expect(startMatch(sandbox, 0, 0, 'rounds', true, () => 0.5, {}, [], true)).toBe(true);
    expect(parseServerMessage({ t: 'room', room: publicRoom('SANDBOX', sandbox, 0), you: 'player' })).not.toBeNull();
  });

  it('validates the public room state and small messages', () => {
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

  it('ignores invalid JSON, binary data and messages the channel does not know', () => {
    expect(decodeMessage('{bad', parseServerMessage)).toBeNull();
    expect(decodeMessage(new ArrayBuffer(2), parseServerMessage)).toBeNull();
    expect(decodeMessage('{"t":"rooms","rooms":[]}', parseServerMessage)).toBeNull();
    expect(decodeMessage('{"t":"rooms","rooms":[]}', parseLobbyMessage)).toEqual({ t: 'rooms', rooms: [] });
  });

  it('passes the message type and the rejection reason to the decoder callback', () => {
    const onInvalid = vi.fn();
    expect(decodeMessage('{"t":"unexpected"}', parseServerMessage, onInvalid)).toBeNull();
    expect(decodeMessage('{"t":"unexpected"}', parseServerMessage, onInvalid)).toBeNull();
    expect(onInvalid).toHaveBeenCalledTimes(2); // connect limits the warning to one occurrence per type.
    expect(onInvalid).toHaveBeenCalledWith('unexpected', 'schema validation failed');
  });
});
