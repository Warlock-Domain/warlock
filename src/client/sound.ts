// Sons: arquivos gravados (CC0, public/sfx, créditos em public/CREDITS.txt) e, enquanto não carregam ou se faltarem,
// sons sintetizados na hora (Web Audio). Música e crepitar da lava em loop. O navegador só libera áudio depois de um toque.
export type SoundKind = 'fireball' | 'lightning' | 'homing' | 'shield' | 'teleport' | 'hit' | 'reflect' | 'death' | 'shrink' | 'beep' | 'go' | 'click';

const FILES: Partial<Record<SoundKind, string[]>> = {
  fireball: ['fireball'], lightning: ['lightning'], homing: ['homing'], shield: ['shield'], teleport: ['teleport'],
  hit: ['hit', 'explode'], reflect: ['shield'], death: ['explode'], click: ['click'], go: ['confirm'],
};

export function createSound(isMuted: () => boolean, musicOn: () => boolean) {
  let ctx: AudioContext | null = null;
  let noise: AudioBuffer | null = null;
  let master: GainNode | null = null;
  const buffers = new Map<string, AudioBuffer>();
  const music = new Audio('/music/battle.mp3');
  music.loop = true;
  music.volume = 0.3;
  let lava: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  let wantAmbience = false;

  async function load(name: string) {
    try {
      const res = await fetch(`/sfx/${name}.mp3`);
      if (res.ok) buffers.set(name, await ctx!.decodeAudioData(await res.arrayBuffer()));
    } catch {
      // fica o som sintetizado
    }
  }

  function unlock() {
    if (!ctx) {
      try {
        ctx = new AudioContext();
      } catch {
        return;
      }
      // compressor + volume geral abaixo de 1: vários sons juntos (golpe + explosão) não estouram
      master = ctx.createGain();
      master.gain.value = 0.6;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const names = new Set([...Object.values(FILES).flat(), 'lava_loop']);
      void Promise.all([...names].map(load)).then(syncAmbience);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    syncAmbience();
  }
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);

  // música e lava tocam só dentro da partida e com som ligado
  function syncAmbience() {
    const on = wantAmbience && !isMuted() && !!ctx && ctx.state === 'running';
    if (on && musicOn()) void music.play().catch(() => {});
    else music.pause();
    const buf = buffers.get('lava_loop');
    if (on && buf && !lava) {
      const src = ctx!.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx!.createGain();
      gain.gain.value = 0.12;
      src.connect(gain).connect(master!);
      src.start();
      lava = { src, gain };
    } else if (!on && lava) {
      lava.src.stop();
      lava = null;
    }
  }

  function file(name: string, volume: number) {
    const buf = buffers.get(name);
    if (!buf) return false;
    const src = ctx!.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.94 + Math.random() * 0.12; // variação leve para não cansar
    const g = ctx!.createGain();
    g.gain.value = volume;
    src.connect(g).connect(master!);
    src.start();
    return true;
  }

  // ruído filtrado: chiado de fogo, estalo de raio, borbulha de lava
  function hiss(type: BiquadFilterType, f0: number, f1: number, dur: number, gain: number, at = 0) {
    const c = ctx!;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  function tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, at = 0) {
    const c = ctx!;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  return {
    setAmbience(on: boolean) {
      wantAmbience = on;
      syncAmbience();
    },
    refresh: syncAmbience,
    play(kind: SoundKind, volume = 1) {
      if (!ctx || !noise || isMuted() || ctx.state !== 'running') return;
      const v = Math.max(0.05, Math.min(1, volume));
      const names = FILES[kind];
      if (names && names.map((n) => file(n, v * 0.8)).some(Boolean)) return;
      switch (kind) {
        case 'fireball': hiss('lowpass', 2400, 300, 0.45, 0.5 * v); tone('sawtooth', 160, 60, 0.3, 0.08 * v); break;
        case 'lightning': hiss('highpass', 3000, 800, 0.25, 0.7 * v); tone('square', 900, 120, 0.18, 0.08 * v); break;
        case 'homing': tone('sine', 300, 900, 0.4, 0.15 * v); hiss('bandpass', 1500, 2500, 0.4, 0.15 * v); break;
        case 'shield': tone('sine', 520, 780, 0.5, 0.18 * v); tone('sine', 780, 1170, 0.5, 0.08 * v); break;
        case 'teleport': tone('sine', 1400, 200, 0.3, 0.18 * v); hiss('bandpass', 4000, 600, 0.3, 0.2 * v); break;
        case 'hit': hiss('lowpass', 900, 120, 0.3, 0.9 * v); tone('sine', 120, 45, 0.25, 0.35 * v); break;
        case 'reflect': tone('triangle', 1200, 2400, 0.2, 0.2 * v); break;
        case 'death': hiss('lowpass', 1500, 100, 1.2, 0.6 * v); tone('sawtooth', 300, 50, 0.9, 0.1 * v); break;
        case 'shrink': tone('sawtooth', 80, 40, 1.2, 0.2 * v); hiss('lowpass', 400, 80, 1.2, 0.5 * v); break;
        case 'beep': tone('square', 660, 660, 0.12, 0.08 * v); break;
        case 'go': tone('square', 990, 990, 0.3, 0.1 * v); break;
        case 'click': tone('triangle', 900, 700, 0.05, 0.05 * v); break;
      }
    },
  };
}
