import { describe, expect, it } from 'vitest';
import { reachOf } from '../src/client/reach.ts';
import { SCOURGE, noItems } from '../src/shared/items.ts';
import { RUSH, SPELL_IDS, noSpells, spellLevel } from '../src/shared/spells.ts';

describe('círculo de alcance', () => {
  it('mostra o alcance do nível atual; o Elmo encurta 10%', () => {
    const spells = { ...noSpells(), lightning: 3 };
    expect(reachOf('lightning', spells, noItems())).toBeCloseTo(spellLevel('lightning', 3).range);
    expect(reachOf('lightning', spells, { ...noItems(), helmet: 1 })).toBeCloseTo(spellLevel('lightning', 3).range * 0.9);
    expect(reachOf('lightning', noSpells(), noItems())).toBe(0); // não tem a magia
  });

  it('sem alcance fixo: raio da bolha do Escudo, avanço da Investida, explosão do Flagelo; nada no Míssil e no Pacto', () => {
    const all = Object.fromEntries(SPELL_IDS.map((s) => [s, 1])) as ReturnType<typeof noSpells>;
    expect(reachOf('shield', all, noItems())).toBeCloseTo(spellLevel('shield', 1).radius);
    expect(reachOf('rush', all, noItems())).toBe(RUSH.dash);
    expect(reachOf('scourge', all, noItems())).toBe(SCOURGE.radius);
    expect(reachOf('homing', all, noItems())).toBe(0);
    expect(reachOf('pact', all, noItems())).toBe(0);
    // toda magia com alcance mostra algo
    for (const s of SPELL_IDS) if (spellLevel(s, 1).range > 0) expect(reachOf(s, all, noItems())).toBeGreaterThan(0);
  });
});
