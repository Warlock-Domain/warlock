import { describe, expect, it } from 'vitest';
import { AUDIO_LEVEL, audioLevel, layerVolume } from '../src/client/audio-level.ts';

const RATE = 48000;
const buffer = (channels: Float32Array[], sampleRate = RATE) => ({ numberOfChannels: channels.length, sampleRate, length: channels[0].length, getChannelData: (i: number) => channels[i] });
const tone = (amplitude: number, seconds = 1, hz = 1000) => Float32Array.from({ length: Math.round(RATE * seconds) }, (_, i) => amplitude * Math.sin(2 * Math.PI * hz * i / RATE));
const db = (gain: number) => 20 * Math.log10(gain);
describe('common audio level', () => {
  it('measures a full-scale 1 kHz sine at -3.01 LUFS, as ITU-R BS.1770 defines', () => {
    const lufs = -0.691 + 10 * Math.log10(audioLevel(buffer([tone(1)])).rms ** 2);
    expect(lufs).toBeCloseTo(-3.01, 1);
  });
  it('gives a bright sound less gain than a dull one with the same amplitude (K-weighting, issue #202)', () => {
    const dull = audioLevel(buffer([tone(.2, 1, 200)])).gain, bright = audioLevel(buffer([tone(.2, 1, 6000)])).gain;
    expect(db(dull) - db(bright)).toBeGreaterThan(3.5);
  });
  it('levels loud and quiet recordings by the active part', () => {
    for (const amplitude of [.04, .1, .6]) {
      const level = audioLevel(buffer([tone(amplitude)]));
      expect(level.rms * level.gain).toBeCloseTo(AUDIO_LEVEL.rms);
    }
  });
  it('does not raise the gain for leading/trailing silence or a muted channel', () => {
    const active = tone(.2, .1), padded = new Float32Array(RATE * 2); padded.set(active, RATE / 2);
    expect(audioLevel(buffer([active])).gain).toBeCloseTo(audioLevel(buffer([padded])).gain);
    const stereo = audioLevel(buffer([active, new Float32Array(active.length)]));
    expect(stereo.rms * stereo.gain).toBeCloseTo(AUDIO_LEVEL.rms);
  });
  it('leaves out a tail 20 dB quieter than the sound (relative -10 LU gate)', () => {
    const loud = tone(.5, 3), withTail = new Float32Array(RATE * 6); withTail.set(loud); withTail.set(tone(.05, 3), loud.length);
    expect(Math.abs(db(audioLevel(buffer([withTail])).gain) - db(audioLevel(buffer([loud])).gain))).toBeLessThan(.5);
  });
  it('caps peak and amplification, and never amplifies silence or invalid data', () => {
    const pulse = new Float32Array(100); pulse[0] = 1;
    const level = audioLevel(buffer([pulse]));
    expect(level.peak * level.gain).toBeLessThanOrEqual(AUDIO_LEVEL.peak);
    expect(audioLevel(buffer([tone(.002)])).gain).toBeLessThanOrEqual(4);
    expect(audioLevel(buffer([new Float32Array(100)])).gain).toBe(0);
    expect(audioLevel(buffer([new Float32Array([NaN, Infinity])])).gain).toBe(0);
  });
  it('does not multiply the volume of layered impacts and respects zero', () => {
    expect(layerVolume(1, 2) * 2).toBe(1);
    expect(layerVolume(0, 2)).toBe(0);
    expect(layerVolume(.4, 1)).toBe(.4);
  });
  it('clean, quiet synthesis can reach the reference while keeping the peak cap', () => {
    const level = audioLevel(buffer([tone(.004)]), Infinity);
    expect(level.rms * level.gain).toBeCloseTo(AUDIO_LEVEL.rms);
    expect(level.peak * level.gain).toBeLessThanOrEqual(AUDIO_LEVEL.peak);
  });
});
