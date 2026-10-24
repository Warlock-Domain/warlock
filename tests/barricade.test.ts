import { describe, expect, it } from 'vitest';
import { stepWorld } from '../src/shared/sim.ts';
import { noSpells, spellLevel } from '../src/shared/spells.ts';
import { world } from './helpers.ts';

// p0 lança a Barricada em (4, 0); p1 está no ponto ou longe dele
function drop(target: [number, number]) {
  const w = world([[0, 0], target], { ...noSpells(), rockpillar: 1 });
  stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'rockpillar', at: { x: 4, y: 0 } }], () => 0.5);
  const hits = w.events.filter((e) => e.k === 'hit');
  for (let i = 0; i < 10; i++) stepWorld(w, [], () => 0.5);
  return { w, hits };
}

describe('Barricada cai do céu (issue #206)', () => {
  it('quem está embaixo leva o dano da queda e é empurrado para fora da parede', () => {
    const { w, hits } = drop([4, 0.2]);
    expect(hits).toEqual([expect.objectContaining({ id: 'p1', by: 'p0', src: 'rockpillar', dmg: spellLevel('rockpillar', 1).dmg })]);
    expect(w.wizards[1].pos.x).toBeGreaterThan(4.4); // empurrado para o lado de fora da linha da parede (ela fica atravessada no caminho)
  });

  it('a parede continua aparecendo na hora, e quem está longe dela não leva nada', () => {
    const { w, hits } = drop([8, 3]);
    expect(hits).toEqual([]);
    expect(w.pillars.filter((p) => p.kind === 'rockpillar' && p.alive)).toHaveLength(3);
  });
});
