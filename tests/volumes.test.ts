import { describe, expect, it, vi } from 'vitest';
import { channelVolume, isAudioMuted, loadVolumes, saveVolume } from '../src/client/sound.ts';

// menu inicial e sala leem o mesmo volume guardado (issue #128): trocar de tela recarrega a página e lê de novo
describe('volumes guardados', () => {
  // antes de guardar qualquer volume: o padrão da música vem de quem cria o som (0 nas abas de teste em localhost, issue #158)
  it('sem volume guardado, a música começa no padrão pedido', () => {
    expect(loadVolumes()).toEqual({ master: 1, sfx: 1, music: 0.7, taunts: 1 });
    expect(loadVolumes(0)).toEqual({ master: 1, sfx: 1, music: 0, taunts: 1 });
  });
  it('o volume mexido numa tela volta igual na outra', () => {
    saveVolume('music', 0.4);
    saveVolume('sfx', 0);
    expect(loadVolumes()).toEqual({ master: 1, sfx: 0, music: 0.4, taunts: 1 });
  });
  it('provocações e Geral salvos são independentes de Efeitos e Música', () => {
    saveVolume('taunts', .8); saveVolume('master', .5);
    const vol = loadVolumes();
    expect(vol).toEqual({ master: .5, sfx: 0, music: .4, taunts: .8 });
    expect(channelVolume(vol, 'sfx')).toBe(0);
    expect(channelVolume(vol, 'taunts')).toBe(.4);
    expect(channelVolume(vol, 'music')).toBe(.2);
    expect(isAudioMuted(vol)).toBe(false);
    expect(isAudioMuted({ ...vol, master: 0 })).toBe(true);
  });
  it('migra provocações uma só vez, preservando o volume anterior sem seguir mudanças futuras de Efeitos', async () => {
    vi.resetModules();
    const values = new Map([['warlock:vol-sfx', '.25'], ['warlock:vol-music', '.4']]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) });
    try {
      const sound = await import('../src/client/sound.ts');
      expect(sound.loadVolumes()).toEqual({ master: 1, sfx: .25, music: .4, taunts: .25 });
      sound.saveVolume('sfx', .9);
      expect(sound.loadVolumes().taunts).toBe(.25);
    } finally { vi.unstubAllGlobals(); vi.resetModules(); }
  });
});
