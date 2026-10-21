import { describe, expect, it } from 'vitest';
import { SPELL_GROUP_IDS, SPELL_IDS } from '../src/shared/spells.ts';

describe('grupos de magia', () => {
  it('every spell has exactly one group', () => {
    const all = Object.values(SPELL_GROUP_IDS).flat();
    expect([...all].sort()).toEqual([...SPELL_IDS].sort());
  });
});
