import { describe, expect, it } from 'vitest';
import { illusionCopies, pickWatched } from '../src/client/screen-data.ts';

describe('spectator target (pickWatched)', () => {
  const alive = [
    { id: 'a', hp: 40 },
    { id: 'b', hp: 90 },
    { id: 'c', hp: 60 },
  ];
  it('keeps the wizard already being watched', () => expect(pickWatched(alive, 'c', 0)?.id).toBe('c'));
  it('with nobody chosen, follows the living wizard with most HP', () => expect(pickWatched(alive, null, 0)?.id).toBe('b'));
  it('when the watched wizard is gone, switches to the one with most HP', () => expect(pickWatched(alive, 'x', 0)?.id).toBe('b'));
  it('left and right walk the list and wrap around', () => {
    expect(pickWatched(alive, 'c', 1)?.id).toBe('a');
    expect(pickWatched(alive, 'a', -1)?.id).toBe('c');
  });
  it('nobody alive: nobody watched', () => expect(pickWatched([], 'a', 1)).toBeUndefined());
});

describe('Illusion copies (illusionCopies)', () => {
  const owner = { id: 'p1', pos: { x: 0, y: 0 }, facing: 0, status: 16 | 1024 | 2048 | 8388608 | 4, basicLeft: 3, moving: false, cheer: true, illusion: false, ghost: true };
  const ids = ['p1'];
  it("uses the owner's look at the projectile position, solid and without the thrown state", () => {
    const [c] = illusionCopies([{ kind: 'illusion', pos: { x: 5, y: 6 }, vel: { x: 0, y: 1.5 } }], ids, [owner]);
    expect(c).toEqual({ ...owner, id: 'p1~ilusao', pos: { x: 5, y: 6 }, facing: 1.5, status: 4, basicLeft: 0, moving: true, cheer: false, illusion: true, ghost: false });
  });
  it('other projectiles and owners not on screen make no copy', () => {
    expect(illusionCopies([{ kind: 'fireball', pos: { x: 1, y: 1 }, vel: { x: 0, y: 0 } }], ids, [owner])).toEqual([]);
    expect(illusionCopies([{ kind: 'illusion', pos: { x: 1, y: 1 }, vel: { x: 0, y: 0 } }], ids, [])).toEqual([]);
  });
});
