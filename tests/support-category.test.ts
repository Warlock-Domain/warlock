import { describe, expect, it } from 'vitest';
import { BAR_SPELLS, SPELL_GROUP_IDS } from '../src/shared/spells.ts';
import { SPELL_GROUPS_PT, SPELL_GROUPS_EN, groupClass, spellClass } from '../src/client/rules-text.ts';
import book from '../src/client/grimoire.ts?raw';
import shop from '../src/client/ui.ts?raw';
const { readFileSync } = await import('node:fs' as string) as { readFileSync(path: URL, encoding: 'utf8'): string };
const css = readFileSync(new URL('../src/client/style.css', import.meta.url), 'utf8');

describe('Support category', () => {
  it('contains support spells in Portuguese and English without duplicating other groups', () => {
    for (const [groups, name] of [[SPELL_GROUPS_PT, 'Suporte'], [SPELL_GROUPS_EN, 'Support']] as const) {
      expect(groups).toHaveLength(6);
      expect(groups[4][0]).toBe(name);
      expect(groups[4][2]).toEqual(['heal', 'geyser', 'transfusion']);
      expect(groups.flatMap(([, , ids]) => ids).sort()).toEqual([...BAR_SPELLS].sort());
      expect(groups[1][2]).toEqual(SPELL_GROUP_IDS.mobility);
      expect(groups[2][2]).toEqual(SPELL_GROUP_IDS.defense);
    }
    expect(groupClass('Suporte')).toBe('g-suporte');
    expect(groupClass('Support')).toBe('g-suporte');
    expect(spellClass(SPELL_GROUP_IDS.mobility[0])).toBe('g-mobilidade');
  });
  it('gives Support the previous green and makes Mobility gold', () => {
    expect(css).toMatch(/\.g-suporte\s*\{\s*--g:\s*#8be36a;/);
    expect(css).toMatch(/\.g-mobilidade\s*\{\s*--g:\s*var\(--gold\);/);
  });
  it('shares the catalog across Shop, Learn and Grimoire, preserving empty groups without a search', () => {
    expect(shop).toContain('const grid = SPELL_GROUPS.map');
    expect(book).toContain('...SPELL_GROUPS.map(([g, hint, ids])');
    expect(book).toContain("searchFilter(groups, '.lib-tile', search.value, (g) => only !== 'all' && g.dataset.filter !== only, true)");
    expect(shop).toContain('keepEmpty && !q && cards.length === 0');
  });
});
