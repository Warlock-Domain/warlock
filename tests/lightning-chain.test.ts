import { describe, expect, it } from 'vitest';
import { stepWorld, type SimEvent } from '../src/shared/sim.ts';
import { noSpells, spellLevel } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

function shoot(spots: [number, number][], level = 1, configure = (_w: ReturnType<typeof world>) => {}) {
  const w = world(spots, { ...noSpells(), lightning: level }, [], () => .5);
  w.pillars = []; w.runes = [];
  for (const z of w.wizards) z.regen = 0;
  configure(w);
  const events: SimEvent[] = [];
  stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(3, 0) }], () => .5);
  events.push(...w.events);
  for (let i = 0; i < 7; i++) { stepWorld(w, [], () => .5); events.push(...w.events); }
  return { w, hits: events.filter((e): e is Extract<SimEvent, { k: 'hit' }> => e.k === 'hit' && e.src === 'lightning'), events };
}
describe('Raio encadeado sem repetir inimigo', () => {
  it.each([1, 7])('dano e impulso caem pela metade por salto no nível%s, inclusive acima do soft-cap', (level) => {
    const { w, hits, events } = shoot([[0, 0], [2, 0], [2, 1], [3, 1], [3, 2]], level);
    const L = spellLevel('lightning', level);
    expect(hits.map((h) => h.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    for (let i = 0; i < hits.length; i++) {
      expect(hits[i].dmg).toBe(Math.round(L.dmg * .5 ** i)); // número flutuante exibido é arredondado, vida real não.
      expect(1000 - w.wizards[i + 1].hp).toBeCloseTo(L.dmg * .5 ** i);
    }
    const velocities = w.wizards.slice(1).map((z) => Math.hypot(z.vel.x, z.vel.y));
    for (let i = 1; i < velocities.length; i++) expect(velocities[i] / velocities[0]).toBeCloseTo(.5 ** i);
    expect(events.filter((e) => e.k === 'land' && e.src === 'lightning')).toHaveLength(1);
  });
  it('todos os saltos conservam o alcance primário, sem repetir alvos', () => {
    const reach = spellLevel('lightning', 1).range;
    const first = reach * .9;
    const { hits } = shoot([[0, 0], [2, 0], [2, first], [2 + reach * .6, first]]);
    expect(hits.map((h) => h.id)).toEqual(['p1', 'p2', 'p3']);
  });
  it('atinge mais de quatro inimigos, mas nunca volta ao lançador ou repete um alvo', () => {
    const { hits } = shoot([[0, 0], [2, 0], [2, .5], [2.5, .5], [2.5, 1], [3, 1], [3, 1.25]]);
    expect(hits).toHaveLength(6);
    expect(new Set(hits.map((h) => h.id)).size).toBe(6);
    expect(hits.some((h) => h.id === 'p0')).toBe(false);
  });
  it('outro lançamento pode atingir novamente os mesmos inimigos', () => {
    const { w, hits } = shoot([[0, 0], [2, 0], [2, 1]]);
    expect(hits.map((h) => h.id)).toEqual(['p1', 'p2']);
    for (const [i, z] of w.wizards.entries()) { z.pos = [v(0, 0), v(2, 0), v(2, 1)][i]; z.vel = v(0, 0); z.stunLeft = 0; }
    w.wizards[0].cd.lightning = 0;
    const again: SimEvent[] = [];
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'lightning', at: v(3, 0) }], () => .5);
    again.push(...w.events);
    for (let i = 0; i < 7; i++) { stepWorld(w, [], () => .5); again.push(...w.events); }
    expect(again.filter((e): e is Extract<SimEvent, { k: 'hit' }> => e.k === 'hit' && e.src === 'lightning').map((h) => h.id)).toEqual(['p1', 'p2']);
  });
  it('não salta para aliado ou morto e não atravessa obstáculo', () => {
    const { hits } = shoot([[0, 0], [2, 0], [2, 1], [2, 2], [4, 0]], 1, (w) => {
      w.wizards[0].team = w.wizards[2].team = 0;
      w.wizards[3].alive = false;
      w.pillars = [{ kind: 'pillar', pos: v(3, 0), hp: 1000, alive: true }];
    });
    expect(hits.map((h) => h.id)).toEqual(['p1']);
  });
  it('Escudo no salto reflete o valor reduzido e encerra a cadeia', () => {
    const { hits } = shoot([[0, 0], [2, 0], [2, 1], [3, 1]], 1, (w) => { w.wizards[2].shieldUntil = 5; });
    expect(hits.map((h) => h.id)).toEqual(['p1', 'p0']);
    expect(hits[1].dmg).toBeCloseTo(spellLevel('lightning', 1).dmg * .5);
  });
  it('destrói projéteis no caminho dos saltos, sem alterar o dano do acerto', () => {
    const { w, hits } = shoot([[0, 0], [2, 0], [2, 3]], 1, (w) => {
      w.projectiles.push({ id: w.nextId++, kind: 'fireball', owner: 'p2', caster: 'p2', pos: v(2, 1.5), vel: v(0, 0), level: 1, until: 20, target: null, dmgMult: 1 });
    });
    expect(w.projectiles.some((p) => p.kind === 'fireball')).toBe(false);
    expect(hits[1].dmg).toBeCloseTo(spellLevel('lightning', 1).dmg * .5);
  });
});
