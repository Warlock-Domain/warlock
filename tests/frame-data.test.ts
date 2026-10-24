import { describe, expect, it } from 'vitest';
import { illusionCopies, pickWatched } from '../src/client/screen-data.ts';

describe('espectador (pickWatched)', () => {
  const alive = [
    { id: 'a', hp: 40 },
    { id: 'b', hp: 90 },
    { id: 'c', hp: 60 },
  ];
  it('continua em quem eu já assistia', () => expect(pickWatched(alive, 'c', 0)?.id).toBe('c'));
  it('sem ninguém escolhido, segue o vivo com mais vida', () => expect(pickWatched(alive, null, 0)?.id).toBe('b'));
  it('quem eu assistia caiu: troca para o de mais vida', () => expect(pickWatched(alive, 'x', 0)?.id).toBe('b'));
  it('← e → andam na lista e dão a volta', () => {
    expect(pickWatched(alive, 'c', 1)?.id).toBe('a');
    expect(pickWatched(alive, 'a', -1)?.id).toBe('c');
  });
  it('ninguém vivo: ninguém', () => expect(pickWatched([], 'a', 1)).toBeUndefined());
});

describe('cópias da Ilusão (illusionCopies)', () => {
  const owner = { id: 'p1', pos: { x: 0, y: 0 }, facing: 0, status: 16 | 1024 | 2048 | 8388608 | 4, basicLeft: 3, moving: false, cheer: true, illusion: false, ghost: true };
  const ids = ['p1'];
  it('a cópia usa o visual do dono, no lugar do projétil, sólida e sem o arremessado', () => {
    const [c] = illusionCopies([{ kind: 'illusion', pos: { x: 5, y: 6 }, vel: { x: 0, y: 1.5 } }], ids, [owner]);
    expect(c).toEqual({ ...owner, id: 'p1~ilusao', pos: { x: 5, y: 6 }, facing: 1.5, status: 4, basicLeft: 0, moving: true, cheer: false, illusion: true, ghost: false });
  });
  it('outros projéteis e dono que não está na tela não viram cópia', () => {
    expect(illusionCopies([{ kind: 'fireball', pos: { x: 1, y: 1 }, vel: { x: 0, y: 0 } }], ids, [owner])).toEqual([]);
    expect(illusionCopies([{ kind: 'illusion', pos: { x: 1, y: 1 }, vel: { x: 0, y: 0 } }], ids, [])).toEqual([]);
  });
});
