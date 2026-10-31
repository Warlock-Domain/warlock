import { describe, expect, it } from 'vitest';
import { RoomLoadingGate } from '../src/client/room-loading.ts';

const ready = () => {
  const g = new RoomLoadingGate();
  g.setSceneReady();
  return g;
};

describe('room loading synchronization', () => {
  it('keeps loading until both the scene and authoritative room are ready', () => {
    const g = new RoomLoadingGate();
    expect(g.pending).toBe(true);
    g.setRoom('lobby');
    expect(g.pending).toBe(true);
    g.setSceneReady();
    expect(g.pending).toBe(false);
    const other = ready();
    expect(other.pending).toBe(true);
    other.setRoom('shop');
    expect(other.pending).toBe(false);
  });

  it('waits for the local player identity before revealing the room', () => {
    const g = ready();
    g.setRoom('lobby', false);
    expect(g.pending).toBe(true);
    g.setRoom('lobby', true);
    expect(g.pending).toBe(false);
  });

  it.each(['lobby', 'end'] as const)('does not expose a transient %s while a start is pending', (phase) => {
    const g = ready();
    g.setRoom(phase);
    g.start();
    g.setRoom(phase);
    expect(g.pending).toBe(true);
    g.setRoom('shop');
    expect(g.pending).toBe(false);
  });

  it.each(['countdown', 'playing', 'roundEnd'] as const)('waits for a snapshot when joining %s', (phase) => {
    const g = ready();
    g.setRoom(phase);
    expect(g.pending).toBe(true);
    g.setSnapshot();
    expect(g.pending).toBe(false);
  });

  it('lets start rejection restore the prior lobby and fatal errors show their own screen', () => {
    const g = ready();
    g.setRoom('lobby');
    g.start();
    g.cancelStart();
    expect(g.pending).toBe(false);
    const failed = new RoomLoadingGate();
    failed.fail();
    expect(failed.pending).toBe(false);
  });

  it('releases a start lost with the socket once the reopened room is still in the lobby', () => {
    const g = ready();
    g.setRoom('lobby');
    g.start();
    g.cancelStart(); // connection reopened
    g.setRoom('lobby');
    expect(g.pending).toBe(false);
  });

  it('does not leave the loading layer in front of an initialized reconnect', () => {
    const g = ready();
    g.setRoom('shop');
    g.setRoom('countdown');
    expect(g.pending).toBe(true);
    g.setSnapshot();
    g.setRoom('playing');
    expect(g.pending).toBe(false);
  });
});
