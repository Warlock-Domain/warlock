import { describe, expect, it } from 'vitest';
import { ITEM_IDS } from '../src/shared/items.ts';
import { SPELLS, SPELL_IDS, type Level } from '../src/shared/spells.ts';
import { RULES_SHORT, SPELL_GROUPS, SPELL_USE } from '../src/client/rules-text.ts';
import { ITEM_ROWS, SPELL_ROWS } from '../src/client/tips.ts';
import { ICON, ITEM_ICON } from '../src/client/icons.ts';

describe('loja: dados para decidir', () => {
  it('puts every spell in exactly one group, with a purpose and a description', () => {
    const grouped = SPELL_GROUPS.flatMap(([, , ids]) => ids);
    expect([...grouped].sort()).toEqual([...SPELL_IDS].sort());
    for (const s of SPELL_IDS) {
      expect(SPELL_USE[s]).toBeTruthy();
      expect(RULES_SHORT[s]).toBeTruthy();
    }
  });

  it('shows a tip row for every level field that is not zero', () => {
    // velocidade do projétil não aparece na dica; o resto, se existe na magia, tem de mexer em alguma linha
    const fields = (Object.keys(SPELLS.fireball.levels[0]) as (keyof Level)[]).filter((f) => f !== 'speed');
    for (const s of SPELL_IDS) {
      const l = SPELLS[s].levels[0];
      for (const f of fields) {
        if (!l[f]) continue;
        const bumped = { ...l, [f]: l[f] * 2 + 1 };
        const changed = SPELL_ROWS[s].some(([, show]) => show(l) !== show(bumped));
        expect(changed, `${s}.${f} sem linha na dica`).toBe(true);
      }
    }
  });

  it('has tip rows for every item', () => {
    for (const i of ITEM_IDS) expect(ITEM_ROWS[i]?.(0).length, i).toBeGreaterThan(0);
  });

  it('gives every spell and item its own icon', () => {
    const all = [...Object.values(ICON), ...Object.values(ITEM_ICON)];
    expect(new Set(all).size).toBe(all.length);
  });
});
