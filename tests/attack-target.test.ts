import { describe, expect, it } from 'vitest';
import { attackTarget, sniperTarget } from '../src/shared/sniper-target.ts';
import { v } from '../src/shared/vec.ts';

const me = { id: 'me', pos: v(0, 0), alive: true, team: 0 };
const near = { id: 'near', pos: v(3, 0), alive: true, team: 1 };
const far = { id: 'far', pos: v(5, 2), alive: true, team: 1 };
const ally = { id: 'ally', pos: v(1, 0), alive: true, team: 0 };
const units = [me, near, far, ally];

describe('target lock preview', () => {
  it('Attack marks the hovered body, else the body at the cursor, else the nearest enemy in range', () => {
    expect(attackTarget(units, me, v(0, 9), 6, 'far')?.id).toBe('far');
    expect(attackTarget(units, me, v(5, 2.3), 6)?.id).toBe('far');
    expect(attackTarget(units, me, v(0, 9), 6)?.id).toBe('near');
    expect(attackTarget(units, me, v(1, 0), 6, 'ally')?.id).toBe('near');
    expect(attackTarget(units, me, v(0, 9), 2)).toBeUndefined();
  });
  it('Inelegant Solution takes the hovered enemy even when the ground point misses its body', () => {
    expect(sniperTarget(units, me, v(5, 4), 20)).toBeUndefined();
    expect(sniperTarget(units, me, v(5, 4), 20, 'far')?.id).toBe('far');
    expect(sniperTarget(units, me, v(5, 4), 20, 'ally')).toBeUndefined();
  });
});
