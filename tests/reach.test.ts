import { describe, expect, it } from 'vitest';
import { blastOf, reachOf } from '../src/client/reach.ts';
import { OBSTACLES, PROJ_R, PROJ_SPAWN, WALL_GAP } from '../src/shared/constants.ts';
import { SCOURGE, noItems } from '../src/shared/items.ts';
import { snowR } from '../src/shared/sim.ts';
import { RUSH, SPELL_IDS, noSpells, spellLevel } from '../src/shared/spells.ts';

describe('círculo de alcance', () => {
  it('Agarrar mostra o alcance da marca e seu raio, sem o avanço de um projétil', () => {
    const spells = { ...noSpells(), grip: 1 };
    expect(reachOf('grip', spells, noItems())).toBeCloseTo(spellLevel('grip', 1).range);
    expect(reachOf('grip', spells, { ...noItems(), helmet: 1 })).toBeCloseTo(spellLevel('grip', 1).range * .9);
    expect(blastOf('grip', spells)).toBe(1.5);
    expect(blastOf('grip', noSpells())).toBe(0);
  });
  it('área no ponto mirado: raio da Zona de dobra no nível e meia largura da Barricada', () => {
    const spells = { ...noSpells(), warpzone: 3, rockpillar: 1 };
    expect(blastOf('warpzone', spells)).toBeCloseTo(spellLevel('warpzone', 3).radius);
    expect(blastOf('rockpillar', spells)).toBeCloseTo(WALL_GAP + OBSTACLES.rockpillar.r);
    expect([blastOf('warpzone', noSpells()), blastOf('rockpillar', noSpells())]).toEqual([0, 0]);
  });
  it('mostra o alcance do nível atual; o Elmo encurta 10%', () => {
    const spells = { ...noSpells(), lightning: 3 };
    expect(reachOf('lightning', spells, noItems())).toBeCloseTo(spellLevel('lightning', 3).range);
    expect(reachOf('lightning', spells, { ...noItems(), helmet: 1 })).toBeCloseTo(spellLevel('lightning', 3).range * 0.9);
    expect(reachOf('lightning', noSpells(), noItems())).toBe(0); // não tem a magia
  });

  it('projétil: até onde a ponta chega (nasce na frente do mago e tem raio); Meteoro: explosão no ponto mirado (issue #82)', () => {
    const spells = { ...noSpells(), fireball: 1, snowball: 2, meteor: 3 };
    expect(reachOf('fireball', spells, noItems())).toBeCloseTo(spellLevel('fireball', 1).range + PROJ_SPAWN + PROJ_R);
    expect(reachOf('fireball', spells, { ...noItems(), helmet: 1 })).toBeCloseTo(spellLevel('fireball', 1).range * 0.9 + PROJ_SPAWN + PROJ_R);
    expect(reachOf('snowball', spells, noItems())).toBeCloseTo(spellLevel('snowball', 2).range + PROJ_SPAWN + snowR(2));
    expect(reachOf('meteor', spells, noItems())).toBeCloseTo(spellLevel('meteor', 3).range); // onde dá para mirar
    expect([blastOf('meteor', spells), blastOf('fireball', spells), blastOf('meteor', noSpells())]).toEqual([spellLevel('meteor', 3).radius, 0, 0]);
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
