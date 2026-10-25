import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSound } from '../src/client/sound.ts';

afterEach(() => vi.unstubAllGlobals());

function sample(owner: number) {
  return { owner, sampleRate: 1000, numberOfChannels: 1, length: 1000, getChannelData: () => new Float32Array(1000).fill(.2) };
}

describe('AudioPlayer ownership', () => {
  it('keeps detached callbacks and audio resources independent per player', async () => {
    const listeners = new Map<string, ((event: Event) => void)[]>();
    const players: { owner: number; decoded: ReturnType<typeof sample>[]; sources: { buffer: ReturnType<typeof sample> | null; start: ReturnType<typeof vi.fn> }[] }[] = [];
    const media: { src: string; volume: number; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }[] = [];
    const connect = (next: unknown) => next;
    vi.stubGlobal('addEventListener', (name: string, listener: (event: Event) => void) => {
      const group = listeners.get(name) ?? [];
      group.push(listener);
      listeners.set(name, group);
    });
    vi.stubGlobal('Audio', class {
      loop = false; preload = ''; volume = 1;
      play = vi.fn(async () => {}); pause = vi.fn();
      constructor(public src: string) { media.push(this); }
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })));
    vi.stubGlobal('AudioContext', class {
      state = 'running'; sampleRate = 1000; currentTime = 0; destination = {};
      readonly owner = players.length;
      readonly decoded: ReturnType<typeof sample>[] = [];
      readonly sources: { buffer: ReturnType<typeof sample> | null; start: ReturnType<typeof vi.fn> }[] = [];
      createGain() { return { gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect }; }
      createDynamicsCompressor() { return { connect }; }
      createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
      createBufferSource() {
        const source = { buffer: null as ReturnType<typeof sample> | null, playbackRate: { value: 1 }, connect, start: vi.fn(), stop: vi.fn() };
        this.sources.push(source);
        return source;
      }
      createOscillator() { return { type: '', frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect, start: vi.fn(), stop: vi.fn() }; }
      createBiquadFilter() { return { type: '', frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect }; }
      async decodeAudioData() {
        const decoded = sample(this.owner);
        this.decoded.push(decoded);
        return decoded;
      }
      async close() {}
      constructor() { players.push(this); }
    });

    const first = createSound(0);
    const second = createSound(0);
    const secondMaster = second.volumes().master;
    const setFirstVolume = first.setVolume;
    const firstVolumes = first.volumes;
    const setFirstAmbience = first.setAmbience;
    const firstPlay = first.play;
    setFirstVolume('master', 0.25);
    first.setVolume('music', 1);
    setFirstAmbience(true);
    expect(firstVolumes().master).toBe(0.25);
    expect(second.volumes().master).toBe(secondMaster);
    expect(players).toHaveLength(0);

    listeners.get('pointerdown')!.forEach((listener) => listener(new Event('pointerdown')));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(players).toHaveLength(2);
    expect(media[0].play).toHaveBeenCalled();
    expect(media[1].play).not.toHaveBeenCalled();

    firstPlay('fireball');
    const playSecond = second.play;
    playSecond('fireball');
    expect(players[0].sources[0].buffer?.owner).toBe(players[0].owner);
    expect(players[1].sources[0].buffer?.owner).toBe(players[1].owner);
  });
});
