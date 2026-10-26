import { describe, expect, it } from 'vitest';
import { messageSpace } from '../src/client/message-space.ts';
import { parseServerMessage } from '../src/client/net-message.ts';
import { addPlayer, campaignReaders, newMatch, removePlayer, resume, setReading, setWatch, startMatch, tickMatch } from '../src/shared/match.ts';
import { parseClientMessage, publicId, publicRoom } from '../src/shared/protocol.ts';
import { mulberry32 } from '../src/shared/rng.ts';
import { toPlaying } from './helpers.ts';

function party() {
  const m = newMatch();
  m.mode = 'campaign';
  addPlayer(m, 'player-a', 'Reader A');
  addPlayer(m, 'player-b', 'Reader B');
  startMatch(m, 0, 0, 'campaign', true, mulberry32(1));
  toPlaying(m, 0, mulberry32(2));
  return m;
}

describe('Campaign reading pause', () => {
  it('freezes the entire world, timers, waves and commands until both readers finish', () => {
    const m = party();
    expect(setReading(m, 'player-a', true)).toBe(true);
    expect(setReading(m, 'player-b', true)).toBe(true);
    const before = JSON.stringify(m);
    for (let i = 0; i < 600; i++) expect(tickMatch(m, 10000 + i * 1000, [{ kind: 'move', id: 'player-a', to: { x: 2, y: 3 } }])).toEqual([]);
    expect(JSON.stringify(m)).toBe(before);
    setReading(m, 'player-a', false);
    const time = m.world!.t;
    tickMatch(m, 700000, []);
    expect(m.world!.t).toBe(time);
    setReading(m, 'player-b', false);
    tickMatch(m, 700016, []);
    expect(m.world!.t).toBeGreaterThan(time);
  });

  it('does not wait for disconnected readers, spectators or bots', () => {
    const m = party();
    expect(setReading(m, 'missing', true)).toBe(false);
    setReading(m, 'player-a', true);
    removePlayer(m, 'player-a');
    expect(campaignReaders(m)).toEqual([]);
    addPlayer(m, 'player-a', 'Reader A');
    expect(campaignReaders(m)).toEqual([]);
    setReading(m, 'player-b', true);
    setWatch(m, 'player-b', true);
    expect(setReading(m, 'player-b', true)).toBe(false);
    expect(campaignReaders(m)).toEqual([]);
    addPlayer(m, 'bot-1', 'Bot', true);
    expect(setReading(m, 'bot-1', true)).toBe(false);
  });

  it('clears transient acknowledgements on server resume and ignores PvP', () => {
    const m = party();
    setReading(m, 'player-a', true);
    resume(m, 99999);
    expect(campaignReaders(m)).toEqual([]);
    const pvp = newMatch();
    addPlayer(pvp, 'player-a', 'A');
    expect(setReading(pvp, 'player-a', true)).toBe(false);
  });

  it('exposes public ids only and strictly validates both message directions', () => {
    const m = party();
    setReading(m, 'player-a', true);
    expect(setReading(m, 'player-a', true)).toBe(false);
    const r = publicRoom('TEST', m, 10000);
    expect(r.reading).toEqual([publicId('TEST', 'player-a')]);
    expect(parseServerMessage({ t: 'room', room: r, you: r.players[0].id })).not.toBeNull();
    for (const reading of [['unknown'], [r.players[0].id, r.players[0].id], 'bad', [1]]) {
      expect(parseServerMessage({ t: 'room', room: { ...r, reading }, you: r.players[0].id })).toBeNull();
    }
    expect(parseClientMessage('{"t":"reading","on":true}')).toEqual({ t: 'reading', on: true });
    for (const bad of [{ t: 'reading', on: 1 }, { t: 'reading' }, { t: 'reading', on: true, id: 'other' }]) {
      expect(parseClientMessage(JSON.stringify(bad))).toBeNull();
    }
  });
});

describe('Message Space shortcut', () => {
  it('advances once per press, consumes keyup after the last line, and leaves Esc alone', () => {
    const key = messageSpace();
    expect(key({ code: 'Space', type: 'keydown' }, true, false)).toEqual({ consume: true, advance: true });
    expect(key({ code: 'Space', type: 'keydown', repeat: true }, true, false)).toEqual({ consume: true, advance: false });
    expect(key({ code: 'Space', type: 'keyup' }, false, false)).toEqual({ consume: true, advance: false });
    expect(key({ code: 'Space', type: 'keyup' }, false, false).consume).toBe(false);
    expect(key({ code: 'Escape', type: 'keydown' }, true, false)).toEqual({ consume: false, advance: false });
    expect(key({ code: 'Space', type: 'keydown' }, true, false).advance).toBe(true);
  });

  it('does not advance through settings, text fields, or waiting notices', () => {
    const key = messageSpace();
    expect(key({ code: 'Space', type: 'keydown' }, true, true)).toEqual({ consume: false, advance: false });
    expect(key({ code: 'Space', type: 'keydown' }, false, false)).toEqual({ consume: false, advance: false });
    expect(key({ code: 'Space', type: 'keydown', repeat: true }, true, false).advance).toBe(false);
  });
});
