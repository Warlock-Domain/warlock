import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSound } from '../src/client/sound.ts';

afterEach(() => vi.unstubAllGlobals());
describe('clique de menu com tambor sintetizado', () => {
  it('não baixa o clique antigo e respeita volume e mudo', async () => {
    const listeners = new Map<string, () => void>();
    const oscillators: { type: string; frequency: { setValueAtTime: ReturnType<typeof vi.fn> }; stop: ReturnType<typeof vi.fn> }[] = [];
    const connect = () => ({ connect });
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
    vi.stubGlobal('Audio', function () { return { pause() {}, play: async () => {} }; });
    vi.stubGlobal('addEventListener', (name: string, fn: () => void) => listeners.set(name, fn));
    const fetch = vi.fn(async (_src: string) => ({ ok: false }));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('AudioContext', class {
      state = 'running'; sampleRate = 4; currentTime = 0; destination = {};
      createGain() { return { gain: param(), connect }; }
      createDynamicsCompressor() { return { connect }; }
      createBuffer() { return { getChannelData: () => new Float32Array(4) }; }
      createOscillator() {
        const o = { type: '', frequency: param(), connect, start: vi.fn(), stop: vi.fn() };
        oscillators.push(o); return o;
      }
    });
    const sound = createSound(0);
    sound.setVolume('sfx', 1);
    listeners.get('pointerdown')!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch.mock.calls.some(([src]) => src === '/sfx/click.mp3')).toBe(false);
    sound.play('click');
    expect(oscillators).toHaveLength(2);
    expect(oscillators.map((o) => o.type)).toEqual(['sine', 'sine']);
    expect(oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(180, 0);
    expect(oscillators.every((o) => o.stop.mock.calls[0][0] <= .2)).toBe(true);
    sound.setVolume('sfx', 0);
    sound.play('click');
    expect(oscillators).toHaveLength(2);
  });
});
