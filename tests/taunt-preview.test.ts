import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSound, previewTaunt, stopTauntPreview } from '../src/client/sound.ts';

afterEach(() => { stopTauntPreview(); vi.unstubAllGlobals(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

function audioSample(amplitude = .6) {
  return { sampleRate: 1000, numberOfChannels: 1, length: 1000, getChannelData: () => new Float32Array(1000).fill(amplitude) };
}

describe('private taunt preview', () => {
  it('plays original and recorded taunts and stops the previous preview', async () => {
    const audios: { src: string; volume: number; pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal('Audio', class {
      volume = 0;
      pause = vi.fn(); play = vi.fn().mockResolvedValue(undefined);
      constructor(public src: string) { audios.push(this); }
    });
    expect(await previewTaunt('laugh')).toBe(true);
    expect(audios[0].src).toBe('/sfx/taunt/laugh.mp3');
    expect(audios[0].volume).toBe(.6);
    expect(await previewTaunt('meow')).toBe(true);
    expect(audios[0].pause).toHaveBeenCalledOnce();
    expect(audios[1].src).toBe('/sfx/taunt/meow.mp3');
    expect(audios[1].play).toHaveBeenCalledOnce();
    stopTauntPreview();
    expect(audios[1].pause).toHaveBeenCalledOnce();
  });

  it('rejects names outside the catalog without interrupting a valid preview', async () => {
    const audios: { pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal('Audio', class {
      pause = vi.fn(); play = vi.fn().mockResolvedValue(undefined);
      constructor() { audios.push(this); }
    });
    expect(await previewTaunt('laugh')).toBe(true);
    expect(await previewTaunt('../secret')).toBe(false);
    expect(audios).toHaveLength(1);
    expect(audios[0].pause).not.toHaveBeenCalled();
  });

  it('reports a current playback failure and treats replacement as successful', async () => {
    let rejectFirst!: (error: Error) => void;
    let count = 0;
    vi.stubGlobal('Audio', class {
      pause = vi.fn();
      play() { return ++count === 1 ? new Promise<void>((_, reject) => { rejectFirst = reject; }) : Promise.resolve(); }
    });
    const first = previewTaunt('laugh');
    expect(await previewTaunt('meow')).toBe(true);
    rejectFirst(new Error('interrupted'));
    expect(await first).toBe(true);

    vi.stubGlobal('Audio', class { pause = vi.fn(); play = vi.fn().mockRejectedValue(new Error('playback failed')); });
    expect(await previewTaunt('laugh')).toBe(false);
  });

  it('does not let a stale decode close or interrupt the replacement session', async () => {
    const firstDecode = deferred<ReturnType<typeof audioSample>>();
    const secondDecode = deferred<ReturnType<typeof audioSample>>();
    const decodes = [firstDecode, secondDecode];
    const contexts: { close: ReturnType<typeof vi.fn>; decodeAudioData: ReturnType<typeof vi.fn> }[] = [];
    const connect = vi.fn((next: unknown) => next);
    vi.stubGlobal('AudioContext', class {
      state = 'running'; destination = {};
      close = vi.fn(async () => {});
      decodeAudioData = vi.fn(() => decodes.shift()!.promise);
      createMediaElementSource() { return { connect }; }
      createGain() { return { gain: { value: 0 }, connect }; }
      createDynamicsCompressor() { return { connect }; }
      constructor() { contexts.push(this); }
    });
    const audios: { pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal('Audio', class {
      volume = 1; pause = vi.fn(); play = vi.fn().mockResolvedValue(undefined);
      constructor() { audios.push(this); }
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })));

    const first = previewTaunt('laugh');
    await vi.waitFor(() => expect(contexts[0].decodeAudioData).toHaveBeenCalledOnce());
    const second = previewTaunt('meow');
    await vi.waitFor(() => expect(contexts[1].decodeAudioData).toHaveBeenCalledOnce());
    expect(contexts[0].close).toHaveBeenCalledOnce();

    firstDecode.resolve(audioSample());
    expect(await first).toBe(true);
    expect(contexts[1].close).not.toHaveBeenCalled();
    expect(audios[0].play).not.toHaveBeenCalled();

    secondDecode.resolve(audioSample());
    expect(await second).toBe(true);
    expect(audios[1].play).toHaveBeenCalledOnce();
    expect(contexts[1].close).not.toHaveBeenCalled();
    stopTauntPreview();
    expect(contexts[1].close).toHaveBeenCalledOnce();
  });

  it('does not decode or play after stopping while the request is loading', async () => {
    const response = deferred<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>();
    const context = { state: 'running', destination: {}, close: vi.fn(async () => {}), decodeAudioData: vi.fn(), resume: vi.fn() };
    vi.stubGlobal('AudioContext', class {
      state = context.state;
      destination = context.destination;
      close = context.close;
      decodeAudioData = context.decodeAudioData;
      resume = context.resume;
    });
    vi.stubGlobal('fetch', vi.fn(() => response.promise));
    const audio = { volume: 1, pause: vi.fn(), play: vi.fn().mockResolvedValue(undefined) };
    let stoppedAudio!: typeof audio;
    vi.stubGlobal('Audio', class {
      volume = audio.volume;
      pause = audio.pause;
      play = audio.play;
      constructor() { stoppedAudio = this; }
    });

    const pending = previewTaunt('laugh');
    stopTauntPreview();
    response.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });

    expect(await pending).toBe(true);
    expect(context.decodeAudioData).not.toHaveBeenCalled();
    expect(stoppedAudio.play).not.toHaveBeenCalled();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it('applies master and taunt volume changes to the active fallback preview', async () => {
    const audios: { src?: string; volume: number; pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal('Audio', class {
      volume = 1; pause = vi.fn(); play = vi.fn().mockResolvedValue(undefined);
      constructor(public src?: string) { audios.push(this); }
    });
    vi.stubGlobal('addEventListener', vi.fn());
    const sound = createSound(0);
    sound.setVolume('master', 1);
    sound.setVolume('taunts', 1);
    expect(await previewTaunt('laugh')).toBe(true);
    const preview = audios.find((audio) => audio.src === '/sfx/taunt/laugh.mp3')!;
    expect(preview.volume).toBe(.6);

    sound.setVolume('sfx', 0);
    sound.setVolume('music', .2);
    expect(preview.volume).toBe(.6);
    sound.setVolume('taunts', .5);
    expect(preview.volume).toBe(.3);
    sound.setVolume('master', .5);
    expect(preview.volume).toBe(.15);
  });
});
