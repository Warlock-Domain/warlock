import { describe, expect, it } from 'vitest';
import { AUDIO_LEVEL, audioLevel, layerVolume } from '../src/client/audio-level.ts';

const buffer = (channels: Float32Array[], sampleRate = 1000) => ({ numberOfChannels: channels.length, sampleRate, length: channels[0].length, getChannelData: (i: number) => channels[i] });
describe('nível comum dos áudios', () => {
  it('nivela gravações altas e baixas pelo trecho ativo', () => {
    for (const amplitude of [.04, .1, .6]) {
      const b = buffer([new Float32Array(1000).fill(amplitude)]);
      const level = audioLevel(b);
      expect(level.rms * level.gain).toBeCloseTo(AUDIO_LEVEL.rms);
    }
  });
  it('não aumenta o ganho por silêncio inicial/final nem por canal mudo', () => {
    const active = new Float32Array(100).fill(.2), padded = new Float32Array(2000); padded.set(active, 500);
    expect(audioLevel(buffer([active])).gain).toBeCloseTo(audioLevel(buffer([padded])).gain);
    const stereo = audioLevel(buffer([active, new Float32Array(100)]));
    expect(stereo.rms * stereo.gain).toBeCloseTo(AUDIO_LEVEL.rms);
  });
  it('limita pico e amplificação, sem amplificar silêncio ou dados inválidos', () => {
    const pulse = new Float32Array(100); pulse[0] = 1;
    const level = audioLevel(buffer([pulse]));
    expect(level.peak * level.gain).toBeLessThanOrEqual(AUDIO_LEVEL.peak);
    expect(audioLevel(buffer([new Float32Array(100).fill(.002)])).gain).toBeLessThanOrEqual(4);
    expect(audioLevel(buffer([new Float32Array(100)])).gain).toBe(0);
    expect(audioLevel(buffer([new Float32Array([NaN, Infinity])])).gain).toBe(0);
  });
  it('não multiplica o volume em impactos com várias camadas e respeita zero', () => {
    expect(layerVolume(1, 2) * 2).toBe(1);
    expect(layerVolume(0, 2)).toBe(0);
    expect(layerVolume(.4, 1)).toBe(.4);
  });
  it('síntese limpa e baixa pode alcançar a referência mantendo limite de pico', () => {
    const level = audioLevel(buffer([new Float32Array(100).fill(.004)]), Infinity);
    expect(level.rms * level.gain).toBeCloseTo(AUDIO_LEVEL.rms);
    expect(level.peak * level.gain).toBeLessThanOrEqual(AUDIO_LEVEL.peak);
  });
});
