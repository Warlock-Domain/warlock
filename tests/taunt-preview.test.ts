import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewTaunt, stopTauntPreview } from '../src/client/sound.ts';

afterEach(() => { stopTauntPreview(); vi.unstubAllGlobals(); });

describe('prévia privada da provocação', () => {
  it('toca originais e áudios da Loja desmutados e interrompe a prévia anterior', async () => {
    const audios: { src: string; muted: boolean; volume: number; pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal('Audio', class {
      muted = true; volume = 0;
      pause = vi.fn(); play = vi.fn().mockResolvedValue(undefined);
      constructor(public src: string) { audios.push(this); }
    });
    expect(await previewTaunt('laugh')).toBe(true);
    expect(audios[0].src).toBe('/sfx/taunt/laugh.mp3');
    expect(audios[0].muted).toBe(false);
    expect(audios[0].volume).toBe(1);
    expect(await previewTaunt('meow')).toBe(true);
    expect(audios[0].pause).toHaveBeenCalledOnce();
    expect(audios[1].src).toBe('/sfx/taunt/meow.mp3');
    expect(audios[1].play).toHaveBeenCalledOnce();
    stopTauntPreview();
    expect(audios[1].pause).toHaveBeenCalledOnce();
  });
  it('recusa nomes fora do catálogo e informa erro de reprodução', async () => {
    const create = vi.fn();
    vi.stubGlobal('Audio', class {
      pause = vi.fn(); play = vi.fn().mockRejectedValue(new Error('falha'));
      constructor() { create(); }
    });
    expect(await previewTaunt('../segredo')).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(await previewTaunt('meow')).toBe(false);
  });
  it('não trata a troca rápida de fala como erro da prévia anterior', async () => {
    let rejectFirst: (e: Error) => void;
    let count = 0;
    vi.stubGlobal('Audio', class {
      pause = vi.fn();
      play() { return ++count === 1 ? new Promise<void>((_, reject) => { rejectFirst = reject; }) : Promise.resolve(); }
    });
    const first = previewTaunt('laugh');
    expect(await previewTaunt('meow')).toBe(true);
    rejectFirst!(new Error('interrompido'));
    expect(await first).toBe(true);
  });
});
