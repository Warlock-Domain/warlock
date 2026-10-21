import { describe, expect, it } from 'vitest';
import { loadVolumes, saveVolume } from '../src/client/sound.ts';

// menu inicial e sala leem o mesmo volume guardado (issue #128): trocar de tela recarrega a página e lê de novo
describe('volumes guardados', () => {
  // antes de guardar qualquer volume: o padrão da música vem de quem cria o som (0 nas abas de teste em localhost, issue #158)
  it('sem volume guardado, a música começa no padrão pedido', () => {
    expect(loadVolumes()).toEqual({ sfx: 1, music: 0.7 });
    expect(loadVolumes(0)).toEqual({ sfx: 1, music: 0 });
  });
  it('o volume mexido numa tela volta igual na outra', () => {
    saveVolume('music', 0.4);
    saveVolume('sfx', 0);
    expect(loadVolumes()).toEqual({ sfx: 0, music: 0.4 });
  });
});
