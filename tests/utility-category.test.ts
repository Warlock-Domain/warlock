import { describe, expect, it } from 'vitest';
import { SPELL_GROUP_IDS, BAR_SPELLS } from '../src/shared/spells.ts';
import { SPELL_GROUPS_PT, SPELL_GROUPS_EN, groupClass } from '../src/client/rules-text.ts';

describe('Utility category', () => {
  it('contains Elemental Spheres without moving or duplicating existing spells', () => {
    expect(SPELL_GROUP_IDS.utility).toEqual(['elemental']);
    for (const [groups, title] of [[SPELL_GROUPS_PT, 'Utilidade'], [SPELL_GROUPS_EN, 'Utility']] as const) {
      expect(groups[5]).toEqual([title, expect.any(String), ['elemental']]);
      expect(groups.flatMap(([, , ids]) => ids).sort()).toEqual([...BAR_SPELLS].sort());
    }
  });
  it('uses the same group style in both languages', () => {
    expect(groupClass('Utilidade')).toBe('g-utilidade');
    expect(groupClass('Utility')).toBe('g-utilidade');
  });
});
