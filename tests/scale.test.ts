// Escala ×10 de 18/10 (vida 1000, como no Warlock original): só mudou a unidade. Os empurrões abaixo foram medidos
// na escala antiga (vida 100) antes da troca e têm de continuar iguais.
import { describe, expect, it } from 'vitest';
import { HP_MAX, UNIT, WIZ_SPEED } from '../src/shared/constants.ts';
import { noItems } from '../src/shared/items.ts';
import { newWorld, stepWorld, type World } from '../src/shared/sim.ts';
import { RUSH, SPELLS, noSpells, type SpellId } from '../src/shared/spells.ts';
import { len, v } from '../src/shared/vec.ts';

// empurrão (m/s) por golpe nos níveis 1 e 7, medido na escala antiga
const KNOCK_BEFORE: Partial<Record<SpellId, [number, number]>> = {
  fireball: [4.529, 7.2464], lightning: [4.16668, 7.023832], homing: [3.26088 * 0.34 / 0.72, 6.05592 * 0.34 / 0.72], // balanceamento (18/10): Míssil ×0,72 → ×0,34; Bola de neve (45 + 35 nv) ×1,3; Gêmeos ×1,08 meteor: [4.69722, 7.25934], cluster: [1.387815, 2.144805],
  boomerang: [4.30255, 6.51529], thrust: [3.882, 6.2112], bouncer: [4.19256, 7.91928], drain: [0.7764, 1.5528], snowball: [2.67858 * 1.3 / 1.15, (8.03574 * (255 * 1.3)) / (135 * 1.15)],
  twin: [3.074544, 5.031072], recharge: [3.882, 6.5994], windwalk: [3.4938, 5.823], splitter: [1.941, 3.882],
};

// p0 em (0,0) com o Pacto (se pedir) lança a Bola de fogo em p1, a 3 m; devolve p1 no passo do acerto e o dano do acerto
function fireballHit(prepare: (w: World) => void = () => {}, pact = false) {
  const w = newWorld(['p0', 'p1'], { p0: noSpells(), p1: noSpells() }, { p0: { ...noItems(), pact: pact ? 1 : 0 } });
  [w.wizards[0].pos, w.wizards[1].pos] = [v(0, 0), v(3, 0)];
  for (const z of w.wizards) z.invulnUntil = 0;
  prepare(w);
  if (pact) stepWorld(w, [{ id: 'p0', kind: 'item', item: 'pact', at: v(0, 0) }]);
  for (let i = 0; i < 15; i++) stepWorld(w, []);
  stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: v(3, 0) }]);
  for (let i = 0; i < 120 && !w.events.some((e) => e.k === 'hit'); i++) stepWorld(w, []);
  const hit = w.events.find((e) => e.k === 'hit');
  return { z: w.wizards[1], dmg: hit?.k === 'hit' ? hit.dmg : 0 };
}

describe('escala ×10 (vida 1000): o jogo continua igual', () => {
  it('every damage spell pushes exactly as before', () => {
    for (const [id, [l1, l7]] of Object.entries(KNOCK_BEFORE) as [SpellId, [number, number]][]) {
      expect(SPELLS[id].levels[0].knock, id).toBeCloseTo(l1, 9);
      expect(SPELLS[id].levels[6].knock, id).toBeCloseTo(l7, 9);
    }
  });

  it('a fireball hit: 70 of damage (7 before) and the same push', () => {
    const { z, dmg } = fireballHit();
    expect(dmg).toBe(70);
    expect(len(z.vel)).toBeCloseTo(4.529, 9);
  });

  it('damage taken scales the push the same way (40% of the max life: ×1,4)', () => {
    const { z } = fireballHit((w) => (w.wizards[1].dmgTaken = HP_MAX * 0.4));
    expect(len(z.vel)).toBeCloseTo(4.529 * 1.4, 9);
  });

  it('a hit above the soft cap still pushes by the square root (Pact: 14 → 140 of damage)', () => {
    const { z, dmg } = fireballHit(() => {}, true);
    expect(dmg).toBe(140);
    // escala antiga: 14 de dano, teto 10, 0,647 m/s por ponto
    expect(len(z.vel)).toBeCloseTo(14 * 0.647 * (Math.sqrt(10 * 14) / 14), 9);
  });

  it('Rush turns absorbed damage into the same extra speed (35 absorbed, 3,5 before)', () => {
    const w = newWorld(['p0', 'p1'], { p0: noSpells(), p1: { ...noSpells(), rush: 1 } });
    [w.wizards[0].pos, w.wizards[1].pos] = [v(0, 0), v(4, 0)];
    for (const z of w.wizards) z.invulnUntil = 0;
    const z = w.wizards[1];
    stepWorld(w, [{ id: 'p1', kind: 'cast', spell: 'rush', at: v(4, 9) }]);
    for (let i = 0; i < 17; i++) stepWorld(w, []);
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: z.pos }]);
    for (let i = 0; i < 120 && !w.events.some((e) => e.k === 'hit'); i++) stepWorld(w, []);
    stepWorld(w, []);
    // escala antiga: metade da Bola de fogo (3,5) × 15 unidades/s por ponto, até o que a Investida absorve (12,5 desde o balanceamento de 18/10)
    expect(z.speed - WIZ_SPEED - RUSH.bonus).toBeCloseTo(Math.min(35, SPELLS.rush.levels[0].absorb) * 1.5 * UNIT, 9);
  });

  it('a second of lava adds the same share of damage taken (5% of the max life)', () => {
    const w = newWorld(['p0'], { p0: noSpells() });
    w.wizards[0].pos = v(w.arenaR + 1, 0);
    w.wizards[0].invulnUntil = 0;
    for (let i = 0; i < 60; i++) stepWorld(w, []);
    expect(w.wizards[0].dmgTaken / HP_MAX).toBeCloseTo(0.05, 6);
  });
});
