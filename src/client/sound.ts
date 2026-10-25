// Sounds: recorded files, each with its license or owner acceptance in public/CREDITS.txt, and, while they load or if they are
// missing, sounds synthesized on the fly (Web Audio). Music loops. The browser only unlocks audio after a tap.
import { tauntAudioSrc } from '../shared/taunts.ts';
import { audioLevel, layerVolume } from './audio-level.ts';
import { store } from './store.ts';

export type SoundKind = 'fireball' | 'lightning' | 'homing' | 'shield' | 'teleport' | 'hit' | 'hitLight' | 'hitHeavy' | 'reflect' | 'death' | 'splash' | 'shrink' | 'beep' | 'go' | 'click'
  | 'winRound' | 'loseRound' | 'buy' | 'error' | 'ready' | 'hover' | 'brace' | 'heal' | 'closedbody' | 'closedbodyEnd' | 'sand';

const FILES: Partial<Record<SoundKind, string[]>> = {
  brace: ['brace_start'], closedbody: ['closed_body_start'], closedbodyEnd: ['closed_body_end'],
  fireball: ['fireball'], lightning: ['lightning'], homing: ['homing'], shield: ['shield'], teleport: ['teleport'],
  hit: ['hit', 'explode'], hitLight: ['hit'], hitHeavy: ['hit', 'explode'], reflect: ['shield'], death: ['explode'], go: ['confirm'],
};
// recordings that always play at their original speed (the timbre was chosen that way)
const STEADY = new Set(['brace_start', 'closed_body_start', 'closed_body_end']);
// golpe fraco mais agudo, golpe forte mais grave
const RATE: Partial<Record<SoundKind, number>> = { hitLight: 1.25, hitHeavy: 0.78 };

// volumes de 0 a 1, separados para efeitos e música, guardados no navegador: os mesmos no menu inicial e na sala (issue #128).
// Quem tinha deixado mudo na versão antiga começa em zero
export type Volumes = { master: number; sfx: number; music: number; taunts: number };
export type VolumeKind = keyof Volumes;
const VOL_KEY = { master: 'warlock:vol-master', sfx: 'warlock:vol-sfx', music: 'warlock:vol-music', taunts: 'warlock:vol-taunts' } as const;
export const channelVolume = (v: Volumes, kind: 'sfx' | 'music' | 'taunts') => v.master * v[kind];
export const isAudioMuted = (v: Volumes) => v.master === 0 || v.sfx + v.music + v.taunts === 0;
export function loadVolumes(musicDefault = 0.7): Volumes {
  const readVol = (k: string, fallback: number) => {
    const n = Number(store.get(k));
    return Number.isFinite(n) && store.get(k) !== null ? Math.max(0, Math.min(1, n)) : fallback;
  };
  const oldMute = store.get('warlock:mute') === '1';
  const sfx = readVol(VOL_KEY.sfx, oldMute ? 0 : 1);
  if (store.get(VOL_KEY.taunts) === null) store.set(VOL_KEY.taunts, String(sfx));
  // Geral neutro e provocações herdando Efeitos preservam a mistura anterior na migração.
  return { master: readVol(VOL_KEY.master, 1), sfx, music: readVol(VOL_KEY.music, oldMute || store.get('warlock:music') === '0' ? 0 : musicDefault), taunts: readVol(VOL_KEY.taunts, sfx) };
}
export const saveVolume = (kind: keyof Volumes, value: number) => store.set(VOL_KEY[kind], String(value));

// Default music volume for players who have not set one; main.ts passes 0 in localhost test tabs (issue #158).
export function createSound(musicDefault?: number) {
  return new AudioPlayer(musicDefault).callbacks;
}

class AudioPlayer {
  private readonly vol: Volumes;
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private master: GainNode | null = null;
  private tauntMaster: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly gains = new Map<string, number>();
  private musicLevelStarted = false;
  private readonly music: HTMLAudioElement;
  private wantAmbience = false;
  private duckLevel = 1; // Shop music is reduced to 45%.
  private readonly unlockOnGesture = () => this.unlock();

  readonly callbacks = {
    volumes: () => this.vol,
    setVolume: (kind: keyof Volumes, value: number) => this.setVolume(kind, value),
    setAmbience: (on: boolean) => this.setAmbience(on),
    taunt: (name: string, level: number | (() => number) = 1) => this.taunt(name, level),
    play: (kind: SoundKind, volume = 1) => this.play(kind, volume),
    duck: (on: boolean) => this.duck(on),
  };

  constructor(musicDefault?: number) {
    this.vol = loadVolumes(musicDefault);
    this.music = new Audio('/music/battle.mp3');
    this.music.loop = true;
    this.music.preload = 'none'; // The lobby creates a player for UI sounds, but music loads only when a match requests it.
    addEventListener('pointerdown', this.unlockOnGesture);
    addEventListener('keydown', this.unlockOnGesture);
  }

  private async load(name: string, src = `/sfx/${name}.mp3`) {
    try {
      const response = await fetch(src);
      if (!response.ok) return;
      const buffer = await this.ctx!.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(name, buffer);
      this.gains.set(name, audioLevel(buffer).gain);
    } catch {
      // Other effects fall back to synthesis; Hold Ground uses only its selected recording.
    }
  }

  private unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      // Leave headroom for simultaneous hit and explosion layers.
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6 * channelVolume(this.vol, 'sfx');
      this.tauntMaster = this.ctx.createGain();
      this.tauntMaster.gain.value = 0.6 * channelVolume(this.vol, 'taunts');
      const compressor = this.ctx.createDynamicsCompressor();
      this.master.connect(compressor).connect(this.ctx.destination);
      this.tauntMaster.connect(compressor);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      // Pre-render synthesis outside playback so its normalized buffers are ready before use.
      if (typeof OfflineAudioContext !== 'undefined') {
        const kinds: SoundKind[] = ['fireball', 'lightning', 'homing', 'shield', 'teleport', 'hit', 'hitLight', 'hitHeavy', 'reflect', 'death', 'splash', 'shrink', 'beep', 'go', 'click', 'winRound', 'loseRound', 'buy', 'error', 'ready', 'hover', 'heal', 'sand'];
        for (const kind of kinds) {
          const offline = new OfflineAudioContext(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
          this.synth(kind, 1, offline, offline.destination);
          void offline.startRendering().then((buffer) => {
            this.buffers.set('synth/' + kind, buffer);
            // Synthesized audio has no recording noise, so it can use more gain while respecting the peak limit.
            this.gains.set('synth/' + kind, audioLevel(buffer, Infinity).gain);
          }).catch(() => {}); // Immediate synthesis remains available while the cache warms.
        }
      }
      const names = new Set(Object.values(FILES).flat());
      void Promise.all([...names].map((name) => this.load(name))).then(() => this.syncAmbience());
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.syncAmbience();
  }

  private volumes() {
    return this.vol;
  }

  // Music plays only in a match with sound on; continuous lava crackle was removed by the owner on 24/10.
  private syncAmbience() {
    const volumes = this.volumes();
    if (this.master) this.master.gain.value = 0.6 * channelVolume(volumes, 'sfx');
    if (this.tauntMaster) this.tauntMaster.gain.value = 0.6 * channelVolume(volumes, 'taunts');
    this.music.volume = Math.min(1, 0.35 * channelVolume(volumes, 'music') * this.duckLevel);
    const on = this.wantAmbience && !!this.ctx && this.ctx.state === 'running';
    if (on && channelVolume(volumes, 'music') > 0 && !this.musicLevelStarted && typeof this.ctx!.createMediaElementSource === 'function') {
      this.musicLevelStarted = true;
      const gain = this.ctx!.createGain();
      gain.gain.value = 1;
      this.ctx!.createMediaElementSource(this.music).connect(gain).connect(this.ctx!.createDynamicsCompressor()).connect(this.ctx!.destination);
      // Measure music on demand; opening the lobby must not download the track.
      void this.load('music', '/music/battle.mp3').then(() => { gain.gain.value = this.gains.get('music') ?? 1; });
    }
    if (on && channelVolume(volumes, 'music') > 0) void this.music.play().catch(() => {});
    else this.music.pause();
  }

  private file(name: string, volume: number, rate = 1) {
    const buffer = this.buffers.get(name);
    if (!buffer) return false;
    const source = this.ctx!.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = name.startsWith('synth/') || STEADY.has(name) ? 1 : rate * (0.94 + Math.random() * 0.12); // Synth and chosen recordings keep their timbre.
    const gain = this.ctx!.createGain();
    gain.gain.value = volume * (this.gains.get(name) ?? 1);
    source.connect(gain).connect(name.startsWith('taunt/') ? this.tauntMaster! : this.master!);
    source.start();
    return true;
  }

  private hiss(type: BiquadFilterType, f0: number, f1: number, duration: number, level: number, at = 0, context: BaseAudioContext = this.ctx!, output: AudioNode = this.master!) {
    const time = context.currentTime + at;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(f0, time);
    filter.frequency.exponentialRampToValueAtTime(f1, time + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(gain).connect(output);
    source.start(time, Math.random() * 0.5);
    source.stop(time + duration + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, duration: number, level: number, at = 0, context: BaseAudioContext = this.ctx!, output: AudioNode = this.master!) {
    const time = context.currentTime + at;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(f0, time);
    oscillator.frequency.exponentialRampToValueAtTime(f1, time + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain).connect(output);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.05);
  }

  private synth(kind: SoundKind, volume: number, context: BaseAudioContext = this.ctx!, output: AudioNode = this.master!) {
    const playTone = (type: OscillatorType, f0: number, f1: number, duration: number, level: number, at = 0) => this.tone(type, f0, f1, duration, level, at, context, output);
    const playHiss = (type: BiquadFilterType, f0: number, f1: number, duration: number, level: number, at = 0) => this.hiss(type, f0, f1, duration, level, at, context, output);
    switch (kind) {
      case 'sand': playHiss('bandpass', 1800, 600, 0.4, 0.4 * volume); break;
      // Rounded harmonics, soft attack and vibrato imitate an "ooh" choir without a recording.
      case 'heal':
        [261.63, 329.63, 392].forEach((note, voice) => {
          [1, 2, 3, 7].forEach((harmonic, i) => {
            const at = context.currentTime + voice * 0.03;
            const oscillator = context.createOscillator(), vibrato = context.createOscillator();
            const depth = context.createGain(), envelope = context.createGain();
            oscillator.type = vibrato.type = 'sine';
            oscillator.frequency.setValueAtTime(note * harmonic, at);
            vibrato.frequency.setValueAtTime(5.2 + voice * 0.17, at);
            depth.gain.value = harmonic * 1.2;
            vibrato.connect(depth).connect(oscillator.frequency);
            const voiceLevel = [0.065, 0.022, 0.008, 0.0015][i] * volume;
            envelope.gain.setValueAtTime(0.0001, at);
            envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, voiceLevel), at + 0.18);
            envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, voiceLevel * 0.85), at + 0.65);
            envelope.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
            oscillator.connect(envelope).connect(output);
            oscillator.start(at); vibrato.start(at);
            oscillator.stop(at + 1.65); vibrato.stop(at + 1.65);
          });
        });
        break;
      case 'fireball': playHiss('lowpass', 2400, 300, 0.45, 0.5 * volume); playTone('sawtooth', 160, 60, 0.3, 0.08 * volume); break;
      case 'lightning': playHiss('highpass', 3000, 800, 0.25, 0.7 * volume); playTone('square', 900, 120, 0.18, 0.08 * volume); break;
      case 'homing': playTone('sine', 300, 900, 0.4, 0.15 * volume); playHiss('bandpass', 1500, 2500, 0.4, 0.15 * volume); break;
      case 'shield': playTone('sine', 520, 780, 0.5, 0.18 * volume); playTone('sine', 780, 1170, 0.5, 0.08 * volume); break;
      case 'teleport': playTone('sine', 1400, 200, 0.3, 0.18 * volume); playHiss('bandpass', 4000, 600, 0.3, 0.2 * volume); break;
      case 'hit': playHiss('lowpass', 900, 120, 0.3, 0.9 * volume); playTone('sine', 120, 45, 0.25, 0.35 * volume); break;
      case 'reflect': playTone('triangle', 1200, 2400, 0.2, 0.2 * volume); break;
      case 'death': playHiss('lowpass', 1500, 100, 1.2, 0.6 * volume); playTone('sawtooth', 300, 50, 0.9, 0.1 * volume); break;
      case 'shrink': playTone('sawtooth', 80, 40, 1.2, 0.2 * volume); playHiss('lowpass', 400, 80, 1.2, 0.5 * volume); break;
      case 'beep': playTone('square', 660, 660, 0.12, 0.08 * volume); break;
      case 'go': playTone('square', 990, 990, 0.3, 0.1 * volume); break;
      // A short generated drum hit avoids sharp attack through its falling pitch.
      case 'click': playTone('sine', 180, 70, 0.14, 0.18 * volume); playTone('sine', 360, 140, 0.035, 0.035 * volume); break;
      // The hover cue is short; its measured level stays close to the other notices.
      case 'hover': playTone('sine', 1500, 1300, 0.03, 0.02 * volume); break;
      case 'hitLight': playHiss('lowpass', 1400, 300, 0.18, 0.6 * volume); playTone('sine', 200, 90, 0.15, 0.2 * volume); break;
      case 'hitHeavy': playHiss('lowpass', 700, 80, 0.45, volume); break;
      // The lava splash uses a long hiss and two low bubbles.
      case 'splash': playHiss('highpass', 5000, 1200, 0.9, 0.3 * volume); playHiss('lowpass', 600, 90, 0.6, 0.6 * volume); playTone('sine', 230, 70, 0.22, 0.25 * volume, 0.08); playTone('sine', 170, 55, 0.25, 0.2 * volume, 0.32); break;
      // Rising major arpeggio for a win, descending minor arpeggio for a loss.
      case 'winRound': [523, 659, 784, 1047].forEach((f, i) => playTone('triangle', f, f, 0.32, 0.14 * volume, i * 0.09)); break;
      case 'loseRound': [392, 311, 262].forEach((f, i) => playTone('triangle', f, f * 0.98, 0.35, 0.11 * volume, i * 0.14)); break;
      // Two high chimes signal a purchase.
      case 'buy': playTone('sine', 1320, 1320, 0.09, 0.12 * volume); playTone('sine', 1980, 1980, 0.16, 0.1 * volume, 0.06); break;
      case 'error': playTone('square', 170, 120, 0.18, 0.06 * volume); playTone('square', 150, 110, 0.18, 0.05 * volume, 0.12); break;
      // A soft chime signals that a cooldown is ready.
      case 'ready': playTone('sine', 880, 1320, 0.12, 0.05 * volume); break;
    }
  }

  private setVolume(kind: keyof Volumes, value: number) {
    this.vol[kind] = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    saveVolume(kind, this.vol[kind]);
    this.syncAmbience();
    tauntPreviewSession.setVolume(channelVolume(this.vol, 'taunts'));
    if (kind === 'sfx' || kind === 'master') this.play('click');
  }

  private setAmbience(on: boolean) {
    this.wantAmbience = on;
    this.syncAmbience();
  }

  private async taunt(name: string, level: number | (() => number) = 1) {
    const levelNow = () => Math.max(0, Math.min(1, typeof level === 'function' ? level() : level));
    const src = tauntAudioSrc(name);
    if (!src) return;
    if (!this.ctx || channelVolume(this.volumes(), 'taunts') === 0 || levelNow() === 0 || this.ctx.state !== 'running') return;
    const key = 'taunt/' + name;
    if (!this.buffers.has(key)) await this.load(key, src);
    if (channelVolume(this.volumes(), 'taunts') > 0 && levelNow() > 0) this.file(key, levelNow());
  }

  private play(kind: SoundKind, volume = 1) {
    if (!this.ctx || !this.noise || channelVolume(this.volumes(), 'sfx') === 0 || this.ctx.state !== 'running') return;
    const level = Math.max(0, Math.min(1, volume));
    if (!level) return;
    const names = FILES[kind];
    const loaded = names?.filter((name) => this.buffers.has(name)) ?? [];
    const each = layerVolume(level, loaded.length + (kind === 'hitHeavy' ? 1 : 0));
    const played = loaded.map((name) => this.file(name, each, RATE[kind])).some(Boolean);
    // Add a low synthetic hit under the recorded strong hit and explosion.
    if (kind === 'hitHeavy' && played) this.tone('sine', 110, 36, 0.4, 0.5 * each);
    if (played) return;
    if (!this.file('synth/' + kind, level)) this.synth(kind, level);
  }

  // Lower music in the shop without changing other channels.
  private duck(on: boolean) {
    this.duckLevel = on ? 0.45 : 1;
    this.syncAmbience();
  }
}
type ActiveTauntPreview = {
  audio: HTMLAudioElement;
  context: AudioContext | null;
  usesWebAudio: boolean;
};

class TauntPreviewSession {
  private active: ActiveTauntPreview | null = null;
  private request = 0;
  private volume = 0;

  setVolume(volume: number) {
    this.volume = volume;
    if (this.active) this.active.audio.volume = this.volume * (this.active.usesWebAudio ? 1 : .6);
  }

  stop() {
    const active = this.active;
    this.active = null;
    this.request++;
    active?.audio.pause();
    if (active?.context) void active.context.close().catch(() => {});
  }

  async play(name: string): Promise<boolean> {
    const src = tauntAudioSrc(name);
    if (!src) return false;

    this.stop();
    const request = this.request;
    const active: ActiveTauntPreview = { audio: new Audio(src), context: null, usesWebAudio: false };
    this.active = active;
    this.setVolume(channelVolume(loadVolumes(), 'taunts'));

    try {
      if (typeof AudioContext !== 'undefined') {
        const context = new AudioContext();
        active.context = context;
        // Unlock during the click gesture before waiting for download or decoding.
        if (context.state === 'suspended') void context.resume().catch(() => {});
        const response = await fetch(src);
        if (!response.ok) throw new Error('audio');
        if (!this.isCurrent(active, request)) return true;
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (!this.isCurrent(active, request)) return true;
        const source = context.createMediaElementSource(active.audio), gain = context.createGain();
        gain.gain.value = .6 * audioLevel(buffer).gain; // Match the normalized in-game taunt level.
        source.connect(gain).connect(context.createDynamicsCompressor()).connect(context.destination);
        active.usesWebAudio = true;
        this.setVolume(this.volume);
      } else this.setVolume(this.volume);
      await active.audio.play();
      return true;
    } catch {
      if (!this.isCurrent(active, request)) return true; // A replaced request succeeds from its caller's perspective.
      this.stop();
      return false;
    }
  }

  private isCurrent(active: ActiveTauntPreview, request: number) {
    return this.active === active && this.request === request;
  }
}

const tauntPreviewSession = new TauntPreviewSession();

// Private preview respects master × taunts, including mute, and never sends to the room.
export function previewTaunt(name: string): Promise<boolean> {
  return tauntPreviewSession.play(name);
}

export function stopTauntPreview() {
  tauntPreviewSession.stop();
}
