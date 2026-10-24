// Mede trechos ativos, sem deixar silêncio/caudas longas provocarem ganho excessivo.
export const AUDIO_LEVEL = { rms: .12, peak: .8, maxGain: 4, window: .05, gate: .01 };
type Samples = { sampleRate: number; numberOfChannels: number; length: number; getChannelData(channel: number): Float32Array };
export function audioLevel(buffer: Samples, maxGain = AUDIO_LEVEL.maxGain) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const windows: { energy: number; count: number }[] = [];
  const size = Math.max(1, Math.round(buffer.sampleRate * AUDIO_LEVEL.window));
  let peak = 0, maxEnergy = 0;
  for (let at = 0; at < buffer.length; at += size) {
    let energy = 0, count = 0;
    for (const data of channels) for (let i = at; i < Math.min(buffer.length, at + size); i++) {
      const x = Number.isFinite(data[i]) ? data[i] : 0;
      energy += x * x; count++; peak = Math.max(peak, Math.abs(x));
    }
    if (count) { windows.push({ energy, count }); maxEnergy = Math.max(maxEnergy, energy / count); }
  }
  let sum = 0, count = 0;
  for (const w of windows) if (w.energy / w.count >= Math.max(1e-6, maxEnergy * AUDIO_LEVEL.gate)) { sum += w.energy; count += w.count; }
  const rms = count ? Math.sqrt(sum / count) : 0;
  const gain = rms > 1e-6 ? Math.min(maxGain, AUDIO_LEVEL.rms / rms, AUDIO_LEVEL.peak / Math.max(peak, 1e-6)) : 0;
  return { rms, peak, gain };
}

// As camadas são normalizadas individualmente; dividir pela quantidade evita dobrar impactos compostos.
export const layerVolume = (volume: number, layers: number) => Math.max(0, Math.min(1, volume)) / Math.max(1, layers);
