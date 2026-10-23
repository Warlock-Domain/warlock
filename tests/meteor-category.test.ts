import { describe, expect, it } from 'vitest';
import { SPELL_GROUPS_EN, SPELL_GROUPS_PT, spellClass } from '../src/client/rules-text.ts';
import { SPELL_GROUP_IDS } from '../src/shared/spells.ts';

describe('Meteoro na seção Controle', () => {
  it('move só a apresentação PT/EN, sem mudar pesos das cartas', () => {
    for (const groups of [SPELL_GROUPS_PT, SPELL_GROUPS_EN]) {
      expect(groups[0][2]).not.toContain('meteor');
      expect(groups[3][2]).toContain('meteor');
      expect(groups.flatMap(([, , ids]) => ids).filter((s) => s === 'meteor')).toHaveLength(1);
    }
    expect(spellClass('meteor')).toBe('g-controle');
    expect(SPELL_GROUP_IDS.attack).toContain('meteor');
  });
});
