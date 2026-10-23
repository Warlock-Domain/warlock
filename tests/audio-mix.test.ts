import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSound, previewTaunt, stopTauntPreview } from '../src/client/sound.ts';

afterEach(() => { stopTauntPreview(); vi.unstubAllGlobals(); });
describe('normalização na reprodução', () => {
  it('mede arquivos, síntese e prévia pelo mesmo nível, preservando mudo', async () => {
    const listeners = new Map<string, () => void>();
    const gains: { gain: { value: number } }[] = [];
    const sources: { buffer: unknown; start: ReturnType<typeof vi.fn>; next?: unknown }[] = [];
    const sample = (amplitude: number) => ({ sampleRate: 1000, numberOfChannels: 1, length: 1000, duration: 1, getChannelData: () => new Float32Array(1000).fill(amplitude) });
    const connect = function (this: { next?: unknown }, next: unknown) { this.next = next; return next; };
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
    class Context {
      state = 'running'; sampleRate = 1000; currentTime = 0; destination = {};
      createGain() { const gain = { gain: param(), connect }; gains.push(gain); return gain; }
      createDynamicsCompressor() { return { connect }; }
      createBuffer() { return sample(0); }
      createBufferSource() { const s = { buffer: null, connect, start: vi.fn(), stop: vi.fn(), playbackRate: { value: 1 } }; sources.push(s); return s; }
      createOscillator() { return { frequency: param(), connect, start() {}, stop() {} }; }
      createBiquadFilter() { return { frequency: param(), connect }; }
      createMediaElementSource() { return { connect }; }
      async decodeAudioData() { return sample(.6); }
      async startRendering() { return sample(.04); }
      async close() {}
    }
    vi.stubGlobal('AudioContext', Context);
    vi.stubGlobal('OfflineAudioContext', Context);
    vi.stubGlobal('Audio', class { volume = 1; async play() {} pause() {} });
    vi.stubGlobal('addEventListener', (name: string, fn: () => void) => listeners.set(name, fn));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })));
    const sound = createSound(0);
    sound.setVolume('sfx', 1);
    listeners.get('pointerdown')!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    sound.play('fireball');
    const recorded = sources.at(-1)!;
    expect((recorded.next as { gain: { value: number } }).gain.value).toBeCloseTo(.2);
    sound.play('click');
    expect((sources.at(-1)!.next as { gain: { value: number } }).gain.value).toBeCloseTo(3);
    const count = sources.length;
    sound.play('fireball', 0);
    expect(sources).toHaveLength(count);
    expect(await previewTaunt('laugh')).toBe(true);
    expect(gains.at(-1)!.gain.value).toBeCloseTo(.12); // .2 de normalização × .6 do master da partida.
    sound.setVolume('sfx', 0);
    sound.play('fireball');
    expect(sources).toHaveLength(count);
    sound.setVolume('taunts', .5);
    await sound.taunt('laugh');
    expect(sources).toHaveLength(count + 1); // efeitos mudos não silenciam o canal de provocações.
    const voiceGain = sources.at(-1)!.next as { next: { gain: { value: number } } };
    expect(voiceGain.next.gain.value).toBeCloseTo(.3);
    await sound.taunt('laugh', 0);
    expect(sources).toHaveLength(count + 1);
    let distanceGain = 1;
    const pendingVoice = sound.taunt('meow', () => distanceGain);
    distanceGain = 0; // jogador se afastou enquanto a gravação era carregada.
    await pendingVoice;
    expect(sources).toHaveLength(count + 1);
    sound.setVolume('master', 0);
    await sound.taunt('laugh');
    sound.play('click');
    expect(sources).toHaveLength(count + 1);
    expect(voiceGain.next.gain.value).toBe(0);
  });
});
