import { describe, expect, it } from 'vitest';
import { SCRIPTS, demoStep, demoWorld, type DemoId } from '../src/client/demo.ts';
import { ACTIVE_ITEMS } from '../src/shared/items.ts';
import { SPELLS, SPELL_IDS, type SpellId } from '../src/shared/spells.ts';
import type { SimEvent } from '../src/shared/sim.ts';

// roda o roteiro inteiro e junta os eventos
function run(id: DemoId): SimEvent[] {
  const s = demoWorld(id);
  const all: SimEvent[] = [];
  while (s.w.t <= s.script.end) {
    demoStep(s);
    all.push(...s.events);
  }
  return all;
}

describe('grimório: demonstrações com a simulação de verdade', () => {
  it('has a demo for every spell and active item', () => {
    for (const id of [...SPELL_IDS, ...ACTIVE_ITEMS, 'aegis', 'clash'] as DemoId[]) expect(SCRIPTS[id], id).toBeTruthy();
  });

  it('casts the spell of the page, and damage spells hit a training wizard', () => {
    for (const id of SPELL_IDS) {
      const ev = run(id);
      expect(ev.some((e) => e.k === 'cast' && e.id === 'a' && e.spell === id), `${id} não foi lançada`).toBe(true);
      const L = SPELLS[id as SpellId].levels[0];
      if (L.dmg > 0 || L.dot > 0) expect(ev.some((e) => e.k === 'hit' && e.by === 'a' && e.id !== 'a' && e.dmg > 0), `${id} não acertou ninguém`).toBe(true);
    }
  });

  it('shows what the defensive spells and items do', () => {
    expect(run('shield').some((e) => e.k === 'reflect' && e.id === 'a')).toBe(true);
    expect(run('rockpillar').some((e) => e.k === 'pillar')).toBe(true);
    expect(run('teleport').some((e) => e.k === 'teleport' && e.id === 'a')).toBe(true);
    expect(run('alteration').some((e) => e.k === 'teleport' && e.id === 'a')).toBe(true);
    expect(run('warpzone').some((e) => e.k === 'hit' && e.id === 'a')).toBe(false);
    expect(run('grip').some((e) => e.k === 'grip')).toBe(true);
    for (const id of ACTIVE_ITEMS) expect(run(id).some((e) => e.k === 'item' && e.id === 'a' && e.item === id), id).toBe(true);
    expect(run('scourge').some((e) => e.k === 'hit' && e.by === 'a' && e.dmg > 0)).toBe(true);
    expect(run('redirector').some((e) => e.k === 'hit' && e.by === 'a' && e.dmg > 0)).toBe(true);
    expect(run('aegis').some((e) => e.k === 'aegis' && e.id === 'b')).toBe(true);
    expect(run('clash').some((e) => e.k === 'clash' && e.combo === 'fire')).toBe(true);
  });
});
