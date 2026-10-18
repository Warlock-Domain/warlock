import { describe, expect, it } from 'vitest';
import { noItems } from '../src/shared/items.ts';
import { SPELL_IDS, type SpellId } from '../src/shared/spells.ts';
import { BASE, diff, sheet } from '../src/client/sheet.ts';

const spells = (s: Partial<Record<SpellId, number>> = {}) => ({ ...Object.fromEntries(SPELL_IDS.map((k) => [k, 0])), fireball: 1, ...s }) as Record<SpellId, number>;

describe('ficha do mago', () => {
  it('shows totals with the item that gives each part', () => {
    const rows = sheet(spells(), { ...noItems(), ring: 2 });
    const hp = rows.find((r) => r.group === BASE && r.label === 'Vida máxima')!;
    expect(hp.value).toBe('119');
    expect(hp.from).toBe('+19 de Anel de vida nível 2');
    expect(rows.some((r) => r.group === 'Bola de fogo' && r.label === 'Recarga')).toBe(true);
  });

  it('previews what a purchase changes, marking what gets worse', () => {
    const before = sheet(spells(), noItems());
    const after = sheet(spells(), { ...noItems(), helmet: 1 });
    const ch = diff(before, after);
    expect(ch.find((c) => c.label === 'Empurrão recebido')).toMatchObject({ before: '100%', after: '85%', worse: false });
    expect(ch.find((c) => c.label === 'Alcance das magias')).toMatchObject({ before: '100%', after: '90%', worse: true });
    expect(ch.find((c) => c.label === 'Bola de fogo · Alcance')?.worse).toBe(true);
    // vender a magia: as linhas dela somem
    expect(diff(before, sheet(spells({ fireball: 0 }), noItems())).every((c) => c.after === null && c.worse)).toBe(true);
  });
});
