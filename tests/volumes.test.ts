import { describe, expect, it } from 'vitest';
import { loadVolumes, saveVolume } from '../src/client/sound.ts';

// menu inicial e sala leem o mesmo volume guardado (issue #128): trocar de tela recarrega a página e lê de novo
describe('volumes guardados', () => {
  it('o volume mexido numa tela volta igual na outra', () => {
    saveVolume('music', 0.4);
    saveVolume('sfx', 0);
    expect(loadVolumes()).toEqual({ sfx: 0, music: 0.4 });
  });
});
