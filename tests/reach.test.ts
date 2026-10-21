import { describe, expect, it } from 'vitest';
import { aimOf, blastOf, hitR, reachOf } from '../src/client/reach.ts';
import { PROJ_R, PROJ_SPAWN, WIZ_R } from '../src/shared/constants.ts';
import { SCOURGE, noItems } from '../src/shared/items.ts';
import { snowR } from '../src/shared/sim.ts';
import { CLUSTER_FAN, RUSH, SPELL_IDS, noSpells, spellLevel } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';

describe('círculo de alcance', () => {
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

describe('largura do acerto e explosão na mira (pedido do Fernando, 21/10)', () => {
  const from = v(0, 0), at = v(2, 0);
  const all = Object.fromEntries(SPELL_IDS.map((s) => [s, 1])) as ReturnType<typeof noSpells>;
  const reach = (s: Parameters<typeof reachOf>[0]) => reachOf(s, all, noItems());

  it('faixa da largura do projétil (corpo do inimigo encostou = acerto), até o alcance na direção da mira', () => {
    const fb = aimOf('fireball', all, noItems(), from, at);
    expect(fb.half).toBeCloseTo(PROJ_R);
    expect(fb.ends).toHaveLength(1);
    expect(fb.ends[0].x).toBeCloseTo(reach('fireball'));
    expect(fb.blastR).toBe(0);
    expect(aimOf('lightning', all, noItems(), from, at)).toMatchObject({ half: 0, ends: [v(reach('lightning'), 0)] }); // linha: só quem o corpo cruza
    expect(aimOf('snowball', all, noItems(), from, at).half).toBeCloseTo(snowR(1));
    for (const s of ['grip', 'magnetize', 'bouncer', 'recharge', 'link', 'swap'] as const) expect(aimOf(s, all, noItems(), from, at).half).toBeCloseTo(PROJ_R);
  });

  it('Rajada: uma faixa por projétil do leque', () => {
    const c = aimOf('cluster', all, noItems(), from, at);
    expect(c.ends).toHaveLength(CLUSTER_FAN.length);
    c.ends.forEach((e, i) => expect(Math.atan2(e.y, e.x)).toBeCloseTo(CLUSTER_FAN[i]));
  });

  it('Bola de neve explode no fim do voo; Gravidade queima em volta do caminho e no fim; Meteoro no ponto mirado', () => {
    const sn = aimOf('snowball', all, noItems(), from, at);
    expect(sn.blastR).toBeCloseTo(spellLevel('snowball', 1).radius - WIZ_R); // ela pega pelo centro: o corpo encosta a WIZ_R antes
    expect(sn.blastAt!.x).toBeCloseTo(reach('snowball') - snowR(1));
    const g = aimOf('gravity', all, noItems(), from, at);
    expect(g.half).toBeCloseTo(spellLevel('gravity', 1).radius - WIZ_R);
    expect(g.blastR).toBeCloseTo(g.half);
    expect(g.blastAt!.x).toBeCloseTo(reach('gravity') - PROJ_R);
    const m = aimOf('meteor', all, noItems(), from, at);
    expect([m.ends, m.half, m.blastR, m.blastAt]).toEqual([[], 0, spellLevel('meteor', 1).radius, at]);
    expect(aimOf('meteor', all, noItems(), from, v(50, 0)).blastAt!.x).toBeCloseTo(reach('meteor')); // sem passar do alcance
  });

  it('Drenar vira no ponto mirado: a faixa para ali; sem faixa no Bumerangue, Míssil, Divisor e magias sem projétil', () => {
    expect(aimOf('drain', all, noItems(), from, at).ends[0].x).toBeCloseTo(2);
    for (const s of ['boomerang', 'homing', 'splitter', 'teleport', 'shield', 'scourge'] as const) expect(aimOf(s, all, noItems(), from, at)).toMatchObject({ ends: [], blastR: 0 });
  });
});

describe('hitbox de verdade na sandbox (pedido do Fernando, 21/10)', () => {
  it('círculos que se encostam = acerto: mago e Ilusão com WIZ_R, projétil com o raio dele; sem círculo no que não bate', () => {
    expect([hitR('fireball'), hitR('shard'), hitR('swap'), hitR('snowball'), hitR('illusion')]).toEqual([PROJ_R, PROJ_R, PROJ_R, snowR(1), WIZ_R]);
    for (const k of ['meteor', 'warpzone', 'gravity'] as const) expect(hitR(k)).toBe(0);
  });
});
