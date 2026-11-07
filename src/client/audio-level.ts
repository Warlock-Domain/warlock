// Every sound plays at the same perceived loudness: K-weighted RMS 0.12 (about -19 LUFS on a mono file), peak up to 0.8.
// silence is -70 LUFS as a mean square; gate is -10 LU as an energy ratio.
export const AUDIO_LEVEL = { rms: .12, peak: .8, maxGain: 4, hop: .1, silence: 1.17e-7, gate: .1 };
type Samples = { sampleRate: number; numberOfChannels: number; length: number; getChannelData(channel: number): Float32Array };
const biquad = ([b0, b1, b2, a1, a2]: number[]) => {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x: number) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
};
// ITU-R BS.1770 K-weighting (high shelf + high-pass, libebur128 coefficients for any sample rate): with flat RMS a bright
// spell sound played up to 5 LUFS louder than a dull one (issue #202). Squares are summed per 100 ms hop as they are
// filtered, so measuring the 108 s music allocates no sample-sized array.
function addKWeighted(data: Float32Array, rate: number, hops: Float64Array, hop: number, share: number) {
  let K = Math.tan(Math.PI * 1681.974450955533 / rate), Q = .7071752369554196;
  const vh = 10 ** (3.999843853973347 / 20), vb = vh ** .4996667741545416, a0 = 1 + K / Q + K * K;
  const shelf = biquad([(vh + vb * K / Q + K * K) / a0, 2 * (K * K - vh) / a0, (vh - vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]);
  K = Math.tan(Math.PI * 38.13547087602444 / rate); Q = .5003270373238773;
  const h0 = 1 + K / Q + K * K, highPass = biquad([1, -2, 1, 2 * (K * K - 1) / h0, (1 - K / Q + K * K) / h0]);
  for (let i = 0; i < data.length; i++) hops[Math.floor(i / hop)] += highPass(shelf(Number.isFinite(data[i]) ? data[i] : 0)) ** 2 * share;
}
// BS.1770 gating: 400 ms blocks (4 hops) every 100 ms, drop blocks under -70 LUFS, then those 10 LU under the mean of the rest.
// A sound shorter than one block counts as one block padded with silence, as ffmpeg's ebur128 measures it.
// Channels are averaged, not summed: a mono buffer plays on both speakers, like dual-mono stereo.
// Peak stays on the raw samples, which is what clips.
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
export function audioLevel(buffer: Samples, maxGain = AUDIO_LEVEL.maxGain) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const hop = Math.round(buffer.sampleRate * AUDIO_LEVEL.hop), hops = new Float64Array(Math.max(4, Math.ceil(buffer.length / hop)));
  let peak = 0;
  for (const data of channels) {
    addKWeighted(data, buffer.sampleRate, hops, hop, 1 / channels.length);
    for (const x of data) if (Number.isFinite(x)) peak = Math.max(peak, Math.abs(x));
  }
  const blocks = Array.from({ length: Math.max(1, Math.floor(buffer.length / hop) - 3) }, (_, k) => (hops[k] + hops[k + 1] + hops[k + 2] + hops[k + 3]) / (4 * hop));
  const loud = blocks.filter((e) => e > AUDIO_LEVEL.silence), floor = mean(loud) * AUDIO_LEVEL.gate;
  const rms = Math.sqrt(mean(loud.filter((e) => e >= floor)));
  const gain = rms > 1e-6 ? Math.min(maxGain, AUDIO_LEVEL.rms / rms, AUDIO_LEVEL.peak / Math.max(peak, 1e-6)) : 0;
  return { rms, peak, gain };
}

// As camadas são normalizadas individualmente; dividir pela quantidade evita dobrar impactos compostos.
export const layerVolume = (volume: number, layers: number) => Math.max(0, Math.min(1, volume)) / Math.max(1, layers);
